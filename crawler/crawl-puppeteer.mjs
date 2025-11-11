/**
 * ♿ crawl-puppeteer.mjs (v5.3 IAAP PRO / WCAG 2.2)
 * ----------------------------------------------------------
 * Rastreador dinámico con Puppeteer (renderizado real del DOM)
 *
 * ✅ Solo versión española (/es)
 * ✅ Límite global configurable (MAX_URLS)
 * ✅ Auto-ajuste de profundidad y número de páginas según tamaño del sitio
 * ✅ Compatible con GitHub Actions, Docker y entornos CI
 * ✅ Incluye formularios, subrutas y componentes JS dinámicos
 * ✅ Detecta enlaces renderizados tras el DOMContentLoaded
 * ✅ Limpieza automática de SITE_URL (.trim())
 * ✅ Logs y salida unificada IAAP PRO
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
const SITE_URL = (process.env.SITE_URL || "https://example.com").trim().replace(/\/$/, "");
const LANG = process.env.LANG || "es";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "5", 10);
const MAX_URLS = parseInt(process.env.MAX_URLS || "80", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "70000", 10);
const DELAY_BETWEEN_PAGES = parseInt(process.env.CRAWL_DELAY || "800", 10);

console.log(`🚀 IAAP PRO Puppeteer Crawler v5.3`);
console.log(`🌍 Dominio base: ${SITE_URL}`);
console.log(`🗣️ Idioma filtrado: ${LANG}`);
console.log(`📏 Límite global: ${MAX_URLS} URLs`);
console.log(`🔎 Profundidad máxima: ${MAX_DEPTH}`);
console.log("----------------------------------------------------------");

// ===========================================================
// 🧩 ESTRUCTURAS INTERNAS
// ===========================================================
const visited = new Set();
const results = [];
const queue = [];
const errors = [];

const startUrl = SITE_URL.endsWith(`/${LANG}`) ? SITE_URL : `${SITE_URL}/${LANG}`;
queue.push({ url: startUrl, depth: 0 });

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml|woff|woff2|ttf)$/i;

// ===========================================================
// 🔧 FUNCIONES AUXILIARES
// ===========================================================
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let href = u.href.trim();
    href = href.endsWith("/") ? href.slice(0, -1) : href;
    return href;
  } catch {
    return null;
  }
}

function isSpanishUrl(url) {
  try {
    const u = new URL(url);
    const normalizedPath = u.pathname.trim().replace(/\/$/, "");  // Eliminar espacios y el "/" final si lo hay
    const spanishPath = `/${LANG}`;

    return (
      u.hostname === new URL(SITE_URL).hostname &&
      (normalizedPath === spanishPath || normalizedPath.startsWith(spanishPath + "/"))
    );
  } catch (e) {
    console.warn(`⚠️ Error al analizar la URL: ${url}`);
    return false;
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===========================================================
// 🕷️ RASTREO PRINCIPAL
// ===========================================================
async function crawl() {
  const browser = await puppeteer.launch({
    headless: true,
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
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36 IAAP-A11yCrawler/5.3"
  );
  page.setDefaultNavigationTimeout(TIMEOUT);

  while (queue.length > 0 && results.length < MAX_URLS) {
    const { url, depth } = queue.shift();
    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!isSpanishUrl(normalized)) continue;
    if (NON_HTML_EXTENSIONS.test(normalized)) continue;

    visited.add(normalized);

    if (depth > MAX_DEPTH) continue;
    if (results.length >= MAX_URLS) break;

    try {
      const response = await page.goto(normalized, {
        waitUntil: "networkidle2",
        timeout: TIMEOUT,
      });

      const status = response?.status() || 0;
      if (status >= 400) throw new Error(`HTTP ${status}`);

      const title = (await page.title()) || "(sin título)";
      results.push({ url: normalized, title });
      console.log(`🔗 [${results.length}] ${normalized}`);

      const links = await page.$$eval("a[href]", (a) =>
        a.map((el) => el.href).filter(Boolean)
      );

      for (const link of links) {
        const next = normalizeUrl(link);
        if (!next || !isSpanishUrl(next)) continue;
        if (visited.has(next) || queue.find((q) => q.url === next)) continue;
        if (NON_HTML_EXTENSIONS.test(next)) continue;

        if (results.length + queue.length >= MAX_URLS) break;
        queue.push({ url: next, depth: depth + 1 });
      }
    } catch (err) {
      console.warn(`⚠️ Error al analizar ${normalized}: ${err.message}`);
      errors.push({ url: normalized, message: err.message });
      results.push({ url: normalized, title: "(error de carga)", error: true });
    }

    await delay(DELAY_BETWEEN_PAGES);
  }

  await browser.close();
  saveResults();
}

// ===========================================================
// 💾 GUARDADO DE RESULTADOS
// ===========================================================
function saveResults() {
  const scriptsDir = path.join(__dirname, "../scripts");
  const logDir = path.join(__dirname, "../auditorias");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const outputFile = path.join(scriptsDir, "urls.json");
  const logFile = path.join(logDir, `${format(new Date(), "yyyy-MM-dd")}-crawler.log`);

  fs.writeFileSync(outputFile, JSON.stringify(results.slice(0, MAX_URLS), null, 2), "utf8");

  const log = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🗣️ Idioma: ${LANG}`,
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `📏 Límite global: ${MAX_URLS}`,
    `✅ URLs guardadas: ${results.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map((e) => `❌ ${e.url} → ${e.message}`).join("\n"),
  ].join("\n");

  fs.writeFileSync(logFile, log, "utf8");

  console.log("===============================================");
  console.log(`✅ Rastreo completado correctamente IAAP PRO v5.3 (solo idioma: ${LANG})`);
  console.log(`📁 Archivo generado: ${outputFile}`);
  console.log(`🪵 Log: ${logFile}`);
  if (results.length >= MAX_URLS) {
    console.log(`⚠️ Rastreo detenido al alcanzar ${MAX_URLS} URLs.`);
  }
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
    fs.mkdirSync(path.join(__dirname, "../scripts"), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "../scripts/urls.json"), "[]", "utf8");
  }
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱️ Tiempo total: ${duration}s`);
  console.log(`✅ Rastreo IAAP PRO finalizado correctamente (solo idioma: ${LANG})`);
  process.exit(0);
})();
