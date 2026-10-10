/**
 * Selección de muestra representativa (WCAG-EM, paso 3).
 *
 * Hasta ahora las URLs las ponía la persona auditora. La metodología WCAG-EM pide
 * algo más concreto: una **muestra estructurada** (páginas comunes, una por
 * plantilla, cada tipo de contenido y tecnología, los procesos completos) más una
 * **muestra aleatoria** de al menos el 10 % de aquella, y —esto es lo que acaba
 * en el IRA— la justificación de por qué está cada página.
 *
 * Este módulo es puro: recibe candidatas ya clasificadas y devuelve la muestra
 * con su motivo. El rastreo, que es lo que toca la red, vive en crawl.js.
 *
 * Dos decisiones que lo hacen utilizable en un entregable:
 *
 *  - La parte aleatoria es **reproducible**: un generador con semilla, y la
 *    semilla viaja en el resultado. Dos ejecuciones con la misma semilla dan la
 *    misma muestra, que es lo que permite defender el informe y repetirlo.
 *  - Cada página seleccionada lleva su **motivo**. Una muestra sin justificación
 *    no vale para el IRA, por bien elegida que esté.
 */

/* ── Generador reproducible ──────────────────────────────────────────────── */

function semillaANumero(s) {
  let h = 2166136261 >>> 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** PRNG determinista (mulberry32): misma semilla, misma secuencia. */
export function rngDesde(semilla) {
  let a = semillaANumero(semilla);
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Baraja reproducible (Fisher–Yates con el PRNG dado). No muta la entrada. */
export function barajar(lista, rnd) {
  const a = (lista || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ── Categorías de la muestra estructurada ───────────────────────────────── */

/**
 * Páginas comunes que WCAG-EM pide incluir explícitamente. El orden importa:
 * es el de prioridad cuando hay que recortar la muestra.
 */
export const CATEGORIAS = [
  { id: "inicio", etiqueta: "Página de inicio", esencial: true },
  { id: "accesibilidad", etiqueta: "Declaración de accesibilidad", esencial: true },
  { id: "contacto", etiqueta: "Contacto", esencial: true },
  { id: "mapa-web", etiqueta: "Mapa web", esencial: false },
  { id: "ayuda", etiqueta: "Ayuda o preguntas frecuentes", esencial: false },
  { id: "legal", etiqueta: "Aviso legal o privacidad", esencial: false },
  { id: "busqueda", etiqueta: "Resultados de búsqueda", esencial: true },
  { id: "formulario", etiqueta: "Página con formulario", esencial: true },
  { id: "acceso", etiqueta: "Acceso o registro", esencial: true },
  { id: "proceso", etiqueta: "Paso de un proceso", esencial: true }
];
const CAT_IX = {};
CATEGORIAS.forEach(function (c) { CAT_IX[c.id] = c; });

/** Tipos de contenido y tecnología que la muestra debe cubrir al menos una vez. */
export const CONTENIDOS = [
  { id: "video", etiqueta: "Vídeo" },
  { id: "audio", etiqueta: "Audio" },
  { id: "tabla", etiqueta: "Tabla de datos" },
  { id: "iframe", etiqueta: "Contenido embebido (iframe)" },
  { id: "canvas", etiqueta: "Gráfico o lienzo (canvas/SVG complejo)" },
  { id: "pdf", etiqueta: "Enlaces a documentos PDF" },
  { id: "mapa", etiqueta: "Mapa interactivo" },
  { id: "widget", etiqueta: "Widget dinámico (pestañas, acordeón, diálogo)" },
  { id: "carrusel", etiqueta: "Carrusel o contenido en movimiento" }
];
const CONT_IX = {};
CONTENIDOS.forEach(function (c) { CONT_IX[c.id] = c; });

/* ── Clasificación por URL y por señales ─────────────────────────────────── */

/**
 * ANTES ESTO ERAN SIETE EXPRESIONES DE SUBCADENA, y clasificaba mal casi todo.
 * Medido sobre nueve rutas de aspecto corriente, ocho salían con categoría:
 *
 *   /accesorios                     → «Acceso o registro»   («acceso» dentro de accesorios)
 *   /productos/altavoces-bluetooth  → «Acceso o registro»   («alta» dentro de altavoces)
 *   /registro-civil-tramites        → «Acceso o registro»
 *   /noticias/resultados-del-partido→ «Resultados de búsqueda»
 *   /blog/comercio-ilegal-de-especies → «Aviso legal»       («legal» dentro de ilegal)
 *   /servicios/soporte-vital-basico → «Ayuda»
 *   /es/destinos/contactos-culturales → «Contacto»
 *
 * Y el daño no se queda en la lista: la cobertura que va al IRA decía que la
 * muestra incluía contacto, ayuda, aviso legal, resultados de búsqueda y acceso
 * —cinco categorías, ninguna presente— y los avisos de «no se ha encontrado
 * ninguna página de esta categoría», que son los que mandan a la persona
 * auditora a comprobarlo a mano, desaparecían por estar «cubiertas».
 *
 * La regla nueva no mira subcadenas: parte la ruta en segmentos y los segmentos
 * en palabras, y exige dos cosas a la vez:
 *
 *  1. que alguna palabra sea CLAVE de la categoría (palabra entera: «acceso» ya
 *     no lo encuentra dentro de «accesorios»), y
 *  2. que TODAS las demás palabras del segmento sean de la categoría, de apoyo o
 *     conectores. Así `/aviso-legal` y `/contactar-con-nosotros` pasan, y
 *     `/comercio-ilegal-de-especies` o `/contactos-culturales` no.
 *
 * Lo que trae una palabra clave pero no encaja del todo no se tira en silencio:
 * se devuelve en `posibles` y la selección lo nombra en un aviso. Descartar de
 * más deja el mismo agujero que clasificar de más, solo que al revés.
 */

/** Palabras que no dicen de qué va la página: solo unen a las que sí. */
const CONECTORES = {
  de: 1, del: 1, la: 1, las: 1, el: 1, los: 1, un: 1, una: 1, unos: 1, unas: 1,
  y: 1, e: 1, o: 1, u: 1, con: 1, a: 1, al: 1, en: 1, para: 1, por: 1, sobre: 1,
  the: 1, of: 1, and: 1, to: 1, for: 1, our: 1, my: 1, us: 1,
  pagina: 1, paginas: 1, page: 1, pages: 1, web: 1, site: 1, portal: 1,
  html: 1, htm: 1, php: 1, asp: 1, aspx: 1, jsp: 1, shtml: 1, xhtml: 1,
  index: 1, default: 1, home: 1, inicio: 1, content: 1, contenido: 1
};

/**
 * Vocabulario por categoría. `clave`: al menos una tiene que estar. `apoyo`: se
 * toleran, pero no bastan. `combos`: pares que juntos valen como clave («mapa» a
 * secas es un mapa interactivo; «mapa» + «web» es el mapa del sitio).
 */
const VOCABULARIO = {
  accesibilidad: {
    clave: ["accesibilidad", "accessibility", "accesibilidade", "acessibilidade", "erabilerraztasuna"],
    apoyo: ["declaracion", "declaracio", "declaration", "statement", "aviso", "informe", "politica", "policy", "conformidad", "nivel", "compromiso"]
  },
  "mapa-web": {
    clave: ["sitemap", "mapaweb"],
    combos: [["mapa", "web"], ["mapa", "sitio"], ["mapa", "contenidos"], ["mapa", "navegacion"], ["indice", "sitio"], ["indice", "contenidos"], ["arbol", "contenidos"]],
    apoyo: ["mapa", "indice", "sitio", "contenidos", "navegacion", "arbol", "estructura"]
  },
  contacto: {
    clave: ["contacto", "contactos", "contactar", "contacta", "contactanos", "contact", "kontaktua"],
    apoyo: ["nosotros", "nos", "directorio", "atencion", "ciudadano", "ciudadana", "cliente", "clientes", "formulario", "donde", "estamos", "localizacion", "telefono", "telefonos", "email", "correo", "informacion", "escribenos", "buzon"]
  },
  ayuda: {
    clave: ["ayuda", "help", "faq", "faqs", "soporte", "support", "laguntza"],
    combos: [["preguntas", "frecuentes"], ["preguntas", "habituales"], ["dudas", "frecuentes"]],
    apoyo: ["preguntas", "frecuentes", "habituales", "dudas", "tecnico", "tecnica", "usuario", "usuarios", "centro", "asistencia", "online"]
  },
  legal: {
    clave: ["legal", "legales", "privacidad", "privacy", "cookies", "terminos", "condiciones", "terms", "conditions", "lopd", "rgpd", "gdpr"],
    apoyo: ["aviso", "avisos", "politica", "politicas", "policy", "uso", "datos", "personales", "proteccion", "nota", "texto", "informacion", "legalidad", "notice"]
  },
  busqueda: {
    clave: ["buscar", "busqueda", "buscador", "search", "bilaketa", "procura"],
    apoyo: ["resultados", "resultado", "results", "avanzada", "avanzado", "general", "contenidos", "q"]
  },
  acceso: {
    clave: ["login", "signin", "signup", "acceso", "acceder", "registro", "registrarse", "registrate", "identificacion", "identificate", "autenticacion", "sarbidea"],
    combos: [["iniciar", "sesion"], ["mi", "cuenta"], ["area", "privada"], ["zona", "privada"], ["darse", "alta"], ["sign", "in"], ["sign", "up"], ["log", "in"]],
    apoyo: ["sesion", "usuario", "usuarios", "clientes", "privado", "privada", "area", "zona", "intranet", "cuenta", "mi", "iniciar", "nuevo", "nueva", "alta", "sign", "log", "in", "up", "darse"]
  }
};
/** Parámetros de consulta que delatan una página de resultados de búsqueda. */
const PARAM_BUSQUEDA = { q: 1, s: 1, query: 1, busqueda: 1, buscar: 1, search: 1, keyword: 1, keywords: 1, palabra: 1, texto: 1, term: 1, termino: 1 };

function sinTildes(t) {
  return String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function palabras(txt) {
  return sinTildes(txt).split(/[^a-z0-9]+/).filter(Boolean);
}
function decodeSeguro(t) {
  try { return decodeURIComponent(String(t).replace(/\+/g, " ")); } catch (e) { return String(t); }
}
/**
 * Parte una ruta en grupos de palabras: un grupo por segmento de camino y uno
 * por valor de la cadena de consulta. Cada grupo se juzga por separado, así que
 * el `/es/` o el `/sede/` de delante no contaminan al segmento que decide.
 */
export function trozosDeRuta(ruta) {
  const s = String(ruta || "");
  const i = s.indexOf("?");
  const camino = i === -1 ? s : s.slice(0, i);
  const consulta = i === -1 ? "" : s.slice(i + 1);
  const out = [];
  camino.split("/").forEach(function (seg) {
    if (!seg) return;
    out.push(palabras(decodeSeguro(seg).replace(/\.[a-z0-9]{1,5}$/i, "")));
  });
  consulta.split(/[&;]/).forEach(function (par) {
    if (!par) return;
    const p = par.split("=");
    out.push(palabras(decodeSeguro(p.length > 1 ? p.slice(1).join("=") : par)));
  });
  return out.filter(function (w) { return w.length; });
}
/**
 * Parte un título en grupos. Los títulos llevan casi siempre el nombre del sitio
 * detrás de un separador («Contacto | Ayuntamiento de X»), y ese rabo no debe
 * decidir nada: cada trozo se juzga solo.
 */
export function trozosDeTitulo(titulo) {
  return String(titulo || "")
    .split(/[|·—–»«>]|::|\s+-\s+|\s*:\s+/)
    .map(palabras)
    .filter(function (w) { return w.length; });
}
function enLista(lista) {
  const ix = {};
  (lista || []).forEach(function (w) { ix[w] = 1; });
  return ix;
}
const VOC_IX = {};
Object.keys(VOCABULARIO).forEach(function (k) {
  const v = VOCABULARIO[k];
  VOC_IX[k] = { clave: enLista(v.clave), apoyo: enLista(v.apoyo), combos: v.combos || [] };
});

function tieneClave(ws, v) {
  if (ws.some(function (w) { return v.clave[w]; })) return true;
  return v.combos.some(function (c) { return c.every(function (w) { return ws.indexOf(w) !== -1; }); });
}
/** El grupo de palabras ES de esta categoría: clave presente y nada ajeno. */
function encaja(ws, v) {
  if (!tieneClave(ws, v)) return false;
  return ws.every(function (w) {
    return CONECTORES[w] || v.clave[w] || v.apoyo[w] || /^\d+$/.test(w);
  });
}

/**
 * Clasifica una candidata. `pagina` es lo que produce el rastreo:
 * `{ url, ruta, titulo, plantilla, señales }`.
 *
 * Devuelve `categorias` (las que se pueden afirmar), `posibles` (las que suenan
 * pero no encajan: van a un aviso, no a la cobertura) y `contenidos`.
 */
export function clasificar(pagina) {
  const cats = [];
  const posibles = [];
  const ruta = String(pagina.ruta || pagina.url || "");
  const titulo = String(pagina.titulo || "");
  const s = pagina["señales"] || pagina.senales || {};
  const grupos = trozosDeRuta(ruta).concat(trozosDeTitulo(titulo));
  const mete = function (id) { if (cats.indexOf(id) === -1) cats.push(id); };

  const soloCamino = ruta.split("?")[0].replace(/\/+$/, "");
  if (soloCamino === "" || /\/(index|default|inicio|home)(\.[a-z0-9]{1,5})?$/i.test(soloCamino) || s.esInicio) mete("inicio");

  const fuerte = {};
  Object.keys(VOC_IX).forEach(function (id) {
    const v = VOC_IX[id];
    if (grupos.some(function (ws) { return encaja(ws, v); })) { fuerte[id] = 1; return; }
    if (grupos.some(function (ws) { return tieneClave(ws, v); })) posibles.push(id);
  });
  // Las temáticas se pueden afirmar con el nombre: una ruta que es exactamente
  // «aviso-legal» o «preguntas-frecuentes» no es otra cosa.
  ["accesibilidad", "mapa-web", "contacto", "ayuda", "legal"].forEach(function (id) { if (fuerte[id]) mete(id); });

  /* Acceso y búsqueda son FUNCIÓN, no tema, así que el nombre NUNCA basta: hace
     falta que el DOM lo confirme. Y tiene que ser el encaje FUERTE, no la simple
     mención: `/registro-civil-tramites` tiene formulario y la palabra «registro»,
     y con la mención bastando salía como «Acceso o registro» —el único falso
     positivo que quedaba de los nueve medidos. */
  if (s.tieneAcceso) mete("acceso");                                 // un campo de contraseña no deja dudas
  else if (fuerte.acceso && s.tieneFormulario) mete("acceso");       // la ruta ES de acceso y hay formulario
  else if (fuerte.acceso) posibles.push("acceso");                   // lo parece, pero no hay dónde identificarse
  const paramBusqueda = (ruta.split("?")[1] || "").split(/[&;]/).some(function (p) {
    return p.indexOf("=") !== -1 && PARAM_BUSQUEDA[sinTildes(p.split("=")[0])];
  });
  if (s.tieneBusqueda && (fuerte.busqueda || paramBusqueda)) mete("busqueda");
  else if (fuerte.busqueda) posibles.push("busqueda");

  if (s.tieneFormulario && cats.indexOf("acceso") === -1 && cats.indexOf("formulario") === -1) mete("formulario");
  if (s.esProceso) mete("proceso");

  const contenidos = CONTENIDOS.map(function (c) { return c.id; }).filter(function (id) { return !!s[id]; });
  return {
    categorias: cats,
    posibles: posibles.filter(function (id) { return cats.indexOf(id) === -1; }),
    contenidos: contenidos,
    plantilla: pagina.plantilla || null
  };
}

/* ── Selección ───────────────────────────────────────────────────────────── */

function añadir(sel, vistos, pagina, motivo) {
  const y = vistos[pagina.url];
  if (y) { if (y.motivos.indexOf(motivo) === -1) y.motivos.push(motivo); return false; }
  const item = { url: pagina.url, titulo: pagina.titulo || "", plantilla: pagina.plantilla || null, motivos: [motivo] };
  vistos[pagina.url] = item;
  sel.push(item);
  return true;
}

/**
 * Construye la muestra.
 *
 * @param {Array} candidatas  páginas rastreadas, cada una con { url, ruta, titulo, plantilla, señales }
 * @param {{ max?:number, semilla?:string, porcentajeAleatorio?:number, minAleatorias?:number }} [opts]
 */
export function seleccionarMuestra(candidatas, opts) {
  opts = opts || {};
  const max = opts.max || 20;
  const semilla = opts.semilla != null ? String(opts.semilla) : "wcag-em";
  const pct = opts.porcentajeAleatorio != null ? opts.porcentajeAleatorio : 0.10;
  // ORDEN CANÓNICO por URL antes de nada. La semilla garantiza la misma
  // permutación, pero sobre la misma lista de entrada: si las candidatas llegan
  // en otro orden —otro rastreo, otra concurrencia, otra profundidad— la muestra
  // «reproducible» salía distinta con la misma semilla. Ahora la reproducibilidad
  // no depende de cómo llegaron las páginas.
  const todas = (candidatas || []).map(function (p) {
    return Object.assign({}, p, { clasif: clasificar(p) });
  }).sort(function (a, b) { return String(a.url).localeCompare(String(b.url)); });
  if (!todas.length) {
    return { muestra: [], estructurada: [], aleatoria: [], cobertura: { categorias: {}, contenidos: {}, plantillas: 0 }, semilla: semilla, candidatas: 0, avisos: ["No hay ninguna página candidata."] };
  }

  const rnd = rngDesde(semilla);
  const estructurada = [], vistos = {};
  const avisos = [];

  // 1) Páginas comunes, en el orden de prioridad de CATEGORIAS.
  CATEGORIAS.forEach(function (cat) {
    const cands = todas.filter(function (p) { return p.clasif.categorias.indexOf(cat.id) !== -1; });
    if (!cands.length) {
      // Lo que suena a esta categoría pero no encajó. Nombrarlo es lo que impide
      // que una regla más estricta se coma una página de verdad sin que nadie se
      // entere: la persona auditora mira esas tres URL y decide.
      const flojas = todas.filter(function (p) { return (p.clasif.posibles || []).indexOf(cat.id) !== -1; });
      const pistas = flojas.length
        ? " Hay " + flojas.length + " página(s) que mencionan la categoría en su nombre o título pero no parecen serlo (" +
          flojas.slice(0, 3).map(function (p) { return p.url; }).join(", ") + (flojas.length > 3 ? ", …" : "") + "): compruébalas."
        : "";
      if (cat.esencial) avisos.push("No se ha encontrado ninguna página de la categoría «" + cat.etiqueta + "»: compruébalo a mano antes de dar la muestra por buena." + pistas);
      else if (flojas.length) avisos.push("Ninguna página encaja con la categoría «" + cat.etiqueta + "»." + pistas);
      return;
    }
    // La más corta: suele ser la canónica («/contacto» antes que «/es/x/contacto-2»).
    const elegida = cands.slice().sort(function (a, b) { return String(a.ruta || a.url).length - String(b.ruta || b.url).length; })[0];
    añadir(estructurada, vistos, elegida, cat.etiqueta);
  });

  // 2) Una por plantilla: es lo que garantiza cubrir todos los diseños del sitio.
  const porPlantilla = {};
  todas.forEach(function (p) {
    const k = p.plantilla || "(sin plantilla)";
    if (!porPlantilla[k]) porPlantilla[k] = [];
    porPlantilla[k].push(p);
  });
  const plantillas = Object.keys(porPlantilla);
  plantillas.forEach(function (k) {
    // Si ya hay una página de esta plantilla, no se añade otra — pero SÍ se anota
    // el motivo en la que está. Un motivo que no se registra es una justificación
    // que falta en el IRA.
    const yaCubierta = estructurada.filter(function (it) { return it.plantilla === k; })[0];
    if (yaCubierta) {
      const m = "Plantilla propia (" + porPlantilla[k].length + " página(s) la comparten)";
      if (yaCubierta.motivos.indexOf(m) === -1) yaCubierta.motivos.push(m);
      return;
    }
    // Del grupo, la de ruta más corta: la representante natural.
    const elegida = porPlantilla[k].slice().sort(function (a, b) { return String(a.ruta || a.url).length - String(b.ruta || b.url).length; })[0];
    añadir(estructurada, vistos, elegida, "Plantilla propia (" + porPlantilla[k].length + " página(s) la comparten)");
  });

  // 3) Tipos de contenido y tecnología.
  CONTENIDOS.forEach(function (c) {
    const motivo = "Tipo de contenido: " + c.etiqueta;
    const yaCubierto = estructurada.filter(function (it) {
      const p = todas.find(function (x) { return x.url === it.url; });
      return p && p.clasif.contenidos.indexOf(c.id) !== -1;
    })[0];
    if (yaCubierto) {
      if (yaCubierto.motivos.indexOf(motivo) === -1) yaCubierto.motivos.push(motivo);
      return;
    }
    const cands = todas.filter(function (p) { return p.clasif.contenidos.indexOf(c.id) !== -1; });
    if (!cands.length) return;
    añadir(estructurada, vistos, cands[0], motivo);
  });

  // 4) Muestra aleatoria: al menos el 10 % de la estructurada, de lo que sobra.
  const resto = todas.filter(function (p) { return !vistos[p.url]; });
  const nAleatorias = Math.max(opts.minAleatorias != null ? opts.minAleatorias : 1, Math.ceil(estructurada.length * pct));
  const aleatoria = [];
  // `resto` ya viene del orden canónico de `todas`: barajar sobre una copia.
  barajar(resto.slice(), rnd).slice(0, Math.min(nAleatorias, resto.length)).forEach(function (p) {
    añadir(aleatoria, vistos, p, "Muestra aleatoria (semilla «" + semilla + "»)");
  });
  if (!resto.length && estructurada.length <= max) {
    avisos.push("No hay muestra aleatoria porque la estructurada ya cubre TODAS las páginas rastreadas (" + todas.length + "): la auditoría abarca el sitio completo, no una muestra.");
  } else if (!resto.length) {
    avisos.push("No hay páginas fuera de la muestra estructurada para la parte aleatoria, y además la estructurada no cabe entera en el máximo: la muestra no cubre el sitio completo.");
  } else if (resto.length < nAleatorias) {
    avisos.push("La muestra aleatoria queda en " + resto.length + " página(s) de las " + nAleatorias + " que pedía el 10 %: el rastreo no encontró más fuera de la muestra estructurada.");
  }

  let muestra = estructurada.concat(aleatoria);
  let estructuradaEnMuestra = estructurada;
  if (muestra.length > max) {
    // Recortar NUNCA por la aleatoria: WCAG-EM exige su presencia. Se recorta la
    // estructurada por el final, que es donde están las plantillas repetidas.
    const sobran = muestra.length - max;
    estructuradaEnMuestra = estructurada.slice(0, Math.max(0, estructurada.length - sobran));
    const fuera = estructurada.slice(estructuradaEnMuestra.length);
    avisos.push("La muestra (" + muestra.length + ") supera el máximo de " + max + ": se recortan " + sobran +
      " página(s) de la parte estructurada" + (fuera.length ? " (" + fuera.slice(0, 5).map(function (p) { return p.url; }).join(", ") + (fuera.length > 5 ? ", …" : "") + ")" : "") +
      ". Esas páginas NO se han auditado. Súbelo con `max` si la auditoría lo exige.");
    muestra = estructuradaEnMuestra.concat(aleatoria);
  }

  // Cobertura: qué queda dentro y qué no, para documentarlo en el informe.
  const enMuestra = {};
  muestra.forEach(function (it) { enMuestra[it.url] = 1; });
  const cobCat = {}, cobCont = {};
  CATEGORIAS.forEach(function (c) {
    cobCat[c.id] = todas.some(function (p) { return enMuestra[p.url] && p.clasif.categorias.indexOf(c.id) !== -1; });
  });
  CONTENIDOS.forEach(function (c) {
    cobCont[c.id] = todas.some(function (p) { return enMuestra[p.url] && p.clasif.contenidos.indexOf(c.id) !== -1; });
  });

  return {
    muestra: muestra,
    // La estructurada QUE ESTÁ EN LA MUESTRA, no la candidata. Antes se exponía
    // la lista entera y `justificarMuestra` sumaba 8+1 para una muestra de 6: el
    // texto que va al IRA describía una muestra que no era la auditada.
    estructurada: estructuradaEnMuestra,
    estructuradaCandidata: estructurada,
    recortadas: estructurada.slice(estructuradaEnMuestra.length),
    aleatoria: aleatoria,
    candidatas: todas.length,
    semilla: semilla,
    cobertura: {
      categorias: cobCat,
      contenidos: cobCont,
      plantillas: plantillas.length,
      plantillasCubiertas: new Set(muestra.map(function (m) { return m.plantilla; })).size
    },
    avisos: avisos
  };
}

/** Justificación de la muestra, en prosa, para pegar en el IRA. */
export function justificarMuestra(sel) {
  if (!sel || !sel.muestra.length) return "No se ha podido construir una muestra.";
  const lineas = [];
  lineas.push("Muestra de " + sel.muestra.length + " páginas sobre " + sel.candidatas + " candidatas rastreadas, siguiendo WCAG-EM: " +
    sel.estructurada.length + " de muestra estructurada y " + sel.aleatoria.length + " de muestra aleatoria (semilla «" + sel.semilla + "», reproducible).");
  lineas.push("Se han identificado " + sel.cobertura.plantillas + " plantillas distintas, de las que la muestra cubre " + sel.cobertura.plantillasCubiertas + ".");
  const sinCat = CATEGORIAS.filter(function (c) { return !sel.cobertura.categorias[c.id]; });
  if (sinCat.length) lineas.push("Sin representación en la muestra: " + sinCat.map(function (c) { return c.etiqueta.toLowerCase(); }).join(", ") + ".");
  const conCont = CONTENIDOS.filter(function (c) { return sel.cobertura.contenidos[c.id]; });
  if (conCont.length) lineas.push("Tipos de contenido cubiertos: " + conCont.map(function (c) { return c.etiqueta.toLowerCase(); }).join(", ") + ".");
  (sel.avisos || []).forEach(function (a) { lineas.push(a); });
  return lineas.join(" ");
}
