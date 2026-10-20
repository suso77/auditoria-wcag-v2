/**
 * Auditoría de ÁMBITO DE PÁGINA.
 *
 * El motor de componente dictamina rol/nombre/estado/criterios por elemento.
 * Hay criterios WCAG que solo tienen sentido a nivel de página completa —título,
 * idioma, landmarks, saltar bloques, jerarquía de encabezados, ids duplicados—.
 * Este módulo los evalúa sobre el documento renderizado (post-JS).
 *
 * `auditPageDoc(doc)` recibe un documento ya parseado; `auditPageHtml(html, DP)`
 * lo parsea con el DOMParser dado (linkedom en Node, nativo en navegador).
 */
import { WCAG22, enClause } from "./engine.js";
import { EMBEBIDOS, NO_MEDIOS, alternativaCerca } from "./cuaderno.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });

function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "A") }; }
function F(n, verdict, sev, evid, nodes) {
  const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "página", en: enClause(n) };
  if (nodes && nodes.length) f.nodes = nodes;
  return f;
}

const HEADING_SEL = "h1,h2,h3,h4,h5,h6,[role=heading]";
const tag = function (el) { return el && el.tagName ? el.tagName.toLowerCase() : ""; };

/**
 * ¿Está el elemento oculto para todo el mundo?
 *
 * Sin CSS aplicado no podemos saberlo todo, pero sí lo declarado: `hidden`,
 * `aria-hidden="true"`, `display:none`/`visibility:hidden` en línea, `inert`, o
 * un ancestro en esa situación. Un encabezado o un landmark oculto no cuenta:
 * antes inflaban el número de landmarks y el salto de jerarquía.
 */
function ocultoEl(el) {
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
function visibles(list) { return Array.prototype.slice.call(list).filter(function (el) { return !ocultoEl(el); }); }
function loc(el) {
  const t = tag(el);
  if (el.id) return t + "#" + el.id;
  const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  return c ? t + "." + c : t;
}

/**
 * El <title> del documento: el que está en <head>.
 *
 * `doc.querySelector("title")` devolvía también el <title> de un <svg> o de un
 * <math> —que son texto alternativo del gráfico, no el título de la página—, así
 * que una página SIN título salía «cumple». Y si había varios <title> en head y el
 * primero estaba vacío, salía «falla» aunque el siguiente tuviera texto.
 */
function tituloDocumento(doc) {
  const todos = Array.prototype.slice.call(doc.querySelectorAll("title")).filter(function (t) {
    let p = t.parentElement;
    while (p) { const n = tag(p); if (n === "svg" || n === "math") return false; p = p.parentElement; }
    return true;
  });
  const enHead = todos.filter(function (t) { return tag(t.parentElement) === "head"; });
  const cand = enHead.length ? enHead : todos;
  let texto = "";
  for (const t of cand) { const s = (t.textContent || "").trim(); if (s) { texto = s; break; } }
  return { texto: texto, n: cand.length };
}

// Conjunto (sin duplicados) de elementos que actúan como un landmark dado.
function landmarks(doc, role, tags) {
  const set = new Set();
  visibles(doc.querySelectorAll("[role=" + role + "]")).forEach(function (el) { set.add(el); });
  (tags || []).forEach(function (t) {
    visibles(doc.querySelectorAll(t)).forEach(function (el) {
      // header/footer solo son banner/contentinfo si NO están dentro de contenido de sección.
      if ((t === "header" || t === "footer") && enSeccion(el)) return;
      // Un role explícito distinto gana sobre el rol implícito.
      const r = (el.getAttribute("role") || "").split(/\s+/)[0];
      if (r && r !== role) return;
      set.add(el);
    });
  });
  return Array.from(set); // ojo: slice.call sobre un Set devuelve [] (no tiene length)
}
function enSeccion(el) {
  let p = el.parentElement;
  while (p) { if (["article", "aside", "main", "nav", "section"].indexOf(tag(p)) !== -1) return true; p = p.parentElement; }
  return false;
}

// Atributos que apuntan a un id. Faltaban la mitad: un id duplicado usado por
// aria-errormessage o aria-activedescendant pasaba desapercibido.
const IDREF_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
  "aria-flowto", "aria-details", "aria-errormessage", "aria-activedescendant", "headers", "list", "popovertarget"];


/* ── 1.2.x Medios: el inventario SÍ es automatizable ─────────────────────── */

/**
 * Qué medios hay y qué pistas declaran.
 *
 * Los cinco criterios de 1.2 estaban enteros en el cajón de «evaluación
 * humana», y la mitad del trabajo no lo es: que un `<video>` no declare NINGUNA
 * pista de subtítulos es una ausencia determinable desde el marcado, igual que
 * lo es que una imagen no tenga `alt`. Lo que exige juicio es la CALIDAD —si los
 * subtítulos están sincronizados, si la audiodescripción cubre lo que hace
 * falta—, y eso el veredicto lo dice en vez de fingir que lo ha mirado.
 *
 * Los medios incrustados de terceros (YouTube, Vimeo) se inventarían aparte: su
 * contenido no se ve desde aquí, así que se listan para que una persona los
 * abra, no se dictaminan.
 */
/* La lista de reproductores es UNA, y vive en `cuaderno.js`.
 *
 * Aquí había otra: nueve dominios occidentales, sin ninguna plataforma china. Cuando
 * se arregló el inventario de medios para que reconociera Youku, Bilibili, iQiyi y
 * compañía, el arreglo entró en `cuaderno.js` —que decide 1.2.4 y 1.2.5— y NO en este
 * archivo, que decide 1.2.1, 1.2.2 y 1.2.3. Así que el mismo sitio chino tenía sus
 * reproductores reconocidos para dos criterios y no para los otros tres, y esos tres
 * salían en blanco. El fallo no era la lista corta: era tener dos listas.
 */
function inventarioMedios(doc) {
  const propios = [], externos = [], enlaces = [];
  Array.prototype.forEach.call(doc.querySelectorAll("video,audio"), function (el) {
    if (ocultoEl(el)) return;
    const tag = el.tagName.toLowerCase();
    const pistas = Array.prototype.slice.call(el.querySelectorAll("track")).map(function (t) {
      return (t.getAttribute("kind") || "subtitles").toLowerCase();
    });
    propios.push({
      tag: tag, locator: loc(el),
      subtitulos: pistas.indexOf("captions") !== -1 || pistas.indexOf("subtitles") !== -1,
      descripciones: pistas.indexOf("descriptions") !== -1,
      pistas: pistas,
      autoplay: el.hasAttribute("autoplay"),
      controles: el.hasAttribute("controls"),
      silenciado: el.hasAttribute("muted"),
      alternativa: alternativaCerca(el, doc)
    });
  });
  /* Y los marcos DUDOSOS, que es lo que el cuaderno ya hacía para 1.2.4 y 1.2.5.
   *
   * Un marco que no se reconoce ni como reproductor ni como otra cosa (un mapa, un
   * captcha, una analítica) puede ser un reproductor que no está en la lista. El
   * cuaderno lo trata así desde que se arregló el inventario; aquí no, y el efecto era
   * que en una página cuyo único medio es un marco desconocido, 1.2.1, 1.2.2 y 1.2.3
   * no emitían NADA — fila en blanco, que no es lo mismo que «no aplica». */
  const dudosos = [];
  Array.prototype.forEach.call(doc.querySelectorAll("iframe[src],embed[src],object[data]"), function (el) {
    const src = el.getAttribute("src") || el.getAttribute("data") || "";
    if (ocultoEl(el) || !src) return;
    const ficha = { locator: loc(el), src: src.slice(0, 120), nombre: (el.getAttribute("title") || "").slice(0, 60) };
    if (EMBEBIDOS.test(src)) externos.push(ficha);
    else if (!NO_MEDIOS.test(src)) dudosos.push(ficha);
  });
  /* Y los ENLACES a un reproductor o a un archivo de medios.
   *
   * Esto lo añadió una medición, no una idea: la página de vídeos de un sitio real no
   * tiene ni un `<video>` ni un `<iframe>`. Los vídeos son enlaces a un reproductor
   * externo que se abre en una caja de luz al pulsarlos, así que en el DOM no hay
   * ningún medio hasta que alguien hace clic — y los cuatro criterios de medios
   * salían EN BLANCO justamente en la página que más medios tiene de toda la muestra.
   *
   * Cuenta el enlace cuyo destino es un reproductor reconocido o un archivo de medios
   * por extensión. Un enlace a una página que lleve «video» en la ruta no cuenta: eso
   * es adivinar. */
  const ARCHIVO_MEDIA = /\.(mp4|m4v|webm|ogv|mov|avi|mkv|mp3|m4a|ogg|oga|wav|flac|m3u8|mpd)(\?|#|$)/i;
  Array.prototype.forEach.call(doc.querySelectorAll("a[href]"), function (el) {
    const href = el.getAttribute("href") || "";
    if (!href || ocultoEl(el)) return;
    if (!EMBEBIDOS.test(href) && !ARCHIVO_MEDIA.test(href)) return;
    enlaces.push({
      locator: loc(el), src: href.slice(0, 120),
      nombre: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
      archivo: ARCHIVO_MEDIA.test(href)
    });
  });
  return { propios: propios, externos: externos, dudosos: dudosos, enlaces: enlaces };
}

/**
 * 3.1.2 Idioma de las partes: un bloque en otro idioma sin `lang`.
 *
 * Detección por palabras funcionales, que son las que de verdad separan idiomas
 * en textos cortos. No pretende ser un detector de idioma: pretende no callarse
 * cuando un bloque largo está claramente en otro idioma que el declarado. Por
 * eso el veredicto es `revisar` y no `falla`.
 */
const FUNCIONALES = {
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "para", "del", "se", "no", "es", "al", "lo", "su"],
  en: ["the", "of", "and", "to", "in", "a", "is", "that", "for", "it", "with", "as", "was", "on", "are", "this", "be", "by", "an", "from"],
  fr: ["le", "la", "les", "des", "et", "est", "un", "une", "pour", "dans", "que", "qui", "par", "sur", "avec", "au", "du", "ne", "pas", "ce"],
  pt: ["o", "os", "as", "de", "que", "e", "em", "um", "uma", "para", "com", "não", "por", "do", "da", "dos", "das", "no", "na", "se"],
  gl: ["o", "os", "as", "do", "da", "dos", "das", "e", "en", "un", "unha", "para", "con", "non", "que", "por", "ao", "nos", "se", "é"],
  /* Catalán y euskera: faltaban, y en este país eso es un agujero y no un
   * detalle. Una web pública con versión en catalán o en euskera no tenía con
   * qué comparar —el perfil daba «sin margen» y el criterio se cerraba sin
   * corroborar nada—, mientras los léxicos de coherencia sí los cubrían. */
  ca: ["els", "les", "amb", "per", "als", "aquest", "aquesta", "aquests", "dels", "seva", "seu", "molt", "pero", "tambe", "hi", "ha", "fins", "qual", "mes", "son"],
  /* El euskera es aglutinante: lo que en castellano es preposición, aquí es
   * sufijo. Así que el perfil no son artículos sino marcas de caso y auxiliares,
   * que es lo que de verdad se repite en cualquier texto vasco. */
  eu: ["eta", "da", "dira", "du", "dute", "zen", "ditu", "bat", "batzuk", "edo", "ere", "hau", "hori", "bere", "guztiak", "baina", "nola", "gehiago", "egiteko", "dago"]
};
/* Idiomas cuyas palabras funci\u00f3n se solapan de verdad: entre ellos, el perfil no
 * decide. Con `es` declarado y perfil `gl`, lo honesto es decir que no se puede
 * saber desde el marcado, no acusar de idioma equivocado. */
const IDIOMAS_PROXIMOS = {
  es: ["gl", "pt", "ca"], gl: ["es", "pt"], pt: ["es", "gl"],
  // El catalán comparte con el castellano «el», «la», «de», «que», «en», «un»,
  // «una», «no»: el margen entre los dos no decide nada por sí solo.
  ca: ["es"], fr: ["ca"], en: [], eu: []
};

/**
 * Perfil de idioma por palabras funci\u00f3n, con el detalle de la medida.
 *
 * Devuelve siempre un objeto, para que quien lo use pueda distinguir \u00abno hay
 * texto suficiente\u00bb de \u00abhay texto y dice otra cosa\u00bb \u2014 dos situaciones que piden
 * veredictos distintos y que antes se confund\u00edan en un solo `null`.
 */
function idiomaDelTexto(texto) {
  const palabras = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/).filter(Boolean);
  if (palabras.length < 25) return { suficiente: false, razon: "corto", palabras: palabras.length, idioma: null, detalle: "texto demasiado corto" };
  /* Cada palabra puntúa por lo que DISTINGUE, no por aparecer.
   *
   * Contando todas igual, el castellano sacaba un 27 % sobre un texto catalán
   * —«de», «la», «el», «un», «que», «no» son de los dos— y le ganaba a su propio
   * idioma, que se quedaba en el 20 %. Con eso, una página catalana correcta no
   * podía confirmarse nunca. Una palabra que está en N léxicos vale 1/N: las
   * compartidas pesan poco, las propias de un idioma mandan. */
  const enCuantos = {};
  Object.keys(FUNCIONALES).forEach(function (k) {
    FUNCIONALES[k].forEach(function (w) { enCuantos[w] = (enCuantos[w] || 0) + 1; });
  });
  const punt = {};
  Object.keys(FUNCIONALES).forEach(function (k) {
    let suma = 0;
    palabras.forEach(function (w) {
      if (FUNCIONALES[k].indexOf(w) !== -1) suma += 1 / enCuantos[w];
    });
    punt[k] = suma / palabras.length;
  });
  const orden = Object.keys(punt).sort(function (a, b) { return punt[b] - punt[a]; });
  const pct = function (k) { return Math.round(punt[k] * 1000) / 10; };
  /* La tabla entera viaja, no solo el ganador.
   *
   * 3.1.1 y 3.1.2 hacen dos preguntas distintas y antes compartían una sola
   * respuesta. 3.1.2 pregunta «¿de qué idioma es ESTE bloque?» y ahí hace falta
   * un ganador claro. 3.1.1 pregunta «¿encaja lo declarado con el texto?», que
   * es más fácil: basta con que el idioma declarado no quede claramente por
   * debajo de otro. Con una sola respuesta, una página catalana correcta no
   * podía confirmarse nunca —el castellano empata con ella por las palabras que
   * comparten— y lo mismo el gallego con el portugués. */
  const tabla = { punt: punt, orden: orden, pct: pct };
  // Exigir margen: sin diferencia clara entre el primero y el segundo, no se dice.
  if (punt[orden[0]] < 0.08 || punt[orden[0]] < punt[orden[1]] * 1.6) {
    return Object.assign({ suficiente: false, razon: "sin-margen", palabras: palabras.length, idioma: orden[0],
      detalle: "sin margen entre «" + orden[0] + "» (" + pct(orden[0]) + " %) y «" + orden[1] + "» (" + pct(orden[1]) + " %) sobre " + palabras.length + " palabras" }, tabla);
  }
  return Object.assign(tabla, { suficiente: true, palabras: palabras.length, idioma: orden[0],
    detalle: pct(orden[0]) + " % de palabras funci\u00f3n de \u00ab" + orden[0] + "\u00bb sobre " + palabras.length +
      " palabras, frente al " + pct(orden[1]) + " % de \u00ab" + orden[1] + "\u00bb; el perfil solo distingue " +
      Object.keys(FUNCIONALES).join("/") });
}
/** Compatibilidad: el nombre antiguo devuelve solo el c\u00f3digo, o `null`. */
function idiomaProbable(texto) {
  const r = idiomaDelTexto(texto);
  return r.suficiente ? r.idioma : null;
}
/** Texto visible de la p\u00e1gina, para el perfil de idioma. */
function textoVisible(doc) {
  const trozos = [];
  visibles(doc.querySelectorAll("p,li,td,th,h1,h2,h3,h4,h5,h6,label,legend,figcaption,dd,dt,summary,caption,blockquote,a,button"))
    .forEach(function (el) { const t = (el.textContent || "").replace(/\s+/g, " ").trim(); if (t) trozos.push(t); });
  if (!trozos.length) {
    const cuerpo = doc.querySelector("body");
    if (cuerpo) trozos.push((cuerpo.textContent || "").replace(/\s+/g, " ").trim());
  }
  return trozos.join(" \n ");
}

/* ── Lo que se puede ver en el marcado de los criterios «de interacción» ── */

/**
 * 2.2.1 Tiempo ajustable: el temporizador que NADIE puede ajustar.
 *
 * `<meta http-equiv="refresh">` es el fallo determinable del criterio: recarga o
 * redirige sola, sin aviso y sin forma de pararla. WCAG solo la admite con un
 * retardo mayor de 20 horas (que en la práctica es «desactivada»).
 */
function metaRefresh(doc) {
  const out = [];
  Array.prototype.forEach.call(doc.querySelectorAll('meta[http-equiv]'), function (m) {
    if (String(m.getAttribute("http-equiv") || "").toLowerCase() !== "refresh") return;
    const c = String(m.getAttribute("content") || "");
    const seg = parseFloat(c);
    out.push({ segundos: isNaN(seg) ? null : seg, contenido: c.slice(0, 80), redirige: /url\s*=/i.test(c) });
  });
  return out;
}

/**
 * 2.1.4 Atajos de teclado de un carácter.
 *
 * Solo ve los manejadores EN LÍNEA: un `addEventListener` no está en el marcado.
 * Por eso lo que sale es `revisar` con los candidatos, no un veredicto.
 */
const TECLA_SUELTA = /\b(?:e|ev|evt|event)\.(?:key|which|keyCode|charCode)\s*(?:===?|==)\s*["']?[A-Za-z0-9]["']?/;
const CON_MODIFICADOR = /\b(?:e|ev|evt|event)\.(?:ctrlKey|metaKey|altKey|shiftKey)/;
function atajosDeUnaTecla(doc) {
  const out = [];
  const ATTR = ["onkeydown", "onkeyup", "onkeypress"];
  Array.prototype.forEach.call(doc.querySelectorAll("[onkeydown],[onkeyup],[onkeypress]"), function (el) {
    ATTR.forEach(function (a) {
      const code = el.getAttribute(a);
      if (!code) return;
      if (TECLA_SUELTA.test(code) && !CON_MODIFICADOR.test(code)) {
        out.push({ locator: loc(el), attr: a, code: code.replace(/\s+/g, " ").slice(0, 70) });
      }
    });
  });
  // Y los scripts en línea, que es donde suele estar de verdad.
  Array.prototype.forEach.call(doc.querySelectorAll("script:not([src])"), function (sc) {
    const code = String(sc.textContent || "");
    if (/addEventListener\s*\(\s*["']key(down|press|up)["']/.test(code) && TECLA_SUELTA.test(code) && !CON_MODIFICADOR.test(code)) {
      out.push({ locator: "script (en línea)", attr: "addEventListener", code: (TECLA_SUELTA.exec(code) || [""])[0].slice(0, 70) });
    }
  });
  return out;
}

/**
 * 2.5.1 / 2.5.2 / 2.5.4 / 2.5.7: candidatos de puntero, gesto y movimiento.
 *
 * Aquí no se dictamina nada: se localiza DÓNDE hay que mirar. Un `touchstart`,
 * un `pointerdown`, un `devicemotion` o un `draggable` no son una barrera por sí
 * mismos, pero son los únicos sitios donde estos cuatro criterios pueden fallar,
 * y encontrarlos a mano en un sitio grande es lo que cuesta.
 */
const SONDAS_PUNTERO = [
  { crit: "2.5.1", etiqueta: "gestos de varios puntos o trazado", re: /\b(touchmove|gesturestart|gesturechange|pinch|swipe|hammer|interact\.js)\b/i },
  { crit: "2.5.2", etiqueta: "acciones en la pulsación (down) en vez de en la soltada (up)", re: /\b(onmousedown|onpointerdown|ontouchstart)\b/i },
  { crit: "2.5.4", etiqueta: "actuación por movimiento del dispositivo", re: /\b(devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent|shake)\b/i },
  { crit: "2.5.7", etiqueta: "movimientos de arrastre", re: /\b(dragstart|ondragstart|draggable\s*=|sortable|dnd-|drag-and-drop)\b/i }
];
function candidatosPuntero(doc) {
  const porCrit = {};
  const fuentes = [];
  Array.prototype.forEach.call(doc.querySelectorAll("*"), function (el) {
    const attrs = el.attributes || [];
    for (let i = 0; i < attrs.length; i++) {
      const n = attrs[i].name.toLowerCase();
      if (n.indexOf("on") === 0 || n === "draggable") fuentes.push({ locator: loc(el), texto: n + "=" + String(attrs[i].value || "").slice(0, 40) });
    }
  });
  Array.prototype.forEach.call(doc.querySelectorAll("script:not([src])"), function (sc) {
    fuentes.push({ locator: "script (en línea)", texto: String(sc.textContent || "").slice(0, 4000) });
  });
  SONDAS_PUNTERO.forEach(function (sonda) {
    const hits = fuentes.filter(function (f) { return sonda.re.test(f.texto); });
    if (hits.length) porCrit[sonda.crit] = { etiqueta: sonda.etiqueta, hits: hits.slice(0, 6) };
  });
  return porCrit;
}

export function auditPageDoc(doc) {
  const out = [];
  const html = doc.documentElement;

  // 2.4.2 Titulada
  const t = tituloDocumento(doc);
  out.push(t.texto
    ? F("2.4.2", "cumple-parcial", null, ["La página declara <title>: «" + t.texto.slice(0, 80) + "». Que sea descriptivo y único en el sitio exige juicio humano."])
    : F("2.4.2", "falla", "grave", ["La página no tiene <title> en <head> o está vacío: se anuncia por su URL."]));

  // 3.1.1 Idioma de la página. BCP-47 NO distingue mayúsculas: lang="ES" y
  // lang="es-ES" son válidos, y antes se marcaban a revisar.
  const lang = html ? (html.getAttribute("lang") || "").trim() : "";
  const xmlLang = html ? (html.getAttribute("xml:lang") || "").trim() : "";
  const efectivo = lang || xmlLang;
  if (!efectivo) out.push(F("3.1.1", "falla", "grave", ["<html> no declara el atributo lang: el lector no sabe en qué idioma leer."]));
  else if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(efectivo)) out.push(F("3.1.1", "falla", "grave", ["<html lang=\"" + efectivo + "\"> no es una etiqueta de idioma BCP-47 válida."]));
  else if (lang && xmlLang && lang.toLowerCase() !== xmlLang.toLowerCase()) out.push(F("3.1.1", "revisar", null, ["lang=\"" + lang + "\" y xml:lang=\"" + xmlLang + "\" no coinciden."]));
  else {
    /* Que el atributo esté y sea válido NO es que sea verdad.
     *
     * 3.1.1 no pide un `lang` bien escrito: pide que el idioma por omisión de la
     * página se pueda determinar por programa. Una página en inglés con
     * `lang="es"` lo tiene bien escrito y lo tiene MAL: el lector la lee con
     * voz española, y eso es ininteligible. El motor emitía «cumple» sobre esa
     * página, que es declarar conformidad sobre la única cosa que el criterio
     * prohíbe.
     *
     * Lo que se puede hacer desde el marcado es comparar la declaración con un
     * perfil de palabras función del texto visible. Es una señal, no una
     * prueba: por eso ningún resultado de aquí es `falla`. */
    /* La pregunta de 3.1.1 es «¿ENCAJA lo declarado?», no «¿qué idioma es?».
     *
     * Con la segunda pregunta, una página catalana correcta no podía
     * confirmarse nunca: el castellano empata con ella por las palabras que
     * comparten, no hay ganador y el criterio se cerraba sin corroborar nada.
     * Lo mismo el gallego con el portugués — y eso en un país con cuatro
     * lenguas oficiales no es un matiz. Lo que de verdad hace falta comprobar
     * es que el texto NO contradiga la declaración: basta con que el idioma
     * declarado no quede claramente por debajo del que más puntúa. */
    const pista = idiomaDelTexto(textoVisible(doc));
    const decl = efectivo.toLowerCase().split("-")[0];
    const idiomas = Object.keys(FUNCIONALES);
    const p = pista.punt || {};
    const lider = (pista.orden || [])[0];
    const pct = pista.pct || function () { return 0; };
    if (pista.palabras < 25) {
      out.push(F("3.1.1", "cumple-parcial", null, ["Idioma declarado: lang=\"" + efectivo + "\", bien formado. No hay texto suficiente en la página (" + pista.palabras +
        " palabra(s) reconocidas) para corroborar que el contenido esté en ese idioma: compruébalo a ojo."]));
    } else if (idiomas.indexOf(decl) === -1) {
      // Lo honesto cuando el perfil no cubre el idioma declarado: decirlo, en
      // vez de acusar a la página de estar en el idioma que más se le parezca.
      out.push(F("3.1.1", "cumple-parcial", null, ["Idioma declarado: lang=\"" + efectivo + "\", bien formado. El perfil de palabras función no cubre «" + decl +
        "» (solo distingue " + idiomas.join("/") + "), así que no se puede corroborar desde el marcado que el contenido esté en ese idioma: compruébalo a ojo."]));
    } else if (!lider || p[lider] < 0.08) {
      out.push(F("3.1.1", "cumple-parcial", null, ["Idioma declarado: lang=\"" + efectivo + "\", bien formado. El texto de la página no da perfil de ninguno de los idiomas que el motor distingue (" +
        idiomas.join("/") + ") sobre " + pista.palabras + " palabras: puede estar en otro idioma, o ser texto muy técnico. Compruébalo a ojo."]));
    } else if (lider === decl && p[decl] >= (p[pista.orden[1]] || 0) * 1.6) {
      // El declarado gana con margen: el texto lo confirma.
      out.push(F("3.1.1", "cumple", null, ["Idioma declarado: lang=\"" + efectivo + "\", y el texto de la página lo confirma: «" + decl + "» puntúa " +
        pct(decl) + " % de palabras función sobre " + pista.palabras + " palabras, por delante de «" + (pista.orden[1] || "—") + "» (" + pct(pista.orden[1]) + " %)."]));
    } else if (p[decl] * 1.6 >= p[lider]) {
      /* Empate con un idioma cercano: el texto NO contradice la declaración,
       * pero tampoco la confirma, porque el método no sabe separarlos. Castellano
       * y catalán comparten «el», «la», «de», «un», «no»; gallego y portugués,
       * casi todo. Declarar conformidad aquí sería declarar sobre una medición
       * que no discrimina — y pasaría por buena una página catalana etiquetada
       * como `lang="es"`, que es un caso real en una web bilingüe. */
      const otro = lider === decl ? (pista.orden[1] || "—") : lider;
      out.push(F("3.1.1", "cumple-parcial", null, ["Idioma declarado: lang=\"" + efectivo + "\", bien formado, y el texto no lo contradice — pero tampoco lo confirma: «" +
        decl + "» (" + pct(decl) + " %) y «" + otro + "» (" + pct(otro) + " %) empatan sobre " + pista.palabras +
        " palabras, porque son idiomas cercanos que comparten las palabras función. El perfil no sabe separarlos: confirma a ojo que la página está en «" + decl + "» y no en «" + otro + "»."]));
    } else {
      out.push(F("3.1.1", "revisar", null, ["La página declara lang=\"" + efectivo + "\", pero su texto visible puntúa mucho más como «" + lider + "» (" +
        pct(lider) + " %) que como «" + decl + "» (" + pct(decl) + " %), sobre " + pista.palabras + " palabras. " +
        "Si el idioma por omisión no es el declarado, el lector de pantalla lee la página con la voz equivocada y el contenido es ininteligible. " +
        "Compruébalo: si el idioma real es otro, corrige <code>&lt;html lang&gt;</code>; si la página es multilingüe, marca cada parte con su propio <code>lang</code> (3.1.2)."]));
    }
  }

  // 1.3.1 Landmarks: exactamente un main; banner/contentinfo no duplicados
  const mains = landmarks(doc, "main", ["main"]);
  if (mains.length === 0) out.push(F("1.3.1", "revisar", null, ["No hay landmark <main>: dificulta ir directo al contenido principal."]));
  else if (mains.length > 1) out.push(F("1.3.1", "falla", "moderada", ["Hay " + mains.length + " landmarks main: debe haber solo uno."], mains.map(function (e) { return { locator: loc(e) }; })));
  const banners = landmarks(doc, "banner", ["header"]);
  const infos = landmarks(doc, "contentinfo", ["footer"]);
  if (banners.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + banners.length + " landmarks banner: normalmente debe haber uno."], banners.map(function (e) { return { locator: loc(e) }; })));
  if (infos.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + infos.length + " landmarks contentinfo: normalmente debe haber uno."], infos.map(function (e) { return { locator: loc(e) }; })));

  /* 2.4.1 Saltar bloques.
   *
   * Un enlace de salto de verdad cumple TRES cosas, y hasta ahora solo se
   * comprobaba una. Que el destino exista ya se comprobaba —antes valía cualquier
   * `a[href^='#']`, incluido el `href="#"` de un botón falso—. Faltaban las otras
   * dos, y sin ellas el criterio se daba por casi cumplido con un ancla cualquiera:
   *
   *  - Tiene que estar al PRINCIPIO: si para llegar al enlace de salto hay que
   *    tabular por el menú entero, no sirve de nada. Se exige que esté entre los
   *    primeros controles enfocables del documento. El acordeón de una ficha o un
   *    «volver arriba» del pie apuntan a destinos que existen y no son saltos.
   *  - Tiene que SALTAR algo: el destino va después de parte del contenido
   *    repetido. Un ancla cuyo destino está antes que el menú no se salta nada.
   *
   * `cumple-parcial` no es conforme, así que esto no era una conformidad falsa;
   * pero sí una evidencia que afirmaba un mecanismo que la página no tiene. */
  const enfocables = visibles(doc.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]"))
    .filter(function (el) { return (el.getAttribute("tabindex") || "0").charAt(0) !== "-"; });
  const anclas = visibles(doc.querySelectorAll("a[href^='#']"));
  const destinoDe = function (a) {
    const h = (a.getAttribute("href") || "").slice(1);
    if (!h) return null;
    try { return doc.getElementById(h) || doc.querySelector('a[name="' + h.replace(/"/g, '\\"') + '"]') || null; } catch (e) { return null; }
  };
  /* ¿Cuánto hay que tabular para llegar? Se mide sobre la lista de enfocables, que
   * es lo que de verdad recorre quien usa el teclado. Tres es holgado: lo normal es
   * que el enlace de salto sea el primero. */
  const ordenEnfocable = function (el) { return enfocables.indexOf(el); };
  /* El orden del documento se saca de un índice propio, no de
   * `compareDocumentPosition`.
   *
   * Lo escribí con `compareDocumentPosition` y la sonda lo cazó en el primer
   * intento: en linkedom no está implementado, así que devolvía `undefined`, la
   * máscara de bits daba 0 y TODO quedaba «antes de todo». El enlace de salto bueno
   * se rechazaba y la cuenta de controles previos salía 0 siempre — un dato falso en
   * la evidencia, que es peor que no darlo. El motor corre en linkedom y en el
   * navegador, así que la comparación tiene que funcionar en los dos. */
  const orden = new Map();
  Array.prototype.forEach.call(doc.querySelectorAll("*"), function (el, i) { orden.set(el, i); });
  const pos = function (el) { const v = orden.get(el); return v == null ? -1 : v; };
  const anclasConDestino = anclas.map(function (a) { return { a: a, d: destinoDe(a) }; }).filter(function (x) { return !!x.d; });
  const salto = anclasConDestino.find(function (x) {
    const i = ordenEnfocable(x.a);
    if (i < 0 || i > 2) return false;
    // ¿Se salta algo? El destino va DESPUÉS del enlace, y con contenido enfocable
    // por medio: un ancla que apunta a lo que tiene justo al lado no salta nada.
    const pa = pos(x.a), pd = pos(x.d);
    return pa >= 0 && pd > pa;
  });
  // Cuántos controles se ahorra quien lo usa: un dato, no una condición. Exigir que
  // ahorrase al menos uno rechazaba un enlace de salto legítimo en una página sin
  // bloque repetido por delante, que es justo la página donde 2.4.1 no pide nada.
  const saltados = salto
    ? enfocables.filter(function (el) { const p = pos(el); return p > pos(salto.a) && p < pos(salto.d); }).length
    : 0;
  /* Y el destino tiene que ser el CONTENIDO, no un sitio cualquiera más abajo.
   *
   * Estructuralmente, el `<a href="#panel">Desplegar</a>` que abre un acordeón al
   * principio de una ficha es idéntico a un enlace de salto: primer enfocable, y su
   * destino está detrás del menú. Lo comprobé y pasaba por enlace de salto. Por el
   * nombre no se puede distinguir sin atarse a un idioma —este sitio está en chino—,
   * así que se distingue por el destino: `cumple-parcial` solo si apunta al landmark
   * `main` o a algo de dentro. Cualquier otro destino se nombra y se deja a revisar,
   * que es lo que es: puede ser un salto a un `div#contenido` sin landmark, o puede
   * ser un botón falso. */
  const alContenido = salto && mains.some(function (m) { return m === salto.d || (m.contains && m.contains(salto.d)); });
  const navs = visibles(doc.querySelectorAll("nav,[role=navigation]"));
  const headings = visibles(doc.querySelectorAll(HEADING_SEL)).map(function (h) {
    const n = tag(h);
    const lvl = /^h[1-6]$/.test(n) ? parseInt(n[1], 10) : parseInt(h.getAttribute("aria-level") || "2", 10);
    return { lvl: lvl, text: (h.textContent || "").trim().slice(0, 40), el: h };
  });
  if (salto && alContenido) {
    out.push(F("2.4.1", "cumple-parcial", null, ["Hay un enlace de salto al contenido principal (" + salto.a.getAttribute("href") + "), entre los primeros controles enfocables; se ahorra " + saltados + " control(es). Confirma que sea visible al recibir el foco."], [{ locator: loc(salto.a) }]));
  } else if (salto) {
    out.push(F("2.4.1", "revisar", null, [
      "Hay un ancla interna entre los primeros controles enfocables (" + salto.a.getAttribute("href") + ", se salta " + saltados + " control(es)), pero su destino no es el landmark `main` ni está dentro de él.",
      "Puede ser un enlace de salto a un contenedor sin landmark —y entonces vale— o un control que despliega algo, que no tiene nada que ver con 2.4.1. Míralo: es lo único que separa las dos cosas."
    ], [{ locator: loc(salto.a) }]));
  } else if (mains.length || navs.length || headings.length) {
    /* `revisar`, y con los datos puestos para que se pueda decidir en diez
     * segundos. La evidencia decía «hay landmarks/encabezados» juntando las dos
     * cosas: medido en un sitio real, cero `main`, cero `nav`, cero anclas internas
     * y catorce encabezados — y el informe decía «landmarks», que la página no
     * tiene. Lo que decide a mano este criterio son tres números y una advertencia,
     * así que van los tres números y la advertencia. */
    /* ¿Cuánto cuesta llegar al contenido? Hasta el `main` si lo hay, y si no hasta
     * el primer encabezado, que es lo único que marca dónde empieza el contenido en
     * una página sin landmarks. */
    const ancla = mains.length ? mains[0] : (headings.length ? headings[0].el : null);
    const pAncla = ancla ? pos(ancla) : -1;
    const antesDelContenido = pAncla >= 0
      ? enfocables.filter(function (el) { return pos(el) < pAncla; }).length
      : enfocables.length;
    const haciaDonde = mains.length ? "llegar al landmark main" : "llegar al primer encabezado";
    const anclasNoSalto = anclasConDestino.length;
    out.push(F("2.4.1", "revisar", null, [
      "No hay enlace de salto utilizable" +
      (anclasNoSalto ? " (hay " + anclasNoSalto + " ancla(s) interna(s) con destino válido, pero ninguna está entre los primeros controles enfocables apuntando hacia delante: no son enlaces de salto)" : "") +
      ". Lo que hay como mecanismo alternativo: " +
      [mains.length ? mains.length + " landmark main" : null,
        navs.length ? navs.length + " landmark(s) de navegación" : null,
        headings.length ? headings.length + " encabezado(s)" : null].filter(Boolean).join(", ") + ".",
      "Hay que tabular por " + antesDelContenido + " control(es) para " + haciaDonde + ", de " + enfocables.length + " enfocables en la página.",
      "WCAG admite los landmarks (ARIA11) y los encabezados (H69) como técnicas suficientes, así que esto no se firma como falla desde aquí. Pero decide tú: landmarks y encabezados solo se navegan con tecnología de apoyo, y quien usa el teclado sin lector de pantalla no tiene con qué saltar el bloque repetido. Es el motivo habitual para firmarlo como barrera."
    ]));
  } else {
    out.push(F("2.4.1", "falla", "moderada", ["No hay enlace de salto ni landmarks ni encabezados para saltar bloques repetidos: " + enfocables.length + " control(es) enfocable(s) que hay que recorrer en cada página."]));
  }

  // 2.4.6 / 1.3.1 Encabezados: existe h1 y sin saltos de nivel (solo los visibles)
  if (!headings.length) {
    out.push(F("1.3.1", "revisar", null, ["La página no tiene encabezados visibles: no hay estructura navegable por títulos."]));
  } else {
    const hasH1 = headings.some(function (h) { return h.lvl === 1; });
    let skip = null, skipEl = null, prev = 0;
    for (const h of headings) { if (prev && h.lvl > prev + 1) { skip = prev + "→" + h.lvl; skipEl = h.el; break; } prev = h.lvl; }
    const vacios = headings.filter(function (h) { return !h.text; });
    if (!hasH1) out.push(F("2.4.6", "revisar", null, ["No hay un encabezado de nivel 1 (h1) en la página."]));
    if (skip) out.push(F("1.3.1", "revisar", null, ["Salto en la jerarquía de encabezados (" + skip + "): revisa que el orden de niveles sea correcto."], skipEl ? [{ locator: loc(skipEl) }] : null));
    if (vacios.length) out.push(F("2.4.6", "falla", "moderada", [vacios.length + " encabezado(s) sin texto: anuncian un nivel vacío."], vacios.map(function (h) { return { locator: loc(h.el) }; })));
    if (hasH1 && !skip && !vacios.length) out.push(F("2.4.6", "cumple-parcial", null, [headings.length + " encabezados con jerarquía sin saltos; la calidad del texto exige juicio."]));
  }

  // 1.3.1 / 4.1.2 IDs: duplicados usados en relaciones, y referencias colgantes
  const idCount = {};
  Array.prototype.forEach.call(doc.querySelectorAll("[id]"), function (el) {
    const id = el.getAttribute("id"); if (id) idCount[id] = (idCount[id] || 0) + 1;
  });
  const referenced = {};
  IDREF_ATTRS.forEach(function (attr) {
    Array.prototype.forEach.call(doc.querySelectorAll("[" + attr + "]"), function (el) {
      const multi = attr !== "aria-activedescendant" && attr !== "list" && attr !== "popovertarget";
      const v = (el.getAttribute(attr) || "").trim();
      (multi ? v.split(/\s+/) : [v]).forEach(function (id) { if (id) (referenced[id] = referenced[id] || []).push(el); });
    });
  });
  Array.prototype.forEach.call(doc.querySelectorAll("label[for]"), function (el) {
    const f = el.getAttribute("for"); if (f) (referenced[f] = referenced[f] || []).push(el);
  });
  const dupRef = Object.keys(idCount).filter(function (id) { return idCount[id] > 1 && referenced[id]; });
  if (dupRef.length) out.push(F("1.3.1", "falla", "grave", ["IDs duplicados usados en relaciones ARIA/label: " + dupRef.slice(0, 8).join(", ") + " — la relación se vuelve ambigua."]));
  /* ── Referencias colgantes: NO todas valen lo mismo ───────────────────────
   *
   * Esta regla metía los doce atributos IDREF en un solo `4.1.2 falla grave` con
   * la frase «el nombre, la descripción o la relación no llegan a la API de
   * accesibilidad», y ni se guardaba qué atributo apuntaba a dónde. Medido en el
   * banco del sitio limpio: de las 26 acusaciones, SIETE eran esto, y las siete
   * sobre el mismo idioma:
   *
   *     <button aria-expanded="false" aria-controls="mobile-menu" aria-label="Abrir menú">
   *     <button aria-haspopup="listbox" aria-expanded="false" aria-controls="service-listbox">
   *
   * `#mobile-menu` no está en el DOM porque el menú está CERRADO. Al abrirlo
   * existe y la referencia resuelve. Es el patrón de todo widget colapsado de
   * React, Vue o Svelte, es decir, de media web.
   *
   * Y la frase era falsa para ese atributo. El nombre de ese botón llega
   * perfectamente a la API —`aria-label="Abrir menú"`—, igual que su rol y su
   * estado `aria-expanded`. Lo único que no resuelve es `aria-controls`, que es
   * una relación OPCIONAL en los patrones de divulgación y combobox, y que las
   * tecnologías de apoyo ignoran cuando no resuelve. Acusar de 4.1.2 grave
   * diciendo que el nombre no llega, cuando llega, es afirmar un hecho falso.
   *
   * Así que se separan dos grupos, y la diferencia es si el atributo APORTA el
   * nombre, la descripción o el foco:
   *
   *   · los que sí → una referencia colgante PIERDE de verdad lo que aportaba,
   *     y eso sigue siendo `falla`, con la evidencia diciendo qué se pierde;
   *   · los que solo declaran una relación opcional → `revisar` con las dos
   *     lecturas. Es ARIA inválida según la especificación, y en una auditoría
   *     con efectos legales puede ser reportable; pero no es una barrera que el
   *     agente pueda firmar él solo, y menos sin saber si el destino aparece al
   *     expandir. `revisar` deja la decisión en quien audita y nunca se exporta
   *     como conforme, que es lo que exige la regla de oro.
   */
  const APORTAN_NOMBRE = { "aria-labelledby": "el nombre accesible", "aria-describedby": "la descripción accesible",
    "aria-errormessage": "el mensaje de error asociado", "aria-details": "los detalles asociados",
    "aria-activedescendant": "cuál es el descendiente activo (el foco dentro del widget)",
    "headers": "la cabecera que da sentido a la celda", "list": "la lista de valores sugeridos" };
  const colgantes = Object.keys(referenced).filter(function (id) { return !idCount[id]; });
  const atributoDe = function (id) {
    // ¿Por qué atributo se referencia ese id? Se busca en el elemento que lo cita.
    const el = referenced[id][0];
    for (let i = 0; i < IDREF_ATTRS.length; i++) {
      const v = (el.getAttribute(IDREF_ATTRS[i]) || "").trim();
      if (v && v.split(/\s+/).indexOf(id) !== -1) return IDREF_ATTRS[i];
    }
    return (el.tagName || "").toLowerCase() === "label" ? "for" : "";
  };
  const fuertes = [], flojas = [];
  colgantes.forEach(function (id) {
    const attr = atributoDe(id);
    (APORTAN_NOMBRE[attr] || attr === "for" ? fuertes : flojas).push({ id: id, attr: attr, el: referenced[id][0] });
  });
  if (fuertes.length) {
    out.push(F("4.1.2", "falla", "grave", [fuertes.slice(0, 8).map(function (r) {
      return "<code>" + r.attr + "=\"" + r.id + "\"</code> apunta a un ID que no existe, así que " +
        (APORTAN_NOMBRE[r.attr] || "la etiqueta del campo") + " NO llega a la API de accesibilidad.";
    }).join(" ")], fuertes.slice(0, 8).map(function (r) { return { locator: loc(r.el), name: r.id }; })));
  }
  if (flojas.length) {
    out.push(F("4.1.2", "revisar", "moderada", [flojas.slice(0, 8).map(function (r) {
      const colapsado = r.el.getAttribute("aria-expanded") === "false" || r.el.hasAttribute("aria-haspopup");
      return "<code>" + r.attr + "=\"" + r.id + "\"</code> apunta a un ID que no existe en este estado de la página. " +
        (colapsado
          ? "PERO el elemento que la declara está CERRADO (<code>aria-expanded=\"false\"</code>" +
            (r.el.hasAttribute("aria-haspopup") ? " / <code>aria-haspopup</code>" : "") +
            "), y el idioma habitual es renderizar el destino solo al abrirlo: entonces la referencia resuelve y no hay barrera. " +
            "Lo que hay que comprobar es si <code>#" + r.id + "</code> aparece AL EXPANDIR. Si aparece, no es barrera; si no aparece nunca, sí lo es."
          : "El nombre, el rol y el estado de ese elemento NO dependen de esta relación y llegan igual a la API. " +
            "Es ARIA inválida según la especificación y puede ser reportable en una auditoría formal, pero no es una barrera que el agente pueda firmar.");
    }).join(" ")], flojas.slice(0, 8).map(function (r) { return { locator: loc(r.el), name: r.id }; })));
  }

  /* ── 1.2.x Medios ── */
  const medios = inventarioMedios(doc);
  const dudosos = medios.dudosos || [], enlazados = medios.enlaces || [];
  if (medios.propios.length || medios.externos.length || dudosos.length || enlazados.length) {
    const videos = medios.propios.filter(function (m) { return m.tag === "video"; });
    const audios = medios.propios.filter(function (m) { return m.tag === "audio"; });
    const sinSub = videos.filter(function (m) { return !m.subtitulos; });
    const sinDesc = videos.filter(function (m) { return !m.descripciones; });

    if (sinSub.length) {
      out.push(F("1.2.2", "falla", "grave", [
        sinSub.length + " vídeo(s) no declaran ninguna pista de subtítulos (<track kind=\"captions\">): " +
        sinSub.slice(0, 5).map(function (m) { return m.locator; }).join(", ") +
        ". La ausencia de pista sí es determinable; que los subtítulos existentes sean correctos, no."
      ], sinSub.slice(0, 8).map(function (m) { return { locator: m.locator, name: "sin subtítulos" }; })));
    } else if (videos.length) {
      out.push(F("1.2.2", "cumple-parcial", null, [
        "Los " + videos.length + " vídeo(s) declaran pista de subtítulos. Que estén completos, sincronizados y en el idioma correcto exige verlos."
      ]));
    }
    if (sinDesc.length) {
      /* «Ni se detecta una alternativa» era una afirmación que no se comprobaba.
       *
       * 1.2.3 se satisface con una alternativa en texto, y eso no vive dentro del
       * `<video>`: es un enlace o un bloque al lado. Ahora se busca —en los mismos
       * idiomas que el léxico de ayuda, chino incluido— y se distingue el vídeo que
       * no tiene nada del que tiene algo que se anuncia como transcripción, que son
       * dos sitios muy distintos a los que mandar a quien audita. */
      const conTexto = sinDesc.map(function (m) { return { m: m, alt: m.alternativa }; }).filter(function (x) { return !!x.alt; });
      const pelados = sinDesc.filter(function (m) { return !m.alternativa; });
      out.push(F("1.2.3", "revisar", null, [
        pelados.length
          ? pelados.length + " vídeo(s) no declaran pista de audiodescripción (<track kind=\"descriptions\">) y NO se encuentra junto a ellos nada que se anuncie como transcripción o alternativa en texto: " +
            pelados.slice(0, 5).map(function (m) { return m.locator; }).join(", ") + "."
          : "Ningún vídeo se queda sin audiodescripción ni sin algo al lado que se anuncie como alternativa en texto.",
        conTexto.length
          ? conTexto.length + " vídeo(s) sin pista de descripciones pero con una alternativa anunciada al lado (" +
            conTexto.slice(0, 4).map(function (x) { return x.m.locator + " → «" + x.alt.texto + "»"; }).join("; ") +
            "): 1.2.3 se satisface con una alternativa en texto completa, así que lee eso y comprueba que cuenta lo que pasa en el vídeo."
          : null
      ].filter(Boolean), sinDesc.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.alternativa ? "alternativa anunciada al lado" : "sin audiodescripción" }; })));
    }
    if (audios.length) {
      const sinTranscripcion = audios.filter(function (m) { return !m.alternativa; });
      out.push(F("1.2.1", "revisar", null, [
        audios.length + " elemento(s) de solo audio (" + audios.map(function (m) { return m.locator; }).join(", ") + ").",
        sinTranscripcion.length
          ? sinTranscripcion.length + " de ellos no tienen al lado nada que se anuncie como transcripción (" +
            sinTranscripcion.slice(0, 5).map(function (m) { return m.locator; }).join(", ") + "): 1.2.1 exige una alternativa en texto equivalente."
          : "Todos tienen al lado algo que se anuncia como transcripción (" +
            audios.slice(0, 4).map(function (m) { return m.locator + " → «" + m.alternativa.texto + "»"; }).join("; ") +
            "): léela y comprueba que es equivalente."
      ], audios.slice(0, 8).map(function (m) { return { locator: m.locator, name: "solo audio" }; })));
    }
    if (medios.externos.length) {
      out.push(F("1.2.2", "revisar", null, [
        medios.externos.length + " medio(s) incrustados de terceros (" +
        medios.externos.slice(0, 4).map(function (m) { return m.locator + " → " + m.src.replace(/^https?:\/\//, "").slice(0, 45); }).join(", ") +
        "): su contenido no se ve desde aquí. Ábrelos y comprueba subtítulos y audiodescripción en el propio reproductor."
      ], medios.externos.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.nombre || "medio incrustado" }; })));
    }

    /* Lo que aplica a los tres criterios se dice en los TRES.
     *
     * Esta nota salía solo bajo 1.2.2 — y su propio texto dice «1.2.1, 1.2.2 y 1.2.3
     * aplican». Medido en la cuarta pasada contra el sitio real: 1.2.2 apareció y
     * 1.2.1 y 1.2.3 siguieron en blanco por la misma página y el mismo marco. Una
     * fila en blanco no es «no aplica», que es el defecto que esto venía a arreglar. */
    const notaMedios = function (texto, nodos) {
      ["1.2.1", "1.2.2", "1.2.3"].forEach(function (c) { out.push(F(c, "revisar", null, [texto], nodos)); });
    };
    if (dudosos.length) {
      notaMedios(
        dudosos.length + " marco(s) no se reconocen ni como reproductor ni como otra cosa (" +
        dudosos.slice(0, 4).map(function (m) { return m.locator + " → " + m.src.replace(/^https?:\/\//, "").slice(0, 45); }).join(", ") +
        "): pueden ser reproductores que no están en la lista. Ábrelos: si llevan vídeo o audio, 1.2.1, 1.2.2 y 1.2.3 aplican y hay que comprobarlos ahí.",
        dudosos.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.nombre || "marco sin reconocer" }; }));
    }
    if (enlazados.length) {
      const conArchivo = enlazados.filter(function (m) { return m.archivo; });
      notaMedios(
        enlazados.length + " enlace(s) llevan a un reproductor externo o a un archivo de medios (" +
        enlazados.slice(0, 4).map(function (m) { return m.locator + (m.nombre ? " «" + m.nombre + "»" : "") + " → " + m.src.replace(/^https?:\/\//, "").slice(0, 55); }).join(", ") +
        (enlazados.length > 4 ? ", …" : "") + "). " +
        (conArchivo.length ? conArchivo.length + " apuntan a un archivo de medios directamente. " : "") +
        "Son medios que la página ofrece aunque no haya ningún `<video>` en el DOM —se abren al pulsarlos—, así que 1.2.1, 1.2.2 y 1.2.3 aplican: ábrelos y comprueba ahí subtítulos, audiodescripción y transcripción.",
        enlazados.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.nombre || "enlace a medio" }; }));
    }

    /* 1.4.2 Control del audio: lo que suena solo y no se puede parar.
     *
     * Y cuando NO hay nada que suene solo, también se dice. Era el último «No
     * evaluado» de los 55 subcriterios: solo hablaba al encontrar un medio con
     * `autoplay`, así que en un sitio sin `<video>` ni `<audio>` en el DOM —el caso
     * medido: 26 vídeos ofrecidos como enlaces a un reproductor externo— la fila
     * quedaba vacía. El criterio sí se puede acotar: lo que 1.4.2 prohíbe es el audio
     * que arranca SOLO al cargar, y un medio que se abre al pulsarlo no es automático.
     * Eso es un `cumple-parcial` medido, no una fila en blanco. */
    const suenanSolos = medios.propios.filter(function (m) { return m.autoplay && !m.silenciado; });
    if (medios.propios.length && !suenanSolos.length) {
      /* Hay medios y ninguno arranca con sonido: eso también es un resultado. */
      out.push(F("1.4.2", "cumple-parcial", null, [
        "Los " + medios.propios.length + " medio(s) de la página (" + medios.propios.map(function (m) { return m.locator; }).join(", ") +
        ") no arrancan solos con sonido: " +
        (medios.propios.filter(function (m) { return m.autoplay; }).length
          ? "los que llevan `autoplay` están silenciados."
          : "ninguno declara `autoplay`.") +
        " 1.4.2 prohíbe el audio que empieza solo al cargar, y aquí no empieza ninguno.",
        "Queda fuera lo que arranque por JavaScript después de cargar (un `play()` diferido, un `muted = false`) y el audio que venga dentro de un marco: compruébalo cargando la página con el volumen puesto."
      ]));
    }
    if (!medios.propios.length && (enlazados.length || medios.externos.length || dudosos.length)) {
      out.push(F("1.4.2", "cumple-parcial", null, [
        "No hay ningún `<video>` ni `<audio>` en la página, así que nada arranca con sonido al cargar: lo que 1.4.2 prohíbe es el audio automático, y los " +
        (enlazados.length + medios.externos.length + dudosos.length) + " medio(s) que la página ofrece se abren al pulsarlos, lo que no es automático.",
        "Queda por comprobar una cosa, y es la que importa: que al abrir ese reproductor el audio no empiece solo sin forma de pararlo —varios de estos enlaces llevan `autoplay` en la URL— y que el reproductor tenga sus controles alcanzables con el teclado. Eso se ve abriéndolo."
      ]));
    }
    if (suenanSolos.length) {
      const sinControl = suenanSolos.filter(function (m) { return !m.controles; });
      out.push(sinControl.length
        ? F("1.4.2", "falla", "grave", [
            sinControl.length + " medio(s) con <code>autoplay</code>, sin silenciar y SIN controles: " +
            sinControl.map(function (m) { return m.locator; }).join(", ") +
            ". Si suena más de 3 segundos no hay forma de pararlo, que es justo lo que prohíbe 1.4.2."
          ], sinControl.slice(0, 8).map(function (m) { return { locator: m.locator, name: "autoplay sin control" }; }))
        : F("1.4.2", "revisar", null, [
            suenanSolos.length + " medio(s) se reproducen solos con sonido pero ofrecen controles: comprueba que el mecanismo de parada esté al principio del orden de tabulación."
          ], suenanSolos.slice(0, 8).map(function (m) { return { locator: m.locator, name: "autoplay con control" }; })));
    }
  }

  /* ── 2.2.1 Tiempo ajustable ── */
  const refrescos = metaRefresh(doc);
  refrescos.forEach(function (r) {
    // El único umbral que WCAG admite son 20 horas: por debajo, o se puede
    // ajustar/parar/extender, o es una falla.
    if (r.segundos != null && r.segundos > 72000) return;
    out.push(F("2.2.1", "falla", "grave", [
      "La página se " + (r.redirige ? "redirige" : "recarga") + " sola con <code>&lt;meta http-equiv=\"refresh\"&gt;</code>" +
      (r.segundos != null ? " a los " + r.segundos + " segundos" : "") +
      " (<code>" + r.contenido + "</code>): no hay forma de apagarlo, ajustarlo ni prorrogarlo, que es lo que exige 2.2.1."
    ], [{ locator: "meta[http-equiv=refresh]", name: r.contenido }]));
  });

  /* ── 2.1.4 Atajos de teclado de un carácter ── */
  const atajos = atajosDeUnaTecla(doc);
  if (atajos.length) {
    out.push(F("2.1.4", "revisar", null, [
      atajos.length + " manejador(es) de teclado comparan una tecla suelta sin exigir Ctrl, Alt, Cmd ni Mayúsculas: " +
      atajos.slice(0, 4).map(function (a) { return a.locator + " (" + a.attr + ": " + a.code + ")"; }).join(" · ") +
      ". 2.1.4 exige poder desactivar el atajo, reasignarlo, o que solo actúe con el foco puesto en su control. Solo se ven los manejadores en línea: los de un bundle externo no se detectan desde aquí."
    ], atajos.slice(0, 8).map(function (a) { return { locator: a.locator, name: a.attr }; })));
  }

  /* ── 2.5.1 / 2.5.2 / 2.5.4 / 2.5.7: dónde hay que mirar ── */
  const puntero = candidatosPuntero(doc);
  Object.keys(puntero).forEach(function (crit) {
    const p = puntero[crit];
    out.push(F(crit, "revisar", null, [
      "Se detectan " + p.hits.length + " indicio(s) de " + p.etiqueta + ": " +
      p.hits.slice(0, 4).map(function (h) { return h.locator; }).join(", ") +
      ". El agente no dictamina este criterio; señala dónde mirar, que en un sitio grande es lo que cuesta."
    ], p.hits.map(function (h) { return { locator: h.locator, name: "" }; })));
  });

  /* ── 3.1.2 Idioma de las partes ──
   *
   * Este criterio solo hablaba al encontrar un bloque sospechoso, así que en una
   * página homogénea salía «No evaluado» en la hoja de seguimiento, que se lee
   * igual que «nadie lo miró». Ahora se emite siempre: con la cuenta de bloques
   * revisados, los que ya declaran su idioma, y el límite de la detección — que
   * solo distingue cinco idiomas y no ve una palabra o una frase suelta. */
  const langPagina = String((html && html.getAttribute("lang")) || "").toLowerCase().split("-")[0];
  if (!langPagina) {
    // Sin idioma de página no hay con qué comparar: lo que falla es 3.1.1, que ya
    // lo dice, pero 3.1.2 tampoco puede declararse conforme.
    out.push(F("3.1.2", "revisar", null, [
      "La página no declara idioma, así que no hay referencia con la que comparar las partes: revísalo después de corregir 3.1.1."
    ]));
  }
  if (langPagina) {
    const sospechosos = [];
    let revisados = 0, yaMarcados = 0;
    const bloques = doc.querySelectorAll("p,li,blockquote,td,dd,figcaption,h1,h2,h3,h4,h5,h6");
    for (let i = 0; i < bloques.length && sospechosos.length < 12; i++) {
      const el = bloques[i];
      if (ocultoEl(el)) continue;
      // Si el propio bloque o un antepasado ya declara idioma, está resuelto.
      let p = el, declarado = null;
      while (p && p.nodeType === 1) { const l = p.getAttribute("lang"); if (l) { declarado = l.toLowerCase().split("-")[0]; break; } p = p.parentElement; }
      if (declarado && declarado !== langPagina) { yaMarcados++; continue; }
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
      revisados++;
      const idioma = idiomaProbable(txt);
      if (idioma && idioma !== langPagina) {
        sospechosos.push({ locator: loc(el), idioma: idioma, texto: txt.slice(0, 60) });
      }
    }
    if (sospechosos.length) {
      out.push(F("3.1.2", "revisar", null, [
        sospechosos.length + " bloque(s) parecen estar en un idioma distinto del declarado (<code>lang=\"" + langPagina + "\"</code>) y no lo marcan: " +
        sospechosos.slice(0, 4).map(function (x) { return x.locator + " (¿" + x.idioma + "?) «" + x.texto + "»"; }).join(" · ") +
        ". La detección es por palabras funcionales y puede equivocarse con textos técnicos o con citas: confírmalo antes de anotarlo."
      ], sospechosos.slice(0, 8).map(function (x) { return { locator: x.locator, name: x.idioma }; })));
    } else {
      /* `cumple-parcial`, no `cumple`: lo comprobado es que ningún bloque de
       * texto da un perfil de otro idioma, y eso no alcanza a lo que pide el
       * criterio. La detección solo distingue cinco idiomas y necesita 25
       * palabras, así que una cita corta, un nombre propio extranjero o un
       * término técnico suelto no los ve nadie más que una persona leyendo. */
      out.push(F("3.1.2", "cumple-parcial", null, [
        "Se han revisado " + revisados + " bloque(s) de texto contra el idioma declarado (<code>lang=\"" + langPagina +
        "\"</code>)" + (yaMarcados ? ", más " + yaMarcados + " que ya declaran su propio idioma," : "") +
        " y ninguno da el perfil de otro idioma. La detección es por palabras funcionales: distingue " +
        Object.keys(FUNCIONALES).join("/") + " y necesita unas 25 palabras, así que una cita corta, una frase hecha o un término extranjero suelto NO los ve. " +
        "Si la página mezcla idiomas en frases cortas, compruébalo a ojo."
      ]));
    }
  }

  return out;
}

export function auditPageHtml(html, DP) {
  const P = DP || (typeof DOMParser !== "undefined" ? DOMParser : null);
  if (!P) throw new Error("auditPageHtml necesita un DOMParser (pásalo como 2.º argumento en Node)");
  const doc = new P().parseFromString(String(html || ""), "text/html");
  return auditPageDoc(doc);
}

// Resumen de veredictos de página.
export function pageSummary(findings) {
  const s = { falla: 0, revisar: 0, humano: 0, "cumple-parcial": 0, cumple: 0 };
  findings.forEach(function (f) { if (s[f.verdict] != null) s[f.verdict]++; });
  return s;
}
