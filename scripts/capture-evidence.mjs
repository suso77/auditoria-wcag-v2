/**
 * ♿ scripts/capture-evidence.mjs — IAAP PRO v3.6 (Stable)
 * -------------------------------------------------------
 * Genera capturas automáticas con soporte CSS/XPath, overlay adaptativo
 * y fallback visual completo, listas para informes IAAP Excel.
 *
 * ✅ Compatible con Puppeteer v23+
 * ✅ Detección automática de selectores dinámicos
 * ✅ Overlay visual IAAP PRO (color por severidad)
 * ✅ Fallback completo si no se puede capturar el nodo
 * ✅ Optimización PNG + Metadatos JSON
 */

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
// 📘 Mapa descriptivo IAAP / WCAG / axe-core
// ----------------------------------------------------------
const MAPA_REGLAS = {
  "color-contrast": "Contraste insuficiente entre texto y fondo.",
  "image-alt": "La imagen no tiene texto alternativo adecuado.",
  "link-name": "Enlace sin nombre accesible o texto visible.",
  "button-name": "Botón sin etiqueta o texto accesible.",
  "label": "Campo de formulario sin etiqueta visible o asociada.",
  "aria-label": "Elemento con atributo aria-label incorrecto o vacío.",
  "aria-hidden-focus": "Elemento oculto puede recibir el foco.",
  "focus-order": "Orden de tabulación no lógico o inconsistente.",
  "focus-visible": "El foco no es visible al navegar con teclado.",
  "aria-roles": "Uso incorrecto o ausente de roles ARIA.",
  "aria-required-attr": "Faltan atributos ARIA obligatorios.",
  "aria-valid-attr": "Atributos ARIA inválidos o mal escritos.",
  "aria-valid-attr-value": "Valor de atributo ARIA no válido.",
  "heading-order": "Jerarquía incorrecta de encabezados.",
  "page-has-heading-one": "Falta encabezado principal H1.",
  "duplicate-id": "Existen elementos con el mismo ID en la página.",
  "skip-link": "Falta enlace para saltar al contenido principal.",
  "tabindex": "Uso incorrecto del atributo tabindex.",
  "region": "Faltan regiones o landmarks de navegación.",
  "list": "Estructura de lista no válida.",
  "table": "Tabla sin encabezados o relaciones de celdas.",
  "th-has-data-cells": "Encabezado de tabla sin celdas relacionadas.",
  "html-has-lang": "Falta atributo lang en el elemento HTML.",
  "lang-valid": "Valor del atributo lang no válido.",
  "meta-refresh": "Uso de meta refresh que afecta accesibilidad.",
  "blink": "Uso de parpadeo o animación excesiva.",
  "marquee": "Uso de etiquetas de desplazamiento (marquee).",
  "input-image-alt": "Botón de tipo imagen sin texto alternativo.",
  "label-content-name-mismatch": "El texto visible y el nombre accesible no coinciden.",
  "nested-interactive": "Un elemento interactivo contiene otro elemento interactivo.",
  "aria-input-field-name": "Campo ARIA sin nombre accesible.",
  "aria-toggle-field-name": "Elemento conmutador sin nombre accesible.",
  "aria-tooltip-name": "Tooltip sin nombre o texto descriptivo.",
  "aria-dialog-name": "Diálogo o modal sin nombre accesible.",
  "aria-meter-name": "Elemento meter sin nombre accesible.",
  "aria-progressbar-name": "Barra de progreso sin nombre accesible.",
  "aria-slider-name": "Control deslizante sin nombre accesible.",
  "aria-combobox-name": "Combobox sin nombre accesible.",
  "aria-tab-name": "Pestaña sin nombre accesible.",
  "aria-treeitem-name": "Elemento de árbol sin nombre accesible.",
  "aria-command-name": "Elemento de comando sin nombre accesible.",
  "audio-caption": "Contenido de audio sin subtítulos o transcripción.",
  "video-caption": "Video sin subtítulos o descripción de audio.",
  "link-in-text-block": "Varios enlaces idénticos en el mismo texto sin contexto diferenciado.",
};

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
// 🚀 Generador principal IAAP PRO
// ----------------------------------------------------------
async function generateCaptures() {
  console.log("📸 Generando capturas IAAP v3.6 XPath Compatible...");

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
    const url = page.url || page.page;
    if (!url || !Array.isArray(page.violations)) continue;

    const origen = page.origen || "sitemap";
    const carpetaOrigen = path.join(CAPTURAS_DIR, origen);
    fs.mkdirSync(carpetaOrigen, { recursive: true });

    const pageSlug = slugify(url);
    const tab = await browser.newPage();

    try {
      console.log(`\n🌍 Página: ${url}`);
      await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await tab.setViewport({ width: 1440, height: 900 });

      for (const v of page.violations) {
        const node = v.nodes?.[0];
        if (!node) continue;

        let selector = node.target?.[0] || null;
        const criterio = v.id || "sin-id";
        const impact = v.impact || "serious";

        // 🔁 Evitar duplicados
        const isDuplicado =
          PATRONES_DUPLICADOS.some((p) => selector?.includes(p)) ||
          Array.from(duplicadosGuardados).some(
            (d) => selector?.includes(d) || d.includes(selector)
          );
        if (isDuplicado) {
          if (duplicadosGuardados.has(selector)) {
            totalOmitidas++;
            continue;
          }
          duplicadosGuardados.add(selector);
        }

        // 🎯 Recuperación de selectores dinámicos
        if (!selector || selector.startsWith("#yui_") || selector.includes("sqs") || selector.includes("data-")) {
          const text = node.html?.replace(/<[^>]+>/g, "").trim();
          if (text?.length > 0) selector = `//*[contains(text(),"${text.substring(0, 25)}")]`;
          else selector = "figcaption em, em, p, span";
        }

        const selectorSlug = slugify(selector || criterio);
        const filename = `${criterio}--${selectorSlug}--${pageSlug}.png`;
        const capturePath = path.join(carpetaOrigen, filename);

        try {
          // ✨ Soporte dual CSS / XPath compatible con Puppeteer v23+
          let element = null;
          if (selector.startsWith("//")) {
            try {
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
              if (handle && (await handle.asElement())) {
                element = handle.asElement();
              }
            } catch {
              console.warn(`⚠️ XPath inválido o no encontrado: ${selector}`);
            }
          } else {
            element = await tab.$(selector);
          }

          const impactColor = {
            critical: "#d60000",
            serious: "#ff4c00",
            moderate: "#ffaa00",
            minor: "#00aaff",
          }[impact];

          await adaptCaptureToViolation(tab, selector, v, impactColor);

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
            await tab.evaluate((color) => {
              const overlay = document.createElement("div");
              overlay.className = "wcag-overlay-fallback";
              overlay.style.position = "fixed";
              overlay.style.top = "0";
              overlay.style.left = "0";
              overlay.style.width = "100vw";
              overlay.style.height = "100vh";
              overlay.style.background = `${color}22`;
              overlay.style.border = `4px dashed ${color}`;
              overlay.style.zIndex = "999999";
              document.body.appendChild(overlay);
            }, impactColor);
            await tab.screenshot({ path: capturePath, fullPage: true });
            console.log(`⚠️ Fallback visual completo: ${filename}`);
          }

          // 🧹 Optimizar PNG
          try {
            const sharp = await import("sharp");
            await sharp.default(capturePath)
              .png({ compressionLevel: 9, adaptiveFiltering: true })
              .toFile(capturePath + ".tmp");
            fs.renameSync(capturePath + ".tmp", capturePath);
          } catch {}

          // 🧽 Limpiar overlays
          await tab.evaluate(() => {
            document.querySelectorAll(".wcag-overlay, .wcag-overlay-fallback").forEach((o) => o.remove());
          });

          metadata.push({
            criterio,
            selector,
            impacto: impact,
            archivo: path.join(origen, filename),
            url,
            origen,
          });
          totalCapturas++;
        } catch (err) {
          totalErrores++;
          console.error(`❌ Error capturando ${selector}: ${err.message}`);
        }
      }

      if (!tab.isClosed()) await tab.close();
    } catch (err) {
      totalErrores++;
      console.error(`❌ Error abriendo ${url}: ${err.message}`);
      if (!tab.isClosed()) await tab.close();
    }
  }

  await browser.close();
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

  console.log("\n===========================================");
  console.log("📊 RESUMEN DE CAPTURAS WCAG IAAP v3.6");
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
// 🎨 Overlay adaptativo IAAP PRO
// ----------------------------------------------------------
async function adaptCaptureToViolation(tab, selector, v, color) {
  const descripcion = MAPA_REGLAS[v.id] || "Elemento que incumple una pauta WCAG.";

  await tab.evaluate(
    (sel, v, color, descripcion) => {
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
      label.textContent = `${v.id} (${v.impact || "sin severidad"}) — ${descripcion}`;
      label.style.position = "absolute";
      label.style.top = "-24px";
      label.style.left = "0";
      label.style.background = color;
      label.style.color = "#fff";
      label.style.fontSize = "11px";
      label.style.padding = "2px 6px";
      label.style.borderRadius = "4px";
      label.style.fontFamily = "Arial, sans-serif";
      label.style.maxWidth = "380px";
      label.style.whiteSpace = "nowrap";
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";

      overlay.appendChild(label);
      document.body.appendChild(overlay);
      el.scrollIntoView({ block: "center", inline: "center" });

      if (v.id.includes("color-contrast")) overlay.style.boxShadow = `0 0 25px ${color}`;
      else if (v.id.includes("focus")) el.focus();
      else if (v.id.includes("aria") || v.id.includes("role")) overlay.style.borderStyle = "dashed";
      else if (v.id.includes("label") || v.id.includes("form")) overlay.style.borderWidth = "4px";
      else if (v.id.includes("heading") || v.id.includes("h")) overlay.style.background = `${color}11`;
    },
    selector,
    v,
    color,
    descripcion
  );
}

// ----------------------------------------------------------
// ▶️ Ejecutar
// ----------------------------------------------------------
generateCaptures().catch((err) => {
  console.error("❌ Error general en generación de capturas:", err);
  process.exit(1);
});
