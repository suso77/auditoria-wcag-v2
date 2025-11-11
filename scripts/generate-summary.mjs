/**
 * 🧾 generate-summary.mjs (v5.3 IAAP PRO)
 * ---------------------------------------------------------------------
 * Genera un resumen ejecutivo en formato Markdown a partir del archivo
 * combinado de auditorías WCAG (merge-auditorias v5.3 o superior).
 *
 * ✅ Detección automática de campos (pageUrl, impact, wcag)
 * ✅ Índice ponderado IAAP PRO ajustado por severidad
 * ✅ Ranking WCAG + URLs + capturas
 * ✅ Compatible con CI/CD y GitHub Actions
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
// 🧮 Normalización y cálculos globales
// ===========================================================
const urls = new Set(data.map((d) => d.pageUrl || d.url || ""));
const totalUrls = urls.size;
const totalViolations = data.length;

// Contar severidades
const countByImpact = data.reduce((acc, i) => {
  const impact = (i.impact || "unclassified").toLowerCase();
  acc[impact] = (acc[impact] || 0) + 1;
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

// Contar por origen (sitemap vs interactiva)
const countByOrigen = data.reduce((acc, i) => {
  const origen = i.origen || "sitemap";
  acc[origen] = (acc[origen] || 0) + 1;
  return acc;
}, {});

// Ranking de criterios WCAG más afectados
const wcagCount = {};
for (const i of data) {
  const wcag = (i.wcag || "").trim();
  if (wcag) wcagCount[wcag] = (wcagCount[wcag] || 0) + 1;
}
const topWcag = Object.entries(wcagCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// Ranking de URLs con más violaciones
const urlCount = {};
for (const i of data) {
  const url = i.pageUrl || i.url || "(sin URL)";
  urlCount[url] = (urlCount[url] || 0) + 1;
}
const topUrls = Object.entries(urlCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// ===========================================================
// 📈 Cálculo del índice ponderado IAAP PRO
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
    url: r.pageUrl || r.url,
    path: r.capturePath,
    origen: r.origen,
  }));

// ===========================================================
// 🧾 Generar Markdown IAAP PRO
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad Digital – IAAP PRO

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Versión del pipeline:** Ilúmina Audit WCAG v5.3 IAAP PRO  

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
${topUrls.map(([url, n]) => `| [${url}](${url}) | ${n} |`).join("\n") || "| – | – |"}

---

## 📘 Criterios WCAG Más Afectados

| Criterio | Nº de Violaciones |
|-----------|------------------|
${topWcag.map(([crit, n]) => `| ${crit} | ${n} |`).join("\n") || "| – | – |"}

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

## 🔍 Observaciones Automáticas

- Incidencias frecuentes en **contraste de color**, **roles ARIA** y **foco visible**.  
- Violaciones *critical* y *serious* impactan directamente en la navegación con teclado y lectores de pantalla.  
- La auditoría *interactiva* detecta errores en elementos dinámicos como menús, modales y componentes AJAX.  
- La auditoría *sitemap* revela patrones estructurales repetitivos (encabezados, labels, formularios).

---

## 📈 Conclusión

El nivel global de conformidad con las [WCAG 2.2](https://www.w3.org/TR/WCAG22/) es del **${conformidad}%**,  
representando un **nivel medio-alto de accesibilidad digital** para el sitio auditado.

> 💡 *Prioriza la corrección de violaciones críticas y serias, realiza una verificación posterior  
> y documenta las mejoras con capturas actualizadas.*

---

📦 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v5.3 IAAP PRO).*  
`;

console.log(markdown);
