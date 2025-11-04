// ✅ scripts/export-to-xlsx.mjs (v4.5 profesional – integración total con capturas IAAP/WCAG)
// Genera informe Excel profesional (IAAP/W3C) + ZIP con capturas organizadas
// • Traducción automática inglés → español (timeout 4s, fallback seguro)
// • Columnas clicables: Página analizada, Recomendación W3C, Captura (metadatos exactos)
// • Integración total con capture-evidence.mjs

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { getWcagInfo } from "./wcag-map.mjs";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===========================================================
// 🌐 Traducción automática inglés → español
// ===========================================================
async function traducirTexto(texto) {
  if (!texto || texto.trim().length < 4) return texto;

  const esIngles =
    /^[a-zA-Z0-9 ,.'":;!?()_-]+$/.test(texto) &&
    /the|accessible|aria|contrast|element|must|should/i.test(texto);

  if (!esIngles) return texto;

  try {
    const { stdout } = await execAsync(
      `curl -s -X POST "https://api-free.deeplx.org/translate" \
      -H "Content-Type: application/json" \
      -d '{"text": ${JSON.stringify(texto)}, "source_lang": "EN", "target_lang": "ES"}'`,
      { timeout: 4000 }
    );
    const json = JSON.parse(stdout);
    return json?.data?.translations?.[0]?.text || texto;
  } catch {
    return texto;
  }
}

// ===========================================================
// 📘 Diccionarios básicos WCAG
// ===========================================================
const wcagMap = {
  "image-alt": "1.1.1 Contenido no textual (A)",
  "color-contrast": "1.4.3 Contraste (AA)",
  "label": "3.3.2 Etiquetas o instrucciones (A)",
  "focus-visible": "2.4.7 Foco visible (AA)",
  "aria-allowed-role": "4.1.2 Nombre, función, valor (A)",
  "duplicate-id": "4.1.1 Procesamiento (A)",
  "html-has-lang": "3.1.1 Idioma de la página (A)",
};

const traducciones = {
  "Ensures images have alternate text":
    "Comprueba que las imágenes tienen texto alternativo.",
  "Ensures links have discernible text":
    "Garantiza que los enlaces contienen texto visible o nombre accesible.",
  "Ensures elements with ARIA roles have all required states and properties":
    "Verifica que los elementos con roles ARIA incluyen todos los atributos requeridos.",
  "Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds":
    "Garantiza que el contraste entre texto y fondo cumple con los niveles AA de la WCAG.",
  "Ensures form fields have associated labels":
    "Comprueba que los campos de formulario tienen etiquetas asociadas.",
};

// ===========================================================
// 🧩 Cargar metadatos de capturas (fase 2)
// ===========================================================
const auditoriasDir = path.join(__dirname, "../auditorias");
const capturasMetaPath = path.join(auditoriasDir, "capturas-metadata.json");
let capturasMeta = [];

if (fs.existsSync(capturasMetaPath)) {
  try {
    capturasMeta = JSON.parse(fs.readFileSync(capturasMetaPath, "utf8"));
    console.log(`📸 Metadatos de capturas cargados (${capturasMeta.length})`);
  } catch (err) {
    console.warn("⚠️ Error leyendo capturas-metadata.json:", err.message);
  }
} else {
  console.log("ℹ️ No se encontraron metadatos de capturas (capturas-metadata.json).");
}

// ===========================================================
// 🧾 Generador principal
// ===========================================================
async function generateExcel() {
  console.log("📊 Iniciando exportación profesional de resultados WCAG...");

  if (!fs.existsSync(auditoriasDir)) {
    console.error("❌ Carpeta /auditorias no encontrada.");
    process.exit(1);
  }

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

  const sitemapResults = results.filter((r) => r.origen === "sitemap");
  const interactivaResults = results.filter((r) => r.origen === "interactiva");

  const workbook = new ExcelJS.Workbook();

  // ===========================================================
  // 🎨 Crear hoja de auditoría
  // ===========================================================
  async function createAuditSheet(name, data, origen) {
    console.log(`📋 Generando hoja de auditoría ${name}...`);
    const sheet = workbook.addWorksheet(name);

    sheet.columns = [
      { header: "ID", key: "id", width: 20 },
      { header: "Criterio WCAG", key: "wcag", width: 30 },
      { header: "Severidad", key: "impact", width: 15 },
      { header: "Resumen (en español)", key: "summary", width: 70 },
      { header: "Elemento afectado", key: "element", width: 70 },
      { header: "Página analizada", key: "page", width: 60 },
      { header: "Resultado actual", key: "actual", width: 80 },
      { header: "Resultado esperado", key: "expected", width: 80 },
      { header: "Recomendación (W3C)", key: "recommendation", width: 60 },
      { header: "Captura de pantalla", key: "screenshot", width: 30 },
      { header: "Sistema", key: "system", width: 40 },
      { header: "Metodología", key: "method", width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };

    const impactColors = {
      critical: "FFFF0000",
      serious: "FFFF6600",
      moderate: "FFFFC000",
      minor: "FF92D050",
    };

    const counters = { total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 };

    for (const page of data) {
      if (!Array.isArray(page.violations)) continue;

      for (const v of page.violations) {
        const node = v.nodes?.[0] || {};
        const selector = node.target?.join(", ") || "(sin selector)";
        const wcagInfo = getWcagInfo(v.id) || {};

        const criterio = wcagInfo.criterio || wcagMap[v.id] || "WCAG 2.1 / 2.2";
        const helpUrl =
          wcagInfo.url || v.helpUrl || "https://www.w3.org/WAI/WCAG21/quickref/";

        let resumen =
          traducciones[v.help] ||
          wcagInfo.resumen ||
          v.help ||
          v.description ||
          "(sin descripción disponible)";

        if (!traducciones[resumen]) resumen = await traducirTexto(resumen);

        const resultadoActual = `Descripción: ${resumen}\nSelector: ${selector}\nHTML: ${
          node.html || "(no disponible)"
        }\n${node.failureSummary ? "Error: " + node.failureSummary : ""}`;

        const resultadoEsperado =
          wcagInfo.esperado ||
          `El elemento afectado debería cumplir el criterio "${criterio}".`;

        const impact = v.impact || "—";

        const row = sheet.addRow({
          id: v.id,
          wcag: criterio,
          impact,
          summary: resumen,
          element: selector,
          page: "",
          actual: resultadoActual,
          expected: resultadoEsperado,
          recommendation: "",
          screenshot: "",
          system: page.system || "macOS + Chrome (Cypress + axe-core)",
          method: "WCAG 2.1 / 2.2 (axe-core)",
        });

        // 🎨 Colorear severidad
        if (impactColors[impact]) {
          row.getCell("impact").fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: impactColors[impact] },
          };
        }

        // 🌍 Página analizada → hipervínculo
        row.getCell("page").value = { text: page.url, hyperlink: page.url };
        row.getCell("page").font = { color: { argb: "FF0563C1" }, underline: true };

        // 📘 Recomendación (W3C)
        row.getCell("recommendation").value = {
          text: "Ver recomendación W3C",
          hyperlink: helpUrl,
        };
        row.getCell("recommendation").font = { color: { argb: "FF0563C1" }, underline: true };

        // 🖼️ Captura: buscar en metadatos
        const capturaMatch = capturasMeta.find(
          (c) => c.url === page.url && c.criterio === v.id && c.origen === origen
        );

        const screenshotCell = row.getCell("screenshot");
        if (capturaMatch) {
          const relPath = `capturas/${capturaMatch.origen}/${capturaMatch.archivo}`;
          screenshotCell.value = { text: "Ver captura", hyperlink: relPath };
          screenshotCell.font = { color: { argb: "FF0563C1" }, underline: true };
        } else {
          screenshotCell.value = "(sin captura)";
          screenshotCell.font = { color: { argb: "FF7F7F7F" }, italic: true };
        }

        row.alignment = { vertical: "middle", wrapText: true };
        counters.total++;
        if (impact in counters) counters[impact]++;
      }
    }

    return counters;
  }

  // ===========================================================
  // 🧾 Crear hojas principales
  // ===========================================================
  const sitemapCounters = await createAuditSheet("Auditoría Sitemap", sitemapResults, "sitemap");
  const interactivaCounters = await createAuditSheet("Auditoría Interactiva", interactivaResults, "interactiva");

  // ===========================================================
  // 📊 Resumen global
  // ===========================================================
  const resumen = workbook.addWorksheet("Resumen de Severidades");
  resumen.columns = [
    { header: "Origen", key: "origen", width: 25 },
    { header: "Total", key: "total", width: 10 },
    { header: "Críticas", key: "critical", width: 12 },
    { header: "Graves", key: "serious", width: 12 },
    { header: "Moderadas", key: "moderate", width: 12 },
    { header: "Menores", key: "minor", width: 12 },
  ];
  const header = resumen.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  resumen.addRow({ origen: "Sitemap", ...sitemapCounters });
  resumen.addRow({ origen: "Interactiva", ...interactivaCounters });

  // ===========================================================
  // 💾 Guardar Excel y crear ZIP profesional
  // ===========================================================
  const excelPath = path.join(auditoriasDir, "Informe-WCAG-Profesional.xlsx");
  await workbook.xlsx.writeFile(excelPath);
  console.log(`✅ Archivo Excel profesional generado: ${excelPath}`);

  const zipPath = path.join(auditoriasDir, "Informe-WCAG.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  archive.file(excelPath, { name: path.basename(excelPath) });
  archive.file(latestMerged, { name: path.basename(latestMerged) });

  const capturasDir = path.join(auditoriasDir, "capturas");
  if (fs.existsSync(capturasDir)) {
    archive.directory(capturasDir, "capturas");
    console.log("📸 Añadiendo carpeta completa de capturas al ZIP...");
  }

  await archive.finalize();
  console.log(`🗜️ ZIP generado correctamente: ${zipPath}`);
  console.log("✅ Exportación profesional completada con éxito.");
}

// 🚀 Ejecutar
generateExcel().catch((err) => {
  console.error("❌ Error generando informe Excel:", err);
  process.exit(1);
});



