/**
 * ♿ scripts/capture-evidence.mjs — IAAP PRO v3.8 (WCAG + Export Sync)
 * -------------------------------------------------------------------
 * Genera capturas automáticas con overlay adaptativo, compresión PNG,
 * y metadatos compatibles con export-to-xlsx.mjs (IAAP PRO v5.6.2)
 *
 * ✅ Compatible con Puppeteer v23+
 * ✅ Integración con wcag-map.mjs
 * ✅ Compresión PNG (sharp opcional)
 * ✅ Exporta rutas capturePath listas para Excel
 * ✅ Overlay visual contextualizado con criterio WCAG
 */

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { getWcagInfo } from "./wcag-map.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDITORIAS_DIR = path.join(__dirname, "../auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
const METADATA_FILE = path.join(AUDITORIAS_DIR, "capturas-metadata.json");

// Patrones a omitir (elementos repetitivos)
const PATRONES_DUPLICADOS = [
  "header",
  "footer",
  "cookie",
  "gdpr",
  "nav",
  "main-menu",
  "site-header",
  "site-footer",
];

// ----------------------------------------------------------
// 🧩 Helpers
// ----------------------------------------------------------
function slugify(str) {
  return str
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .substring(0, 80)
    .toLowerCase();
}

async function compressPng(inputPath) {
  try {
    const tempPath = inputPath.replace(".png", "-compressed.png");
    await sharp(inputPath)
      .png({ quality: 80, compressionLevel: 9, adaptiveFiltering: true })
      .toFile(tempPath);
    fs.renameSync(tempPath, inputPath);
  } catch {
    /* ignorar errores de compresión */
  }
}

// ----------------------------------------------------------
// 🚀 Generador principal
// ----------------------------------------------------------
async function generateCaptures() {
  console.log("📸 Generando capturas IAAP PRO v3.8 con contexto WCAG...");

  const mergedFiles = fs
    .readdirSync(AUDITORIAS_DIR)
    .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (!mergedFiles.length) {
    console.error("❌ No se encontró ningún archivo results-merged-*.json");
    process.exit(1);
  }

  const latestMerged = path.join(AUDITORIAS_DIR, mergedFiles[0]);
  console.log(`📄 Usando archivo: ${path.basename(latestMerged)}`);

  const data = JSON.parse(fs.readFileSync(latestMerged, "utf-8"));
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const duplicadosGuardados = new Set();
  const metadata = [];
  let totalCapturas = 0,
    totalOmitidas = 0,
    totalErrores = 0;

  for (const issue of data) {
    const url = issue.pageUrl || issue.url;
    if (!url) continue;

    const origen = issue.origen || "sitemap";
    const carpetaOrigen = path.join(CAPTURAS_DIR, origen);
    fs.mkdirSync(carpetaOrigen, { recursive: true });

    const pageSlug = slugify(url);
    const tab = await browser.newPage();

    try {
      console.log(`\n🌍 Página: ${url}`);
      await tab.goto(url, {
        waitUntil: ["load", "domcontentloaded"],
        timeout: 60000,
      });
      await tab.setViewport({ width: 1440, height: 900 });

      const selector = issue.selector || "body";
      const criterio = issue.wcag || issue.id || "sin-id";
      const impact = issue.impact || "serious";
      const wcag = getWcagInfo(criterio);

      // 🔁 Evitar duplicados
      const isDuplicado =
        PATRONES_DUPLICADOS.some((p) => selector.includes(p)) ||
        Array.from(duplicadosGuardados).some(
          (d) => selector.includes(d) || d.includes(selector)
        );
      if (isDuplicado) {
        totalOmitidas++;
        continue;
      }
      duplicadosGuardados.add(selector);

      const selectorSlug = slugify(selector || criterio);
      const filename = `${criterio}--${selectorSlug}--${pageSlug}.png`;
      const capturePath = path.join(carpetaOrigen, filename);

      // 🎨 Dibujar overlay
      const impactColor =
        {
          critical: "#d60000",
          serious: "#ff4c00",
          moderate: "#ffaa00",
          minor: "#00aaff",
        }[impact] || "#ffaa00";

      await drawOverlay(tab, selector, issue, wcag, impactColor);

      // 📸 Capturar imagen
      let element = null;
      if (selector.startsWith("//")) {
        const handle = await tab.evaluateHandle((xpath) => {
          const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          return result.singleNodeValue;
        }, selector);
        element = handle && (await handle.asElement()) ? handle.asElement() : null;
      } else {
        element = await tab.$(selector);
      }

      if (element) {
        const box = await element.boundingBox();
        if (box && box.width > 10 && box.height > 10) {
          await element.screenshot({ path: capturePath });
          console.log(`✅ Captura recortada: ${filename}`);
        } else {
          await tab.screenshot({ path: capturePath, fullPage: true });
          console.log(`⚠️ Captura completa (bounding box inválido): ${filename}`);
        }
      } else {
        await tab.screenshot({ path: capturePath, fullPage: true });
        console.log(`⚠️ Fallback visual completo: ${filename}`);
      }

      // 🧹 Limpiar overlays
      await tab.evaluate(() =>
        document.querySelectorAll(".wcag-overlay").forEach((o) => o.remove())
      );

      // 🗜️ Comprimir PNG
      await compressPng(capturePath);

      // 💾 Añadir a metadatos
      const relativePath = path.relative(AUDITORIAS_DIR, capturePath);
      metadata.push({
        criterio,
        criterio_wcag: wcag.criterio,
        principio: wcag.principio,
        nivel: wcag.nivel,
        resumen: wcag.resumen,
        url_wcag: wcag.url,
        selector,
        impacto: impact,
        capturePath: relativePath,
        url,
        origen,
      });

      totalCapturas++;
      await tab.waitForTimeout(500);
    } catch (err) {
      totalErrores++;
      console.error(`❌ Error en ${url}: ${err.message}`);
    } finally {
      await tab.close();
    }
  }

  await browser.close();
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

  console.log("\n===========================================");
  console.log("📊 RESUMEN DE CAPTURAS WCAG IAAP v3.8");
  console.log("-------------------------------------------");
  console.log(`✅ Capturas generadas: ${totalCapturas}`);
  console.log(`⚠️ Duplicados omitidos: ${totalOmitidas}`);
  console.log(`❌ Errores: ${totalErrores}`);
  console.log(`💾 Metadatos guardados en: ${path.basename(METADATA_FILE)}`);
  console.log(`📁 Carpeta destino: ${CAPTURAS_DIR}`);
  console.log("===========================================");
  console.log("✅ Generación de evidencias completada correctamente.");
}

// ----------------------------------------------------------
// 🎨 Overlay visual con criterio WCAG
// ----------------------------------------------------------
async function drawOverlay(tab, selector, v, wcag, color) {
  await tab.evaluate((sel, v, wcag, color) => {
    const el = sel.startsWith("//") ? null : document.querySelector(sel);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "wcag-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = `${rect.top - 8}px`;
    overlay.style.left = `${rect.left - 8}px`;
    overlay.style.width = `${rect.width + 16}px`;
    overlay.style.height = `${rect.height + 16}px`;
    overlay.style.border = `3px solid ${color}`;
    overlay.style.boxShadow = `0 0 10px ${color}88`;
    overlay.style.zIndex = "999999";
    overlay.style.pointerEvents = "none";

    const label = document.createElement("div");
    label.textContent = `${wcag.criterio || v.id} (${wcag.nivel || "N/A"})`;
    label.style.position = "absolute";
    label.style.top = "-22px";
    label.style.left = "0";
    label.style.background = color;
    label.style.color = "#fff";
    label.style.fontSize = "11px";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "4px";
    label.style.fontFamily = "Arial, sans-serif";
    label.style.whiteSpace = "nowrap";
    label.style.maxWidth = "420px";
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";

    overlay.appendChild(label);
    document.body.appendChild(overlay);
    el.scrollIntoView({ block: "center", inline: "center" });
  }, selector, v, wcag, color);
}

// ----------------------------------------------------------
// ▶️ Ejecutar
// ----------------------------------------------------------
generateCaptures().catch((err) => {
  console.error("❌ Error general en generación de capturas:", err);
  process.exit(1);
});
