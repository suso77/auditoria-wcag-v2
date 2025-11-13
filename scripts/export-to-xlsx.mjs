/**
 * ♿ export-to-xlsx.mjs — IAAP PRO v6.5 (WCAG 2.2 + Recomendaciones IAAP)
 * -----------------------------------------------------------------------------
 * Exporta los resultados combinados a Excel IAAP PRO con:
 * ✅ Sitemap + Interactiva + Manual
 * ✅ Capturas vinculadas (una por violación o URL)
 * ✅ Columnas actualizadas: Resultado actual, Resultado esperado y Recomendación W3C
 * ✅ Severidades y resumen global
 * ✅ Compatibilidad con merge-auditorias v6.5 y generate-summary v6.5
 */

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getWcagInfo } from "./wcag-map.mjs";

// ============================================================
// 📁 Directorios principales
// ============================================================
const ROOT = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
const MERGED_PATH = path.join(REPORTES_DIR, "merged-results.json");
const OUTPUT_PATH = path.join(REPORTES_DIR, "Informe-WCAG-IAAP-v6.5.xlsx");

fs.mkdirSync(REPORTES_DIR, { recursive: true });
fs.mkdirSync(CAPTURAS_DIR, { recursive: true });

// ============================================================
// 📄 Cargar merged-results.json
// ============================================================
if (!fs.existsSync(MERGED_PATH)) {
  console.error("❌ No se encontró merged-results.json en auditorias/reportes/");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(MERGED_PATH, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos válidos para exportar.");
  process.exit(0);
}

// ============================================================
// 🧠 Funciones auxiliares
// ============================================================
function normalizeImpact(impact) {
  const i = (impact || "").toLowerCase();
  const map = {
    critical: "Critical",
    serious: "Serious",
    moderate: "Moderate",
    minor: "Minor",
    "needs-review": "Revisión manual",
  };
  return map[i] || "Sin severidad";
}

function enrichCriterio(v) {
  const info = getWcagInfo(v.wcag || v.id || "");
  if (!info) {
    return {
      criterio: v.wcag || "(sin criterio)",
      nivel: "—",
      resumen: v.description || "Elemento con posible problema de accesibilidad.",
      url: "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
      principio: "",
    };
  }
  return {
    criterio: info.criterio,
    nivel: info.nivel,
    resumen: info.resumen,
    url: info.url?.includes("w3.org")
      ? `${info.url}?showtechniques=es`
      : info.url,
    principio: info.principio || "",
  };
}

function getCapturePath(issue) {
  if (issue.capturePath) {
    const abs = path.join(AUDITORIAS_DIR, issue.capturePath);
    if (fs.existsSync(abs)) return abs;
  }
  const hint = (issue.pageUrl || "").replace(/[^\w-]/g, "_").slice(0, 60);
  const found = fs
    .readdirSync(CAPTURAS_DIR)
    .find((f) => f.endsWith(".png") && f.includes(hint));
  return found ? path.join(CAPTURAS_DIR, found) : null;
}

// ============================================================
// 📘 Configuración del libro Excel
// ============================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Ilúmina Audit IAAP PRO v6.5";
wb.created = new Date();

// ============================================================
// 🧱 Definición de columnas IAAP PRO v6.5
// ============================================================
const columnas = [
  { header: "Origen", key: "origen", width: 15 },
  { header: "Motor", key: "engine", width: 15 },
  { header: "Criterio WCAG", key: "criterio", width: 40 },
  { header: "Nivel", key: "nivel", width: 10 },
  { header: "Principio", key: "principio", width: 20 },
  { header: "Impacto", key: "impact", width: 15 },
  { header: "Descripción", key: "descripcion", width: 70 },
  { header: "Resultado actual", key: "resultadoActual", width: 60 },
  { header: "Resultado esperado", key: "resultadoEsperado", width: 60 },
  { header: "Recomendación W3C", key: "recomendacionW3C", width: 80 },
  { header: "Elemento Afectado", key: "selector", width: 50 },
  { header: "Página", key: "url", width: 70 },
  { header: "Captura", key: "captura", width: 40 },
];

// ============================================================
// 📄 Crear hojas
// ============================================================
const hojas = {
  sitemap: wb.addWorksheet("🌐 Sitemap"),
  interactiva: wb.addWorksheet("🧠 Interactiva"),
  manual: wb.addWorksheet("🖐️ Manual"),
  resumen: wb.addWorksheet("📊 Resumen Global"),
};

Object.values(hojas).forEach((sheet) => {
  sheet.columns = columnas;
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: "A1", to: "M1" };
  sheet.columns.forEach(
    (c) => (c.alignment = { wrapText: true, vertical: "top" })
  );
});

// ============================================================
// 🧮 Procesar resultados IAAP PRO
// ============================================================
for (const issue of data) {
  const origen = issue.source || "sitemap";
  const criterio = enrichCriterio(issue);
  const impactNorm = normalizeImpact(issue.impact);
  const capturePath = getCapturePath(issue);

  const hojaDestino =
    hojas[origen] ||
    (origen.includes("interactiva")
      ? hojas.interactiva
      : origen.includes("manual")
      ? hojas.manual
      : hojas.sitemap);

  hojaDestino.addRow({
    origen,
    engine: issue.engine || "WCAG",
    criterio: { text: criterio.criterio, hyperlink: criterio.url },
    nivel: criterio.nivel,
    principio: criterio.principio,
    impact: impactNorm,
    descripcion: issue.description || criterio.resumen,
    resultadoActual:
      issue.resultadoActual || issue.description || "(sin descripción)",
    resultadoEsperado:
      issue.resultadoEsperado ||
      "Debe cumplir con el criterio WCAG indicado.",
    recomendacionW3C:
      issue.recomendacionW3C ||
      (criterio.url ? `Ver criterio en ${criterio.url}` : "—"),
    selector: issue.selector || "(sin selector)",
    url: { text: issue.pageUrl || "(sin URL)", hyperlink: issue.pageUrl },
    captura: capturePath
      ? { text: "Evidencia local", hyperlink: `file://${capturePath}` }
      : "—",
  });
}

// ============================================================
// 🎨 Hipervínculos
// ============================================================
Object.values(hojas).forEach((sheet) => {
  sheet.eachRow((row, num) => {
    if (num === 1) return;
    ["criterio", "url", "captura"].forEach((key) => {
      const cell = row.getCell(key);
      if (typeof cell.value === "object" && cell.value?.hyperlink) {
        cell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    });
  });
});

// ============================================================
// 📊 Hoja resumen global
// ============================================================
const totalUrls = new Set(data.map((d) => d.pageUrl)).size;
const totalIssues = data.length;
const severidades = ["critical", "serious", "moderate", "minor"];
const stats = severidades.map((s) => ({
  Métrica: `Incidencias ${s}`,
  Valor: data.filter((r) => (r.impact || "").toLowerCase() === s).length,
}));

hojas.resumen.columns = [
  { header: "Métrica", key: "Métrica", width: 40 },
  { header: "Valor", key: "Valor", width: 30 },
];

hojas.resumen.addRows([
  { Métrica: "Total de páginas auditadas", Valor: totalUrls },
  { Métrica: "Total de incidencias detectadas", Valor: totalIssues },
  ...stats,
  { Métrica: "Fecha de exportación", Valor: new Date().toLocaleString("es-ES") },
]);

hojas.resumen.getRow(1).font = { bold: true };

// ============================================================
// 💾 Guardar Excel IAAP PRO v6.5
// ============================================================
await wb.xlsx.writeFile(OUTPUT_PATH);

console.log("\n===========================================");
console.log("✅ Informe IAAP PRO v6.5 exportado correctamente:");
console.log(`📁 ${OUTPUT_PATH}`);
console.log("===========================================");
