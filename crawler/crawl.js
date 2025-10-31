/**
 * ♿ Crawler de accesibilidad – v2.0
 * -----------------------------------------------------
 * Rastrea todas las URLs internas de un dominio hasta una
 * profundidad configurable y guarda el listado completo
 * en `scripts/urls.json`.
 *
 * ✔ Profundidad configurable (MAX_DEPTH)
 * ✔ Evita bucles y duplicados
 * ✔ Ignora subdominios y anclas (#)
 * ✔ Muestra progreso y guarda log detallado
 * ✔ Compatible con GitHub Actions y Node 20+
 * -----------------------------------------------------
 */

import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

// 🧭 Configuración
const SITE_URL = process.env.SITE_URL || "https://www.hiexperience.es";
const MAX_DEPTH = parseInt(process.env.MAX_DEPTH || "4", 10);
const TIMEOUT = 20000;

// 🧩 Rutas y estructuras
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, "..", "scripts");
const logDir = path.join(__dirname, "..", "auditorias");

// 🔄 Estructuras internas
const visited = new Set();
const urls = [];
const errors = [];

/**
 * Rastrea recursivamente las URLs del sitio
 */
async function crawl(url, depth = 0) {
  if (
  depth > MAX_DEPTH ||
  visited.has(url) ||
  !new URL(url).hostname.endsWith(new URL(SITE_URL).hostname.replace(/^www\./, ""))
) return;
url = url.replace(/#.*$/, "").replace(/\/$/, ""); // quita anclas y trailing slashes
  visited.add(url);
  urls.push(url);
  console.log(`🔗 [${depth}] ${url}`);

  try {
    const { data } = await axios.get(url, { timeout: TIMEOUT, headers: { "User-Agent": "A11yBot/2.0" } });
    const $ = cheerio.load(data);

    const links = $("a[href]")
      .map((_, el) => new URL($(el).attr("href"), SITE_URL).href)
      .get()
      .filter(href => href.startsWith(SITE_URL) && !href.includes("#") && !href.includes("mailto:"))
      .filter(href => !visited.has(href));

    // Recursión controlada
    for (const link of links) {
      await crawl(link, depth + 1);
    }
  } catch (err) {
    console.warn(`⚠️ Error en ${url}: ${err.message}`);
    errors.push({ url, message: err.message });
  }
}

/**
 * Guarda los resultados en disco
 */
function saveResults() {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "urls.json");
  fs.writeFileSync(outputPath, JSON.stringify(urls, null, 2));

  const logPath = path.join(
    logDir,
    `${format(new Date(), "yyyy-MM-dd")}-crawler.log`
  );
  fs.mkdirSync(logDir, { recursive: true });

  const log = [
    `📅 Fecha: ${new Date().toISOString()}`,
    `🌍 Sitio: ${SITE_URL}`,
    `🔎 Profundidad máxima: ${MAX_DEPTH}`,
    `✅ URLs rastreadas: ${urls.length}`,
    `⚠️ Errores: ${errors.length}`,
    "",
    errors.map(e => `❌ ${e.url} → ${e.message}`).join("\n")
  ].join("\n");

  fs.writeFileSync(logPath, log);

  console.log(`✅ ${urls.length} URLs guardadas en ${outputPath}`);
  console.log(`🪵 Log de rastreo: ${logPath}`);
}

// 🚀 Ejecución principal
(async () => {
  console.log(`🚀 Iniciando rastreo de ${SITE_URL} (profundidad ${MAX_DEPTH})`);
  const start = Date.now();
  await crawl(SITE_URL);
  saveResults();
  console.log(`⏱️ Finalizado en ${((Date.now() - start) / 1000).toFixed(1)}s`);
})();

