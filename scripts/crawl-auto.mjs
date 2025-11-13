/**
 * 🌍 IAAP PRO Crawler v6.7 – Compatibilidad con GitHub Actions
 * ---------------------------------------------------------------------------
 * ✅ Lee variables de entorno LANG_FILTER y MAX_URLS
 * ✅ Filtra por idioma (por ejemplo "/es/")
 * ✅ Límite de URLs configurable (por defecto 80)
 * ✅ Compatible con Node 24+, Puppeteer y CI/CD
 */

import fs from "fs";
import puppeteer from "puppeteer";

const START_URL = process.env.SITE_URL || "https://www.hiexperience.es";
const MAX_URLS = parseInt(process.env.MAX_URLS || "80", 10);
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const LANG_FILTER = process.env.LANG_FILTER || null;

let languageFilter = LANG_FILTER || "/es/"; // valor por defecto si no se pasa
const visited = new Set();
const results = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 🔎 Detectar idioma principal si no se forzó LANG_FILTER
 */
async function detectLanguagePath(baseDomain) {
  if (LANG_FILTER) {
    console.log(`🌐 Filtro de idioma forzado desde entorno: ${LANG_FILTER}`);
    return;
  }

  console.log("🧠 Detectando idioma principal automáticamente...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.goto(START_URL, { waitUntil: "domcontentloaded" });

  const links = await page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => a.href).filter((href) => href && href.includes("/"))
  );

  await browser.close();

  const matches = links.filter((l) => /\/(es|en|fr|de|pt|it)\//i.test(l));
  if (matches.length > 0) {
    const sample = matches[0];
    const langMatch = sample.match(/\/(es|en|fr|de|pt|it)\//i);
    if (langMatch) {
      languageFilter = `/${langMatch[1].toLowerCase()}/`;
      console.log(`🌐 Idioma detectado automáticamente: ${languageFilter}`);
    }
  } else {
    console.log("⚠️ No se detectó idioma. Se usará /es/ por defecto.");
  }
}

/**
 * 🔁 Rastreo recursivo con filtrado
 */
async function crawl(url, depth = 0, baseDomain) {
  if (visited.size >= MAX_URLS) return;
  if (visited.has(url) || depth > MAX_DEPTH) return;

  visited.add(url);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent("IAAP-PRO-Crawler/6.7");
  await page.setDefaultNavigationTimeout(45000);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log(`🌐 [${depth}] ${url}`);

    // Guardar solo si pertenece al idioma filtrado
    if (url.includes(languageFilter)) {
      const title = (await page.title()) || "(sin título)";
      results.push({ url, title });
    }

    const links = await page.$$eval("a[href]", (anchors) =>
      anchors
        .map((a) => a.href)
        .filter(
          (href) =>
            href &&
            !href.startsWith("mailto:") &&
            !href.startsWith("tel:") &&
            !href.startsWith("javascript:")
        )
    );

    for (const link of links) {
      if (visited.size >= MAX_URLS) break;
      try {
        const clean = new URL(link);
        if (clean.hostname !== baseDomain) continue;

        const href = clean.href.replace(/#.*$/, "").replace(/\/$/, "/");
        if (!href.includes(languageFilter)) continue;
        if (visited.has(href)) continue;

        await delay(300);
        await crawl(href, depth + 1, baseDomain);
      } catch {
        /* ignorar */
      }
    }
  } catch (err) {
    console.error(`❌ Error accediendo a ${url}: ${err.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * 💾 Guardar resultados
 */
function saveResults() {
  fs.mkdirSync("scripts", { recursive: true });
  fs.writeFileSync("scripts/urls.json", JSON.stringify(results.slice(0, MAX_URLS), null, 2));
  console.log(`\n✅ Rastreo completado: ${results.length} URLs guardadas en scripts/urls.json`);
}

/**
 * 🚀 Ejecución principal
 */
console.log("🚀 Iniciando IAAP PRO Crawler v6.7");
console.log(`🌍 Sitio base: ${START_URL}`);
console.log(`📏 Profundidad máxima: ${MAX_DEPTH}`);
console.log(`🔢 Límite máximo: ${MAX_URLS}`);
if (LANG_FILTER) console.log(`🌐 Filtro de idioma forzado: ${LANG_FILTER}\n`);

try {
  const baseDomain = new URL(START_URL).hostname;
  await detectLanguagePath(baseDomain);
  await crawl(START_URL, 0, baseDomain);
  saveResults();
  console.log("✅ Rastreo IAAP PRO finalizado correctamente.");
} catch (err) {
  console.error("❌ Error global del crawler:", err.message);
  process.exit(1);
}
