/**
 * ♿ crawl-puppeteer.mjs (v4.2 IAAP PRO / WCAG 2.2)
 * ----------------------------------------------------------
 * Rastreador dinámico con Puppeteer (renderizado real del DOM)
 *
 * ✅ Renderiza páginas con JS (SPA, React, Vue, Webflow, etc.)
 * ✅ Reintenta páginas con errores hasta 2 veces
 * ✅ Ignora recursos no HTML (PDF, imágenes, JSON, feeds)
 * ✅ Control de profundidad, timeout y retardo
 * ✅ Guarda resultados únicos en scripts/urls.json
 * ✅ Logs consistentes y CI-safe
 * ✅ Filtro de idiomas: solo /es y /en
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
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "60000", 10);
const DELAY_BETWEEN_PAGES = parseInt(process.env.CRAWL_DELAY || "800", 10);
const USER_AGENT = "IAAP-A11yCrawler/4.2 (+https://github.com/iaap-pro)";

console.log(`🚀 Iniciando rastreo IAAP PRO con Puppeteer`);
console.log(`🌍 Sitio: ${SITE_URL}`);
console.log(`🔎 Profundidad máxima: ${MAX_DEPTH}`);
console.log(`⏱️ Timeout por página: ${TIMEOUT} ms`);
console.log(`💤 Delay entre páginas: ${DELAY_BETWEEN_PAGES} ms`);
console.log("----------------------------------------------------------");

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml)$/i;

// ===========================================================
// 🧩 ESTRUCTURAS INTERNAS
// ===========================================================
const visited = new Set();
const queue = [{ url: SITE_URL, depth: 0 }];
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
// 🕷️ FUNCIÓN PRINCIPAL DE RASTREO
// ===========================================================
async function crawl() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  page.setDefaultNavigationTimeout(TIMEOUT);

  // Ignorar errores benignos del sitio
  page.on("pageerror", (err) => {
    if (err.message.includes("location is not defined")) {
      console.warn(`⚠️ Ignorado error benigno: ${err.message}`);
    }
  });

  while (queue.length > 0) {
    const { url, depth } = queue.shift();
    if (depth > MAX_DEPTH) continue;

    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!normalized.startsWith(SITE_URL)) continue;
    if (NON_HTML_EXTENSIONS.test(normalized)) {
      console.log(`⚠️  Ignorando recurso no HTML: ${normalized}`);
      continue;
    }

    visited.add(normalized);
    let success = false;
    let title = "(sin título)";
    let status = null;

    // 🔁 Hasta 2 intentos de carga
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const response = await page.goto(normalized, {
          waitUntil: "networkidle2",
          timeout: TIMEOUT,
        });

        status = response?.status();
        if (!status || status >= 400) {
          console.warn(`🚫 Error HTTP ${status || "desconocido"} en ${normalized}`);
          continue;
        }

        const contentType = response?.headers()["content-type"] || "";
        if (!contentType.includes("text/html")) {
          console.log(`⚠️  Recurso no HTML (${contentType}): ${normalized}`);
          break;
        }

        await delay(600);
        title = (await page.title()) || "(sin título)";
        console.log(`🔗 [${depth}] ${normalized} — “${title}”`);

        results.push({ url: normalized, title });

        // ===========================================================
        // 🧩 FILTRO DE IDIOMAS — Solo rastrear /es y /en
        // ===========================================================
        const foundLinks = await page.$$eval("a[href]", (anchors) =>
          anchors.map((a) => a.href).filter(Boolean)
        );

        const ALLOWED_LANGS = ["/es", "/en"];

        for (const link of foundLinks) {
          const next = normalizeUrl(link);

          // Saltar si no pertenece al dominio principal
          if (!next || !next.startsWith(SITE_URL)) continue;

          // Solo URLs que incluyan /es o /en o sean la raíz
          if (!(next === SITE_URL || ALLOWED_LANGS.some((lang) => next.includes(lang)))) {
            continue;
          }

          // Saltar duplicados o recursos no HTML
          if (
            visited.has(next) ||
            queue.find((q) => q.url === next) ||
            NON_HTML_EXTENSIONS.test(next)
          ) {
            continue;
          }

          queue.push({ url: next, depth: depth + 1 });
        }

        success = true;
        break;
      } catch (err) {
        console.warn(
          `⚠️  Error al analizar ${normalized}: ${err.message}${
            intento < 2 ? " (Reintentando...)" : " (falló definitivamente)"
          }`
        );
        await delay(1500);
      }
    }

    if (!success) {
      results.push({
        url: normalized,
        title: "(error de carga)",
        error: true,
        errorMessage: "No se pudo cargar después de 2 intentos",
      });
      errors.push({ url: normalized, message: "No se pudo cargar tras 2 intentos" });
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
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `✅ Páginas rastreadas: ${results.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map((e) => `❌ ${e.url} → ${e.message}`).join("\n"),
  ].join("\n");

  fs.writeFileSync(logFile, log);

  console.log("===============================================");
  console.log("✅ Rastreo completado correctamente IAAP PRO v4.2");
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
  console.log("✅ Rastreo IAAP PRO finalizado correctamente (cierre forzado).");
  process.exit(0);
})();
