/**
 * Auditoría de una MUESTRA de páginas (estilo WCAG-EM): analiza cada URL sobre
 * render real (motor + página + medición) y agrega el veredicto de conformidad.
 *
 *   node examples/audit-site.mjs https://ejemplo.com/ https://ejemplo.com/contacto
 *
 * Requiere Chromium de Playwright: npx playwright install chromium
 * (o PW_CHROMIUM=/ruta/al/chrome).
 */
import { analyzeRendered, auditSample } from "../src/index.js";

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (!urls.length) { console.error("Uso: node examples/audit-site.mjs <url> [url...]"); process.exit(2); }
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

const analyze = async (t) => {
  const o = await analyzeRendered({ url: t.url }, { launchOptions, waitMs: 400 });
  return { url: t.url, findings: o.findings };
};

console.log("\n=== Muestreo WCAG-EM · " + urls.length + " páginas ===");
const out = await auditSample(urls.map((u) => ({ url: u })), {
  analyze,
  onPage: (r) => console.log("  · analizada " + r.url + " (" + r.findings.length + " hallazgos)")
});

const r = out.rollup;
console.log("\nConformidad de la muestra: " + r.conformidad);
console.log("Criterios que fallan: " + r.resumen.fallan + "   ·   a revisar: " + r.resumen.revisar + "\n");
r.criterios.filter((c) => c.worst === "falla").forEach((c) => {
  console.log("  ✗ [" + c.n + " " + c.lvl + "] " + c.t);
  console.log("      en: " + (c.enPaginas.falla || []).join(", "));
});
console.log("");
