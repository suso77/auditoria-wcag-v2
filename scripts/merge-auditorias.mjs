/**
 * ♿ IAAP PRO v4.1 — Merge de auditorías de accesibilidad
 * ------------------------------------------------------
 * Une los resultados de:
 *  - auditoria-sitemap/results.json
 *  - auditoria-interactiva/results.json
 * Genera:
 *  - auditorias/reportes/merged-results.json
 *  - auditorias/reportes/merged-summary.md
 *
 * Compatible con scripts/export-to-xlsx.mjs y capture-evidence.mjs
 */

import fs from "fs";
import path from "path";

const auditoriasDir = "./auditorias";
const outputDir = path.join(auditoriasDir, "reportes");
const mergedFile = path.join(outputDir, "merged-results.json");
const summaryFile = path.join(outputDir, "merged-summary.md");

// Crear directorio de salida si no existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Carpeta creada: ${outputDir}`);
}

// Fuentes de resultados
const fuentes = [
  "auditoria-sitemap/results.json",
  "auditoria-interactiva/results.json",
];

const merged = [];
let total = 0;

// -----------------------------------------------------
// 📦 Unir resultados de auditorías existentes
// -----------------------------------------------------
for (const fuente of fuentes) {
  const filePath = path.join(auditoriasDir, fuente);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      merged.push(...data);
      total += data.length;
      console.log(`📥 ${data.length} resultados añadidos desde ${fuente}`);
    } catch (err) {
      console.error(`❌ Error al leer ${fuente}:`, err.message);
    }
  } else {
    console.warn(`⚠️ No se encontró ${fuente}, se omitirá.`);
  }
}

if (merged.length === 0) {
  console.error("❌ No hay resultados para combinar. Ejecuta las auditorías primero.");
  process.exit(1);
}

// -----------------------------------------------------
// 🧩 Eliminar duplicados por page + selector + origen
// -----------------------------------------------------
const uniqueResults = Object.values(
  merged.reduce((acc, r) => {
    const key = `${r.page}::${r.selector}::${r.origen || "desconocido"}`;
    acc[key] = r;
    return acc;
  }, {})
);

fs.writeFileSync(mergedFile, JSON.stringify(uniqueResults, null, 2));
console.log(`✅ Archivo combinado creado en: ${mergedFile}`);

// -----------------------------------------------------
// 📊 Generar resumen Markdown legible
// -----------------------------------------------------
const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
uniqueResults.forEach((item) => {
  item.violations?.forEach((v) => {
    if (byImpact[v.impact] !== undefined) byImpact[v.impact]++;
  });
});

let summary = `# ♿ Informe Consolidado IAAP PRO v4.1\n\n`;
summary += `📅 Fecha de generación: ${new Date().toLocaleString("es-ES")}\n\n`;
summary += `📊 **Violaciones totales:** ${uniqueResults.length}\n\n`;
summary += `| Severidad | Nº de violaciones |\n|------------|------------------|\n`;
for (const [impact, count] of Object.entries(byImpact)) {
  summary += `| ${impact} | ${count} |\n`;
}
summary += `\n## 🧭 Detalle por página\n\n`;

const byPage = {};
uniqueResults.forEach((item) => {
  if (!byPage[item.page]) byPage[item.page] = [];
  byPage[item.page].push(...(item.violations || []));
});

for (const [page, violations] of Object.entries(byPage)) {
  summary += `### 🌐 ${page}\n`;
  if (violations.length === 0) {
    summary += `- ✅ Sin violaciones detectadas.\n\n`;
  } else {
    violations.forEach((v) => {
      summary += `- **${v.id}** (${v.impact}) → ${v.help}\n`;
    });
    summary += `\n`;
  }
}

fs.writeFileSync(summaryFile, summary, "utf8");
console.log(`📝 Resumen Markdown generado: ${summaryFile}`);

// -----------------------------------------------------
// 🧾 Registro final y ruta de referencia
// -----------------------------------------------------
fs.writeFileSync("auditorias/last-merged.txt", outputDir, "utf8");
console.log("💾 Ruta registrada en auditorias/last-merged.txt");
console.log("🎯 Merge completado con éxito (IAAP PRO v4.1)");

