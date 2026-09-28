/**
 * Punto de entrada público del motor.
 *
 * En el navegador basta con `import { understand, analyze } from "agente-a11y-motor"`.
 * En Node hay que inyectar un DOMParser antes de usarlo:
 *
 *   import { DOMParser } from "linkedom";
 *   import { setDOMParser, understand, analyze } from "agente-a11y-motor";
 *   setDOMParser(DOMParser);
 *   const modelo = understand('<button><svg/></button>');
 *   const informe = analyze(modelo);
 */
export * from "./engine.js";
export * from "./verdicts.js";
export * from "./playwright-launch.js";
export * from "./axe-map.js";
export * from "./axe-cross.js";
export * from "./reader-lexicon.js";
export * from "./guidepup-bridge.js";
export * from "./measure.browser.js";
export * from "./page-audit.js";
export * from "./render-analyze.js";
export * from "./sample-audit.js";
export * from "./dynamic.js";
export * from "./dynamic-analyze.js";
export * from "./viewport.js";
export * from "./viewport-analyze.js";
export * from "./coherence.js";
export * from "./png.js";
export * from "./pixel-contrast.js";
export * from "./sampling.js";
export * from "./crawl.js";
export * from "./audit-run.js";
export * from "./cuaderno.js";
export * from "./oaw-letters.js";
export * from "./report-oaw.js";
