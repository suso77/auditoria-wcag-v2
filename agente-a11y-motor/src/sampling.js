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

const URL_RE = [
  ["accesibilidad", /(accesibilidad|accessibility|declaraci[oó]n[-\s]de[-\s]accesibilidad)/i],
  ["mapa-web", /(mapa[-\s]?web|mapa[-\s]del[-\s]sitio|sitemap|[ií]ndice[-\s]del[-\s]sitio)/i],
  ["contacto", /(contacto|contactar|contact)/i],
  ["ayuda", /(ayuda|help|faq|preguntas[-\s]frecuentes|soporte|support)/i],
  ["legal", /(aviso[-\s]?legal|privacidad|privacy|cookies|t[eé]rminos|terminos|legal)/i],
  ["busqueda", /(buscar|busqueda|search|resultados)/i],
  ["acceso", /(login|acceso|iniciar[-\s]?sesi[oó]n|iniciar[-\s]?sesion|registro|signin|sign[-\s]?up|alta)/i]
];

/**
 * Clasifica una candidata. `pagina` es lo que produce el rastreo:
 * `{ url, ruta, titulo, estructura, señales }`.
 */
export function clasificar(pagina) {
  const cats = [];
  const ruta = String(pagina.ruta || pagina.url || "");
  const titulo = String(pagina.titulo || "");
  const s = pagina["señales"] || pagina.senales || {};

  if (ruta === "/" || ruta === "" || s.esInicio) cats.push("inicio");
  URL_RE.forEach(function (par) {
    if (par[1].test(ruta) || par[1].test(titulo)) { if (cats.indexOf(par[0]) === -1) cats.push(par[0]); }
  });
  // Las señales del DOM mandan sobre la URL: un formulario de acceso es acceso
  // aunque la ruta no lo diga.
  if (s.tieneAcceso && cats.indexOf("acceso") === -1) cats.push("acceso");
  if (s.tieneBusqueda && cats.indexOf("busqueda") === -1 && /resultado|search|buscar/i.test(ruta + " " + titulo)) cats.push("busqueda");
  if (s.tieneFormulario && cats.indexOf("acceso") === -1 && cats.indexOf("formulario") === -1) cats.push("formulario");
  if (s.esProceso) cats.push("proceso");

  const contenidos = CONTENIDOS.map(function (c) { return c.id; }).filter(function (id) { return !!s[id]; });
  return { categorias: cats, contenidos: contenidos, plantilla: pagina.plantilla || null };
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
      if (cat.esencial) avisos.push("No se ha encontrado ninguna página de la categoría «" + cat.etiqueta + "»: compruébalo a mano antes de dar la muestra por buena.");
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
