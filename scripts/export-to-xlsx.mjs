// ✅ scripts/export-to-xlsx.mjs
// Genera informe Excel profesional (formato IAAP / W3C) + ZIP con evidencias
// Conserva los resúmenes de severidades y compatibilidad total con el pipeline.

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateExcel() {
  console.log("📊 Iniciando exportación profesional de resultados WCAG...");

  const auditoriasDir = path.join(__dirname, "../auditorias");

  const mergedFiles = fs
    .readdirSync(auditoriasDir)
    .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (mergedFiles.length === 0) {
    console.error("❌ No se encontraron archivos results-merged-*.json.");
    process.exit(1);
  }

  const latestMerged = path.join(auditoriasDir, mergedFiles[0]);
  console.log(`📄 Cargando resultados combinados desde: ${latestMerged}`);

  const results = JSON.parse(fs.readFileSync(latestMerged, "utf-8"));
  if (!Array.isArray(results) || results.length === 0) {
    console.error("❌ El archivo results-merged está vacío o mal formado.");
    process.exit(1);
  }

  results.sort((a, b) => {
    const order = { sitemap: 1, interactiva: 2 };
    return (order[a.origen] || 99) - (order[b.origen] || 99) || (a.url || "").localeCompare(b.url || "");
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Auditoría WCAG");

  // 🧱 Cabeceras profesionales
  sheet.columns = [
    { header: "ID", key: "id", width: 30 },
    { header: "Sistema operativo, navegador y tecnología asistiva", key: "system", width: 45 },
    { header: "Resumen", key: "summary", width: 70 },
    { header: "Elemento afectado", key: "element", width: 80 },
    { header: "Páginas afectadas", key: "page", width: 60 },
    { header: "Resultado actual", key: "actual", width: 80 },
    { header: "Resultado esperado", key: "expected", width: 80 },
    { header: "Metodología de testing", key: "method", width: 45 },
    { header: "Severidad", key: "impact", width: 15 },
    { header: "Criterio WCAG", key: "wcag", width: 30 },
    { header: "Captura de pantalla", key: "screenshot", width: 25 },
    { header: "Recomendación (W3C)", key: "recommendation", width: 70 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  const impactColors = {
    critical: "FFFF0000",
    serious: "FFFF6600",
    moderate: "FFFFC000",
    minor: "FF92D050",
  };

  const counters = { sitemap: { total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 }, interactiva: { total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 } };
  let currentOrigen = null;

  results.forEach((page) => {
    if (!page || !Array.isArray(page.violations)) return;
    const origen = page.origen || "sitemap";

    if (currentOrigen !== origen) {
      currentOrigen = origen;
      const sep = sheet.addRow([`=== ${origen.toUpperCase()} ===`]);
      sep.font = { bold: true, color: { argb: "FF1F4E78" } };
      sheet.addRow([]);
    }

    page.violations.forEach((v) => {
      const node = v.nodes?.[0] || {};
      const selector = node.target?.join(", ") || "(no especificado)";
      const wcag = v.tags?.find((t) => t.startsWith("wcag"))?.replace("wcag", "WCAG ") || "WCAG 2.1 / 2.2 AA";
      const helpUrl = v.helpUrl || "https://www.w3.org/WAI/WCAG22/Understanding/";
      const description = v.description || v.help || v.id;
      const impact = v.impact || "—";
      const html = node.html || "";
      const failure = node.failureSummary || "";
      const pageTitle = page.pageTitle || "(sin título)";

      const row = sheet.addRow({
        id: v.id,
        system: page.system,
        summary: description,
        element: `${selector} ${failure ? `texto="${failure}"` : ""}`,
        page: page.url,
        actual: `${description} — Selector: ${selector} — HTML: ${html}`,
        expected: "El contenido debe cumplir con las condiciones de accesibilidad establecidas por la WCAG correspondiente.",
        method: "WCAG 2.1 / 2.2 AA (automatizado con axe-core)",
        impact,
        wcag,
        screenshot: "Evidencia (Página)",
        recommendation: helpUrl,
      });

      if (impactColors[v.impact]) {
        row.getCell("impact").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: impactColors[v.impact] },
        };
      }

      // Contadores
      counters[origen].total++;
      if (impact in counters[origen]) counters[origen][impact]++;
    });
  });

  // 🎯 Ajustes visuales
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).height = 25;

  // 🧾 Resumen de severidades
  sheet.addRow([]);
  sheet.addRow(["Resumen de severidades por origen"]);
  sheet.addRow(["Origen", "Total", "Critical", "Serious", "Moderate", "Minor"]);

  for (const [origen, data] of Object.entries(counters)) {
    sheet.addRow([origen, data.total, data.critical, data.serious, data.moderate, data.minor]);
  }

  // 💾 Guardar Excel
  const excelPath = path.join(auditoriasDir, "Informe-WCAG-Profesional.xlsx");
  await workbook.xlsx.writeFile(excelPath);
  console.log(`✅ Archivo Excel profesional generado: ${excelPath}`);

  // 📦 Crear ZIP
  const zipPath = path.join(auditoriasDir, "Informe-WCAG.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  archive.file(excelPath, { name: path.basename(excelPath) });
  archive.file(latestMerged, { name: path.basename(latestMerged) });

  const evidencias = fs.readdirSync(auditoriasDir).filter((d) => d.endsWith("-evidencias"));
  evidencias.forEach((dir) => archive.directory(path.join(auditoriasDir, dir), dir));

  await archive.finalize();
  console.log(`🗜️ ZIP generado correctamente: ${zipPath}`);
  console.log("✅ Exportación profesional completada con éxito.");
}

generateExcel().catch((err) => {
  console.error("❌ Error generando informe Excel:", err);
  process.exit(1);
});




