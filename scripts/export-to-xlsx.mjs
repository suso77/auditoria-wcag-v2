/**
 * ♿ export-to-xlsx.mjs — IAAP PRO v5.5 (Full Stable + axe-core + Pa11y + Revisiones manuales)
 * ------------------------------------------------------------------------------------------------
 * Exporta los resultados combinados en un informe Excel IAAP PRO con tres hojas:
 *  - 📄 Sitemap (violaciones del rastreo)
 *  - ⚙️ Interactiva (violaciones de componentes)
 *  - 📊 Resumen global (usando merged-summary.json si existe)
 *
 * ✅ Compatible con merge-auditorias.mjs v5.5
 * ✅ Normaliza severidades de Pa11y (error, warning, notice → critical, moderate, minor)
 * ✅ Limpieza de campos vacíos, descripción contextual y vínculos W3C
 * ✅ Colores y agrupación por origen
 */

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getWcagInfo } from "./wcag-map.mjs";

// ===========================================================
// 📁 Configuración base
// ===========================================================
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
const OUTPUT_PATH = path.join(REPORTES_DIR, "Informe-WCAG-IAAP.xlsx");

const MERGED_PATH = path.join(REPORTES_DIR, "merged-results.json");
const SUMMARY_PATH = path.join(REPORTES_DIR, "merged-summary.json");

if (!fs.existsSync(MERGED_PATH)) {
  console.error("❌ No se encontró merged-results.json en auditorias/reportes/");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(MERGED_PATH, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos válidos para exportar.");
  process.exit(0);
}

let summary = null;
if (fs.existsSync(SUMMARY_PATH)) {
  summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
  console.log(`📊 Usando resumen global IAAP PRO de: ${SUMMARY_PATH}`);
}

console.log(`📄 Usando archivo de resultados: ${MERGED_PATH}`);

// ===========================================================
// 🧠 Funciones auxiliares IAAP PRO
// ===========================================================
function normalizeImpact(impact) {
  if (!impact) return "sin severidad";
  const i = impact.toLowerCase();
  if (["critical", "serious", "moderate", "minor"].includes(i)) return i;
  if (i === "error") return "critical";
  if (i === "warning") return "moderate";
  if (i === "notice") return "minor";
  return "sin severidad";
}

function obtenerCriterioIAAP(v) {
  const info = getWcagInfo(v.wcag || v.id || "");
  if (!info) {
    return {
      id: v.wcag || "(sin id)",
      criterio: "Criterio no identificado",
      nivel: "—",
      resumen: v.description || "Elemento con problema de accesibilidad detectado.",
      esperado: "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.",
      url: "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
    };
  }
  return {
    ...info,
    url:
      info.url?.includes("w3.org") && !info.url.includes("?showtechniques=es")
        ? `${info.url}?showtechniques=es`
        : info.url,
  };
}

function generarResumen(v) {
  const criterio = obtenerCriterioIAAP(v);
  return criterio.resumen || v.help || v.description || `Elemento que incumple el criterio ${criterio.id}.`;
}

function generarResultadoActual(v) {
  if (v.id === "color-contrast" || v.wcag?.includes("1.4.3")) {
    const match = v.description?.match(/contrast of ([\d.]+)/);
    const ratio = match ? match[1] : "—";
    return `El contraste detectado es ${ratio}:1, inferior al mínimo 4.5:1 exigido por WCAG 2.1 nivel AA.`;
  }
  return v.description || v.message || "El elemento no cumple con el criterio WCAG aplicable.";
}

function generarResultadoEsperado(v) {
  const criterio = obtenerCriterioIAAP(v);
  return criterio.esperado || `Debe cumplir el criterio ${criterio.id} de las WCAG.`;
}

function generarRecomendacion(v) {
  const criterio = obtenerCriterioIAAP(v);
  return { text: "Ver recomendación W3C", hyperlink: criterio.url };
}

// ===========================================================
// 📊 Crear el Excel IAAP PRO
// ===========================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Ilúmina Audit IAAP PRO v5.5";
wb.created = new Date();
wb.properties.subject = "Auditoría de Accesibilidad WCAG – IAAP PRO";

const columnasBase = [
  { header: "ID", key: "id", width: 20 },
  { header: "Criterio WCAG", key: "criterio", width: 40 },
  { header: "Nivel", key: "nivel", width: 10 },
  { header: "Tipo", key: "tipo", width: 18 },
  { header: "Severidad", key: "impact", width: 12 },
  { header: "Resumen", key: "resumen", width: 60 },
  { header: "Elemento afectado", key: "selector", width: 60 },
  { header: "Página analizada", key: "url", width: 60 },
  { header: "Resultado actual", key: "actual", width: 70 },
  { header: "Resultado esperado", key: "esperado", width: 70 },
  { header: "Recomendación (W3C)", key: "recomendacion", width: 55 },
  { header: "Captura", key: "captura", width: 40 },
  { header: "Sistema", key: "system", width: 35 },
  { header: "Metodología", key: "metodologia", width: 35 },
];

const hojaSitemap = wb.addWorksheet("Sitemap");
const hojaInteractiva = wb.addWorksheet("Interactiva");
const hojaResumen = wb.addWorksheet("Resumen");

hojaSitemap.columns = columnasBase;
hojaInteractiva.columns = columnasBase;

[hojaSitemap, hojaInteractiva].forEach((hoja) => {
  const header = hoja.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center" };
  hoja.autoFilter = { from: "A1", to: "N1" };
});

// ===========================================================
// 🧮 Procesar resultados
// ===========================================================
const severidades = {};
const criterios = {};
let totalWCAG = 0;
let totalPa11y = 0;

for (const issue of data) {
  const origen = issue.origen || "sitemap";
  const destino = origen === "interactiva" ? hojaInteractiva : hojaSitemap;
  const color = origen === "interactiva" ? "FF2196F3" : "FF2E7D32"; // Azul / Verde

  const criterio = obtenerCriterioIAAP(issue);
  const resumen = generarResumen(issue);
  const actual = generarResultadoActual(issue);
  const esperado = generarResultadoEsperado(issue);
  const recomendacion = generarRecomendacion(issue);

  const impactNorm = normalizeImpact(issue.impact);
  const urlCell = issue.pageUrl
    ? { text: issue.pageUrl, hyperlink: issue.pageUrl }
    : "(sin URL)";

  let capturaLink = "Sin captura disponible";
  const capturePath = issue.capturePath
    ? path.join(AUDITORIAS_DIR, issue.capturePath)
    : null;
  if (capturePath && fs.existsSync(capturePath)) {
    capturaLink = { text: "Evidencia", hyperlink: `file://${capturePath}` };
  }

  const row = destino.addRow({
    id: issue.wcag || issue.id,
    criterio: criterio.criterio || criterio.id,
    nivel: criterio.nivel || "AA",
    tipo: issue.engine || "WCAG",
    impact: impactNorm,
    resumen,
    selector: issue.selector || "(sin selector)",
    url: urlCell,
    actual,
    esperado,
    recomendacion,
    captura: capturaLink,
    system: "macOS Sonoma 14.7 + Chrome 129 (axe-core 4.9.1 + Pa11y 6.x)",
    metodologia: "WCAG 2.1 / 2.2 Nivel AA — axe-core + Pa11y + IAAP IA",
  });

  row.getCell("id").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: color },
  };

  ["url", "recomendacion", "captura"].forEach((campo) => {
    const cell = row.getCell(campo);
    if (typeof cell.value === "object" && cell.value.hyperlink) {
      cell.font = { color: { argb: "FF0563C1" }, underline: true };
    }
  });

  const sev = impactNorm;
  severidades[sev] = (severidades[sev] || 0) + 1;
  criterios[criterio.id] = (criterios[criterio.id] || 0) + 1;
  totalWCAG++;
  if (issue.engine === "pa11y") totalPa11y++;
}

// ===========================================================
// 📊 Hoja resumen IAAP PRO
// ===========================================================
hojaResumen.columns = [
  { header: "Categoría", key: "cat", width: 45 },
  { header: "Valor", key: "val", width: 20 },
  { header: "Porcentaje", key: "pct", width: 15 },
];

hojaResumen.getRow(1).font = { bold: true, size: 12, color: { argb: "FF0D47A1" } };
hojaResumen.addRow(["📊 Resumen IAAP PRO v5.5", "", ""]);
hojaResumen.addRow(["", "", ""]);

if (summary) {
  hojaResumen.addRow(["URLs auditadas (total)", summary.totalUrls, ""]);
  hojaResumen.addRow(["Violaciones combinadas", summary.totalIssues, ""]);
  hojaResumen.addRow(["Violaciones Sitemap", summary.sitemap.total, ""]);
  hojaResumen.addRow(["Violaciones Interactiva", summary.interactiva.total, ""]);
  hojaResumen.addRow(["Fecha", summary.fecha, ""]);
  hojaResumen.addRow(["", "", ""]);
}

const totalSev = Object.values(severidades).reduce((a, b) => a + b, 0) || 1;
hojaResumen.addRow(["📊 Severidades detectadas", "", ""]);

const colorSeveridad = {
  critical: { color: "FFB71C1C", label: "🔴 Críticas" },
  serious: { color: "FFF57C00", label: "🟠 Graves" },
  moderate: { color: "FFFFEB3B", label: "🟡 Moderadas" },
  minor: { color: "FF2196F3", label: "🔵 Menores" },
  "sin severidad": { color: "FF9E9E9E", label: "⚪ Sin severidad" },
};

for (const sev of Object.keys(colorSeveridad)) {
  const count = severidades[sev] || 0;
  const pct = count / totalSev;
  const meta = colorSeveridad[sev];
  const row = hojaResumen.addRow([meta.label, count, pct]);
  row.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: meta.color },
  };
}

hojaResumen.addRow(["", "", ""]);
hojaResumen.addRow(["📘 Criterios WCAG más frecuentes", "", ""]);

const criteriosOrdenados = Object.entries(criterios).sort((a, b) => b[1] - a[1]);
for (const [crit, count] of criteriosOrdenados.slice(0, 10)) {
  hojaResumen.addRow([crit, count, count / totalSev]);
}

hojaResumen.getColumn("pct").numFmt = "0.0%";

// ===========================================================
// 💾 Guardar Excel
// ===========================================================
await wb.xlsx.writeFile(OUTPUT_PATH);
console.log(`✅ Informe IAAP PRO v5.5 exportado correctamente: ${OUTPUT_PATH}`);

