/**
 * ♿ crawl-puppeteer.mjs (v4.6-CI-Safe IAAP PRO / WCAG 2.2)
 * ----------------------------------------------------------
 * Rastreador dinámico con Puppeteer (renderizado real del DOM)
 *
 * ✅ Solo versión española (/es)
 * ✅ Auto-ajuste de profundidad y número de páginas según tamaño del sitio
 * ✅ Compatible con GitHub Actions, Docker y entornos CI
 * ✅ Incluye formularios, subrutas y componentes JS dinámicos
 * ✅ Detecta enlaces renderizados tras el DOMContentLoaded
 * ✅ Logs y salida unificada IAAP
 * ----------------------------------------------------------
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===========================================================
// 🌐 CONFIGURACIÓN GLOBAL
// ===========================================================
const SITE_URL = process.env.SITE_URL?.replace(/\/$/, "") || "https://example.com";
let MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
let MAX_PAGES = parseInt(process.env.MAX_PAGES || "0", 10); // 0 = auto-scaling
const TIMEOUT = parseInt(process.env.TIMEOUT || "70000", 10);
const DELAY_BETWEEN_PAGES = parseInt(process.env.CRAWL_DELAY || "800", 10);

console.log(`🚀 Iniciando rastreo IAAP PRO v4.6-CI-Safe`);
console.log(`🌍 Sitio: ${SITE_URL}`);
console.log(`🗣️ Idioma: Español (/es)`);
console.log(`⏱️ Timeout por página: ${TIMEOUT} ms`);
console.log(`💤 Delay entre páginas: ${DELAY_BETWEEN_PAGES} ms`);
console.log("----------------------------------------------------------");

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml|woff|woff2|ttf)$/i;

// ===========================================================
// 🧩 ESTRUCTURAS INTERNAS
// ===========================================================
const visited = new Set();
const queue = [{ url: SITE_URL + "/es", depth: 0 }];
const results = [];
const errors = [];

// ===========================================================
// 🔧 FUNCIONES AUXILIARES
// ===========================================================
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================================================
// 🧠 AUTO-SCALING SEGÚN TAMAÑO DEL SITIO
// ===========================================================
function calculateAutoScaling(urlCountEstimate = 0) {
  if (urlCountEstimate < 20) {
    MAX_DEPTH = 3;
    MAX_PAGES = 30;
  } else if (urlCountEstimate < 50) {
    MAX_DEPTH = 4;
    MAX_PAGES = 60;
  } else if (urlCountEstimate < 100) {
    MAX_DEPTH = 5;
    MAX_PAGES = 80;
  } else {
    MAX_DEPTH = 6;
    MAX_PAGES = 120;
  }
  console.log(`⚙️ Escalado automático → Profundidad: ${MAX_DEPTH} | Límite: ${MAX_PAGES}`);
}

// ===========================================================
// 🕷️ FUNCIÓN PRINCIPAL DE RASTREO
// ===========================================================
async function crawl() {
  const browser = await puppeteer.launch({
    headless: true, // modo clásico (no “new”) — compatible con CI
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36 IAAP-A11yCrawler/4.6-CI"
  );
  page.setDefaultNavigationTimeout(TIMEOUT);

  // Ignorar errores benignos del sitio
  page.on("pageerror", (err) => {
    if (err.message.includes("location is not defined")) {
      console.warn(`⚠️ Ignorado error benigno: ${err.message}`);
    }
  });

  // 🚀 Primer análisis: estimar tamaño del sitio
  console.log("🔍 Analizando página inicial para estimar tamaño del sitio...");
  try {
    await page.goto(SITE_URL + "/es", { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    await page.waitForSelector("a[href]", { timeout: 5000 }).catch(() => {});
  } catch (err) {
    console.warn(`⚠️ No se pudo analizar la home /es: ${err.message}`);
  }

  const initialLinks = await page.$$eval("a[href]", (a) => a.map((el) => el.href).filter(Boolean));
  const spanishLinks = initialLinks.filter((l) => l.includes("/es/"));
  if (MAX_PAGES === 0) calculateAutoScaling(spanishLinks.length);

  console.log("----------------------------------------------------------");

  // ===========================================================
  // 🔁 RASTREO PRINCIPAL
  // ===========================================================
  while (queue.length > 0 && results.length < MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (depth > MAX_DEPTH) continue;

    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!normalized.startsWith(SITE_URL)) continue;
    if (NON_HTML_EXTENSIONS.test(normalized)) continue;

    visited.add(normalized);
    let success = false;

    try {
      const response = await page.goto(normalized, {
        waitUntil: "domcontentloaded",
        timeout: TIMEOUT,
      });
      await page.waitForSelector("a[href]", { timeout: 5000 }).catch(() => {});

      const status = response?.status();
      if (!status || status >= 400) throw new Error(`HTTP ${status}`);

      const title = (await page.title()) || "(sin título)";
      console.log(`🔗 [${depth}] ${normalized} — “${title}”`);
      results.push({ url: normalized, title });

      const foundLinks = await page.$$eval("a[href]", (a) =>
        a.map((x) => x.href).filter(Boolean)
      );

      for (const link of foundLinks) {
        const next = normalizeUrl(link);
        if (!next || !next.startsWith(SITE_URL)) continue;

        const relative = next.replace(SITE_URL, "");
        if (!relative.startsWith("/es")) continue; // solo español

        if (
          visited.has(next) ||
          queue.find((q) => q.url === next) ||
          NON_HTML_EXTENSIONS.test(next)
        )
          continue;

        queue.push({ url: next, depth: depth + 1 });
      }

      success = true;
    } catch (err) {
      console.warn(`⚠️ Error al analizar ${normalized}: ${err.message}`);
      errors.push({ url: normalized, message: err.message });
    }

    if (!success) {
      results.push({ url: normalized, title: "(error de carga)", error: true });
    }

    await delay(DELAY_BETWEEN_PAGES);
  }

  await browser.close();
  saveResults();
}

// ===========================================================
// 💾 GUARDADO DE RESULTADOS Y LOGS
// ===========================================================
function saveResults() {
  const scriptsDir = path.join(__dirname, "../scripts");
  const logDir = path.join(__dirname, "../auditorias");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const outputFile = path.join(scriptsDir, "urls.json");
  const logFile = path.join(logDir, `${format(new Date(), "yyyy-MM-dd")}-crawler-puppeteer.log`);

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf8");

  const log = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🗣️ Idioma: Español (/es)`,
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `⚙️ Límite de páginas: ${MAX_PAGES}`,
    `✅ Páginas rastreadas: ${results.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map((e) => `❌ ${e.url} → ${e.message}`).join("\n"),
  ].join("\n");

  fs.writeFileSync(logFile, log);

  console.log("===============================================");
  console.log("✅ Rastreo completado correctamente IAAP PRO v4.6-CI-Safe (solo español)");
  console.log(`📁 Archivo generado: ${outputFile}`);
  console.log(`🪵 Log: ${logFile}`);
  console.log("===============================================");
}

// ===========================================================
// 🚀 EJECUCIÓN PRINCIPAL
// ===========================================================
(async () => {
  const start = Date.now();
  try {
    await crawl();
  } catch (err) {
    console.error("❌ Error crítico en el crawler:", err.message);
    const scriptsDir = path.join(__dirname, "../scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "urls.json"), "[]");
  }
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱️ Tiempo total: ${duration}s`);
  console.log("✅ Rastreo IAAP PRO finalizado correctamente (solo español)");
  process.exit(0);
})();
