/**
 * Auditoría de un sitio de punta a punta: rastrea, elige la muestra con WCAG-EM,
 * audita cada página y exporta los entregables OAW/IRA.
 *
 *   node examples/auditar-sitio.mjs https://ejemplo.com/
 *   node examples/auditar-sitio.mjs --muestra 12 --semilla expediente-2026 https://ejemplo.com/
 *   node examples/auditar-sitio.mjs --solo-muestra https://ejemplo.com/   # rastrea y propone, sin auditar
 *
 * El rastreo respeta robots.txt, no sale del dominio, no descarga binarios y no
 * toca nada que suene a destructivo. La muestra aleatoria es reproducible: con la
 * misma semilla sale la misma muestra, que es lo que permite defender el informe.
 *
 * Requiere Chromium de Playwright (o PW_CHROMIUM apuntando a uno ya instalado).
 */
import { writeFile } from "fs/promises";
import { muestrearSitio, auditSite, oawExport } from "../src/index.js";

const args = process.argv.slice(2);
const flag = (n, def) => { const i = args.indexOf("--" + n); return i !== -1 ? args[i + 1] : def; };
const inicio = args.find((a) => /^https?:\/\//.test(a));
if (!inicio) {
  console.error("Uso: node examples/auditar-sitio.mjs [--muestra N] [--semilla S] [--max N] [--solo-muestra] [--dinamico] <url>");
  process.exit(2);
}
const soloMuestra = args.includes("--solo-muestra");
const dinamico = args.includes("--dinamico");

console.error("\nRastreando " + inicio + " …");
const sel = await muestrearSitio(inicio, {
  max: parseInt(flag("max", "60"), 10),
  "tamañoMuestra": parseInt(flag("muestra", "15"), 10),
  semilla: flag("semilla", new URL(inicio).host),
  pausaMs: 300,
  onPagina: (p) => process.stderr.write("  · " + p.ruta + "\n")
});

console.log("\n── MUESTRA WCAG-EM ──");
console.log(sel.justificacion + "\n");
sel.muestra.forEach((m) => {
  console.log("  " + m.url);
  m.motivos.forEach((x) => console.log("      – " + x));
});
(sel.avisos || []).forEach((a) => console.log("\n  ⚠ " + a));

await writeFile("muestra.json", JSON.stringify({
  procedencia: sel.procedencia, justificacion: sel.justificacion,
  muestra: sel.muestra, cobertura: sel.cobertura, rastreo: sel.rastreo, avisos: sel.avisos
}, null, 2), "utf8");
console.log("\n✓ muestra.json — la muestra y su justificación, para el IRA");

if (soloMuestra) process.exit(0);

console.error("\nAuditando las " + sel.muestra.length + " páginas de la muestra …");
const sitio = await auditSite(sel.muestra.map((m) => ({ url: m.url })), {
  waitMs: 400,
  capas: { render: true, viewport: true, axe: true, dynamic: dinamico },
  onPage: (r) => process.stderr.write("  · " + r.url + " — " + r.findings.filter((f) => f.verdict === "falla").length + " barreras\n")
});

const out = oawExport(sitio.findings);
await writeFile("barreras.csv", out.csv.barreras, "utf8");
await writeFile("seguimiento.csv", out.csv.seguimiento, "utf8");
await writeFile("auditoria.json", JSON.stringify({
  muestra: { justificacion: sel.justificacion, paginas: sel.muestra, procedencia: sel.procedencia },
  procedencia: sitio.procedencia,
  coherencia: sitio.coherencia,
  rollup: sitio.rollup,
  barreras: out.barreras, seguimiento: out.seguimiento, fueraDeEN: out.fueraDeEN
}, null, 2), "utf8");

console.log("\n" + sitio.rollup.conformidad.toUpperCase());
console.log("  " + sitio.rollup.resumen.fallan + " criterios fallan · " + sitio.rollup.resumen.revisar + " sin determinar · " + sitio.rollup.resumen.conformes + " conformes");
const coh = sitio.coherencia.filter((f) => f.verdict === "falla");
if (coh.length) console.log("  coherencia entre páginas: falla " + coh.map((f) => f.c.n).join(", "));
console.log("\n✓ Entregables:");
console.log("  barreras.csv     — " + out.barreras.length + " filas (una por elemento afectado)");
console.log("  seguimiento.csv  — " + out.seguimiento.length + " subcriterios con resultado agregado");
console.log("  auditoria.json   — todo junto, con la muestra y su procedencia");
console.log("");
