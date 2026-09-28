/**
 * Prueba DINÁMICA de una página: tabula, opera expandibles y pestañas, y fuerza
 * errores de formulario, reportando lo que no cambia de estado o no se anuncia.
 *
 *   node examples/dynamic-test.mjs https://ejemplo.com/
 *
 * Requiere Chromium de Playwright (o PW_CHROMIUM).
 */
import { dynamicAnalyze } from "../src/index.js";

const url = process.argv.find((a) => /^https?:\/\//.test(a));
if (!url) { console.error("Uso: node examples/dynamic-test.mjs <url>"); process.exit(2); }
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

const out = await dynamicAnalyze({ url }, { launchOptions, waitMs: 500 });

console.log("\n=== Prueba dinámica · " + url + " ===");
console.log("Recorrido: " + out.trace.reached + "/" + out.trace.focusables + " controles alcanzados con Tab" + (out.trace.trapped ? " · ¡TRAMPA DE FOCO!" : ""));
console.log("Widgets operados: " + out.trace.disclosures + " expandibles, " + out.trace.tabs + " pestañas" + (out.trace.form ? ", 1 formulario" : ""));
console.log("Resultado: " + out.summary.falla + " fallos · " + out.summary.revisar + " a revisar\n");
out.findings.filter((f) => f.verdict === "falla" || f.verdict === "revisar").forEach((f) => {
  console.log("  " + (f.verdict === "falla" ? "✗" : "~") + " [" + f.c.n + " " + f.c.lvl + "] " + f.c.t + " — " + f.evid[0]);
});
console.log("");
