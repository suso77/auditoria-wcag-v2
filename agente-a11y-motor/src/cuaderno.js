/**
 * Cuaderno de juicio: los once criterios que el agente NO dictamina.
 *
 * Después de sacar del cajón de «juicio humano» todo lo que se podía medir,
 * quedan once criterios que exigen a una persona mirar y decidir: subtítulos en
 * directo, audiodescripción, secuencia significativa, características
 * sensoriales, imágenes de texto, destellos, propósito de los enlaces en
 * contexto, sugerencias ante errores, prevención de errores, entrada redundante
 * y autenticación accesible.
 *
 * El agente no los dictamina. Pero puede hacer dos cosas que ahorran la mayor
 * parte del trabajo, y ninguna de las dos es opinar:
 *
 *  1. **Decir cuándo NO vienen al caso.** En una página sin vídeo ni audio,
 *     1.2.4 y 1.2.5 no se cumplen ni se incumplen: no aplican, y el IRA tiene
 *     esa casilla. Eso es determinista y se decide solo. En un sitio normal, la
 *     mitad de estos once desaparecen antes de que nadie los mire.
 *
 *  2. **Montar el expediente de los que sí vienen al caso.** Qué elementos hay
 *     que mirar, con su ruta CSS para ir directo; qué se sabe ya de ellos; qué
 *     pregunta concreta hay que responder; y qué contaría como fallo. En un
 *     sitio grande, encontrar los enlaces «Leer más» y su contexto es lo que
 *     cuesta; decidir si el contexto basta lleva diez segundos.
 *
 * Y luego recoge la decisión: veredicto, MOTIVO y quién firma. Sin motivo no se
 * registra. Un IRA que dice «Correcto» sin decir por qué no es una auditoría, es
 * una casilla marcada — y el motivo es justo lo que hay que poder enseñar si
 * alguien pregunta.
 *
 * El agente no rellena el cuaderno por su cuenta: lo deja preparado y firmado
 * por quien decide. Esa es la diferencia entre asistir a un auditor y suplantarlo.
 */
import { WCAG22, enClause, buildPath, accessibleName } from "./engine.js";
import { VERDICTS } from "./verdicts.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = c; });

/** Los once. Si el motor gana una capa que mida alguno, sale de aquí. */
export const CRITERIOS_DE_JUICIO = [
  "1.2.4", "1.2.5", "1.3.2", "1.3.3", "1.4.5", "2.3.1", "2.4.4", "3.3.3", "3.3.4", "3.3.7", "3.3.8"
];

/* ── Utilidades de DOM, deliberadamente pequeñas ──────────────────────────── */

function tag(el) { return el.tagName ? el.tagName.toLowerCase() : ""; }
function oculto(el) {
  let p = el;
  while (p && p.nodeType === 1) {
    if (p.hasAttribute("hidden") || p.hasAttribute("inert")) return true;
    if (p.getAttribute("aria-hidden") === "true") return true;
    const st = (p.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
    if (/display:none|visibility:hidden/.test(st)) return true;
    if (tag(p) === "template") return true;
    p = p.parentElement;
  }
  return false;
}
function visibles(doc, sel) {
  return Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(function (el) { return !oculto(el); });
}
function loc(el) {
  const t = tag(el);
  if (el.id) return t + "#" + el.id;
  const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  if (c) return t + "." + c;
  const ty = el.getAttribute("type");
  return (t === "input" && ty) ? t + "[type=" + ty + "]" : t;
}
function ref(el, detalle) {
  return { locator: loc(el), path: buildPath(el), detalle: detalle || "" };
}
function texto(el) { return String((el && el.textContent) || "").replace(/\s+/g, " ").trim(); }
/* El nombre accesible, con el cálculo del motor y no con uno propio.
 *
 * El de aquí miraba `aria-label`, el `alt` de una imagen dentro, el texto y el
 * `title`, y se dejaba fuera `aria-labelledby`. Eso importa en las dos
 * direcciones: un enlace nombrado por `aria-labelledby` se leía como SIN nombre,
 * y el filtro de nombres vagos de 2.4.4 —que es quien decide si hay algo que
 * mirar— trabajaba sobre un nombre que no es el que oye nadie. El motor ya tiene
 * el cálculo completo; usarlo es además una sola fuente de verdad.
 */
function nombreDe(el) {
  try {
    const doc = el.ownerDocument || null;
    const r = accessibleName(el, doc, "");
    const n = (r && r.name) || "";
    if (n) return String(n).replace(/\s+/g, " ").trim();
  } catch (e) { /* si el cálculo del motor no puede con este nodo, se tira del respaldo */ }
  return (el.getAttribute("aria-label") ||
    (el.querySelector && el.querySelector("img[alt]") ? el.querySelector("img[alt]").getAttribute("alt") : "") ||
    texto(el) || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
}
// Texto visible de la página, para las búsquedas de redacción.
function textoVisible(doc) {
  const cuerpo = doc.querySelector("body") || doc;
  const trozos = [];
  visibles(doc, "p,li,td,th,h1,h2,h3,h4,h5,h6,label,legend,figcaption,dd,dt,summary,caption")
    .forEach(function (el) { const t = texto(el); if (t) trozos.push(t); });
  if (!trozos.length) trozos.push(texto(cuerpo));
  return trozos.join(" \n ");
}

/* ── Señales de aplicabilidad ─────────────────────────────────────────────── */

/* Reproductores embebidos RECONOCIDOS. Si hay un iframe de YouTube, hay medios,
 * aunque el DOM no tenga <video>.
 *
 * La lista incluye las plataformas chinas, y no por exotismo: esto se midió contra
 * un sitio institucional español hecho para el mercado chino, con una página entera
 * de vídeos, y el cuaderno declaró «1.2.5 no aplica: la página no tiene ningún
 * vídeo». Los vídeos estaban ahí, en un reproductor que la lista no conocía.
 */
const DOMINIOS_MEDIA = [
  // Occidentales
  "youtube\\.com", "youtu\\.be", "vimeo\\.com", "dailymotion\\.com", "ivoox\\.com", "spotify\\.com",
  "soundcloud\\.com", "twitch\\.tv", "kaltura\\.com", "brightcove\\.net", "brightcove\\.com",
  "jwplayer\\.com", "jwpcdn\\.com", "wistia\\.(com|net)", "vidyard\\.com", "streamable\\.com",
  "ted\\.com/talks", "facebook\\.com/plugins/video",
  // Chinas: imprescindibles para cualquier sitio dirigido a ese mercado
  "youku\\.com", "bilibili\\.com", "qq\\.com/x?tv", "v\\.qq\\.com", "iqiyi\\.com", "miaopai\\.com",
  "weibo\\.com/tv", "ixigua\\.com", "douyin\\.com", "tudou\\.com", "letv\\.com", "le\\.com/ptv",
  "mgtv\\.com", "sohu\\.com/v", "vzuu\\.com", "xinpianchang\\.com",
  // Tencent Cloud VOD y su TCPlayer. Lo añadió una medición: la página de vídeos de
  // un sitio real no tiene ni un `<video>` ni un iframe —los vídeos son ENLACES a
  // `vod-player.html` en `vod2.myqcloud.com`, que se abren en una caja de luz— y con
  // eso los cuatro criterios de medios salían en blanco en la página que más medios
  // tiene de toda la muestra. Se nombra el reproductor, no todo `myqcloud.com`, que
  // también sirve imágenes y CDN.
  "vod2?\\.myqcloud\\.com", "vod-player", "tcplayer",
  // Otras regiones
  "rutube\\.ru", "vk\\.com/video", "nicovideo\\.jp", "tv\\.naver\\.com", "kakao\\.com", "tv\\.kakao"
];
/* Cada dominio se ancla a una frontera de host.
 *
 * Sin anclar, `le\.com` (LeTV) casa dentro de «goo**gle.com**» y cualquier URL de
 * Google pasaba por reproductor de vídeo reconocido — incluido el iframe de Maps,
 * que entonces hacía aplicar 1.2.4 y 1.2.5 en la página de contacto de cualquier
 * sitio. Es el mismo error que el `\s` colapsado: un patrón que casa dentro de otra
 * palabra. Lo cazó la sonda del propio arreglo, lo que dice bastante de por qué hay
 * que probar cada cosa en vez de darla por buena.
 */
export const EMBEBIDOS = new RegExp(DOMINIOS_MEDIA.map(function (d) { return "(?:^|[/.])" + d; }).join("|"), "i");

/* Y un marco que NO reconocemos puede ser un reproductor igual.
 *
 * Esta era la raíz del fallo, y no la lista: filtrando por lista blanca, «no está en
 * la lista» se interpretaba como «no hay medios», y de ahí salía un `no-aplica` —que
 * es una AFIRMACIÓN, no un hueco— sobre una página llena de vídeos. Para un motor de
 * fallo seguro el reparto correcto es el contrario: lo reconocido se trata como
 * medio, lo desconocido deja el criterio PENDIENTE diciendo qué marco hay que mirar,
 * y solo se declara «no aplica» cuando no hay ni medios propios ni marcos de ninguna
 * clase.
 *
 * Se descartan los marcos que claramente no son medios —mapas, publicidad, analítica,
 * redes de comentarios— porque dejar el criterio pendiente por el iframe de Google
 * Maps de la página de contacto es ruido, no prudencia. */
export const NO_MEDIOS = /maps\.google|google\.com\/maps|openstreetmap|recaptcha|googletagmanager|google-analytics|doubleclick|adservice|disqus|hotjar|intercom|zendesk|facebook\.com\/plugins\/(like|page|comments)|platform\.twitter|about:blank/i;


/* ¿Hay una alternativa en texto cerca del medio?
 *
 * 1.2.1 y 1.2.3 se satisfacen con una transcripción o una alternativa en texto, y eso
 * no vive dentro del `<video>`: es un enlace o un bloque al lado. Lo que se puede
 * medir es si existe algo que se anuncie como tal junto al medio; que ese texto sea
 * una transcripción FIEL lo juzga una persona leyéndolo, y así se dice.
 *
 * El léxico va en los mismos idiomas que el de la ayuda, y por el mismo motivo: con
 * «transcript» y «transcripción» a secas, un sitio chino no tiene ninguna.
 */
const TRANSCRIPCION_RE = /(?:(?:^|\b)(?:transcripci[oó]n|transcrici[oó]n|transcripci[oó]|transcri[çc][aã]o|transcript|texto alternativo|versi[oó]n en texto|audiodescripci[oó]n|audio\s?description|subt[ií]tulos?|subtitles?|captions?)\b)|(?:文字稿|字幕|文稿|音频描述|口述影像)/i;

/** Lo que hay alrededor de un medio: un enlace o un texto que anuncie alternativa. */
export function alternativaCerca(el, doc) {
  let n = el, saltos = 0;
  while (n && n.parentElement && saltos < 3) {
    n = n.parentElement; saltos++;
    const enlaces = Array.prototype.slice.call(n.querySelectorAll("a[href],button"));
    for (let i = 0; i < enlaces.length; i++) {
      const t = (enlaces[i].getAttribute("aria-label") || enlaces[i].textContent || "").replace(/\s+/g, " ").trim();
      if (t && TRANSCRIPCION_RE.test(t)) return { como: "enlace", texto: t.slice(0, 60), locator: loc(enlaces[i]) };
    }
    const txt = (n.textContent || "").replace(/\s+/g, " ").trim();
    if (TRANSCRIPCION_RE.test(txt)) return { como: "texto", texto: txt.slice(0, 60), locator: loc(n) };
  }
  void doc;
  return null;
}

export function medios(doc) {
  const propios = visibles(doc, "video,audio").map(function (el) {
    const pistas = Array.prototype.slice.call(el.querySelectorAll("track")).map(function (t) {
      return (t.getAttribute("kind") || "subtitles").toLowerCase();
    });
    return {
      el: el, tag: tag(el), pistas: pistas,
      subtitulos: pistas.indexOf("captions") !== -1 || pistas.indexOf("subtitles") !== -1,
      descripciones: pistas.indexOf("descriptions") !== -1
    };
  });
  const marcos = visibles(doc, "iframe[src],embed[src],object[data]");
  const fuente = function (el) { return el.getAttribute("src") || el.getAttribute("data") || ""; };
  const externos = marcos.filter(function (el) { return EMBEBIDOS.test(fuente(el)); });
  const dudosos = marcos.filter(function (el) {
    const u = fuente(el);
    if (!u || EMBEBIDOS.test(u) || NO_MEDIOS.test(u)) return false;
    return true;
  });
  return { propios: propios, externos: externos, dudosos: dudosos };
}

/* 1.3.3 · Instrucciones que dependen de la forma, el color o la posición.
 *
 * Se busca en la REDACCIÓN, que es donde vive este criterio. No es adivinar:
 * «pulse el botón verde» o «vea la columna de la derecha» son exactamente los
 * casos que 1.3.3 persigue, y si no aparece ninguna construcción de estas en
 * toda la página, no hay nada que juzgar.
 *
 * Reconoce de menos, no de más: si una página usa una fórmula que no está aquí,
 * el criterio sale «no aplica» habiendo material. Por eso la ficha dice siempre
 * que solo se ha mirado el texto, y el «no aplica» de 1.3.3 lo deja escrito. */
const SENSORIALES = [
  { re: /\b(el|la|los|las)\s+(bot[oó]n|enlace|icono|cuadro|recuadro|men[uú]|campo|casilla|pesta[ñn]a|secci[oó]n|columna|fila|caja)\s+(verde|roja?|azul|amarill[oa]|naranja|gris|negr[oa]|blanc[oa]|morad[oa]|violeta|rosa)\b/gi, que: "color" },
  { re: /\b(el|la)\s+(bot[oó]n|icono|forma|figura)\s+(redond[oa]|cuadrad[oa]|triangular|con forma de)\b/gi, que: "forma" },
  { re: /\b(a la (derecha|izquierda)|arriba a la (derecha|izquierda)|abajo a la (derecha|izquierda)|m[aá]s (arriba|abajo)|en la parte (superior|inferior)|(columna|men[uú]|barra) de la (derecha|izquierda)|el de (arriba|abajo)|el primero de la (derecha|izquierda))\b/gi, que: "posición" },
  { re: /\b(pulse|pulsa|haga clic en|haz clic en|seleccione|selecciona|vea|ve a)\s+(el|la)\s+\w+\s+de\s+(la derecha|la izquierda|arriba|abajo)\b/gi, que: "posición" }
];

/* 2.4.4 · Enlaces cuyo nombre no dice a dónde van.
 *
 * Son los únicos que necesitan que alguien mire el contexto; un enlace que se
 * llama «Solicitud de subvención 2026» ya se explica solo. Lo caro en un sitio
 * grande es encontrarlos y traerse el párrafo de alrededor: eso lo hace esto. */
const NOMBRES_VACIOS = /^(m[aá]s|leer m[aá]s|ver m[aá]s|m[aá]s informaci[oó]n|m[aá]s info|info|aqu[ií]|pulse aqu[ií]|pulsa aqu[ií]|haga clic aqu[ií]|haz clic aqu[ií]|clic aqu[ií]|ver|ver ficha|ver detalle|detalles|continuar|seguir leyendo|contin[uú]a|ir|ir a|acceder|entrar|abrir|descargar|enlace|link|\+|>|»|\.\.\.|…)$/i;

function contextoDe(a) {
  // El contexto que un lector puede alcanzar: el párrafo, el ítem de lista o la
  // celda que contiene el enlace, y en su defecto el encabezado anterior.
  let p = a.parentElement;
  while (p && p.nodeType === 1) {
    const t = tag(p);
    if (t === "p" || t === "li" || t === "td" || t === "th" || t === "dd" || t === "figcaption") {
      const s = texto(p);
      if (s && s.length > texto(a).length) return { donde: "<" + t + ">", texto: s.slice(0, 200) };
    }
    if (t === "body") break;
    p = p.parentElement;
  }
  // El encabezado anterior vale como contexto, pero solo si está CERCA. Un <h1>
  // a doce hermanos de distancia no es el contexto del enlace: darlo por bueno
  // sería inventarle un contexto que nadie va a asociar con él.
  let h = a.previousElementSibling, saltos = 0;
  while (h && saltos++ < 6) {
    if (/^h[1-6]$/.test(tag(h))) return { donde: "<" + tag(h) + "> anterior", texto: texto(h).slice(0, 200) };
    h = h.previousElementSibling;
  }
  return null;
}

/* 3.3.7 · Entrada redundante: el mismo dato pedido dos veces.
 *
 * Se agrupa por propósito declarado (`autocomplete`), y si no lo hay, por
 * `name` y por etiqueta normalizada. WCAG 2.2 exceptúa expresamente la
 * confirmación (repetir la contraseña o el correo para verificarlos), así que
 * esos grupos se marcan como probable excepción en vez de callarlos. */
function etiquetaDe(el, doc) {
  const id = el.getAttribute("id");
  if (id) {
    const lab = doc.querySelector('label[for="' + String(id).replace(/"/g, '\\"') + '"]');
    if (lab) return texto(lab);
  }
  let p = el.parentElement;
  while (p && p.nodeType === 1 && tag(p) !== "body") {
    if (tag(p) === "label") return texto(p);
    p = p.parentElement;
  }
  return (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim();
}
const CONFIRMACION = /(confirm|repet|repit|verific|otra vez|de nuevo|nuevamente)/i;
/* Normaliza la etiqueta QUITANDO las palabras de confirmación.
 *
 * Sin esto, «Correo» y «Confirmar correo» caen en grupos distintos y el par más
 * típico del criterio —el campo y su confirmación— sale «no aplica». Y no es que
 * ese par falle: la norma lo exceptúa expresamente. Pero decirle al auditor
 * «aquí no hay nada» cuando hay un dato pedido dos veces es peor que enseñárselo
 * marcado como probable excepción; lo primero le oculta el caso, lo segundo le
 * ahorra buscarlo y le deja decidir. */
function normEtq(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\b(confirmar?|confirmacion|repetir|repita|repite|verificar|verificacion|de nuevo|otra vez|nuevamente|el|la|su|tu)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/* 3.3.4 · Acciones con consecuencias. Un formulario que compra, contrata,
 * borra o envía una solicitud legal es el ámbito del criterio; uno que filtra
 * una tabla, no. Se mira el método, la acción y las palabras de los botones. */
const COMPROMETEDORAS = /\b(comprar|compra|pagar|pago|pedido|contratar|contrataci[oó]n|suscribir|suscripci[oó]n|donar|donaci[oó]n|transferir|transferencia|eliminar|borrar|dar de baja|cancelar|anular|firmar|firma|aceptar (y|las) |enviar solicitud|presentar solicitud|tramitar|solicitar|matricular|reservar|confirmar (pedido|reserva|compra))\b/i;

/* 3.3.8 · Autenticación accesible. Parte del criterio SÍ es observable: que el
 * gestor de contraseñas pueda rellenar el campo es una de las excepciones que la
 * norma acepta, y bloquear el pegado o exigir un test cognitivo (un captcha de
 * los de transcribir) es justo lo que prohíbe. */
const CAPTCHA = /captcha|recaptcha|hcaptcha|turnstile/i;
/** Sin tildes y en minúsculas, para comparar nombres de campo («código», «verificación»). */
function sinTildesC(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
/** Señas de un campo donde se escribe una consulta. */
const SENAS_BUSQUEDA = /(^|[^a-z0-9])(q|s|buscar|busqueda|buscador|search|query|keyword|keywords|termino|term|texto|palabra)([^a-z0-9]|$)/;
/**
 * ¿Este formulario es un BUSCADOR?
 *
 * Se usa para excluir de 3.3.4 lo único que se puede reconocer con certeza como
 * inofensivo: una búsqueda. La definición es deliberadamente estrecha —`role=
 * search`, o un único campo de datos que se llama como una consulta—, porque
 * aquí un falso «es un buscador» cierra el criterio de los compromisos legales
 * y económicos sobre un formulario que no lo es.
 */
function esBuscador(f, doc) {
  if ((f.getAttribute("role") || "").toLowerCase() === "search") return true;
  const campos = Array.prototype.slice.call(f.querySelectorAll("input,select,textarea")).filter(function (el) {
    const t = (el.getAttribute("type") || "").toLowerCase();
    return t !== "hidden" && t !== "submit" && t !== "button" && t !== "reset" && t !== "image";
  });
  if (campos.length !== 1) return false;               // un buscador pide UNA cosa
  const el = campos[0];
  if ((el.getAttribute("type") || "").toLowerCase() === "search") return true;
  if (tag(el) !== "input") return false;
  const senas = sinTildesC((el.getAttribute("name") || "") + " " + (el.getAttribute("id") || "") + " " +
    (el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || "") + " " +
    (etiquetaDe(el, doc) || ""));
  return SENAS_BUSQUEDA.test(senas);
}

/* ── Las once fichas ──────────────────────────────────────────────────────── */

function ficha(n, extra) {
  const c = IX[n] || { n: n, t: n, lvl: "A" };
  return Object.assign({
    criterio: n, nombre: c.t, nivel: c.lvl, en: enClause(n) || null,
    aplica: true, veredicto: null, pregunta: "", queMirar: [], loQueYaSabemos: [], comoDecidir: [],
    // Material en bruto que la ficha usó para decidir. No es para leerlo: es
    // para que el cuaderno de la MUESTRA pueda cruzar páginas (ver
    // `cuadernoDeMuestra`), que es donde viven de verdad 3.3.7 y 3.3.4.
    datos: {},
    decision: null
  }, extra || {});
}
/* Lo que está OCULTO no es lo que no existe.
 *
 * Las fichas deciden con `visibles()`, que descarta todo lo que lleve `hidden`,
 * `inert`, `aria-hidden="true"` o `display:none` en línea. Con eso, el patrón más
 * común de la web —el reproductor en una caja de luz, el formulario de acceso en un
 * modal, el menú plegado— se leía como «no existe», y la ficha emitía `no-aplica`
 * con una frase FALSA sobre el DOM que acababa de recorrer.
 *
 * Comprobado con un control A/B: el MISMO formulario de acceso con contraseña y
 * captcha da veredicto pendiente si está visible y `no-aplica` metido en un
 * `display:none`; el MISMO vídeo, igual con 1.2.4 y 1.2.5. Y el daño es doble,
 * porque `aplicaCuaderno` sustituye el `humano` conservador del motor por este
 * `no-aplica`: el criterio pasa de «pendiente de persona» a «fuera de alcance».
 *
 * Así que antes de firmar «no viene al caso» se mira si hay candidatos OCULTOS de la
 * familia que le toca a cada criterio. Si los hay, no se puede afirmar que no haya
 * nada: el criterio queda a revisar, nombrando lo que está escondido.
 *
 * Con una condición, que se descubrió probándolo: el censo solo entra cuando NO
 * hay candidatos VISIBLES. Hay fichas que firman `no-aplica` con elementos de la
 * familia a la vista, y por una razón que no tiene nada que ver con que falte
 * algo: 3.3.7 (entrada redundante) no aplica a un formulario de un solo campo
 * por más campos que haya, visibles u ocultos. Si el censo entrara también ahí,
 * el mismo formulario de un campo pasaría de «no aplica» a «revisar» solo por
 * estar dentro de un modal, que es cambiar un veredicto correcto por una duda
 * inventada. El censo responde a una sola pregunta —«¿de verdad no hay nada de
 * esto en la página?»— y solo se le pregunta cuando esa es la afirmación. */
const FAMILIA_OCULTA = {
  "1.2.4": "video,audio,iframe[src],embed[src],object[data]",
  "1.2.5": "video,iframe[src],embed[src],object[data]",
  "1.3.2": "h1,h2,h3,h4,h5,h6,[role=heading],main,nav,aside,header,footer,section,article,form,table",
  "1.4.5": "img,svg,picture",
  "2.3.1": "video,canvas,img,[style*=animation]",
  "2.4.4": "a[href]",
  "3.3.3": "input,select,textarea",
  "3.3.4": "form,input,select,textarea,button",
  "3.3.7": "input,select,textarea",
  "3.3.8": "input[type=password],iframe[src*=captcha],[class*=captcha],[id*=captcha]"
};
function noAplica(n, porque, datos, doc) {
  const sel = FAMILIA_OCULTA[n];
  if (doc && sel) {
    let ocultos = [], hayVisibles = false;
    try {
      const todos = Array.prototype.slice.call(doc.querySelectorAll(sel));
      ocultos = todos.filter(function (el) { return oculto(el); });
      hayVisibles = todos.length > ocultos.length;
    } catch (e) { ocultos = []; hayVisibles = false; }
    if (ocultos.length && !hayVisibles) {
      return ficha(n, {
        aplica: true, veredicto: "revisar",
        pregunta: "¿Este contenido llega a verse? Si se muestra al pulsar algo —una caja de luz, un modal, un menú plegado— el criterio SÍ aplica y hay que juzgarlo con el contenido a la vista.",
        queMirar: ocultos.slice(0, 8).map(function (el) { return ref(el, "oculto ahora mismo (" + tag(el) + "): compruébalo con el contenido desplegado"); }),
        loQueYaSabemos: [
          "No hay candidatos VISIBLES, pero sí " + ocultos.length + " oculto(s) de la misma familia, así que NO se puede afirmar que el criterio no venga al caso.",
          porque + " — pero eso solo vale para lo que se ve: " + ocultos.slice(0, 4).map(function (el) { return loc(el); }).join(", ") +
          (ocultos.length > 4 ? " y " + (ocultos.length - 4) + " más" : "") + " están en el DOM y ocultos.",
          "Si de verdad no se muestran nunca, el criterio no aplica y lo puedes firmar así; si se despliegan, vuelve a mirarlo con ellos a la vista."
        ],
        comoDecidir: ["Despliega lo que esté plegado y vuelve a auditar la página en ese estado."],
        datos: Object.assign({ ocultos: ocultos.length }, datos || {})
      });
    }
  }
  return ficha(n, { aplica: false, veredicto: "no-aplica", pregunta: "", comoDecidir: [], loQueYaSabemos: [porque], datos: datos || {} });
}

const refMarcoDudoso = function (el) {
  return ref(el, "marco que NO se ha podido identificar (" +
    (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 80) +
    "): ábrelo y mira si es un reproductor");
};

const FICHAS = {
  "1.2.4": function (doc, ctx) {
    const m = ctx.medios;
    const dudosos = m.dudosos || [];
    /* «No aplica» solo si no hay NADA que pueda ser un medio: ni propios, ni
     * reconocidos, ni marcos sin identificar. Un marco desconocido puede ser un
     * reproductor, y declarar que el criterio no viene al caso sin haberlo abierto es
     * afirmar lo que no se sabe. */
    if (!m.propios.length && !m.externos.length && !dudosos.length) {
      return noAplica("1.2.4", "La página no tiene ningún <video>, <audio> ni marco embebido de ninguna clase: no hay contenido en directo que subtitular.", null, doc);
    }
    return ficha("1.2.4", {
      pregunta: "¿Alguno de estos medios es una emisión EN DIRECTO? Si lo es, ¿lleva subtítulos en directo?",
      queMirar: m.propios.map(function (x) { return ref(x.el, "<" + x.tag + ">, pistas: " + (x.pistas.join(", ") || "ninguna")); })
        .concat(m.externos.map(function (el) { return ref(el, "reproductor embebido: " + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 80)); }))
        .concat(dudosos.map(refMarcoDudoso)),
      loQueYaSabemos: [
        "Si es DIRECTO o grabado no se puede saber desde el marcado: un <video> y una emisión se escriben igual.",
        m.propios.filter(function (x) { return x.subtitulos; }).length + " de " + m.propios.length + " medio(s) propio(s) declaran pista de subtítulos."
      ].concat(dudosos.length ? [dudosos.length + " marco(s) de la página no se han podido identificar: si alguno es un reproductor, este criterio aplica."] : []),
      comoDecidir: [
        "Si ninguno es en directo → no aplica.",
        "Si alguno lo es y no lleva subtítulos sincronizados → falla.",
        "Si los lleva, comprueba que son subtítulos de verdad y no una transcripción posterior."
      ]
    });
  },

  "1.2.5": function (doc, ctx) {
    const videos = ctx.medios.propios.filter(function (x) { return x.tag === "video"; });
    const dudosos5 = ctx.medios.dudosos || [];
    if (!videos.length && !ctx.medios.externos.length && !dudosos5.length) {
      return noAplica("1.2.5", "La página no tiene ningún vídeo ni marco embebido de ninguna clase: no hay nada que audiodescribir.", null, doc);
    }
    const sinDesc = videos.filter(function (x) { return !x.descripciones; });
    return ficha("1.2.5", {
      pregunta: "¿La información que estos vídeos transmiten SOLO por la imagen está también en el audio o en una audiodescripción?",
      queMirar: videos.map(function (x) { return ref(x.el, x.descripciones ? "declara <track kind=\"descriptions\">" : "sin pista de descripciones"); })
        .concat(ctx.medios.externos.map(function (el) {
          return ref(el, "reproductor embebido (" + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 80) + "): hay que abrirlo para saberlo");
        }))
        .concat(dudosos5.map(refMarcoDudoso)),
      loQueYaSabemos: [
        sinDesc.length + " de " + videos.length + " vídeo(s) propio(s) no declaran pista de audiodescripción.",
        "Que no la declaren no basta para fallar: la audiodescripción puede estar integrada en el propio audio, y eso solo se sabe viéndolo."
      ],
      comoDecidir: [
        "Si el vídeo no transmite nada visualmente que no se oiga (una charla, por ejemplo) → cumple.",
        "Si hay información solo visual sin describir → falla.",
        "Si la descripción está integrada en el audio original, dilo en el motivo: no se ve en el marcado."
      ]
    });
  },

  "1.3.2": function (doc, ctx) {
    // Este se aplica siempre que haya contenido, y no hay atajo honesto: solo
    // comparando el orden del DOM con el orden visual se sabe. Lo que el agente
    // aporta es el orden del DOM ya extraído.
    /* La lista de bloques se quedaba en encabezados, regiones, formularios y
     * tablas, y con eso una página de `<div>` y `<p>` —que son legión— salía
     * «no aplica · no tiene bloques de contenido cuyo orden pueda importar».
     * Medido con tres párrafos en orden de lectura: no-aplica. Y 1.3.2 va
     * exactamente de eso: tres párrafos reordenados con `order` o `flex-
     * direction: row-reverse` se leen en un orden y se ven en otro. El criterio
     * aplica a cualquier contenido cuya secuencia signifique algo, no solo al
     * que viene en una etiqueta de sección. */
    const bloques = visibles(doc, "h1,h2,h3,h4,h5,h6,main,nav,aside,section,article,footer,header," +
      "form,table,p,ul,ol,dl,blockquote,figure,pre,li").slice(0, 25);
    if (bloques.length < 2) {
      return noAplica("1.3.2",
        bloques.length
          ? "La página tiene un solo bloque de contenido: no hay secuencia que se pueda alterar."
          : "La página no tiene ningún bloque de contenido visible cuyo orden pueda importar.",
        null, doc);
    }
    return ficha("1.3.2", {
      pregunta: "Leyendo la página en el orden del código (el de abajo), ¿se entiende lo mismo que viéndola?",
      queMirar: bloques.map(function (el, i) {
        return ref(el, (i + 1) + ". <" + tag(el) + "> " + (texto(el).slice(0, 60) || "(sin texto propio)"));
      }),
      loQueYaSabemos: [
        "Este es el orden del DOM, que es el que reciben el lector de pantalla y la tabulación.",
        "El agente SÍ ve el orden visual cuando el CSS declara una reordenación —`order`, `flex-direction: *-reverse`, `flex-wrap: wrap-reverse` o colocación explícita en la rejilla— y la medición sobre el navegador la confirma: en ese caso lo dice en un hallazgo aparte, con el orden leído y el orden visto. Lo que NO se mide es la reordenación que no se declara: un `float`, un `position: absolute` o dos columnas pueden separar lo que se ve de lo que se lee sin que ninguna propiedad lo anuncie.",
        "Una forma rápida de contrastarlo: desactiva las hojas de estilo y lee."
      ],
      comoDecidir: [
        "Si el orden del código cuenta la misma historia que el visual → cumple.",
        "Si algo depende del orden y el código lo cambia (un pie antes que su tabla, una columna lateral en medio de un artículo) → falla."
      ]
    });
  },

  "1.3.3": function (doc, ctx) {
    const t = ctx.texto;
    const hallazgos = [];
    SENSORIALES.forEach(function (s) {
      s.re.lastIndex = 0;
      let m;
      while ((m = s.re.exec(t)) && hallazgos.length < 20) {
        hallazgos.push({ que: s.que, frase: m[0].replace(/\s+/g, " ").trim() });
      }
    });
    if (!hallazgos.length) {
      return noAplica("1.3.3",
        "No se ha encontrado ninguna instrucción que apele a la forma, el color o la posición en el texto visible de la página. " +
        "Ojo: solo se ha mirado el TEXTO. Una instrucción dada en una imagen o en un vídeo no se ve desde aquí.");
    }
    const vistos = {};
    const unicos = hallazgos.filter(function (h) { const k = h.que + "|" + h.frase.toLowerCase(); if (vistos[k]) return false; vistos[k] = 1; return true; });
    return ficha("1.3.3", {
      pregunta: "Estas frases dan una instrucción apelando a la forma, el color o la posición. ¿Se entienden sin ver la pantalla?",
      queMirar: unicos.map(function (h) { return { locator: "(texto)", path: "", detalle: "[" + h.que + "] «" + h.frase + "»" }; }),
      loQueYaSabemos: [
        unicos.length + " construcción/es encontradas en el texto visible.",
        "Encontrarlas no es fallar: «el botón verde Guardar» está bien, porque además del color dice el nombre. Falla cuando el color, la forma o la posición son el ÚNICO dato."
      ],
      comoDecidir: [
        "Si la frase da también el nombre, la etiqueta o el texto del elemento → cumple.",
        "Si sin ver la pantalla no se sabe a qué se refiere → falla.",
        "Mira también las instrucciones que estén dentro de imágenes: el agente no las lee."
      ]
    });
  },

  "1.4.5": function (doc, ctx) {
    const imgs = visibles(doc, "img,svg,picture").filter(function (el) { return tag(el) !== "img" || el.getAttribute("alt") !== ""; });
    if (!imgs.length) {
      /* Pero una imagen no es solo un `<img>`.
       *
       * El hero con el titular incrustado —que es EL caso de 1.4.5— casi nunca
       * es una etiqueta: es un `background-image` en CSS. Sin esta comprobación,
       * una página cuya única imagen es de fondo firmaba «no aplica · la página
       * no tiene imágenes visibles con contenido», y «no aplica» cierra el
       * criterio en el IRA. El agente no puede leer lo que hay dentro de esa
       * imagen, así que no dictamina: lo deja pendiente diciendo qué vio. */
      const conFondo = /background(-image)?\s*:[^;}]*url\(/i.test(ctx.estilos || "");
      if (conFondo) {
        return ficha("1.4.5", {
          pregunta: "¿Alguna de las imágenes de fondo lleva texto incrustado?",
          queMirar: [{ locator: "(CSS)", path: "", detalle: "las hojas de estilo declaran imágenes de fondo (`background-image: url(…)`)" }],
          loQueYaSabemos: [
            "La página no tiene ninguna etiqueta `<img>`, `<svg>` ni `<picture>` con contenido, pero sí imágenes de fondo declaradas en CSS.",
            "El hero con el titular incrustado —que es el caso típico de 1.4.5— casi siempre es una imagen de fondo, y el agente no puede leer lo que hay dentro de ella."
          ],
          comoDecidir: [
            "Mira las imágenes de fondo en el navegador: si alguna lleva texto que no esté también como texto real → falla (salvo logotipo o texto esencialmente gráfico).",
            "Amplía al 200 %: el texto incrustado se pixela, y es la forma más rápida de verlo."
          ],
          datos: { fondosCss: true }
        });
      }
      return noAplica("1.4.5", "La página no tiene imágenes visibles con contenido (las decorativas con alt vacío quedan fuera) ni imágenes de fondo declaradas en el CSS que se ha podido leer.", null, doc);
    }
    // Candidatas: alt con pinta de frase, o nombre de archivo que suena a texto.
    const SOSPECHOSO = /(banner|cartel|titular|slogan|lema|texto|frase|cita|promo|oferta|infograf)/i;
    const cand = imgs.filter(function (el) {
      const alt = (el.getAttribute("alt") || el.getAttribute("aria-label") || "").trim();
      const src = el.getAttribute("src") || "";
      return alt.split(/\s+/).filter(Boolean).length >= 4 || SOSPECHOSO.test(src) || SOSPECHOSO.test(alt);
    });
    const esLogo = function (el) { return /logo|marca|isotipo|imagotipo/i.test((el.getAttribute("src") || "") + " " + (el.getAttribute("alt") || "")); };
    return ficha("1.4.5", {
      pregunta: "¿Alguna de estas imágenes es, en realidad, TEXTO convertido en imagen?",
      queMirar: (cand.length ? cand : imgs).slice(0, 25).map(function (el) {
        return ref(el, "<" + tag(el) + "> alt=«" + (el.getAttribute("alt") || "").slice(0, 60) + "»" + (esLogo(el) ? " · parece un logotipo (excepción del criterio)" : ""));
      }),
      loQueYaSabemos: [
        imgs.length + " imagen/es con contenido; " + cand.length + " con indicios de llevar texto (alt largo o nombre revelador).",
        "El agente no lee lo que hay DENTRO de la imagen: no hay OCR, y decir que lo hay sería mentir. Los indicios son el alt y el nombre del archivo.",
        "Los logotipos son una excepción expresa del criterio, igual que el texto que forma parte esencial de una imagen (una captura de pantalla, por ejemplo)."
      ],
      comoDecidir: [
        "Si la imagen presenta texto que podría haberse escrito con HTML y CSS → falla.",
        "Si es un logotipo, una captura o texto esencialmente gráfico → cumple.",
        "Amplía al 200 %: el texto en imagen se pixela, y es la forma más rápida de verlo."
      ]
    });
  },

  "2.3.1": function (doc, ctx) {
    const candidatos = visibles(doc, "video,canvas,object,embed")
      .concat(visibles(doc, "img").filter(function (el) { return /\.gif(\?|$)/i.test(el.getAttribute("src") || ""); }))
      .concat(ctx.medios.externos);
    const conAnimacion = /@keyframes|animation\s*:/i.test(ctx.estilos);
    if (!candidatos.length && !conAnimacion) {
      /* Y no se firma «no aplica» si el CSS no se ha leído del todo. */
      if (ctx.cssBloqueadas || ctx.cssLeido === false) {
        return ficha("2.3.1", {
          aplica: true, veredicto: "revisar",
          pregunta: "¿Hay algo que destelle más de tres veces por segundo?",
          loQueYaSabemos: [
            "En el marcado no hay vídeo, canvas, GIF ni animación declarada — pero " +
            (ctx.cssLeido === false ? "NO se ha podido leer ninguna hoja de estilo" : ctx.cssBloqueadas + " hoja(s) de estilo de otro origen no se han podido leer") +
            ", así que una animación declarada ahí no se habría visto.",
            "2.3.1 es el criterio cuyo incumplimiento puede provocar una crisis epiléptica: no se firma «no aplica» sobre un CSS que nadie ha leído."
          ],
          comoDecidir: ["Abre el inspector, busca `@keyframes` y `animation:` en las hojas externas, y mira la página unos segundos."],
          datos: { cssBloqueadas: ctx.cssBloqueadas || 0, cssLeido: ctx.cssLeido !== false }
        });
      }
      return noAplica("2.3.1", "La página no tiene vídeo, canvas, GIF ni animaciones CSS declaradas: no hay nada que pueda destellar.", null, doc);
    }
    const unicos = [];
    const vistos = {};
    candidatos.forEach(function (el) { const k = buildPath(el); if (!vistos[k]) { vistos[k] = 1; unicos.push(el); } });
    return ficha("2.3.1", {
      pregunta: "¿Algo de esto destella más de tres veces por segundo?",
      queMirar: unicos.slice(0, 25).map(function (el) { return ref(el, "<" + tag(el) + "> " + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 70)); })
        .concat(conAnimacion ? [{ locator: "(CSS)", path: "", detalle: "la hoja de estilos declara animaciones: revísalas también" }] : []),
      loQueYaSabemos: [
        "El agente ve QUÉ puede destellar, no si destella: eso son fotogramas, y hay que verlos.",
        "El umbral de la norma son tres destellos por segundo, más el umbral de rojo saturado."
      ],
      comoDecidir: [
        "Si nada destella, o lo hace tres veces por segundo o menos → cumple.",
        "Si algo supera el umbral → falla, y es de las barreras más graves: puede provocar una crisis.",
        "Para medirlo de verdad, el PEAT (Photosensitive Epilepsy Analysis Tool) es la herramienta al uso."
      ]
    });
  },

  "2.4.4": function (doc, ctx) {
    const enlaces = visibles(doc, "a[href]");
    if (!enlaces.length) {
      return noAplica("2.4.4", "La página no tiene enlaces visibles.", null, doc);
    }
    /* SIN NOMBRE no es lo mismo que nombre vago, y era un agujero.
     *
     * `NOMBRES_VACIOS` está anclada entre `^` y `$` y no tiene alternativa vacía,
     * así que un enlace sin nombre accesible —un icono sin `alt`, un `<svg>` sin
     * título, un `<a href>` sin contenido— NO casaba, se contaba como «tiene
     * nombre propio» y la ficha firmaba `cumple-parcial` con esta frase:
     * «Ninguno de los 6 enlaces visibles se llama "Leer más"… todos tienen
     * nombre propio». Medido sobre una página con cinco de seis enlaces sin
     * nombre: eso es una afirmación FALSA en la evidencia, con un veredicto casi
     * conforme y `queMirar` vacío, es decir, diciéndole a quien audita que no hay
     * nada que mirar en el criterio que más barreras masivas produce.
     *
     * Un nombre que no existe no puede describir el destino, así que esos
     * enlaces van al expediente antes que los vagos. El `falla` lo firma una
     * persona —el cuaderno no dictamina— y el motor ya los acusa por su cuenta
     * en 4.1.2 y 1.1.1. */
    const sinNombre = enlaces.filter(function (a) { return !nombreDe(a); });
    const vagos = enlaces.filter(function (a) { const n = nombreDe(a); return n && NOMBRES_VACIOS.test(n); });
    if (!vagos.length && !sinNombre.length) {
      return ficha("2.4.4", {
        veredicto: "cumple-parcial",
        pregunta: "¿El nombre de cada enlace dice a dónde lleva?",
        queMirar: [],
        loQueYaSabemos: [
          "Los " + enlaces.length + " enlaces visibles tienen nombre accesible, y ninguno se llama «Leer más», «Aquí», «Ver» ni nada equivalente.",
          "Eso es lo comprobable. Que el nombre describa BIEN el destino sigue siendo juicio, pero sin nombres vacíos no hay que ir a buscar el contexto de ninguno."
        ],
        comoDecidir: ["Repasa por encima que los nombres correspondan a sus destinos; si alguno no, decídelo aquí."]
      });
    }
    if (sinNombre.length) {
      return ficha("2.4.4", {
        pregunta: sinNombre.length + " de los " + enlaces.length + " enlaces visibles no tienen NINGÚN nombre accesible" +
          (vagos.length ? ", y otros " + vagos.length + " lo tienen vago" : "") + ". ¿Confirmas la barrera?",
        queMirar: sinNombre.slice(0, 30).map(function (a) {
          return ref(a, "(sin nombre) → " + (a.getAttribute("href") || "").slice(0, 60));
        }).concat(vagos.slice(0, 30).map(function (a) {
          return ref(a, "«" + nombreDe(a).slice(0, 40) + "» → " + (a.getAttribute("href") || "").slice(0, 60));
        })),
        loQueYaSabemos: [
          "Un nombre que no existe no puede describir el destino: un lector de pantalla anuncia solo «enlace», o la URL.",
          "El motor acusa estos mismos enlaces por su cuenta en 4.1.2 (nombre y rol) y, cuando el contenido es una imagen, en 1.1.1.",
          "Aquí se recoge para 2.4.4 porque el criterio es el propósito del enlace, y sin nombre no hay propósito que leer."
        ],
        comoDecidir: [
          "Comprueba en el navegador que el nombre falta de verdad (puede venir por `aria-labelledby` a un id que el marcado estático no resuelva) → si falta, falla.",
          "Si algún enlace lo nombra una imagen con `alt` puesto por JS, dilo en el motivo: el informe tiene que decir de dónde sale el nombre."
        ]
      });
    }
    return ficha("2.4.4", {
      pregunta: "Estos enlaces no dicen a dónde van por su nombre. ¿Basta el contexto que los rodea?",
      queMirar: vagos.slice(0, 30).map(function (a) {
        const ctxA = contextoDe(a);
        return ref(a, "«" + nombreDe(a).slice(0, 40) + "» → " + (a.getAttribute("href") || "").slice(0, 60) +
          (ctxA ? " · contexto (" + ctxA.donde + "): «" + ctxA.texto + "»" : " · SIN contexto alrededor"));
      }),
      loQueYaSabemos: [
        vagos.length + " de " + enlaces.length + " enlaces tienen nombre genérico.",
        "Al lado de cada uno va el párrafo, el ítem o la celda que lo contiene: es el contexto que un lector de pantalla puede alcanzar.",
        "Los que salen «SIN contexto alrededor» son los más probables de fallar: no hay de dónde deducir el destino."
      ],
      comoDecidir: [
        "Si el contexto de programación —el párrafo, el ítem, la celda, el encabezado de la sección— identifica el destino → cumple.",
        "Si hay que ver la página entera para saberlo, o ni así → falla.",
        "Varios «Leer más» seguidos con el mismo contexto son el caso clásico de fallo."
      ]
    });
  },

  "3.3.3": function (doc, ctx) {
    const conRestriccion = visibles(doc, "input,select,textarea").filter(function (el) {
      if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return false;
      return el.hasAttribute("required") || el.hasAttribute("pattern") || el.hasAttribute("min") ||
        el.hasAttribute("max") || el.hasAttribute("minlength") || el.hasAttribute("maxlength") ||
        el.getAttribute("aria-required") === "true" ||
        /^(email|url|tel|number|date|time)$/i.test(el.getAttribute("type") || "");
    });
    if (!conRestriccion.length) {
      return noAplica("3.3.3", "La página no tiene ningún campo con restricciones (obligatorio, patrón, tipo, longitud o rango): no hay error que sugerir cómo corregir.", null, doc);
    }
    return ficha("3.3.3", {
      pregunta: "Cuando uno de estos campos se rellena mal, ¿el mensaje dice CÓMO corregirlo, y no solo que está mal?",
      queMirar: conRestriccion.slice(0, 30).map(function (el) {
        const r = [];
        if (el.hasAttribute("required") || el.getAttribute("aria-required") === "true") r.push("obligatorio");
        if (el.hasAttribute("pattern")) r.push("patrón " + (el.getAttribute("pattern") || "").slice(0, 30));
        if (el.getAttribute("type")) r.push("tipo " + el.getAttribute("type"));
        ["min", "max", "minlength", "maxlength"].forEach(function (a) { if (el.hasAttribute(a)) r.push(a + "=" + el.getAttribute(a)); });
        return ref(el, "«" + (etiquetaDe(el, doc) || "(sin etiqueta)").slice(0, 40) + "» · " + r.join(", "));
      }),
      loQueYaSabemos: [
        conRestriccion.length + " campo(s) con restricciones, que son los que pueden producir un error.",
        "Que el error se anuncie —3.3.1— sí lo comprueba la capa dinámica. Este criterio va del CONTENIDO del mensaje, y eso hay que leerlo.",
        "El mensaje del navegador («Rellena este campo») cumple a duras penas; uno propio que diga el formato esperado cumple con holgura."
      ],
      comoDecidir: [
        "Envía el formulario con datos mal y lee lo que sale.",
        "Si el mensaje dice qué se espera («la fecha va en formato dd/mm/aaaa») → cumple.",
        "Si solo dice «error» o «campo no válido» sin más → falla.",
        "Excepción: si sugerir la corrección pusiera en riesgo la seguridad (un inicio de sesión) → cumple."
      ]
    });
  },

  "3.3.4": function (doc, ctx) {
    const forms = visibles(doc, "form");
    const conPost = forms.filter(function (f) { return /post/i.test(f.getAttribute("method") || ""); });
    const botones = visibles(doc, 'button,input[type=submit],a[href]').filter(function (el) {
      return COMPROMETEDORAS.test(nombreDe(el) || el.getAttribute("value") || "");
    });
    if (!forms.length && !botones.length) {
      return noAplica("3.3.4", "La página no tiene formularios ni acciones con consecuencias legales, económicas o sobre datos del usuario.", null, doc);
    }
    /* ESTE ERA EL PEOR «no aplica» DEL CUADERNO.
     *
     * La exclusión se apoyaba en `method="post"`: lo que no fuera POST ni
     * llevara una palabra comprometedora en un botón se declaraba «de consulta
     * o búsqueda» y el criterio se cerraba. Pero un formulario sin `method`
     * envía por GET por omisión, y un formulario de una aplicación moderna no
     * declara método ninguno: lo envía JavaScript. Medido con
     * `<form id="checkout"><input name="tarjeta"><button>Continuar</button></form>`:
     * «no aplica», es decir, el criterio sobre compromisos legales y económicos
     * cerrado sobre una pantalla de pago. Y el botón decía «Continuar», que no
     * está ni puede estar en la lista de palabras comprometedoras.
     *
     * Se invierte la regla: lo que se excluye es lo que SÍ se puede reconocer
     * —un buscador, que es un campo de texto donde se escribe una consulta—, y
     * todo lo demás queda pendiente de juicio. Excluir por lo reconocible y no
     * por lo no reconocible es la diferencia entre acotar y adivinar. */
    const noBuscadores = forms.filter(function (f) { return !esBuscador(f, doc); });
    if (!noBuscadores.length && !botones.length) {
      return noAplica("3.3.4",
        "Los " + forms.length + " formulario(s) de la página son buscadores (un solo campo de consulta): " +
        "una búsqueda no compromete nada, así que queda fuera del criterio.");
    }
    return ficha("3.3.4", {
      pregunta: "¿Estas acciones son legales, económicas o modifican/borran datos del usuario? Si lo son, ¿se pueden revertir, se comprueban o se confirman?",
      queMirar: noBuscadores.slice(0, 20).map(function (f) {
        const met = (f.getAttribute("method") || "").toLowerCase();
        return ref(f, "<form" + (met ? " method=" + met : " (sin method: GET, o lo envía JavaScript)") +
          " action=" + (f.getAttribute("action") || "(misma página)").slice(0, 50) + ">");
      }).concat(botones.slice(0, 20).map(function (el) { return ref(el, "«" + (nombreDe(el) || el.getAttribute("value") || "").slice(0, 50) + "»"); })),
      loQueYaSabemos: [
        noBuscadores.length + " formulario(s) que no son un buscador (" + conPost.length + " por POST) y " +
          botones.length + " control(es) cuyo texto sugiere una acción con consecuencias.",
        "El método no decide nada: un formulario sin `method` envía por GET, y uno de una aplicación moderna lo envía JavaScript. Por eso se listan todos los que no son una búsqueda.",
        "Que la acción sea realmente legal o económica no se ve en el marcado: se ve usándola o sabiendo de qué va el sitio."
      ],
      comoDecidir: [
        "Si ninguna acción es de las tres clases (legal, económica, o que modifique/borre datos del usuario) → no aplica.",
        "Si lo es, basta UNA de las tres salvaguardas: se puede deshacer, se revisa y corrige antes de enviar, o se pide confirmación explícita.",
        "Si no hay ninguna de las tres → falla."
      ]
    });
  },

  "3.3.7": function (doc, ctx) {
    const campos = visibles(doc, "input,select,textarea").filter(function (el) {
      const t = (el.getAttribute("type") || "").toLowerCase();
      return t !== "hidden" && t !== "submit" && t !== "button" && t !== "reset";
    });
    /* Los grupos se calculan y se GUARDAN siempre —lo decía el comentario de
     * abajo y no se cumplía—, porque el cruce entre páginas de
     * `cuadernoDeMuestra` los necesita para ver el dato que se pide en el paso 1
     * y otra vez en el paso 3.
     *
     * El atajo `campos.length < 2` salía ANTES de calcularlos y sin `datos`, así
     * que un paso con UN solo campo no aportaba nada al cruce. Medido: paso 1
     * con un único «Correo electrónico» y paso 3 con ese mismo correo más un
     * teléfono daban, en el cuaderno de la muestra, **3.3.7 «no aplica · no
     * viene al caso en ninguna de las 2 páginas»** — el criterio cerrado
     * justo sobre el caso para el que existe, un trámite que pide dos veces el
     * mismo dato. Ahora se calculan primero y viajan también en el «no aplica»
     * de página, que solo habla de ESTA página. */
    const grupos = {};
    campos.forEach(function (el) {
      const ac = (el.getAttribute("autocomplete") || "").toLowerCase().trim();
      const nm = (el.getAttribute("name") || "").toLowerCase().trim();
      const etq = normEtq(etiquetaDe(el, doc));
      const clave = (ac && ac !== "off" && ac !== "on") ? "autocomplete:" + ac : (etq ? "etiqueta:" + etq : (nm ? "name:" + nm : null));
      if (!clave) return;
      (grupos[clave] = grupos[clave] || []).push({
        locator: loc(el), path: buildPath(el),
        etiqueta: (etiquetaDe(el, doc) || "").slice(0, 60),
        confirmacion: CONFIRMACION.test(etiquetaDe(el, doc) + " " + (el.getAttribute("name") || "") + " " + (el.getAttribute("id") || ""))
      });
    });
    const datos = { grupos: grupos, campos: campos.length };
    if (campos.length < 2) {
      return noAplica("3.3.7",
        "La página no tiene dos campos que pudieran pedir el mismo dato dentro de ella. " +
        "Lo que pida —" + (Object.keys(grupos).join(", ") || "nada") + "— se cruza con el resto de la muestra, " +
        "porque 3.3.7 habla del proceso entero y un paso de un solo campo también es un paso.",
        datos);
    }
    const repetidos = Object.keys(grupos).filter(function (k) { return grupos[k].length > 1; });
    if (!repetidos.length) {
      return noAplica("3.3.7",
        "Ninguno de los " + campos.length + " campos de la página pide el mismo dato que otro (comparando `autocomplete`, etiqueta y `name`). " +
        "Ojo: 3.3.7 habla del proceso entero, y el agente solo ve ESTA página; si el proceso tiene varios pasos, hay que mirarlo completo.",
        datos);
    }
    return ficha("3.3.7", {
      datos: datos,
      pregunta: "¿Estos campos piden dos veces el mismo dato dentro del mismo proceso, sin rellenarlo solo ni ofrecerlo para elegir?",
      queMirar: repetidos.slice(0, 15).reduce(function (acc, k) {
        const esConfirmacion = grupos[k].some(function (x) { return x.confirmacion; });
        grupos[k].forEach(function (x) {
          acc.push({
            locator: x.locator, path: x.path,
            detalle: "[" + k + "] «" + (x.etiqueta || "(sin etiqueta)") + "»" +
              (esConfirmacion ? " · parece una CONFIRMACIÓN, que la norma exceptúa" : "")
          });
        });
        return acc;
      }, []),
      loQueYaSabemos: [
        repetidos.length + " grupo(s) de campos que parecen pedir el mismo dato.",
        "WCAG 2.2 exceptúa expresamente la confirmación (repetir la contraseña o el correo para verificarlos) y los casos en que volver a pedirlo es esencial.",
        "El agente ve una página. Si el proceso tiene varios pasos, el dato repetido entre paso 1 y paso 3 no se ve desde aquí."
      ],
      comoDecidir: [
        "Si el segundo campo es de confirmación, o volver a pedirlo es esencial → cumple.",
        "Si el dato ya se pidió antes en el mismo proceso y no se rellena solo ni se ofrece para elegir → falla.",
        "Recorre el proceso entero, no solo esta página."
      ]
    });
  },

  "3.3.8": function (doc, ctx) {
    const passwords = visibles(doc, 'input[type=password]');
    const captcha = visibles(doc, "*").filter(function (el) {
      return CAPTCHA.test((el.getAttribute("class") || "") + " " + (el.getAttribute("id") || "") + " " + (el.getAttribute("src") || ""));
    });
    /* `input[type=password]` no es el único campo de autenticación.
     *
     * Un acceso por código de un solo uso —el que llega por correo o por SMS— no
     * lleva contraseña ninguna: lleva un `input` de texto, y 3.3.8 le aplica de
     * lleno, porque el criterio admite el código solo si se puede PEGAR. Igual el
     * campo enmascarado por JS sobre un `type=text`. Sin esto, esas páginas
     * firmaban «no aplica · no hay proceso de autenticación que evaluar» sobre un
     * formulario de acceso, y «no aplica» cierra el criterio en el IRA.
     *
     * Las señales son hechos del marcado, no conjeturas: los valores de
     * `autocomplete` que la especificación reserva para credenciales, y los
     * nombres e identificadores de campo de código. */
    const AUTOCOMPLETE_CRED = /(^|\s)(current-password|new-password|one-time-code)(\s|$)/i;
    const NOMBRE_CODIGO = /(^|[^a-z])(otp|otc|tan|pin|passcode|password|contrasena|contrasenya|clave|codigo|code|verificacion|verification|token|2fa|mfa)([^a-z]|$)/i;
    const otros = visibles(doc, "input,textarea").filter(function (el) {
      if (el.getAttribute("type") === "password") return false;
      if (AUTOCOMPLETE_CRED.test(el.getAttribute("autocomplete") || "")) return true;
      const señas = sinTildesC((el.getAttribute("name") || "") + " " + (el.getAttribute("id") || "") + " " + (el.getAttribute("placeholder") || "") + " " + (el.getAttribute("aria-label") || ""));
      return NOMBRE_CODIGO.test(señas);
    });
    if (!passwords.length && !captcha.length && !otros.length) {
      return noAplica("3.3.8", "La página no tiene ningún campo de contraseña, de código de un solo uso ni captcha: no hay proceso de autenticación que evaluar.", null, doc);
    }
    if (!passwords.length && !captcha.length) {
      return ficha("3.3.8", {
        pregunta: "Esto parece un acceso sin contraseña (código de un solo uso o campo enmascarado). ¿Se puede pegar el código y hay alternativa sin prueba cognitiva?",
        queMirar: otros.slice(0, 15).map(function (el) {
          return ref(el, "<" + tag(el) + "> " + ((el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("placeholder") || "")).slice(0, 50));
        }),
        loQueYaSabemos: [
          "No hay ningún `input[type=password]`, pero sí " + otros.length + " campo(s) con pinta de credencial o de código (por su `autocomplete` o por su nombre).",
          "3.3.8 admite un código de un solo uso SOLO si la persona puede pegarlo: si el campo bloquea el pegado o lo parte en casillas de un carácter, es una prueba cognitiva."
        ],
        comoDecidir: [
          "Prueba a pegar el código con el teclado: si el campo lo rechaza o hay que teclearlo dígito a dígito → falla.",
          "Si el acceso es solo por un tercero (entrar con Google, con Cl@ve), el criterio se evalúa sobre ese proceso: dilo en el motivo."
        ],
        datos: { sinPassword: true, candidatos: otros.length }
      });
    }
    const bloqueaPegado = visibles(doc, "input,textarea").filter(function (el) {
      return /return\s+false|preventDefault/i.test(el.getAttribute("onpaste") || "");
    });
    const sinAutocomplete = passwords.filter(function (el) {
      const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
      return !ac || ac === "off";
    });
    return ficha("3.3.8", {
      pregunta: "Para entrar, ¿hay que recordar o transcribir algo? ¿Se puede pegar la contraseña y rellenarla con el gestor?",
      queMirar: passwords.map(function (el) {
        const ac = el.getAttribute("autocomplete");
        return ref(el, "campo de contraseña · autocomplete=" + (ac || "(ninguno)") + (ac && ac !== "off" ? "" : " ← impide al gestor de contraseñas rellenarlo"));
      }).concat(captcha.slice(0, 5).map(function (el) { return ref(el, "captcha detectado por su clase, id o src"); }))
        .concat(bloqueaPegado.map(function (el) { return ref(el, "el campo bloquea el pegado con onpaste"); })),
      loQueYaSabemos: [
        sinAutocomplete.length + " de " + passwords.length + " campo(s) de contraseña sin `autocomplete` útil.",
        captcha.length ? captcha.length + " elemento(s) con pinta de captcha." : "No se ha detectado ningún captcha por marcado (uno cargado por script no se ve desde aquí).",
        bloqueaPegado.length ? bloqueaPegado.length + " campo(s) bloquean el pegado." : "Ningún campo bloquea el pegado con un `onpaste` en línea.",
        "Permitir al gestor de contraseñas y permitir pegar son dos de las excepciones que la norma acepta; bloquearlas es lo que la incumple."
      ],
      comoDecidir: [
        "Si el gestor de contraseñas puede rellenar y se puede pegar → normalmente cumple.",
        "Si hay que transcribir un código de una imagen, resolver un puzle o recordar algo sin alternativa → falla.",
        "Un captcha de «marca esta casilla» o basado en el dispositivo no es un test cognitivo: eso cumple."
      ]
    });
  }
};

/**
 * Monta el cuaderno para un documento.
 *
 * @param {Document} doc
 * @param {{ url?:string, css?:string }} [opts]  `css` son las hojas de estilo ya
 *   resueltas, si quien llama las tiene (la capa de render sí). Sin ellas, solo
 *   se mira el CSS en línea del documento, y la ficha que dependa de eso lo dice.
 */
export function cuadernoDeJuicio(doc, opts) {
  opts = opts || {};
  if (!doc || !doc.querySelectorAll) throw new Error("cuadernoDeJuicio necesita un Document");
  const estilosEnLinea = Array.prototype.slice.call(doc.querySelectorAll("style"))
    .map(function (s) { return s.textContent || ""; }).join("\n");
  const ctx = {
    medios: medios(doc),
    texto: textoVisible(doc),
    estilos: estilosEnLinea + "\n" + (opts.css || ""),
    /* Cuántas hojas no se pudieron leer, y si se leyó alguna. Una ficha no puede
     * afirmar «no hay nada declarado» sobre un CSS que nadie le pasó. */
    cssBloqueadas: opts.cssBloqueadas || 0,
    cssLeido: opts.cssLeido !== false
  };

  const criterios = CRITERIOS_DE_JUICIO.map(function (n) { return FICHAS[n](doc, ctx); });
  return {
    url: opts.url || null,
    creado: new Date().toISOString(),
    criterios: criterios,
    resumen: resumenDe(criterios)
  };
}

function resumenDe(criterios) {
  const r = { total: criterios.length, noAplican: 0, pendientes: 0, decididos: 0, elementos: 0 };
  criterios.forEach(function (c) {
    if (c.decision) r.decididos++;
    else if (!c.aplica) r.noAplican++;
    else r.pendientes++;
    r.elementos += (c.queMirar || []).length;
  });
  return r;
}

/** Los que de verdad necesitan que alguien mire. */
export function pendientesDeJuicio(cuaderno) {
  return (cuaderno.criterios || []).filter(function (c) { return c.aplica && !c.decision; });
}

const ADMITIDOS = ["cumple", "falla", "no-aplica", "revisar"];

/**
 * Registra la decisión del auditor sobre un criterio.
 *
 * Devuelve un cuaderno NUEVO; no toca el que recibe. Exige motivo y firma:
 *
 *  - Sin **motivo** no se registra. El motivo es el entregable: un IRA que dice
 *    «Correcto» sin decir por qué no se puede defender ante nadie.
 *  - Sin **auditor** tampoco. Una decisión de juicio la firma una persona, y en
 *    un informe con efectos legales eso importa.
 *  - El veredicto sale de un juego cerrado: `cumple`, `falla`, `no-aplica` o
 *    `revisar` (dejarlo pendiente a propósito, con su motivo). `pasa` y
 *    `cumple-parcial` son palabras de la máquina —significan «medido sobre
 *    render real»— y no le corresponden a una persona.
 *
 * @param {object} cuaderno
 * @param {{criterio:string, veredicto:string, motivo:string, auditor:string, fecha?:string, evidencia?:Array}} d
 */
export function registrarJuicio(cuaderno, d) {
  d = d || {};
  if (!cuaderno || !Array.isArray(cuaderno.criterios)) throw new Error("registrarJuicio necesita un cuaderno");
  const i = cuaderno.criterios.findIndex(function (c) { return c.criterio === d.criterio; });
  if (i === -1) throw new Error("El criterio " + d.criterio + " no está en el cuaderno (son: " + CRITERIOS_DE_JUICIO.join(", ") + ")");
  if (ADMITIDOS.indexOf(d.veredicto) === -1) {
    throw new Error("Veredicto no admitido para una decisión humana: «" + d.veredicto + "». Usa " + ADMITIDOS.join(", ") + ".");
  }
  const motivo = String(d.motivo || "").trim();
  if (motivo.length < 10) {
    throw new Error("Falta el motivo de la decisión sobre " + d.criterio + ". Sin motivo no se registra: el motivo es lo que hace defendible el informe.");
  }
  const auditor = String(d.auditor || "").trim();
  if (!auditor) throw new Error("Falta quién firma la decisión sobre " + d.criterio + ".");

  const decision = {
    veredicto: d.veredicto,
    motivo: motivo,
    auditor: auditor,
    fecha: d.fecha || new Date().toISOString(),
    evidencia: Array.isArray(d.evidencia) ? d.evidencia.slice(0, 20) : []
  };
  const criterios = cuaderno.criterios.slice();
  /* `aplica` lo decide la FIRMA, no la detección previa.
   *
   * El agente marca `aplica: false` cuando no ve el supuesto en el marcado —un
   * 1.2.5 sin `<video>`, por ejemplo—. Pero el auditor mira la página de verdad:
   * si firma un `falla` ahí, es que había un reproductor inyectado por JS que el
   * marcado no delataba. Dejar `aplica: false` debajo de esa firma hacía que
   * `cuadernoDeMuestra` descartara la ficha como «no viene al caso en ninguna
   * página» y el `falla` firmado saliera del informe convertido en «No aplica»:
   * la conformidad del sitio pasaba de «No conforme» a «Sin barreras».
   *
   * Así que la decisión manda en las dos direcciones: cualquier veredicto que no
   * sea `no-aplica` significa que el criterio SÍ viene al caso. */
  criterios[i] = Object.assign({}, criterios[i], {
    decision: decision,
    veredicto: d.veredicto,
    aplica: d.veredicto !== "no-aplica"
  });
  return Object.assign({}, cuaderno, { criterios: criterios, resumen: resumenDe(criterios) });
}

/**
 * Convierte el cuaderno en hallazgos, para que entre en el informe como todo lo
 * demás. Tres formas, y ninguna miente sobre su origen:
 *
 *  - decidido por una persona → su veredicto, con el motivo y la firma en la
 *    evidencia. `scope: "juicio"`.
 *  - no aplica (lo decidió el agente) → `no-aplica`, diciendo por qué.
 *  - pendiente → `humano`, con el expediente resumido: qué mirar y qué decidir.
 *    Nunca `cumple`: un criterio sin mirar no puede exportarse como conforme.
 */
export function findingsDelCuaderno(cuaderno) {
  return (cuaderno.criterios || []).map(function (c) {
    const base = { c: { n: c.criterio, t: c.nombre, lvl: c.nivel }, en: c.en, scope: "juicio", sev: null };
    if (c.decision) {
      const d = c.decision;
      const todos = (c.queMirar || []).map(function (m) { return { locator: m.locator, name: "", path: m.path, url: m.pagina || undefined }; });
      /* Un `falla` firmado se lleva TODOS los elementos, sin tope.
       *
       * En el IRA cada elemento afectado es una fila de «Barreras», así que el
       * tope de 8 no recortaba una lista de ejemplos: recortaba el recuento de
       * barreras. Veinte enlaces «Leer más» firmados como falla salían como ocho
       * y `num_barreras` mentía por doce. En los demás veredictos el tope sí es
       * razonable —ahí la lista es para orientar a quien lee, no para contar— y
       * se dice cuántos quedan fuera en vez de recortar en silencio. */
      const recorte = d.veredicto === "falla" ? todos : todos.slice(0, 8);
      const sobran = todos.length - recorte.length;
      return Object.assign({}, base, {
        verdict: d.veredicto,
        sev: d.veredicto === "falla" ? "grave" : null,
        evid: [
          "Decisión de " + d.auditor + " (" + String(d.fecha).slice(0, 10) + "): " + d.motivo
        ].concat(d.evidencia.length ? ["Evidencia aportada: " + d.evidencia.join(" · ")] : [])
          .concat(sobran ? ["Se listan " + recorte.length + " de " + todos.length + " elemento(s) del expediente; el resto está en el cuaderno."] : []),
        nodes: recorte
      });
    }
    if (!c.aplica) {
      return Object.assign({}, base, {
        verdict: "no-aplica",
        evid: [(c.loQueYaSabemos || []).join(" ") || "El criterio no viene al caso en esta página."]
      });
    }
    return Object.assign({}, base, {
      verdict: "humano",
      evid: [c.pregunta]
        .concat((c.loQueYaSabemos || []))
        .concat((c.queMirar || []).length ? ["Hay que mirar " + c.queMirar.length + " elemento(s); el expediente está en el cuaderno."] : [])
        .concat((c.comoDecidir || []).length ? ["Cómo decidirlo: " + c.comoDecidir.join(" ")] : []),
      nodes: (c.queMirar || []).slice(0, 8).map(function (m) { return { locator: m.locator, name: "", path: m.path }; })
    });
  });
}

/* ── El cuaderno de la MUESTRA ─────────────────────────────────────────────
 *
 * Por página el cuaderno se queda corto en dos criterios, y lo dice: 3.3.7 y
 * 3.3.4 hablan del PROCESO, no de la pantalla. El dato que se pide en el paso 1
 * y otra vez en el paso 3 no se ve mirando ninguno de los dos pasos por
 * separado; hay que poner las páginas una al lado de otra.
 *
 * Y hay una regla de seguridad que solo tiene sentido aquí: un criterio no
 * aplica al SITIO si no aplica en NINGUNA de las páginas de la muestra. Basta
 * que una tenga vídeo para que 1.2.5 vuelva a aplicar a la muestra entera. Al
 * revés —declarar «no aplica» porque no aplicaba en la primera página— sería
 * exactamente el fallo que este motor existe para no cometer.
 */

function refPag(m, url) {
  return { locator: m.locator, path: m.path, detalle: m.detalle, pagina: url || null };
}

/**
 * La decisión del SITIO a partir de las decisiones por página.
 *
 * @param {Array<{url:string, f:object}>} firmadas  fichas con `decision`.
 * @param {Array<{url:string, f:object}>} aplican   fichas donde el criterio viene al caso.
 * @returns {object|null} una `decision` agregada, o `null` si el criterio sigue pendiente.
 */
function decisionDeMuestra(firmadas, aplican) {
  if (!firmadas.length) return null;

  const junta = function (elegidas, nota) {
    const peor = elegidas.reduce(function (a, x) {
      return peorVeredicto(a, x.f.decision.veredicto);
    }, null);
    const fechas = elegidas.map(function (x) { return String(x.f.decision.fecha); }).sort();
    const autores = [];
    elegidas.forEach(function (x) {
      if (autores.indexOf(x.f.decision.auditor) === -1) autores.push(x.f.decision.auditor);
    });
    return {
      veredicto: peor,
      motivo: nota + " " + elegidas.map(function (x) {
        return x.url + ": «" + x.f.decision.motivo + "» (" + x.f.decision.auditor + ", " +
          String(x.f.decision.fecha).slice(0, 10) + ", " + x.f.decision.veredicto + ")";
      }).join(" · "),
      auditor: autores.join(", "),
      fecha: fechas[fechas.length - 1],
      evidencia: elegidas.reduce(function (a, x) { return a.concat(x.f.decision.evidencia || []); }, []).slice(0, 20),
      porPagina: elegidas.map(function (x) {
        return { pagina: x.url, veredicto: x.f.decision.veredicto, auditor: x.f.decision.auditor,
          fecha: x.f.decision.fecha, motivo: x.f.decision.motivo };
      })
    };
  };

  // 1) Un falla firmado en cualquier página es un falla del sitio.
  const fallan = firmadas.filter(function (x) { return x.f.decision.veredicto === "falla"; });
  if (fallan.length) {
    return junta(fallan, "Barrera confirmada a mano en " + fallan.length + " página(s) de la muestra —" +
      "basta una para que el sitio no sea conforme—:");
  }

  // 2) Todas las que aplican, firmadas: el sitio hereda la peor.
  const sinFirmar = aplican.filter(function (x) { return !x.f.decision; });
  if (!sinFirmar.length) {
    return junta(firmadas, "Decidido a mano en todas las páginas donde el criterio viene al caso:");
  }

  // 3) Queda trabajo: el criterio sigue pendiente. Las firmas se cuentan arriba,
  //    en `loQueYaSabemos`, pero no cierran el criterio del sitio.
  return null;
}

/* El orden de gravedad, solo para los cuatro veredictos que una persona firma.
 * No se importa de `verdicts.js` a propósito: este módulo lo empaqueta
 * `build-artifact.mjs` en la región ENGINE, que no arrastra dependencias. */
const PEOR = { falla: 4, revisar: 3, cumple: 2, "no-aplica": 1 };
/* Un veredicto desconocido cuenta como `revisar`: nunca como conforme (sería
 * exportar como correcto algo que nadie ha comprobado) y nunca por encima de un
 * `falla` (taparía una barrera confirmada con una palabra que no entendemos). */
function peorVeredicto(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (PEOR[b] || 3) > (PEOR[a] || 3) ? b : a;
}

/* Cruce de 3.3.7 entre páginas: la misma clave de dato en dos páginas
 * distintas es el caso que ninguna ficha por página puede ver. */
function redundanciaEntrePaginas(cuadernos) {
  const porClave = {};
  cuadernos.forEach(function (cu) {
    const f = (cu.criterios || []).find(function (c) { return c.criterio === "3.3.7"; });
    const grupos = (f && f.datos && f.datos.grupos) || {};
    Object.keys(grupos).forEach(function (k) {
      porClave[k] = porClave[k] || { clave: k, paginas: {}, confirmacion: false };
      porClave[k].paginas[cu.url || "(sin url)"] = grupos[k];
      if (grupos[k].some(function (x) { return x.confirmacion; })) porClave[k].confirmacion = true;
    });
  });
  return Object.keys(porClave)
    .map(function (k) { return porClave[k]; })
    .filter(function (g) { return Object.keys(g.paginas).length > 1; });
}

/**
 * Junta los cuadernos de las páginas de una muestra en uno solo.
 *
 * @param {Array<object>} cuadernos  los que devuelve `cuadernoDeJuicio`, uno por página.
 * @param {{ sitio?:string, sinAnalizar?:Array<string> }} [opts]
 *   `sinAnalizar`: URLs de la muestra que NO se pudieron auditar. Cambia el
 *   resultado, no solo el texto: ver abajo.
 */
export function cuadernoDeMuestra(cuadernos, opts) {
  opts = opts || {};
  const lista = (cuadernos || []).filter(function (c) { return c && Array.isArray(c.criterios); });
  if (!lista.length) throw new Error("cuadernoDeMuestra necesita al menos un cuaderno de página");
  const urls = lista.map(function (c) { return c.url || "(sin url)"; });

  /* Páginas de la muestra que no se llegaron a auditar.
   *
   * Con huecos en la muestra, «no aplica en el sitio» deja de ser una conclusión
   * y pasa a ser una suposición: de las páginas que no cargaron no se sabe si
   * tenían vídeo, formularios o límites de tiempo. Y es exactamente el error que
   * este módulo dice existir para no cometer —declarar «no aplica» porque no
   * aplicaba en las páginas que sí se vieron—. Con tres páginas y dos caídas, el
   * cuaderno llegaba a poner nueve criterios como «No aplica» para el sitio
   * entero sobre la base de UNA página. Así que, si falta alguna, un «no aplica»
   * se queda en pendiente y lo dice. Lo que no cambia: un `falla` firmado sigue
   * siendo un `falla`, y lo que ya estaba pendiente sigue pendiente. */
  const huecos = (opts.sinAnalizar || []).filter(Boolean);
  const avisoHueco = huecos.length
    ? "ATENCIÓN: " + huecos.length + " página(s) de la muestra no se auditaron (" +
      huecos.slice(0, 4).join(", ") + (huecos.length > 4 ? ", …" : "") +
      "), así que no se puede afirmar que el criterio no venga al caso en el sitio: solo que no venía al caso en las que sí se vieron."
    : null;

  const criterios = CRITERIOS_DE_JUICIO.map(function (n) {
    const fichas = lista.map(function (c, i) {
      return { url: urls[i], f: (c.criterios || []).find(function (x) { return x.criterio === n; }) };
    }).filter(function (x) { return x.f; });

    const aplican = fichas.filter(function (x) { return x.f.aplica; });
    const firmadas = fichas.filter(function (x) { return x.f.decision; });
    const modelo = (aplican[0] || fichas[0]).f;

    /* Lo FIRMADO va primero, y por encima de la detección.
     *
     * `cuadernoDeMuestra` agregaba mirando solo `aplica` y `veredicto`, y no
     * tocaba `decision`. El resultado era que una decisión de auditor no
     * sobrevivía a la agregación: un `falla` firmado en una página salía del
     * informe del sitio como `humano` («pendiente de mirar»), y si además el
     * agente había marcado la ficha «no aplica», como «No aplica». Las dos cosas
     * borran trabajo hecho y firmado, y la segunda además absuelve al sitio de
     * una barrera que alguien había confirmado a mano.
     *
     * Reglas, en el orden en que se aplican:
     *  - un `falla` firmado en CUALQUIER página es un `falla` del sitio, sin más
     *    condiciones: es la regla de oro del motor;
     *  - si todas las páginas donde el criterio aplica están firmadas, el sitio
     *    hereda la PEOR de esas decisiones;
     *  - si queda alguna sin firmar, el criterio sigue pendiente —una firma en la
     *    página A no dice nada de la B— pero las decisiones ya tomadas se dicen,
     *    para que nadie repita el trabajo. */
    const decidido0 = decisionDeMuestra(firmadas, aplican);
    /* Con huecos en la muestra, un `no-aplica` —venga de la detección o de una
     * firma— tampoco cierra el criterio: quien firmó miró las páginas que
     * cargaron, no las que no. La firma no se pierde: se cuenta abajo, en lo que
     * ya sabemos, y el criterio sigue pendiente hasta que la muestra esté
     * completa. Un `falla`, un `cumple` o un `revisar` firmados sí se mantienen:
     * el primero porque una barrera confirmada basta, y los otros dos porque
     * hablan de contenido que alguien vio de verdad. */
    const decidido = (avisoHueco && decidido0 && decidido0.veredicto === "no-aplica") ? null : decidido0;

    if (!aplican.length && !firmadas.length) {
      const porque = "No viene al caso en ninguna de las " + fichas.length + " página(s) de la muestra que sí se auditaron. " +
        (modelo.loQueYaSabemos || []).join(" ");
      if (!avisoHueco) return noAplica(n, porque);
      // Muestra con huecos: no se cierra como «no aplica».
      return ficha(n, {
        aplica: true,
        veredicto: null,
        pregunta: modelo.pregunta || "¿Viene al caso este criterio en las páginas que no se pudieron auditar?",
        loQueYaSabemos: [avisoHueco, porque],
        comoDecidir: (modelo.comoDecidir && modelo.comoDecidir.length ? modelo.comoDecidir : []).concat([
          "Vuelve a lanzar la auditoría sobre las páginas que fallaron, o míralas a mano: hasta entonces este criterio no se puede cerrar."
        ])
      });
    }

    /* Una ficha firmada `no-aplica` por el auditor y ninguna que aplique: el
     * sitio no aplica, pero lo dice la FIRMA y no la detección. Se conserva la
     * decisión para que el motivo y el auditor salgan en el informe. */
    if (!aplican.length) {
      const porque = "No viene al caso en ninguna de las " + fichas.length + " página(s) de la muestra que sí se auditaron. " +
        (modelo.loQueYaSabemos || []).join(" ");
      if (decidido) {
        return Object.assign({}, noAplica(n, porque), { decision: decidido, veredicto: decidido.veredicto });
      }
      if (!avisoHueco) return noAplica(n, porque);
      return ficha(n, {
        aplica: true,
        veredicto: null,
        pregunta: modelo.pregunta || "¿Viene al caso este criterio en las páginas que no se pudieron auditar?",
        loQueYaSabemos: [avisoHueco, porque].concat(firmadas.length
          ? ["Ya decidido a mano en " + firmadas.map(function (x) { return x.url + " → " + x.f.decision.veredicto + " («" + x.f.decision.motivo + "», " + x.f.decision.auditor + ")"; }).join(" · ") + "."]
          : []),
        comoDecidir: [
          "Vuelve a lanzar la auditoría sobre las páginas que fallaron, o míralas a mano: hasta entonces este criterio no se puede cerrar."
        ]
      });
    }

    // Todo lo que hay que mirar, de todas las páginas, con su página al lado.
    const queMirar = [];
    aplican.forEach(function (x) {
      (x.f.queMirar || []).forEach(function (m) { queMirar.push(refPag(m, x.url)); });
    });

    const sabemos = [];
    const vistos = {};
    aplican.forEach(function (x) {
      (x.f.loQueYaSabemos || []).forEach(function (s) { if (!vistos[s]) { vistos[s] = 1; sabemos.push(s); } });
    });
    sabemos.unshift("Aplica en " + aplican.length + " de " + fichas.length + " página(s) de la muestra: " +
      aplican.slice(0, 6).map(function (x) { return x.url; }).join(", ") + (aplican.length > 6 ? "…" : "") + ".");
    if (aplican.length < fichas.length) {
      sabemos.push("En las otras " + (fichas.length - aplican.length) + " no viene al caso, pero el criterio es del sitio: basta una página para que haya que decidirlo.");
    }

    if (firmadas.length) {
      sabemos.push("Decidido a mano en " + firmadas.length + " de " + fichas.length + " página(s): " +
        firmadas.map(function (x) { return x.url + " → " + x.f.decision.veredicto; }).join(" · ") + "." +
        (decidido ? "" : " Falta por decidir en el resto: una firma en una página no cierra el criterio del sitio."));
    }
    if (avisoHueco) sabemos.unshift(avisoHueco);

    // El veredicto adelantado (2.4.4 sin enlaces vagos, por ejemplo) solo se
    // mantiene si TODAS las páginas donde aplica lo comparten.
    const veredictos = aplican.map(function (x) { return x.f.veredicto; });
    const comun = veredictos.every(function (v) { return v === veredictos[0]; }) ? veredictos[0] : null;

    return ficha(n, {
      decision: decidido,
      veredicto: decidido ? decidido.veredicto : comun,
      pregunta: modelo.pregunta,
      queMirar: queMirar,
      loQueYaSabemos: sabemos,
      comoDecidir: modelo.comoDecidir,
      datos: { paginas: aplican.length, total: fichas.length }
    });
  });

  // Y el cruce que solo existe aquí.
  const cruzados = redundanciaEntrePaginas(lista);
  if (cruzados.length) {
    const i = criterios.findIndex(function (c) { return c.criterio === "3.3.7"; });
    const f = criterios[i];
    const extra = [];
    cruzados.slice(0, 10).forEach(function (g) {
      Object.keys(g.paginas).forEach(function (u) {
        g.paginas[u].forEach(function (x) {
          extra.push({ locator: x.locator, path: x.path, pagina: u,
            detalle: "[entre páginas · " + g.clave + "] «" + (x.etiqueta || "(sin etiqueta)") + "»" +
              (g.confirmacion ? " · en alguna página parece una CONFIRMACIÓN" : "") });
        });
      });
    });
    // Si la ficha venía de «no aplica en ninguna página», esa frase ya no es
    // cierta y no puede quedarse: el criterio acaba de pasar a pendiente porque
    // la repetición está ENTRE páginas, que es precisamente lo que ninguna
    // página podía ver. Dejar la frase vieja debajo del estado nuevo sería
    // contarle al auditor dos cosas incompatibles.
    const previas = f.aplica ? (f.loQueYaSabemos || [])
      : ["Ninguna página de la muestra repite un dato dentro de sí misma: la repetición está ENTRE páginas."];
    criterios[i] = Object.assign({}, f, {
      aplica: true,
      veredicto: null,
      pregunta: f.pregunta || "¿Estos campos piden dos veces el mismo dato dentro del mismo proceso, sin rellenarlo solo ni ofrecerlo para elegir?",
      comoDecidir: f.comoDecidir && f.comoDecidir.length ? f.comoDecidir : [
        "Si el segundo campo es de confirmación, o volver a pedirlo es esencial → cumple.",
        "Si el dato ya se pidió antes en el mismo proceso y no se rellena solo ni se ofrece para elegir → falla.",
        "Comprueba primero que esas páginas son pasos del MISMO proceso: dos formularios sin relación pueden pedir el mismo dato sin incumplir nada."
      ],
      queMirar: (f.queMirar || []).concat(extra),
      loQueYaSabemos: previas.concat([
        cruzados.length + " dato(s) se piden en más de una página de la muestra: " +
        cruzados.slice(0, 6).map(function (g) { return g.clave; }).join(", ") + ". " +
        "Esto es lo que no se ve mirando una sola página, y es el caso típico de 3.3.7 en un trámite de varios pasos.",
        "El agente no sabe si esas páginas son pasos del mismo proceso: eso lo sabes tú."
      ])
    });
  }

  return {
    sitio: opts.sitio || null,
    paginas: urls,
    creado: new Date().toISOString(),
    criterios: criterios,
    resumen: resumenDe(criterios)
  };
}

/**
 * Mete el cuaderno en un informe ya hecho, sustituyendo lo genérico.
 *
 * Hace falta porque el motor ya emite algo para estos once: un `humano` con la
 * frase «requiere evaluación humana; ninguna máquina lo dictamina». Es verdad,
 * pero no ayuda. Y si los dos hallazgos conviven, el agregado se queda con el
 * peor —`humano` gana a `no-aplica`— y el trabajo del cuaderno se pierde: el
 * informe seguiría mandando al auditor a mirar el 1.2.5 de una página sin vídeo.
 *
 * Qué se sustituye y qué no:
 *  - se quitan los `humano` y `revisar` de esos once que vengan de otra capa,
 *    porque son exactamente los que el cuaderno viene a concretar;
 *  - **no se toca ningún `falla`**, venga de donde venga. Si axe o la capa
 *    dinámica encontraron una barrera real en 2.4.4, esa barrera se queda: el
 *    cuaderno añade juicio, no lo perdona.
 */
/* Las capas que MIDEN. Un `revisar` de una de ellas es una observación con
 * expediente —qué se vio, dónde y por qué—, no el hueco que el cuaderno viene a
 * rellenar, así que se conserva.
 *
 * Esto se descubrió añadiendo la medición de 1.3.2: la capa de render detectaba
 * los tres pasos de una receta reordenados con `order` —orden de lectura 1, 2, 3
 * y orden visual 3, 2, 1, medido sobre el navegador— y el cuaderno BORRABA ese
 * hallazgo por ser un `revisar` de uno de los once, dejando en el informe la
 * pregunta genérica y ni una línea del dato. El cuaderno concreta lo que nadie
 * ha mirado; no tapa lo que ya se ha medido. */
const CAPAS_QUE_MIDEN = { "medición": 1, "píxeles": 1, "puntero": 1, "adaptación": 1, "dinámico": 1, "axe-core": 1, "coherencia": 1 };

export function aplicaCuaderno(findings, cuaderno) {
  const mios = {};
  CRITERIOS_DE_JUICIO.forEach(function (n) { mios[n] = 1; });
  const conservados = (findings || []).filter(function (f) {
    if (!f || !f.c || !mios[f.c.n]) return true;
    if (f.verdict === "falla") return true;          // una barrera real no se borra
    if (f.scope === "juicio") return false;          // cuaderno viejo: se reemplaza
    if (CAPAS_QUE_MIDEN[f.origen]) return true;      // una observación medida tampoco
    return f.verdict !== "humano" && f.verdict !== "revisar";
  });
  return conservados.concat(findingsDelCuaderno(cuaderno));
}

/** El cuaderno en texto, para pegarlo en un correo o imprimirlo. */
export function cuadernoTexto(cuaderno) {
  const l = [];
  l.push("CUADERNO DE JUICIO" + (cuaderno.url ? " · " + cuaderno.url : "") +
    (cuaderno.paginas ? " · muestra de " + cuaderno.paginas.length + " página(s)" + (cuaderno.sitio ? " de " + cuaderno.sitio : "") : ""));
  const r = cuaderno.resumen;
  l.push(r.total + " criterios de evaluación humana: " + r.noAplican + " no aplican, " + r.pendientes + " pendientes, " + r.decididos + " decididos.");
  l.push("");
  (cuaderno.criterios || []).forEach(function (c) {
    const estado = c.decision ? c.decision.veredicto.toUpperCase() : (c.aplica ? "PENDIENTE" : "NO APLICA");
    l.push("── " + c.criterio + " " + c.nombre + " (" + c.nivel + ")  [" + estado + "]");
    if (c.decision) l.push("   " + c.decision.auditor + ", " + String(c.decision.fecha).slice(0, 10) + ": " + c.decision.motivo);
    if (c.pregunta) l.push("   ¿? " + c.pregunta);
    (c.loQueYaSabemos || []).forEach(function (s) { l.push("   · " + s); });
    (c.queMirar || []).slice(0, 12).forEach(function (m) {
      l.push("   → " + (m.pagina ? m.pagina + " · " : "") + m.locator + "  " + m.detalle);
    });
    if ((c.queMirar || []).length > 12) l.push("   → … y " + ((c.queMirar || []).length - 12) + " más");
    (c.comoDecidir || []).forEach(function (s) { l.push("   ✓ " + s); });
    l.push("");
  });
  return l.join("\n");
}
