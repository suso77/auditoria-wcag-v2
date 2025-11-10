/**
 * 🧾 generate-report.mjs (v4.16-H3 IAAP PRO / PDF Export)
 * -------------------------------------------------------------
 * Genera un informe profesional IAAP PRO en PDF a partir del
 * resumen Markdown y los resultados combinados WCAG (axe + Pa11y).
 *
 * ✅ Compatible con IAAP v4.16-H3 y Node 24
 * ✅ Incluye needs_review + Pa11y results
 * ✅ Mantiene compatibilidad con v4.7.x
 * ✅ Portada, índice, gráficos y diseño accesible (IAAP/W3C)
 * ✅ Salida: auditorias/Informe-WCAG-IAAP.pdf
 * -------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { marked } from "marked";

// ===========================================================
// 📂 Configuración base (IAAP v4.16-H3)
// ===========================================================
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");

if (!fs.existsSync(AUDITORIAS_DIR)) fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
if (!fs.existsSync(REPORTES_DIR)) fs.mkdirSync(REPORTES_DIR, { recursive: true });

// ===========================================================
// 🔍 Localizar archivos de resumen y resultados
// ===========================================================
let summaryPath = null;
let mergedPath = null;

// Buscar el resumen Markdown
if (fs.existsSync(path.join(REPORTES_DIR, "merged-summary.md"))) {
  summaryPath = path.join(REPORTES_DIR, "merged-summary.md");
} else if (fs.existsSync(path.join(AUDITORIAS_DIR, "Resumen-WCAG.md"))) {
  summaryPath = path.join(AUDITORIAS_DIR, "Resumen-WCAG.md");
}

// Buscar merged-results.json
if (fs.existsSync(path.join(REPORTES_DIR, "merged-results.json"))) {
  mergedPath = path.join(REPORTES_DIR, "merged-results.json");
} else {
  const fallback = fs
    .readdirSync(AUDITORIAS_DIR)
    .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
    .sort()
    .reverse()[0];
  if (fallback) mergedPath = path.join(AUDITORIAS_DIR, fallback);
}

// ===========================================================
// 🧩 Validar existencia de archivos base
// ===========================================================
if (!mergedPath || !fs.existsSync(mergedPath)) {
  console.error("❌ No se encontró merged-results.json ni results-merged*.json en auditorias/reportes.");
  process.exit(1);
}
if (!summaryPath || !fs.existsSync(summaryPath)) {
  console.error("❌ No se encontró merged-summary.md ni Resumen-WCAG.md. Ejecuta primero merge-auditorias.mjs o generate-summary.mjs");
  process.exit(1);
}

// ===========================================================
// 📄 Cargar contenido
// ===========================================================
const markdown = fs.readFileSync(summaryPath, "utf8");
let mergedData = [];
try {
  mergedData = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
} catch (err) {
  console.error(`❌ Error al leer ${mergedPath}: ${err.message}`);
  process.exit(1);
}

console.log("📁 Rutas detectadas IAAP v4.16-H3:");
console.log(`   - Resumen: ${summaryPath}`);
console.log(`   - Resultados: ${mergedPath}`);
console.log(`   - Total entradas: ${mergedData.length}`);

// ===========================================================
// 🧮 Estadísticas IAAP (incluye needs_review y pa11y)
// ===========================================================
const impactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 };
const origenCounts = { sitemap: 0, interactiva: 0, combinado: 0 };
let pa11yCount = 0;
let needsReviewCount = 0;

for (const entry of mergedData) {
  const origen = entry.origen || "combinado";

  // Contar origen
  if (origenCounts[origen] !== undefined) {
    origenCounts[origen] += entry.violations?.length || 0;
  }

  // Contar impactos WCAG
  for (const v of entry.violations || []) {
    const impact = v.impact?.toLowerCase() || "unclassified";
    if (impactCounts[impact] !== undefined) impactCounts[impact]++;
  }

  // needs_review (axe incompletos)
  if (Array.isArray(entry.needs_review)) {
    needsReviewCount += entry.needs_review.length;
  }

  // Pa11y
  if (Array.isArray(entry.pa11y)) {
    pa11yCount += entry.pa11y.length;
  }
}

// ===========================================================
// 🧩 Convertir Markdown a HTML IAAP PRO
// ===========================================================
const htmlContent = marked(markdown, { headerIds: true, mangle: false });

// Crear índice
const toc =
  htmlContent
    .match(/<h2[^>]*>(.*?)<\/h2>/g)
    ?.map((h) => {
      const clean = h.replace(/<[^>]+>/g, "").trim();
      const id = clean.toLowerCase().replace(/\s+/g, "-");
      return `<li><a href="#${id}">${clean}</a></li>`;
    })
    .join("") || "<li>No disponible</li>";

// ===========================================================
// 🎨 Plantilla HTML IAAP PRO (accesible y actualizada)
// ===========================================================
const htmlTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Informe IAAP PRO – WCAG 2.1 / 2.2</title>
<style>
  @page { margin: 2cm; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; color: #111; line-height: 1.6; }
  h1, h2, h3 { color: #003366; margin-top: 1.5em; }
  h1 { text-align: center; font-size: 1.8em; }
  h2 { font-size: 1.3em; border-bottom: 2px solid #ccc; padding-bottom: 4px; }
  h3 { font-size: 1.1em; color: #003366; }
  p { font-size: 0.95em; margin: 0.4em 0; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background-color: #f0f4ff; }
  tr:nth-child(even) { background-color: #fafafa; }
  .page-break { page-break-before: always; }
  header { text-align: center; padding: 25px 0; border-bottom: 2px solid #003366; }
  footer {
    position: fixed; bottom: 10px; width: 100%;
    text-align: center; font-size: 0.8em; color: #555;
  }
  .cover { text-align: center; padding: 6cm 2cm; }
  .cover h1 { font-size: 2.4em; margin-bottom: 0.4em; color: #002b80; }
  .cover h2 { font-size: 1.3em; color: #444; }
  .chart { text-align: center; margin: 1em auto; }
  .legend { text-align: center; font-size: 0.85em; color: #444; margin-top: 5px; }
  .toc { margin: 1em 0 2em; font-size: 0.95em; }
  .toc ul { list-style-type: none; padding-left: 0; }
  .toc li { margin: 0.4em 0; }
  a { color: #003366; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>

<header>
  <img src="https://iluminamedia.es/wp-content/uploads/2024/09/ilumina-media-logo.png"
       alt="Ilúmina Media" width="150" />
</header>

<div class="cover">
  <h1>Informe de Accesibilidad Digital IAAP PRO</h1>
  <h2>Evaluación de conformidad WCAG 2.1 / 2.2</h2>
  <p><strong>Generado automáticamente por Ilúmina Audit IAAP PRO v4.16-H3</strong></p>
  <p>${new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}</p>
</div>

<div class="page-break"></div>

<h2>📖 Tabla de contenidos</h2>
<div class="toc"><ul>${toc}</ul></div>

<div class="page-break"></div>

${htmlContent}

<div class="page-break"></div>

<h2>📊 Resultados globales IAAP PRO</h2>

<ul>
  <li><strong>Violaciones WCAG:</strong> ${
    Object.values(impactCounts).reduce((a, b) => a + b, 0)
  }</li>
  <li><strong>Revisiones manuales (needs_review):</strong> ${needsReviewCount}</li>
  <li><strong>Resultados Pa11y (HTML_CodeSniffer):</strong> ${pa11yCount}</li>
</ul>

<div class="chart">
  <canvas id="chartSeveridad" width="600" height="300"></canvas>
  <div class="legend">Distribución de hallazgos por severidad</div>
</div>

<div class="chart">
  <canvas id="chartOrigen" width="600" height="300"></canvas>
  <div class="legend">Distribución por tipo de auditoría</div>
</div>

<footer>
  ♿ Informe IAAP PRO – Ilúmina Audit WCAG (${new Date().getFullYear()})
</footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  const impactData = ${JSON.stringify(impactCounts)};
  const origenData = ${JSON.stringify(origenCounts)};
  new Chart(document.getElementById('chartSeveridad'), {
    type: 'bar',
    data: { labels: Object.keys(impactData),
      datasets: [{ data: Object.values(impactData),
      backgroundColor: ['#b30000','#e67300','#ffcc00','#66b266','#999999'] }] },
    options: { plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } } }
  });
  new Chart(document.getElementById('chartOrigen'), {
    type: 'pie',
    data: { labels: Object.keys(origenData),
      datasets: [{ data: Object.values(origenData),
      backgroundColor: ['#0044cc','#00cc99','#999999'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
</script>

</body>
</html>
`;

// ===========================================================
// 💾 Guardar HTML accesible (para auditoría visual o CI)
// ===========================================================
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "auditorias");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const htmlOutputPath = path.join(PUBLIC_DIR, "merged-report.html");
fs.writeFileSync(htmlOutputPath, htmlTemplate, "utf8");
console.log(`✅ Informe HTML IAAP PRO generado: ${htmlOutputPath}`);

// ===========================================================
// 🖨️ Generar PDF accesible IAAP PRO
// ===========================================================
const outputPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-IAAP.pdf");
(async () => {
  try {
    console.log("📄 Generando PDF IAAP PRO...");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 2 },
    });

    const page = await browser.newPage();
    await page.setContent(htmlTemplate, { waitUntil: "networkidle0" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
    });

    await browser.close();
    console.log(`✅ Informe PDF IAAP PRO generado correctamente: ${outputPath}`);
  } catch (err) {
    console.error(`❌ Error generando PDF: ${err.message}`);
    process.exit(1);
  }
})();
