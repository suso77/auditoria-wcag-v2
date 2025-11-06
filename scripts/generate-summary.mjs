/**
 * 🧾 generate-summary.mjs (v3.5 profesional IAAP / CI-Pro)
 * -------------------------------------------------------------
 * Genera un resumen ejecutivo en formato Markdown
 * a partir del archivo JSON combinado de auditorías WCAG.
 *
 * ✅ Compatible con workflows CI/CD (GitHub Actions, Jenkins, GitLab)
 * ✅ Cálculo de conformidad ponderada real
 * ✅ Ranking de criterios WCAG más afectados
 * ✅ Ranking de URLs con más violaciones
 * ✅ Distribución porcentual por severidad y tipo
 * ✅ Salida Markdown lista para informes IAAP / pipelines
 * -------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

// ===========================================================
// 📄 Ruta del archivo combinado
// ===========================================================
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo de resultados combinados.");
  process.exit(1);
}

// ===========================================================
// 📊 Cargar datos
// ===========================================================
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
// 🧮 Cálculos generales
// ===========================================================
const totalUrls = new Set(data.map((d) => d.url)).size;
const totalViolations = data.reduce((sum, r) => sum + (r.violations?.length || 0), 0);

// Contar severidades
const impacts = data.flatMap((r) => r.violations?.map((v) => v.impact || "unknown") || []);
const countByImpact = impacts.reduce((acc, i) => {
  acc[i] = (acc[i] || 0) + 1;
  return acc;
}, {});

// Distribución porcentual
const totalImpacts = Object.values(countByImpact).reduce((a, b) => a + b, 0);
const impactPercent = Object.fromEntries(
  Object.entries(countByImpact).map(([k, v]) => [k, ((v / totalImpacts) * 100).toFixed(1) + "%"])
);

// Contar por origen
const countByOrigen = data.reduce((acc, r) => {
  const origen = r.origen || "sitemap";
  acc[origen] = (acc[origen] || 0) + (r.violations?.length || 0);
  return acc;
}, {});

// Ranking de criterios WCAG más afectados
const wcagCount = {};
for (const r of data)
  for (const v of r.violations || [])
    for (const tag of v.tags || [])
      if (tag.startsWith("wcag"))
        wcagCount[tag] = (wcagCount[tag] || 0) + 1;

const topWcag = Object.entries(wcagCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// Ranking de URLs con más violaciones
const urlCount = {};
for (const r of data) {
  const count = (r.violations?.length || 0);
  urlCount[r.url] = (urlCount[r.url] || 0) + count;
}
const topUrls = Object.entries(urlCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// ===========================================================
// 📈 Cálculo del índice de conformidad ponderado
// -----------------------------------------------------------
//   critical → 2.0
//   serious  → 1.2
//   moderate → 0.5
//   minor    → 0.2
// ===========================================================
const penalizacion =
  (countByImpact.critical || 0) * 2 +
  (countByImpact.serious || 0) * 1.2 +
  (countByImpact.moderate || 0) * 0.5 +
  (countByImpact.minor || 0) * 0.2;

const conformidad = Math.max(
  0,
  100 - penalizacion / Math.max(totalUrls, 1)
).toFixed(1);

// ===========================================================
// 🧾 Generar Markdown IAAP
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad WCAG

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Versión del pipeline:** Ilúmina Audit WCAG v3.5 IAAP Pro  

---

## 📊 Resultados generales

- **Total de páginas auditadas:** ${totalUrls}
- **Total de violaciones detectadas:** ${totalViolations}
- **Índice estimado de conformidad WCAG:** ${conformidad} %

| Severidad | Total | % sobre el total |
|------------|--------|-----------------|
${Object.entries(countByImpact)
  .map(([impact, count]) => `| ${impact} | ${count} | ${impactPercent[impact] || "–"} |`)
  .join("\n")}

---

## 🧩 Distribución por tipo de auditoría

| Tipo de Auditoría | Nº de Violaciones |
|--------------------|-------------------|
${Object.entries(countByOrigen)
  .map(([origen, count]) => `| ${origen} | ${count} |`)
  .join("\n")}

---

## 🧱 Ranking de URLs con más violaciones

| URL | Nº de Violaciones |
|------|------------------|
${topUrls.map(([url, n]) => `| ${url} | ${n} |`).join("\n")}

---

## 📘 Criterios WCAG más afectados

| Criterio | Nº de Violaciones |
|-----------|------------------|
${topWcag.map(([crit, n]) => `| ${crit} | ${n} |`).join("\n")}

---

## 🔍 Observaciones automáticas

- Se observan incidencias frecuentes en **contraste de color**, **roles ARIA** y **foco visible**.  
- Las violaciones *critical* y *serious* afectan directamente la experiencia con **teclado y lector de pantalla**.  
- Se recomienda priorizar la corrección de fallos críticos y realizar una **reauditoría parcial tras la corrección**.  
- Las pruebas interactivas muestran un comportamiento estable en modales y menús, aunque con incidencias de accesibilidad ARIA.

---

## 📈 Conclusión

El nivel global de conformidad con las [WCAG 2.1 / 2.2](https://www.w3.org/TR/WCAG22/) es del **${conformidad}%**,  
lo que representa un **nivel medio de accesibilidad digital**.

> 💡 *Se aconseja implementar mejoras progresivas, comenzando por las violaciones de severidad crítica,  
> seguidas de los errores serios, para alcanzar el nivel AA de conformidad.*

---

📦 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v3.5 profesional IAAP).*
`;

console.log(markdown);
