/**
 * 📊 export-to-xlsx.mjs (v4.0.0 IAAP PRO / W3C)
 * -------------------------------------------------------------------
 * Genera informe de auditoría accesible IAAP:
 *  - Pestañas: Sitemap / Interactiva / Resumen global
 *  - Traducción automática (DeepLx) con caché local
 *  - Formato profesional IAAP (12 columnas)
 *  - Compatible con merge-results v4.0.0
 *  - Incluye capturas, sistema y metodología WCAG
 * -------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import ExcelJS from "exceljs";
import archiver from "archiver";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");

// ===========================================================
// 🌍 Traducción con caché (DeepLx API libre)
// ===========================================================
const cache = new Map();
async function traducir(texto) {
  if (!texto || texto.length < 4) return texto;
  if (cache.has(texto)) return cache.get(texto);
  if (/[áéíóúñ¿¡]/i.test(texto)) return texto; // Ya en español

  try {
    const { stdout } = await execAsync(
      `curl -s -X POST "https://api-free.deeplx.org/translate" -H "Content-Type: application/json" -d '{"text": ${JSON.stringify(
        texto
      )}, "source_lang": "EN", "target_lang": "ES"}'`,
      { timeout: 5000 }
    );
    const res = JSON.parse(stdout);
    const tr = res?.data?.translations?.[0]?.text?.trim() || texto;
    cache.set(texto, tr);
    return tr;
  } catch {
    cache.set(texto, texto);
    return texto;
  }
}

// ===========================================================
// 🔍 Cargar el último archivo combinado
// ===========================================================
const mergedFile = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
  .sort()
  .reverse()[0];

if (!mergedFile) {
  console.error("❌ No se encontró results-merged-*.json");
  process.exit(1);
}

const mergedPath = path.join(AUDITORIAS_DIR, mergedFile);
const data = JSON.parse(fs.readFileSync(mergedPath, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos de auditoría válidos para exportar.");
  process.exit(0);
}

// ===========================================================
// 🧩 Configuración del libro Excel
// ===========================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Ilúmina Media – Auditoría IAAP PRO";
wb.created = new Date();

const colorPorImpacto = {
  critical: "FFFF0000",
  serious: "FFFF6600",
  moderate: "FFFFC000",
  minor: "FF92D050",
};

// ===========================================================
// 🧠 Helper para crear hoja IAAP estándar
// ===========================================================
function crearHoja(nombre) {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = [
    { header: "ID", key: "id", width: 20 },
    { header: "Criterio WCAG", key: "criterio", width: 40 },
    { header: "Severidad", key: "impact", width: 15 },
    { header: "Resumen", key: "resumen", width: 60 },
    { header: "Elemento afectado", key: "selector", width: 60 },
    { header: "Página analizada", key: "url", width: 80 },
    { header: "Resultado actual", key: "resultado_actual", width: 70 },
    { header: "Resultado esperado", key: "resultado_esperado", width: 50 },
    { header: "Recomendación (W3C)", key: "recomendacion", width: 40 },
    { header: "Captura de pantalla", key: "captura", width: 40 },
    { header: "Sistema", key: "system", width: 40 },
    { header: "Metodología", key: "metodologia", width: 35 },
  ];
  const header = hoja.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  hoja.autoFilter = { from: "A1", to: "L1" };
  return hoja;
}

const hojaSitemap = crearHoja("Sitemap");
const hojaInteractiva = crearHoja("Interactiva");

// ===========================================================
// 🧾 Resumen IAAP global
// ===========================================================
const hojaResumen = wb.addWorksheet("Resumen Global");
hojaResumen.columns = [
  { header: "Origen", key: "origen", width: 20 },
  { header: "URLs auditadas", key: "urls", width: 20 },
  { header: "Violaciones totales", key: "total", width: 20 },
  { header: "Critical", key: "critical", width: 15 },
  { header: "Serious", key: "serious", width: 15 },
  { header: "Moderate", key: "moderate", width: 15 },
  { header: "Minor", key: "minor", width: 15 },
];
hojaResumen.getRow(1).font = { bold: true };

// ===========================================================
// 🧮 Procesar resultados
// ===========================================================
const stats = { sitemap: {}, interactiva: {} };
for (const page of data) {
  const targetSheet = page.origen === "interactiva" ? hojaInteractiva : hojaSitemap;
  const origenStats = page.origen === "interactiva" ? stats.interactiva : stats.sitemap;

  origenStats.urls = origenStats.urls || new Set();
  origenStats.urls.add(page.url);

  for (const v of page.violations || []) {
    origenStats.total = (origenStats.total || 0) + 1;
    origenStats[v.impact] = (origenStats[v.impact] || 0) + 1;

    const criterio =
      v.tags?.find((t) => t.startsWith("wcag")) ||
      "(sin criterio)" ||
      v.help || v.id;

    const resumen = await traducir(v.help || v.description || "(sin descripción)");
    const selector = v.nodes?.[0]?.target?.join(", ") || "(sin selector)";
    const html = v.nodes?.[0]?.html || "(sin HTML)";
    const errorMsg = v.nodes?.[0]?.failureSummary || "(sin detalles de error)";
    const resultadoActual = `Descripción: ${resumen}\nSelector: ${selector}\nHTML: ${html}\nError: ${errorMsg}`;
    const resultadoEsperado =
      "La estructura y relaciones se determinan programáticamente.";
    const recomendacion = "Ver recomendación W3C";
    const captura = page.capturePath
      ? { text: "Ver captura", hyperlink: page.capturePath }
      : "(sin captura)";

    const row = targetSheet.addRow({
      id: v.id,
      criterio,
      impact: v.impact || "(sin severidad)",
      resumen,
      selector,
      url: { text: page.url, hyperlink: page.url },
      resultado_actual: resultadoActual,
      resultado_esperado: resultadoEsperado,
      recomendacion,
      captura,
      system: page.system || "macOS + Chrome (Cypress + axe-core)",
      metodologia: "WCAG 2.1 / 2.2 (axe-core)",
    });

    if (colorPorImpacto[v.impact]) {
      row.getCell("impact").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorPorImpacto[v.impact] },
      };
    }
  }
}

// ===========================================================
// 📊 Añadir resumen global
// ===========================================================
["sitemap", "interactiva"].forEach((origen) => {
  const s = stats[origen];
  if (!s.urls) return;
  hojaResumen.addRow({
    origen,
    urls: s.urls.size,
    total: s.total || 0,
    critical: s.critical || 0,
    serious: s.serious || 0,
    moderate: s.moderate || 0,
    minor: s.minor || 0,
  });
});

// ===========================================================
// 💾 Guardar Excel y ZIP IAAP PRO
// ===========================================================
const excelPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-IAAP.xlsx");
await wb.xlsx.writeFile(excelPath);
console.log(`✅ Excel IAAP generado: ${excelPath}`);

const zipPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-IAAP.zip");
const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(output);
archive.file(excelPath, { name: path.basename(excelPath) });
archive.file(mergedPath, { name: path.basename(mergedPath) });

const capturasDir = path.join(AUDITORIAS_DIR, "capturas");
if (fs.existsSync(capturasDir)) archive.directory(capturasDir, "capturas");
await archive.finalize();

console.log(`📦 ZIP IAAP generado: ${zipPath}`);
console.log("✅ Exportación IAAP completada con éxito.");
