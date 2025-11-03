// ✅ scripts/export-to-xlsx.mjs (v4.0 profesional)
// Genera informe Excel profesional (formato IAAP/W3C) + ZIP con evidencias
// - Usa capturas detectadas en merge-results (campo capturePath)
// - Crea hojas: Sitemap, Interactiva, Resumen
// - Traduce, normaliza, colorea y enlaza capturas y WCAG

import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import archiver from "archiver";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { getWcagInfo } from "./wcag-map.mjs"; // 🧠 Mapa maestro WCAG

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🧠 Traducción automática inglés → español (fallback con DeepLx)
async function traducirTexto(texto) {
  if (!texto || texto.trim().length < 4) return texto;
  const esIngles =
    /^[a-zA-Z0-9 ,.'":;!?()_-]+$/.test(texto) &&
    /the|ensures|accessible|aria|contrast|element|page|role|must|should/i.test(texto);

  if (!esIngles) return texto;
  try {
    const respuesta = execSync(
      `curl -s -X POST "https://api-free.deeplx.org/translate" -H "Content-Type: application/json" -d '{"text": ${JSON.stringify(
        texto
      )}, "source_lang": "EN", "target_lang": "ES"}'`
    ).toString();
    const json = JSON.parse(respuesta);
    return json?.data?.translations?.[0]?.text || texto;
  } catch {
    return texto;
  }
}

// 🧠 Traducciones de descripciones de axe-core al español
const traducciones = {
// === PERCEPCIBLE ===
"Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds":
  "Garantiza que el contraste entre el primer plano y el fondo cumple las relaciones de contraste mínimas establecidas por la WCAG 2 (nivel AA).",
"Ensures links are distinguishable without relying on color alone":
  "Garantiza que los enlaces se distinguen sin depender exclusivamente del color.",
"Ensures images have alternate text":
  "Comprueba que las imágenes incluyen un texto alternativo que describe su propósito o contenido.",
"Ensures area elements of image maps have alternate text":
  "Verifica que las áreas de mapas de imagen tienen texto alternativo.",
"Ensures the document has a valid lang attribute":
  "Verifica que el elemento <html> define un atributo de idioma válido.",
"Ensures the document has a lang attribute":
  "Comprueba que el documento tiene un atributo de idioma establecido.",
"Ensures that scrollable region has keyboard access":
  "Garantiza que las regiones desplazables son accesibles mediante teclado.",
"Ensures landmarks are unique":
  "Comprueba que las regiones de tipo landmark (banner, main, navigation, etc.) son únicas en la página.",
"Ensures all page content is contained by landmarks":
  "Verifica que todo el contenido de la página esté contenido dentro de regiones (landmarks) accesibles.",
"Ensures elements with ARIA roles have all required states and properties":
  "Comprueba que los elementos con roles ARIA incluyen todos los atributos requeridos.",
"Ensures <iframe> and <frame> elements have a unique, non-empty title":
  "Garantiza que los elementos <iframe> o <frame> tienen un título único y descriptivo.",
"Ensures the page has at least one main landmark":
  "Verifica que la página incluye una región principal (<main>) o landmark equivalente.",
"Ensures the page has headings in a logical order":
  "Comprueba que los encabezados están estructurados jerárquicamente de forma coherente (h1 > h2 > h3...).",
"Ensures <object> elements have alternate text":
  "Verifica que los elementos <object> tienen texto alternativo adecuado.",
"Ensures that lists are structured correctly":
  "Comprueba que las listas (<ul>, <ol>, <dl>) están correctamente anidadas y estructuradas.",
"Ensures that table headers are identified using <th> elements":
  "Verifica que las celdas de cabecera de tablas están definidas con elementos <th>.",
"Ensures that tables have an associated caption or summary":
  "Comprueba que las tablas incluyen un elemento <caption> o resumen descriptivo.",
"Ensures that form elements have associated labels":
  "Garantiza que todos los campos de formulario tienen una etiqueta visible o accesible.",
"Ensures that required form fields are indicated to users":
  "Verifica que los campos obligatorios están claramente indicados a los usuarios.",
"Ensures that video elements have captions":
  "Comprueba que los elementos de vídeo tienen subtítulos sincronizados.",
"Ensures that audio elements have a transcript or description":
  "Verifica que los audios tienen transcripción o descripción textual.",
"Ensures that non-decorative images have alt text":
  "Garantiza que las imágenes con significado informativo tienen texto alternativo.",
"Ensures that decorative images are correctly hidden from assistive technologies":
  "Verifica que las imágenes decorativas estén ocultas para tecnologías de asistencia (role='presentation' o aria-hidden='true').",
"Ensures elements with role=heading have an appropriate aria-level value":
  "Comprueba que los encabezados ARIA tienen un nivel correcto mediante aria-level.",
"Ensures form field elements have accessible names":
  "Verifica que los campos de formulario tienen un nombre accesible (label o aria-label).",
"Ensures links have discernible text":
  "Garantiza que todos los enlaces contienen texto visible o nombre accesible.",
"Ensures buttons have discernible text":
  "Verifica que todos los botones tienen texto visible o etiqueta accesible.",
"Ensures every form element has a label":
  "Comprueba que cada campo de formulario tiene una etiqueta asociada.",
"Ensures input buttons have discernible text":
  "Verifica que los botones de tipo input tienen texto o atributo value accesible.",




// === OPERABLE ===
"Ensures every page has at least one heading":
  "Comprueba que la página incluye al menos un encabezado (<h1> o equivalente).",
"Ensures elements with tabindex values greater than 0 are used sparingly":
  "Revisa que los tabindex superiores a 0 se evitan o se usan con justificación.",
"Ensures interactive elements are focusable via keyboard":
  "Garantiza que los elementos interactivos son accesibles mediante teclado.",
"Ensures focusable elements have visible focus indicator":
  "Comprueba que los elementos que reciben foco muestran un indicador visible.",
"Ensures links with the same name serve a similar purpose":
  "Verifica que los enlaces con el mismo texto tienen el mismo destino o propósito.",
"Ensures users can skip repeated content":
  "Garantiza que existe un mecanismo para omitir contenido repetitivo (por ejemplo, enlace 'Saltar al contenido').",
"Ensures keyboard focus does not get trapped in any element":
  "Comprueba que el foco de teclado no queda atrapado en ningún elemento interactivo.",
"Ensures elements that open modals are operable via keyboard":
  "Verifica que los elementos que abren modales o menús pueden activarse mediante teclado.",
"Ensures auto-updating content can be paused or stopped":
  "Garantiza que el contenido que se actualiza automáticamente puede pausarse o detenerse.",
"Ensures blinking or scrolling content can be paused":
  "Verifica que los contenidos con movimiento o parpadeo se pueden pausar o detener.",
"Ensures users are not automatically redirected or refreshed without warning":
  "Evita redirecciones o recargas automáticas sin aviso al usuario.",
"Ensures that moving or flashing content meets timing requirements":
  "Comprueba que los contenidos con movimiento o parpadeo cumplen los requisitos de tiempo establecidos por WCAG 2.2.",
"Ensures all elements with ARIA roles are contained by landmarks":
  "Verifica que los elementos con roles ARIA están contenidos en regiones reconocibles (landmarks).",




// === COMPRENSIBLE ===
"Ensures form fields provide clear instructions and error messages":
  "Verifica que los campos de formulario ofrecen instrucciones y mensajes de error claros.",
"Ensures labels are descriptive and identify the purpose of the field":
  "Comprueba que las etiquetas describen correctamente el propósito del campo.",
"Ensures consistent navigation across pages":
  "Garantiza que la navegación se mantiene consistente en todas las páginas.",
"Ensures consistent identification of elements with the same function":
  "Comprueba que los elementos con la misma función son identificados de forma coherente.",
"Ensures the language of each page is identified":
  "Verifica que el idioma principal de cada página está correctamente identificado.",
"Ensures changes of context are initiated only by user action":
  "Garantiza que los cambios de contexto solo ocurren tras la acción del usuario.",
"Ensures error suggestions are provided where possible":
  "Verifica que se ofrecen sugerencias de corrección cuando se detectan errores en formularios.",
"Ensures inputs that require specific formats include examples or hints":
  "Comprueba que los campos que requieren formatos específicos incluyen ejemplos o ayudas.",




// === ROBUSTO ===
"Ensures elements with ARIA attributes have valid values":
  "Garantiza que los atributos ARIA definidos tienen valores válidos según especificación.",
"Ensures elements with ARIA roles have valid roles":
  "Comprueba que los roles ARIA utilizados son válidos.",
"Ensures elements with ARIA attributes are allowed for that role":
  "Verifica que los atributos ARIA aplicados son permitidos en el rol correspondiente.",
"Ensures unique IDs across the page":
  "Garantiza que los identificadores (ID) en la página son únicos.",
"Ensures all ARIA roles have required parent and child relationships":
  "Comprueba que los roles ARIA cumplen las relaciones jerárquicas necesarias.",
"Ensures no duplicate ARIA attributes exist on the same element":
  "Verifica que no se repiten atributos ARIA en un mismo elemento.",
"Ensures that elements with ARIA-hidden are not focusable":
  "Comprueba que los elementos ocultos con aria-hidden no son accesibles por teclado.",
"Ensures valid HTML structure according to W3C specifications":
  "Garantiza que la estructura HTML es válida según las especificaciones del W3C.",
"Ensures elements have complete start and end tags":
  "Comprueba que los elementos HTML tienen etiquetas de apertura y cierre completas.",
"Ensures all elements have unique attributes where required":
  "Verifica que los elementos que requieren atributos únicos (como ID) no los duplican.",




// === VARIOS ===
"Ensures the document has a title element":
  "Verifica que el documento tiene un título (<title>) descriptivo.",
"Ensures the document has a meta viewport tag":
  "Comprueba que el documento incluye una etiqueta meta viewport adecuada.",
"Ensures elements with tabindex are focusable":
  "Garantiza que los elementos con tabindex son accesibles mediante teclado.",
"Ensures ARIA attributes are not misused":
  "Comprueba que los atributos ARIA se usan correctamente según su función.",
"Ensures buttons have accessible names":
  "Verifica que los botones disponen de un nombre accesible.",
"Ensures headings are not empty":
  "Comprueba que los encabezados no están vacíos y aportan información significativa.",
"Ensures iframes have a unique and descriptive title":
  "Garantiza que los iframes incluyen un título único y descriptivo.",
"Ensures no element has a duplicate ID":
  "Verifica que ningún elemento HTML tiene un ID duplicado.",
"Ensures the page has only one h1 element":
  "Comprueba que la página contiene un único encabezado principal (h1).",
"Ensures table headers refer to valid cells":
  "Verifica que los encabezados de tabla (<th>) hacen referencia a celdas válidas mediante scope o headers.",
};




const wcagMap = {
// PERCEPCIBLE 🧭 — Principio 1
"image-alt": "1.1.1 Contenido no textual (A)",
"area-alt": "1.1.1 Contenido no textual (A)",
"input-image-alt": "1.1.1 Contenido no textual (A)",
"audio-caption": "1.2.1 Solo audio y solo vídeo (A)",
"video-caption": "1.2.2 Subtítulos (grabado) (A)",
"video-description": "1.2.3 Audiodescripción o alternativa para multimedia (A)",
"video-description-prerecorded": "1.2.5 Audiodescripción (AA)",
"link-in-text-block": "1.4.1 Uso del color (A)",
"color-contrast": "1.4.3 Contraste de color (AA)",
"color-contrast-enhanced": "1.4.6 Contraste mejorado (AAA)",
"focus-visible": "2.4.7 Foco visible (AA)",
"image-redundant-alt": "1.1.1 Contenido no textual (A)",
"input-button-name": "4.1.2 Nombre, función, valor (A)",
"frame-title": "2.4.1 Evitar bloques (A)",
"frame-title-unique": "2.4.1 Evitar bloques (A)",
"link-name": "2.4.4 Propósito de los enlaces (A)",
"meta-viewport": "1.4.4 Cambiar tamaño del texto (AA)",
"object-alt": "1.1.1 Contenido no textual (A)",
"svg-img-alt": "1.1.1 Contenido no textual (A)",
"text-alternatives": "1.1.1 Contenido no textual (A)",
"image-alt-complete": "1.1.1 Contenido no textual (A)",




// OPERABLE ⚙️ — Principio 2
"focus-order-semantics": "2.4.3 Orden del foco (A)",
"focus-order": "2.4.3 Orden del foco (A)",
"skip-link": "2.4.1 Evitar bloques (A)",
"bypass": "2.4.1 Evitar bloques (A)",
"page-has-heading-one": "2.4.6 Encabezados y etiquetas (AA)",
"heading-order": "2.4.6 Encabezados y etiquetas (AA)",
"heading-level": "2.4.6 Encabezados y etiquetas (AA)",
"link-purpose-in-context": "2.4.4 Propósito de los enlaces (A)",
"landmark-one-main": "2.4.1 Evitar bloques (A)",
"region": "1.3.1 Información y relaciones (A)",
"landmark-unique": "1.3.1 Información y relaciones (A)",
"landmark-no-duplicate-contentinfo": "1.3.1 Información y relaciones (A)",
"meta-refresh": "2.2.1 Tiempo ajustable (A)",
"no-autoplay-audio": "1.4.2 Control de audio (A)",
"link-in-text-block-color": "1.4.1 Uso del color (A)",
"target-size": "2.5.5 Tamaño del objetivo (AAA)",




// COMPRENSIBLE 🧠 — Principio 3
"label": "3.3.2 Etiquetas o instrucciones (A)",
"label-title-only": "3.3.2 Etiquetas o instrucciones (A)",
"label-content-name-mismatch": "3.3.2 Etiquetas o instrucciones (A)",
"form-field-multiple-labels": "3.3.2 Etiquetas o instrucciones (A)",
"input-label": "3.3.2 Etiquetas o instrucciones (A)",
"input-required": "3.3.1 Errores identificados (A)",
"aria-allowed-role": "4.1.2 Nombre, función, valor (A)",
"aria-required-attr": "4.1.2 Nombre, función, valor (A)",
"aria-hidden-focus": "4.1.2 Nombre, función, valor (A)",
"aria-input-field-name": "4.1.2 Nombre, función, valor (A)",
"aria-toggle-field-name": "4.1.2 Nombre, función, valor (A)",
"aria-tooltip-name": "4.1.2 Nombre, función, valor (A)",
"aria-progressbar-name": "4.1.2 Nombre, función, valor (A)",
"aria-meter-name": "4.1.2 Nombre, función, valor (A)",
"aria-menuitem-name": "4.1.2 Nombre, función, valor (A)",
"aria-modal-name": "4.1.2 Nombre, función, valor (A)",
"aria-multiselectable": "4.1.2 Nombre, función, valor (A)",
"aria-allowed-attr": "4.1.2 Nombre, función, valor (A)",




// ROBUSTO 🧩 — Principio 4
"html-has-lang": "3.1.1 Idioma de la página (A)",
"valid-lang": "3.1.1 Idioma de la página (A)",
"html-lang-valid": "3.1.1 Idioma de la página (A)",
"html-lang-missing": "3.1.1 Idioma de la página (A)",
"duplicate-id": "4.1.1 Procesamiento (A)",
"id-unique": "4.1.1 Procesamiento (A)",
"meta-refresh-no-exception": "2.2.1 Tiempo ajustable (A)",
"blink": "2.2.2 Pausar, detener, ocultar (A)",
"marquee": "2.2.2 Pausar, detener, ocultar (A)",
"scrolling-content": "2.2.2 Pausar, detener, ocultar (A)",
"tabindex": "2.4.3 Orden del foco (A)",
"keyboard": "2.1.1 Teclado (A)",
"no-autofocus": "3.2.2 Enfoque (A)",
"no-autoplay": "2.2.2 Pausar, detener, ocultar (A)",
"no-duplicate-id": "4.1.1 Procesamiento (A)",
"aria-roles": "4.1.2 Nombre, función, valor (A)",
"role-required-parent": "4.1.2 Nombre, función, valor (A)",
"role-required-child": "4.1.2 Nombre, función, valor (A)",
"aria-valid-attr-value": "4.1.2 Nombre, función, valor (A)",
"aria-valid-attr": "4.1.2 Nombre, función, valor (A)",
"aria-command-name": "4.1.2 Nombre, función, valor (A)",
"aria-dialog-name": "4.1.2 Nombre, función, valor (A)",
"aria-dpub-role-fallback": "4.1.2 Nombre, función, valor (A)",
"aria-hidden-body": "1.3.1 Información y relaciones (A)",
"aria-hidden-focus": "4.1.2 Nombre, función, valor (A)",
"aria-hidden-focus-empty": "4.1.2 Nombre, función, valor (A)",
"aria-allowed-attr-value": "4.1.2 Nombre, función, valor (A)",
"presentation-role-conflict": "1.3.1 Información y relaciones (A)",
"role-img-alt": "1.1.1 Contenido no textual (A)",
"role-heading-name": "2.4.6 Encabezados y etiquetas (AA)",
"role-link-name": "2.4.4 Propósito de los enlaces (A)",
"role-button-name": "4.1.2 Nombre, función, valor (A)",
"aria-treeitem-name": "4.1.2 Nombre, función, valor (A)",
"aria-gridcell-name": "4.1.2 Nombre, función, valor (A)",
"aria-combobox-name": "4.1.2 Nombre, función, valor (A)",
"aria-checkbox-name": "4.1.2 Nombre, función, valor (A)",
"aria-radio-name": "4.1.2 Nombre, función, valor (A)",
"aria-tab-name": "4.1.2 Nombre, función, valor (A)",
"aria-slider-name": "4.1.2 Nombre, función, valor (A)",
"aria-switch-name": "4.1.2 Nombre, función, valor (A)",
"aria-textbox-name": "4.1.2 Nombre, función, valor (A)",
};

// ===========================================================
// 🧾 Generador de Excel profesional
// ===========================================================
async function generateExcel() {
  console.log("📊 Iniciando exportación profesional de resultados WCAG...");

  const auditoriasDir = path.join(__dirname, "../auditorias");
  if (!fs.existsSync(auditoriasDir)) {
    console.error("❌ Carpeta /auditorias no encontrada.");
    process.exit(1);
  }

  // Cargar último results-merged
  const mergedFiles = fs
    .readdirSync(auditoriasDir)
    .filter((f) => f.startsWith("results-merged") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (mergedFiles.length === 0) {
    console.error("❌ No se encontraron archivos results-merged-*.json.");
    process.exit(1);
  }

  const latestMerged = path.join(auditoriasDir, mergedFiles[0]);
  console.log(`📄 Cargando resultados combinados desde: ${latestMerged}`);
  const results = JSON.parse(fs.readFileSync(latestMerged, "utf-8"));

  const sitemapResults = results.filter((r) => r.origen === "sitemap");
  const interactivaResults = results.filter((r) => r.origen === "interactiva");

  const workbook = new ExcelJS.Workbook();

  // ===========================================================
// 🎨 Generar hoja de auditoría (versión profesional integrada con wcag-map)
// ===========================================================
async function createAuditSheet(name, data) {
  console.log(`📋 Generando hoja de auditoría ${name}...`);
  const sheet = workbook.addWorksheet(name);

  sheet.columns = [
    { header: "ID", key: "id", width: 20 },
    { header: "Criterio WCAG", key: "wcag", width: 30 },
    { header: "Severidad", key: "impact", width: 15 },
    { header: "Resumen (en español)", key: "summary", width: 70 },
    { header: "Elemento afectado", key: "element", width: 70 },
    { header: "Página analizada", key: "page", width: 60 },
    { header: "Resultado actual", key: "actual", width: 80 },
    { header: "Resultado esperado", key: "expected", width: 80 },
    { header: "Recomendación (W3C)", key: "recommendation", width: 60 },
    { header: "Captura de pantalla", key: "screenshot", width: 30 },
    { header: "Sistema", key: "system", width: 40 },
    { header: "Metodología", key: "method", width: 40 },
  ];

  // 🧱 Estilo del encabezado
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };

  const impactColors = {
    critical: "FFFF0000",
    serious: "FFFF6600",
    moderate: "FFFFC000",
    minor: "FF92D050",
  };

  const counters = { total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 };

  for (const page of data) {
    if (!Array.isArray(page.violations)) continue;

    for (const v of page.violations) {
      const node = v.nodes?.[0] || {};
      const selector = node.target?.join(", ") || page.selector || "(sin selector)";

      // 🧠 Información enriquecida desde el mapa WCAG
      const wcagInfo = getWcagInfo(v.id) || {};
      const criterio = wcagInfo.criterio || "WCAG 2.1 / 2.2";
      const helpUrl =
        wcagInfo.url ||
        v.helpUrl ||
        "https://www.w3.org/WAI/WCAG22/Understanding/";

      // 🗣️ Resumen traducido o preexistente
      let resumen =
        wcagInfo.resumen ||
        v.help ||
        v.description ||
        "(sin descripción disponible)";

      if (!traducciones[resumen]) resumen = await traducirTexto(resumen);

      // 🧾 Resultado actual y esperado (formato descriptivo)
      const resultadoActual = `Descripción: ${resumen}\nSelector: ${selector}\nHTML: ${
        node.html || "(no disponible)"
      }\n${node.failureSummary ? "Error: " + node.failureSummary : ""}`;

      const resultadoEsperado =
        wcagInfo.esperado ||
        `El elemento afectado debería cumplir el criterio "${criterio}".`;

      const impact = v.impact || "—";

      // ➕ Añadir fila al Excel
      const row = sheet.addRow({
        id: v.id,
        wcag: criterio,
        impact,
        summary: resumen,
        element: selector,
        page: page.url,
        actual: resultadoActual,
        expected: resultadoEsperado,
        recommendation: helpUrl,
        system: page.system || "macOS + Chrome (Cypress + axe-core)",
        method: "WCAG 2.1 / 2.2 (axe-core)",
      });

      // 🎨 Colorear severidad
      if (impactColors[impact]) {
        row.getCell("impact").fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: impactColors[impact] },
        };
      }

      // 🔗 Enlace a captura
      const screenshotCell = row.getCell("screenshot");
      if (page.capturePath && fs.existsSync(path.join(auditoriasDir, page.capturePath))) {
        screenshotCell.value = {
          text: "Ver captura",
          hyperlink: `./${page.capturePath}`,
        };
        screenshotCell.font = { color: { argb: "FF0563C1" }, underline: true };
      } else {
        screenshotCell.value = "(sin captura)";
        screenshotCell.font = { color: { argb: "FF7F7F7F" }, italic: true };
      }

      counters.total++;
      if (impact in counters) counters[impact]++;
    }
  }

  return counters;
}

  // ===========================================================
  // 🧾 Crear hojas principales
  // ===========================================================
  const sitemapCounters = await createAuditSheet("Auditoría Sitemap", sitemapResults);
  const interactivaCounters = await createAuditSheet("Auditoría Interactiva", interactivaResults);

  // ===========================================================
  // 📊 Resumen global
  // ===========================================================
  const resumen = workbook.addWorksheet("Resumen de Severidades");
  resumen.columns = [
    { header: "Origen", key: "origen", width: 25 },
    { header: "Total", key: "total", width: 10 },
    { header: "Críticas", key: "critical", width: 12 },
    { header: "Graves", key: "serious", width: 12 },
    { header: "Moderadas", key: "moderate", width: 12 },
    { header: "Menores", key: "minor", width: 12 },
  ];
  const header = resumen.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF305496" } };
  resumen.addRow({ origen: "Sitemap", ...sitemapCounters });
  resumen.addRow({ origen: "Interactiva", ...interactivaCounters });

  // ===========================================================
  // 💾 Guardar Excel y crear ZIP profesional
  // ===========================================================
  const excelPath = path.join(auditoriasDir, "Informe-WCAG-Profesional.xlsx");
  await workbook.xlsx.writeFile(excelPath);
  console.log(`✅ Archivo Excel profesional generado: ${excelPath}`);

  const zipPath = path.join(auditoriasDir, "Informe-WCAG.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  archive.file(excelPath, { name: path.basename(excelPath) });
  archive.file(latestMerged, { name: path.basename(latestMerged) });

  // Capturas
  const capturasDir = path.join(auditoriasDir, "capturas");
  if (fs.existsSync(capturasDir)) {
    const captures = fs.readdirSync(capturasDir).filter((f) => f.endsWith(".png"));
    if (captures.length > 0) {
      console.log(`📸 Añadiendo ${captures.length} capturas al ZIP...`);
      captures.forEach((file) => {
        archive.file(path.join(capturasDir, file), { name: `capturas/${file}` });
      });
    } else console.log("⚠️ No se encontraron capturas PNG para añadir al ZIP.");
  }

  await archive.finalize();
  console.log(`🗜️ ZIP generado correctamente: ${zipPath}`);
  console.log("✅ Exportación profesional completada con éxito.");
}

// 🚀 Ejecutar
generateExcel().catch((err) => {
  console.error("❌ Error generando informe Excel:", err);
  process.exit(1);
});