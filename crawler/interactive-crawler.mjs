import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const RAW_LANG_FILTER = (process.env.LANG_FILTER || "").trim();
const LANG_MATCHERS = buildLangMatchers(RAW_LANG_FILTER);
const INPUT = path.resolve("./scripts/sitemap-final.json");
const OUTPUT = path.resolve("./scripts/interactive-analysis.json");
const CHROME_PROFILE_DIR = path.resolve(".chrome-interactive-profile");

fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });

if (!fs.existsSync(INPUT)) {
  console.error("❌ ERROR: No existe sitemap-final.json. Ejecuta antes:");
  console.error("   node crawler/sitemap-crawler.mjs");
  console.error("   node crawler/sitemap-normalizer.mjs");
  process.exit(1);
}

const rawInput = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const urls = normalizeUrls(rawInput);
const filteredUrls = filterByLanguage(urls);

console.log("🚀 IAAP INTERACTIVE CRAWLER – v1.0");
console.log(`📥 URLs cargadas: ${urls.length}`);
if (RAW_LANG_FILTER) {
  console.log(`🔎 Filtro de idioma: ${RAW_LANG_FILTER}`);
  console.log(`📥 URLs tras filtro: ${filteredUrls.length}`);
}

function buildLangMatchers(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();

      if (lower.startsWith("http")) {
        return (urlObj) => urlObj.href.toLowerCase().startsWith(lower);
      }

      if (lower.includes("=")) {
        const [param, value] = lower.split("=");
        if (!param || !value) return null;
        return (urlObj) =>
          urlObj.searchParams.get(param)?.toLowerCase() === value;
      }

      const normalized = lower.replace(/^\/+|\/+$/g, "");
      if (!normalized) return null;
      return (urlObj) => {
        const segments = urlObj.pathname.toLowerCase().split("/").filter(Boolean);
        return segments.includes(normalized);
      };
    })
    .filter(Boolean);
}

function normalizeUrls(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => (typeof entry === "string" ? entry : entry?.url))
    .filter(Boolean);
}

function toURL(target) {
  try {
    return new URL(target);
  } catch {
    return null;
  }
}

function matchesLang(url) {
  if (LANG_MATCHERS.length === 0) return true;
  const parsed = toURL(url);
  if (!parsed) return false;
  return LANG_MATCHERS.some((matcher) => matcher(parsed));
}

function filterByLanguage(list) {
  if (LANG_MATCHERS.length === 0) return list;
  const filtered = list.filter(matchesLang);
  if (filtered.length === 0) {
    console.warn(
      `⚠️ No se encontraron URLs con el filtro "${RAW_LANG_FILTER}". Se procesarán todas las URLs disponibles.`
    );
    return list;
  }
  return filtered;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Detecta si un selector aparece y es visible
async function isVisible(page, selector) {
  try {
    return await page.$eval(selector, (el) => {
      const style = window.getComputedStyle(el);
      return style && style.display !== "none" && style.visibility !== "hidden";
    });
  } catch {
    return false;
  }
}

// Detección de interactividad REAL
async function detectInteractivity(page) {
  const reasons = [];

  // FORMULARIOS REALES
  const formCount = await page.$$eval("form", (forms) =>
    forms.filter((f) => f.querySelector("input, select, textarea, button")).length
  );
  if (formCount > 0) reasons.push("form-interactivo");

  // TABS REALES
  if (
    await isVisible(page, "[role='tab']") ||
    await isVisible(page, ".tabs, .tab, .tab-item")
  ) {
    reasons.push("tabs-reales");
  }

  // ACORDEONES REALES
  if (
    await isVisible(page, "details") ||
    await isVisible(page, ".accordion, .accordion-item, .accordion-header")
  ) {
    reasons.push("acordeon-real");
  }

  // MODALES REALES
  if (
    await isVisible(page, "[role='dialog']") ||
    await isVisible(page, ".modal, .popup, .dialog")
  ) {
    reasons.push("modal-real");
  }

  // CAMBIOS DE DOM AUTOMÁTICOS (SPA, AJAX, dynamics)
  const bodyBefore = await page.evaluate(() => document.body.innerText.length);
  await delay(1500);
  const bodyAfter = await page.evaluate(() => document.body.innerText.length);

  if (Math.abs(bodyAfter - bodyBefore) > 50) {
    reasons.push("dom-dinamico");
  }

  return reasons;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
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
    ],
  });

  const page = await browser.newPage();
  const interactive = [];
  const sitemapOnly = [];

  for (const url of filteredUrls) {
    console.log(`🔍 Analizando interactividad: ${url}`);

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    } catch (e) {
      console.warn(`⚠️ Error al cargar ${url}:`, e.message);
      sitemapOnly.push({ url, reasons: ["error-carga"] });
      continue;
    }

    const reasons = await detectInteractivity(page);

    if (reasons.length > 0) {
      interactive.push({ url, reasons });
    } else {
      sitemapOnly.push({ url, reasons: [] });
    }
  }

  await browser.close();

  const result = {
    generatedAt: new Date().toISOString(),
    urls: filteredUrls.length,
    interactiveCount: interactive.length,
    sitemapCount: sitemapOnly.length,
    interactive,
    sitemapOnly
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");

  console.log("");
  console.log("📄 Interactivas:", interactive.length);
  console.log("📄 Solo Sitemap:", sitemapOnly.length);
  console.log(`💾 Guardado en: ${OUTPUT}`);
  console.log("🎉 IAAP Interactive Crawler finalizado.");
})();
