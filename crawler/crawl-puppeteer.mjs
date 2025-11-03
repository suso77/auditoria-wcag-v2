/**
 * ♿ CRAWLER AVANZADO CON PUPPETEER (robusto y tolerante a errores)
 * -------------------------------------------------------------------
 * ✅ Rastrea todas las URLs internas del sitio (hasta profundidad máxima).
 * ✅ Reintenta las páginas con errores de carga hasta 2 veces.
 * ✅ Ignora recursos no HTML (PDF, imágenes, CSS...).
 * ✅ Aumenta el timeout a 60s para sitios lentos o con modales.
 * ✅ Detecta bloqueos y los marca como advertencias sin romper el proceso.
 * ✅ Guarda resultados únicos en scripts/urls.json.
 * -------------------------------------------------------------------
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🌐 Configuración
const SITE_URL = process.env.SITE_URL || "https://www.hiexperience.es";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "3", 10);
const TIMEOUT = parseInt(process.env.TIMEOUT || "60000", 10); // ⏱️ aumentado a 60s
const DELAY_BETWEEN_PAGES = parseInt(process.env.CRAWL_DELAY || "800", 10);

const visited = new Set();
const queue = [{ url: SITE_URL, depth: 0 }];
const results = [];

console.log(`🚀 Iniciando rastreo JS en: ${SITE_URL}`);
console.log(`   Profundidad máxima: ${MAX_DEPTH}`);
console.log(`   Timeout por página: ${TIMEOUT} ms`);
console.log(`   Delay entre páginas: ${DELAY_BETWEEN_PAGES} ms`);

const NON_HTML_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|webm|avi|mov|ico|css|js|zip|rar|doc|docx|xls|xlsx|json|rss|xml)$/i;

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

async function crawl() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(TIMEOUT);

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
    let success = false;
    let status = null;
    let title = "(sin título)";

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
          continue; // intenta de nuevo
        }

        const contentType = response?.headers()["content-type"] || "";
        if (!contentType.includes("text/html")) {
          console.log(`⚠️  Ignorando recurso no HTML (${contentType}): ${normalized}`);
          break;
        }

        await delay(800);
        title = await page.title();

        results.push({
          url: normalized,
          title: title || "(sin título)",
        });

        console.log(
          `🔗 [${depth}] ${normalized} — “${title || "sin título"}” (intento ${intento})`
        );

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

        success = true;
        break;
      } catch (err) {
        console.warn(
          `⚠️  Error al analizar ${normalized}: ${err.message}${
            intento < 2 ? " (Reintentando...)" : " (falló definitivamente)"
          }`
        );
        await delay(2000);
      }
    }

    if (!success) {
      results.push({
        url: normalized,
        title: "(error de carga)",
        error: true,
        errorMessage: "No se pudo cargar la página después de 2 intentos.",
      });
    }

    await delay(DELAY_BETWEEN_PAGES);
  }

  await browser.close();

  // 🧾 Guardar resultados
  const scriptsDir = path.join(__dirname, "../scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const outputFile = path.join(scriptsDir, "urls.json");

  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf-8");

  console.log("===============================================");
  console.log("✅ Rastreo completado correctamente");
  console.log(`🌍 Total de páginas HTML guardadas: ${results.length}`);
  console.log(`📁 Archivo generado: ${outputFile}`);
  console.log("===============================================");
}

crawl().catch((err) => {
  console.error("❌ Error en el crawler:", err);
  process.exit(1);
});
