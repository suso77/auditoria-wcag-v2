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

// Mecanismos de ayuda que reconoce 3.2.6.
const AYUDA = [
  { tipo: "contacto", re: /(^|\b)(contacto|contactar|contact|cont[aá]ctanos)\b/i },
  { tipo: "ayuda", re: /(^|\b)(ayuda|help|soporte|support|asistencia)\b/i },
  { tipo: "faq", re: /(^|\b)(faq|preguntas frecuentes|dudas)\b/i },
  { tipo: "chat", re: /(^|\b)(chat|chatbot|habla con)\b/i },
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
const COMPARTIR_RE = /(compartir|share|env[ií]a(r)? (esto|a un amigo)|tweet|whatsapp)/i;
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
  for (const a of AYUDA) {
    if (a.tipo === "correo" || a.tipo === "teléfono") continue;
    if (a.re.test(href) || a.re.test(nombre)) return a.tipo;
  }
  return null;
}

const MAPA_RE = /(mapa (del sitio|web)|sitemap|[ií]ndice del sitio)/i;
const INDICE_RE = /(^|\b)([ií]ndice|a-z|directorio|listado alfab[eé]tico)\b/i;

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
    if (items.length) navs.push({ locator: loc(nav), label: nombreDe(nav) || (nav.getAttribute("aria-label") || ""), items: items });
  });

  // Todos los enlaces de la página, en orden: identidad para 3.2.4 y 3.2.6.
  const enlaces = [];
  visibles("a[href]").forEach(function (a, i) {
    const raw = a.getAttribute("href");
    const href = normalizarHref(raw, url);
    if (!href) return;
    enlaces.push({ href: href, raw: raw, name: nombreDe(a), locator: loc(a), region: regionDe(a), orden: enlaces.length });
  });

  // Ayuda: mecanismos reconocibles, en el orden en que aparecen.
  const ayuda = [];
  enlaces.forEach(function (e) {
    const t = tipoAyuda(e.name, e.raw, e.region);
    if (t && !ayuda.some(function (x) { return x.tipo === t; })) {
      ayuda.push({ tipo: t, name: e.name, href: e.href, locator: e.locator, region: e.region, orden: e.orden });
    }
  });

  // Vías de localización (2.4.5).
  // OJO: visible, como el resto de la huella. Sin el filtro, un buscador dentro
  // de un menú móvil con `display:none` contaba como vía de localización y
  // empujaba 2.4.5 a «cumple» con algo que el usuario no puede usar.
  const buscador = Array.prototype.slice.call(doc.querySelectorAll('input[type=search],[role=search]'))
    .some(function (el) { return !ocultoEl(el, win); }) ||
    Array.prototype.slice.call(doc.querySelectorAll("form")).some(function (f) {
      if (ocultoEl(f, win)) return false;
      return /buscar|search|busqueda|búsqueda/i.test((f.getAttribute("action") || "") + " " + (f.id || "") + " " + (f.className || "") + " " + (f.getAttribute("role") || ""));
    });
  const mapaWeb = enlaces.some(function (e) { return MAPA_RE.test(e.name) || MAPA_RE.test(e.href); });
  const indice = enlaces.some(function (e) { return INDICE_RE.test(e.name); });
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
  const problemas = [];
  const vistos = {};
  for (let i = 0; i < conNav.length; i++) {
    for (let j = i + 1; j < conNav.length; j++) {
      const inv = ordenRelativo(seqNav(conNav[i]), seqNav(conNav[j]));
      if (!inv) continue;
      // Una misma inversión aparece en varios pares: se cuenta una vez, y con las
      // dos páginas que la demuestran.
      const clave = inv.antes + "|" + inv.despues;
      if (vistos[clave]) continue;
      vistos[clave] = 1;
      problemas.push({ pagina: conNav[j].url, contra: conNav[i].url, inv: inv });
    }
  }
  if (!problemas.length) {
    return [F("3.2.3", "cumple", null, [
      "La navegación repetida mantiene el mismo orden relativo en las " + conNav.length + " páginas de la muestra que la tienen (" +
      seqBase.slice(0, 8).map(etiqueta).join(" → ") + (seqBase.length > 8 ? " → …" : "") + ")."
    ])];
  }
  return [F("3.2.3", "falla", "moderada", problemas.slice(0, 5).map(function (p) {
    return "En " + (p.pagina || "(página)") + " el orden de la navegación cambia: " + etiqueta(p.inv.despues) +
      " aparece antes que " + etiqueta(p.inv.antes) + ", al revés que en " + (p.contra || base.url || "otra página de la muestra") + ".";
  }), problemas.slice(0, 8).map(function (p) { return { locator: p.pagina || "(página)", name: "orden alterado" }; }))];
}

/**
 * 3.2.4 Identificación coherente: el mismo destino, el mismo nombre.
 *
 * Distingue dos grados, porque no son lo mismo: un nombre que CONTIENE al otro
 * («Inicio» / «Ir a inicio») es una inconsistencia menor a revisar; dos nombres
 * sin nada en común para el mismo destino sí es una falla.
 */
export function analyzeIdConsistency(huellas) {
  const porHref = {};
  (huellas || []).forEach(function (h) {
    (h.enlaces || []).forEach(function (e) {
      const nom = normalizarNombre(e.name);
      if (!nom) return;
      if (!porHref[e.href]) porHref[e.href] = { nombres: {}, locator: e.locator };
      if (!porHref[e.href].nombres[nom]) porHref[e.href].nombres[nom] = { crudo: e.name, paginas: [] };
      const p = porHref[e.href].nombres[nom].paginas;
      if (p.indexOf(h.url) === -1) p.push(h.url);
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
  comunes.forEach(function (href) {
    const noms = Object.keys(porHref[href].nombres);
    if (noms.length < 2) return;
    // Las dos variantes tienen que verse en páginas DISTINTAS: si conviven en la
    // misma página son dos enlaces distintos, no una identificación incoherente.
    const enPaginasDistintas = noms.some(function (a) {
      return noms.some(function (b) {
        if (a === b) return false;
        return porHref[href].nombres[a].paginas.some(function (u) {
          return porHref[href].nombres[b].paginas.indexOf(u) === -1;
        });
      });
    });
    if (!enPaginasDistintas) return;
    // ¿Uno contiene a otro? Entonces es matiz, no contradicción.
    const anidados = noms.every(function (a) {
      return noms.some(function (b) { return b !== a && (b.indexOf(a) !== -1 || a.indexOf(b) !== -1); });
    });
    const detalle = href + " → " + noms.map(function (n) { return "«" + porHref[href].nombres[n].crudo + "»"; }).join(" / ");
    (anidados ? revisiones : fallas).push({ href: href, detalle: detalle, locator: porHref[href].locator });
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
  if (!out.length) {
    out.push(comunes.length
      ? F("3.2.4", "cumple", null, ["Los " + comunes.length + " destinos que aparecen en dos o más páginas de la muestra se identifican siempre con el mismo nombre."])
      : F("3.2.4", "revisar", null, ["Ningún destino se repite entre las páginas de la muestra (" + (huellas || []).length + " página(s)): no hay nada que comparar, así que la coherencia de identificación NO se ha comprobado."]));
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

  const movidos = Object.keys(porTipo).filter(function (t) { return Object.keys(porTipo[t]).length > 1; });
  if (movidos.length) {
    return [F("3.2.6", "falla", "moderada", movidos.slice(0, 4).map(function (t) {
      const regs = porTipo[t];
      return "El mecanismo de ayuda «" + t + "» cambia de sitio entre páginas: " +
        Object.keys(regs).map(function (r) { return r + " en " + regs[r].slice(0, 3).map(function (u) { return u || "(página)"; }).join(", "); }).join(" · ") + ".";
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
  const ev = ["Los mecanismos de ayuda (" + tipos.join(", ") + ") aparecen siempre en la misma parte de la página (" +
    tipos.map(function (t) { return t + " → " + Object.keys(porTipo[t])[0]; }).join(", ") + ") en las " + conAyuda.length + " páginas que los ofrecen."];
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
    return [F("2.4.5", "cumple", null, ["El sitio ofrece " + hay.length + " vías para localizar una página: " + hay.map(function (k) { return ETQ[k]; }).join(", ") + "."])];
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
  if (!huellas || !huellas.length) return [];
  return [].concat(
    analyzeMultipleWays(huellas),
    analyzeNavConsistency(huellas),
    analyzeIdConsistency(huellas),
    analyzeHelpConsistency(huellas)
  );
}

/* ── Código inyectable: la huella se toma DENTRO de la página real ───────── */

const FN_SRC =
  "var AYUDA = [" + AYUDA.map(function (a) { return "{tipo:" + JSON.stringify(a.tipo) + ",re:" + String(a.re) + "}"; }).join(",") + "];\n" +
  "var MAPA_RE = " + String(MAPA_RE) + ";\n" +
  "var INDICE_RE = " + String(INDICE_RE) + ";\n" +
  [normalizarHref, tipoAyuda, tagOf, ocultoEl, loc, regionDe, nombreDe, fingerprintPage]
    .map(function (f) { return String(f).replace(/^export\s+/, ""); }).join("\n");

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
