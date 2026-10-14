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
function filasPorElemento(findings, ctx) {
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
      /* Lo que no se puede atribuir a un elemento acompaña a TODAS las filas:
       * una observación estructural del documento («hay contenido enfocable
       * dentro de un subárbol oculto») no es de ninguna fila en particular. */
      const sueltas = (f.evidSinNodo || []).map(stripTags);
      const nodes = (f.nodes && f.nodes.length) ? f.nodes : [null];
      nodes.forEach(function (nd) {
        /* Cada fila con la evidencia de SU elemento.
         *
         * Antes las N filas de un hallazgo salían todas con la unión de los
         * mensajes del criterio. Cuando el nodo no trae los suyos —las capas de
         * medición arman sus hallazgos de otra manera— se mantiene la evidencia
         * completa, que es lo que había: menos preciso, nunca menos. */
        const propias = (nd && nd.evid && nd.evid.length) ? nd.evid.map(stripTags).concat(sueltas) : null;
        // La letra se resuelve POR FILA, no por criterio: dos barreras del mismo
        // 1.3.1 pueden ser `-I` (una tabla) y `-D` (una lista).
        const oaw = letraOAW(f, { overrides: ctx.overrides, nodo: nd });
        rows.push(Object.assign({}, base, {
          // Y el NODO manda sobre el hallazgo, cuando sabe de qué página es. El
          // cuaderno de la muestra sella sus hallazgos como «(toda la muestra)»
          // —el criterio es del sitio— pero cada elemento del expediente viene de
          // una página concreta. Sin esto, un `falla` firmado sobre veinte
          // enlaces dejaba veinte filas con la Página sin resolver, que es justo
          // el dato que hace falta para ir a arreglarlo.
          pagina: (nd && nd.url) || base.pagina,
          evidencia: propias ? propias.join(" ") : base.evidencia,
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
  return rows;
}

/**
 * Una fila por ELEMENTO afectado, que es la forma que pide un IRA.
 */
export function barreras(findings, ctx) {
  const rows = filasPorElemento(findings, ctx);

  /* QUE CADA FILA SE PUEDA DISTINGUIR DE LA DE AL LADO.
   *
   * Medido sobre una auditoría real de diez páginas: 320 de 522 filas llevaban
   * un párrafo IDÉNTICO al de otra fila. Y no era un error de medición —son
   * elementos distintos y la frase es verdad en todos—, sino que la frase no los
   * distingue: 63 enlaces `a.red-link` con el mismo color dan 63 veces «ratio
   * 3.38:1 … rgb(231 30 15) sobre rgb(28 36 55)», y los 63 de axe dan 63 veces
   * «Links must have discernible text». En el Word eso son 63 párrafos iguales y
   * quien lee uno no sabe cuál de los 63 elementos es el suyo.
   *
   * Arreglarlo capa por capa fue un error mío: en v0.55.0 toqué la de adaptación
   * y me dejé 18 filas allí mismo, porque dos elementos pueden compartir
   * `locator` y medida («p» + «96 px de alto ocultos»). El sitio donde esto se
   * resuelve de una vez es AQUÍ, que es donde nacen las filas.
   *
   * Lo único garantizado único es el selector, así que se añade cuando hace
   * falta — y SOLO cuando hace falta: si la frase ya distingue, no se toca. */
  const porFrase = {};
  rows.forEach(function (r) {
    const k = r.criterio + "|" + r.pagina + "|" + r.evidencia;
    (porFrase[k] = porFrase[k] || []).push(r);
  });
  Object.keys(porFrase).forEach(function (k) {
    const g = porFrase[k];
    if (g.length < 2) return;
    /* Y antes de añadir nada: ¿distingue ya la columna «Elemento»? En las filas
     * de axe sí —el propio atributo que falta va ahí, `a[alt="…"]`— y entonces
     * la fila SE distingue, aunque el párrafo se repita. Añadirle una cola
     * sería repetir una columna que el informe ya trae. Se toca solo lo que de
     * verdad no se puede separar. */
    const elems = g.map(function (r) { return r.elemento || ""; });
    if (new Set(elems).size === g.length && elems.every(Boolean)) return;
    g.forEach(function (r, i) {
      const cola = r.selector || ("elemento " + (i + 1) + " de " + g.length);
      r.evidencia = (r.evidencia ? r.evidencia + " " : "") +
        "[este elemento, de " + g.length + " con la misma medida: " + cola + "]";
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
 * @param {{ todosLosCriterios?: boolean,
 *           muestra?: { paginas?: number, paginasAnalizadas?: number, sinAnalizar?: Array } }} [opts]
 *   `muestra` es el rollup de la muestra (`rollupSample`). Con él, la hoja de
 *   Seguimiento sabe sobre CUÁNTAS páginas se está pronunciando.
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
  /* La COBERTURA de la muestra entra en la hoja.
   *
   * Si tres de las diez páginas no se llegaron a analizar, un criterio que sale
   * bien en las siete restantes se exportaba como «Correcto», a secas, en una
   * hoja que no dice en ninguna parte que faltan tres páginas. El rollup sí lo
   * dice («Incompleta: 3 de 10…»), pero eso vive en otro objeto y no viaja con
   * la fila. Un «Correcto» sin cobertura al lado es una afirmación que el agente
   * no puede sostener, así que mientras la muestra esté incompleta no se emite:
   * la conformidad se queda en «No se puede comprobar», con el motivo. Las
   * barreras NO se tocan: una barrera encontrada en siete páginas sigue siendo
   * una barrera, y «No aplica» tampoco, que es una afirmación sobre lo que hay.
   */
  const m = (opts && opts.muestra) || null;
  const totalPag = m && m.paginas != null ? m.paginas : null;
  const vistas = m && m.paginasAnalizadas != null ? m.paginasAnalizadas : totalPag;
  const incompleta = totalPag != null && vistas != null && vistas < totalPag;
  const cobertura = totalPag == null ? "" : vistas + " de " + totalPag + " página(s) analizadas";
  return Object.keys(by).map(function (k) { return by[k]; })
    .sort(function (a, b) { return cmpSC(a.criterio, b.criterio); })
    .map(function (r) {
      const en = enClause(r.criterio);
      let resultado = resultadoOAW(r.worst);
      if (incompleta && (r.worst === "cumple" || r.worst === "pasa")) {
        resultado = "No se puede comprobar (muestra incompleta: " + cobertura + ")";
      }
      return {
        subcriterio: en || "",
        enEN: !!en,
        criterio: r.criterio,
        nombre: r.nombre,
        nivel: r.nivel,
        veredicto: r.worst,
        resultado: resultado,
        cobertura: cobertura,
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

/**
 * UNA FILA POR FAMILIA DE BARRERA, EN VEZ DE UNA POR ELEMENTO.
 *
 * Decisión suya, tomada con los números delante: en la auditoría real, 63
 * enlaces `a.red-link` con el mismo color producían 63 filas con la misma
 * medida, y otras 63 de axe con el mismo «Links must have discernible text».
 * Son 63 instancias de UNA barrera, y el informe las contaba como 63 problemas
 * distintos. Medido sobre esas 522 filas: agrupando quedan 202.
 *
 * LA IDENTIDAD DE UNA FAMILIA es criterio + página + la medida. La página entra
 * porque un IRA se afirma por página y porque arreglarlo en una no lo arregla en
 * las otras; la medida es el texto de la evidencia, que es justo lo que dice qué
 * le pasa al elemento («ratio 3.38:1 — rgb(231 30 15) sobre rgb(28 36 55)»).
 *
 * Y LO QUE NO SE PUEDE PERDER AL AGRUPAR: los elementos. En el grupo de axe los
 * 63 son distintos —cada uno con su `alt`— y fundirlos sin más borraría 62
 * datos que hacen falta para arreglarlo. Así que la fila agrupada lleva el
 * recuento, TODOS los selectores y TODOS los elementos, y el primero de cada
 * uno repetido en las columnas de siempre para que lo que ya leía el CSV siga
 * leyéndolo.
 */
const TOPE_SELECTORES = 10;
export function barrerasAgrupadas(findings, ctx) {
  const rows = filasPorElemento(findings, ctx);
  const grupos = [];
  const ix = {};
  rows.forEach(function (r) {
    const k = [r.criterio, r.pagina, r.evidencia, r.subcriterioOAW || ""].join("\u0000");
    if (ix[k] === undefined) { ix[k] = grupos.length; grupos.push([]); }
    grupos[ix[k]].push(r);
  });
  const out = grupos.map(function (g) {
    const p = g[0];
    const sels = g.map(function (r) { return r.selector || ""; }).filter(Boolean);
    const els = g.map(function (r) { return r.elemento || ""; }).filter(Boolean);
    const elsUnicos = [];
    els.forEach(function (e) { if (elsUnicos.indexOf(e) === -1) elsUnicos.push(e); });
    return Object.assign({}, p, {
      instancias: g.length,
      /* La columna «Elemento» sigue siendo legible de un vistazo: el primero, y
       * cuántos más hay cuando son distintos entre sí. Si los 63 son el mismo
       * `a.red-link`, repetirlo 63 veces no dice nada que el recuento no diga. */
      elemento: elsUnicos.length > 1
        ? elsUnicos[0] + " y " + (elsUnicos.length - 1) + " más"
        : (elsUnicos[0] || p.elemento || ""),
      elementos: elsUnicos.join(" · "),
      selector: sels[0] || "",
      selectores: sels,
      /* Y la versión para la hoja de cálculo, RECORTADA. Medido sobre la
       * auditoría real: la familia mayor tiene 63 rutas y son 15 108 caracteres
       * en una celda. Cabe en el límite de Excel (32 767) pero no se puede leer
       * ni usar, y hay herramientas que se atragantan. En el CSV van las diez
       * primeras y el aviso de dónde están todas; la lista completa se queda en
       * el JSON, que es donde se va a buscar con un programa. */
      selectoresCsv: sels.length > TOPE_SELECTORES
        ? sels.slice(0, TOPE_SELECTORES).join(" · ") + " · … y " + (sels.length - TOPE_SELECTORES) +
          " más (las " + sels.length + " están en el JSON, campo `selectores`)"
        : sels.join(" · "),
      elementosCsv: elsUnicos.length > TOPE_SELECTORES
        ? elsUnicos.slice(0, TOPE_SELECTORES).join(" · ") + " · … y " + (elsUnicos.length - TOPE_SELECTORES) + " más"
        : elsUnicos.join(" · "),
      /* El recuento va también en la evidencia: el Word y el IRA leen ese texto,
       * y «63 elementos» es parte del hallazgo, no un adorno de la hoja. */
      evidencia: g.length > 1
        ? p.evidencia + " [" + g.length + " elementos con esta misma medida en esta página]"
        : p.evidencia
    });
  });
  return out.sort(function (a, b) {
    const c = cmpSC(a.criterio, b.criterio);
    return c !== 0 ? c : b.instancias - a.instancias;
  });
}

const COLS_AGRUPADAS = [
  { key: "subcriterio", label: "Subcriterio EN (9.X.Y.Z)" },
  { key: "subcriterioOAW", label: "Subcriterio OAW (9.X.Y.Z-L)" },
  { key: "oawVia", label: "Asignado por" },
  { key: "enEN", label: "En la EN vigente" },
  { key: "criterio", label: "Criterio WCAG" },
  { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" }, { key: "gravedad", label: "Gravedad" },
  { key: "ambito", label: "Ámbito" }, { key: "pagina", label: "Página" },
  { key: "instancias", label: "Nº de elementos" },
  { key: "elemento", label: "Elemento" },
  { key: "elementosCsv", label: "Todos los elementos" },
  { key: "selector", label: "Selector" },
  { key: "selectoresCsv", label: "Todos los selectores" },
  { key: "evidencia", label: "Evidencia" }
];

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
  // La cobertura, al lado del resultado: quien lee la hoja tiene que poder ver
  // sobre cuántas páginas se está afirmando cada cosa sin salir de la fila.
  { key: "cobertura", label: "Cobertura de la muestra" },
  { key: "num_barreras", label: "Nº barreras" }
];

/**
 * Exporta los hallazgos a la forma OAW/IRA.
 * @param {Array} findings  hallazgos del agente (unificados)
 * @param {{ url?:string, overrides?:object, muestra?:object }} [ctx]  `overrides`
 *   fija el subcriterio OAW a mano: por criterio (`"1.3.1"`) o por elemento
 *   (`"1.3.1|nav.principal"`), y gana sobre cualquier asignación automática.
 *   `muestra` es el rollup (`rollupSample`): con él la hoja de Seguimiento
 *   declara su cobertura y no exporta «Correcto» sobre una muestra incompleta.
 */
export function oawExport(findings, ctx) {
  ctx = ctx || {};
  const b = barreras(findings, ctx);
  /* Las dos formas, SIEMPRE, y en el mismo viaje.
   *
   * El informe por elemento es el que pide un IRA y el que leen la plantilla
   * OAW y el informe de hallazgos; el agrupado es el que se lee. Elegir una y
   * tirar la otra obligaría a volver a auditar el sitio —seis minutos y diez
   * páginas— solo para cambiar de forma, y eso no es una decisión que deba
   * tomar el motor: se entregan las dos y decide quien firma. */
  const ag = barrerasAgrupadas(findings, ctx);
  const s = seguimiento(findings, { todosLosCriterios: ctx.todosLosCriterios !== false, muestra: ctx.muestra || null });
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
    barrerasAgrupadas: ag,
    seguimiento: s,
    fueraDeEN: fueraEN, // criterios WCAG 2.2 aún no en la EN vigente
    oaw: { asignacion: resumenAsignacion(b), sinSubcriterio: sinSubcriterio },
    noEvaluados: s.filter(function (r) { return r.veredicto == null; }).map(function (r) { return r.criterio; }),
    csv: {
      barreras: toCsv(b, COLS_BARRERAS),
      barrerasAgrupadas: toCsv(ag, COLS_AGRUPADAS),
      seguimiento: toCsv(s, COLS_SEGUIMIENTO)
    }
  };
}
