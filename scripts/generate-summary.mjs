/**
 * 🧾 generate-summary.mjs — IAAP PRO v6.5 (sincronizado con merge-auditorias.mjs)
 * ---------------------------------------------------------------------
 * ✅ Genera resumen ejecutivo + Excel profesional
 * ✅ Compatible con campos nuevos: engine, source, severity, nivel, principio
 * ✅ Desglosa por tipo de auditoría y motor
 * ✅ Calcula índice ponderado IAAP PRO con pesos WCAG
 */

import fs from "fs";
import path from "path";
import xlsx from "xlsx";

// ===========================================================
// 📂 Cargar archivo combinado
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
// 🧮 Cálculos globales
// ===========================================================
const urls = new Set(data.map((d) => d.pageUrl || d.url || ""));
const totalUrls = urls.size;
const totalViolations = data.length;

// --- Contar por severidad (ya normalizada) ---
const countBySeverity = data.reduce((acc, i) => {
  const sev = (i.severity || i.impact || "unclassified").toLowerCase();
  acc[sev] = (acc[sev] || 0) + 1;
  return acc;
}, {});

// --- Contar por tipo de auditoría ---
const countBySource = data.reduce((acc, i) => {
  const src = i.source || "sitemap";
  acc[src] = (acc[src] || 0) + 1;
  return acc;
}, {});

// --- Contar por motor ---
const countByEngine = data.reduce((acc, i) => {
  const eng = i.engine || "desconocido";
  acc[eng] = (acc[eng] || 0) + 1;
  return acc;
}, {});

// --- Distribución porcentual ---
const totalSeverities = Object.values(countBySeverity).reduce((a, b) => a + b, 0);
const severityPercent = Object.fromEntries(
  Object.entries(countBySeverity).map(([k, v]) => [
    k,
    ((v / totalSeverities) * 100).toFixed(1) + "%",
  ])
);

// ===========================================================
// 📊 Rankings principales
// ===========================================================

// --- Criterios WCAG más afectados ---
const wcagCount = {};
for (const i of data) {
  const wcag = (i.wcag || i.id || "").trim();
  if (wcag) wcagCount[wcag] = (wcagCount[wcag] || 0) + 1;
}
const topWcag = Object.entries(wcagCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// --- URLs con más incidencias ---
const urlCount = {};
for (const i of data) {
  const url = i.pageUrl || i.url || "(sin URL)";
  urlCount[url] = (urlCount[url] || 0) + 1;
}
const topUrls = Object.entries(urlCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// ===========================================================
// 📈 Índice ponderado IAAP PRO v6.5
// ===========================================================
const pesos = {
  critical: 3.5,
  serious: 2.0,
  moderate: 1.0,
  minor: 0.5,
  "needs-review": 1.2,
};

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
// 📸 Capturas relevantes
// ===========================================================
const urlsWithCaptures = data
  .filter((r) => r.capturePath)
  .sort((a, b) => {
    const peso = { critical: 3, serious: 2, moderate: 1, minor: 0 };
    return (peso[b.severity] || 0) - (peso[a.severity] || 0);
  })
  .slice(0, 6)
  .map((r) => ({
    url: r.pageUrl || r.url,
    path: r.capturePath,
    source: r.source,
    impact: r.severity,
    engine: r.engine,
  }));

// ===========================================================
// 🧾 Generar Markdown IAAP PRO
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad Digital – IAAP PRO v6.5

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Versión del pipeline:** Ilúmina Audit WCAG v6.5 IAAP PRO  

---

## 📊 Resumen General

- **Total de páginas auditadas:** ${totalUrls}
- **Total de incidencias detectadas:** ${totalViolations}
- **Índice estimado de conformidad WCAG:** ${conformidad}%  
- **Nivel de accesibilidad alcanzado:** ${nivelAccesibilidad}

| Severidad | Total | % |
|------------|--------|----|
${Object.entries(countBySeverity)
  .map(([sev, count]) => `| ${sev} | ${count} | ${severityPercent[sev] || "–"} |`)
  .join("\n")}

---

## 🧩 Distribución por Tipo de Auditoría

| Tipo | Incidencias | % |
|------|--------------|----|
${Object.entries(countBySource)
  .map(([src, count]) => {
    const icon =
      src === "interactiva"
        ? "🧠 Interactiva"
        : src === "manual"
        ? "🖐️ Manual"
        : "🌐 Sitemap";
    const p = ((count / totalViolations) * 100).toFixed(1);
    return `| ${icon} | ${count} | ${p}% |`;
  })
  .join("\n")}

---

## ⚙️ Distribución por Motor

| Motor | Incidencias |
|--------|--------------|
${Object.entries(countByEngine)
  .map(([eng, count]) => `| ${eng} | ${count} |`)
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

## 📸 Capturas Destacadas

| Motor | Tipo | Severidad | URL | Captura |
|--------|------|------------|-----|----------|
${urlsWithCaptures
  .map(
    (c) =>
      `| ${c.engine} | ${c.source} | ${c.impact} | [${c.url}](${c.url}) | ![captura](../${c.path.replace(
        /^auditorias\//,
        ""
      )}) |`
  )
  .join("\n") || "| – | – | – | – | – |"}

---

## 💡 Conclusión

El nivel global de conformidad con las [WCAG 2.2](https://www.w3.org/TR/WCAG22/)  
es del **${conformidad}%**, alcanzando un **nivel ${nivelAccesibilidad}**  
según el modelo IAAP PRO v6.5 de Ilúmina Audit.

> 🧭 *Priorizar la corrección de incidencias Critical y Serious.  
> Revalidar los componentes dinámicos tras aplicar las correcciones.*  

---

📦 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v6.5 IAAP PRO).*  
`;

// ===========================================================
// 💾 Guardar Markdown
// ===========================================================
const outputDir = path.join("auditorias");
const outputMd = path.join(outputDir, "Resumen-WCAG.md");
fs.writeFileSync(outputMd, markdown, "utf8");
console.log(`✅ Resumen Markdown generado: ${outputMd}`);

// ===========================================================
// 📊 Generar Excel IAAP PRO v6.5
// ===========================================================
function makeSheet(name, rows) {
  const ws = xlsx.utils.json_to_sheet(rows);
  return { name, ws };
}

const sheets = [];

// --- Por tipo de auditoría ---
const tipos = ["sitemap", "interactiva", "manual"];
for (const tipo of tipos) {
  const filtered = data
    .filter((r) => (r.source || "sitemap") === tipo)
    .map((r) => ({
      Motor: r.engine || "",
      URL: r.pageUrl || "",
      Título: r.pageTitle || "",
      Criterio_WCAG: r.wcag || "",
      Nivel: r.nivel || "",
      Principio: r.principio || "",
      Severidad: r.severity || "",
      Resultado_actual: r.resultadoActual || "",
      Resultado_esperado: r.resultadoEsperado || "",
      Recomendación_W3C: r.recomendacionW3C || "",
      Selector: r.selector || "",
    }));
  if (filtered.length > 0) sheets.push(makeSheet(tipo.toUpperCase(), filtered));
}

// --- Por motor ---
const motores = [...new Set(data.map((r) => r.engine))];
for (const motor of motores) {
  const filtered = data
    .filter((r) => r.engine === motor)
    .map((r) => ({
      Origen: r.source,
      URL: r.pageUrl || "",
      Criterio_WCAG: r.wcag,
      Severidad: r.severity,
      Descripción: r.resumen || "",
      Resultado_actual: r.resultadoActual,
      Resultado_esperado: r.resultadoEsperado,
      Recomendación_W3C: r.recomendacionW3C,
    }));
  if (filtered.length > 0)
    sheets.push(makeSheet(motor.toUpperCase(), filtered));
}

// --- Hoja Resumen global ---
const resumenSheet = [
  { Métrica: "Páginas auditadas", Valor: totalUrls },
  { Métrica: "Incidencias totales", Valor: totalViolations },
  { Métrica: "Conformidad (%)", Valor: conformidad },
  { Métrica: "Nivel Accesibilidad", Valor: nivelAccesibilidad },
];
sheets.unshift(makeSheet("RESUMEN", resumenSheet));

// --- Crear workbook y guardar ---
const wb = xlsx.utils.book_new();
for (const { name, ws } of sheets) xlsx.utils.book_append_sheet(wb, ws, name);

const outputXlsx = path.join(outputDir, "Resumen-WCAG.xlsx");
xlsx.writeFile(wb, outputXlsx);
console.log(`📊 Excel IAAP PRO generado: ${outputXlsx}`);

console.log("\n✅ Generación completada con éxito – IAAP PRO v6.5\n");
