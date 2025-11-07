/**
 * ♿ generate-dashboard-html.mjs (v4.1 IAAP PRO)
 * ----------------------------------------------------------
 * Genera el Dashboard público IAAP PRO en formato HTML,
 * basado en los resultados de auditoría y artefactos.
 *
 * ✅ Usa la carpeta /public/auditorias/{BUILD_DATE}/
 * ✅ Inserta resumen de impactos y totales
 * ✅ Genera enlaces de descarga a PDF, XLSX, ZIP y resumen
 * ✅ Seguro en CI/CD (no falla si faltan archivos)
 * ----------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🧩 Parámetro: BUILD_DATE (se pasa desde el workflow)
const buildDate = process.argv[2];
if (!buildDate) {
  console.error("❌ Error: falta el parámetro BUILD_DATE.");
  process.exit(1);
}

// 📂 Directorios base
const outputDir = path.join(__dirname, "../public/auditorias", buildDate);
const resultsFile = path.join(outputDir, "resultados.json");
const htmlFile = path.join(outputDir, "index.html");

// Crear carpetas si no existen
fs.mkdirSync(outputDir, { recursive: true });

// Leer resultados
let data = [];
try {
  if (fs.existsSync(resultsFile)) {
    const raw = fs.readFileSync(resultsFile, "utf8");
    data = JSON.parse(raw);
  }
} catch (err) {
  console.warn("⚠️ No se pudo leer resultados.json:", err.message);
  data = [];
}

// Calcular resumen
const impacts = data.flatMap((r) =>
  (r.violations || []).map((v) => v.impact || "sin clasificar")
);

const counts = impacts.reduce((acc, i) => {
  acc[i] = (acc[i] || 0) + 1;
  return acc;
}, {});

const total = Object.values(counts).reduce((a, b) => a + b, 0);

const resumenHTML =
  total > 0
    ? `
<ul>
${Object.entries(counts)
  .map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`)
  .join("\n")}
</ul>
<p><strong>Total violaciones:</strong> ${total}</p>`
    : `<p>⚠️ No se encontraron violaciones o no hay datos.</p>`;

// Buscar artefactos
const pdfFile = fs.existsSync(path.join(outputDir, "Informe-WCAG-IAAP.pdf"))
  ? "Informe-WCAG-IAAP.pdf"
  : null;
const xlsxFile = fs.existsSync(path.join(outputDir, "Informe-WCAG-IAAP.xlsx"))
  ? "Informe-WCAG-IAAP.xlsx"
  : null;
const zipFile = fs.existsSync(path.join(outputDir, "Informe-WCAG-IAAP.zip"))
  ? "Informe-WCAG-IAAP.zip"
  : null;
const resumenFile = fs.existsSync(path.join(outputDir, "Resumen-WCAG.md"))
  ? "Resumen-WCAG.md"
  : null;

// HTML base
const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>♿ Informe de Accesibilidad Digital IAAP PRO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, sans-serif; background:#fafafa; color:#222; margin:2em; line-height:1.6; }
    h1,h2 { color:#003366; }
    section { background:#fff; border-radius:12px; padding:1.5em; margin-bottom:2em; box-shadow:0 2px 6px rgba(0,0,0,0.08); }
    a.download { background:#004080; color:#fff; padding:0.8em 1.4em; border-radius:8px; text-decoration:none; margin-right:0.6em; display:inline-block; }
    a.download:hover { background:#002b5e; }
    footer { text-align:center; font-size:0.85em; color:#555; margin-top:3em; }
    ul { list-style:none; padding-left:0; }
    li { margin:0.3em 0; }
    iframe { border:1px solid #ddd; border-radius:8px; }
  </style>
</head>
<body>
  <h1>♿ Informe de Accesibilidad Digital IAAP PRO</h1>
  <section>
    <h2>📊 Resumen</h2>
    <p><strong>Fecha de generación:</strong> ${new Date().toLocaleString("es-ES")}</p>
    ${resumenHTML}
  </section>

  ${
    pdfFile
      ? `
  <section>
    <h2>📄 Informe PDF IAAP</h2>
    <iframe src="${pdfFile}" width="100%" height="600" title="Informe IAAP"></iframe>
  </section>`
      : ""
  }

  <section>
    <h2>💾 Descargas</h2>
    <p>
      ${xlsxFile ? `<a href="${xlsxFile}" class="download">Excel IAAP</a>` : ""}
      ${zipFile ? `<a href="${zipFile}" class="download">ZIP Consolidado</a>` : ""}
      ${resumenFile ? `<a href="${resumenFile}" class="download">Resumen Markdown</a>` : ""}
    </p>
  </section>

  <footer>© Ilúmina Audit IAAP · ${new Date().getFullYear()}</footer>
</body>
</html>`;

// Escribir archivo
fs.writeFileSync(htmlFile, html, "utf8");
console.log(`✅ Dashboard IAAP PRO generado correctamente: ${htmlFile}`);
