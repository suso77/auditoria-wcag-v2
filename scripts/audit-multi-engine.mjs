/**
 * ♿ audit-multi-engine.mjs (IAAP PRO v4.1.1)
 * ------------------------------------------------------------
 * ✅ Ejecuta auditorías con Pa11y + axe-core + WAVE (opcional)
 * ✅ Compatible con Node 18+ / ESM (sin top-level await)
 * ✅ Devuelve resultados estructurados para Cypress
 * ✅ Incluye mergeResults() para combinar múltiples auditorías
 * ✅ Elimina warnings de import.meta / esbuild
 * ------------------------------------------------------------
 */

import pa11y from "pa11y";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";

// ------------------------------------------------------------------
// Compatibilidad universal con ESM/CJS para Cypress + esbuild
// ------------------------------------------------------------------
const metaUrl =
  typeof import.meta !== "undefined" && import.meta.url
    ? import.meta.url
    : pathToFileURL(process.cwd()).href;

const __filename = fileURLToPath(metaUrl);
const __dirname = dirname(__filename);

// ================================================================
// 🧩 Ejecuta Pa11y sobre una URL
// ================================================================
async function runPa11y(url) {
  try {
    const results = await pa11y(url, {
      standard: "WCAG2AA",
      runners: ["axe", "htmlcs"],
      log: { debug: false, error: false, info: false },
      timeout: 60000,
      includeNotices: true,
      includeWarnings: true,
    });

    return results.issues.map((issue) => ({
      engine: "pa11y",
      code: issue.code,
      type: issue.type,
      message: issue.message,
      selector: issue.selector || "N/A",
      context: issue.context || "",
    }));
  } catch (err) {
    console.error(`❌ Error ejecutando Pa11y en ${url}:`, err.message);
    return [
      {
        engine: "pa11y",
        type: "error",
        message: `Pa11y falló en ${url}: ${err.message}`,
        selector: "N/A",
      },
    ];
  }
}

// ================================================================
// 🧩 Ejecuta axe-core con Puppeteer (aislado)
// ================================================================
async function runAxe(url) {
  try {
    // ✅ Import dinámico (evita bundling de Puppeteer en Cypress)
    const puppeteerModule = await import("puppeteer");
    const puppeteer = puppeteerModule.default || puppeteerModule;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const axePath = require.resolve("axe-core");
    await page.addScriptTag({ path: axePath });

    const results = await page.evaluate(async () => {
      return await axe.run();
    });

    await browser.close();

    return results.violations.map((v) => ({
      engine: "axe",
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      nodes: v.nodes.length,
    }));
  } catch (err) {
    console.warn(`⚠️ axe-core no disponible o falló: ${err.message}`);
    return [];
  }
}

// ================================================================
// 🧩 Ejecuta WAVE CLI (opcional)
// ================================================================
async function runWave(url) {
  try {
    const wavePath = path.join(__dirname, "wave-cli.json");
    if (!existsSync(wavePath)) {
      console.warn("⚠️ WAVE CLI no configurado. Saltando análisis WAVE.");
      return [];
    }

    const result = execSync(`npx wave ${url} --reportType json`).toString();
    const parsed = JSON.parse(result);

    return parsed.issues.map((i) => ({
      engine: "wave",
      type: i.type,
      description: i.description,
      selector: i.selector,
    }));
  } catch (err) {
    console.warn(`⚠️ WAVE no se ejecutó: ${err.message}`);
    return [];
  }
}

// ================================================================
// 🚀 Motor unificado — combina resultados
// ================================================================
export async function runPa11yAudit(url, options = {}) {
  const start = Date.now();
  console.log(`🚀 Iniciando auditoría múltiple para: ${url}`);

  const engines = options.engines || ["pa11y", "axe"];
  let results = [];

  if (engines.includes("pa11y")) {
    const pa11yResults = await runPa11y(url);
    results = results.concat(pa11yResults);
  }

  if (engines.includes("axe")) {
    const axeResults = await runAxe(url);
    results = results.concat(axeResults);
  }

  if (engines.includes("wave")) {
    const waveResults = await runWave(url);
    results = results.concat(waveResults);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ Auditoría completada (${results.length} issues, ${duration}s)`);

  return results;
}

// ================================================================
// 🧩 mergeResults — combina resultados de múltiples auditorías
// ================================================================
export function mergeResults(resultsArray) {
  if (!Array.isArray(resultsArray)) return [];
  return resultsArray.flatMap((r) => (Array.isArray(r) ? r : [r]));
}





