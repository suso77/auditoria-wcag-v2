/**
 * Analiza una PÁGINA REAL: motor sobre el DOM renderizado + medición con estilos
 * y layout de verdad (contraste/foco/tamaño/orden), opcionalmente con axe-core.
 *
 *   node examples/analyze-url.mjs https://ejemplo.com
 *   node examples/analyze-url.mjs https://ejemplo.com --axe
 *
 * Requiere un Chromium de Playwright: npx playwright install chromium
 * (o PW_CHROMIUM=/ruta/al/chrome para usar uno concreto).
 */
import { analyzeRendered } from "../src/index.js";

const url = process.argv.find((a) => /^https?:\/\//.test(a));
if (!url) { console.error("Uso: node examples/analyze-url.mjs <url> [--axe]"); process.exit(2); }
const axe = process.argv.includes("--axe");
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

const out = await analyzeRendered({ url }, { axe, launchOptions, waitMs: 500 });

console.log("\n=== Análisis sobre render real · " + url + " ===\n");
console.log("Motor (semántico): " + out.summary.barreras + " barreras deterministas");
console.log("Medición real:", JSON.stringify(out.summary.medicion));
if (out.summary.axeViolaciones != null) console.log("axe-core: " + out.summary.axeViolaciones + " violaciones");

const fallos = (out.measurements || []).filter((m) => m.verdict === "falla");
if (fallos.length) {
  console.log("\nFallos medidos en el render real:");
  fallos.slice(0, 25).forEach((m) => console.log("  ✗ [" + m.crit + "] " + m.label + " — " + m.node + ": " + m.detail));
}
const rev = (out.measurements || []).filter((m) => m.verdict === "revisar");
if (rev.length) console.log("\n(" + rev.length + " a revisar a ojo — foco visible, tamaño, fondos no medibles)");
console.log("");
