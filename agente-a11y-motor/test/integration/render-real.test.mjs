import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRendered } from "../../src/index.js";

// Sonda de navegador. Permite PW_CHROMIUM para apuntar a un Chromium concreto (CI/nube).
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  await b.close();
} catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador (npx playwright install chromium): " + why;

test("render real: mide contraste con estilos reales y detecta el fallo compuesto", { skip }, async () => {
  // Texto blanco sobre un fondo translúcido negro sobre blanco: el contraste REAL falla.
  const html = '<button style="background:rgba(0,0,0,0.4);color:#fff;font-size:14px">Guardar cambios</button>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const c = out.measurements.find((m) => m.crit === "1.4.3");
  assert.ok(c, "debería medir 1.4.3");
  assert.equal(c.verdict, "falla");
  // 2.1.1 sobre un botón nativo pasa (foco real)
  assert.ok(out.measurements.some((m) => m.crit === "2.1.1" && m.verdict === "pasa"));
});

test("render real: fondo con degradado → contraste 'revisar' (no medible)", { skip }, async () => {
  const html = '<a href="#" style="background:linear-gradient(#111,#222);color:#eee">Menú del sitio</a>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const c = out.measurements.find((m) => m.crit === "1.4.3");
  assert.ok(c && c.verdict === "revisar");
});
