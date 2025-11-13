/**
 * ♿ verify-metadata.mjs — IAAP PRO v6.5 (versión extendida profesional)
 * ---------------------------------------------------------------------
 * Verifica integridad del archivo merged-results.json
 * y genera metadata-report.json con métricas listas para dashboards.
 *
 * ✅ Comprueba campos requeridos y valores vacíos
 * ✅ Detecta duplicados por ID y por URL+WCAG
 * ✅ Genera estadísticas por motor, severidad, fuente, nivel, principio
 * ✅ Calcula ratios de cumplimiento y cobertura IAAP PRO
 * ✅ Devuelve exit codes compatibles con pipeline CI/CD
 * ---------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";

const ROOT = process.cwd();
const REPORTES_DIR = path.join(ROOT, "auditorias", "reportes");
const MERGED_FILE = path.join(REPORTES_DIR, "merged-results.json");
const OUTPUT_FILE = path.join(REPORTES_DIR, "metadata-report.json");

console.log(chalk.bold.cyan("\n♿ Verificación de metadatos IAAP PRO v6.5 — extendida"));
console.log(chalk.gray("------------------------------------------------------------"));

// ============================================================
// 📂 Verificación inicial
// ============================================================
if (!fs.existsSync(MERGED_FILE)) {
  console.error(chalk.red("❌ No se encontró merged-results.json. Ejecuta merge-auditorias.mjs primero."));
  process.exit(2);
}

// ============================================================
// 📖 Cargar y validar JSON
// ============================================================
let data = [];
try {
  data = JSON.parse(fs.readFileSync(MERGED_FILE, "utf8"));
} catch (err) {
  console.error(chalk.red(`❌ Error al leer merged-results.json: ${err.message}`));
  process.exit(2);
}

if (!Array.isArray(data) || data.length === 0) {
  console.warn(chalk.yellow("⚠️ merged-results.json está vacío o sin formato válido."));
  process.exit(1);
}

// ============================================================
// 🧩 Campos obligatorios
// ============================================================
const requiredFields = [
  "id",
  "engine",
  "source",
  "pageUrl",
  "wcag",
  "nivel",
  "impact",
  "resultadoActual",
  "resultadoEsperado",
];

// ============================================================
// 🔍 Validación de issues
// ============================================================
const issuesMissing = [];
const issuesEmpty = [];
const duplicatesExact = new Set();
const duplicatesUrlWcag = new Map();
const seenIds = new Set();

for (const issue of data) {
  const missing = requiredFields.filter((f) => !(f in issue));
  const empties = requiredFields.filter(
    (f) => typeof issue[f] === "string" && !issue[f].trim()
  );

  if (missing.length > 0)
    issuesMissing.push({ id: issue.id || "(sin id)", pageUrl: issue.pageUrl, missing });
  if (empties.length > 0)
    issuesEmpty.push({ id: issue.id || "(sin id)", pageUrl: issue.pageUrl, empties });

  // duplicados exactos
  if (seenIds.has(issue.id)) duplicatesExact.add(issue.id);
  else seenIds.add(issue.id);

  // duplicados por URL + WCAG
  const key = `${issue.pageUrl}::${issue.wcag}`;
  duplicatesUrlWcag.set(key, (duplicatesUrlWcag.get(key) || 0) + 1);
}

const dupesUrlWcag = [...duplicatesUrlWcag.entries()].filter(([_, c]) => c > 1);

// ============================================================
// 🧮 Estadísticas globales IAAP PRO
// ============================================================
const total = data.length;

// --- Totales por motor ---
const countBy = (field) =>
  data.reduce((acc, i) => {
    const key = i[field] || "sin_dato";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const byEngine = countBy("engine");
const bySource = countBy("source");
const byImpact = countBy("impact");
const byNivel = countBy("nivel");
const byPrincipio = countBy("principio");

// --- Ratios porcentuales ---
const pct = (x) => ((x / total) * 100).toFixed(1) + "%";

const resumen = {
  total_issues: total,
  motores: Object.fromEntries(Object.entries(byEngine).map(([k, v]) => [k, `${v} (${pct(v)})`])),
  fuentes: Object.fromEntries(Object.entries(bySource).map(([k, v]) => [k, `${v} (${pct(v)})`])),
  severidades: Object.fromEntries(Object.entries(byImpact).map(([k, v]) => [k, `${v} (${pct(v)})`])),
  niveles_wcag: byNivel,
  principios_wcag: byPrincipio,
};

// ============================================================
// 🧱 Índice IAAP PRO ponderado
// ============================================================
const pesos = {
  critical: 3.5,
  serious: 2.0,
  moderate: 1.0,
  minor: 0.5,
  "needs-review": 1.2,
};

const penalizacion = Object.entries(byImpact).reduce(
  (sum, [impact, count]) => sum + (pesos[impact] || 0.5) * count,
  0
);

const totalUrls = new Set(data.map((d) => d.pageUrl)).size;
const conformidad = Math.max(0, 100 - penalizacion / Math.max(totalUrls, 1)).toFixed(1);

const nivelAccesibilidad =
  conformidad >= 90
    ? "AA (Alta)"
    : conformidad >= 75
    ? "AA (Media)"
    : conformidad >= 50
    ? "A (Baja)"
    : "No conforme";

resumen.indice_conformidad = `${conformidad}%`;
resumen.nivel_accesibilidad = nivelAccesibilidad;

// ============================================================
// 🧾 Registro visual
// ============================================================
const missingCount = issuesMissing.length;
const emptyCount = issuesEmpty.length;
const duplicateExactCount = duplicatesExact.size;
const duplicateUrlWcagCount = dupesUrlWcag.length;

if (missingCount > 0)
  console.log(chalk.red(`❌ ${missingCount} issues con campos ausentes.`));
if (emptyCount > 0)
  console.log(chalk.yellow(`⚠️ ${emptyCount} issues con valores vacíos.`));
if (duplicateExactCount > 0)
  console.log(chalk.red(`❌ ${duplicateExactCount} duplicados exactos de ID.`));
if (duplicateUrlWcagCount > 0)
  console.log(chalk.yellow(`⚠️ ${duplicateUrlWcagCount} posibles duplicados por URL+WCAG.`));

if (
  missingCount === 0 &&
  emptyCount === 0 &&
  duplicateExactCount === 0 &&
  duplicateUrlWcagCount === 0
) {
  console.log(chalk.green("✅ Todos los issues cumplen los requisitos de metadatos."));
}

// ============================================================
// 📊 Estructura extendida para dashboards IAAP PRO
// ============================================================
const dashboard = {
  resumen,
  distribuciones: {
    por_motor: byEngine,
    por_fuente: bySource,
    por_severidad: byImpact,
    por_nivel: byNivel,
    por_principio: byPrincipio,
  },
  validaciones: {
    campos_faltantes: missingCount,
    valores_vacios: emptyCount,
    duplicados_exactos: duplicateExactCount,
    duplicados_url_wcag: duplicateUrlWcagCount,
  },
  estado_global:
    missingCount || emptyCount || duplicateExactCount
      ? "ERROR"
      : duplicateUrlWcagCount
      ? "WARNING"
      : "OK",
  timestamp: new Date().toISOString(),
};

// ============================================================
// 💾 Guardar metadata-report.json extendido
// ============================================================
fs.mkdirSync(REPORTES_DIR, { recursive: true });
fs.writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    {
      resumen: dashboard.resumen,
      distribuciones: dashboard.distribuciones,
      validaciones: {
        errores: {
          campos_faltantes: issuesMissing,
          valores_vacios: issuesEmpty,
          duplicados_exactos: [...duplicatesExact],
        },
        advertencias: {
          duplicados_url_wcag: dupesUrlWcag.map(([key, count]) => ({
            key,
            count,
          })),
        },
      },
      estado: dashboard.estado_global,
      timestamp: dashboard.timestamp,
    },
    null,
    2
  ),
  "utf8"
);

console.log(chalk.cyan(`💾 Informe extendido guardado en: ${OUTPUT_FILE}`));

// ============================================================
// 🚦 Evaluación final y salida
// ============================================================
let exitCode = 0;
if (missingCount || emptyCount || duplicateExactCount) exitCode = 2;
else if (duplicateUrlWcagCount) exitCode = 1;

if (exitCode === 0)
  console.log(chalk.green("✅ Verificación de metadatos completada correctamente."));
else if (exitCode === 1)
  console.log(chalk.yellow("⚠️ Verificación completada con advertencias."));
else
  console.log(chalk.red("❌ Verificación de metadatos fallida."));

process.exit(exitCode);

