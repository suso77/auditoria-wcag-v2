// ✅ scripts/capture-evidence.mjs (v3.0 — Evidencias IAAP/WCAG Pro)
// Capturas recortadas con overlay de color según severidad, deduplicación,
// optimización PNG y metadatos para integración Excel.

import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDITORIAS_DIR = path.join(__dirname, "../auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
const METADATA_FILE = path.join(AUDITORIAS_DIR, "capturas-metadata.json");

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
// 🧩 Helper
// ----------------------------------------------------------
function slugify(str) {
  return str
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]/gi, "_")
    .substring(0, 80)
    .toLowerCase();
}

// ----------------------------------------------------------
// 🚀 Función principal
// ----------------------------------------------------------
async function generateCaptures() {
  console.log("📸 Generando capturas de evidencias WCAG...");

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
  let totalCapturas = 0;
  let totalOmitidas = 0;
  let totalErrores = 0;

  for (const page of data) {
    if (!page.url || !Array.isArray(page.violations)) continue;

    const origen = page.origen || "sitemap";
    const carpetaOrigen = path.join(CAPTURAS_DIR, origen);
    fs.mkdirSync(carpetaOrigen, { recursive: true });

    const pageSlug = slugify(page.url);
    const tab = await browser.newPage();

    try {
      console.log(`\n🌍 Página: ${page.url}`);
      await Promise.race([
        tab.goto(page.url, { waitUntil: "domcontentloaded", timeout: 25000 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout manual (SPA lenta)")), 30000)
        ),
      ]);

      await tab.setViewport({ width: 1440, height: 900 });

      for (const v of page.violations) {
        const node = v.nodes?.[0];
        if (!node?.target?.length) continue;

        const selector = node.target[0];
        const criterio = v.id || "sin-id";
        const impact = v.impact || "serious";

        // 🔁 Detección de duplicados
        const isDuplicado =
          PATRONES_DUPLICADOS.some((p) => selector.includes(p)) ||
          Array.from(duplicadosGuardados).some(
            (d) => selector.includes(d) || d.includes(selector)
          );

        if (isDuplicado) {
          if (duplicadosGuardados.has(selector)) {
            totalOmitidas++;
            console.log(`⚠️ Duplicado omitido: ${selector}`);
            continue;
          }
          duplicadosGuardados.add(selector);
        }

        const selectorSlug = slugify(selector);
        const filename = `${criterio}--${selectorSlug}--${pageSlug}.png`;
        const capturePath = path.join(carpetaOrigen, filename);

        try {
          const element = await tab.$(selector);
          const impactColor = {
            critical: "#d60000",
            serious: "#ff4c00",
            moderate: "#ffaa00",
            minor: "#00aaff",
          }[impact];

          if (element) {
            // 🖼️ Crear overlay visual
            await tab.evaluate(
              (sel, color) => {
                const el = document.querySelector(sel);
                if (el) {
                  const overlay = document.createElement("div");
                  const rect = el.getBoundingClientRect();
                  overlay.style.position = "fixed";
                  overlay.style.top = `${rect.top - 4}px`;
                  overlay.style.left = `${rect.left - 4}px`;
                  overlay.style.width = `${rect.width + 8}px`;
                  overlay.style.height = `${rect.height + 8}px`;
                  overlay.style.border = `3px solid ${color}`;
                  overlay.style.boxShadow = `0 0 10px ${color}99`;
                  overlay.style.zIndex = "999999";
                  overlay.style.pointerEvents = "none";
                  overlay.className = "wcag-overlay";
                  document.body.appendChild(overlay);
                  el.scrollIntoView({ block: "center", inline: "center" });
                }
              },
              selector,
              impactColor
            );

            const box = await element.boundingBox();

            if (box && box.width > 10 && box.height > 10) {
              await element.screenshot({ path: capturePath });
              console.log(`✅ Captura recortada: ${filename}`);
            } else {
              await tab.screenshot({ path: capturePath, fullPage: true });
              console.log(`⚠️ Bounding box inválido → captura completa: ${filename}`);
            }

            // 🧽 Limpiar overlay
            await tab.evaluate(() => {
              document.querySelectorAll(".wcag-overlay").forEach((o) => o.remove());
            });

            // 🧹 Optimizar PNG
            try {
              const sharp = await import("sharp");
              await sharp.default(capturePath)
                .png({ compressionLevel: 9, adaptiveFiltering: true })
                .toFile(capturePath + ".tmp");
              fs.renameSync(capturePath + ".tmp", capturePath);
              console.log(`💾 Captura optimizada: ${filename}`);
            } catch {
              console.log("⚙️ Sharp no instalado — guardando PNG original.");
            }

            totalCapturas++;
          } else {
            await tab.screenshot({ path: capturePath, fullPage: true });
            console.log(`⚠️ Selector no encontrado → captura completa: ${filename}`);
            totalCapturas++;
          }

          metadata.push({
            criterio,
            selector,
            impacto: impact,
            archivo: filename,
            url: page.url,
            origen,
          });
        } catch (err) {
          totalErrores++;
          console.error(`❌ Error capturando ${selector}: ${err.message}`);
        }
      }

      if (!tab.isClosed()) await tab.close();
    } catch (err) {
      totalErrores++;
      console.error(`❌ Error abriendo ${page.url}: ${err.message}`);
      if (!tab.isClosed()) await tab.close();
    }
  }

  await browser.close();

  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  console.log(`\n💾 Metadatos guardados en: ${path.basename(METADATA_FILE)}`);

  console.log("\n===========================================");
  console.log("📊 RESUMEN DE CAPTURAS WCAG");
  console.log("-------------------------------------------");
  console.log(`✅ Capturas generadas: ${totalCapturas}`);
  console.log(`⚠️ Duplicados omitidos: ${totalOmitidas}`);
  console.log(`❌ Errores: ${totalErrores}`);
  console.log(`📁 Carpeta destino: ${CAPTURAS_DIR}`);
  console.log("===========================================");
  console.log("✅ Generación de evidencias completada correctamente.");
}

// ----------------------------------------------------------
// Ejecutar
// ----------------------------------------------------------
generateCaptures().catch((err) => {
  console.error("❌ Error general en generación de capturas:", err);
  process.exit(1);
});



