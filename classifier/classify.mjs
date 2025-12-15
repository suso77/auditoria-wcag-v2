#!/usr/bin/env node
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

// ---------------------------
// CONFIG
// ---------------------------
const INPUT_FILE = "./scripts/urls.json";
const OUTPUT_SITEMAP = "./scripts/urls-sitemap.json";
const OUTPUT_INTERACTIVE = "./scripts/urls-interactive.json";
const CHROME_PROFILE_DIR = path.join(process.cwd(), ".chrome-classifier-profile");

fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

console.log("\n🚀 CLASIFICADOR WCAG – Sitemap vs Interactiva");

// ---------------------------
// 1. Cargar URLs
// ---------------------------
if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ ERROR: No existe ${INPUT_FILE}`);
  process.exit(1);
}

let urls = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!Array.isArray(urls)) {
  console.error("❌ ERROR: urls.json no es un array.");
  process.exit(1);
}

console.log(`📥 URLs cargadas: ${urls.length}`);

// ---------------------------
// 2. Función para detectar elementos interactivos
// ---------------------------
async function analyzeURL(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });

    return await page.evaluate(() => {
      const reasons = [];

      // Formularios reales
      if (document.querySelector("form")) reasons.push("form-real");

      // Tabs
      if (document.querySelector('[role="tab"]')) reasons.push("tabs-real");

      // Acordeones
      if (document.querySelector('[aria-expanded]')) reasons.push("accordion-real");

      // Elementos dinámicos (cambios en DOM)
      const dynamic = document.querySelector(".is-active, .open, .expanded, .collapsed");
      if (dynamic) reasons.push("dom-dinamico");

      return reasons;
    });

  } catch (err) {
    console.error(`❌ Error analizando ${url}: ${err.message}`);
    return ["error-loading"];
  }
}

// ---------------------------
// 3. Clasificación
// ---------------------------
const sitemap = [];
const interactive = [];

let browser = null;

(async () => {
  browser = await puppeteer.launch({
    headless: true,
    userDataDir: CHROME_PROFILE_DIR,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-breakpad",
      "--disable-crash-reporter",
      "--disable-crashpad",
      "--disable-features=Crashpad",
      "--disable-extensions",
    ]
  });

  const page = await browser.newPage();

  for (const entry of urls) {
    // ✔️ Acepta BOTH formatos: "string" o { url: "string" }
    const url = typeof entry === "string" ? entry : entry.url;

    if (!url || typeof url !== "string") {
      console.warn(`⚠️ URL inválida encontrada y omitida:`, entry);
      continue;
    }

    console.log(`🔍 Analizando → ${url}`);

    const reasons = await analyzeURL(page, url);

    if (reasons.length > 0) {
      interactive.push({ url, reasons });
    } else {
      sitemap.push({ url, reasons: [] });
    }
  }

  await browser.close();

  // ---------------------------
  // 4. Guardar archivos
  // ---------------------------
  fs.writeFileSync(OUTPUT_SITEMAP, JSON.stringify(sitemap, null, 2));
  fs.writeFileSync(OUTPUT_INTERACTIVE, JSON.stringify(interactive, null, 2));

  console.log("\n📄 Sitemap:", sitemap.length, "URLs");
  console.log("⚡ Interactivas:", interactive.length, "URLs");

  console.log("💾 Guardado en /scripts");
  console.log("🎉 Clasificación completada.\n");

})();
