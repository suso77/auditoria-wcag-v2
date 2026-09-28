/**
 * Audita una muestra de páginas y exporta a la forma OAW/IRA: escribe
 * barreras.csv y seguimiento.csv (para Excel en español) + un resumen JSON.
 *
 *   node examples/export-oaw.mjs https://ejemplo.com/ https://ejemplo.com/contacto
 *
 * Requiere Chromium de Playwright (o PW_CHROMIUM). Es el puente del agente a tus
 * skills de Informe de Hallazgos / IRA: les da los hallazgos ya normalizados.
 */
import { writeFile } from "fs/promises";
import { analyzeRendered, auditSample, oawExport } from "../src/index.js";

const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
if (!urls.length) { console.error("Uso: node examples/export-oaw.mjs <url> [url...]"); process.exit(2); }
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

const analyze = async (t) => {
  const o = await analyzeRendered({ url: t.url }, { launchOptions, waitMs: 400 });
  return { url: t.url, findings: o.findings.map((f) => Object.assign({ url: t.url }, f)) };
};

const { pages } = await auditSample(urls.map((u) => ({ url: u })), { analyze });
const allFindings = pages.flatMap((p) => p.findings);
const out = oawExport(allFindings);

await writeFile("barreras.csv", out.csv.barreras, "utf8");
await writeFile("seguimiento.csv", out.csv.seguimiento, "utf8");
await writeFile("oaw-export.json", JSON.stringify({ barreras: out.barreras, seguimiento: out.seguimiento, fueraDeEN: out.fueraDeEN }, null, 2), "utf8");

console.log("\n✓ Exportado:");
console.log("  barreras.csv     — " + out.barreras.length + " barreras (una fila cada una)");
console.log("  seguimiento.csv  — " + out.seguimiento.length + " subcriterios con resultado agregado");
console.log("  oaw-export.json  — datos estructurados para tus skills OAW/IRA");
if (out.fueraDeEN.length) console.log("  (fuera de la EN vigente: " + out.fueraDeEN.join(", ") + ")");
console.log("");
