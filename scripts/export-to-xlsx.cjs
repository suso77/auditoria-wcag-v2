#!/usr/bin/env node
/**
 * Generador profesional de informe de accesibilidad WCAG en Excel
 * Autor: Suso (Ilúmina Media)
 * Versión: Profesional Intermedia (con enlaces, severidad y formato de elemento afectado)
 */

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const open = require("open");
const chalk = require("chalk");
const { WCAG_TEXTOS } = require("./wcag-dictionary.js");

/* === CONFIGURACIÓN BASE === */
const auditoriasDir = path.resolve("auditorias");
const mergedPattern = /^results-merged.*\.json$/;

/* === FUNCIÓN: Buscar el archivo más reciente === */
function encontrarArchivoMerged() {
  const archivos = fs.readdirSync(auditoriasDir).filter(f => mergedPattern.test(f));
  if (archivos.length === 0) return null;
  const masReciente = archivos.sort((a, b) =>
    fs.statSync(path.join(auditoriasDir, b)).mtime - fs.statSync(path.join(auditoriasDir, a)).mtime
  )[0];
  return path.join(auditoriasDir, masReciente);
}

/* === FUNCIÓN: Formatear el campo “Elemento afectado” === */
function formatElementoAfectado(node) {
  if (!node) return "";

  const selector = node.selector || node.target || node.nodeName || "Elemento desconocido";
  const text = node.text ? node.text.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const alt = node.alt ? ` alt="${node.alt}"` : "";
  const label = node.label ? ` label="${node.label}"` : "";
  const href = node.href ? ` href="${node.href}"` : "";

  // Si es encabezado
  if (/^h[1-6]$/i.test(node.nodeName)) {
    const nivel = node.nodeName.toLowerCase().replace("h", "");
    return `<${selector}> nivel=${nivel}`;
  }

  // Si tiene texto visible
  if (text) return `<${selector}> texto="${text}"${alt}${label}${href}`;

  // Si tiene atributos alternativos
  if (alt || label) return `<${selector}>${alt}${label}${href}`;

  // Fallback
  return `<${selector}>`;
}

/* === GENERADOR DE INFORME === */
async function generarInforme() {
  console.log(chalk.cyan("📄 Cargando resultados desde:"));
  const archivo = encontrarArchivoMerged();
  if (!archivo) {
    console.error("❌ No se encontró ningún archivo results-merged-*.json");
    process.exit(1);
  }

  console.log(archivo);
  const data = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const resultados = Array.isArray(data[0]) ? data.flat() : data;

  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Informe WCAG");

  hoja.columns = [
    { header: "ID", key: "id", width: 25 },
    { header: "Sistema operativo, navegador y tecnología asistiva", key: "system", width: 40 },
    { header: "Resumen", key: "resumen", width: 60 },
    { header: "Elemento afectado", key: "elemento", width: 60 },
    { header: "Páginas Afectadas", key: "url", width: 40 },
    { header: "Resultado actual", key: "resultadoActual", width: 60 },
    { header: "Resultado esperado", key: "resultadoEsperado", width: 60 },
    { header: "Metodología de testing", key: "metodologia", width: 40 },
    { header: "Severidad", key: "impact", width: 15 },
    { header: "Criterio WCAG", key: "criterio", width: 30 },
    { header: "Captura de pantalla", key: "screenshot", width: 30 },
    { header: "Recomendación (W3C)", key: "recomendacion", width: 45 },
    { header: "Notas", key: "notas", width: 30 }
  ];

  let totalViolaciones = 0;

  resultados.forEach(pagina => {
    if (!pagina.violations) return;
    pagina.violations.forEach(v => {
      totalViolaciones++;

      // Detección del criterio WCAG
      const criterio =
        Object.keys(WCAG_TEXTOS).find(k =>
          v.tags?.some(t => t.includes(k.replace(/\./g, "")))
        ) || "";
      const info = WCAG_TEXTOS[criterio] || {};

      // Formatear el primer nodo afectado
      const nodo = v.nodes?.[0] || {};
      const elementoAfectado = formatElementoAfectado(nodo);

      // Normalizar severidad
      const severidad = v.impact
        ? v.impact.charAt(0).toUpperCase() + v.impact.slice(1)
        : "Media";

      // Construir la fila
      const fila = hoja.addRow({
        id: v.id,
        system: pagina.system || "",
        resumen: info.resumen || v.description,
        elemento: elementoAfectado,
        url: { text: pagina.url, hyperlink: pagina.url },
        resultadoActual: info.actual || v.help,
        resultadoEsperado: info.esperado || "",
        metodologia: "WCAG 2.1 / 2.2 AA (automatizado con axe-core + revisión manual)",
        impact: severidad,
        criterio: criterio
          ? `${criterio} ${info.titulo || v.help} (${info.nivel || ""})`
          : v.help,
        screenshot: "Evidencia (Página)",
        recomendacion: { text: "Ver recomendación W3C", hyperlink: info.url || v.helpUrl },
        notas: ""
      });

      // Aplicar color a la celda de severidad
      const celdaSeveridad = fila.getCell("impact");
      if (severidad === "Alta") {
        celdaSeveridad.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFF9999" } // rojo claro
        };
      } else if (severidad === "Media") {
        celdaSeveridad.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCC99" } // naranja claro
        };
      } else if (severidad === "Baja") {
        celdaSeveridad.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFCCFFCC" } // verde claro
        };
      }
    });
  });

  const nombreArchivo = `Informe-${new Date().toISOString().split("T")[0]}.xlsx`;
  const ruta = path.join(auditoriasDir, nombreArchivo);

  await workbook.xlsx.writeFile(ruta);
  console.log(chalk.green(`✅ Informe Excel generado: ${ruta}`));
  console.log(chalk.yellow(`📊 Exportando ${totalViolaciones} violaciones...`));

  try {
    await open(ruta);
  } catch {
    console.log("⚠️ No se pudo abrir automáticamente (entorno sin GUI).");
  }
}

generarInforme().catch(err => console.error(chalk.red(`❌ Error: ${err.message}`)));
