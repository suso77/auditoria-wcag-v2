/**
 * ♿ generate-dashboard-html.mjs (v4.2 IAAP PRO)
 * ----------------------------------------------------------
 * Genera el Dashboard público IAAP PRO en formato HTML,
 * basado en los resultados de auditoría y artefactos.
 *
 * ✅ Usa la carpeta /public/auditorias/{BUILD_DATE}/
 * ✅ Inserta resumen de impactos y totales
 * ✅ Enlaces de descarga a PDF, XLSX, CSV, ZIP y resumen
 * ✅ Compatible con merged-results.json o resultados.json
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
const htmlFile = path.join(outputDir, "index.html");

// Crear carpetas si no existen
fs.mkdirSync(outputDir, { recursive: true });

// 🧠 Detección flexible del archivo de resultados
const resultsFileCandidates = [
  path.join(outputDir, "resultados.json"),
  path.join(outputDir, "merged-results.json"),
];
const resultsFile = resultsFileCandidates.find((f) => fs.existsSync(f));

let data = [];
try {
  if (resultsFile) {
    const raw = fs.readFileSync(resultsFile, "utf8");
    data = JSON.parse(raw);
  } else {
    console.warn("⚠️ No se encontró resultados.json ni merged-results.json.");
  }
} catch (err) {
  console.warn("⚠️ No se pudo leer resultados:", err.message);
  data = [];
}

// 🧩 Calcular resumen
const impacts = data.flatMap((r) =>
  (r.violations || []).map((v) => v.impact || "sin clasificar")
);

const counts = impacts.reduce((acc, i) => {
  acc[i] = (acc[i] || 0) + 1;
  return acc;
}, {});

const total = Object.values(counts).reduce((a, b) => a + b, 0);

const impactColors = {
  critical: "#c62828",
  serious: "#ef6c00",
  moderate: "#fbc02d",
  minor: "#2e7d32",
  "sin clasificar": "#777",
};

const resumenHTML =
  total > 0
    ? `
<ul>
${Object.entries(counts)
  .map(
    ([k, v]) =>
      `<li><span style="color:${impactColors[k] || "#333"};">${k}:</span> <strong>${v}</strong></li>`
  )
  .join("\n")}
</ul>
<p><strong>Total de violaciones detectadas:</strong> ${total}</p>`
    : `<p>⚠️ No se encontraron violaciones o no hay datos.</p>`;

// 📦 Buscar artefactos disponibles
const findFile = (name) =>
  fs.existsSync(path.join(outputDir, name)) ? name : null;

const pdfFile = findFile("Informe-WCAG-IAAP.pdf");
const xlsxFile = findFile("Informe-WCAG-IAAP.xlsx");
const csvFile = findFile("Informe-WCAG-IAAP.csv");
const zipFile =
  findFile("Informe-WCAG-IAAP.zip") || findFile(`IAAP-PRO-${buildDate}.zip`);
const resumenFile =
  findFile("Resumen-WCAG.md") ||
  findFile("merged-summary.md") ||
  findFile("Resumen-IAAP.md");

// 🧩 HTML accesible y adaptable
const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>♿ Informe de Accesibilidad Digital IAAP PRO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --blue: #004080;
      --bg: #fafafa;
      --card: #fff;
      --text: #222;
      --border: #ddd;
    }
    body {
      font-family: system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 2em;
      line-height: 1.6;
    }
    h1, h2 { color: var(--blue); }
    section {
      background: var(--card);
      border-radius: 12px;
      padding: 1.5em;
      margin-bottom: 2em;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
    }
    a.download {
      background: var(--blue);
      color: #fff;
      padding: 0.8em 1.4em;
      border-radius: 8px;
      text-decoration: none;
      margin-right: 0.6em;
      margin-bottom: 0.6em;
      display: inline-block;
    }
    a.download:hover { background: #002b5e; }
    footer {
      text-align: center;
      font-size: 0.85em;
      color: #555;
      margin-top: 3em;
    }
    ul { list-style: none; padding-left: 0; }
    li { margin: 0.3em 0; }
    iframe {
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 100%;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121212;
        --card: #1e1e1e;
        --text: #eee;
        --border: #333;
        --blue: #4ea3ff;
      }
      a.download { background: #0070d1; }
      a.download:hover { background: #2196f3; }
    }
  </style>
</head>
<body>
  <header>
    <h1>♿ Informe de Accesibilidad Digital IAAP PRO</h1>
    <p><strong>Fecha de generación:</strong> ${new Date().toLocaleString("es-ES")}</p>
  </header>

  <main>
    <section aria-labelledby="resumen">
      <h2 id="resumen">📊 Resumen de Impactos</h2>
      ${resumenHTML}
    </section>

    ${
      pdfFile
        ? `
    <section aria-labelledby="pdf">
      <h2 id="pdf">📄 Informe PDF IAAP</h2>
      <iframe src="${pdfFile}" height="600" title="Informe IAAP PDF"></iframe>
    </section>`
        : ""
    }

    <section aria-labelledby="descargas">
      <h2 id="descargas">💾 Descargas</h2>
      <div>
        ${xlsxFile ? `<a href="${xlsxFile}" class="download">📊 Excel</a>` : ""}
        ${csvFile ? `<a href="${csvFile}" class="download">📈 CSV (Numbers/Sheets)</a>` : ""}
        ${pdfFile ? `<a href="${pdfFile}" class="download">📄 PDF</a>` : ""}
        ${zipFile ? `<a href="${zipFile}" class="download">📦 ZIP Consolidado</a>` : ""}
        ${resumenFile ? `<a href="${resumenFile}" class="download">📝 Resumen Markdown</a>` : ""}
      </div>
    </section>
  </main>

  <footer>
    © Ilúmina Audit IAAP PRO · ${new Date().getFullYear()}<br />
    Generado automáticamente con Cypress + axe-core + Puppeteer
  </footer>
</body>
</html>`;

// 🧩 Guardar HTML
fs.writeFileSync(htmlFile, html, "utf8");
console.log(`✅ Dashboard IAAP PRO generado correctamente: ${htmlFile}`);
