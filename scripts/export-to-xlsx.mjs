/**
 * 📊 export-to-xlsx.mjs (v3.6 IAAP / W3C)
 * --------------------------------------------------------------
 * Genera informe profesional WCAG:
 *  - Traduce automáticamente las descripciones.
 *  - Agrupa por severidad y criterio WCAG.
 *  - Incluye capturas (si existen).
 * --------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import ExcelJS from "exceljs";
import archiver from "archiver";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDITORIAS_DIR = path.join(process.cwd(), "auditorias");

// ===========================================================
// 🌍 Traducción con caché (DeepLx API libre)
// ===========================================================
const cache = new Map();
async function traducir(texto) {
  if (!texto || texto.length < 4) return texto;
  if (cache.has(texto)) return cache.get(texto);

  // ya en español
  if (/[áéíóúñ¿¡]/i.test(texto)) return texto;

  try {
    const { stdout } = await execAsync(
      `curl -s -X POST "https://api-free.deeplx.org/translate" -H "Content-Type: application/json" -d '{"text": ${JSON.stringify(
        texto
      )}, "source_lang": "EN", "target_lang": "ES"}'`,
      { timeout: 4000 }
    );
    const res = JSON.parse(stdout);
    const tr = res?.data?.translations?.[0]?.text?.trim() || texto;
    cache.set(texto, tr);
    return tr;
  } catch {
    cache.set(texto, texto);
    return texto;
  }
}
// ===========================================================
// 📘 Diccionario base de criterios WCAG (v4.9 completo)
// -----------------------------------------------------------
// Asociación entre IDs de axe-core y criterios WCAG 2.1 / 2.2
// Cada entrada sigue la estructura:
//   "<axe-id>": "<criterio> <nombre> (<nivel>)"
// ===========================================================
const wcagMap = {
  // =======================================================
  // 🧭 PRINCIPIO 1: Perceptible
  // =======================================================

  // Texto alternativo
  "image-alt": "1.1.1 Contenido no textual (A)",
  "area-alt": "1.1.1 Contenido no textual (A)",
  "object-alt": "1.1.1 Contenido no textual (A)",
  "input-image-alt": "1.1.1 Contenido no textual (A)",

  // Adaptable
  "aria-hidden-focus": "1.3.1 Información y relaciones (A)",
  "aria-allowed-attr": "1.3.1 Información y relaciones (A)",
  "aria-allowed-role": "1.3.1 Información y relaciones (A)",
  "label-title-only": "1.3.1 Información y relaciones (A)",
  "form-field-multiple-labels": "1.3.1 Información y relaciones (A)",
  "definition-list": "1.3.1 Información y relaciones (A)",

  // Contraste y color
  "color-contrast": "1.4.3 Contraste (AA)",
  "color-contrast-enhanced": "1.4.6 Contraste (AAA)",
  "link-in-text-block": "1.4.1 Uso del color (A)",
  "meta-viewport": "1.4.4 Cambio de tamaño del texto (AA)",
  "scrollable-region-focusable": "1.4.10 Reflujo (AA)",
  "video-caption": "1.2.2 Subtítulos (A)",

  // Contenido auditivo y visual
  "video-description": "1.2.5 Descripción de audio (AA)",
  "audio-control": "1.4.2 Control de audio (A)",
  "frame-title": "1.3.1 Información y relaciones (A)",
  "frame-tested": "1.1.1 Contenido no textual (A)",

  // Idioma y contenido textual
  "html-has-lang": "3.1.1 Idioma de la página (A)",
  "html-lang-valid": "3.1.2 Idioma de las partes (AA)",
  "valid-lang": "3.1.2 Idioma de las partes (AA)",

  // =======================================================
  // 🧭 PRINCIPIO 2: Operable
  // =======================================================

  // Navegación por teclado
  "focus-visible": "2.4.7 Foco visible (AA)",
  "focus-order": "2.4.3 Orden del foco (A)",
  "tabindex": "2.1.1 Teclado (A)",
  "skip-link": "2.4.1 Evitar bloques (A)",
  "bypass": "2.4.1 Evitar bloques (A)",
  "target-size": "2.5.8 Tamaño del objetivo (AA)",

  // Enlaces y navegación
  "link-name": "2.4.4 Propósito del enlace (A)",
  "link-in-text-block": "2.4.4 Propósito del enlace (A)",
  "page-has-heading-one": "2.4.6 Encabezados y etiquetas (AA)",
  "landmark-one-main": "1.3.1 Información y relaciones (A)",

  // Temporizadores y control del tiempo
  "meta-refresh": "2.2.1 Tiempo ajustable (A)",
  "no-autoplay-audio": "1.4.2 Control de audio (A)",

  // Gestos y movimiento
  "motion-actuation": "2.5.4 Activación por movimiento (A)",
  "dragging-movements": "2.5.7 Arrastrar movimientos (AA)",

  // =======================================================
  // 🧭 PRINCIPIO 3: Comprensible
  // =======================================================

  // Formularios, etiquetas y errores
  "label": "3.3.2 Etiquetas o instrucciones (A)",
  "label-content-name-mismatch": "2.5.3 Etiqueta en el nombre (A)",
  "form-field-has-label": "3.3.2 Etiquetas o instrucciones (A)",
  "input-button-name": "4.1.2 Nombre, función, valor (A)",
  "select-name": "4.1.2 Nombre, función, valor (A)",
  "aria-required-parent": "3.3.1 Identificación de errores (A)",
  "aria-required-children": "3.3.1 Identificación de errores (A)",
  "aria-input-field-name": "3.3.2 Etiquetas o instrucciones (A)",

  // Lenguaje legible
  "html-has-lang": "3.1.1 Idioma de la página (A)",
  "html-lang-valid": "3.1.2 Idioma de las partes (AA)",
  "valid-lang": "3.1.2 Idioma de las partes (AA)",
  "duplicate-id": "4.1.1 Procesamiento (A)",

  // Navegación y coherencia
  "heading-order": "2.4.6 Encabezados y etiquetas (AA)",
  "aria-level": "2.4.6 Encabezados y etiquetas (AA)",
  "consistent-navigation": "3.2.3 Navegación consistente (AA)",
  "consistent-identification": "3.2.4 Identificación consistente (AA)",
  "aria-roles": "4.1.2 Nombre, función, valor (A)",

  // =======================================================
  // 🧭 PRINCIPIO 4: Robusto
  // =======================================================

  // ARIA y roles
  "aria-allowed-role": "4.1.2 Nombre, función, valor (A)",
  "aria-required-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-valid-attr-value": "4.1.2 Nombre, función, valor (A)",
  "aria-valid-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-allowed-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-command-name": "4.1.2 Nombre, función, valor (A)",
  "aria-prohibited-attr": "4.1.2 Nombre, función, valor (A)",

  // Semántica y estructura
  "duplicate-id": "4.1.1 Procesamiento (A)",
  "landmark-no-duplicate-banner": "4.1.1 Procesamiento (A)",
  "landmark-unique": "4.1.1 Procesamiento (A)",
  "html-namespace": "4.1.1 Procesamiento (A)",

  // Programación y validación
  "valid-html": "4.1.1 Procesamiento (A)",
  "region": "4.1.2 Nombre, función, valor (A)",
  "role-img-alt": "1.1.1 Contenido no textual (A)",
  "aria-hidden-body": "4.1.2 Nombre, función, valor (A)",
  "meta-refresh-no-exceed": "2.2.4 Interrupciones (AAA)",

  // =======================================================
  // 🧩 Casos de validación comunes adicionales
  // =======================================================
  "button-name": "4.1.2 Nombre, función, valor (A)",
  "image-redundant-alt": "1.1.1 Contenido no textual (A)",
  "image-redundant-role": "1.1.1 Contenido no textual (A)",
  "html-xml-lang-mismatch": "3.1.1 Idioma de la página (A)",
  "empty-heading": "2.4.6 Encabezados y etiquetas (AA)",
  "empty-table-header": "1.3.1 Información y relaciones (A)",
  "aria-toggle-field-name": "4.1.2 Nombre, función, valor (A)",
  "aria-tooltip-name": "4.1.2 Nombre, función, valor (A)",
  "aria-hidden-focus": "1.3.1 Información y relaciones (A)",
  "role-presentation": "1.3.1 Información y relaciones (A)",
  "html-lang": "3.1.1 Idioma de la página (A)",
  "html-lang-mismatch": "3.1.1 Idioma de la página (A)",
  "aria-roles": "4.1.2 Nombre, función, valor (A)",
  "aria-label": "4.1.2 Nombre, función, valor (A)",
  "aria-describedby": "4.1.2 Nombre, función, valor (A)",
  "aria-labelledby": "4.1.2 Nombre, función, valor (A)",
  "aria-valid-role": "4.1.2 Nombre, función, valor (A)",
  "aria-dpub": "4.1.2 Nombre, función, valor (A)",
  "aria-required-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-required-children": "1.3.1 Información y relaciones (A)",
  "aria-required-parent": "1.3.1 Información y relaciones (A)",
  "aria-valid-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-valid-attr-value": "4.1.2 Nombre, función, valor (A)",
  "aria-allowed-attr": "4.1.2 Nombre, función, valor (A)",
  "aria-allowed-role": "4.1.2 Nombre, función, valor (A)",
  "aria-hidden-focus": "1.3.1 Información y relaciones (A)",
};

// ===========================================================
// 🖼️ Cargar metadatos de capturas
// ===========================================================
const capturasMetaPath = path.join(AUDITORIAS_DIR, "capturas-metadata.json");
let capturasMeta = [];
if (fs.existsSync(capturasMetaPath)) {
  try {
    capturasMeta = JSON.parse(fs.readFileSync(capturasMetaPath, "utf8"));
  } catch {
    capturasMeta = [];
  }
}

// ===========================================================
// 🔍 Archivo combinado más reciente
// ===========================================================
const merged = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
  .sort()
  .reverse()[0];

if (!merged) {
  console.error("❌ No se encontró results-merged-*.json");
  process.exit(1);
}
const mergedPath = path.join(AUDITORIAS_DIR, merged);
const data = JSON.parse(fs.readFileSync(mergedPath, "utf8"));

// ===========================================================
// 🧩 Crear libro Excel profesional
// ===========================================================
const wb = new ExcelJS.Workbook();
wb.creator = "Auditoría WCAG Automatizada";
wb.created = new Date();

async function crearHoja(nombre, origen) {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = [
    { header: "ID", key: "id", width: 20 },
    { header: "Criterio WCAG", key: "criterio", width: 35 },
    { header: "Impacto", key: "impact", width: 15 },
    { header: "Resumen", key: "resumen", width: 70 },
    { header: "Selector", key: "selector", width: 70 },
    { header: "Página", key: "url", width: 70 },
    { header: "Captura", key: "captura", width: 40 },
  ];
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };

  const colorPorImpacto = {
    critical: "FFFF0000",
    serious: "FFFF6600",
    moderate: "FFFFC000",
    minor: "FF92D050",
  };

  const rows = data.filter((x) => x.origen === origen);
  for (const page of rows) {
    for (const v of page.violations || []) {
      const crit = wcagMap[v.id] || v.tags?.find((t) => t.startsWith("wcag")) || "";
      const resumen = await traducir(v.help || v.description || "(sin descripción)");
      const selector = v.nodes?.[0]?.target?.join(", ") || "(sin selector)";

      const captura = capturasMeta.find(
        (c) => c.url === page.url && c.criterio === v.id && c.origen === origen
      );
      const enlaceCaptura = captura
        ? { text: "Ver captura", hyperlink: `capturas/${captura.origen}/${captura.archivo}` }
        : "(sin captura)";

      const row = hoja.addRow({
        id: v.id,
        criterio: crit,
        impact: v.impact,
        resumen,
        selector,
        url: { text: page.url, hyperlink: page.url },
        captura: enlaceCaptura,
      });

      if (colorPorImpacto[v.impact]) {
        row.getCell("impact").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: colorPorImpacto[v.impact] },
        };
      }
    }
  }

  hoja.autoFilter = { from: "A1", to: "G1" };
}

await crearHoja("Auditoría Sitemap", "sitemap");
await crearHoja("Auditoría Interactiva", "interactiva");

// ===========================================================
// 📈 Resumen ejecutivo
// ===========================================================
const resumen = wb.addWorksheet("Resumen por Criterio");
resumen.columns = [
  { header: "Criterio WCAG", key: "criterio", width: 40 },
  { header: "Críticas", key: "critical", width: 12 },
  { header: "Graves", key: "serious", width: 12 },
  { header: "Moderadas", key: "moderate", width: 12 },
  { header: "Menores", key: "minor", width: 12 },
  { header: "Total", key: "total", width: 12 },
];

const conteo = {};
for (const p of data)
  for (const v of p.violations || []) {
    const crit = wcagMap[v.id] || v.id;
    const impact = (v.impact || "").toLowerCase();
    if (!conteo[crit]) conteo[crit] = { criterio: crit, critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
    if (conteo[crit][impact] !== undefined) conteo[crit][impact]++;
    conteo[crit].total++;
  }

Object.values(conteo)
  .sort((a, b) => b.total - a.total)
  .forEach((r) => resumen.addRow(r));
resumen.getRow(1).font = { bold: true };

// ===========================================================
// 💾 Guardar Excel y ZIP
// ===========================================================
const excelPath = path.join(AUDITORIAS_DIR, "Informe-WCAG-Profesional.xlsx");
await wb.xlsx.writeFile(excelPath);
console.log(`✅ Excel generado: ${excelPath}`);

const zipPath = path.join(AUDITORIAS_DIR, "Informe-WCAG.zip");
const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(output);
archive.file(excelPath, { name: path.basename(excelPath) });
archive.file(mergedPath, { name: path.basename(mergedPath) });

const capturasDir = path.join(AUDITORIAS_DIR, "capturas");
if (fs.existsSync(capturasDir)) archive.directory(capturasDir, "capturas");
await archive.finalize();

console.log(`📦 ZIP generado: ${zipPath}`);
console.log("✅ Exportación completada con éxito.");