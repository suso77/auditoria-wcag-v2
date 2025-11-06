/**
 * 📊 export-to-xlsx.mjs (v4.1.0 IAAP PRO / W3C estable)
 * -------------------------------------------------------------------
 * Genera informe de auditoría accesible IAAP:
 *  - Pestañas: Sitemap / Interactiva / Resumen global
 *  - Traducción automática (DeepLx) con caché y tolerancia CI
 *  - Incluye nivel de conformidad WCAG (A / AA / AAA)
 *  - Formato profesional IAAP con estilos visuales
 *  - Compatible con merge-results v4.1.1 y summary v4.0.0
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
// 🌍 Traducción con caché (DeepLx API libre y segura)
// ===========================================================
const cache = new Map();
async function traducir(texto) {
  if (!texto || texto.length < 4) return texto;
  if (cache.has(texto)) return cache.get(texto);
  if (/[áéíóúñ¿¡]/i.test(texto)) return texto;

  try {
    const { stdout } = await execAsync(
      `curl -s -X POST "https://api-free.deeplx.org/translate" -H "Content-Type: application/json" -d '{"text": ${JSON.stringify(
        texto
      )}, "source_lang": "EN", "target_lang": "ES"}'`,
      { timeout: 4000 }
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
  console.warn("⚠️ No hay datos válidos para exportar.");
  process.exit(0);
}

// ===========================================================
// 🧩 Configuración del libro Excel
// ===========================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Ilúmina Audit IAAP PRO";
wb.created = new Date();
wb.properties.subject = "Auditoría de Accesibilidad WCAG – IAAP PRO";

// ===========================================================
// 🎨 Colores de severidad IAAP
// ===========================================================
const colorPorImpacto = {
  critical: "FFFF0000",
  serious: "FFFF6600",
  moderate: "FFFFC000",
  minor: "FF92D050",
  unclassified: "FFD9D9D9",
};

// ===========================================================
// 🧠 Helper para crear hoja IAAP
// ===========================================================
function crearHoja(nombre) {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = [
    { header: "ID", key: "id", width: 20 },
    { header: "Criterio WCAG", key: "criterio", width: 40 },
    { header: "Nivel", key: "nivel", width: 10 },
    { header: "Severidad", key: "impact", width: 15 },
    { header: "Resumen", key: "resumen", width: 60 },
    { header: "Elemento afectado", key: "selector", width: 60 },
    { header: "Página analizada", key: "url", width: 80 },
    { header: "Resultado actual", key: "resultado_actual", width: 70 },
    { header: "Resultado esperado", key: "resultado_esperado", width: 50 },
    { header: "Recomendación (W3C)", key: "recomendacion", width: 40 },
    { header: "Captura", key: "captura", width: 40 },
    { header: "Sistema", key: "system", width: 35 },
    { header: "Metodología", key: "metodologia", width: 30 },
  ];

  const header = hoja.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  hoja.autoFilter = { from: "A1", to: "M1" };
  return hoja;
}

const hojaSitemap = crearHoja("🌐 Sitemap");
const hojaInteractiva = crearHoja("🧠 Interactiva");

// ===========================================================
// 🧾 Resumen IAAP Global
// ===========================================================
const hojaResumen = wb.addWorksheet("📊 Resumen Global");
hojaResumen.columns = [
  { header: "Origen", key: "origen", width: 20 },
  { header: "URLs auditadas", key: "urls", width: 20 },
  { header: "Violaciones totales", key: "total", width: 20 },
  { header: "Critical", key: "critical", width: 15 },
  { header: "Serious", key: "serious", width: 15 },
  { header: "Moderate", key: "moderate", width: 15 },
  { header: "Minor", key: "minor", width: 15 },
  { header: "Unclassified", key: "unclassified", width: 15 },
  { header: "Conformidad estimada (%)", key: "conformidad", width: 25 },
];
hojaResumen.getRow(1).font = { bold: true };

// ===========================================================
// 🧮 Procesar resultados IAAP
// ===========================================================
const stats = { sitemap: {}, interactiva: {} };

for (const page of data) {
  const targetSheet = page.origen === "interactiva" ? hojaInteractiva : hojaSitemap;
  const origenStats = page.origen === "interactiva" ? stats.interactiva : stats.sitemap;
  origenStats.urls = origenStats.urls || new Set();
  origenStats.urls.add(page.url);

  for (const v of page.violations || []) {
    origenStats.total = (origenStats.total || 0) + 1;
    const impact = v.impact?.toLowerCase() || "unclassified";
    origenStats[impact] = (origenStats[impact] || 0) + 1;

    const criterio =
      v.tags?.find((t) => t.startsWith("wcag")) || v.id || "(sin criterio)";
    const nivel =
      criterio.includes("aaa") ? "AAA" : criterio.includes("aa") ? "AA" : "A";
    const resumen = await traducir(v.help || v.description || "(sin descripción)");
    const selector = v.nodes?.[0]?.target?.join(", ") || "(sin selector)";
    const html = v.nodes?.[0]?.html || "(sin HTML)";
    const errorMsg = v.nodes?.[0]?.failureSummary || "(sin detalles de error)";
    const resultadoActual = `Descripción: ${resumen}\nSelector: ${selector}\nHTML: ${html}\nError: ${errorMsg}`;
    const resultadoEsperado =
      "El contenido cumple con los criterios de accesibilidad del nivel indicado.";
    const recomendacion = "Consultar técnicas WCAG relevantes.";
    const captura = page.capturePath
      ? { text: "Ver captura", hyperlink: page.capturePath }
      : "(sin captura)";

    const row = targetSheet.addRow({
      id: v.id,
      criterio,
      nivel,
      impact,
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

    if (colorPorImpacto[impact]) {
      row.getCell("impact").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorPorImpacto[impact] },
      };
    }
  }
}

// ===========================================================
// 📊 Añadir resumen global con índice IAAP
// ===========================================================
for (const [origen, s] of Object.entries(stats)) {
  if (!s.urls) continue;
  const penalizacion =
    (s.critical || 0) * 2.5 +
    (s.serious || 0) * 1.4 +
    (s.moderate || 0) * 0.6 +
    (s.minor || 0) * 0.3;
  const conformidad = Math.max(0, 100 - penalizacion / Math.max(s.urls.size, 1)).toFixed(1);
  hojaResumen.addRow({
    origen,
    urls: s.urls.size,
    total: s.total || 0,
    critical: s.critical || 0,
    serious: s.serious || 0,
    moderate: s.moderate || 0,
    minor: s.minor || 0,
    unclassified: s.unclassified || 0,
    conformidad,
  });
}

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
console.log("✅ Exportación IAAP PRO completada con éxito.");
