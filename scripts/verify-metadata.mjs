/**
 * ♿ verify-metadata.mjs — IAAP PRO v6.8 (versión profesional + CSV)
 * ---------------------------------------------------------------------
 * Verifica integridad del archivo merged-results.json
 * y genera metadata-report.json + metadata-report.csv.
 *
 * ✅ Comprueba campos requeridos y valores vacíos
 * ✅ Detecta y fusiona duplicados por ID o URL+WCAG
 * ✅ Mantiene todas las instancias de violaciones detectadas
 * ✅ Genera estadísticas para dashboards IAAP PRO
 * ✅ Exporta CSV listo para Looker Studio / Sheets
 * ✅ Admite modo estricto (STRICT_VALIDATION=true) para auditorías finales
 * ---------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { parse as json2csv } from "json2csv";

const ROOT = process.cwd();
const REPORTES_DIR = path.join(ROOT, "auditorias", "reportes");
const MERGED_FILE = path.join(REPORTES_DIR, "merged-results.json");
const OUTPUT_JSON = path.join(REPORTES_DIR, "metadata-report.json");
const OUTPUT_CSV = path.join(REPORTES_DIR, "metadata-report.csv");

console.log(chalk.bold.cyan("\n♿ Verificación de metadatos IAAP PRO v6.8 — profesional"));
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
// 🧩 Validación y deduplicación inteligente
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

const issuesMissing = [];
const issuesEmpty = [];
const duplicatesExact = new Set();
const grouped = {};
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

  // --- Agrupar por id + url para deduplicación ---
  const key = `${issue.id || "sin_id"}::${issue.pageUrl}`;
  if (!grouped[key]) grouped[key] = { ...issue, instances: [] };
  grouped[key].instances.push({
    selector: issue.selector,
    context: issue.context || "",
    engine: issue.engine,
  });

  if (seenIds.has(issue.id)) duplicatesExact.add(issue.id);
  else seenIds.add(issue.id);
}

// ============================================================
// 🧹 Fusionar duplicados manteniendo trazabilidad
// ============================================================
const deduped = Object.values(grouped);
const duplicatesCount = [...duplicatesExact].length;
const totalBefore = data.length;
const totalAfter = deduped.length;

console.log(chalk.gray(`🔁 Deduplicados fusionados: ${totalBefore - totalAfter}`));

// ============================================================
// 🧮 Estadísticas IAAP PRO
// ============================================================
const countBy = (field) =>
  deduped.reduce((acc, i) => {
    const key = i[field] || "sin_dato";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const total = deduped.length;
const byEngine = countBy("engine");
const bySource = countBy("source");
const byImpact = countBy("impact");
const byNivel = countBy("nivel");
const byPrincipio = countBy("principio");

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

const totalUrls = new Set(deduped.map((d) => d.pageUrl)).size;
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
if (issuesMissing.length > 0)
  console.log(chalk.red(`❌ ${issuesMissing.length} issues con campos ausentes.`));
if (issuesEmpty.length > 0)
  console.log(chalk.yellow(`⚠️ ${issuesEmpty.length} issues con valores vacíos.`));
if (duplicatesCount > 0)
  console.log(chalk.yellow(`⚠️ ${duplicatesCount} IDs duplicados fusionados.`));

if (
  issuesMissing.length === 0 &&
  issuesEmpty.length === 0 &&
  duplicatesCount === 0
) {
  console.log(chalk.green("✅ Todos los issues cumplen los requisitos de metadatos."));
}

// ============================================================
// 📊 Estructura extendida para dashboards
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
    campos_faltantes: issuesMissing.length,
    valores_vacios: issuesEmpty.length,
    duplicados_fusionados: duplicatesCount,
  },
  estado_global:
    issuesMissing.length || issuesEmpty.length
      ? "ERROR"
      : duplicatesCount
      ? "WARNING"
      : "OK",
  timestamp: new Date().toISOString(),
};

// ============================================================
// 💾 Guardar metadata-report.json
// ============================================================
fs.mkdirSync(REPORTES_DIR, { recursive: true });
fs.writeFileSync(
  OUTPUT_JSON,
  JSON.stringify(
    {
      resumen: dashboard.resumen,
      distribuciones: dashboard.distribuciones,
      validaciones: {
        errores: {
          campos_faltantes: issuesMissing,
          valores_vacios: issuesEmpty,
        },
        advertencias: {
          duplicados_fusionados: [...duplicatesExact],
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
console.log(chalk.cyan(`💾 Informe extendido guardado en: ${OUTPUT_JSON}`));

// ============================================================
// 📤 Exportar versión CSV para Looker Studio / Sheets
// ============================================================
try {
  const csvData = deduped.map((i) => ({
    id: i.id,
    url: i.pageUrl,
    motor: i.engine,
    tipo_auditoria: i.source,
    wcag: i.wcag,
    nivel: i.nivel,
    principio: i.principio,
    severidad: i.impact,
    descripcion: i.resultadoActual,
    resultado_esperado: i.resultadoEsperado,
    recomendacion: i.recomendacionW3C,
    selectores: (i.instances || []).map((s) => s.selector).join(" | "),
  }));

  const csv = json2csv(csvData);
  fs.writeFileSync(OUTPUT_CSV, csv, "utf8");
  console.log(chalk.green(`📊 CSV exportado correctamente: ${OUTPUT_CSV}`));
} catch (err) {
  console.warn(chalk.yellow(`⚠️ No se pudo generar CSV: ${err.message}`));
}

// ============================================================
// 🚦 Evaluación final y salida
// ============================================================
const strict = process.env.STRICT_VALIDATION === "true";
let exitCode = 0;

if (issuesMissing.length || issuesEmpty.length || (strict && duplicatesCount > 0)) {
  exitCode = 2;
} else if (duplicatesCount > 0) {
  exitCode = 1;
}

if (exitCode === 0)
  console.log(chalk.green("✅ Verificación de metadatos completada correctamente."));
else if (exitCode === 1)
  console.log(chalk.yellow("⚠️ Verificación completada con advertencias."));
else
  console.log(chalk.red("❌ Verificación de metadatos fallida."));

process.exit(exitCode);

