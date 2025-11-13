/**
 * ♿ crawl.js (v5.6.3 IAAP PRO / WCAG 2.2)
 * ----------------------------------------------------------
 * Rastreador rápido y ligero basado en Cheerio.
 * Ideal para webs estáticas o con sitemap.xml accesible.
 *
 * ✅ Normalización automática del idioma (LANG)
 * ✅ Profundidad configurable (MAX_DEPTH)
 * ✅ Evita duplicados, subdominios y recursos no HTML
 * ✅ Logs unificados IAAP PRO v5.6.3
 * ✅ Compatible con Node 20+, Docker, GitHub Actions
 * ✅ Limpieza de errores tolerante
 * ----------------------------------------------------------
 */

import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================================
// 🌐 CONFIGURACIÓN GLOBAL
// ==========================================================
const SITE_URL = process.env.SITE_URL?.replace(/\/$/, "") || "https://example.com";
let LANG = process.env.LANG || "es";

// 🧠 Normalización automática de idioma (ej. "en_US.UTF-8" → "en")
LANG = LANG.split(/[-_.]/)[0].toLowerCase() || "es";

const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const MAX_URLS = parseInt(process.env.MAX_URLS || "80", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "15000", 10);
const USER_AGENT = "IAAP-A11yCrawler/5.6.3 (+https://github.com/iaap-pro)";

// 📂 Directorios
const outputDir = path.join(__dirname, "..", "scripts");
const logDir = path.join(__dirname, "..", "auditorias");

// 🔄 Estructuras internas
const visited = new Set();
const results = [];
const errors = [];

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml|woff|woff2|ttf|eot)$/i;

// ==========================================================
// 🔍 Funciones auxiliares
// ==========================================================
function normalizeUrl(url) {
  try {
    const u = new URL(url, SITE_URL);
    u.hash = "";
    u.search = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function shouldVisit(url) {
  return (
    url.startsWith(SITE_URL) &&
    !visited.has(url) &&
    !NON_HTML_EXTENSIONS.test(url) &&
    !url.includes("mailto:") &&
    !url.includes("#")
  );
}

function isLangUrl(url) {
  try {
    const u = new URL(url);
    const normalizedPath = u.pathname.trim().replace(/\/$/, "");
    const langPrefix = `/${LANG}`;

    return (
      u.hostname === new URL(SITE_URL).hostname &&
      (LANG === "" ||
        normalizedPath === langPrefix ||
        normalizedPath.startsWith(langPrefix + "/") ||
        normalizedPath === "" ||
        normalizedPath === "/")
    );
  } catch (e) {
    console.warn(`⚠️ Error al analizar la URL: ${url}`);
    return false;
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================================
// 🕷️ Rastreador recursivo
// ==========================================================
async function crawl(url, depth = 0) {
  const normalized = normalizeUrl(url);
  if (!normalized || visited.has(normalized) || depth > MAX_DEPTH) return;
  if (!isLangUrl(normalized)) return;

  visited.add(normalized);
  console.log(`🔗 [${depth}] ${normalized}`);

  try {
    const { data } = await axios.get(normalized, {
      timeout: TIMEOUT,
      headers: { "User-Agent": USER_AGENT },
    });

    const $ = cheerio.load(data);
    const title = $("title").text().trim() || "(sin título)";
    results.push({ url: normalized, title });

    const links = $("a[href]")
      .map((_, el) => $(el).attr("href"))
      .get()
      .map((href) => normalizeUrl(href))
      .filter(Boolean)
      .filter(shouldVisit);

    for (const link of links) {
      if (results.length >= MAX_URLS) break;
      await delay(150);
      await crawl(link, depth + 1);
    }
  } catch (err) {
    console.warn(`⚠️ Error en ${normalized}: ${err.message}`);
    errors.push({ url: normalized, message: err.message });
  }
}

// ==========================================================
// 💾 Guardar resultados y logs
// ==========================================================
function saveResults() {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "urls.json");
  fs.writeFileSync(outputPath, JSON.stringify(results.slice(0, MAX_URLS), null, 2));

  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${format(new Date(), "yyyy-MM-dd")}-crawler.log`);

  const log = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🗣️ Idioma: ${LANG}`,
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `📏 Límite global: ${MAX_URLS}`,
    `✅ Páginas rastreadas: ${results.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map((e) => `❌ ${e.url} → ${e.message}`).join("\n"),
  ].join("\n");

  fs.writeFileSync(logPath, log);

  console.log("===============================================");
  console.log(`✅ ${results.length} páginas guardadas en ${outputPath}`);
  console.log(`🪵 Log de rastreo: ${logPath}`);
  if (results.length >= MAX_URLS) {
    console.log(`⚠️ Rastreo detenido al alcanzar ${MAX_URLS} URLs.`);
  }
  console.log("===============================================");
}

// ==========================================================
// 🚀 Ejecución principal
// ==========================================================
(async () => {
  console.log(`🚀 Iniciando rastreo rápido IAAP PRO v5.6.3`);
  console.log(`🌍 Dominio base: ${SITE_URL}`);
  console.log(`🗣️ Idioma filtrado: ${LANG}`);
  console.log(`🔎 Profundidad máxima: ${MAX_DEPTH}`);
  console.log("-----------------------------------------------");

  const start = Date.now();
  try {
    await crawl(SITE_URL);
    if (results.length === 0) {
      console.warn("⚠️ No se encontraron URLs válidas. Se generará un archivo vacío.");
    }
    saveResults();
  } catch (err) {
    console.error("❌ Error crítico en el crawler:", err.message);
    fs.writeFileSync(path.join(outputDir, "urls.json"), "[]");
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`⏱️ Rastreo finalizado en ${duration}s`);
})();

