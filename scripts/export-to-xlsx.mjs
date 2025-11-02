// ✅ scripts/export-to-xlsx.mjs
// Genera informe Excel profesional + ZIP con evidencias de auditoría WCAG
// Compatible con Node 20+ (ESM puro)

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import archiver from "archiver";
import { fileURLToPath } from "url";

// Necesario para obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateExcel() {
  console.log("📊 Iniciando exportación de resultados WCAG...");

  const auditoriasDir = path.join(__dirname, "../auditorias");

  // Buscar carpetas de auditorías
  const subdirs = fs
    .readdirSync(auditoriasDir)
    .filter((d) => d.includes("-auditoria"))
    .sort()
    .reverse();

  if (subdirs.length === 0) {
    console.error("❌ No se encontraron carpetas de auditoría.");
    process.exit(1);
  }

  const latest = path.join(auditoriasDir, subdirs[0]);
  const resultsPath = path.join(latest, "results.json");

  if (!fs.existsSync(resultsPath)) {
    console.error("❌ No se encontró results.json en la última auditoría.");
    process.exit(1);
  }

  console.log(`📄 Cargando resultados desde: ${resultsPath}`);
  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8"));

  // Crear nuevo Excel
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Auditoría WCAG");

  // Definir columnas
  sheet.columns = [
    { header: "Página", key: "url", width: 60 },
    { header: "Fecha", key: "date", width: 25 },
    { header: "Violación", key: "id", width: 25 },
    { header: "Impacto", key: "impact", width: 15 },
    { header: "Descripción", key: "description", width: 80 },
    { header: "Elemento", key: "target", width: 60 },
  ];

  // Estilo cabecera
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E78" },
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  // Rellenar datos
  results.forEach((page) => {
    page.violations.forEach((v) => {
      const row = sheet.addRow({
        url: page.url,
        date: page.date,
        id: v.id,
        impact: v.impact || "—",
        description: v.description,
        target: v.nodes.map((n) => n.target.join(", ")).join(" | "),
      });

      // Colorear según impacto
      const impactColors = {
        critical: "FFFF0000",
        serious: "FFFF6600",
        moderate: "FFFFC000",
        minor: "FF92D050",
      };

      if (impactColors[v.impact]) {
        row.getCell("impact").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: impactColors[v.impact] },
        };
      }
    });
  });

  // Ajustes visuales
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };

  sheet.getRow(1).height = 25;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const excelPath = path.join(latest, "Informe-WCAG.xlsx");
  await workbook.xlsx.writeFile(excelPath);

  console.log(`✅ Archivo Excel generado correctamente: ${excelPath}`);

  // 📦 Crear ZIP con Excel + capturas
  const zipPath = path.join(auditoriasDir, `${subdirs[0]}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(latest, false);

  await archive.finalize();
  console.log(`🗜️ ZIP generado correctamente: ${zipPath}`);

  console.log("✅ Exportación completada con éxito.");
}

// Ejecutar
generateExcel().catch((err) => {
  console.error("❌ Error generando informe Excel:", err);
  process.exit(1);
});
