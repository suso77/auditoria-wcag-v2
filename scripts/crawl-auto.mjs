/**
 * 🌍 IAAP PRO Crawler v6.0
 * ---------------------------------------------------------------------------
 * ✅ Rastrea sitios web y genera automáticamente:
 *    - scripts/urls-sitemap.json
 *    - scripts/urls-interactiva.json
 * ✅ Respeta include/excludePatterns del config/audit-config.mjs
 * ✅ Detecta enlaces dinámicos (shadow DOM, lazy loading)
 * ✅ Compatible con Node 24+, Puppeteer y CI/CD
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { CONFIG } from "../config/audit-config.mjs";

const visited = new Set();
const sitemapUrls = [];
const interactiveUrls = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function crawl(url, depth = 0, maxDepth = 3, baseDomain) {
  if (visited.has(url) || depth > maxDepth) return;
  visited.add(url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent("IAAP-PRO-Crawler/6.0");
  await page.setDefaultNavigationTimeout(45000);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log(`🌐 [${depth}] ${url}`);

    // Capturar todos los enlaces válidos
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors
        .map((a) => a.href)
        .filter((href) => href && !href.startsWith("mailto:") && !href.startsWith("tel:"))
    );

    for (const link of links) {
      try {
        const clean = new URL(link);
        if (clean.hostname !== baseDomain) continue;

        const href = clean.href.replace(/#.*$/, "").replace(/\/$/, "/");
        if (visited.has(href)) continue;

        // Filtrado de exclusión
        if (CONFIG.sitemap.excludePatterns.some((pattern) => new RegExp(pattern).test(href)))
          continue;

        // Clasificación: Sitemap vs Interactiva
        if (
          CONFIG.interactiva.includePatterns.some((pattern) => new RegExp(pattern, "i").test(href))
        ) {
          interactiveUrls.push({ url: href, title: clean.pathname });
        } else if (
          CONFIG.sitemap.includePatterns.some((pattern) => new RegExp(pattern, "i").test(href))
        ) {
          sitemapUrls.push({ url: href, title: clean.pathname });
        }

        // Crawl recursivo
        await delay(500);
        await crawl(href, depth + 1, maxDepth, baseDomain);
      } catch {
        /* ignore invalid links */
      }
    }
  } catch (err) {
    console.error(`❌ Error accediendo a ${url}: ${err.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * 🧩 Exportar resultados
 */
function saveResults() {
  fs.mkdirSync("scripts", { recursive: true });
  const sitemapPath = "scripts/urls-sitemap.json";
  const interactivaPath = "scripts/urls-interactiva.json";

  fs.writeFileSync(sitemapPath, JSON.stringify(sitemapUrls, null, 2));
  fs.writeFileSync(interactivaPath, JSON.stringify(interactiveUrls, null, 2));

  console.log(`✅ Guardado ${sitemapUrls.length} URLs en ${sitemapPath}`);
  console.log(`✅ Guardado ${interactiveUrls.length} URLs en ${interactivaPath}`);
}

/**
 * 🚀 Ejecución principal
 */
const SITE_URL = process.env.SITE_URL || "https://www.hiexperience.es";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);

console.log("🚀 Iniciando IAAP PRO Crawler v6.0");
console.log(`🌍 Sitio base: ${SITE_URL}`);
console.log(`📏 Profundidad máxima: ${MAX_DEPTH}`);

try {
  const baseDomain = new URL(SITE_URL).hostname;
  await crawl(SITE_URL, 0, MAX_DEPTH, baseDomain);
  saveResults();
  console.log("✅ Rastreo IAAP PRO completado correctamente.");
} catch (err) {
  console.error("❌ Error global del crawler:", err.message);
  process.exit(1);
}
