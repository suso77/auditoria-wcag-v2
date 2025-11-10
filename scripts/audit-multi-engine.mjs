/**
 * ♿ audit-multi-engine.mjs (IAAP PRO v4.16-H4 - ESM Compatible)
 * ------------------------------------------------------------
 * ✅ Ejecuta auditorías Pa11y + axe-core (paralelo por URL)
 * ✅ Carga URLs desde scripts/urls.json
 * ✅ Guarda resultados en auditorias/pa11y-results.json
 * ✅ Compatible con Node 18+, GitHub Actions, Docker
 * ✅ Logs a color, tiempos y resumen IAAP PRO
 * ✅ Soluciona el error “require is not defined” en ESM
 * ✅ Cierre limpio del navegador y compatibilidad total CI
 * ------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import pa11y from "pa11y";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// ================================================================
// 🔧 Configuración base
// ================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const urlsFile = path.join(__dirname, "../scripts/urls.json");
const outputDir = path.join(__dirname, "../auditorias");
const outputPath = path.join(outputDir, "pa11y-results.json");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ================================================================
// 🧩 Auditoría con Pa11y (HTML_CodeSniffer)
// ================================================================
async function runPa11y(url) {
  try {
    const results = await pa11y(url, {
      standard: "WCAG2AA",
      timeout: 60000,
      runners: ["htmlcs"],
      includeNotices: true,
      includeWarnings: true,
      log: {
        debug: () => {},
        error: () => {},
        info: () => {},
      },
    });

    return results.issues.map((i) => ({
      engine: "pa11y",
      code: i.code,
      type: i.type,
      message: i.message,
      selector: i.selector || "",
      context: i.context || "",
      wcag: i.code?.match(/WCAG\d+\.[0-9.]+/)?.[0] || "N/A",
    }));
  } catch (err) {
    console.log(chalk.red(`❌ Pa11y falló en ${url}: ${err.message}`));
    return [];
  }
}

// ================================================================
// 🧠 Auditoría con axe-core (vía Puppeteer, ESM + Node >=18)
// ================================================================
async function runAxe(url) {
  let browser;
  try {
    const puppeteerModule = await import("puppeteer");
    const puppeteer = puppeteerModule.default || puppeteerModule;

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // ✅ Cargar axe-core correctamente en entorno ESM
    const axePath = require.resolve("axe-core");
    await page.addScriptTag({ path: axePath });

    // ♿ Ejecutar auditoría en el contexto del navegador
    const results = await page.evaluate(async () => {
      const axeConfig = {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
        },
        resultTypes: ["violations"],
      };

      // Esperar un poco para que todo el DOM esté listo
      await new Promise((r) => setTimeout(r, 500));
      return await axe.run(document, axeConfig);
    });

    return results.violations.map((v) => ({
      engine: "axe-core",
      id: v.id,
      impact: v.impact || "unknown",
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes?.length || 0,
      wcag: v.tags?.find((t) => t.startsWith("wcag")) || "N/A",
    }));
  } catch (err) {
    console.log(chalk.yellow(`⚠️ axe-core falló en ${url}: ${err.message}`));
    return [];
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ================================================================
// 🚀 Ejecución principal IAAP PRO
// ================================================================
async function main() {
  console.log(chalk.bold.cyan("\n♿ Auditoría Multi-Engine – IAAP PRO v4.16-H4"));
  if (!fs.existsSync(urlsFile)) {
    console.log(chalk.red(`❌ No se encontró ${urlsFile}`));
    process.exit(1);
  }

  const urls = JSON.parse(fs.readFileSync(urlsFile, "utf8")).filter((u) => u && u.url);
  if (urls.length === 0) {
    console.log(chalk.yellow("⚠️ No hay URLs válidas en scripts/urls.json"));
    process.exit(0);
  }

  console.log(chalk.blue(`🌍 ${urls.length} URLs cargadas para auditoría.`));

  const allResults = [];
  const startGlobal = Date.now();

  for (let i = 0; i < urls.length; i++) {
    const { url } = urls[i];
    console.log(chalk.white(`\n🧩 [${i + 1}/${urls.length}] Auditando:`), chalk.green(url));

    const start = Date.now();
    const [pa11yResults, axeResults] = await Promise.all([
      runPa11y(url),
      runAxe(url),
    ]);

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    const total = pa11yResults.length + axeResults.length;

    console.log(
      total > 0
        ? chalk.yellow(`✅ ${total} hallazgos combinados (${duration}s)`)
        : chalk.green(`✅ Sin hallazgos (${duration}s)`)
    );

    allResults.push({
      page: url,
      total_issues: total,
      issues: [...pa11yResults, ...axeResults],
      date: new Date().toISOString(),
      origen: "multi-engine",
      system: "Pa11y + axe-core (IAAP PRO)",
    });
  }

  const durationTotal = ((Date.now() - startGlobal) / 1000 / 60).toFixed(1);
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf8");

  console.log(chalk.bold.green(`\n💾 Resultados guardados en ${outputPath}`));
  console.log(
    chalk.bold.magenta(`📊 Total páginas: ${allResults.length} | Tiempo total: ${durationTotal} min`)
  );

  const totalIssues = allResults.reduce((a, r) => a + r.total_issues, 0);
  console.log(chalk.bold.cyan(`🎯 Auditoría completa: ${totalIssues} hallazgos totales\n`));
}

// ================================================================
// 🏁 Ejecutar directamente
// ================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => console.error(chalk.red(`❌ Error general: ${err.message}`)));
}

