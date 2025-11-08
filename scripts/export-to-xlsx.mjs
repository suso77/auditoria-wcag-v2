/**
 * ♿ export-to-xlsx.mjs — IAAP PRO v4.28 OPTIMIZADA
 * -------------------------------------------------
 * Exporta los resultados combinados (merged-results.json)
 * en un informe Excel profesional IAAP con tres hojas:
 *  - 📄 Sitemap (violaciones del rastreo)
 *  - ⚙️ Interactiva (violaciones de componentes)
 *  - 📊 Resumen (severidades y criterios con formato visual)
 *
 * ✅ Enlaces activos en todas las columnas (URL / W3C / Captura)
 * ✅ Textos IAAP/W3C en español (resumen / actual / esperado)
 * ✅ Criterios legibles (ID + título)
 * ✅ Compatibilidad total con pipeline IAAP PRO
 * ✅ Hipervínculos al recurso oficial W3C Quickref en español
 */

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getWcagInfo } from "./wcag-map.mjs";

// ===========================================================
// 📁 Rutas base
// ===========================================================
const ROOT_DIR = process.cwd();
const REPORTES_DIR = path.join(ROOT_DIR, "auditorias", "reportes");
const MERGED_PATH = path.join(REPORTES_DIR, "merged-results.json");
const OUTPUT_PATH = path.join(REPORTES_DIR, "Informe-WCAG-IAAP.xlsx");

// ===========================================================
// 🔍 Validación previa
// ===========================================================
if (!fs.existsSync(MERGED_PATH)) {
  console.error("❌ No se encontró merged-results.json en auditorias/reportes/");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(MERGED_PATH, "utf8"));
if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos válidos para exportar.");
  process.exit(0);
}

// ===========================================================
// 🧠 Funciones IAAP PRO — Traducción y fallback seguro
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
  return (
    criterio.resumen ||
    v.help ||
    `Elemento que incumple el criterio ${criterio.id} según las pautas WCAG.`
  );
}

function generarResultadoActual(v) {
  const criterio = obtenerCriterioIAAP(v);
  if (v.id === "color-contrast") {
    const match = v.description?.match(/contrast of ([\d.]+)/);
    const ratio = match ? match[1] : "—";
    return `El contraste detectado es ${ratio}:1, inferior al mínimo 4.5:1 exigido por WCAG 2.1 nivel AA. Esto afecta la legibilidad para usuarios con baja visión o daltonismo.`;
  }
  return (
    v.description ||
    `El contenido no cumple con el criterio ${criterio.id}, afectando la accesibilidad percibida o funcional.`
  );
}

function generarResultadoEsperado(v) {
  const criterio = obtenerCriterioIAAP(v);
  return (
    criterio.esperado ||
    `El contenido debe cumplir el criterio ${criterio.id} de las WCAG. Ver detalles en el enlace W3C.`
  );
}

function generarRecomendacion(v) {
  const criterio = obtenerCriterioIAAP(v);
  return {
    text: "Ver recomendación W3C",
    hyperlink: criterio.url,
  };
}

// ===========================================================
// 📊 Crear el Excel IAAP PRO (3 hojas)
// ===========================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Ilúmina Audit IAAP PRO";
wb.created = new Date();
wb.properties.subject = "Auditoría de Accesibilidad WCAG – IAAP PRO";

const columnasBase = [
  { header: "ID", key: "id", width: 20 },
  { header: "Criterio WCAG", key: "criterio", width: 40 },
  { header: "Nivel", key: "nivel", width: 10 },
  { header: "Severidad", key: "impact", width: 12 },
  { header: "Resumen", key: "resumen", width: 60 },
  { header: "Elemento afectado", key: "selector", width: 60 },
  { header: "Página analizada", key: "url", width: 60 },
  { header: "Resultado actual", key: "actual", width: 70 },
  { header: "Resultado esperado", key: "esperado", width: 70 },
  { header: "Recomendación (W3C)", key: "recomendacion", width: 55 },
  { header: "Captura", key: "captura", width: 40 },
  { header: "Sistema", key: "system", width: 35 },
  { header: "Metodología", key: "metodologia", width: 30 },
];

// ===========================================================
// 📘 Crear hojas: Sitemap, Interactiva y Resumen
// ===========================================================
const hojaSitemap = wb.addWorksheet("Sitemap");
const hojaInteractiva = wb.addWorksheet("Interactiva");
const hojaResumen = wb.addWorksheet("Resumen");

hojaSitemap.columns = columnasBase;
hojaInteractiva.columns = columnasBase;

[hojaSitemap, hojaInteractiva].forEach((hoja) => {
  const header = hoja.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", horizontal: "center" };
  hoja.autoFilter = { from: "A1", to: "M1" };
});

// ===========================================================
// 🧮 Procesar resultados por origen
// ===========================================================
const severidades = {};
const criterios = {};

for (const item of data) {
  const origen = item.origen || "sitemap";
  const destino = origen === "interactiva" ? hojaInteractiva : hojaSitemap;
  const pageUrl = item.page || item.url || "(sin URL)";

  for (const v of item.violations || []) {
    const criterio = obtenerCriterioIAAP(v);
    const resumen = generarResumen(v);
    const actual = generarResultadoActual(v);
    const esperado = generarResultadoEsperado(v);
    const recomendacion = generarRecomendacion(v);

    const selector = v.nodes?.[0]?.target?.join(", ") || "(sin selector)";
    const capturaLink = item.capturePath
      ? {
          text: "Evidencia",
          hyperlink: `https://suso77.github.io/auditoria-wcag-v2/${item.capturePath}`,
        }
      : "(sin captura)";

    // 🔗 Enlace activo en “Página analizada”
    const urlCell =
      pageUrl && pageUrl.startsWith("http")
        ? { text: pageUrl, hyperlink: pageUrl }
        : pageUrl;

    destino.addRow({
      id: v.id,
      criterio: `${criterio.id || ""} – ${criterio.criterio || "Criterio WCAG no identificado"}`,
      nivel: criterio.nivel || "AA",
      impact: v.impact || "",
      resumen,
      selector,
      url: urlCell,
      actual,
      esperado,
      recomendacion,
      captura: capturaLink,
      system: "macOS + Chrome (axe-core)",
      metodologia: "WCAG 2.1 / 2.2 (axe-core + Cypress)",
    });

    // 🧮 Contabilizar severidades y criterios
    const sev = v.impact || "sin severidad";
    severidades[sev] = (severidades[sev] || 0) + 1;
    criterios[criterio.id] = (criterios[criterio.id] || 0) + 1;
  }
}

// ===========================================================
// 📊 Hoja de resumen (formato visual centrado)
// ===========================================================
hojaResumen.columns = [
  { header: "Categoría", key: "cat", width: 30 },
  { header: "Valor", key: "val", width: 20 },
  { header: "Porcentaje", key: "pct", width: 20 },
];

const total = Object.values(severidades).reduce((a, b) => a + b, 0) || 1;

hojaResumen.addRow(["", "", ""]);
hojaResumen.addRow(["📊 Resumen por severidad", "", ""]);
for (const [sev, count] of Object.entries(severidades)) {
  hojaResumen.addRow([sev, count, count / total]);
}

hojaResumen.addRow(["", "", ""]);
hojaResumen.addRow(["📘 Resumen por criterio WCAG", "", ""]);
for (const [crit, count] of Object.entries(criterios)) {
  hojaResumen.addRow([crit, count, count / total]);
}

// 🎨 Formato visual IAAP PRO
hojaResumen.eachRow((row, rowNumber) => {
  row.eachCell((cell) => {
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "D9D9D9" } },
      left: { style: "thin", color: { argb: "D9D9D9" } },
      bottom: { style: "thin", color: { argb: "D9D9D9" } },
      right: { style: "thin", color: { argb: "D9D9D9" } },
    };
    if (rowNumber === 2 || row.getCell(1).value?.toString().startsWith("📘"))
      cell.font = { bold: true };
  });

  if (typeof row.getCell(3).value === "number") {
    row.getCell(3).numFmt = "0.0%";
  }
});

// ===========================================================
// 💾 Guardar Excel
// ===========================================================
await wb.xlsx.writeFile(OUTPUT_PATH);
console.log(
  `✅ Informe IAAP PRO (3 hojas, enlaces activos, formato español W3C) exportado correctamente: ${OUTPUT_PATH}`
);
