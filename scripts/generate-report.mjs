/**
 * 🧾 generate-report.mjs (v4.7.5 IAAP PRO / PDF Export)
 * -------------------------------------------------------------
 * Genera un informe profesional IAAP en PDF a partir del
 * resumen Markdown y los resultados combinados WCAG.
 *
 * ✅ Compatible con Informe-WCAG-IAAP.xlsx
 * ✅ Incluye portada, índice y gráficos accesibles
 * ✅ Diseño accesible (IAAP / W3C)
 * ✅ Salida: auditorias/Informe-WCAG-IAAP.pdf
 * -------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { marked } from "marked";

// ===========================================================
// 📂 Configuración base (IAAP v4.7.5 compatible)
// ===========================================================
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");

if (!fs.existsSync(AUDITORIAS_DIR)) fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });

// ===========================================================
// 🔍 Localizar el resumen Markdown
// ===========================================================
let summaryPath = null;
if (fs.existsSync(path.join(AUDITORIAS_DIR, "Resumen-WCAG.md"))) {
  summaryPath = path.join(AUDITORIAS_DIR, "Resumen-WCAG.md");
} else if (fs.existsSync(path.join(REPORTES_DIR, "merged-summary.md"))) {
  summaryPath = path.join(REPORTES_DIR, "merged-summary.md");
}

// ===========================================================
// 🔍 Localizar el archivo combinado (IAAP PRO v4.7.x compatible)
// ===========================================================
let mergedPath = null;

// 1️⃣ Buscar en auditorias/reportes/
if (fs.existsSync(path.join(REPORTES_DIR, "merged-results.json"))) {
  mergedPath = path.join(REPORTES_DIR, "merged-results.json");
} else {
  // 2️⃣ Fallback: buscar results-merged-*.json en auditorias/
  const oldMerged = fs
    .readdirSync(AUDITORIAS_DIR)
    .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
    .sort()
    .reverse()[0];
  if (oldMerged) {
    mergedPath = path.join(AUDITORIAS_DIR, oldMerged);
    console.warn(`⚠️ Usando archivo de compatibilidad en /auditorias: ${oldMerged}`);
  }
}

// ===========================================================
// 🧩 Validar existencia de archivos base
// ===========================================================
if (!mergedPath || !fs.existsSync(mergedPath)) {
  console.error("❌ No se encontró ningún merged-results.json ni results-merged-*.json en /auditorias o /auditorias/reportes");
  process.exit(1);
}

if (!summaryPath || !fs.existsSync(summaryPath)) {
  console.error("❌ No se encontró merged-summary.md ni Resumen-WCAG.md. Ejecuta primero generate-summary.mjs o merge-auditorias.mjs");
  process.exit(1);
}

// 📁 Rutas de salida
const outputPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-IAAP.pdf");

// Debug info útil en CI
console.log("📁 Rutas detectadas IAAP v4.7.5:");
console.log(`   - Resumen: ${summaryPath}`);
console.log(`   - Resultados combinados: ${mergedPath}`);
console.log(`   - Salida PDF: ${outputPath}`);

// ===========================================================
// 📊 Cargar datos reales
// ===========================================================
let mergedData = [];
try {
  mergedData = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
} catch (err) {
  console.error(`❌ Error al leer ${mergedPath}: ${err.message}`);
  process.exit(1);
}

const markdown = fs.readFileSync(summaryPath, "utf8");

// ===========================================================
// 🧮 Estadísticas IAAP para gráficos
// ===========================================================
const impactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 };
const origenCounts = { sitemap: 0, interactiva: 0 };

for (const entry of mergedData) {
  if (entry.origen && origenCounts[entry.origen] !== undefined)
    origenCounts[entry.origen] += entry.violations?.length || 0;
  for (const v of entry.violations || []) {
    const impact = v.impact?.toLowerCase() || "unclassified";
    if (impactCounts[impact] !== undefined) impactCounts[impact]++;
  }
}

// ===========================================================
// 🧩 Convertir Markdown a HTML IAAP PRO
// ===========================================================
const htmlContent = marked(markdown, { headerIds: true, mangle: false });

// Crear índice de contenidos
const toc = htmlContent
  .match(/<h2[^>]*>(.*?)<\/h2>/g)
  ?.map((h) => {
    const clean = h.replace(/<[^>]+>/g, "").trim();
    const id = clean.toLowerCase().replace(/\s+/g, "-");
    return `<li><a href="#${id}">${clean}</a></li>`;
  })
  .join("") || "<li>No disponible</li>";

// ===========================================================
// 🎨 Plantilla HTML accesible IAAP PRO
// ===========================================================
const htmlTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Informe IAAP PRO – WCAG</title>
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
  <h2>Evaluación de conformidad con WCAG 2.1 / 2.2</h2>
  <p><strong>Generado automáticamente por Ilúmina Audit IAAP PRO</strong></p>
  <p>${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</p>
</div>

<div class="page-break"></div>

<h2>📖 Tabla de contenidos</h2>
<div class="toc"><ul>${toc}</ul></div>

<div class="page-break"></div>

${htmlContent}

<div class="page-break"></div>

<h2>📊 Gráficos de resultados</h2>
<div class="chart">
  <canvas id="chartSeveridad" width="600" height="300"></canvas>
  <div class="legend">Distribución de violaciones por severidad</div>
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
    data: { labels: Object.keys(impactData), datasets: [{ data: Object.values(impactData), backgroundColor: ['#b30000','#e67300','#ffcc00','#66b266','#999999'] }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
  new Chart(document.getElementById('chartOrigen'), {
    type: 'pie',
    data: { labels: Object.keys(origenData), datasets: [{ data: Object.values(origenData), backgroundColor: ['#0044cc','#00cc99'] }] },
    options: { plugins: { legend: { position: 'bottom' } } }
  });
</script>

</body>
</html>
`;

// ===========================================================
// 🌐 Guardar HTML accesible en public/auditorias
// ===========================================================
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "auditorias");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const htmlOutputPath = path.join(PUBLIC_DIR, "merged-report.html");
fs.writeFileSync(htmlOutputPath, htmlTemplate, "utf8");
console.log(`✅ Informe HTML accesible generado en: ${htmlOutputPath}`);

// ===========================================================
// 🖨️ Generar PDF IAAP PRO
// ===========================================================
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
    console.log(`✅ Informe PDF IAAP generado correctamente: ${outputPath}`);
  } catch (err) {
    console.error(`❌ Error generando PDF: ${err.message}`);
    process.exit(1);
  }
})();



