/**
 * ♿ crawl-auto.mjs (v4.7 IAAP PRO / WCAG 2.2)
 * --------------------------------------------------------
 * Rastreo automático inteligente y autolimpiante:
 *  - Detecta si el sitio es estático o SPA (React, Vue, Webflow, etc.)
 *  - Usa automáticamente el crawler adecuado:
 *      → crawl.js (Cheerio, rápido, estático)
 *      → crawl-puppeteer.mjs (renderizado real)
 *  - Elimina logs antiguos y fuerza nuevo rastreo siempre
 *
 * ✅ Límite global de URLs configurable (MAX_URLS)
 * ✅ Detección automática de frameworks JS
 * ✅ Idioma español (/es)
 * ✅ Fallback seguro (si uno falla, usa el otro)
 * ✅ Limpieza automática de logs (>7 días)
 * ✅ Compatible con CI/CD (GitHub Actions, Docker)
 * ✅ Unifica estructura de salida y logs IAAP
 * ✅ Totalmente “fire and forget”
 * --------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import axios from "axios";
import { format, subDays, parseISO } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

// 🌐 Configuración base
const SITE_URL = process.env.SITE_URL?.replace(/\/$/, "") || "https://example.com";
const MAX_URLS = parseInt(process.env.MAX_URLS || "80", 10);
const urlsPath = path.join(ROOT, "scripts", "urls.json");
const logDir = path.join(ROOT, "auditorias");
const logFile = path.join(logDir, `${format(new Date(), "yyyy-MM-dd")}-crawl-auto.log`);
const LOG_RETENTION_DAYS = 7; // 🗑️ Días antes de borrar logs antiguos

fs.mkdirSync(path.dirname(urlsPath), { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

console.log("============================================================");
console.log(`🚀 IAAP PRO – Rastreo automático (v4.7)`);
console.log(`🌍 Dominio: ${SITE_URL}`);
console.log(`🗣️ Idioma preferido: Español (/es)`);
console.log(`📏 Límite global de URLs: ${MAX_URLS}`);
console.log("============================================================");

// =============================================================
// 🧹 LIMPIEZA AUTOMÁTICA DE ARCHIVOS ANTERIORES
// =============================================================
if (fs.existsSync(urlsPath)) {
  try {
    fs.unlinkSync(urlsPath);
    console.log("🧹 Eliminado scripts/urls.json anterior para forzar nuevo rastreo.");
  } catch (e) {
    console.warn("⚠️ No se pudo eliminar scripts/urls.json:", e.message);
  }
}

// =============================================================
// 🗑️ LIMPIEZA DE LOGS ANTIGUOS
// =============================================================
function cleanOldLogs() {
  try {
    const files = fs.readdirSync(logDir);
    const threshold = subDays(new Date(), LOG_RETENTION_DAYS);

    files.forEach((file) => {
      if (!file.endsWith(".log")) return;

      const match = file.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!match) return;

      const fileDate = parseISO(match[1]);
      if (fileDate < threshold) {
        fs.unlinkSync(path.join(logDir, file));
        console.log(`🗑️ Log antiguo eliminado: ${file}`);
      }
    });
  } catch (err) {
    console.warn("⚠️ No se pudieron limpiar logs antiguos:", err.message);
  }
}

cleanOldLogs();

// =============================================================
// 🔍 Detectar tipo de sitio (SPA vs estático)
// =============================================================
async function detectFramework() {
  console.log("🔎 Analizando el sitio para detectar tipo de tecnología...");
  try {
    const { data } = await axios.get(SITE_URL, { timeout: 10000 });
    const html = data.toLowerCase();

    const indicators = [
      "react",
      "next",
      "vue",
      "nuxt",
      "webflow",
      "svelte",
      "astro",
      "angular",
      "app-root",
      "data-reactroot",
    ];

    if (indicators.some((word) => html.includes(word))) {
      console.log("🧠 Framework JS detectado → se usará Puppeteer");
      return "puppeteer";
    }

    if (html.includes("<script") && html.includes("fetch(")) {
      console.log("⚙️ Código dinámico detectado → se usará Puppeteer");
      return "puppeteer";
    }

    console.log("🧱 Sitio estático detectado → se usará crawler rápido (Cheerio)");
    return "js";
  } catch (err) {
    console.warn(`⚠️ No se pudo detectar el tipo de sitio: ${err.message}`);
    return "js"; // fallback seguro
  }
}

// =============================================================
// 🚀 Ejecución principal
// =============================================================
(async () => {
  const start = Date.now();
  const type = await detectFramework();

  const crawlerPath =
    type === "puppeteer"
      ? path.join(ROOT, "crawler", "crawl-puppeteer.mjs")
      : path.join(ROOT, "crawler", "crawl.js");

  const fallbackPath =
    type === "puppeteer"
      ? path.join(ROOT, "crawler", "crawl.js")
      : path.join(ROOT, "crawler", "crawl-puppeteer.mjs");

  const log = [];

  try {
    console.log("------------------------------------------------------------");
    console.log(`🔧 Ejecutando: ${path.basename(crawlerPath)}`);
    console.log("------------------------------------------------------------");

    execSync(`node "${crawlerPath}"`, { stdio: "inherit" });
    log.push(`✅ Rastreo principal completado con: ${path.basename(crawlerPath)}`);
  } catch (err) {
    console.warn(`⚠️ Error en ${path.basename(crawlerPath)} → ${err.message}`);
    log.push(`⚠️ Falla en crawler principal: ${path.basename(crawlerPath)}`);
    console.log(`🔁 Reintentando con: ${path.basename(fallbackPath)}`);

    try {
      execSync(`node "${fallbackPath}"`, { stdio: "inherit" });
      log.push(`✅ Fallback ejecutado correctamente con: ${path.basename(fallbackPath)}`);
    } catch (err2) {
      console.error(`❌ Ambos crawlers fallaron: ${err2.message}`);
      fs.writeFileSync(urlsPath, "[]");
      log.push("❌ Ambos crawlers fallaron. Se generó scripts/urls.json vacío.");
    }
  }

  // =============================================================
  // 🧾 Validación final y logs
  // =============================================================
  if (!fs.existsSync(urlsPath)) {
    fs.writeFileSync(urlsPath, "[]");
  }

  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(urlsPath, "utf8") || "[]");
  } catch {
    data = [];
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  const summary = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🗣️ Idioma: Español (/es)`,
    `🧩 Tipo de rastreo: ${type.toUpperCase()}`,
    `📏 Límite global de URLs: ${MAX_URLS}`,
    `📊 URLs encontradas: ${data.length}`,
    `⏱️ Duración: ${duration}s`,
    "",
    ...log,
  ].join("\n");

  fs.appendFileSync(logFile, summary + "\n\n");
  console.log("============================================================");
  console.log("✅ Rastreo automático completado IAAP PRO v4.7");
  console.log(`📊 URLs encontradas: ${data.length}`);
  if (data.length >= MAX_URLS) {
    console.log(`⚠️ Rastreo detenido automáticamente al alcanzar ${MAX_URLS} URLs.`);
  }
  console.log(`🪵 Log: ${logFile}`);
  console.log("============================================================");
})();


