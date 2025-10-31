/**
 * 🚦 QUALITY GATE – CONTROL DE CALIDAD WCAG
 * ------------------------------------------
 * ✅ Compatible con CommonJS (Node.js 20+)
 * ✅ Lee el último archivo results-merged-*.json
 * ✅ Evalúa umbrales de severidad (Critical / Serious)
 * ✅ Imprime resultados con colores en consola
 * ✅ No detiene el pipeline (modo auditoría)
 */

const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");
const chalk = require("chalk");

// === CONFIGURACIÓN ===========================================
const auditoriasDir = path.join(__dirname, "..", "auditorias");
const CRITICAL_MAX = parseInt(process.env.CRITICAL_MAX || "0", 10);
const SERIOUS_MAX = parseInt(process.env.SERIOUS_MAX || "5", 10);

// === FUNCIONES AUXILIARES ===================================

function obtenerUltimoArchivo() {
  const files = fs
    .readdirSync(auditoriasDir)
    .filter(f => f.startsWith("results-merged-") && f.endsWith(".json"))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(auditoriasDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.time - a.time);

  return files.length ? path.join(auditoriasDir, files[0].name) : null;
}

function contarViolacionesPorImpact(data) {
  const severidades = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const page of data) {
    for (const v of page.violations || []) {
      const impact = (v.impact || "unknown").toLowerCase();
      if (severidades[impact] !== undefined) severidades[impact]++;
    }
  }
  return severidades;
}

// === PROCESO PRINCIPAL ======================================

console.log(chalk.cyan.bold("🚦 QUALITY GATE – Auditoría WCAG"));
console.log(chalk.gray("-----------------------------------"));

const latestFile = obtenerUltimoArchivo();

if (!latestFile) {
  console.error(chalk.red("❌ No se encontró ningún archivo results-merged-*.json"));
  process.exit(0);
}

console.log(chalk.cyan(`📄 Analizando archivo de resultados: ${latestFile}`));
console.log(chalk.gray(`📅 Fecha: ${format(new Date(), "yyyy-MM-dd HH:mm")}`));

let data;
try {
  data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
} catch (err) {
  console.error(chalk.red(`❌ Error al leer o parsear ${latestFile}: ${err.message}`));
  process.exit(0);
}

if (!Array.isArray(data) || !data.length) {
  console.warn(chalk.yellow("⚠️ El archivo no contiene datos de auditoría."));
  process.exit(0);
}

const counts = contarViolacionesPorImpact(data);

console.log(chalk.cyan("\n🚦 UMBRALES DE CONTROL:"));
console.log(`   Critical max: ${CRITICAL_MAX}`);
console.log(`   Serious max : ${SERIOUS_MAX}\n`);

console.log(chalk.cyan("📊 RESULTADOS DE SEVERIDAD:"));
console.log(`   Critical: ${chalk.red(counts.critical)}`);
console.log(`   Serious : ${chalk.yellow(counts.serious)}`);
console.log(`   Moderate: ${chalk.magenta(counts.moderate)}`);
console.log(`   Minor   : ${chalk.gray(counts.minor)}\n`);

let aprobado = true;

if (counts.critical > CRITICAL_MAX) {
  console.log(chalk.red(`❌ Demasiadas violaciones CRÍTICAS (${counts.critical} > ${CRITICAL_MAX})`));
  aprobado = false;
}

if (counts.serious > SERIOUS_MAX) {
  console.log(chalk.yellow(`❌ Demasiadas violaciones SERIAS (${counts.serious} > ${SERIOUS_MAX})`));
  aprobado = false;
}

if (aprobado) {
  console.log(chalk.green.bold("\n✅ Quality Gate superado. Cumple los umbrales establecidos.\n"));
} else {
  console.log(chalk.red.bold("\n🚫 Quality Gate no superado (modo auditoría, flujo continúa).\n"));
}

const totalViolaciones = Object.values(counts).reduce((a, b) => a + b, 0);

console.log(chalk.gray("-----------------------------------"));
console.log(chalk.cyan("📋 RESUMEN FINAL:"));
console.log(`   🧩 Páginas auditadas : ${data.length}`);
console.log(`   ⚠️ Violaciones totales: ${totalViolaciones}`);
console.log(chalk.gray("-----------------------------------"));

process.exit(0);

