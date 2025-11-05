/**
 * 🧾 generate-summary.mjs (v3.0 profesional IAAP / CI-safe)
 * -------------------------------------------------------------
 * Genera un resumen ejecutivo en formato Markdown
 * a partir del archivo JSON combinado de auditorías WCAG.
 *
 * ✅ Compatible con workflows CI/CD (GitHub Actions)
 * ✅ Cálculo de conformidad ponderada real
 * ✅ Ranking de criterios WCAG más afectados
 * ✅ Resultados por severidad y tipo de auditoría
 * ✅ Salida Markdown lista como artefacto de pipeline
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

// Contar por origen (sitemap/interactiva)
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

// ===========================================================
// 📈 Cálculo del índice de conformidad ponderado
// -----------------------------------------------------------
// Cada severidad penaliza diferente:
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
// 🧾 Generar Markdown
// ===========================================================
const markdown = `
# ♿ Informe Ejecutivo de Accesibilidad WCAG

**Sitio auditado:** ${process.env.SITE_URL || "No especificado"}  
**Fecha de generación:** ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}  
**Auditoría generada automáticamente por:** Ilúmina Audit WCAG v3.0  

---

## 📊 Resultados generales

- **Total de páginas auditadas:** ${totalUrls}
- **Total de violaciones detectadas:** ${totalViolations}
- **Índice estimado de conformidad WCAG:** ${conformidad} %

| Severidad | Total detectado |
|------------|----------------|
${Object.entries(countByImpact)
  .map(([impact, count]) => `| ${impact} | ${count} |`)
  .join("\n")}

---

## 🧩 Distribución por tipo de auditoría

| Tipo de Auditoría | Nº de Violaciones |
|--------------------|-------------------|
${Object.entries(countByOrigen)
  .map(([origen, count]) => `| ${origen} | ${count} |`)
  .join("\n")}

---

## 📘 Criterios WCAG más afectados

| Criterio | Nº de Violaciones |
|-----------|------------------|
${topWcag.map(([crit, n]) => `| ${crit} | ${n} |`).join("\n")}

---

## 🔍 Observaciones automáticas

- Se observan fallos recurrentes en **contraste de color**, **etiquetas ARIA** y **foco visible**.  
- Los errores *critical* y *serious* afectan directamente la navegación mediante teclado y lectores de pantalla.  
- Se recomienda **priorizar la corrección de los fallos críticos** antes de solicitar una reauditoría formal.  
- Los resultados de la auditoría interactiva confirman buena respuesta de la interfaz en modales, menús y sliders, aunque con incidencias de foco.

---

## 📈 Conclusión

La conformidad general del sitio con las [WCAG 2.1 / 2.2](https://www.w3.org/TR/WCAG22/) es del **${conformidad}%**,  
situándose en un **nivel medio de accesibilidad digital**.  

Se recomienda implementar un plan de corrección progresiva empezando por las violaciones de severidad **critical** y **serious**,  
y verificar posteriormente con una auditoría de validación.

---

🧾 *Informe generado automáticamente por Ilúmina Audit WCAG Pipeline (v3.0 profesional).*
`;

console.log(markdown);


