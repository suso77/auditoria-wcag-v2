/**
 * 📊 post-merge-summary.cjs
 * ------------------------------------------------------------
 * Genera un resumen automático tras combinar resultados WCAG.
 * Muestra totales por severidad (critical, serious, moderate, minor).
 * ------------------------------------------------------------
 * ✅ Compatible con Node 20+ y GitHub Actions
 * ✅ Útil para CI/CD y reporting rápido
 */

const fs = require("fs");
const path = require("path");

const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");

// Buscar último archivo results-merged-*.json
const mergedFiles = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter(f => f.startsWith("results-merged") && f.endsWith(".json"))
  .sort()
  .reverse();

if (mergedFiles.length === 0) {
  console.error("❌ No se encontraron archivos results-merged-*.json para analizar.");
  process.exit(1);
}

const latestFile = path.join(AUDITORIAS_DIR, mergedFiles[0]);
const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));

if (!Array.isArray(data) || data.length === 0) {
  console.error("⚠️ Archivo vacío o mal formado:", latestFile);
  process.exit(0);
}

// Contadores globales
const counters = {
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  total: 0,
  urls: new Set(),
};

data.forEach(item => {
  if (!item.url || !Array.isArray(item.violations)) return;
  counters.urls.add(item.url);
  item.violations.forEach(v => {
    counters.total++;
    if (v.impact && counters[v.impact] !== undefined) counters[v.impact]++;
  });
});

console.log("===============================================");
console.log("♿ RESUMEN GLOBAL DE LA AUDITORÍA WCAG");
console.log("===============================================");
console.log(`🌍 URLs auditadas: ${counters.urls.size}`);
console.log(`🧩 Violaciones totales: ${counters.total}`);
console.log("--------------------------------------------------");
console.log(`🚨 Critical: ${counters.critical}`);
console.log(`⚠️ Serious:  ${counters.serious}`);
console.log(`🔸 Moderate: ${counters.moderate}`);
console.log(`🔹 Minor:    ${counters.minor}`);
console.log("--------------------------------------------------");

// Control de calidad opcional
const CRITICAL_MAX = parseInt(process.env.CRITICAL_MAX || "0", 10);
const SERIOUS_MAX = parseInt(process.env.SERIOUS_MAX || "5", 10);

const passed =
  counters.critical <= CRITICAL_MAX && counters.serious <= SERIOUS_MAX;

if (passed) {
  console.log("✅ Quality Gate superado.");
  console.log("===============================================");
  process.exit(0);
} else {
  console.log("❌ Quality Gate no superado.");
  console.log(`   Umbrales: CRITICAL_MAX=${CRITICAL_MAX}, SERIOUS_MAX=${SERIOUS_MAX}`);
  console.log("===============================================");
  process.exit(1);
}
