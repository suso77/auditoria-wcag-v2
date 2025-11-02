/**
 * ♿ CRAWLER AVANZADO CON PUPPETEER
 * -------------------------------------------------------
 * - Rastrea TODAS las URLs internas de un sitio hasta una profundidad definida.
 * - Ejecuta el DOM real con JavaScript (usa Puppeteer headless).
 * - Guarda resultados únicos en scripts/urls.json.
 * - Diseñado para auditorías accesibilidad con Cypress + axe-core.
 * -------------------------------------------------------
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🌐 URL base desde variable de entorno o por defecto
const SITE_URL = process.env.SITE_URL || "https://example.com";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "20000", 10);

const visited = new Set();
const queue = [{ url: SITE_URL, depth: 0 }];
const urls = [];

console.log(`🚀 Iniciando rastreo JS en: ${SITE_URL}`);
console.log(`   Profundidad máxima: ${MAX_DEPTH}`);

// 🧹 Normaliza las URLs (quita anchors, querys irrelevantes, etc.)
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

// 🕷️ Lógica principal del crawler
async function crawl() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  while (queue.length > 0) {
    const { url, depth } = queue.shift();
    if (depth > MAX_DEPTH) continue;

    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!normalized.startsWith(SITE_URL)) continue; // solo dominio base

    visited.add(normalized);
    urls.push(normalized);
    console.log(`🔗 [${depth}] ${normalized}`);

    try {
      await page.goto(normalized, {
        waitUntil: "networkidle2",
        timeout: TIMEOUT
      });

      // Espera breve para asegurar render completo
      await new Promise(r => setTimeout(r, 1000));

      const foundLinks = await page.$$eval("a[href]", (anchors) =>
        anchors.map((a) => a.href).filter(Boolean)
      );

      for (const link of foundLinks) {
        const next = normalizeUrl(link);
        if (
          next &&
          next.startsWith(SITE_URL) &&
          !visited.has(next) &&
          !queue.find((q) => q.url === next)
        ) {
          queue.push({ url: next, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.warn(`⚠️  Error al acceder a ${normalized}: ${err.message}`);
    }
  }

  await browser.close();

  // 🧾 Guardar resultados
  fs.mkdirSync(path.join(__dirname, "../scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "../scripts/urls.json"),
    JSON.stringify([...urls], null, 2)
  );

  console.log(`✅ Rastreo completado: ${urls.length} URLs guardadas.`);
  console.log(`📁 Archivo: scripts/urls.json`);
}

crawl().catch((err) => {
  console.error("❌ Error en el crawler:", err);
  process.exit(1);
});
