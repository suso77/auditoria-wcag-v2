/**
 * ♿ generate-dashboard-html.mjs (IAAP PRO v5.0)
 * ----------------------------------------------------------
 * Genera el Dashboard público IAAP PRO en HTML
 * y copia automáticamente todos los artefactos
 * desde /auditorias/reportes/ al destino público.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDate = process.argv[2];
if (!buildDate) {
  console.error("❌ Error: falta el parámetro BUILD_DATE (ej: 2025-11-11).");
  process.exit(1);
}

// 📂 Rutas
const rootDir = path.join(__dirname, "..");
const reportesDir = path.join(rootDir, "auditorias/reportes");
const outputDir = path.join(rootDir, "public/auditorias", buildDate);

// Crear carpeta destino
fs.mkdirSync(outputDir, { recursive: true });

// 📁 Copiar automáticamente artefactos principales
const filesToCopy = [
  "merged-results.json",
  "merged-summary.md",
  "Informe-WCAG-IAAP.pdf",
  "Informe-WCAG-IAAP.xlsx",
  "Informe-WCAG-IAAP.csv",
];

for (const f of filesToCopy) {
  const src = path.join(reportesDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outputDir, f));
    console.log(`📄 Copiado: ${f}`);
  }
}

// 🧠 Cargar datos si existen
let data = [];
const resultsFile = path.join(outputDir, "merged-results.json");
if (fs.existsSync(resultsFile)) {
  try {
    data = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
  } catch (err) {
    console.warn("⚠️ No se pudo leer resultados:", err.message);
  }
}

// 📊 Calcular resumen de impactos
const impacts = data.map(i => i.impact || "sin clasificar");
const counts = impacts.reduce((a, i) => ((a[i] = (a[i] || 0) + 1), a), {});
const total = Object.values(counts).reduce((a, b) => a + b, 0);

const colors = {
  critical: "#b30000",
  serious: "#e67300",
  moderate: "#ffcc00",
  minor: "#4caf50",
  "sin clasificar": "#777",
};

const resumenHTML =
  total > 0
    ? `<ul>${Object.entries(counts)
        .map(
          ([k, v]) =>
            `<li><span style="color:${colors[k] || "#333"};">${k}:</span> <strong>${v}</strong></li>`
        )
        .join("")}</ul><p><strong>Total de violaciones:</strong> ${total}</p>`
    : "<p>⚠️ No se encontraron violaciones o no hay datos.</p>";

// 🔗 Archivos detectados
const find = name => (fs.existsSync(path.join(outputDir, name)) ? name : null);
const pdf = find("Informe-WCAG-IAAP.pdf");
const xlsx = find("Informe-WCAG-IAAP.xlsx");
const csv = find("Informe-WCAG-IAAP.csv");
const md = find("merged-summary.md");

// 📄 HTML accesible
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Dashboard IAAP PRO ${buildDate}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
body{font-family:system-ui,sans-serif;margin:2em;line-height:1.6;color:#222;background:#fafafa}
h1,h2{color:#003366}
section{background:#fff;border-radius:12px;padding:1.5em;margin-bottom:1.5em;box-shadow:0 2px 8px rgba(0,0,0,.1)}
a.download{background:#003366;color:#fff;padding:.8em 1.4em;border-radius:8px;text-decoration:none;margin:.3em;display:inline-block}
a.download:hover{background:#002b5e}
iframe{border:1px solid #ccc;border-radius:8px;width:100%;height:600px}
footer{text-align:center;margin-top:3em;font-size:.9em;color:#555}
</style>
</head>
<body>
<h1>♿ Dashboard IAAP PRO – ${buildDate}</h1>
<section>
<h2>📊 Resumen de Impactos</h2>
${resumenHTML}
</section>
${pdf ? `<section><h2>📄 Informe PDF</h2><iframe src="${pdf}"></iframe></section>` : ""}
<section>
<h2>💾 Descargas</h2>
${pdf ? `<a href="${pdf}" class="download">📄 PDF</a>` : ""}
${xlsx ? `<a href="${xlsx}" class="download">📊 Excel</a>` : ""}
${csv ? `<a href="${csv}" class="download">📈 CSV</a>` : ""}
${md ? `<a href="${md}" class="download">📝 Markdown</a>` : ""}
</section>
<footer>
© Ilúmina Audit IAAP PRO ${new Date().getFullYear()} — Generado automáticamente
</footer>
</body>
</html>`;

const htmlPath = path.join(outputDir, "index.html");
fs.writeFileSync(htmlPath, html, "utf8");
console.log(`✅ Dashboard IAAP PRO generado correctamente: ${htmlPath}`);

