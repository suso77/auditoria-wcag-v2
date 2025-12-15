/**
 * ♿ generate-summary.mjs — IAAP PRO v7.0 (Extendido)
 * ----------------------------------------------------------------------
 * ✅ Genera Markdown + Excel + HTML accesible para revisión IAAP PRO
 * ✅ Gráficos y tablas dinámicas integradas (sin dependencias externas)
 * ✅ Orden por severidad y autoformato en columnas Excel
 * ✅ Preparado para CI/CD (GitHub Actions, Node 20+)
 * ✅ Compatible con merge-auditorias.mjs v6.8+
 */

import fs from "fs";
import path from "path";
import * as xlsx from "xlsx";

// ===========================================================
// 📂 Entrada principal
// ===========================================================
const filePath =
  process.argv[2] || path.join("auditorias", "reportes", "merged-results.json");

if (!fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo combinado:", filePath);
  process.exit(1);
}

let data = [];
try {
  data = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (err) {
  console.error(`❌ Error al leer ${filePath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ El archivo de resultados está vacío o con formato inválido.");
  process.exit(0);
}

// ===========================================================
// 🧮 Normalización y métricas IAAP PRO
// ===========================================================
const urls = new Set(data.map((d) => d.pageUrl || d.url || ""));
const totalUrls = urls.size;
const totalViolations = data.length;

const normalizeSeverity = (s) => {
  if (!s) return "unclassified";
  const val = s.toLowerCase();
  if (val.includes("crit")) return "critical";
  if (val.includes("serious") || val.includes("high")) return "serious";
  if (val.includes("moderate") || val.includes("medium")) return "moderate";
  if (val.includes("minor") || val.includes("low")) return "minor";
  return val;
};

data.forEach((r) => (r.severity = normalizeSeverity(r.severity || r.impact || "")));

const countBy = (arr, key) =>
  arr.reduce((acc, i) => {
    const k = i[key] || "sin_dato";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

const countBySeverity = countBy(data, "severity");
const countBySource = countBy(data, "source");
const countByEngine = countBy(data, "engine");

const totalSeverities = Object.values(countBySeverity).reduce((a, b) => a + b, 0);
const severityPercent = Object.fromEntries(
  Object.entries(countBySeverity).map(([k, v]) => [
    k,
    ((v / totalSeverities) * 100).toFixed(1) + "%",
  ])
);

// ===========================================================
// 📈 Índice IAAP PRO ponderado
// ===========================================================
const pesos = { critical: 3.5, serious: 2.0, moderate: 1.0, minor: 0.5 };
const penalizacion = Object.entries(countBySeverity).reduce(
  (sum, [sev, count]) => sum + (pesos[sev] || 0.5) * count,
  0
);
const conformidad = Math.max(0, 100 - penalizacion / Math.max(totalUrls, 1)).toFixed(1);
const nivelAccesibilidad =
  conformidad >= 90
    ? "AA (Alta)"
    : conformidad >= 75
    ? "AA (Media)"
    : conformidad >= 50
    ? "A (Baja)"
    : "No conforme";

// ===========================================================
// 📊 Rankings
// ===========================================================
const top = (field, limit = 10) => {
  const map = {};
  data.forEach((i) => {
    const val = i[field] || "(sin dato)";
    map[val] = (map[val] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
};

const topUrls = top("pageUrl");
const topWcag = top("wcag");

// ===========================================================
// 🧾 Markdown
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad Digital – IAAP PRO v7.0

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Versión del pipeline:** Ilúmina Audit WCAG v7.0 IAAP PRO  

---

## 📊 Resumen General

- **Total de páginas auditadas:** ${totalUrls}
- **Total de incidencias detectadas:** ${totalViolations}
- **Índice estimado de conformidad WCAG:** ${conformidad}%  
- **Nivel de accesibilidad alcanzado:** ${nivelAccesibilidad}

| Severidad | Total | % |
|------------|--------|----|
${Object.entries(countBySeverity)
  .map(([sev, count]) => `| ${sev} | ${count} | ${severityPercent[sev]} |`)
  .join("\n")}

---

## 🧱 Top 10 URLs con Más Incidencias

| URL | Nº Incidencias |
|------|----------------|
${topUrls.map(([url, n]) => `| [${url}](${url}) | ${n} |`).join("\n") || "| – | – |"}

---

## 📘 Criterios WCAG Más Afectados

| Criterio | Nº Violaciones |
|-----------|----------------|
${topWcag.map(([crit, n]) => `| ${crit} | ${n} |`).join("\n") || "| – | – |"}

---

> 🧭 *Priorizar corrección de incidencias Critical y Serious antes de la revalidación.*  
`;

const outputDir = path.join("auditorias");
const reportDir = path.join(outputDir, "reportes");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });

const resumenPath = path.join(outputDir, "Resumen-WCAG.md");
const mergedSummaryPath = path.join(reportDir, "merged-summary.md");

fs.writeFileSync(resumenPath, markdown, "utf8");
fs.writeFileSync(mergedSummaryPath, markdown, "utf8");

console.log(`✅ Markdown generado: ${resumenPath}`);
console.log(`✅ Copia para exportaciones: ${mergedSummaryPath}`);

// ===========================================================
// 📊 Excel IAAP PRO
// ===========================================================
function autoFit(ws) {
  const cols = Object.keys(ws[0]);
  const colWidths = cols.map((col) => ({
    wch: Math.max(col.length, ...ws.map((row) => (row[col] ? row[col].toString().length : 0))) + 2,
  }));
  return colWidths;
}

function makeSheet(name, rows) {
  const sheet = xlsx.utils.json_to_sheet(rows);
  sheet["!cols"] = autoFit(rows);
  return { name, sheet };
}

const order = { critical: 1, serious: 2, moderate: 3, minor: 4 };
data.sort((a, b) => (order[a.severity] || 99) - (order[b.severity] || 99));

const sheets = [];

sheets.push(
  makeSheet("RESUMEN", [
    { Métrica: "Páginas auditadas", Valor: totalUrls },
    { Métrica: "Incidencias totales", Valor: totalViolations },
    { Métrica: "Conformidad (%)", Valor: conformidad },
    { Métrica: "Nivel Accesibilidad", Valor: nivelAccesibilidad },
  ])
);

const tipos = ["sitemap", "interactiva", "manual"];
for (const tipo of tipos) {
  const filtered = data
    .filter((r) => (r.source || "sitemap") === tipo)
    .map((r) => ({
      Motor: r.engine || "",
      URL: r.pageUrl || "",
      WCAG: r.wcag || "",
      Nivel: r.nivel || "",
      Severidad: r.severity || "",
      Descripción: r.resultadoActual || r.description || "",
      Recomendación: r.recomendacionW3C || "",
    }));
  if (filtered.length > 0) sheets.push(makeSheet(tipo.toUpperCase(), filtered));
}

const motores = [...new Set(data.map((r) => r.engine))];
for (const motor of motores) {
  const filtered = data
    .filter((r) => r.engine === motor)
    .map((r) => ({
      Origen: r.source,
      URL: r.pageUrl,
      Criterio_WCAG: r.wcag,
      Severidad: r.severity,
      Descripción: r.resultadoActual || r.resumen,
      Recomendación: r.recomendacionW3C,
    }));
  if (filtered.length > 0) sheets.push(makeSheet(motor.toUpperCase(), filtered));
}

const wb = xlsx.utils.book_new();
sheets.forEach(({ name, sheet }) => xlsx.utils.book_append_sheet(wb, sheet, name));

try {
  const xlsxPath = path.join(outputDir, "Resumen-WCAG.xlsx");
  xlsx.writeFile(wb, xlsxPath);
  console.log(`📊 Excel generado: ${xlsxPath}`);
} catch (err) {
  console.error("❌ Error al escribir Excel:", err.message);
  process.exit(1);
}

// ===========================================================
// 🌐 HTML IAAP PRO (Visual interactivo)
// ===========================================================
const htmlPath = path.join(outputDir, "Resumen-WCAG.html");
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Resumen WCAG IAAP PRO</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f9f9f9; color: #222; padding: 2rem; }
  h1, h2 { color: #222; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 14px; }
  th, td { padding: 8px 12px; border: 1px solid #ccc; text-align: left; }
  th { background: #efefef; font-weight: bold; }
  tr:nth-child(even) { background: #fafafa; }
  .bar { height: 20px; background: #4caf50; }
  .critical { background: #e53935; color: white; }
  .serious { background: #fb8c00; color: white; }
  .moderate { background: #fdd835; }
  .minor { background: #aed581; }
  .footer { margin-top: 2rem; font-size: 13px; color: #666; }
</style>
</head>
<body>
<h1>♿ Informe Ejecutivo IAAP PRO v7.0</h1>
<p><strong>Sitio:</strong> ${process.env.SITE_URL || "No especificado"}<br>
<strong>Fecha:</strong> ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}<br>
<strong>Conformidad:</strong> ${conformidad}% — <strong>Nivel:</strong> ${nivelAccesibilidad}</p>

<h2>📊 Resumen de severidades</h2>
<table>
<tr><th>Severidad</th><th>Total</th><th>%</th></tr>
${Object.entries(countBySeverity)
  .map(
    ([sev, count]) =>
      `<tr class="${sev}"><td>${sev}</td><td>${count}</td><td>${severityPercent[sev]}</td></tr>`
  )
  .join("")}
</table>

<h2>🧱 Top 10 URLs con más incidencias</h2>
<table>
<tr><th>URL</th><th>Nº Incidencias</th></tr>
${topUrls.map(([url, n]) => `<tr><td><a href="${url}">${url}</a></td><td>${n}</td></tr>`).join("")}
</table>

<h2>📘 Criterios WCAG más afectados</h2>
<table>
<tr><th>Criterio</th><th>Violaciones</th></tr>
${topWcag.map(([crit, n]) => `<tr><td>${crit}</td><td>${n}</td></tr>`).join("")}
</table>

<div class="footer">
  📦 Generado automáticamente por <strong>Ilúmina Audit IAAP PRO v7.0</strong>  
  <br>Basado en las pautas <a href="https://www.w3.org/TR/WCAG22/" target="_blank">WCAG 2.2</a>.
</div>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, "utf8");
console.log(`🌐 HTML IAAP PRO generado: ${htmlPath}`);

console.log("\n✅ Generación completada con éxito — IAAP PRO v7.0\n");
