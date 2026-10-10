/**
 * Cruce con axe-core — segunda fuente determinista.
 *
 * El motor razona sobre el árbol de accesibilidad (nombre, rol, estado, anuncio
 * del lector). axe-core comprueba reglas sobre el DOM renderizado. Cruzarlos por
 * criterio WCAG reduce falsos positivos/negativos y hace explícitas las zonas en
 * las que cada fuente ve algo que la otra no.
 *
 * La reconciliación es pura y testeable sin navegador. El render real lo aporta
 * un `runAxe(html) → violations[]` inyectable; aquí se incluye un adaptador con
 * Playwright (Chromium headless), el mismo camino que usará el puente Guidepup.
 */

import { understand, analyze } from "./engine.js";
import { launchOptions } from "./playwright-launch.js";
import { axeViolationsBySC } from "./axe-map.js";

/**
 * Reconcilia los hallazgos del motor con las violaciones de axe, por criterio.
 * @param {Array} engineFallas  findings del motor con verdict "falla".
 * @param {Array} axeViolations resultado de axe.run().violations.
 */
export function reconcile(engineFallas, axeViolations) {
  const engineBySC = new Map();
  (engineFallas || []).forEach(function (f) {
    if (!engineBySC.has(f.c.n)) engineBySC.set(f.c.n, { sc: f.c.n, title: f.c.t, sev: f.sev, findings: [] });
    engineBySC.get(f.c.n).findings.push(f);
  });
  const axeBySC = axeViolationsBySC(axeViolations);

  const agreements = [];
  const onlyEngine = [];
  const onlyAxe = [];
  const agreedRuleIds = new Set();

  engineBySC.forEach(function (e, sc) {
    if (axeBySC.has(sc)) {
      const rules = axeBySC.get(sc).rules;
      rules.forEach(function (r) { agreedRuleIds.add(r.id); });
      /* «Acuerdo» es que las dos fuentes señalan el mismo CRITERIO, no el mismo
       * elemento, y eso hay que decirlo donde se lee.
       *
       * `agreements` se construye solo porque coincide el número de criterio:
       * comprobado, el motor acusando a `img.logo` y axe a otro `img` de la
       * página salen como «acuerdo: 1». No se pueden comparar los elementos aquí
       * —axe los nombra con su propio selector mínimo y el motor con su ruta
       * canónica, y casarlos exige la página abierta, que es lo que hace
       * `audit-run`—, así que lo que se publica es cuántos elementos trae cada
       * fuente y que la coincidencia NO está comprobada a nivel de elemento. */
      const nMotor = e.findings.reduce(function (n, f) { return n + ((f.nodes && f.nodes.length) || 0); }, 0);
      const nAxe = rules.reduce(function (n, r) { return n + (r.nodes || 0); }, 0);
      agreements.push({
        sc: sc, title: e.title, sev: e.sev, axeRules: rules,
        nivel: "criterio",
        elementos: { motor: nMotor, axe: nAxe, coinciden: null }
      });
    } else {
      onlyEngine.push({ sc: sc, title: e.title, sev: e.sev });
    }
  });
  // Una regla de axe con varios criterios ya reconciliada bajo uno no debe
  // reaparecer como divergencia "solo-axe" bajo sus otros criterios.
  axeBySC.forEach(function (a, sc) {
    if (engineBySC.has(sc)) return;
    const newRules = a.rules.filter(function (r) { return !agreedRuleIds.has(r.id); });
    if (newRules.length) onlyAxe.push({ sc: sc, rules: newRules });
  });

  const cmp = function (x, y) { return scOrder(x.sc) - scOrder(y.sc); };
  agreements.sort(cmp); onlyEngine.sort(cmp); onlyAxe.sort(cmp);

  return {
    agreements: agreements,
    onlyEngine: onlyEngine,
    onlyAxe: onlyAxe,
    summary: {
      acuerdo: agreements.length, soloMotor: onlyEngine.length, soloAxe: onlyAxe.length,
      // Para que nadie lea «acuerdo» como «las dos fuentes señalan lo mismo».
      nivel: "criterio",
      nota: "El acuerdo es por CRITERIO: las dos fuentes señalan el mismo subcriterio, no necesariamente el mismo elemento. Casar los elementos exige la página abierta (lo hace la orquestación, no esta reconciliación)."
    }
  };
}

function scOrder(n) {
  const p = String(n).split(".").map(Number);
  return (p[0] || 0) * 10000 + (p[1] || 0) * 100 + (p[2] || 0);
}

/**
 * Cruce completo de un componente: corre el motor y `runAxe`, y reconcilia.
 * @param {string} html
 * @param {{ runAxe: (html:string)=>Promise<Array>|Array }} opts
 */
export async function crossCheck(html, opts) {
  if (!opts || typeof opts.runAxe !== "function") {
    throw new Error("crossCheck necesita opts.runAxe(html) → violations[]");
  }
  /* Si el motor NO ha llegado a construir el modelo, se dice.
   *
   * `understand()` devuelve `null` cuando no hay ni un elemento expuesto (texto
   * suelto, un comentario, cadena vacía), y aquí se fabricaba `{findings: []}`
   * que entraba en la reconciliación como si fuera una comprobación completa y
   * limpia: `soloMotor: 0` se lee «el motor comprobó y no encontró nada», y era
   * «el motor no miró nada». Sin error, sin aviso y sin contador. */
  const model = understand(html);
  const motorMiro = !!model;
  const engine = model ? analyze(model) : { summary: null, findings: [] };
  const engineFallas = engine.findings.filter(function (f) { return f.verdict === "falla"; });
  const violations = await opts.runAxe(html);
  const rec = reconcile(engineFallas, violations);
  if (!motorMiro) {
    rec.motorSinModelo = true;
    rec.summary.motorSinModelo = true;
    rec.summary.nota = "El motor NO ha construido ningún modelo de accesibilidad para este marcado (no hay un solo elemento expuesto), así que «soloMotor: 0» no significa que no haya encontrado nada: significa que no ha mirado nada. " + rec.summary.nota;
  }
  return { model: model, motorMiro: motorMiro, engine: engine, axeViolations: violations, reconciliation: rec };
}

/**
 * Adaptador Playwright: renderiza el componente en Chromium headless, inyecta
 * axe-core y devuelve las violaciones. Import perezoso para que la reconciliación
 * y sus tests no dependan de Playwright ni de un navegador instalado.
 *
 * @param {string} html
 * @param {{ launchOptions?: object, axePath?: string, context?: object }} [opts]
 */
export async function runAxeWithPlaywright(html, opts) {
  opts = opts || {};
  const { chromium } = await import("playwright");
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const axePath = opts.axePath || require.resolve("axe-core/axe.min.js");

  const browser = await chromium.launch(launchOptions(opts.launchOptions));
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' +
      String(html || "") + "</body></html>",
      { waitUntil: "load" }
    );
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async function () {
      /* global axe, document */
      return await axe.run(document.body, {
        resultTypes: ["violations"],
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
      });
    });
    return result.violations || [];
  } finally {
    await browser.close();
  }
}
