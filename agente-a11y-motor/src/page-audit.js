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
const EMBEBIDOS = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion|wistia|brightcove|jwplayer|spotify\.com|ivoox|soundcloud)/i;
function inventarioMedios(doc) {
  const propios = [], externos = [];
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
      silenciado: el.hasAttribute("muted")
    });
  });
  Array.prototype.forEach.call(doc.querySelectorAll("iframe[src],embed[src],object[data]"), function (el) {
    const src = el.getAttribute("src") || el.getAttribute("data") || "";
    if (!EMBEBIDOS.test(src)) return;
    if (ocultoEl(el)) return;
    externos.push({ locator: loc(el), src: src.slice(0, 120), nombre: (el.getAttribute("title") || "").slice(0, 60) });
  });
  return { propios: propios, externos: externos };
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
  gl: ["o", "os", "as", "do", "da", "dos", "das", "e", "en", "un", "unha", "para", "con", "non", "que", "por", "ao", "nos", "se", "é"]
};
function idiomaProbable(texto) {
  const palabras = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z]+/).filter(Boolean);
  if (palabras.length < 25) return null;   // muy corto: no se puede afirmar nada
  const punt = {};
  Object.keys(FUNCIONALES).forEach(function (k) {
    punt[k] = palabras.filter(function (w) { return FUNCIONALES[k].indexOf(w) !== -1; }).length / palabras.length;
  });
  const orden = Object.keys(punt).sort(function (a, b) { return punt[b] - punt[a]; });
  // Exigir margen: sin diferencia clara entre el primero y el segundo, no se dice.
  if (punt[orden[0]] < 0.08 || punt[orden[0]] < punt[orden[1]] * 1.6) return null;
  return orden[0];
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
  else out.push(F("3.1.1", "cumple", null, ["Idioma declarado: lang=\"" + efectivo + "\"."]));

  // 1.3.1 Landmarks: exactamente un main; banner/contentinfo no duplicados
  const mains = landmarks(doc, "main", ["main"]);
  if (mains.length === 0) out.push(F("1.3.1", "revisar", null, ["No hay landmark <main>: dificulta ir directo al contenido principal."]));
  else if (mains.length > 1) out.push(F("1.3.1", "falla", "moderada", ["Hay " + mains.length + " landmarks main: debe haber solo uno."], mains.map(function (e) { return { locator: loc(e) }; })));
  const banners = landmarks(doc, "banner", ["header"]);
  const infos = landmarks(doc, "contentinfo", ["footer"]);
  if (banners.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + banners.length + " landmarks banner: normalmente debe haber uno."], banners.map(function (e) { return { locator: loc(e) }; })));
  if (infos.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + infos.length + " landmarks contentinfo: normalmente debe haber uno."], infos.map(function (e) { return { locator: loc(e) }; })));

  // 2.4.1 Saltar bloques. Un enlace de salto de verdad apunta a un destino que
  // EXISTE y está al principio del documento; antes valía cualquier `a[href^='#']`
  // de la página —incluido `href="#"` de un botón falso o un ancla del pie—.
  const anclas = visibles(doc.querySelectorAll("a[href^='#']")).slice(0, 8);
  const salto = anclas.find(function (a) {
    const h = (a.getAttribute("href") || "").slice(1);
    if (!h) return false;
    let destino = null;
    try { destino = doc.getElementById(h) || doc.querySelector('a[name="' + h.replace(/"/g, '\\"') + '"]'); } catch (e) {}
    return !!destino;
  });
  const hayLandmarks = mains.length > 0 || visibles(doc.querySelectorAll("nav,[role=navigation]")).length > 0;
  const headings = visibles(doc.querySelectorAll(HEADING_SEL)).map(function (h) {
    const n = tag(h);
    const lvl = /^h[1-6]$/.test(n) ? parseInt(n[1], 10) : parseInt(h.getAttribute("aria-level") || "2", 10);
    return { lvl: lvl, text: (h.textContent || "").trim().slice(0, 40), el: h };
  });
  if (salto) out.push(F("2.4.1", "cumple-parcial", null, ["Hay un enlace de salto a un destino existente (" + salto.getAttribute("href") + "); confirma que sea visible al recibir el foco."], [{ locator: loc(salto) }]));
  else if (hayLandmarks || headings.length) out.push(F("2.4.1", "revisar", null, ["Sin enlace de salto con destino válido; hay landmarks/encabezados como mecanismo alternativo (revisar que basten)."]));
  else out.push(F("2.4.1", "falla", "moderada", ["No hay enlace de salto ni landmarks ni encabezados para saltar bloques repetidos."]));

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
  const colgantes = Object.keys(referenced).filter(function (id) { return !idCount[id]; });
  if (colgantes.length) {
    out.push(F("4.1.2", "falla", "grave", ["Referencias a IDs que no existen: " + colgantes.slice(0, 8).join(", ") + " — el nombre, la descripción o la relación no llegan a la API de accesibilidad."],
      colgantes.slice(0, 8).map(function (id) { return { locator: loc(referenced[id][0]), name: id }; })));
  }

  /* ── 1.2.x Medios ── */
  const medios = inventarioMedios(doc);
  if (medios.propios.length || medios.externos.length) {
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
      out.push(F("1.2.3", "revisar", null, [
        sinDesc.length + " vídeo(s) no declaran pista de audiodescripción (<track kind=\"descriptions\">) ni se detecta una alternativa: " +
        sinDesc.slice(0, 5).map(function (m) { return m.locator; }).join(", ") +
        ". 1.2.3 admite una alternativa textual equivalente, que puede estar en la página sin marcado propio: compruébalo."
      ], sinDesc.slice(0, 8).map(function (m) { return { locator: m.locator, name: "sin audiodescripción" }; })));
    }
    if (audios.length) {
      out.push(F("1.2.1", "revisar", null, [
        audios.length + " elemento(s) de solo audio (" + audios.map(function (m) { return m.locator; }).join(", ") +
        "): 1.2.1 exige una transcripción equivalente, que no se puede reconocer desde el marcado. Búscala en la página."
      ], audios.slice(0, 8).map(function (m) { return { locator: m.locator, name: "solo audio" }; })));
    }
    if (medios.externos.length) {
      out.push(F("1.2.2", "revisar", null, [
        medios.externos.length + " medio(s) incrustados de terceros (" +
        medios.externos.slice(0, 4).map(function (m) { return m.locator + " → " + m.src.replace(/^https?:\/\//, "").slice(0, 45); }).join(", ") +
        "): su contenido no se ve desde aquí. Ábrelos y comprueba subtítulos y audiodescripción en el propio reproductor."
      ], medios.externos.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.nombre || "medio incrustado" }; })));
    }

    // 1.4.2 Control del audio: lo que suena solo y no se puede parar.
    const suenanSolos = medios.propios.filter(function (m) { return m.autoplay && !m.silenciado; });
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

  /* ── 3.1.2 Idioma de las partes ── */
  const langPagina = String((html && html.getAttribute("lang")) || "").toLowerCase().split("-")[0];
  if (langPagina) {
    const sospechosos = [];
    const bloques = doc.querySelectorAll("p,li,blockquote,td,dd,figcaption,h1,h2,h3,h4,h5,h6");
    for (let i = 0; i < bloques.length && sospechosos.length < 12; i++) {
      const el = bloques[i];
      if (ocultoEl(el)) continue;
      // Si el propio bloque o un antepasado ya declara idioma, está resuelto.
      let p = el, declarado = null;
      while (p && p.nodeType === 1) { const l = p.getAttribute("lang"); if (l) { declarado = l.toLowerCase().split("-")[0]; break; } p = p.parentElement; }
      if (declarado && declarado !== langPagina) continue;
      const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
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
