/**
 * Puente a los entregables OAW / IRA (UNE-EN 301 549 v3.2.1, RD 1112/2018).
 *
 * Transforma los hallazgos del agente a la forma que consumen los informes de
 * auditoría: una hoja de "Barreras" (una fila por barrera, con su subcriterio
 * EN `9.X.Y.Z`) y una hoja de "Seguimiento" (resultado agregado por subcriterio,
 * estilo WCAG-EM). Emite CSV para Excel en español (BOM + `;` + CRLF) y JSON.
 *
 * El mapeo llega a la letra del OAW (`9.X.Y.Z-A/-B…`, ver `oaw-letters.js`),
 * resuelta por cada fila a partir de lo que el motor comprobó, con la vía de
 * asignación en su propia columna. El formato exacto de tus plantillas lo aplican
 * las skills de Informe de Hallazgos / IRA; esto les da la materia prima ya
 * normalizada. Los 6 criterios nuevos de WCAG 2.2 no están en la EN vigente:
 * se marcan `enEN:false` y se separan (el IRA solo cubre cláusulas EN).
 *
 * Política de fallo seguro: solo `cumple` y `pasa` se exportan como "Correcto".
 * `humano`, `revisar`, `cumple-parcial` y cualquier veredicto desconocido salen
 * como "No se puede comprobar" — un criterio no evaluado jamás se declara
 * conforme en un entregable con efectos legales.
 */
import { enClause, cmpSC, WCAG22 } from "./engine.js";
import { worseOf } from "./verdicts.js";
import { letraOAW, resumenAsignacion } from "./oaw-letters.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = c; });

/**
 * Quita el marcado de la evidencia, pero SOLO el que el motor pone como marcado.
 *
 * Varias capas escriben el nombre de una etiqueta como contenido: «La página no
 * tiene <title> en <head>», «No hay landmark <main>». Un `replace(/<[^>]*>/g)`
 * a secas se los comía y la evidencia llegaba al informe como «La página no
 * tiene  en  o está vacío».
 */
const ETIQUETAS_DEL_MOTOR = /<\/?(?:code|strong|b|em|i|span|br|p|ul|ol|li|small|abbr)(?:\s[^>]*)?>/gi;
function stripTags(s) {
  return String(s == null ? "" : s).replace(ETIQUETAS_DEL_MOTOR, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
// Gravedad del agente → clasificación de la barrera.
const GRAVEDAD = { "crítica": "Crítica", grave: "Grave", moderada: "Moderada", leve: "Leve" };

/** Veredicto agregado → resultado OAW. */
export function resultadoOAW(worst) {
  if (worst == null) return "No evaluado";
  if (worst === "falla") return "Falla";
  if (worst === "no-aplica") return "No aplica";
  if (worst === "cumple" || worst === "pasa") return "Correcto";
  if (worst === "humano") return "No se puede comprobar (evaluación humana)";
  if (worst === "cumple-parcial") return "No se puede comprobar (presencia correcta; calidad pendiente)";
  // `revisar` y cualquier veredicto no reconocido
  return "No se puede comprobar (revisión manual)";
}

// Nº de instancias de barrera que representa un hallazgo (un nodo = una barrera).
function instancias(f) {
  return (f.nodes && f.nodes.length) ? f.nodes.length : 1;
}

/**
 * Una fila de "Barreras" por cada ELEMENTO afectado (no por criterio): en un IRA
 * cada instancia es una fila. Un hallazgo con 7 nodos produce 7 filas.
 */
export function barreras(findings, ctx) {
  ctx = ctx || {};
  const rows = [];
  (findings || [])
    .filter(function (f) { return f.verdict === "falla"; })
    .forEach(function (f) {
      const n = f.c.n;
      const en = enClause(n);
      const evidencia = (f.evid || []).map(stripTags).join(" ");
      const base = {
        subcriterio: en || "",
        enEN: !!en,
        criterio: n,
        nombre: f.c.t,
        nivel: f.c.lvl,
        gravedad: GRAVEDAD[f.sev] || (f.sev || "Sin clasificar"),
        ambito: f.scope || f.origen || "componente",
        // El dato del hallazgo manda sobre el del contexto: `auditSite` sella
        // cada hallazgo con SU página, y los de coherencia con «(toda la
        // muestra)». Al revés, todas las filas salían con la misma URL.
        pagina: f.url || ctx.url || "",
        evidencia: evidencia
      };
      const nodes = (f.nodes && f.nodes.length) ? f.nodes : [null];
      nodes.forEach(function (nd) {
        // La letra se resuelve POR FILA, no por criterio: dos barreras del mismo
        // 1.3.1 pueden ser `-I` (una tabla) y `-D` (una lista).
        const oaw = letraOAW(f, { overrides: ctx.overrides, nodo: nd });
        rows.push(Object.assign({}, base, {
          elemento: nd ? (nd.locator + (nd.name ? " «" + nd.name + "»" : "")) : "",
          // El locator se lee; el selector IDENTIFICA. Dos <img> sin id ni clase
          // son las dos «img», y con eso no se puede ir a buscar el elemento.
          selector: (nd && (nd.path || nd.uid)) || "",
          subcriterioOAW: oaw.subcriterio || "",
          oawVia: oaw.via,
          oawMotivo: oaw.motivo
        }));
      });
    });
  return rows.sort(function (a, b) { return cmpSC(a.criterio, b.criterio); });
}

// Una fila de "Seguimiento" por subcriterio EN aplicable, con el resultado agregado.
/**
 * @param {Array} findings
 * @param {{ todosLosCriterios?: boolean }} [opts] Con `todosLosCriterios` se
 *   emite además una fila «No evaluado» por cada criterio de los 55 que no
 *   aparece en ningún hallazgo. Sin ella, la diferencia entre «comprobado y
 *   correcto» y «nadie lo miró» se perdía justo en el entregable: los criterios
 *   ausentes no generaban fila, y la rama «No evaluado» era código muerto.
 */
export function seguimiento(findings, opts) {
  const by = {};
  (findings || []).forEach(function (f) {
    const n = f.c.n;
    // `worst: null` = aún no evaluado; el primer hallazgo lo fija.
    if (!by[n]) by[n] = { criterio: n, nombre: f.c.t, nivel: f.c.lvl, worst: null, n: 0 };
    by[n].worst = worseOf(by[n].worst, f.verdict);
    if (f.verdict === "falla") by[n].n += instancias(f);
  });
  if (opts && opts.todosLosCriterios) {
    WCAG22.forEach(function (c) {
      if (!by[c.n]) by[c.n] = { criterio: c.n, nombre: c.t, nivel: c.lvl, worst: null, n: 0 };
    });
  }
  return Object.keys(by).map(function (k) { return by[k]; })
    .sort(function (a, b) { return cmpSC(a.criterio, b.criterio); })
    .map(function (r) {
      const en = enClause(r.criterio);
      return {
        subcriterio: en || "",
        enEN: !!en,
        criterio: r.criterio,
        nombre: r.nombre,
        nivel: r.nivel,
        veredicto: r.worst,
        resultado: resultadoOAW(r.worst),
        num_barreras: r.n
      };
    });
}

/**
 * Celda CSV.
 *
 * Además del entrecomillado, neutraliza la INYECCIÓN DE FÓRMULAS: las evidencias
 * llevan texto tomado de sitios ajenos (nombres accesibles, contenidos), y Excel
 * o Calc ejecutan como fórmula cualquier celda que empiece por `=`, `+`, `-`, `@`
 * o un control. Se antepone un apóstrofo —convención de las hojas de cálculo—
 * salvo si la celda es un número legítimo.
 */
export function csvCell(s) {
  s = String(s == null ? "" : s);
  let peligrosa = false;
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) { s = "'" + s; peligrosa = true; }
  // Una celda neutralizada va SIEMPRE entrecomillada: así Excel y Calc la importan
  // como texto literal y el apóstrofo hace su trabajo.
  return (peligrosa || /[";\n\r]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows, columns) {
  const head = columns.map(function (c) { return c.label; });
  const lines = [head.map(csvCell).join(";")];
  rows.forEach(function (r) { lines.push(columns.map(function (c) { return csvCell(r[c.key]); }).join(";")); });
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const COLS_BARRERAS = [
  { key: "subcriterio", label: "Subcriterio EN (9.X.Y.Z)" },
  { key: "subcriterioOAW", label: "Subcriterio OAW (9.X.Y.Z-L)" },
  { key: "oawVia", label: "Asignado por" },
  { key: "enEN", label: "En la EN vigente" },
  { key: "criterio", label: "Criterio WCAG" },
  { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" }, { key: "gravedad", label: "Gravedad" },
  { key: "ambito", label: "Ámbito" }, { key: "pagina", label: "Página" }, { key: "elemento", label: "Elemento" },
  { key: "selector", label: "Selector" },
  { key: "evidencia", label: "Evidencia" }
];
const COLS_SEGUIMIENTO = [
  { key: "subcriterio", label: "Subcriterio EN (9.X.Y.Z)" }, { key: "enEN", label: "En la EN vigente" },
  { key: "criterio", label: "Criterio WCAG" },
  { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" }, { key: "resultado", label: "Resultado" },
  { key: "num_barreras", label: "Nº barreras" }
];

/**
 * Exporta los hallazgos a la forma OAW/IRA.
 * @param {Array} findings  hallazgos del agente (unificados)
 * @param {{ url?:string, overrides?:object }} [ctx]  `overrides` fija el
 *   subcriterio OAW a mano: por criterio (`"1.3.1"`) o por elemento
 *   (`"1.3.1|nav.principal"`), y gana sobre cualquier asignación automática.
 */
export function oawExport(findings, ctx) {
  ctx = ctx || {};
  const b = barreras(findings, ctx);
  const s = seguimiento(findings, { todosLosCriterios: ctx.todosLosCriterios !== false });
  // Solo los EVALUADOS: desde que el Seguimiento emite fila para los 55
  // criterios, listar aquí los seis que no están en la EN vigente aunque nadie
  // los haya mirado convertía un dato útil («esto se ha evaluado y no cabe en el
  // IRA») en una constante.
  const fueraEN = s.filter(function (r) { return !r.enEN && r.veredicto != null; }).map(function (r) { return r.criterio; });
  // Las filas que se quedaron sin subcriterio OAW no se esconden: son justo las
  // que hay que mirar a mano contra la plantilla antes de entregar.
  const sinSubcriterio = b.filter(function (r) { return !r.subcriterioOAW; })
    .map(function (r) { return { criterio: r.criterio, elemento: r.elemento, motivo: r.oawMotivo }; });
  return {
    barreras: b,
    seguimiento: s,
    fueraDeEN: fueraEN, // criterios WCAG 2.2 aún no en la EN vigente
    oaw: { asignacion: resumenAsignacion(b), sinSubcriterio: sinSubcriterio },
    noEvaluados: s.filter(function (r) { return r.veredicto == null; }).map(function (r) { return r.criterio; }),
    csv: { barreras: toCsv(b, COLS_BARRERAS), seguimiento: toCsv(s, COLS_SEGUIMIENTO) }
  };
}
