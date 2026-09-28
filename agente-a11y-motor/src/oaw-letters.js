/**
 * Granularidad por letra del OAW: del criterio WCAG al subcriterio `9.X.Y.Z-L`.
 *
 * La plantilla del Informe de Hallazgos (R9.Web) no se conforma con la cláusula
 * EN `9.X.Y.Z`: dentro de un mismo criterio distingue casos con una letra. Un
 * `1.3.1` no es un `1.3.1` — es `-D` si el problema son listas, `-I` si son
 * tablas, `-Ñ` si son agrupaciones de controles, `-Q` si es la estructura de
 * regiones, y `-A` en el caso general. Esa asignación la venían haciendo a mano
 * las skills de informe; aquí la hace el motor, que es quien sabe qué comprobó.
 *
 * ── La diferencia con clasificar por el texto ──────────────────────────────
 * Lo evidente sería buscar palabras («tabla», «lista», «landmark») en la
 * redacción del hallazgo. Es lo que hacía el pipeline anterior y es frágil: el
 * subcriterio dependía de cómo estuviera redactada la frase, no de lo que se
 * comprobó. El motor tiene algo mucho mejor: sabe el TIPO de regla que saltó
 * (`types`) y sobre qué nodo (etiqueta, rol, si cuelga de un enlace). Eso son
 * hechos, no prosa.
 *
 * Así que el orden es: override del auditor → señal estructural → texto (solo
 * para hallazgos que no llevan tipo, como los de otras capas) → letra general.
 * Y cada asignación dice POR QUÉ vía se decidió, porque en un entregable con
 * efectos legales conviene poder auditar también el mapeo.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No inventa letras. Un criterio que no está en la tabla devuelve `null` con su
 * motivo, y el informe lo dice, en vez de colocar una `-A` por defecto que
 * pasaría por buena. Fuente de la tabla: plantilla OAW R9.Web v1.7.
 */

/** Criterios que la plantilla OAW (v1.6 y v1.7) no recoge. */
export const NO_EN_PLANTILLA = ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"];

/** Mapeo directo uno a uno. */
export const MAPA_DIRECTO = {
  "1.2.1": "9.1.2.1-A", "1.2.2": "9.1.2.2-A", "1.2.3": "9.1.2.3-A",
  "1.2.4": "9.1.2.4-A", // confirmado contra la plantilla R9.Web
  "1.2.5": "9.1.2.5-A",
  "1.3.2": "9.1.3.2-A", "1.3.3": "9.1.3.3-A", "1.3.4": "9.1.3.4-A", "1.3.5": "9.1.3.5-A",
  "1.4.1": "9.1.4.1-A", "1.4.2": "9.1.4.2-A", "1.4.3": "9.1.4.3-A", "1.4.4": "9.1.4.4-A",
  "1.4.5": "9.1.4.5-A", "1.4.10": "9.1.4.10-A", "1.4.11": "9.1.4.11-A", "1.4.12": "9.1.4.12-A",
  "1.4.13": "9.1.4.13-A",
  "2.1.1": "9.2.1.1-A", "2.1.2": "9.2.1.2-A", "2.1.4": "9.2.1.4-A",
  "2.2.1": "9.2.2.1-A", "2.2.2": "9.2.2.2-A", "2.3.1": "9.2.3.1-A",
  "2.4.1": "9.2.4.1-A", "2.4.2": "9.2.4.2-A", "2.4.3": "9.2.4.3-A",
  "2.4.4": "9.2.4.4-A", "2.4.5": "9.2.4.5-A", "2.4.6": "9.2.4.6-A", "2.4.7": "9.2.4.7-A",
  "2.5.1": "9.2.5.1-A", "2.5.2": "9.2.5.2-A", "2.5.3": "9.2.5.3-A", "2.5.4": "9.2.5.4-A",
  "3.1.1": "9.3.1.1-A", "3.1.2": "9.3.1.2-A",
  "3.2.1": "9.3.2.1-A", "3.2.2": "9.3.2.2-A", "3.2.3": "9.3.2.3-A", "3.2.4": "9.3.2.4-A",
  "3.3.1": "9.3.3.1-A", "3.3.2": "9.3.3.2-A", "3.3.3": "9.3.3.3-A", "3.3.4": "9.3.3.4-A",
  "4.1.1": "9.4.1.1-A", "4.1.3": "9.4.1.3-A"
};

/** Criterios con varias letras posibles: los resuelve `granular()`. */
export const GRANULARES = ["1.1.1", "1.3.1", "4.1.2"];

/** Letras válidas de cada criterio granular, con su significado. */
export const LETRAS = {
  "1.1.1": {
    A: "alternativa textual ausente o incorrecta (caso general)",
    G: "imagen que actúa como enlace",
    K: "imagen decorativa sin marcar como tal"
  },
  "1.3.1": {
    A: "relación programática campo↔etiqueta, pares etiqueta/valor",
    D: "listas no marcadas semánticamente",
    I: "tablas de datos sin encabezados o sin título",
    "Ñ": "agrupaciones de controles sin fieldset/legend",
    Q: "estructura de regiones, navegación, encabezados"
  },
  "4.1.2": {
    A: "nombre y rol",
    B: "estados y propiedades"
  }
};

/* ── Señales estructurales ─────────────────────────────────────────────────
 *
 * La etiqueta sale del locator porque el motor lo construye siempre como
 * `tag`, `tag#id`, `tag.clase` o `tag[type=…]`; si el nodo trae `tag` propio,
 * ese manda. Nada de esto depende de cómo esté redactado el hallazgo.
 */
export function tagDe(node) {
  if (!node) return "";
  if (node.tag) return String(node.tag).toLowerCase();
  const m = /^([a-z][a-z0-9-]*)/i.exec(String(node.locator || ""));
  return m ? m[1].toLowerCase() : "";
}

const TABLA_TAGS = ["table", "th", "td", "tr", "caption", "thead", "tbody", "tfoot"];
const TABLA_ROLES = ["table", "grid", "treegrid", "columnheader", "rowheader", "cell", "gridcell", "row", "rowgroup"];
const LISTA_TAGS = ["ul", "ol", "dl", "li", "dt", "dd"];
const LISTA_ROLES = ["list", "listitem", "definition", "term"];
const REGION_TAGS = ["nav", "main", "header", "footer", "aside", "section", "h1", "h2", "h3", "h4", "h5", "h6"];
const REGION_ROLES = ["navigation", "main", "banner", "contentinfo", "complementary", "region", "heading", "search", "article"];
const GRUPO_TAGS = ["fieldset", "legend", "optgroup"];
const GRUPO_ROLES = ["group", "radiogroup"];

// Tipos de regla del motor que hablan de ESTADOS/propiedades ARIA, no de nombre
// ni de rol. Es lo que separa 9.4.1.2-B de 9.4.1.2-A sin mirar la redacción.
const TIPOS_ESTADO = ["aria-missing-state", "state-invalid", "aria-bad-value", "aria-unknown-attr"];

function enLista(v, lista) { return lista.indexOf(v) !== -1; }

/** Estructura → letra, o null si la estructura no lo decide. */
function porEstructura(crit, node, types) {
  const tag = tagDe(node), role = String((node && node.role) || "").toLowerCase();
  types = types || [];

  if (crit === "1.1.1") {
    if (node && node.enEnlace) return { letra: "G", motivo: "la imagen cuelga de un enlace" };
    // Los hallazgos que vienen de axe traen un selector CSS con la ascendencia
    // («a[href] > img»), donde el dato está a la vista aunque no haya `enEnlace`.
    if (node && /(^|[\s>+~])a\b[^,]*[\s>+~](img|svg)\b/i.test(String(node.locator || ""))) {
      return { letra: "G", motivo: "el selector sitúa la imagen dentro de un enlace" };
    }
    return null; // A vs K es intención: no se decide por estructura
  }

  if (crit === "1.3.1") {
    if (enLista(tag, TABLA_TAGS) || enLista(role, TABLA_ROLES)) return { letra: "I", motivo: "el nodo es una tabla o parte de una tabla" };
    if (enLista(tag, LISTA_TAGS) || enLista(role, LISTA_ROLES) || enLista("list-no-items", types)) return { letra: "D", motivo: "el nodo es una lista o un elemento de lista" };
    if (enLista(tag, GRUPO_TAGS) || enLista(role, GRUPO_ROLES)) return { letra: "Ñ", motivo: "el nodo es una agrupación de controles" };
    if (enLista(tag, REGION_TAGS) || enLista(role, REGION_ROLES)) return { letra: "Q", motivo: "el nodo es una región, navegación o encabezado" };
    return null;
  }

  if (crit === "4.1.2") {
    for (let i = 0; i < types.length; i++) {
      if (enLista(types[i], TIPOS_ESTADO)) return { letra: "B", motivo: "la regla que saltó es de estados/propiedades (" + types[i] + ")" };
    }
    if (types.length) return { letra: "A", motivo: "la regla que saltó es de nombre o rol (" + types.join(", ") + ")" };
    return null;
  }

  return null;
}

/* ── Señales de texto (solo cuando no hay estructura que mirar) ───────────── */

const CLAVES = {
  "1.1.1": [
    { letra: "K", palabras: ["decorativ", "ilustrativ", "aria-hidden", 'alt=""', "alt=''", "fondo", "background", "espaciador"] },
    { letra: "G", palabras: ["imagen enlaz", "logotipo enlaz", "imagen que enlaza", "dentro de un enlace"] }
  ],
  "1.3.1": [
    { letra: "I", palabras: ["tabla de dato", "caption", "<th>", "encabezado de tabla", "encabezados de columna", "tabla"] },
    { letra: "Ñ", palabras: ["fieldset", "legend", "agrupaci", "bloque de campo", "grupo de controles"] },
    { letra: "Q", palabras: ["landmark", "region", "<main", 'role="main', "menú", "navegaci", "miga", "breadcrumb", "encabezado", "jerarquía", "estructura"] },
    { letra: "D", palabras: ["<ul", "<ol", "<dl", "<li", "listado", "lista"] }
  ],
  "4.1.2": [
    { letra: "B", palabras: ["estado", "aria-expanded", "aria-selected", "aria-checked", "aria-pressed", "aria-disabled", "aria-current", "propiedad"] }
  ]
};

/**
 * Texto de la evidencia para buscar palabras clave.
 *
 * OJO: NO se despoja todo lo que parezca una etiqueta. Varias claves de la tabla
 * son literalmente nombres de etiqueta («<ul», «<li», «<th>», «<main»), y al
 * quitarlas antes de buscarlas no podían coincidir jamás: una evidencia que
 * decía «se maquetan con <div> en vez de <ul>» acababa en la letra -Q por la
 * palabra «menú», en vez de en la -D que le toca. Se quitan solo las etiquetas
 * de FORMATO que el propio motor usa como marcado.
 */
const FORMATO = /<\/?(?:code|strong|b|em|i|span|br|small|abbr)(?:\s[^>]*)?>/gi;
function textoDe(finding) {
  const ev = (finding.evid || []).join(" ");
  return String(ev + " " + (finding.detail || "")).replace(FORMATO, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").toLowerCase();
}

/**
 * Una etiqueta nombrada explícitamente pesa más que una palabra corriente.
 *
 * Con el orden de las reglas a secas, «los elementos del menú se maquetan con
 * <div> en vez de <ul>» casaba primero con «menú» (letra -Q) y nunca llegaba a
 * «<ul» (letra -D), que es la que describe el problema. Nombrar el marcado es
 * evidencia más fuerte que un sustantivo de la prosa.
 */
function porTexto(crit, finding) {
  const reglas = CLAVES[crit];
  if (!reglas) return null;
  const t = textoDe(finding);
  let flojo = null;
  for (let i = 0; i < reglas.length; i++) {
    for (let j = 0; j < reglas[i].palabras.length; j++) {
      const kw = reglas[i].palabras[j];
      if (t.indexOf(kw) === -1) continue;
      const hit = { letra: reglas[i].letra, motivo: 'la redacción menciona «' + kw + "»" };
      if (kw.charAt(0) === "<") return hit;      // nombra el marcado: manda
      if (!flojo) flojo = hit;                    // se guarda por si no hay nada mejor
    }
  }
  return flojo;
}

/* ── API ───────────────────────────────────────────────────────────────────── */

/** Cláusula EN sin letra a partir del criterio: 1.3.1 → 9.1.3.1 */
function clausula(crit) { return "9." + crit; }

/**
 * Subcriterio OAW de un hallazgo.
 *
 * @param {object} finding  hallazgo del agente ({ c:{n}, nodes, evid, types })
 * @param {object} [opts]   { overrides: { "<crit>": "9.1.3.1-Q", "<crit>|<locator>": "…" },
 *                            nodo: nodo concreto al que se refiere la fila }
 * @returns {{subcriterio: string|null, via: string, motivo: string}}
 */
export function letraOAW(finding, opts) {
  opts = opts || {};
  if (!finding || !finding.c || !finding.c.n) {
    return { subcriterio: null, via: "sin-criterio", motivo: "el hallazgo no identifica ningún criterio" };
  }
  const crit = finding.c.n;
  const node = opts.nodo || (finding.nodes && finding.nodes[0]) || null;

  // 1) Override del auditor: prioridad absoluta, como en el pipeline manual.
  const ov = opts.overrides || {};
  const claveNodo = node && node.locator ? crit + "|" + node.locator : null;
  if (claveNodo && ov[claveNodo]) return { subcriterio: ov[claveNodo], via: "override", motivo: "override del auditor para este elemento" };
  if (ov[crit]) return { subcriterio: ov[crit], via: "override", motivo: "override del auditor para el criterio" };

  if (NO_EN_PLANTILLA.indexOf(crit) !== -1) {
    return { subcriterio: null, via: "fuera-de-plantilla", motivo: "el criterio " + crit + " no figura en la plantilla OAW R9.Web: se informa por su cláusula EN, sin subcriterio" };
  }

  if (GRANULARES.indexOf(crit) !== -1) {
    const est = porEstructura(crit, node, finding.types);
    if (est) return { subcriterio: clausula(crit) + "-" + est.letra, via: "estructura", motivo: est.motivo };
    const txt = porTexto(crit, finding);
    if (txt) return { subcriterio: clausula(crit) + "-" + txt.letra, via: "texto", motivo: txt.motivo };
    return { subcriterio: clausula(crit) + "-A", via: "general", motivo: "ninguna señal distingue el caso: letra general del criterio" };
  }

  if (MAPA_DIRECTO[crit]) return { subcriterio: MAPA_DIRECTO[crit], via: "directo", motivo: "el criterio tiene un único subcriterio en la plantilla" };

  // Ni granular, ni directo, ni excluido: la tabla no lo cubre. Se dice, no se
  // rellena. Inventar una letra en un entregable con efectos legales es peor
  // que dejar la casilla marcada como pendiente.
  return { subcriterio: null, via: "sin-mapear", motivo: "el criterio " + crit + " no está en la tabla de subcriterios OAW: asígnalo a mano contra la plantilla" };
}

/** Resumen de cómo se asignaron los subcriterios de un lote (para el informe). */
export function resumenAsignacion(filas) {
  const via = {};
  (filas || []).forEach(function (f) {
    // Acepta tanto el resultado de `letraOAW` (`via`) como una fila ya exportada
    // (`oawVia`): si no, el resumen salía contando una clave «undefined».
    const k = f.via || f.oawVia || "desconocida";
    via[k] = (via[k] || 0) + 1;
  });
  return via;
}
