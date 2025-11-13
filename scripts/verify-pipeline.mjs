/**
 * ♿ verify-pipeline.mjs — IAAP PRO v6.5 (versión profesional)
 * ------------------------------------------------------------
 * Verifica la ejecución completa del flujo Ilúmina Audit IAAP PRO.
 * Incluye:
 *  - Validación de motores (axe-core / Pa11y)
 *  - Coherencia entre auditorías y merge
 *  - Verificación de archivos de salida
 *  - Generación de informe JSON con estado final
 * ------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auditoriasDir = path.join(__dirname, "../auditorias");
const reportesDir = path.join(auditoriasDir, "reportes");
const cypressDir = path.join(__dirname, "../cypress/e2e");

// =============================================================
// 🔹 Utilidades
// =============================================================
const exists = (file) => fs.existsSync(file);
const safeReadJSON = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const countPng = (dir) => {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".png")).length;
  } catch {
    return 0;
  }
};
const logStatus = (label, ok, details = "", severity = "info") => {
  const icon = ok ? "✅" : severity === "warn" ? "⚠️" : "❌";
  const color =
    ok ? chalk.green : severity === "warn" ? chalk.yellow : chalk.red;
  console.log(`${icon} ${color(label)} ${details ? chalk.gray(details) : ""}`);
};

// =============================================================
// 🚀 Inicio de verificación
// =============================================================
console.log(chalk.bold.cyan("\n♿ Verificación del Pipeline – IAAP PRO v6.5"));
console.log(chalk.gray("------------------------------------------------------------"));

if (!exists(auditoriasDir)) {
  console.error(chalk.red("❌ No existe la carpeta /auditorias. Ejecuta la auditoría primero."));
  process.exit(2);
}

const results = {};

// =============================================================
// 0️⃣ Especificaciones Cypress
// =============================================================
const specs = [
  "accesibilidad-sitemap-hibrido.cy.js",
  "accesibilidad-interactiva-hibrida.cy.js",
];
const missingSpecs = specs.filter((s) => !exists(path.join(cypressDir, s)));
specs.forEach((s) =>
  logStatus(
    `🧩 Especificación Cypress: ${s}`,
    !missingSpecs.includes(s),
    !missingSpecs.includes(s) ? "detectada" : "no encontrada",
    !missingSpecs.includes(s) ? "info" : "error"
  )
);
results.specs = specs.length - missingSpecs.length;

// =============================================================
// 1️⃣ URLs rastreadas
// =============================================================
const urlsFile = path.join(__dirname, "../scripts/urls.json");
const urlsData = safeReadJSON(urlsFile);
const urlsCount = Array.isArray(urlsData) ? urlsData.length : 0;
results.urls = urlsCount;
logStatus(
  "🌍 Rastreo de URLs",
  urlsCount > 0,
  `${urlsCount} detectadas`,
  urlsCount > 0 ? "info" : "error"
);

// =============================================================
// 2️⃣ Auditoría Sitemap (solo axe-core permitido)
// =============================================================
const sitemapFile = path.join(auditoriasDir, "auditoria-sitemap/results.json");
const sitemapData = safeReadJSON(sitemapFile) || [];
const sitemapCount = Array.isArray(sitemapData) ? sitemapData.length : 0;
const sitemapEngines = [
  ...new Set(sitemapData.map((i) => (i.engine || "").toLowerCase())),
];
const sitemapHasPa11y = sitemapEngines.includes("pa11y");
const sitemapOnlyAxe =
  sitemapCount > 0 && sitemapEngines.length === 1 && sitemapEngines[0] === "axe-core";

results.sitemap = sitemapCount;
logStatus("♿ Auditoría Sitemap", sitemapCount > 0, `${sitemapCount} issues`, sitemapCount ? "info" : "warn");
logStatus(
  "🧠 Motor Sitemap (solo axe-core)",
  sitemapOnlyAxe,
  sitemapOnlyAxe
    ? "solo axe-core detectado (correcto)"
    : sitemapHasPa11y
    ? `Pa11y detectado (incorrecto)`
    : `motores detectados: ${sitemapEngines.join(", ")}`,
  sitemapOnlyAxe ? "info" : "error"
);

// =============================================================
// 3️⃣ Auditoría Interactiva (Pa11y + fallback axe-core)
// =============================================================
const interFile = path.join(auditoriasDir, "auditoria-interactiva/results.json");
const interData = safeReadJSON(interFile) || [];
const interCount = Array.isArray(interData) ? interData.length : 0;
const interEngines = [
  ...new Set(interData.map((i) => (i.engine || "").toLowerCase())),
];
const interHasAxe = interEngines.includes("axe-core");
const interHasPa11y = interEngines.includes("pa11y");
const interHybrid = interCount > 0 && interHasPa11y && (interHasAxe || interEngines.length === 1);

results.interactiva = interCount;
logStatus("🧩 Auditoría Interactiva", interCount > 0, `${interCount} issues`, interCount ? "info" : "warn");
logStatus(
  "🔀 Motores Interactiva (Pa11y + axe-core)",
  interHybrid,
  interHybrid
    ? `motores detectados: ${interEngines.join(", ")}`
    : `faltan motores: ${
        !interHasPa11y && !interHasAxe
          ? "ninguno detectado"
          : !interHasPa11y
          ? "Pa11y"
          : "axe-core"
      }`,
  interHybrid ? "info" : "error"
);

// =============================================================
// 4️⃣ Revisiones manuales
// =============================================================
const manualFile = path.join(auditoriasDir, "needs_review.json");
const manualData = safeReadJSON(manualFile);
const manualCount = Array.isArray(manualData) ? manualData.length : 0;
results.manual = manualCount;
logStatus("🖐️ Revisiones Manuales", manualCount > 0, `${manualCount} pendientes`, "info");

// =============================================================
// 5️⃣ Merge y consistencia IAAP PRO
// =============================================================
const mergedFile = path.join(reportesDir, "merged-results.json");
const mergedData = safeReadJSON(mergedFile) || [];
const mergedCount = Array.isArray(mergedData) ? mergedData.length : 0;
const mergedSources = [...new Set(mergedData.map((i) => i.source))];
const mergedEngines = [...new Set(mergedData.map((i) => i.engine))];

const hasBothSources =
  mergedSources.includes("sitemap") && mergedSources.includes("interactiva");
const hasBothEngines =
  mergedEngines.includes("axe-core") && mergedEngines.includes("pa11y");

const mergeCoverage =
  sitemapCount + interCount > 0
    ? ((mergedCount / (sitemapCount + interCount)) * 100).toFixed(1)
    : 0;

results.merged = mergedCount;
logStatus(
  "🔄 Merge de resultados",
  mergedCount > 0,
  `${mergedCount} combinados (${mergeCoverage}% cobertura)`,
  mergedCount ? "info" : "warn"
);
logStatus(
  "🧩 Fuentes en Merge",
  hasBothSources,
  hasBothSources ? mergedSources.join(", ") : "faltan fuentes",
  hasBothSources ? "info" : "warn"
);
logStatus(
  "⚙️ Motores en Merge",
  hasBothEngines,
  hasBothEngines ? mergedEngines.join(", ") : "faltan motores",
  hasBothEngines ? "info" : "warn"
);

// =============================================================
// 6️⃣ Capturas
// =============================================================
const capturasDir = path.join(auditoriasDir, "capturas");
const capturasCount = countPng(capturasDir);
results.capturas = capturasCount;
logStatus(
  "📸 Capturas de evidencias",
  capturasCount > 0,
  `${capturasCount} PNG`,
  capturasCount ? "info" : "warn"
);

// =============================================================
// 7️⃣ Exportaciones
// =============================================================
const excelFile = path.join(auditoriasDir, "Resumen-WCAG.xlsx");
const resumenFile = path.join(auditoriasDir, "Resumen-WCAG.md");
results.excel = exists(excelFile);
results.resumen = exists(resumenFile);
logStatus("📊 Informe Excel IAAP PRO", results.excel, "", results.excel ? "info" : "warn");
logStatus("🧾 Resumen Markdown", results.resumen, "", results.resumen ? "info" : "warn");

// =============================================================
// 🔟 Evaluación final IAAP PRO
// =============================================================
let exitCode = 0;

// 🚫 Errores críticos
if (
  missingSpecs.length ||
  !results.urls ||
  !results.merged ||
  (!results.sitemap && !results.interactiva) ||
  !sitemapOnlyAxe ||
  !hasBothSources ||
  !hasBothEngines
) {
  exitCode = 2;
}

// ⚠️ Advertencias
else if (
  !results.excel ||
  !results.resumen ||
  !results.capturas ||
  mergeCoverage < 70
) {
  exitCode = 1;
}

console.log(chalk.gray("------------------------------------------------------------"));
if (exitCode === 0)
  console.log(chalk.bold.green("✅ Pipeline IAAP PRO v6.5 completado correctamente."));
else if (exitCode === 1)
  console.log(chalk.bold.yellow("⚠️ Pipeline IAAP PRO v6.5 completado con advertencias."));
else
  console.log(chalk.bold.red("❌ Pipeline IAAP PRO v6.5 incompleto o con errores."));

results.status = exitCode === 0 ? "OK" : exitCode === 1 ? "WARNING" : "ERROR";
results.timestamp = new Date().toISOString();
results.summary = {
  urls: urlsCount,
  sitemap: sitemapCount,
  interactiva: interCount,
  manual: manualCount,
  merged: mergedCount,
  mergeCoverage: `${mergeCoverage}%`,
  mergedEngines,
  mergedSources,
};

// =============================================================
// 💾 Guardar verificación
// =============================================================
try {
  fs.mkdirSync(reportesDir, { recursive: true });
  const output = path.join(reportesDir, "verificacion.json");
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(chalk.cyan(`💾 Informe guardado en: ${output}`));
  console.log(chalk.gray(`📤 Estado final: ${results.status} (exitCode ${exitCode})\n`));
} catch (err) {
  console.error(chalk.red(`❌ Error al guardar verificación: ${err.message}`));
}

process.exit(exitCode);
