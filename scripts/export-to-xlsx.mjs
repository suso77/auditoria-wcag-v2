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
const DEVICE_INFO =
  process.env.AUDIT_DEVICE_INFO ||
  process.env.DEVICE_INFO ||
  "MacBook Pro / macOS 14.6.1 / Chrome 143 / Axe DevTools";

fs.mkdirSync(REPORTES_DIR, { recursive: true });
fs.mkdirSync(CAPTURAS_DIR, { recursive: true });
const CAPTURE_FILES = fs.existsSync(CAPTURAS_DIR) ? walkCaptureFiles(CAPTURAS_DIR) : [];
const CAPTURE_INDEX = CAPTURE_FILES.map((file) => ({
  path: file,
  slug: sanitizeForCapture(path.basename(file)),
}));

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
function walkCaptureFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkCaptureFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function sanitizeForCapture(value) {
  if (!value) return "";
  const clean = value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]/g, "");
  return clean.replace(/^https?/, "").slice(0, 100);
}

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
    const abs = path.isAbsolute(issue.capturePath)
      ? issue.capturePath
      : path.join(AUDITORIAS_DIR, issue.capturePath);
    if (fs.existsSync(abs)) return abs;
  }
  const slug = sanitizeForCapture(issue.pageUrl || issue.url || issue.id);
  if (!slug) return null;
  const match = CAPTURE_INDEX.find(
    ({ slug: fileSlug }) => fileSlug.includes(slug) || slug.includes(fileSlug)
  );
  return match ? match.path : null;
}

function buildRelativeCapturePath(absPath) {
  if (!absPath) return null;
  const rel = path.relative(REPORTES_DIR, absPath).split(path.sep).join("/");
  return rel.startsWith("..") ? rel : `./${rel}`;
}

function buildTestingMethod(issue) {
  const engine = (issue.engine || "IAAP PRO").toLowerCase();
  const source = issue.source || "sitemap";
  const state = issue.stateId ? ` · Estado ${issue.stateId}` : "";
  if (source.includes("manual")) return "Manual – Revisión experta";
  if (engine.includes("pa11y")) return `Automático – Pa11y (${source})${state}`;
  if (engine.includes("axe")) return `Automático – Axe DevTools (${source})${state}`;
  return `Automático – ${issue.engine || "IAAP PRO"} (${source})${state}`;
}

function buildResumen(issue, criterio) {
  return (
    issue.resultadoActual ||
    issue.description ||
    criterio?.resumen ||
    "Incidencia detectada por IAAP PRO."
  );
}

function buildNotas(issue, criterio) {
  const notes = [];
  if (issue.resultadoEsperado) notes.push(`Esperado: ${issue.resultadoEsperado}`);
  if (issue.recomendacionW3C) notes.push(`Recomendación: ${issue.recomendacionW3C}`);
  if (issue.helpUrl) notes.push(`Guía: ${issue.helpUrl}`);
  else if (criterio?.url) notes.push(`Referencia: ${criterio.url}`);
  return notes.join(" | ") || "—";
}

function buildBarrierName(issue, criterio) {
  return (
    issue.help ||
    issue.summary ||
    issue.description ||
    criterio?.resumen ||
    "Barrera detectada por IAAP PRO"
  );
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
const informeFinalSheet = wb.addWorksheet("✅ Informe Final");
informeFinalSheet.columns = [
  { header: "ID", key: "id", width: 36 },
  {
    header: "Dispositivo, Sistema operativo, navegador y tecnología asistiva",
    key: "device",
    width: 55,
  },
  { header: "Resumen", key: "summary", width: 80 },
  { header: "Páginas afectadas", key: "page", width: 70 },
  { header: "Metodología de testing", key: "method", width: 40 },
  { header: "Criterio WCAG", key: "wcag", width: 20 },
  { header: "Captura de pantalla", key: "capture", width: 35 },
  { header: "Notas", key: "notes", width: 80 },
];
informeFinalSheet.getRow(1).font = { bold: true };
informeFinalSheet.autoFilter = { from: "A1", to: "H1" };
informeFinalSheet.columns.forEach(
  (c) => (c.alignment = { wrapText: true, vertical: "top" })
);

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
data.forEach((issue, index) => {
  const origen = issue.source || "sitemap";
  const criterio = enrichCriterio(issue);
  const impactNorm = normalizeImpact(issue.impact);
  const capturePath = getCapturePath(issue);
  const captureRelative = buildRelativeCapturePath(capturePath);
  const captureCell = captureRelative
    ? { text: "Ver captura", hyperlink: captureRelative }
    : "—";
  const resumen = buildResumen(issue, criterio);
  const notas = buildNotas(issue, criterio);
  const pageCell = issue.pageUrl
    ? { text: issue.pageUrl, hyperlink: issue.pageUrl }
    : "(sin URL)";
  const barrierName = buildBarrierName(issue, criterio);

  const hojaDestino =
    hojas[origen] ||
    (origen.includes("interactiva")
      ? hojas.interactiva
      : origen.includes("manual")
      ? hojas.manual
      : hojas.sitemap);

  informeFinalSheet.addRow({
    id: barrierName,
    device: DEVICE_INFO,
    summary: resumen,
    page: pageCell,
    method: buildTestingMethod(issue),
    wcag: criterio.criterio,
    capture: captureCell,
    notes: notas,
  });

  hojaDestino.addRow({
    origen,
    engine: issue.engine || "WCAG",
    criterio: { text: criterio.criterio, hyperlink: criterio.url },
    nivel: criterio.nivel,
    principio: criterio.principio,
    impact: impactNorm,
    descripcion: issue.description || criterio.resumen,
    resultadoActual: issue.resultadoActual || issue.description || "(sin descripción)",
    resultadoEsperado:
      issue.resultadoEsperado || "Debe cumplir con el criterio WCAG indicado.",
    recomendacionW3C:
      issue.recomendacionW3C ||
      (criterio.url ? `Ver criterio en ${criterio.url}` : "—"),
    selector: issue.selector || "(sin selector)",
    url: pageCell,
    captura: captureCell,
  });
});

// ============================================================
// 🎨 Hipervínculos
// ============================================================
const sheetsWithLinks = [informeFinalSheet, ...Object.values(hojas)];
sheetsWithLinks.forEach((sheet) => {
  sheet.eachRow((row, num) => {
    if (num === 1) return;
    const keys = sheet === informeFinalSheet ? ["page", "capture"] : ["criterio", "url", "captura"];
    keys.forEach((key) => {
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
