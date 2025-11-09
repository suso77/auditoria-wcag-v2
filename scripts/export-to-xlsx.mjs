/**
 * ♿ export-to-xlsx.mjs — IAAP PRO v4.34 (Stable Dashboard Edition)
 * -------------------------------------------------
 * Exporta los resultados combinados (merged-results.json o results-merged.json)
 * en un informe Excel profesional IAAP con tres hojas:
 *  - 📄 Sitemap (violaciones del rastreo)
 *  - ⚙️ Interactiva (violaciones de componentes)
 *  - 📊 Resumen (severidades y criterios con formato dashboard IAAP)
 *
 * ✅ Enlaces activos (URL / W3C / Captura)
 * ✅ Textos IAAP/W3C en español (resumen / actual / esperado)
 * ✅ Criterios limpios sin ID técnico
 * ✅ Colores y formato IAAP PRO
 * ✅ Total compatibilidad con pipeline GitHub Actions
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
  hoja.autoFilter = { from: "A1", to: "M1" };
});

// ===========================================================
// 🧮 Procesar resultados
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
    const criterioLimpio = criterio.criterio || criterio.id || "Criterio WCAG no identificado";

    const capturePath = item.capturePath || v.capturePath || null;
    const capturaLink = capturePath
      ? {
          text: "Evidencia",
          hyperlink: capturePath.startsWith("http")
            ? capturePath
            : `file://${path.join(AUDITORIAS_DIR, "capturas", path.basename(capturePath))}`,
        }
      : "Sin captura disponible";

    const urlCell =
      pageUrl && pageUrl.startsWith("http")
        ? { text: pageUrl, hyperlink: pageUrl }
        : pageUrl;

    const row = destino.addRow({
      id: v.id,
      criterio: criterioLimpio,
      nivel: criterio.nivel || "AA",
      impact: v.impact || "",
      resumen,
      selector,
      url: urlCell,
      actual,
      esperado,
      recomendacion,
      captura: capturaLink,
      system: "macOS Sonoma 14.7 + Chrome 129 (axe-core 4.9.1)",
      metodologia: "WCAG 2.1 / 2.2 Nivel AA — axe-core + Cypress + IAAP IA",
    });

    // 💄 Enlaces azules subrayados
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
}

// ===========================================================
// 📊 Resumen profesional IAAP PRO
// ===========================================================
hojaResumen.columns = [
  { header: "Categoría", key: "cat", width: 45 },
  { header: "Valor", key: "val", width: 15 },
  { header: "Porcentaje", key: "pct", width: 15 },
];

const total = Object.values(severidades).reduce((a, b) => a + b, 0) || 1;

// 🧩 Bloque de severidades
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
  const pct = count / total;
  const meta = colorSeveridad[sev];
  const row = hojaResumen.addRow([meta.label, count, pct]);
  row.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: meta.color },
  };
  row.eachCell((c) => {
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = {
      top: { style: "thin", color: { argb: "D9D9D9" } },
      left: { style: "thin", color: { argb: "D9D9D9" } },
      bottom: { style: "thin", color: { argb: "D9D9D9" } },
      right: { style: "thin", color: { argb: "D9D9D9" } },
    };
  });
}

hojaResumen.addRow(["", "", ""]);
hojaResumen.addRow(["📘 Criterios WCAG más frecuentes", "", ""]);

const criteriosOrdenados = Object.entries(criterios).sort((a, b) => b[1] - a[1]);
for (const [crit, count] of criteriosOrdenados.slice(0, 10)) {
  const row = hojaResumen.addRow([crit, count, count / total]);
  row.eachCell((c) => {
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = {
      top: { style: "thin", color: { argb: "D9D9D9" } },
      left: { style: "thin", color: { argb: "D9D9D9" } },
      bottom: { style: "thin", color: { argb: "D9D9D9" } },
      right: { style: "thin", color: { argb: "D9D9D9" } },
    };
  });
}

hojaResumen.getColumn("pct").numFmt = "0.0%";
hojaResumen.getRow(1).font = { bold: true, size: 12, color: { argb: "FF0D47A1" } };

// ===========================================================
// 💾 Guardar Excel
// ===========================================================
await wb.xlsx.writeFile(OUTPUT_PATH);
console.log(`✅ Informe IAAP PRO (3 hojas, formato dashboard profesional) exportado correctamente: ${OUTPUT_PATH}`);
