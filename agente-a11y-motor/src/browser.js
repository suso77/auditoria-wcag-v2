/**
 * Entrada para NAVEGADOR (y para la extensión de Chrome).
 *
 * Solo los módulos isomorfos. `index.js` reexporta además los drivers de Node
 * (render real, prueba dinámica, puente Guidepup), que hacen `import("playwright")`
 * y `import("linkedom")`: un empaquetador para navegador intentaba resolverlos y
 * arrastraba Playwright entero al bundle. Aquí no entran.
 *
 *   import { understand, analyze, MEASURE_SRC } from "agente-a11y-motor/browser";
 */
export * from "./engine.js";
export * from "./verdicts.js";
export * from "./axe-map.js";
export * from "./reader-lexicon.js";
export * from "./measure.browser.js";
export * from "./page-audit.js";
export * from "./sample-audit.js";
export * from "./dynamic.js";
export * from "./viewport.js";
export * from "./coherence.js";
export * from "./sampling.js";
export * from "./report-oaw.js";
