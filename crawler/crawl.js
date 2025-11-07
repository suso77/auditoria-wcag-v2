/**
 * ♿ crawl.js (v4.1 IAAP PRO / WCAG 2.2)
 * ----------------------------------------------------------
 * Rastreador rápido y ligero basado en Cheerio.
 * Ideal para webs estáticas o con sitemap.xml accesible.
 *
 * ✅ Profundidad configurable (MAX_DEPTH)
 * ✅ Evita duplicados, subdominios y recursos no HTML
 * ✅ Guarda resultados únicos en scripts/urls.json
 * ✅ Logs consistentes y tolerancia CI/CD
 * ✅ Compatible con Node 20+, Docker, GitHub Actions
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
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "15000", 10);
const USER_AGENT = "IAAP-A11yCrawler/4.1 (+https://github.com/iaap-pro)";

// 📂 Directorios
const outputDir = path.join(__dirname, "..", "scripts");
const logDir = path.join(__dirname, "..", "auditorias");

// 🔄 Estructuras internas
const visited = new Set();
const results = [];
const errors = [];

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml)$/i;

// ==========================================================
// 🔍 Funciones auxiliares
// ==========================================================
function normalizeUrl(url) {
  try {
    const u = new URL(url, SITE_URL);
    u.hash = "";
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

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================================
// 🕷️ Rastreador recursivo
// ==========================================================
async function crawl(url, depth = 0) {
  const normalized = normalizeUrl(url);
  if (!normalized || visited.has(normalized) || depth > MAX_DEPTH) return;

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
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${format(new Date(), "yyyy-MM-dd")}-crawler.log`);

  const log = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `✅ Páginas rastreadas: ${results.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map((e) => `❌ ${e.url} → ${e.message}`).join("\n"),
  ].join("\n");

  fs.writeFileSync(logPath, log);

  console.log("===============================================");
  console.log(`✅ ${results.length} páginas guardadas en ${outputPath}`);
  console.log(`🪵 Log de rastreo: ${logPath}`);
  console.log("===============================================");
}

// ==========================================================
// 🚀 Ejecución principal
// ==========================================================
(async () => {
  console.log(`🚀 Iniciando rastreo IAAP PRO v4.1`);
  console.log(`🌍 Dominio base: ${SITE_URL}`);
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
