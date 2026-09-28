/**
 * Análisis sobre render REAL.
 *
 * Renderiza una URL (o HTML) en un navegador de verdad y:
 *   1) toma el DOM ya renderizado (post-JS) y lo pasa por el motor determinista;
 *   2) mide contraste/foco/tamaño/orden con getComputedStyle y layout REALES
 *      inyectando el núcleo de medición en la página;
 *   3) opcionalmente corre axe-core sobre la misma página.
 *
 * Es el puente de "componente aislado" a "página real". Solo Node (usa Playwright
 * y, para el motor, el DOMParser de linkedom). La medición inyectada es el mismo
 * código que puede correr la extensión de Chrome sobre una pestaña viva.
 */
import { understand, analyze, setDOMParser, WCAG22 } from "./engine.js";
import { launchOptions } from "./playwright-launch.js";
import { MEASURE_BODY } from "./measure.browser.js";
import { auditPageDoc } from "./page-audit.js";
import { cuadernoDeJuicio, aplicaCuaderno } from "./cuaderno.js";

const WIX = {};
WCAG22.forEach(function (c) { WIX[c.n] = { t: c.t, lvl: c.lvl }; });

function tally(list, key) {
  const t = {};
  (list || []).forEach(function (x) { const k = x[key]; t[k] = (t[k] || 0) + 1; });
  return t;
}
// Gravedad de una barrera detectada por medición. Sin esto las filas de
// "Barreras" del IRA salían con la columna Gravedad en blanco.
const SEV_MEDICION = { "2.1.1": "crítica", "1.4.3": "grave", "1.4.1": "grave", "2.4.7": "grave", "2.4.11": "grave", "2.2.2": "grave", "2.5.8": "moderada", "2.4.3": "moderada" };

// Convierte las mediciones del render real en hallazgos con forma de criterio.
// `__meta` no es un criterio WCAG: es el aviso de cobertura de la medición.
function measurementFindings(measurements) {
  return (measurements || []).filter(function (m) { return m.crit !== "__meta"; }).map(function (m) {
    return {
      c: { n: m.crit, t: (WIX[m.crit] ? WIX[m.crit].t : m.label), lvl: (WIX[m.crit] ? WIX[m.crit].lvl : "AA") },
      verdict: m.verdict,
      sev: m.verdict === "falla" ? (SEV_MEDICION[m.crit] || "grave") : null,
      // El locator viaja también como nodo: la columna "Elemento" del IRA lo necesita.
      nodes: [{ locator: m.node, name: "", path: m.path || "" }],
      evid: [m.node + ": " + m.detail],
      scope: "render", origen: "medición"
    };
  });
}

/**
 * @param {{url?:string, html?:string}} target
 * @param {{ launchOptions?, waitUntil?, timeout?, waitMs?, measureLimit?, axe?:boolean }} [opts]
 */
export async function analyzeRendered(target, opts) {
  opts = opts || {};
  // El motor necesita un DOMParser en Node.
  let DP = (typeof DOMParser !== "undefined") ? DOMParser : null;
  try { const m = await import("linkedom"); DP = m.DOMParser; setDOMParser(DP); } catch (e) { /* en navegador ya existe */ }

  // `opts.page` permite reutilizar una página ya abierta: el orquestador audita
  // una página entera con UN solo Chromium en vez de lanzar uno por fase.
  const prestada = !!opts.page;
  const { chromium } = prestada ? {} : await import("playwright");
  const browser = prestada ? null : await chromium.launch(launchOptions(opts.launchOptions));
  try {
    const page = opts.page || await browser.newPage();
    if (opts.yaAbierta) { /* la página ya está en el destino */ }
    else if (target.url) await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
    else if (target.html != null) await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + target.html + "</body></html>", { waitUntil: "load" });
    else throw new Error("analyzeRendered necesita { url } o { html }");
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

    // 1) DOM renderizado → motor determinista + auditoría de página
    const html = await page.evaluate(function () { return document.documentElement.outerHTML; });
    const model = understand(html);
    const analysis = model ? analyze(model) : { summary: null, findings: [] };

    // Los criterios de ÁMBITO DE PÁGINA (title, lang, landmarks, saltar bloques)
    // solo tienen sentido sobre una página real. Con `{html}` analizamos un
    // FRAGMENTO metido en un documento sintético: auditarlo como página fabricaba
    // barreras que no son del componente (2.4.2 «sin title», 3.1.1, 2.4.1…).
    const pageScope = (opts.pageScope != null) ? !!opts.pageScope : !!target.url;
    let pageAudit = [];
    let cuaderno = null;
    if (pageScope) {
      let docPagina = null;
      try { docPagina = new DP().parseFromString(html, "text/html"); } catch (e) { docPagina = null; }
      if (docPagina) {
        try { pageAudit = auditPageDoc(docPagina); } catch (e) { pageAudit = []; }
        /* El cuaderno de juicio, sobre el MISMO documento y con el CSS ya
         * resuelto por el navegador.
         *
         * Va aquí y no aparte porque aquí está lo que necesita y no hay en
         * ningún otro sitio: el DOM después de ejecutar los scripts, y las
         * reglas de las hojas de estilo externas —que es lo que le hace falta a
         * 2.3.1 para saber si hay animaciones declaradas. Montándolo fuera, con
         * el HTML servido, ese criterio se quedaba corto sin decirlo. */
        if (opts.cuaderno !== false) {
          try {
            const css = await page.evaluate(function () {
              return Array.prototype.map.call(document.styleSheets, function (s) {
                try { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join("\n"); }
                catch (e) { return ""; }   // hoja de otro origen: no se puede leer
              }).join("\n");
            });
            cuaderno = cuadernoDeJuicio(docPagina, { url: target.url || null, css: css });
          } catch (e) { cuaderno = null; }
        }
      }
    }

    // 2) Medición sobre estilos/layout reales.
    //    Vía page.evaluate (CDP): a diferencia de addScriptTag, no la bloquea la CSP.
    const measurements = await page.evaluate(new Function("lim", MEASURE_BODY), opts.measureLimit || 400);
    // TODAS, no la primera: la medición emite hasta tres notas de cobertura
    // (texto recortado por el límite, controles recortados, y 2.4.7 sin el foco
    // del sistema). Con `.find` la segunda y la tercera se perdían en silencio.
    const coberturas = (measurements || []).filter(function (m) { return m.crit === "__meta"; });

    // 3) axe-core (opcional)
    let axe = null;
    if (opts.axe) {
      try {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        const r = await page.evaluate(async function () { return await axe.run(document, { resultTypes: ["violations"] }); });
        axe = r.violations || [];
      } catch (e) { axe = { error: (e && e.message) || String(e) }; }
    }

    // Hallazgos unificados (semántico + página + medición real), listos para el muestreo.
    let findings = (analysis.findings || []).concat(pageAudit).concat(measurementFindings(measurements));
    // El cuaderno sustituye el «requiere evaluación humana» genérico del motor
    // por lo suyo: «no aplica» donde no viene al caso, y el expediente donde sí.
    // No borra ninguna barrera real: eso lo garantiza `aplicaCuaderno`.
    if (cuaderno) findings = aplicaCuaderno(findings, cuaderno);

    return {
      url: target.url || null,
      model: model,
      analysis: analysis,
      pageScope: pageScope,
      pageAudit: pageAudit,
      cuaderno: cuaderno,
      measurements: measurements,
      coberturas: coberturas,
      cobertura: coberturas[0] || null,
      axe: axe,
      findings: findings,
      summary: {
        barreras: analysis.summary ? analysis.summary.falla : 0,
        pagina: tally(pageAudit, "verdict"),
        medicion: tally(measurements, "verdict"),
        axeViolaciones: Array.isArray(axe) ? axe.length : null
      }
    };
  } finally {
    if (browser) await browser.close();
  }
}
