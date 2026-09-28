/**
 * Genera el motor embebido del artifact desde la librería (fuente única de verdad).
 *
 *   node scripts/build-artifact.mjs
 *
 * Toma src/engine.js (ESM, isomorfo) y lo transforma a la forma en línea que usa
 * el HTML del artifact, reemplazando la región entre los marcadores
 * `/* ENGINE:START *​/` … `/* ENGINE:END *​/` de web/agente-a11y.html.
 *
 * Así, web y repo comparten EXACTAMENTE el mismo núcleo: se edita engine.js una
 * vez y este build propaga el cambio a la página.
 */
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENGINE = join(ROOT, "src", "engine.js");
const MEASURE = join(ROOT, "src", "measure.browser.js");
const PAGE = join(ROOT, "web", "agente-a11y.html");

const START = "/* ENGINE:START";
const END = "/* ENGINE:END */";
const M_START = "/* MEASURE:START";
const M_END = "/* MEASURE:END */";
const C_START = "/* CSV:START";
const C_END = "/* CSV:END */";
const REPORT = join(ROOT, "src", "report-oaw.js");

// Transforma el módulo ESM a bloque en línea para el navegador:
//  - quita el bloque de exports públicos
//  - quita el andamiaje de inyección de DOMParser (el navegador lo trae nativo)
//  - quita `esc` (el propio HTML ya lo define en su capa de UI); conserva cssEscape
//  - usa `new DOMParser()` nativo
//  - reindenta 2 espacios para anidar dentro del IIFE del HTML
function toInline(lib) {
  let body = lib.split(/\n\s*\/\* ---- API pública del motor ---- \*\//)[0];

  body = body
    // andamiaje de DOMParser (solo Node)
    .replace(/^let _DOMParser =.*$/m, "")
    .replace(/^\/\*\* Inyecta el constructor DOMParser.*$/m, "")
    .replace(/^export function setDOMParser\(P\) \{ _DOMParser = P; \}$/m, "")
    // esc lo aporta la capa de UI del HTML
    .replace(/^function esc\(s\) \{.*\}$/m, "")
    // DOMParser nativo del navegador
    .replace(/new _DOMParser\(/g, "new DOMParser(")
    // limpia líneas en blanco de más que dejan los recortes
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const indented = body.split("\n").map(function (l) { return l.length ? "  " + l : l; }).join("\n");

  return "  " + START + " — generado desde agente-a11y-motor/src/engine.js · no editar a mano */\n" +
    indented + "\n" +
    "  " + END;
}

function abortar(msg) {
  console.error("✗ build-artifact: " + msg + "\n  No se ha escrito nada; web/agente-a11y.html queda intacto.");
  process.exit(1);
}
function contar(s, needle) {
  let n = 0, i = 0;
  while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

const lib = await readFile(ENGINE, "utf8");
const original = await readFile(PAGE, "utf8");

/**
 * Sustituye una región marcada. Devuelve el texto nuevo o aborta.
 *
 * Los mismos guardas que el motor: los marcadores tienen que existir, aparecer
 * una sola vez y en el orden correcto. Un `slice` con índices invertidos destruía
 * la página y salía con código 0.
 */
function sustituirRegion(texto, ini, fin, contenido, nombre) {
  const nI = contar(texto, ini), nF = contar(texto, fin);
  if (nI === 0 || nF === 0) abortar("no se encontraron los marcadores " + nombre + " en " + PAGE);
  if (nI > 1 || nF > 1) abortar("marcadores " + nombre + " repetidos (inicio ×" + nI + ", fin ×" + nF + "): restaura la página antes de regenerar");
  const si = texto.indexOf(ini), ei = texto.indexOf(fin);
  if (ei < si) abortar("el marcador de fin de " + nombre + " aparece ANTES que el de inicio");
  const desde = texto.lastIndexOf("\n", si) + 1;
  return texto.slice(0, desde) + contenido + texto.slice(ei + fin.length);
}
function compila(js, nombre) {
  try { new Function(js); }
  catch (e) { abortar("el bloque generado de " + nombre + " no compila: " + (e && e.message)); }
}

// ── 1) El motor ────────────────────────────────────────────────────────────
const inline = toInline(lib);
for (const fn of ["function implicitRole", "function understand", "function analyze", "function cssEscape"]) {
  if (inline.indexOf(fn) === -1) abortar("el motor generado no contiene " + fn);
}
// El `export` se busca SOLO en el bloque generado (antes se comparaba contra el
// primer `</script>` de toda la página, que no dice nada sobre este bloque).
const exportSuelto = inline.split("\n").find((l) => /^\s*export[\s{]/.test(l));
if (exportSuelto) abortar("quedó un `export` en el bloque en línea: " + exportSuelto.trim().slice(0, 80));
compila(inline.replace(/^\s*\/\* ENGINE:(START|END)[\s\S]*?\*\/\s*$/gm, ""), "el motor");

let page = sustituirRegion(original, START, END, inline, "ENGINE:START/END");

// ── 2) La capa de medición ─────────────────────────────────────────────────
// El artifact tenía su PROPIA copia de parseColor/contrastOf/runChecks, y llevaba
// meses divergiendo de la librería: su parseColor no entendía `rgb(255 0 0)` (la
// forma moderna de getComputedStyle) y medía el contraste con textContent. Ahora
// también se genera, así que web y repo miden exactamente igual.
const medicion = await readFile(MEASURE, "utf8");
const { MEASURE_FNS } = await import(pathToFileURL(MEASURE).href);
const bloqueMedicion = "  " + M_START + " — generado desde agente-a11y-motor/src/measure.browser.js · no editar a mano */\n" +
  MEASURE_FNS.split("\n").map((l) => (l.length ? "  " + l : l)).join("\n") + "\n" +
  "  " + M_END;
compila(MEASURE_FNS, "la medición");
page = sustituirRegion(page, M_START, M_END, bloqueMedicion, "MEASURE:START/END");

// ── 3) La capa de CSV ──────────────────────────────────────────────────────
// El artifact llevaba su propia copia a mano de `csvCell` y su propio armador de
// filas, FUERA de las regiones generadas y por tanto de las guardas. Ya habían
// divergido en comportamiento: el artifact emitía una fila por HALLAZGO uniendo
// los elementos con " | ", mientras la librería emite una por ELEMENTO. El mismo
// producto daba dos recuentos de barreras distintos según por dónde entraras.
const reporte = await readFile(REPORT, "utf8");
const { csvCell: _cc } = await import(pathToFileURL(REPORT).href);
const csvFuente = (function () {
  // Solo `csvCell` y `toCsv`: lo demás de report-oaw.js depende de imports que el
  // artifact no tiene. La construcción de filas se escribe aquí una vez, sobre
  // ellas, con la MISMA regla de «una fila por elemento».
  const trozo = function (nombre) {
    const i = reporte.indexOf("export function " + nombre + "(");
    if (i === -1) abortar("no se encuentra " + nombre + " en src/report-oaw.js");
    const j = reporte.indexOf("\nexport ", i + 1);
    return reporte.slice(i, j === -1 ? undefined : j).replace(/^export /, "").trimEnd();
  };
  return trozo("csvCell") + "\n" + trozo("toCsv");
})();
const bloqueCsv = "  " + C_START + " — generado desde agente-a11y-motor/src/report-oaw.js · no editar a mano */\n" +
  csvFuente.split("\n").map((l) => (l.length ? "  " + l : l)).join("\n") + "\n" +
  `  // Una fila por ELEMENTO afectado, igual que src/report-oaw.js: un hallazgo
  // con 7 nodos son 7 barreras en el IRA, no una con siete nombres pegados.
  const COLS_CSV = [
    { key: "criterio", label: "Criterio" }, { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" },
    { key: "en", label: "EN 301 549" }, { key: "severidad", label: "Severidad" }, { key: "ambito", label: "Ámbito" },
    { key: "elemento", label: "Elemento" }, { key: "selector", label: "Selector" },
    { key: "evidencia", label: "Evidencia" }, { key: "impacto", label: "Impacto" }, { key: "grupos", label: "Grupos afectados" }
  ];
  function buildBarrierCSV(m, a) {
    const fails = a.findings.filter(function (f) { return f.verdict === "falla"; })
      .sort(function (x, y) { return SEV_RANK[y.sev] - SEV_RANK[x.sev] || cmpSC(x.c.n, y.c.n); });
    const rows = [];
    fails.forEach(function (f) {
      const base = {
        criterio: f.c.n, nombre: f.c.t, nivel: f.c.lvl,
        en: enClause(f.c.n) || "aún no en la EN vigente",
        severidad: f.sev, ambito: f.c.scope,
        evidencia: f.evid.map(stripTags).join(" | "),
        impacto: IMPACT[f.c.n] || "",
        grupos: affectedGroups(f.c).map(function (g) { return GROUP_LABEL[g]; }).join(", ")
      };
      const nodes = (f.nodes && f.nodes.length) ? f.nodes : [null];
      nodes.forEach(function (nd) {
        rows.push(Object.assign({}, base, {
          elemento: nd ? (nd.locator + (nd.name ? " «" + nd.name + "»" : "")) : "",
          selector: (nd && (nd.path || nd.uid)) || ""
        }));
      });
    });
    return toCsv(rows, COLS_CSV);
  }` + "\n" +
  "  " + C_END;
compila(csvFuente, "la capa de CSV");
page = sustituirRegion(page, C_START, C_END, bloqueCsv, "CSV:START/END");

// ── 4) La página resultante sigue en pie ───────────────────────────────────
for (const [a, b, n] of [[START, END, "ENGINE"], [M_START, M_END, "MEASURE"], [C_START, C_END, "CSV"]]) {
  if (contar(page, a) !== 1 || contar(page, b) !== 1) abortar("el resultado no tiene exactamente un par de marcadores " + n);
}
if (page.length < original.length * 0.5) abortar("el resultado perdería más de la mitad de la página (" + original.length + " → " + page.length + ")");

await writeFile(PAGE, page, "utf8");
console.log("✓ Motor (" + inline.length + "), medición (" + bloqueMedicion.length + ") y CSV (" + bloqueCsv.length + ") inyectados en web/agente-a11y.html\n" +
  "  fuentes: src/engine.js (" + lib.length + ") · src/measure.browser.js (" + medicion.length + ")\n" +
  "  página: " + original.length + " → " + page.length);
