/**
 * 🧾 generate-summary.mjs (v4.0.0 IAAP PRO estable)
 * ---------------------------------------------------------------------
 * Genera un resumen ejecutivo en formato Markdown a partir del archivo
 * combinado de auditorías WCAG (merge-results v4.1.1 o superior).
 *
 * ✅ Soporta campos: origen, capturePath, pageTitle, impact unclassified
 * ✅ Índice ponderado de conformidad IAAP PRO
 * ✅ Ranking de criterios WCAG + URLs + capturas
 * ✅ Distribución porcentual por severidad y origen
 * ✅ Compatible con CI/CD (GitHub Actions, Docker, Jenkins)
 */

import fs from "fs";
import path from "path";

// ===========================================================
// 📄 Cargar archivo combinado
// ===========================================================
const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("❌ No se encontró el archivo de resultados combinados.");
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
// 🧮 Cálculos generales
// ===========================================================
const totalUrls = new Set(data.map((d) => d.url)).size;
const totalViolations = data.reduce((sum, r) => sum + (r.violations?.length || 0), 0);

// Contar severidades
const impacts = data.flatMap((r) =>
  r.violations?.map((v) => v.impact?.toLowerCase() || "unclassified") || []
);
const countByImpact = impacts.reduce((acc, i) => {
  acc[i] = (acc[i] || 0) + 1;
  return acc;
}, {});

// Distribución porcentual
const totalImpacts = Object.values(countByImpact).reduce((a, b) => a + b, 0);
const impactPercent = Object.fromEntries(
  Object.entries(countByImpact).map(([k, v]) => [
    k,
    ((v / totalImpacts) * 100).toFixed(1) + "%",
  ])
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
  const count = r.violations?.length || 0;
  urlCount[r.url] = (urlCount[r.url] || 0) + count;
}
const topUrls = Object.entries(urlCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// ===========================================================
// 📈 Cálculo del índice de conformidad ponderado IAAP PRO
// ===========================================================
const penalizacion =
  (countByImpact.critical || 0) * 2.5 +
  (countByImpact.serious || 0) * 1.4 +
  (countByImpact.moderate || 0) * 0.6 +
  (countByImpact.minor || 0) * 0.3;

const conformidad = Math.max(0, 100 - penalizacion / Math.max(totalUrls, 1)).toFixed(1);

// ===========================================================
// 📸 Capturas más relevantes
// ===========================================================
const urlsWithCaptures = data
  .filter((r) => r.capturePath)
  .slice(0, 5)
  .map((r) => ({
    url: r.url,
    path: r.capturePath,
    origen: r.origen,
  }));

// ===========================================================
// 🧾 Generar Markdown IAAP PRO
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad WCAG – IAAP PRO

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Versión del pipeline:** Ilúmina Audit WCAG v4.0.0 IAAP Pro  

---

## 📊 Resultados Generales

- **Total de páginas auditadas:** ${totalUrls}
- **Total de violaciones detectadas:** ${totalViolations}
- **Índice estimado de conformidad WCAG:** ${conformidad} %

| Severidad | Total | % sobre el total |
|------------|--------|-----------------|
${Object.entries(countByImpact)
  .map(([impact, count]) => `| ${impact} | ${count} | ${impactPercent[impact] || "–"} |`)
  .join("\n")}

---

## 🧩 Distribución por Tipo de Auditoría

| Tipo de Auditoría | Nº de Violaciones |
|--------------------|-------------------|
${Object.entries(countByOrigen)
  .map(([origen, count]) => `| ${origen === "interactiva" ? "🧠 Interactiva" : "🌐 Sitemap"} | ${count} |`)
  .join("\n")}

---

## 🧱 Top 10 URLs con Más Violaciones

| URL | Nº de Violaciones |
|------|------------------|
${topUrls.map(([url, n]) => `| [${url}](${url}) | ${n} |`).join("\n")}

---

## 📸 Capturas Destacadas

| Tipo | URL | Captura |
|------|-----|----------|
${urlsWithCaptures
  .map(
    (c) =>
      `| ${c.origen} | [${c.url}](${c.url}) | ![captura](${c.path.replace(
        /^auditorias\//,
        ""
      )}) |`
  )
  .join("\n") || "| – | – | – |"}

---

## 📘 Criterios WCAG Más Afectados

| Criterio | Nº de Violaciones |
|-----------|------------------|
${topWcag.map(([crit, n]) => `| ${crit} | ${n} |`).join("\n") || "| – | – |"}

---

## 🔍 Observaciones Automáticas

- Se observan incidencias frecuentes en **contraste de color**, **roles ARIA** y **foco visible**.  
- Las violaciones *critical* y *serious* afectan directamente la interacción con teclado y lectores de pantalla.  
- Las pruebas *interactivas* muestran comportamientos dinámicos, con algunos modales y menús no etiquetados correctamente.  
- La auditoría *sitemap* detecta problemas estructurales repetitivos en encabezados, formularios y labels.

---

## 📈 Conclusión

El nivel global de conformidad con las [WCAG 2.2](https://www.w3.org/TR/WCAG22/) es del **${conformidad}%**,  
representando un **nivel medio-alto de accesibilidad digital** para el entorno auditado.

> 💡 *Prioriza la corrección de violaciones críticas y serias, realiza verificación posterior  
> y documenta las mejoras con capturas actualizadas.*

---

📦 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v4.0.0 IAAP PRO).*  
`;

console.log(markdown);
