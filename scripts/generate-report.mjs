/**
 * 🧾 generate-report.mjs (v4.5 IAAP / PDF Export con datos reales)
 * -------------------------------------------------------------
 * Genera un informe profesional en PDF a partir del resumen
 * Markdown (Resumen-WCAG.md) y de los resultados combinados
 * (results-merged-*.json).
 *
 * ✅ Portada profesional con logo y fecha
 * ✅ Gráficos reales (severidad + origen)
 * ✅ Diseño accesible y legible
 * ✅ Compatible con CI/CD (GitHub Actions / Jenkins / Docker)
 * ✅ Salida: auditorias/Informe-WCAG-Profesional.pdf
 * -------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { marked } from "marked";

// ===========================================================
// 📂 Configuración base
// ===========================================================
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
if (!fs.existsSync(AUDITORIAS_DIR)) fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });

const summaryPath = path.join(AUDITORIAS_DIR, "Resumen-WCAG.md");
const mergedFile = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
  .sort()
  .reverse()[0];

if (!mergedFile) {
  console.error("❌ No se encontró ningún results-merged-*.json en /auditorias");
  process.exit(1);
}
const mergedPath = path.join(AUDITORIAS_DIR, mergedFile);

const outputPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-Profesional.pdf");

if (!fs.existsSync(summaryPath)) {
  console.error("❌ No se encontró Resumen-WCAG.md. Ejecuta primero generate-summary.mjs");
  process.exit(1);
}

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
// 🧮 Cálculos de estadísticas para gráficos
// ===========================================================
const impactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const origenCounts = { sitemap: 0, interactiva: 0 };

for (const entry of mergedData) {
  if (entry.origen && origenCounts[entry.origen] !== undefined)
    origenCounts[entry.origen] += entry.violations?.length || 0;

  for (const v of entry.violations || []) {
    const impact = v.impact?.toLowerCase();
    if (impactCounts[impact] !== undefined) impactCounts[impact]++;
  }
}

const totalViolations = Object.values(impactCounts).reduce((a, b) => a + b, 0);
const impactoPercent = Object.fromEntries(
  Object.entries(impactCounts).map(([k, v]) => [k, ((v / totalViolations) * 100).toFixed(1)])
);

// ===========================================================
// 🧩 Convertir Markdown a HTML
// ===========================================================
const htmlContent = marked(markdown, { headerIds: true, mangle: false });

// ===========================================================
// 🎨 Plantilla HTML profesional IAAP
// ===========================================================
const htmlTemplate = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Informe de Accesibilidad WCAG</title>
<style>
  @page {
    margin: 2cm;
  }

  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
    color: #111;
    margin: 0;
  }

  h1, h2, h3 {
    color: #003366;
    border-bottom: 2px solid #e0e0e0;
    padding-bottom: 4px;
  }

  h1 {
    color: #002b80;
    font-size: 1.8em;
    text-align: center;
  }

  h2 {
    font-size: 1.3em;
    margin-top: 1.5em;
  }

  h3 {
    font-size: 1.1em;
  }

  p {
    font-size: 0.95em;
    margin: 0.4em 0;
  }

  code {
    background: #f6f8fa;
    padding: 2px 5px;
    border-radius: 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
  }

  th, td {
    border: 1px solid #ccc;
    padding: 6px 8px;
    text-align: left;
  }

  th {
    background-color: #f0f4ff;
  }

  tr:nth-child(even) {
    background-color: #fafafa;
  }

  .page-break {
    page-break-before: always;
  }

  header {
    text-align: center;
    padding: 30px 0 10px;
    border-bottom: 2px solid #003366;
  }

  footer {
    text-align: center;
    font-size: 0.8em;
    color: #555;
    position: fixed;
    bottom: 10px;
    width: 100%;
  }

  .cover {
    text-align: center;
    padding: 6cm 2cm;
  }

  .cover h1 {
    font-size: 2.4em;
    margin-bottom: 0.4em;
  }

  .cover h2 {
    font-size: 1.3em;
    color: #444;
  }

  .chart {
    text-align: center;
    margin: 1em auto;
  }

  .summary-table td:first-child {
    font-weight: bold;
  }

  .legend {
    text-align: center;
    font-size: 0.85em;
    color: #444;
    margin-top: 5px;
  }
</style>
</head>
<body>

<header>
  <img src="https://iluminamedia.es/wp-content/uploads/2024/09/ilumina-media-logo.png" alt="Ilúmina Media" width="150" />
</header>

<div class="cover">
  <h1>Informe de Accesibilidad Digital</h1>
  <h2>Evaluación de conformidad con WCAG 2.1 / 2.2</h2>
  <p><strong>Generado automáticamente por Ilúmina Audit WCAG</strong></p>
  <p>${new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}</p>
</div>

<div class="page-break"></div>

${htmlContent}

<div class="page-break"></div>

<h2>📊 Gráficos de severidad y distribución</h2>
<div class="chart">
  <canvas id="chartSeveridad" width="600" height="300"></canvas>
  <div class="legend">Distribución de violaciones por severidad</div>
</div>

<div class="chart">
  <canvas id="chartDistribucion" width="600" height="300"></canvas>
  <div class="legend">Violaciones según tipo de auditoría</div>
</div>

<footer>
  ♿ Informe IAAP generado automáticamente por Ilúmina Audit WCAG Pipeline
</footer>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  const severidades = ${JSON.stringify(Object.keys(impactCounts))};
  const valores = ${JSON.stringify(Object.values(impactCounts))};
  const origenes = ${JSON.stringify(Object.keys(origenCounts))};
  const origenValores = ${JSON.stringify(Object.values(origenCounts))};

  new Chart(document.getElementById('chartSeveridad'), {
    type: 'bar',
    data: {
      labels: severidades,
      datasets: [{
        label: 'Violaciones por severidad',
        data: valores,
        backgroundColor: ['#b30000','#e67300','#ffcc00','#66b266']
      }]
    },
    options: {
      plugins: { legend: { display: false }},
      scales: { y: { beginAtZero: true }}
    }
  });

  new Chart(document.getElementById('chartDistribucion'), {
    type: 'pie',
    data: {
      labels: origenes,
      datasets: [{
        data: origenValores,
        backgroundColor: ['#0044cc', '#00cc99']
      }]
    },
    options: { plugins: { legend: { position: 'bottom' }} }
  });
</script>

</body>
</html>
`;

// ===========================================================
// 🖨️ Generar PDF con Puppeteer
// ===========================================================
(async () => {
  try {
    console.log("📄 Generando PDF IAAP con datos reales...");
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
    console.log(`✅ Informe PDF generado correctamente: ${outputPath}`);
  } catch (err) {
    console.error(`❌ Error generando PDF: ${err.message}`);
    process.exit(1);
  }
})();
