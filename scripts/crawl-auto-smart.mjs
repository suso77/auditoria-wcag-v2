/**
 * ♿ crawl-auto-smart.mjs — IAAP PRO v7.0 Smart Crawler
 * -------------------------------------------------------
 * Crawler avanzado con detección automática de:
 * - Formularios, botones, menús y componentes dinámicos
 * - Secciones interactivas (para auditoría Pa11y o Cypress)
 * - Soporte para /es/ y control de profundidad y límite
 *
 * ✅ Clasifica URLs en sitemap e interactivas
 * ✅ Detecta formularios, modales y menús dinámicos
 * ✅ Controla MAX_URLS, MAX_DEPTH, y timeout global
 * ✅ Guarda resultados en scripts/urls.json, urls-sitemap.json y urls-interactiva.json
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import chalk from "chalk";

const SITE_URL = process.env.SITE_URL || "https://example.com";
const LANG_FILTER = process.env.LANG_FILTER || "/es/";
const MAX_URLS = parseInt(process.env.MAX_URLS || "80");
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "5");
const CRAWL_DELAY = parseInt(process.env.CRAWL_DELAY || "1000");

console.log(chalk.bold.cyan("🚀 Iniciando IAAP PRO Smart Crawler v7.0"));
console.log(chalk.gray(`🌍 Sitio base: ${SITE_URL}`));
console.log(chalk.gray(`📏 Profundidad máxima: ${MAX_DEPTH}`));
console.log(chalk.gray(`🔢 Límite máximo: ${MAX_URLS}`));
console.log(chalk.gray(`🌐 Filtro de idioma: ${LANG_FILTER}`));

// ======================================================
// Timeout global de seguridad (20 minutos)
// ======================================================
setTimeout(() => {
  console.warn(chalk.yellow("⚠️ Tiempo máximo alcanzado — finalizando rastreo IAAP PRO..."));
  saveResults();
  process.exit(0);
}, 20 * 60 * 1000);

// ======================================================
// Almacenamiento de resultados
// ======================================================
const urls = new Set();
const sitemapUrls = new Set();
const interactiveUrls = new Set();
const visited = new Set();

const OUTPUT_DIR = "scripts";
const URLS_FILE = path.join(OUTPUT_DIR, "urls.json");
const SITEMAP_FILE = path.join(OUTPUT_DIR, "urls-sitemap.json");
const INTERACT_FILE = path.join(OUTPUT_DIR, "urls-interactiva.json");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ======================================================
// Función principal de rastreo
// ======================================================
async function crawl(url, depth = 0, browser) {
  if (urls.size >= MAX_URLS || depth > MAX_DEPTH) return;

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(20000);
  page.setDefaultTimeout(20000);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const currentUrl = page.url();

    // Evitar redirecciones fuera del idioma o dominio
    if (!currentUrl.includes(LANG_FILTER) || visited.has(currentUrl)) return;
    visited.add(currentUrl);
    urls.add(currentUrl);

    // Extraer enlaces internos
    const links = await page.$$eval("a[href]", (as) =>
      as
        .map((a) => a.href)
        .filter(
          (href) =>
            href.startsWith("http") &&
            href.includes(window.location.origin) &&
            !href.includes("#") &&
            !href.includes("?") &&
            !/\.(jpg|png|pdf|zip|mp4|webp)$/i.test(href)
        )
    );

    // Detección de elementos interactivos
    const hasInteractive = await page.evaluate(() => {
      const selectors = [
        "form",
        "button",
        "input:not([type=hidden])",
        "select",
        "textarea",
        "[role=button]",
        "[role=dialog]",
        "[role=menu]",
        "[aria-expanded]",
        "[aria-controls]",
        "[data-modal]",
        "[data-toggle]",
      ];
      return document.querySelector(selectors.join(",")) !== null;
    });

    // Clasificación
    if (hasInteractive) {
      interactiveUrls.add(currentUrl);
      console.log(chalk.magenta(`🧠 Interactiva detectada: ${currentUrl}`));
    } else {
      sitemapUrls.add(currentUrl);
      console.log(chalk.blue(`🌐 Sitemap detectada: ${currentUrl}`));
    }

    // Retardo para evitar bloqueos
    await new Promise((r) => setTimeout(r, CRAWL_DELAY));

    // Recursividad
    for (const link of links) {
      if (urls.size >= MAX_URLS) break;
      await crawl(link, depth + 1, browser);
    }
  } catch (err) {
    console.warn(chalk.gray(`⚠️ Error al procesar ${url}: ${err.message}`));
  } finally {
    await page.close();
  }
}

// ======================================================
// Guardar resultados
// ======================================================
function saveResults() {
  const allUrls = [...urls].map((u) => ({ url: u }));
  const sitemap = [...sitemapUrls].map((u) => ({ url: u }));
  const interactivas = [...interactiveUrls].map((u) => ({ url: u }));

  fs.writeFileSync(URLS_FILE, JSON.stringify(allUrls, null, 2), "utf8");
  fs.writeFileSync(SITEMAP_FILE, JSON.stringify(sitemap, null, 2), "utf8");
  fs.writeFileSync(INTERACT_FILE, JSON.stringify(interactivas, null, 2), "utf8");

  console.log(chalk.green(`\n✅ Rastreo completado: ${urls.size} URLs totales`));
  console.log(chalk.blue(`📄 Sitemap: ${sitemapUrls.size} URLs`));
  console.log(chalk.magenta(`🧠 Interactivas: ${interactiveUrls.size} URLs`));
  console.log(chalk.cyan(`💾 Guardado en: ${URLS_FILE}`));
}

// ======================================================
// Ejecución principal
// ======================================================
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  console.log(chalk.gray(`\n🌐 Iniciando desde: ${SITE_URL}\n`));
  await crawl(SITE_URL, 0, browser);
  saveResults();

  await browser.close();
  console.log(chalk.green("\n✅ Rastreo IAAP PRO Smart finalizado correctamente.\n"));
})();
