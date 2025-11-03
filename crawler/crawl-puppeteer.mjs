/**
 * ♿ CRAWLER AVANZADO CON PUPPETEER (con títulos de página)
 * -------------------------------------------------------
 * ✅ Rastrea todas las URLs internas de un sitio hasta una profundidad definida.
 * ✅ Ignora enlaces a archivos descargables (PDF, imágenes, vídeos, docs, etc.).
 * ✅ Detecta tipo de contenido real y guarda solo páginas HTML.
 * ✅ Extrae el <title> de cada página.
 * ✅ Guarda resultados únicos (URL + título) en scripts/urls.json.
 * -------------------------------------------------------
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🌐 Configuración principal
const SITE_URL = process.env.SITE_URL || "https://example.com";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "20000", 10);

const visited = new Set();
const queue = [{ url: SITE_URL, depth: 0 }];
const results = [];

console.log(`🚀 Iniciando rastreo JS en: ${SITE_URL}`);
console.log(`   Profundidad máxima: ${MAX_DEPTH}`);

// 🔎 Extensiones que deben excluirse del rastreo
const NON_HTML_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx)$/i;

// 🧹 Normaliza URLs y elimina duplicados, anchors o querys irrelevantes
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

// 🕷️ Lógica principal del rastreador
async function crawl() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  while (queue.length > 0) {
    const { url, depth } = queue.shift();
    if (depth > MAX_DEPTH) continue;

    const normalized = normalizeUrl(url);
    if (!normalized || visited.has(normalized)) continue;
    if (!normalized.startsWith(SITE_URL)) continue;
    if (NON_HTML_EXTENSIONS.test(normalized)) {
      console.log(`⚠️  Ignorando archivo no HTML: ${normalized}`);
      continue;
    }

    visited.add(normalized);

    try {
      const response = await page.goto(normalized, {
        waitUntil: "networkidle2",
        timeout: TIMEOUT,
      });

      // ⚙️ Validar tipo de contenido
      const contentType = response?.headers()["content-type"] || "";
      if (!contentType.includes("text/html")) {
        console.log(`⚠️  Ignorando recurso no HTML (${contentType}): ${normalized}`);
        continue;
      }

      // Esperar breve para render completo del DOM
      await new Promise((r) => setTimeout(r, 800));

      // Extraer título de la página
      const title = await page.title();

      results.push({
        url: normalized,
        title: title || "(sin título)",
      });
      console.log(`🔗 [${depth}] ${normalized} — “${title || "sin título"}”`);

      // Buscar nuevos enlaces internos
      const foundLinks = await page.$$eval("a[href]", (anchors) =>
        anchors.map((a) => a.href).filter(Boolean)
      );

      for (const link of foundLinks) {
        const next = normalizeUrl(link);
        if (
          next &&
          next.startsWith(SITE_URL) &&
          !visited.has(next) &&
          !queue.find((q) => q.url === next) &&
          !NON_HTML_EXTENSIONS.test(next)
        ) {
          queue.push({ url: next, depth: depth + 1 });
        }
      }
    } catch (err) {
      console.warn(`⚠️  Error al acceder a ${normalized}: ${err.message}`);
    }
  }

  await browser.close();

  // 🧾 Guardar resultados finales
  fs.mkdirSync(path.join(__dirname, "../scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "../scripts/urls.json"),
    JSON.stringify(results, null, 2)
  );

  console.log("===============================================");
  console.log(`✅ Rastreo completado correctamente`);
  console.log(`🌍 Total de páginas HTML guardadas: ${results.length}`);
  console.log(`📁 Archivo generado: scripts/urls.json`);
  console.log("===============================================");
}

crawl().catch((err) => {
  console.error("❌ Error en el crawler:", err);
  process.exit(1);
});

