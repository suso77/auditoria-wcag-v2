/**
 * ✅ scripts/verify-pipeline.mjs
 * ------------------------------------------------------------
 * Verifica la ejecución completa del flujo de auditoría WCAG PRO.
 * Comprueba: rastreo, auditorías, merge, capturas, Excel, ZIP y resumen.
 * Muestra un informe visual y guarda resultados en auditorias/verificacion.json.
 * ------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const auditoriasDir = path.join(__dirname, "../auditorias");

function exists(file) {
  return fs.existsSync(file);
}

function logStatus(label, ok, details = "") {
  const symbol = ok ? "✅" : details ? "⚠️" : "❌";
  const color = ok ? chalk.green : details ? chalk.yellow : chalk.red;
  console.log(`${symbol} ${color(label)} ${details ? chalk.gray(details) : ""}`);
}

function countFiles(dir, ext = ".json") {
  if (!exists(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).length;
}

function safeReadJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

console.log(chalk.bold.cyan("\n♿ Verificación de flujo WCAG PRO – Ilúmina Media"));
console.log(chalk.gray("------------------------------------------------------------"));

if (!exists(auditoriasDir)) {
  console.error(chalk.red("❌ Carpeta /auditorias no encontrada. Ejecuta primero `npm run local:ci`."));
  process.exit(1);
}

const results = {};

// 1️⃣ Rastreo de URLs
const urlsFile = path.join(__dirname, "urls.json");
const urls = safeReadJSON(urlsFile);
const urlsCount = Array.isArray(urls) ? urls.length : 0;
results.urls = urlsCount;
logStatus("🌐 Rastreo de URLs", urlsCount > 0, urlsCount ? `${urlsCount} detectadas` : "sin URLs");

// 2️⃣ Auditoría Sitemap
const sitemapDir = path.join(auditoriasDir, "auditoria-sitemap");
const sitemapResults = path.join(sitemapDir, "results.json");
const sitemapData = safeReadJSON(sitemapResults);
results.sitemap = Array.isArray(sitemapData) ? sitemapData.length : 0;
logStatus("♿ Auditoría Sitemap", results.sitemap > 0, `${results.sitemap} registros`);

// 3️⃣ Auditoría Interactiva
const interactivaDir = path.join(auditoriasDir, "auditoria-interactiva");
const interactivaResults = path.join(interactivaDir, "results.json");
const interactivaData = safeReadJSON(interactivaResults);
results.interactiva = Array.isArray(interactivaData) ? interactivaData.length : 0;
logStatus("🧠 Auditoría Interactiva", results.interactiva > 0, `${results.interactiva} registros`);

// 4️⃣ Archivo combinado
const mergedFile = fs
  .readdirSync(auditoriasDir)
  .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
  .map((f) => path.join(auditoriasDir, f))
  .sort()
  .reverse()[0];
const mergedData = safeReadJSON(mergedFile || "");
const mergedCount = Array.isArray(mergedData) ? mergedData.length : 0;
results.merged = mergedCount;
logStatus("🔄 Merge de resultados", mergedCount > 0, `${mergedCount} combinados`);

// 5️⃣ Capturas de evidencias
const capturasDir = path.join(auditoriasDir, "capturas");
const capturasCount = exists(capturasDir)
  ? fs.readdirSync(capturasDir).reduce((n, folder) => {
      const sub = path.join(capturasDir, folder);
      if (fs.statSync(sub).isDirectory()) {
        n += fs.readdirSync(sub).filter((f) => f.endsWith(".png")).length;
      }
      return n;
    }, 0)
  : 0;
results.capturas = capturasCount;
logStatus("📸 Capturas de evidencias", capturasCount > 0, `${capturasCount} PNG generadas`);

// 6️⃣ Excel profesional
const excelFile = path.join(auditoriasDir, "Informe-WCAG-Profesional.xlsx");
results.excel = exists(excelFile);
logStatus("📊 Informe Excel profesional", results.excel);

// 7️⃣ ZIP profesional
const zipFile = path.join(auditoriasDir, "Informe-WCAG.zip");
results.zip = exists(zipFile);
logStatus("🗜️ Archivo ZIP final", results.zip);

// 8️⃣ Resumen ejecutivo
const resumenFile = path.join(auditoriasDir, "Resumen-WCAG.md");
results.resumen = exists(resumenFile);
logStatus("🧾 Resumen ejecutivo (Markdown)", results.resumen);

// 9️⃣ Quality Gate
const qualityFile = path.join(auditoriasDir, "logs.txt");
const qualityOK =
  exists(qualityFile) &&
  fs.readFileSync(qualityFile, "utf-8").includes("Quality Gate");
results.quality = qualityOK;
logStatus("🚦 Quality Gate", qualityOK, qualityOK ? "registro detectado" : "");

// 🔟 Consolidación
const passed =
  results.urls > 0 &&
  results.sitemap > 0 &&
  results.interactiva > 0 &&
  results.merged > 0 &&
  results.capturas > 0 &&
  results.excel &&
  results.zip &&
  results.resumen;

console.log(chalk.gray("------------------------------------------------------------"));
console.log(
  passed
    ? chalk.bold.green("✅ Auditoría completada correctamente (flujo 100% OK)")
    : chalk.bold.yellow("⚠️ Auditoría incompleta o con advertencias")
);

// Guardar resumen JSON
const outputFile = path.join(auditoriasDir, "verificacion.json");
fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

console.log(chalk.gray("------------------------------------------------------------"));
console.log(chalk.cyan(`💾 Informe de verificación guardado en: ${outputFile}\n`));
