/**
 * ♿ export-to-xlsx.mjs — IAAP PRO v4.17-H1 (Full Stable + Pa11y + Revisiones manuales + Capturas inteligentes)
 * -------------------------------------------------
 * Exporta los resultados combinados (axe + pa11y + needs_review)
 * en un informe Excel profesional IAAP PRO con tres hojas:
 *  - 📄 Sitemap (violaciones del rastreo)
 *  - ⚙️ Interactiva (violaciones de componentes)
 *  - 📊 Resumen (totales globales + severidades + criterios)
 *
 * ✅ Compatible con merged-results.json / results-merged.json
 * ✅ Añade columna “Tipo” (WCAG / Revisión manual / Pa11y)
 * ✅ Detección inteligente de capturas
 * ✅ Enlaces funcionales (URL / W3C / Evidencias)
 * ✅ Colores y formato IAAP PRO
 * ✅ 100% compatible con GitHub Actions / Docker / CI
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

let mergedFile = null;
for (const dir of [REPORTES_DIR, AUDITORIAS_DIR]) {
  if (fs.existsSync(dir)) {
    const found = fs
      .readdirSync(dir)
      .filter((f) => f.match(/(merged-results|results-merged).*\.json$/))
      .sort()
      .reverse()[0];
    if (found) {
      mergedFile = path.join(dir, found);
      break;
    }
  }
}

if (!mergedFile) {
  console.error("❌ No se encontró ningún archivo merged-results*.json o results-merged*.json");
  process.exit(1);
}

console.log(`📄 Usando archivo: ${path.basename(mergedFile)}`);
const data = JSON.parse(fs.readFileSync(mergedFile, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos válidos para exportar.");
  process.exit(0);
}

// ===========================================================
// 🧠 Funciones IAAP PRO — Traducción y contexto W3C
// ===========================================================
function obtenerCriterioIAAP(v) {
  const info = getWcagInfo(v.id);
  if (!info) {
    return {
      id: v.id || "(sin id)",
      criterio: "Criterio no identificado",
      nivel: "—",
      resumen: "Elemento con problema de accesibilidad detectado.",
      esperado: "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.",
      url: "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
    };
  }
  return {
    ...info,
    url:
      info.url?.includes("w3.org") && !info.url.includes("?showtechniques=es")
        ? `${info.url}?showtechniques=es`
        : info.url || "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
  };
}

function generarResumen(v) {
  const criterio = obtenerCriterioIAAP(v);
  return criterio.resumen || v.help || `Elemento que incumple el criterio ${criterio.id}.`;
}

function generarResultadoActual(v) {
  const criterio = obtenerCriterioIAAP(v);
  if (v.id === "color-contrast") {
    const match = v.description?.match(/contrast of ([\d.]+)/);
    const ratio = match ? match[1] : "—";
    return `El contraste detectado es ${ratio}:1, inferior al mínimo 4.5:1 exigido por WCAG 2.1 nivel AA.`;
  }
  return (
    v.description ||
    `El contenido no cumple con el criterio ${criterio.id}, afectando la accesibilidad percibida o funcional.`
  );
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
wb.creator = "Ilúmina Audit IAAP PRO";
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
let totalReview = 0;
let totalPa11y = 0;

for (const item of data) {
  const origen = item.origen || "sitemap";
  const destino = origen === "interactiva" ? hojaInteractiva : hojaSitemap;
  const pageUrl = item.page || item.url || "(sin URL)";

  // WCAG normales
  for (const v of item.violations || []) {
    addRow(v, destino, "WCAG", pageUrl);
    totalWCAG++;
  }

  // needs_review
  for (const v of item.needs_review || []) {
    addRow(v, destino, "Revisión manual", pageUrl);
    totalReview++;
  }

  // Pa11y results
  for (const v of item.pa11y || []) {
    addRow(v, destino, "Pa11y", pageUrl);
    totalPa11y++;
  }
}

// ===========================================================
// 🧩 Función auxiliar para añadir filas
// ===========================================================
function addRow(v, destino, tipo, pageUrl) {
  const criterio = obtenerCriterioIAAP(v);
  const resumen = generarResumen(v);
  const actual = generarResultadoActual(v);
  const esperado = generarResultadoEsperado(v);
  const recomendacion = generarRecomendacion(v);
  const selector = v.selector || v.nodes?.[0]?.target?.join(", ") || "(sin selector)";
  const criterioLimpio = criterio.criterio || criterio.id || "Criterio WCAG no identificado";

  // 🔍 Detección inteligente de capturas
  let capturaLink = "Sin captura disponible";
  const posiblesDirs = ["sitemap", "interactiva", "combinado"];
  const patrones = [
    v.id,
    criterio.id,
    criterio.criterio?.split(" ")[0],
    pageUrl?.split("/").pop(),
    selector?.replace(/[^a-z0-9]/gi, "_"),
  ].filter(Boolean);

  for (const dir of posiblesDirs) {
    const folder = path.join(AUDITORIAS_DIR, "capturas", dir);
    if (fs.existsSync(folder)) {
      const archivos = fs.readdirSync(folder);
      const found = archivos.find((f) =>
        patrones.some((p) => f.toLowerCase().includes(p.toLowerCase()) && f.endsWith(".png"))
      );
      if (found) {
        const fullPath = path.join(folder, found);
        capturaLink = { text: "Evidencia", hyperlink: `file://${fullPath}` };
        break;
      }
    }
  }

  const urlCell =
    pageUrl && pageUrl.startsWith("http")
      ? { text: pageUrl, hyperlink: pageUrl }
      : pageUrl;

  const row = destino.addRow({
    id: v.id,
    criterio: criterioLimpio,
    nivel: criterio.nivel || "AA",
    tipo,
    impact: v.impact || "",
    resumen,
    selector,
    url: urlCell,
    actual,
    esperado,
    recomendacion,
    captura: capturaLink,
    system: "macOS Sonoma 14.7 + Chrome 129 (axe-core 4.9.1)",
    metodologia: "WCAG 2.1 / 2.2 Nivel AA — axe-core + Pa11y + IAAP IA",
  });

  ["captura", "url", "recomendacion"].forEach((campo) => {
    const cell = row.getCell(campo);
    if (typeof cell.value === "object" && cell.value.hyperlink) {
      cell.font = { color: { argb: "FF0563C1" }, underline: true };
    }
  });

  const sev = v.impact || "sin severidad";
  severidades[sev] = (severidades[sev] || 0) + 1;
  criterios[criterio.id] = (criterios[criterio.id] || 0) + 1;
}

// ===========================================================
// 📊 Hoja resumen IAAP PRO
// ===========================================================
hojaResumen.columns = [
  { header: "Categoría", key: "cat", width: 45 },
  { header: "Valor", key: "val", width: 15 },
  { header: "Porcentaje", key: "pct", width: 15 },
];

hojaResumen.addRow(["📊 Totales globales IAAP PRO", "", ""]);
hojaResumen.addRow(["Violaciones WCAG", totalWCAG, ""]);
hojaResumen.addRow(["Revisiones manuales (needs_review)", totalReview, ""]);
hojaResumen.addRow(["Resultados Pa11y", totalPa11y, ""]);
hojaResumen.addRow(["", "", ""]);

const totalSev = Object.values(severidades).reduce((a, b) => a + b, 0) || 1;
hojaResumen.addRow(["📊 Severidades detectadas", "", ""]);

const colorSeveridad = {
  critical: { color: "FFB71C1C", label: "🔴 Críticas" },
  serious: { color: "FFF57C00", label: "🟠 Graves" },
  moderate: { color: "FFFFEB3B", label: "🟡 Moderadas" },
  minor: { color: "FF2196F3", label: "🔵 Menores" },
  "sin severidad": { color: "FF9E9E9E", label: "⚪ Sin severidad" },
};

for (const sev of ["critical", "serious", "moderate", "minor"]) {
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
hojaResumen.getRow(1).font = { bold: true, size: 12, color: { argb: "FF0D47A1" } };

// ===========================================================
// 💾 Guardar Excel
// ===========================================================
await wb.xlsx.writeFile(OUTPUT_PATH);
console.log(`✅ Informe IAAP PRO v4.17-H1 exportado correctamente: ${OUTPUT_PATH}`);
