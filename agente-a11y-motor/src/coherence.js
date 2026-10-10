/**
 * Coherencia entre páginas de la muestra.
 *
 * Cuatro criterios que el motor daba por «evaluación humana» y que en cuanto hay
 * una muestra son deterministas: no hablan de juicio, hablan de comparar páginas
 * entre sí. Lo que hace falta es mirar más de una a la vez, y el muestreo ya está.
 *
 *   3.2.3 Navegación coherente     (AA) — el mismo orden relativo en cada página
 *   3.2.4 Identificación coherente (AA) — la misma función, el mismo nombre
 *   3.2.6 Ayuda coherente          (A)  — la ayuda, en el mismo sitio relativo
 *   2.4.5 Múltiples vías           (AA) — más de una forma de localizar una página
 *
 * `fingerprintPage(doc)` saca la huella de un documento ya renderizado; es pura y
 * corre igual en Node (linkedom) que en el navegador. `analyzeCoherence(huellas)`
 * compara las huellas y emite los veredictos. Ninguna de las dos toca la red.
 */
import { WCAG22, enClause } from "./engine.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "AA") }; }
function F(n, verdict, sev, evid, nodes) {
  const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "sitio", origen: "coherencia", en: enClause(n) };
  if (nodes && nodes.length) f.nodes = nodes;
  return f;
}

/* ── Normalización ───────────────────────────────────────────────────────── */

/** Destino canónico de un enlace: es la IDENTIDAD de «misma función». */
export function normalizarHref(href, base) {
  const h = String(href || "").trim();
  if (!h) return null;
  if (/^(mailto:|tel:|javascript:)/i.test(h)) return h.toLowerCase().replace(/\s+/g, "");
  if (h === "#" || h.charAt(0) === "#") return null; // ancla interna: no identifica una página
  let u;
  try { u = new URL(h, base || "http://local/"); } catch (e) { return h.toLowerCase(); }
  u.hash = "";
  let p = u.pathname.replace(/\/+$/, "");
  if (!p) p = "/";
  /* El HOST no distingue mayúsculas; la RUTA sí.
   *
   * Minusculizándolo todo, `/Servicios` y `/servicios` quedaban como el mismo
   * destino, y 3.2.4 emitía un `falla` —«el mismo destino con nombres distintos»—
   * sobre dos páginas que en el servidor son dos páginas diferentes y pueden
   * llamarse cada una como quiera. En HTTP la ruta es sensible a mayúsculas, así
   * que se respeta tal cual; lo mismo la cadena de consulta, donde un valor puede
   * ser un identificador que las distinga. */
  return u.host.toLowerCase() + p + (u.search || "");
}

/** Nombre comparable: sin acentos, sin puntuación de adorno, en minúsculas. */
export function normalizarNombre(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[«»"'`´¡!¿?.,;:()\[\]|–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Mecanismos de ayuda que reconoce 3.2.6 — y en los idiomas en los que están.
 *
 * El léxico era solo español e inglés, y eso no es un detalle de cobertura: en una
 * auditoría real de un sitio chino (la versión en chino del portal de turismo de
 * España) no se reconoció NINGÚN mecanismo de ayuda. Ahí resultó que de verdad no
 * hay ninguno —pie con «关于我们», «隐私政策», «Cookie 政策» y «网站地图», ni contacto
 * ni correo ni teléfono—, así que el veredicto era correcto por casualidad. Con un
 * «联系我们» en el pie habríamos dicho «no se ha detectado ayuda» sobre una página
 * que la tiene, y eso es la clase de afirmación que no se puede permitir.
 *
 * Van los idiomas en los que se trabaja de verdad: castellano, gallego, catalán,
 * euskera, portugués, inglés y chino (simplificado y tradicional). El chino va en
 * una alternativa SIN `\b`: en JavaScript los ideogramas no son `\w`, así que `\b`
 * detrás de «帮助» no casa nunca y toda la rama quedaría muerta sin que se note. */
const AYUDA = [
  // El orden decide: `tipoAyuda` devuelve el primero que casa, y «在线客服»
  // (chat en línea) contiene «客服» (atención al cliente), así que el chat va antes.
  { tipo: "contacto", re: /(?:(?:^|\b)(?:contacto|contactar|contacte|contato|contact|cont[aá]ctanos|kontaktua|harremanetarako)\b)|(?:联系|联络|聯絡|聯繫|連絡)/i },
  { tipo: "chat", re: /(?:(?:^|\b)(?:chat|chatbot|habla con)\b)|(?:在线客服|線上客服|聊天)/i },
  { tipo: "ayuda", re: /(?:(?:^|\b)(?:ayuda|axuda|ajuda|laguntza|help|soporte|support|asistencia|assist[eè]ncia)\b)|(?:帮助|幫助|客服|客户服务|客戶服務)/i },
  { tipo: "faq", re: /(?:(?:^|\b)(?:faq|preguntas frecuentes|preguntes freq[üu]ents|perguntas frequentes|d[uú]bidas|dudas)\b)|(?:常见问题|常見問題|问答|問答)/i },
  { tipo: "teléfono", re: /^tel:/i },
  { tipo: "correo", re: /^mailto:/i }
];
/* Un `mailto:` no es por sí solo un mecanismo de ayuda.
 *
 * Probando el esquema contra el `href` crudo, un «Compartir por correo» dentro de
 * un artículo se registraba como mecanismo de ayuda «correo». Y como solo se
 * guardaba la primera aparición de cada tipo, en la ficha ganaba la del contenido
 * y en la portada la del pie: 3.2.6 emitía un `falla` diciendo que el mecanismo
 * «cambia de sitio» en dos páginas que tienen la misma dirección de contacto en el
 * mismo pie.
 *
 * 3.2.6 habla de mecanismos de AYUDA. Un `tel:` o un `mailto:` cuentan cuando algo
 * dice que sirven para pedir ayuda: el nombre del enlace, o el hecho de estar en
 * la cabecera o el pie, que es donde se ponen los datos de contacto. Un `mailto:`
 * en medio del contenido, con un nombre que habla de compartir, es otra cosa.
 */
const COMPARTIR_RE = /(compartir|comparte|share|env[ií]a(r)? (esto|a un amigo)|tweet|whatsapp|分享)/i;
function tipoAyuda(nombre, href, region) {
  const esquema = /^(mailto:|tel:)/i.test(String(href || ""));
  if (esquema) {
    if (COMPARTIR_RE.test(nombre)) return null;
    // Un mailto: «vacío» (sin destinatario) es para que lo rellene quien comparte.
    if (/^mailto:\s*(\?|$)/i.test(String(href || ""))) return null;
    const porNombre = AYUDA.find(function (a) { return a.tipo !== "correo" && a.tipo !== "teléfono" && a.re.test(nombre); });
    if (porNombre) return porNombre.tipo;
    const enSitioDeContacto = region === "pie" || region === "cabecera";
    if (!enSitioDeContacto) return null;
    return /^tel:/i.test(href) ? "teléfono" : "correo";
  }
  /* El NOMBRE decide; el destino solo corrobora, y solo si apunta al mecanismo.
   *
   * Probando el regex contra el `href` entero, cualquier URL que llevara la
   * palabra en cualquier segmento se convertía en mecanismo de ayuda: medido,
   * `<a href="/contacto/empleo">Trabaja con nosotros</a>` quedaba registrado como
   * mecanismo de «contacto» y después 3.2.6 emitía un `falla` diciendo que ese
   * mecanismo —que no existe— cambiaba de sitio entre páginas. Una oferta de
   * empleo no es un mecanismo de ayuda por vivir bajo /contacto/.
   *
   * Ahora manda el nombre accesible, que es lo que lee quien usa la página. El
   * destino solo entra cuando el nombre no dice nada (un enlace de icono) y,
   * además, solo si la palabra está en el ÚLTIMO segmento de la ruta: `/contacto`
   * y `/es/ayuda/` sí; `/contacto/empleo` no. */
  for (const a of AYUDA) {
    if (a.tipo === "correo" || a.tipo === "teléfono") continue;
    if (a.re.test(nombre)) return a.tipo;
  }
  if (String(nombre || "").trim()) return null;   // tiene nombre y no habla de ayuda
  const ultimo = String(href || "").split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() || "";
  for (const a of AYUDA) {
    if (a.tipo === "correo" || a.tipo === "teléfono") continue;
    if (a.re.test(ultimo.replace(/[-_]+/g, " "))) return a.tipo;
  }
  return null;
}

const MAPA_RE = /(mapa (del sitio|do sitio|del lloc|web)|mapa do s[ií]tio|sitemap|[ií]ndice del sitio|网站地图|網站地圖)/i;
const INDICE_RE = /(?:(?:^|\b)(?:[ií]ndice|a-z|directorio|directori|listado alfab[eé]tico)\b)|(?:索引|目录|目錄)/i;

/* ── Huella de una página ────────────────────────────────────────────────── */

function tagOf(el) { return (el && el.tagName) ? el.tagName.toLowerCase() : ""; }
/**
 * ¿Oculto? Con `win` se usa getComputedStyle y se ve la verdad del render; sin
 * él solo se puede mirar lo declarado en el marcado.
 *
 * La diferencia importa aquí más que en otros sitios: casi todos los sitios
 * llevan un menú móvil duplicado que el CSS oculta en escritorio. Si se cuela en
 * la huella, la secuencia de navegación sale duplicada y 3.2.3 se inventa
 * cambios de orden que no existen.
 */
function ocultoEl(el, win) {
  let p = el;
  while (p && p.nodeType === 1) {
    // `inert` también saca el contenido del árbol de accesibilidad: sin él, esta
    // copia de la función y la de page-audit.js daban respuestas distintas sobre
    // el mismo elemento.
    if (p.hasAttribute("hidden") || p.hasAttribute("inert") || p.getAttribute("aria-hidden") === "true") return true;
    if (win) {
      const cs = win.getComputedStyle(p);
      if (cs.display === "none" || cs.visibility === "hidden") return true;
    } else {
      const st = (p.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
      if (st.indexOf("display:none") !== -1 || st.indexOf("visibility:hidden") !== -1) return true;
    }
    p = p.parentElement;
  }
  return false;
}
function loc(el) {
  const t = tagOf(el);
  if (el.id) return t + "#" + el.id;
  const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  return c ? t + "." + c : t;
}
/**
 * QUÉ componente es, para poder decir si dos enlaces son «el mismo» entre páginas.
 *
 * 3.2.4 compara componentes con la misma funcionalidad, y el ítem de un menú y el
 * «+ más» de una tarjeta no lo son aunque vayan al mismo sitio. Lo intenté con la
 * región (cabecera, pie, navegación, contenido) y contra el sitio real no sirvió de
 * nada: no tiene NINGÚN landmark, así que `regionDe` devolvía «otra» para todo y los
 * dos enlaces caían en el mismo grupo. Peor: el mismo menú salía «cabecera» en unas
 * páginas y «otra» en otras, y una clasificación que cambia de página en página
 * rompe también la comprobación de convivencia.
 *
 * Lo que sí es estable sin landmarks es la etiqueta y las clases: `a.menus_item` es
 * el menú y `a.moer` es la tarjeta, en todas las páginas. El `id` se deja fuera a
 * propósito: muchos sitios lo derivan del texto del enlace, y entonces cambiaría
 * justo cuando el nombre cambia, que es lo que hay que detectar.
 */
/* Las clases de ESTADO no son parte de la identidad del componente.
 *
 * Casi todos los menús marcan el ítem de la página actual con una clase, así que
 * el mismo enlace es `a.nav-link.active` en su propia página y `a.nav-link` en
 * las demás. Con esas clases dentro de la identidad, el grupo se partía en dos,
 * ninguna de las mitades llegaba a dos páginas y 3.2.4 emitía «Ningún destino se
 * repite entre las páginas de la muestra» —falso— perdiendo por el camino la
 * incoherencia real del menú. Medido con el patrón `.active`, que es universal.
 *
 * Se quitan las que marcan «este es el actual» en los vocabularios en los que se
 * escriben de verdad, incluidas las de las plantillas más usadas (`is-active`,
 * `uk-active`, `nav-item--current`…). Lo que queda es el componente.
 */
const CLASE_ESTADO = /^(?:is[-_]?|uk[-_]?|js[-_]?|has[-_]?)?(?:active|activo|activa|current|actual|selected|seleccionado|seleccionada|selecionado|aktiboa|on|here|open|abierto|expanded|hover|focus|visited|disabled|deshabilitado)$/i;
function esClaseDeEstado(c) {
  if (CLASE_ESTADO.test(c)) return true;
  // Variantes con separador de modificador: `nav-item--current`, `menu__link_active`.
  const ultimo = c.split(/--|__|-{1}|_{1}/).pop();
  return !!ultimo && ultimo !== c && CLASE_ESTADO.test(ultimo);
}
function componenteDe(el) {
  const t = tagOf(el);
  const cs = (el.getAttribute("class") || "").trim().split(/\s+/)
    .filter(Boolean).filter(function (c) { return !esClaseDeEstado(c); }).sort();
  return cs.length ? t + "." + cs.join(".") : t;
}
/**
 * Región de la página donde vive un elemento: cabecera, navegación, contenido o
 * pie. Es lo que de verdad mide 3.2.6 —dónde está la ayuda—, mucho más estable
 * que el orden entre mecanismos distintos.
 */
/* La región es la MÁS EXTERNA, no la primera que se encuentra subiendo.
 *
 * Devolviendo la primera, un `<footer><a>Contacto</a>` daba «pie» y un
 * `<footer><nav><a>Contacto</a></nav>` daba «navegación»: la misma ubicación
 * visual, dos regiones distintas, y 3.2.6 emitía un `falla` diciendo que el
 * mecanismo de ayuda «cambia de sitio entre páginas» porque una de ellas envolvía
 * los enlaces del pie en un `<nav>`. 3.2.6 habla de la ubicación relativa, no del
 * envoltorio, así que un `nav` dentro del pie sigue siendo el pie.
 *
 * Se sube hasta arriba y manda el último landmark encontrado, con una excepción:
 * `navegación` no gana nunca a `pie`, `cabecera`, `contenido` ni `lateral`, porque
 * un `nav` casi siempre vive dentro de uno de ellos y es el contenedor el que dice
 * dónde está la cosa en la pantalla.
 */
function regionDe(el) {
  let p = el, encontrada = null;
  while (p && p.nodeType === 1) {
    const t = tagOf(p), r = (p.getAttribute("role") || "").split(/\s+/)[0];
    let aqui = null;
    if (t === "footer" || r === "contentinfo") aqui = "pie";
    else if (t === "header" || r === "banner") aqui = "cabecera";
    else if (t === "nav" || r === "navigation") aqui = "navegación";
    else if (t === "main" || r === "main") aqui = "contenido";
    else if (t === "aside" || r === "complementary") aqui = "lateral";
    // El más externo manda, y «navegación» solo se queda si no hay nada mejor.
    if (aqui && (encontrada === null || aqui !== "navegación")) encontrada = aqui;
    p = p.parentElement;
  }
  return encontrada || "otra";
}
function nombreDe(el) {
  const al = el.getAttribute("aria-label");
  if (al && al.trim()) return al.trim();
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (t) return t;
  const img = el.querySelector && el.querySelector("img[alt]");
  if (img) { const a = (img.getAttribute("alt") || "").trim(); if (a) return a; }
  const ti = el.getAttribute("title");
  return ti ? ti.trim() : "";
}

/**
 * Huella comparable de una página: sus enlaces de navegación en orden, los
 * mecanismos de ayuda y las vías de localización.
 *
 * @param {Document} doc  documento ya renderizado (post-JS)
 * @param {string} [url]  URL de la página, para resolver los enlaces relativos
 * @param {Window} [win]  ventana real, para descartar lo oculto por CSS
 */
export function fingerprintPage(doc, url, win) {
  const visibles = function (sel) {
    return Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(function (el) { return !ocultoEl(el, win); });
  };

  // Navegación: los enlaces dentro de landmarks de navegación, EN ORDEN de DOM.
  const navs = [];
  visibles("nav,[role=navigation]").forEach(function (nav) {
    const items = [];
    Array.prototype.slice.call(nav.querySelectorAll("a[href]")).forEach(function (a) {
      if (ocultoEl(a, win)) return;
      const href = normalizarHref(a.getAttribute("href"), url);
      if (!href) return;
      items.push({ href: href, name: nombreDe(a), locator: loc(a) });
    });
    if (items.length) navs.push({
      locator: loc(nav),
      label: nombreDe(nav) || (nav.getAttribute("aria-label") || ""),
      /* La etiqueta EXPLÍCITA, aparte: es la que sirve para emparejar un `nav`
       * con el suyo en otra página. `label` cae al texto del propio `nav` cuando
       * no hay `aria-label`, y ese texto son los enlaces concatenados: usarlo
       * como clave hace que unas migas de pan no se emparejen nunca con otras,
       * porque su contenido cambia en cada página. */
      etiqueta: (nav.getAttribute("aria-label") || "").trim() ||
        (function () {
          const id = nav.getAttribute("aria-labelledby");
          if (!id) return "";
          const r = doc.getElementById(id.split(/\s+/)[0]);
          return r ? (r.textContent || "").replace(/\s+/g, " ").trim() : "";
        })(),
      items: items
    });
  });

  // Todos los enlaces de la página, en orden: identidad para 3.2.4 y 3.2.6.
  const enlaces = [];
  visibles("a[href]").forEach(function (a, i) {
    const raw = a.getAttribute("href");
    const href = normalizarHref(raw, url);
    if (!href) return;
    enlaces.push({ href: href, raw: raw, name: nombreDe(a), locator: loc(a), comp: componenteDe(a), region: regionDe(a), orden: enlaces.length });
  });

  /* Ayuda: mecanismos reconocibles, TODAS sus apariciones por región.
   *
   * Se guardaba solo la PRIMERA aparición de cada tipo, en orden de DOM, con su
   * región. Medido: una página con «Contacto» en la cabecera y también en el pie
   * registraba «cabecera», y otra que solo lo tiene en el pie registraba «pie»;
   * 3.2.6 emitía entonces un `falla` diciendo que el mecanismo cambia de sitio,
   * cuando el del pie está en el mismo sitio en las dos. Lo que hace falta para
   * comparar no es dónde aparece primero, sino en qué sitios aparece. */
  const ayuda = [];
  enlaces.forEach(function (e) {
    const t = tipoAyuda(e.name, e.raw, e.region);
    if (!t) return;
    const r = e.region || "otra";
    if (ayuda.some(function (x) { return x.tipo === t && x.region === r; })) return;
    ayuda.push({ tipo: t, name: e.name, href: e.href, locator: e.locator, region: r, orden: e.orden });
  });

  // Vías de localización (2.4.5).
  // OJO: visible, como el resto de la huella. Sin el filtro, un buscador dentro
  // de un menú móvil con `display:none` contaba como vía de localización y
  // empujaba 2.4.5 a «cumple» con algo que el usuario no puede usar.
  /* Un buscador es un CAMPO donde escribir, no una etiqueta que lo anuncie.
   *
   * Bastaba un `[role=search]` vacío, o un `<form>` sin un solo control cuyo
   * `action` o `class` llevara la palabra «buscar», para que 2.4.5 contara una
   * vía de localización. Medido: `<div role="search"></div>` más un menú de tres
   * enlaces daba «El sitio ofrece 2 vías… buscador». Ahora el contenedor tiene
   * que tener dentro algo donde se pueda escribir y visible, que es lo que hace
   * falta para localizar una página. */
  const conCampo = function (el) {
    if (!el || ocultoEl(el, win)) return false;
    const campos = el.querySelectorAll ? el.querySelectorAll("input:not([type=hidden]),textarea,select,[contenteditable=true],[role=searchbox],[role=combobox]") : [];
    return Array.prototype.slice.call(campos).some(function (c) { return !ocultoEl(c, win); });
  };
  const buscador =
    Array.prototype.slice.call(doc.querySelectorAll("input[type=search]")).some(function (el) { return !ocultoEl(el, win); }) ||
    Array.prototype.slice.call(doc.querySelectorAll("[role=search]")).some(conCampo) ||
    Array.prototype.slice.call(doc.querySelectorAll("form")).some(function (f) {
      if (!conCampo(f)) return false;
      return /buscar|buscador|search|busqueda|búsqueda|procura|bilatu|搜索|搜寻|搜尋|查询|查詢/i.test((f.getAttribute("action") || "") + " " + (f.id || "") + " " + (f.className || "") + " " + (f.getAttribute("role") || ""));
    });
  /* `sitemap.xml` es para las máquinas, no una vía para localizar una página.
   * Contaba como mapa web porque `MAPA_RE` casa con «sitemap» en el `href`. */
  const mapaWeb = enlaces.some(function (e) {
    if (/sitemap[^/]*\.xml(\?|#|$)/i.test(e.href || "")) return false;
    return MAPA_RE.test(e.name) || MAPA_RE.test(e.href);
  });
  /* Un «Índice» que apunta a un ancla DE LA MISMA PÁGINA es el sumario del
   * artículo, no un índice del sitio: no sirve para localizar otra página. */
  const indice = enlaces.some(function (e) {
    // Un ancla de la MISMA página no sirve para localizar otra página.
    if (/^#/.test(String(e.raw || "").trim())) return false;
    return INDICE_RE.test(e.name);
  });
  const navegacion = navs.some(function (n) { return n.items.length >= 3; });

  return {
    url: url || null,
    navs: navs,
    enlaces: enlaces,
    ayuda: ayuda,
    vias: { buscador: buscador, mapaWeb: mapaWeb, indice: indice, navegacion: navegacion }
  };
}

/* ── Comparación ─────────────────────────────────────────────────────────── */

/**
 * ¿Conservan las dos secuencias el mismo orden relativo en lo que comparten?
 * Devuelve `null` si sí, o la primera pareja invertida si no.
 */
export function ordenRelativo(a, b) {
  const setB = new Set(b);
  const comunes = a.filter(function (x) { return setB.has(x); });
  const posB = {};
  b.forEach(function (x, i) { if (posB[x] == null) posB[x] = i; });
  for (let i = 1; i < comunes.length; i++) {
    if (posB[comunes[i]] < posB[comunes[i - 1]]) {
      return { antes: comunes[i - 1], despues: comunes[i] };
    }
  }
  return null;
}

// Secuencia de destinos de navegación de una huella (todas sus navs concatenadas).
function seqNav(h) {
  const out = [];
  (h.navs || []).forEach(function (n) {
    n.items.forEach(function (it) { if (out.indexOf(it.href) === -1) out.push(it.href); });
  });
  return out;
}

/* Cada navegación se compara CON LA SUYA, no todas revueltas en una.
 *
 * `seqNav` concatena todos los `nav` de la página en una sola secuencia, y eso
 * convierte el patrón más común de la web en una barrera inventada: unas migas
 * de pan repiten destinos del menú en otro orden («Inicio → Servicios» frente a
 * «Inicio → Blog → Servicios»), así que 3.2.3 emitía un `falla` diciendo que el
 * orden de la navegación cambia en una página donde el menú no se ha movido un
 * píxel. Medido con un menú idéntico en las dos páginas.
 *
 * 3.2.3 habla de los mecanismos de navegación que SE REPITEN: el menú con el
 * menú, las migas con las migas. La clave de emparejamiento es la etiqueta
 * accesible del `nav` —que es justo lo que distingue «Principal» de «Migas de
 * pan»— y, si no la tiene, su locator, que en una plantilla es estable. */
function claveNav(n) {
  const et = String((n && n.etiqueta) || "").replace(/\s+/g, " ").trim().toLowerCase();
  return et || String((n && n.locator) || "nav");
}
function navsPorClave(h) {
  const m = {};
  (h.navs || []).forEach(function (n) {
    const k = claveNav(n);
    // Dos navs con la misma clave en una página: se concatenan, que es lo que
    // hacía antes para TODOS, y aquí sí es lo correcto.
    if (!m[k]) m[k] = [];
    n.items.forEach(function (it) { if (m[k].indexOf(it.href) === -1) m[k].push(it.href); });
  });
  return m;
}

/** 3.2.3 Navegación coherente. */
export function analyzeNavConsistency(huellas) {
  const conNav = (huellas || []).filter(function (h) { return seqNav(h).length >= 2; });
  if (conNav.length < 2) {
    return [F("3.2.3", "revisar", null, [
      "Hace falta más de una página con navegación repetida para comprobar el orden relativo; en esta muestra hay " + conNav.length + "."
    ])];
  }
  // Para la evidencia manda el NOMBRE del enlace, no el destino normalizado: es
  // lo que ve una persona auditora en la pantalla.
  const nombres = {};
  conNav.forEach(function (h) {
    (h.navs || []).forEach(function (n) {
      n.items.forEach(function (it) { if (!nombres[it.href] && it.name) nombres[it.href] = it.name; });
    });
  });
  const etiqueta = function (href) { return nombres[href] ? "«" + nombres[href] + "»" : href; };

  /* TODOS los pares, no cada página contra la primera.
   *
   * Comparando solo contra `conNav[0]`, un destino que cambia de sitio entre la
   * página 2 y la 3 pero que no aparece en la 1 no se compara con nada: la
   * inversión pasa desapercibida y el criterio sale `cumple` afirmando «mantiene
   * el mismo orden relativo en las N páginas». Comprobado con tres páginas donde
   * «Blog» va antes de «Servicios» en una y después en otra, y ninguna de las dos
   * cosas se ve desde la primera, que no tiene Blog.
   *
   * 3.2.3 habla del orden relativo entre páginas, sin página privilegiada, así que
   * se comparan todos los pares. Con muestras de quince páginas son ciento cinco
   * comparaciones de listas cortas: nada. */
  const base = conNav[0], seqBase = seqNav(base);
  const porPagina = conNav.map(function (h) { return { h: h, navs: navsPorClave(h) }; });
  const problemas = [];
  const vistos = {};
  const comparadas = {};     // qué navegaciones se han llegado a comparar
  for (let i = 0; i < porPagina.length; i++) {
    for (let j = i + 1; j < porPagina.length; j++) {
      const A = porPagina[i], B = porPagina[j];
      Object.keys(A.navs).forEach(function (k) {
        if (!B.navs[k]) return;                       // esa navegación no está en la otra página
        comparadas[k] = 1;
        const inv = ordenRelativo(A.navs[k], B.navs[k]);
        if (!inv) return;
        // Una misma inversión aparece en varios pares: se cuenta una vez, y con
        // las dos páginas que la demuestran.
        const clave = k + "|" + inv.antes + "|" + inv.despues;
        if (vistos[clave]) return;
        vistos[clave] = 1;
        problemas.push({ nav: k, pagina: B.h.url, contra: A.h.url, inv: inv });
      });
    }
  }
  if (problemas.length) {
    return [F("3.2.3", "falla", "moderada", problemas.slice(0, 5).map(function (p) {
      return "En " + (p.pagina || "(página)") + ", dentro de la navegación «" + p.nav + "», el orden cambia: " + etiqueta(p.inv.despues) +
        " aparece antes que " + etiqueta(p.inv.antes) + ", al revés que en " + (p.contra || base.url || "otra página de la muestra") + ".";
    }), problemas.slice(0, 8).map(function (p) { return { locator: p.pagina || "(página)", name: "orden alterado en «" + p.nav + "»" }; }))];
  }
  /* Y si no se ha podido emparejar NINGUNA navegación entre páginas, no hay nada
   * comparado: decirlo, en vez de firmar «mantiene el mismo orden relativo». */
  const nComparadas = Object.keys(comparadas).length;
  if (!nComparadas) {
    return [F("3.2.3", "revisar", null, [
      "Ninguna navegación se repite entre las " + conNav.length + " páginas de la muestra con la misma etiqueta o el mismo selector, así que no se ha podido comparar ningún orden. " +
      "Puede ser que cada plantilla monte su menú de otra manera: compruébalo a mano."
    ])];
  }
  return [F("3.2.3", "cumple", null, [
    "Las " + nComparadas + " navegación(es) que se repiten entre páginas (" + Object.keys(comparadas).slice(0, 4).join(", ") +
    ") mantienen el mismo orden relativo en las " + conNav.length + " páginas de la muestra que las tienen (" +
    seqBase.slice(0, 8).map(etiqueta).join(" → ") + (seqBase.length > 8 ? " → …" : "") + ")."
  ])];
}

/**
 * 3.2.4 Identificación coherente: el mismo destino, el mismo nombre.
 *
 * Distingue dos grados, porque no son lo mismo: un nombre que CONTIENE al otro
 * («Inicio» / «Ir a inicio») es una inconsistencia menor a revisar; dos nombres
 * sin nada en común para el mismo destino sí es una falla.
 */
export function analyzeIdConsistency(huellas) {
  /* Se agrupa por destino Y POR REGIÓN, y no solo por destino.
   *
   * 3.2.4 habla de componentes con la MISMA funcionalidad. Comparando solo por
   * destino, el patrón más común de la web entera salía como falla: el menú de
   * cabecera llama a una página por su nombre y una tarjeta del contenido la enlaza
   * con un «+ más» / «Leer más» / «Ver todo». Son dos componentes distintos que van
   * al mismo sitio, no un componente identificado de dos maneras. Medido contra un
   * sitio real: 7 destinos acusados, todos del mismo par —el nombre del menú y el
   * «+ 更多» de una tarjeta—, y el informe hecho a mano no señalaba ninguno.
   *
   * Un enlace de la cabecera, uno del pie y uno del contenido no son el mismo
   * componente, así que no se comparan entre sí. Dentro de una misma región sí:
   * un ítem del menú que se llama distinto en otra página es exactamente lo que el
   * criterio prohíbe, y eso se sigue cazando. */
  const porHref = {};
  const clave = function (href, comp) { return href + " \u0000 " + (comp || "(sin componente)"); };
  const regionesPorHref = {};
  (huellas || []).forEach(function (h) {
    (h.enlaces || []).forEach(function (e) {
      const nom = normalizarNombre(e.name);
      if (!nom) return;
      const k = clave(e.href, e.comp || e.locator);
      if (!porHref[k]) porHref[k] = { href: e.href, region: e.region, comp: e.comp || e.locator, nombres: {}, locator: e.locator };
      if (!porHref[k].nombres[nom]) porHref[k].nombres[nom] = { crudo: e.name, paginas: [], regiones: [] };
      const p = porHref[k].nombres[nom].paginas;
      if (p.indexOf(h.url) === -1) p.push(h.url);
      // La región DE CADA NOMBRE, no solo la del primer enlace del grupo: es lo
      // que separa el ítem del menú de la tarjeta del contenido cuando la página
      // tiene landmarks. Sin landmarks todos caen en «otra» y no distingue nada,
      // que es por lo que no puede ser parte de la clave del grupo.
      const rs = porHref[k].nombres[nom].regiones;
      if (rs.indexOf(e.region || "otra") === -1) rs.push(e.region || "otra");
      // Para poder decir, sin acusar, que un destino se nombra distinto según
      // desde dónde se enlace: es normal, pero conviene saberlo.
      if (!regionesPorHref[e.href]) regionesPorHref[e.href] = {};
      regionesPorHref[e.href][(e.comp || e.locator) + "\u0000" + nom] = e.name;
    });
  });

  const fallas = [], revisiones = [];
  // Solo cuentan los destinos que aparecen en DOS O MÁS páginas. 3.2.4 es un
  // criterio de conjunto: comparar un destino visto en una sola página no
  // comprueba nada, y contarlo como «coherente» declaraba conforme algo que
  // nadie había comparado. Dos anclas distintas de la misma página («/faq#envíos»
  // y «/faq#pagos») tampoco son el mismo destino visto dos veces.
  const comunes = Object.keys(porHref).filter(function (href) {
    const paginas = {};
    Object.keys(porHref[href].nombres).forEach(function (n) {
      porHref[href].nombres[n].paginas.forEach(function (u) { paginas[u] = true; });
    });
    return Object.keys(paginas).length >= 2;
  });
  /* La convivencia es de un PAR de nombres, no del grupo entero.
   *
   * Preguntando «¿conviven dos cualesquiera de estos nombres en alguna página?»
   * y descartando el grupo completo cuando la respuesta es sí, un tercer nombre
   * entierra una incoherencia real. Medido: un destino que el menú llama
   * «Servicios» en una página y «Nuestros servicios» en otra se detecta
   * correctamente… hasta que una de esas páginas añade una tarjeta «Leer más» al
   * mismo destino. «Leer más» convive con «Nuestros servicios», el grupo entero
   * se descartaba, y el criterio pasaba de `revisar` a `cumple`. Añadir una
   * tarjeta no arregla un menú incoherente.
   *
   * Así que se comparan los PARES: el par que convive en alguna página son dos
   * componentes distintos y no se compara; el par que nunca convive sí. */
  const sinComparar = [];
  const comparados = [];
  comunes.forEach(function (k) {
    const g = porHref[k];
    const noms = Object.keys(g.nombres);
    if (noms.length < 2) { comparados.push(k); return; }   // un solo nombre: coherente
    const conviven = function (a, b) {
      return g.nombres[a].paginas.some(function (u) { return g.nombres[b].paginas.indexOf(u) !== -1; });
    };
    /* Convivir acredita que ese nombre es de OTRO componente, así que sale del
     * grupo — no solo de ese par.
     *
     * Con los pares a secas, el nombre de la tarjeta («Leer más») convive con el
     * del menú en la página donde están los dos, pero NO con el nombre que el
     * menú tiene en la otra página, así que esa pareja se comparaba y el
     * criterio acusaba al par menú-contra-tarjeta: dos componentes distintos,
     * que es justo lo que este bloque existe para no hacer. Quitando del grupo
     * el nombre que convive, queda el componente que se repite entre páginas —el
     * menú— y se compara consigo mismo, que es lo que pide el criterio.
     *
     * Cuando dos nombres conviven, el que se va es el que aparece en MENOS
     * páginas: el menú está en todas, la tarjeta en unas pocas. Si empatan no se
     * puede decidir cuál es el componente que se repite, y el grupo se queda sin
     * comparar en vez de acusar a ciegas. */
    const nPaginas = function (n) { return g.nombres[n].paginas.length; };
    const regionesDeNombre = function (n) { return g.nombres[n].regiones || ["otra"]; };

    /* Primero la REGIÓN, que es el dato bueno cuando existe.
     *
     * Si los nombres de este destino se reparten por regiones —el menú en
     * «navegación», la tarjeta en «contenido»— entonces están separados por algo
     * objetivo y se comparan solo entre los de la misma región: el menú consigo
     * mismo. Eso resuelve el caso que la convivencia no sabe resolver, porque
     * con dos páginas el menú y la tarjeta empatan a una página cada uno. */
    let vivos = null;
    const porRegion = {};
    noms.forEach(function (n) {
      regionesDeNombre(n).forEach(function (r) { (porRegion[r] = porRegion[r] || []).push(n); });
    });
    const regionesUtiles = Object.keys(porRegion).filter(function (r) { return r !== "otra" && porRegion[r].length >= 2; });
    if (Object.keys(porRegion).filter(function (r) { return r !== "otra"; }).length > 1 && regionesUtiles.length) {
      // Hay señal de región Y alguna región con dos nombres que comparar.
      vivos = porRegion[regionesUtiles[0]];
    }

    /* Y si la región no separa nada (un sitio sin landmarks: todo «otra»), queda
     * la convivencia: un nombre que se ve en la MISMA página que otro es de otro
     * componente, así que sale del grupo. El que se va es el que aparece en menos
     * páginas —el menú está en todas, la tarjeta en unas pocas—; si empatan, no se
     * puede decidir y el grupo se queda sin comparar en vez de acusar a ciegas. */
    let empate = false;
    if (!vivos) {
      vivos = noms.slice();
      for (;;) {
        let par = null;
        for (let i = 0; i < vivos.length && !par; i++) {
          for (let j = i + 1; j < vivos.length && !par; j++) {
            if (conviven(vivos[i], vivos[j])) par = [vivos[i], vivos[j]];
          }
        }
        if (!par) break;
        if (nPaginas(par[0]) === nPaginas(par[1])) { empate = true; break; }
        const fuera = nPaginas(par[0]) < nPaginas(par[1]) ? par[0] : par[1];
        vivos = vivos.filter(function (n) { return n !== fuera; });
      }
    }
    if (empate || vivos.length < 2) { sinComparar.push(g.href); return; }
    const pares = [];
    for (let i = 0; i < vivos.length; i++) {
      for (let j = i + 1; j < vivos.length; j++) pares.push([vivos[i], vivos[j]]);
    }
    if (!pares.length) { sinComparar.push(g.href); return; }
    comparados.push(k);
    // Un par «anidado» (uno contiene al otro) es matiz; uno sin nada en común,
    // contradicción. El grupo se clasifica por el par PEOR que se haya comparado.
    const contradice = pares.filter(function (par) {
      return par[1].indexOf(par[0]) === -1 && par[0].indexOf(par[1]) === -1;
    });
    const usados = (contradice.length ? contradice : pares)[0];
    const donde = " (" + g.comp + (g.region && g.region !== "otra" ? ", en " + g.region : "") + ")";
    const detalle = g.href + donde + " → " + usados.map(function (n) { return "«" + g.nombres[n].crudo + "»"; }).join(" / ");
    (contradice.length ? fallas : revisiones).push({ href: g.href, detalle: detalle, locator: g.locator });
  });

  /* Un destino nombrado distinto SEGÚN DESDE DÓNDE se enlace no es una falla de
   * 3.2.4 —son componentes distintos— pero sí es algo que conviene saber, así que se
   * dice sin acusar y sin cambiar el veredicto. */
  const porRegiones = Object.keys(regionesPorHref).filter(function (href) {
    const claves = Object.keys(regionesPorHref[href]);
    if (claves.length < 2) return false;
    const regs = {}, noms = {};
    claves.forEach(function (c) { const p = c.split("\u0000"); regs[p[0]] = true; noms[p[1]] = true; });
    return Object.keys(regs).length >= 2 && Object.keys(noms).length >= 2;
  });

  const out = [];
  if (fallas.length) {
    out.push(F("3.2.4", "falla", "moderada",
      [fallas.length + " destino(s) se identifican con nombres distintos en páginas distintas: " + fallas.slice(0, 5).map(function (f) { return f.detalle; }).join(" · ")],
      fallas.slice(0, 8).map(function (f) { return { locator: f.locator, name: f.href }; })));
  }
  if (revisiones.length) {
    out.push(F("3.2.4", "revisar", null,
      [revisiones.length + " destino(s) usan variantes del mismo nombre (uno contiene al otro): " + revisiones.slice(0, 5).map(function (r) { return r.detalle; }).join(" · ") + ". Comprueba si la diferencia desorienta."],
      revisiones.slice(0, 8).map(function (r) { return { locator: r.locator, name: r.href }; })));
  }
  const nota = porRegiones.length
    ? " " + porRegiones.length + " destino(s) se nombran distinto según desde dónde se enlacen (menú, pie o contenido): son componentes distintos, no una identificación incoherente, pero ahí están: " +
      porRegiones.slice(0, 3).join(", ") + "."
    : "";
  /* La cuenta de la conformidad es la de lo COMPARADO, no la de lo visto.
   *
   * Decía «Los N destino(s) … se identifican siempre con el mismo nombre» con N =
   * todos los destinos repetidos, incluidos los que se habían descartado por
   * convivencia sin comparar nada. Ahora la frase cuenta los comparados y, si ha
   * quedado alguno fuera, lo dice. */
  const colaSinComparar = sinComparar.length
    ? " Otros " + sinComparar.length + " destino(s) no se han comparado: sus nombres conviven en una misma página, así que son componentes distintos que van al mismo sitio (" +
      sinComparar.slice(0, 3).join(", ") + ")."
    : "";
  if (!out.length) {
    out.push(comparados.length
      ? F("3.2.4", "cumple", null, ["Los " + comparados.length + " destino(s) que aparecen en dos o más páginas de la muestra, dentro de una misma región, se identifican siempre con el mismo nombre." + colaSinComparar + nota])
      : F("3.2.4", "revisar", null, [(comunes.length
          ? "Ninguno de los " + comunes.length + " destino(s) repetidos entre páginas se ha podido comparar: en todos ellos los nombres conviven en una misma página, así que son componentes distintos. La coherencia de identificación NO se ha comprobado."
          : "Ningún destino se repite entre las páginas de la muestra (" + (huellas || []).length + " página(s)): no hay nada que comparar, así que la coherencia de identificación NO se ha comprobado.") + nota]));
  }
  return out;
}

/**
 * 3.2.6 Ayuda coherente (WCAG 2.2, nivel A).
 *
 * El criterio habla de DÓNDE está la ayuda, no de en qué orden aparecen unos
 * mecanismos respecto de otros. Comparar el orden entre tipos distintos era
 * ruidoso: un «Contacto» en el menú y una «Ayuda» en el pie cambian de orden
 * relativo en cuanto una página mete un enlace contextual, sin que nada se haya
 * movido de sitio. Lo que sí es una incoherencia real es que el MISMO mecanismo
 * viva en la cabecera en una página y en el pie en otra.
 */
export function analyzeHelpConsistency(huellas) {
  const conAyuda = (huellas || []).filter(function (h) { return (h.ayuda || []).length; });
  if (!conAyuda.length) {
    // «No lo he encontrado» no es «no existe». La detección son unos cuantos
    // patrones sobre los enlaces visibles: un «Atención al cliente», un
    // <button>Asistencia</button> o un chat en un ancla interna se le escapan.
    // Declararlo conforme era dar por comprobado lo que no se miró.
    return [F("3.2.6", "revisar", null, [
      "No se han detectado mecanismos de ayuda con los patrones conocidos (contacto, ayuda, FAQ, soporte, chat) en las " +
      (huellas || []).length + " página(s) de la muestra. Confirma a mano que de verdad no los hay: si no existe ninguno, el criterio no aplica; si existe alguno que no se reconoció, hay que comprobar que está siempre en el mismo sitio."
    ])];
  }
  if (conAyuda.length < 2) {
    return [F("3.2.6", "revisar", null, ["Solo una página de la muestra ofrece ayuda (" + conAyuda[0].ayuda.map(function (a) { return a.tipo; }).join(", ") + "): hace falta más de una para comparar."])];
  }

  // Dónde aparece cada tipo de ayuda, página a página.
  const porTipo = {};
  conAyuda.forEach(function (h) {
    h.ayuda.forEach(function (a) {
      if (!porTipo[a.tipo]) porTipo[a.tipo] = {};
      const r = a.region || "otra";
      if (!porTipo[a.tipo][r]) porTipo[a.tipo][r] = [];
      if (porTipo[a.tipo][r].indexOf(h.url) === -1) porTipo[a.tipo][r].push(h.url);
    });
  });

  /* «Cambia de sitio» es que NO HAYA NINGÚN sitio común, no que haya varios.
   *
   * La comprobación era «¿aparece este tipo en más de una región?» y eso acusa a
   * dos marcados correctos: una página con el mecanismo en la cabecera Y en el
   * pie frente a otra que solo lo tiene en el pie (el del pie no se ha movido), y
   * cualquier sitio cuyas plantillas difieran en el envoltorio. Lo que de verdad
   * contradice 3.2.6 es que no quede un sitio donde el mecanismo esté en TODAS
   * las páginas que lo ofrecen. */
  const regionesDe = function (h, t) {
    return (h.ayuda || []).filter(function (a) { return a.tipo === t; }).map(function (a) { return a.region || "otra"; });
  };
  /* Y hay regiones que el marcado NO resuelve: un `<nav>` suelto, sin landmark
   * que lo envuelva, puede estar pintado arriba, abajo o en un lateral, y «otra»
   * es literalmente «no se sabe». Comparar esas con una región concreta no
   * decide nada, así que el criterio queda a revisión en vez de acusar. */
  const AMBIGUAS = { "navegación": 1, otra: 1 };
  const movidos = [], dudosos = [];
  Object.keys(porTipo).forEach(function (t) {
    const paginas = conAyuda.filter(function (h) { return regionesDe(h, t).length; });
    if (paginas.length < 2) return;
    let comun = null;
    paginas.forEach(function (h) {
      const rs = regionesDe(h, t);
      comun = comun === null ? rs.slice() : comun.filter(function (r) { return rs.indexOf(r) !== -1; });
    });
    if (comun.length) return;                               // hay un sitio común: no se ha movido
    const hayAmbigua = paginas.some(function (h) { return regionesDe(h, t).some(function (r) { return AMBIGUAS[r]; }); });
    (hayAmbigua ? dudosos : movidos).push({ tipo: t, paginas: paginas });
  });
  const dondeEsta = function (x) {
    return x.paginas.slice(0, 3).map(function (h) { return regionesDe(h, x.tipo).join("+") + " en " + (h.url || "(página)"); }).join(" · ");
  };
  if (movidos.length) {
    return [F("3.2.6", "falla", "moderada", movidos.slice(0, 4).map(function (x) {
      return "El mecanismo de ayuda «" + x.tipo + "» no aparece en ningún sitio común a todas las páginas que lo ofrecen: " + dondeEsta(x) + ".";
    }))];
  }
  if (dudosos.length) {
    return [F("3.2.6", "revisar", null, dudosos.slice(0, 4).map(function (x) {
      return "El mecanismo de ayuda «" + x.tipo + "» no coincide de región entre páginas (" + dondeEsta(x) +
        "), pero al menos una de esas regiones no la resuelve el marcado —un <code>&lt;nav&gt;</code> sin landmark que lo envuelva, o contenido sin región— así que no se puede decidir desde aquí si está en el mismo sitio. Míralo en pantalla.";
    }))];
  }

  // Mismo sitio. Dentro de una misma región, el orden relativo sí debe mantenerse.
  const seqEnRegion = function (h, region) {
    return h.ayuda.filter(function (a) { return (a.region || "otra") === region; }).map(function (a) { return a.tipo; });
  };
  const regiones = {};
  conAyuda.forEach(function (h) { h.ayuda.forEach(function (a) { regiones[a.region || "otra"] = 1; }); });
  const desordenes = [];
  Object.keys(regiones).forEach(function (r) {
    const base = conAyuda.find(function (h) { return seqEnRegion(h, r).length >= 2; });
    if (!base) return;
    conAyuda.forEach(function (h) {
      if (h === base) return;
      const inv = ordenRelativo(seqEnRegion(base, r), seqEnRegion(h, r));
      if (inv) desordenes.push({ region: r, pagina: h.url, inv: inv });
    });
  });
  if (desordenes.length) {
    return [F("3.2.6", "falla", "moderada", desordenes.slice(0, 4).map(function (d) {
      return "En " + (d.pagina || "(página)") + ", dentro de «" + d.region + "», la ayuda cambia de orden: «" + d.inv.despues + "» antes que «" + d.inv.antes + "».";
    }))];
  }

  const tipos = Object.keys(porTipo);
  // El sitio COMÚN, no el primero que se vio: con el mecanismo en la cabecera y
  // en el pie, nombrar solo «cabecera» describe mal lo que se ha comprobado.
  const comunDe = function (t) {
    const paginas = conAyuda.filter(function (h) { return regionesDe(h, t).length; });
    let c = null;
    paginas.forEach(function (h) {
      const rs = regionesDe(h, t);
      c = c === null ? rs.slice() : c.filter(function (r) { return rs.indexOf(r) !== -1; });
    });
    return (c && c.length) ? c.join(" y ") : (Object.keys(porTipo[t])[0] || "otra");
  };
  const ev = ["Los mecanismos de ayuda (" + tipos.join(", ") + ") aparecen siempre en la misma parte de la página (" +
    tipos.map(function (t) { return t + " → " + comunDe(t); }).join(", ") + ") en las " + conAyuda.length + " páginas que los ofrecen."];
  const faltan = (huellas || []).filter(function (h) { return !(h.ayuda || []).length; });
  if (faltan.length) ev.push(faltan.length + " página(s) de la muestra no ofrecen ninguno; el criterio no les aplica, pero comprueba que sea intencionado.");
  return [F("3.2.6", "cumple-parcial", null, ev)];
}

/**
 * 2.4.5 Múltiples vías: es un criterio de SITIO, no de página. Se mira la unión
 * de mecanismos en toda la muestra.
 */
export function analyzeMultipleWays(huellas) {
  const hs = huellas || [];
  if (!hs.length) return [];
  const union = { buscador: false, mapaWeb: false, indice: false, navegacion: false };
  hs.forEach(function (h) { Object.keys(union).forEach(function (k) { if (h.vias && h.vias[k]) union[k] = true; }); });
  const ETQ = { buscador: "buscador", mapaWeb: "mapa web", indice: "índice o directorio", navegacion: "navegación del sitio" };
  const hay = Object.keys(union).filter(function (k) { return union[k]; });
  if (hay.length >= 2) {
    /* `cumple-parcial`, no `cumple`: lo detectado es la PRESENCIA de las vías,
     * no que funcionen.
     *
     * Las cuatro señales son marcado: un campo de búsqueda visible, un enlace
     * cuyo nombre o destino habla de mapa del sitio, otro que habla de índice, y
     * una navegación con tres enlaces o más. Que el buscador devuelva resultados
     * útiles, que el mapa esté completo, o que ese menú de tres ítems lleve de
     * verdad a todas las páginas —que es lo que piden las técnicas G126 y G185—
     * no se ve en el marcado y no se ha comprobado. Firmar «el sitio ofrece dos
     * vías» sobre eso era declarar conforme un mecanismo que nadie ha usado. */
    return [F("2.4.5", "cumple-parcial", null, [
      "Se detectan " + hay.length + " vías para localizar una página: " + hay.map(function (k) { return ETQ[k]; }).join(", ") + ". " +
      "Eso es la presencia de los mecanismos en el marcado, que es la parte automatizable; que funcionen —que el buscador encuentre, que el mapa esté completo, que la navegación lleve a todas las páginas (G126/G185)— hay que usarlos para saberlo. Pruébalos y firma el criterio."
    ])];
  }
  // Encontrar DOS vías en una sola página sí demuestra que el sitio las ofrece.
  // No encontrarlas, en cambio, no demuestra nada si solo se ha mirado una
  // página: el mapa web puede estar en el pie de otra. Un criterio de sitio no
  // se falla desde una página suelta.
  if (hs.length < 2) {
    return [F("2.4.5", "revisar", null, [
      "Solo hay " + hs.length + " página en la muestra y se detecta" + (hay.length ? "n " + hay.length + " vía(s): " + hay.map(function (k) { return ETQ[k]; }).join(", ") : " ninguna vía") +
      ". 2.4.5 es un criterio de SITIO: añade más páginas a la muestra antes de dictaminar."
    ])];
  }
  if (hay.length === 1) {
    return [F("2.4.5", "revisar", null, [
      "Solo se detecta una vía para localizar páginas (" + ETQ[hay[0]] + "). WCAG exige al menos dos, salvo que la página sea un paso de un proceso — eso no lo puede determinar el agente."
    ])];
  }
  return [F("2.4.5", "falla", "moderada", ["No se detecta ninguna vía para localizar páginas: ni buscador, ni mapa web, ni índice, ni una navegación con varios enlaces."])];
}

/** Los cuatro criterios de coherencia sobre la muestra. */
export function analyzeCoherence(huellas) {
  /* Sin huellas no se devuelve una lista VACÍA: se dice que no se ha comparado.
   *
   * Era `return []`, y ese es el camino real cuando la capa de la huella se cae
   * en todas las páginas o está apagada: los cuatro criterios de sitio —2.4.5,
   * 3.2.3, 3.2.4 y 3.2.6— desaparecían del informe sin una palabra. El export
   * OAW los rescata como «No evaluado» porque pide todos los criterios, pero
   * cualquier otro consumidor (la CLI, la extensión, el rollup de la muestra) no
   * veía nada, y un criterio que no aparece se lee igual que uno conforme. */
  if (!huellas || !huellas.length) {
    const porque = "No se ha podido tomar la huella de ninguna página de la muestra, así que los criterios de SITIO no se han comparado: " +
      "no es que el sitio sea coherente, es que no se ha mirado. Comprueba los errores de la capa de huella y vuelve a ejecutar.";
    return ["2.4.5", "3.2.3", "3.2.4", "3.2.6"].map(function (n) { return F(n, "revisar", null, [porque]); });
  }
  return [].concat(
    analyzeMultipleWays(huellas),
    analyzeNavConsistency(huellas),
    analyzeIdConsistency(huellas),
    analyzeHelpConsistency(huellas)
  );
}

/* ── Código inyectable: la huella se toma DENTRO de la página real ───────── */

/* Las constantes del módulo viajan a la página, y van en UNA lista.
 *
 * `COMPARTIR_RE` no viajaba. `tipoAyuda` la usa en la primera línea de la rama de
 * `mailto:`/`tel:`, así que la huella lanzaba `ReferenceError` en cuanto la página
 * tenía un correo o un teléfono enlazado — es decir, en el pie de casi cualquier
 * sitio español. El error se recogía en `errores` y la huella quedaba en `null`, y
 * sin huellas la comparación entre páginas no compara nada: 2.4.5, 3.2.3, 3.2.4 y
 * 3.2.6 desaparecían del informe sin que nadie lo dijera. Comprobado en Chromium:
 * «ReferenceError: COMPARTIR_RE is not defined».
 *
 * Que estuviera escrito a mano era el problema, así que ahora es una lista con
 * nombre, y hay un test que extrae los identificadores en MAYÚSCULAS de las
 * funciones serializadas y falla si alguno no está declarado aquí. */
const CONSTANTES = { MAPA_RE: MAPA_RE, INDICE_RE: INDICE_RE, COMPARTIR_RE: COMPARTIR_RE };
export const FN_SRC =
  "var AYUDA = [" + AYUDA.map(function (a) { return "{tipo:" + JSON.stringify(a.tipo) + ",re:" + String(a.re) + "}"; }).join(",") + "];\n" +
  Object.keys(CONSTANTES).map(function (k) { return "var " + k + " = " + String(CONSTANTES[k]) + ";"; }).join("\n") + "\n" +
  [normalizarHref, tipoAyuda, tagOf, ocultoEl, loc, componenteDe, regionDe, nombreDe, fingerprintPage]
    .map(function (f) { return String(f).replace(/^export\s+/, ""); }).join("\n");
/** Los nombres que se declaran en el código inyectado; el guard los compara. */
export const FN_DECLARADAS = ["AYUDA"].concat(Object.keys(CONSTANTES));
/** Las funciones que se serializan, para que el guard pueda leer su fuente. */
export const FN_FUENTES = [normalizarHref, tipoAyuda, tagOf, ocultoEl, loc, componenteDe, regionDe, nombreDe, fingerprintPage]
  .map(function (f) { return String(f); });

/**
 * Cuerpo para `page.evaluate(new Function("url", FINGERPRINT_BODY))`.
 *
 * Se ejecuta en la página, con su `window`, para que `getComputedStyle` descarte
 * lo que el CSS oculta — el menú móvil duplicado, sobre todo.
 */
export const FINGERPRINT_BODY = FN_SRC + "\nreturn fingerprintPage(document, url, window);";

/** Versión envuelta para la extensión de Chrome. */
export const FINGERPRINT_SRC = "(function(){\n" + FN_SRC +
  "\nwindow.__a11yHuella = function(url){ return fingerprintPage(document, url || location.href, window); };\n})();";
