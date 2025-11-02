/**
 * 🚦 quality-gate.cjs
 * ------------------------------------------------------------
 * Control de calidad de accesibilidad automatizado.
 * ------------------------------------------------------------
 * ✅ Lee el último results-merged-*.json
 * ✅ Evalúa contra umbrales CRITICAL_MAX / SERIOUS_MAX
 * ✅ Compatible con Node.js 20 y GitHub Actions
 * ✅ Crea resumen JSON + resumen visual en el job
 * ✅ Falla (exit 1) si se superan los umbrales
 */

const fs = require("fs");
const path = require("path");
const process = require("process");

// 📁 Rutas principales
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// ⚙️ Umbrales configurables
const CRITICAL_MAX = parseInt(process.env.CRITICAL_MAX || "0", 10);
const SERIOUS_MAX = parseInt(process.env.SERIOUS_MAX || "5", 10);

// 🧭 Buscar el último archivo results-merged-*.json
const files = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter(f => f.startsWith("results-merged-") && f.endsWith(".json"))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(AUDITORIAS_DIR, f)).mtime.getTime(),
  }))
  .sort((a, b) => b.time - a.time);

if (!files.length) {
  console.error("❌ No se encontró ningún archivo results-merged-*.json");
  process.exit(1);
}

const latestFile = path.join(AUDITORIAS_DIR, files[0].name);
console.log(`📊 Analizando resultados desde: ${latestFile}`);

// 📖 Leer archivo de resultados
let data;
try {
  data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
} catch (err) {
  console.error(`❌ Error al leer o parsear ${latestFile}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data) || !data.length) {
  console.error("❌ El archivo está vacío o no contiene formato válido.");
  process.exit(1);
}

// 📈 Contadores globales
const stats = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };

for (const page of data) {
  if (!page.violations) continue;
  for (const v of page.violations) {
    stats.total++;
    if (v.impact && stats[v.impact] !== undefined) stats[v.impact]++;
  }
}

// 🚦 Mostrar resumen en consola
console.log("===============================================");
console.log("🚦 Quality Gate – Auditoría de Accesibilidad");
console.log("===============================================");
console.log(`🧾 Archivo analizado: ${files[0].name}`);
console.log(`🔴 Críticas : ${stats.critical}`);
console.log(`🟠 Serias   : ${stats.serious}`);
console.log(`🟡 Moderadas: ${stats.moderate}`);
console.log(`🟢 Menores  : ${stats.minor}`);
console.log(`⚙️ Umbrales → Critical ≤ ${CRITICAL_MAX}, Serious ≤ ${SERIOUS_MAX}`);
console.log("===============================================");

// 🧾 Guardar resumen JSON
const summaryJson = path.join(AUDITORIAS_DIR, "quality-report.json");
fs.writeFileSync(
  summaryJson,
  JSON.stringify(
    {
      file: path.basename(latestFile),
      ...stats,
      thresholds: { critical: CRITICAL_MAX, serious: SERIOUS_MAX },
      date: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log(`📝 Resumen JSON guardado en: ${summaryJson}`);

// 🧩 Crear resumen visual para GitHub Actions
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  const passedCritical = stats.critical <= CRITICAL_MAX;
  const passedSerious = stats.serious <= SERIOUS_MAX;

  const markdown = `
## ♿ Informe de Control de Calidad – WCAG

| Severidad | Conteo | Límite | Estado |
|------------|--------|--------|--------|
| 🔴 Críticas | ${stats.critical} | ≤ ${CRITICAL_MAX} | ${passedCritical ? "✅" : "❌"} |
| 🟠 Serias | ${stats.serious} | ≤ ${SERIOUS_MAX} | ${passedSerious ? "✅" : "❌"} |
| 🟡 Moderadas | ${stats.moderate} | — | ℹ️ |
| 🟢 Menores | ${stats.minor} | — | ℹ️ |
| 📄 **Total** | **${stats.total}** | — | ✅ |

📊 **Archivo analizado:** \`${path.basename(latestFile)}\`  
📅 **Fecha:** ${new Date().toLocaleString("es-ES")}
`;
  fs.appendFileSync(summaryPath, markdown, "utf8");
  console.log("✅ Resumen visual añadido a GITHUB_STEP_SUMMARY");
}

// 🚨 Evaluar umbrales
let exitCode = 0;

if (stats.critical > CRITICAL_MAX) {
  console.error(`❌ Exceso de violaciones críticas: ${stats.critical} (máximo permitido ${CRITICAL_MAX})`);
  exitCode = 1;
}

if (stats.serious > SERIOUS_MAX) {
  console.error(`❌ Exceso de violaciones serias: ${stats.serious} (máximo permitido ${SERIOUS_MAX})`);
  exitCode = 1;
}

// 🟩 Resultado final
if (exitCode === 0) {
  console.log("✅ Quality Gate superado correctamente.");
} else {
  console.warn("⚠️ Quality Gate no superado. El flujo puede continuar en modo auditoría.");
}

console.log("===============================================");
process.exit(exitCode);
