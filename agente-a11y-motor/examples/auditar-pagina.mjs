/**
 * Auditoría completa de una o varias páginas, con UN navegador por página, y
 * exportación directa a los entregables OAW/IRA.
 *
 *   node examples/auditar-pagina.mjs https://ejemplo.com/ https://ejemplo.com/contacto
 *   node examples/auditar-pagina.mjs --dinamico https://ejemplo.com/
 *
 * Capas: motor semántico + ámbito de página + medición sobre render real +
 * axe-core + adaptación del contenido (reflujo, texto al 200 %, espaciado,
 * orientación, emergentes) + coherencia entre páginas de la muestra (navegación,
 * identificación, ayuda y múltiples vías). La capa dinámica (tabulación, expandibles, pestañas,
 * errores de formulario) es opcional porque INTERACTÚA con el sitio: incluso en
 * modo seguro conviene que sea una decisión consciente.
 *
 * Requiere Chromium de Playwright (o PW_CHROMIUM apuntando a uno ya instalado).
 */
import { writeFile } from "fs/promises";
import { auditSite, oawExport } from "../src/index.js";

const args = process.argv.slice(2);
const dinamico = args.includes("--dinamico");
const urls = args.filter((a) => /^https?:\/\//.test(a));
if (!urls.length) {
  console.error("Uso: node examples/auditar-pagina.mjs [--dinamico] <url> [url...]");
  process.exit(2);
}

console.error("\nAuditando " + urls.length + " página(s)" + (dinamico ? " con prueba dinámica (modo seguro)" : "") + ":");
const sitio = await auditSite(urls.map((u) => ({ url: u })), {
  waitMs: 400,
  capas: { render: true, viewport: true, axe: true, dynamic: dinamico },
  onPage: (r) => {
    const fallas = r.findings.filter((f) => f.verdict === "falla").length;
    process.stderr.write("  · " + r.url + " — " + fallas + " barreras · " + Math.round(r.procedencia.duracionMs / 100) / 10 + " s\n");
    (r.errores || []).forEach((e) => process.stderr.write("      ! " + (e.capa || e.fase) + ": " + e.error + "\n"));
  }
});
const out = oawExport(sitio.findings);

await writeFile("barreras.csv", out.csv.barreras, "utf8");
await writeFile("seguimiento.csv", out.csv.seguimiento, "utf8");
await writeFile("auditoria.json", JSON.stringify({
  procedencia: sitio.procedencia,
  coherencia: sitio.coherencia,
  rollup: sitio.rollup,
  barreras: out.barreras,
  seguimiento: out.seguimiento,
  fueraDeEN: out.fueraDeEN
}, null, 2), "utf8");

console.log("\n" + sitio.rollup.conformidad.toUpperCase());
console.log("  " + sitio.rollup.resumen.fallan + " criterios fallan · " + sitio.rollup.resumen.revisar + " sin determinar · " + sitio.rollup.resumen.conformes + " conformes");
const cohFallan = sitio.coherencia.filter((f) => f.verdict === "falla");
if (cohFallan.length) console.log("  coherencia entre páginas: falla " + cohFallan.map((f) => f.c.n).join(", "));
console.log("\n✓ Entregables:");
console.log("  barreras.csv     — " + out.barreras.length + " filas (una por elemento afectado)");
console.log("  seguimiento.csv  — " + out.seguimiento.length + " subcriterios con resultado agregado");
console.log("  auditoria.json   — datos + procedencia para las skills de Informe de Hallazgos / IRA");
if (out.fueraDeEN.length) console.log("  (fuera de la EN vigente: " + out.fueraDeEN.join(", ") + ")");
console.log("");
