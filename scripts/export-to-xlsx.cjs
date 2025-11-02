/**
 * ♿ Generador de informe Excel WCAG profesional con evidencias + ZIP + limpieza automática
 * ---------------------------------------------------------------------------------------
 * ✅ Usa la plantilla Informe.xlsx (si existe)
 * ✅ Si no existe, la crea automáticamente
 * ✅ Rellena filas desde el último results-merged-*.json
 * ✅ Copia las capturas en /auditorias/YYYY-MM-DD-evidencias/
 * ✅ Crea automáticamente un ZIP con el informe + evidencias
 * ✅ Limpia los archivos intermedios y deja solo el informe final
 */

const fs = require("fs");
const path = require("path");
import { fileURLToPath } from "url";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const auditoriasDir = path.join(__dirname, "..", "auditorias");
const screenshotsDir = path.join(__dirname, "..", "cypress", "screenshots");
const plantillaPath = path.join(__dirname, "..", "Informe.xlsx");

// 🔗 Si se ejecuta en GitHub Actions, generamos la URL base pública
const REPO_URL =
  process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_NUMBER
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/tree/main/cypress/screenshots`
    : null;

// 🧱 Cabeceras oficiales
const HEADERS = [
  "ID",
  "Sistema operativo, navegador y tecnología asistiva",
  "Resumen",
  "Elemento afectado",
  "Páginas Afectadas",
  "Resultado actual",
  "Resultado esperado",
  "Metodología de testing",
  "Severidad",
  "Criterio WCAG",
  "Captura de pantalla",
  "Recomendación (W3C)",
  "Notas"
];

// 🕵️ Buscar el último archivo results-merged-*.json
const files = fs
  .readdirSync(auditoriasDir)
  .filter(f => f.startsWith("results-merged-") && f.endsWith(".json"))
  .map(f => ({
    name: f,
    time: fs.statSync(path.join(auditoriasDir, f)).mtime.getTime()
  }))
  .sort((a, b) => b.time - a.time);

if (!files.length) {
  console.error("❌ No se encontró ningún archivo results-merged-*.json");
  process.exit(1);
}

const latestFile = path.join(auditoriasDir, files[0].name);
console.log(`📄 Cargando resultados desde: ${latestFile}`);

const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
if (!Array.isArray(data) || !data.length) {
  console.error("❌ El archivo de resultados está vacío o no tiene formato válido.");
  process.exit(1);
}

// 📘 Crear plantilla base si no existe
if (!fs.existsSync(plantillaPath)) {
  console.log("⚙️ No se encontró Informe.xlsx — creando plantilla base...");

  const baseWorkbook = new ExcelJS.Workbook();
  const sheet = baseWorkbook.addWorksheet("Informe WCAG");

  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = HEADERS.map(h => ({ header: h, width: 30 }));

  await baseWorkbook.xlsx.writeFile(plantillaPath);
  console.log(`✅ Plantilla creada automáticamente: ${plantillaPath}`);
}

// 📗 Cargar plantilla existente
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(plantillaPath);
const sheet = workbook.worksheets[0];

let rowIndex = sheet.rowCount + 1;

// 📁 Crear carpeta de evidencias (si no existe)
const fecha = format(new Date(), "yyyy-MM-dd");
const evidenciasDir = path.join(auditoriasDir, `${fecha}-evidencias`);
if (!fs.existsSync(evidenciasDir)) {
  fs.mkdirSync(evidenciasDir, { recursive: true });
  console.log(`📸 Carpeta de evidencias creada: ${evidenciasDir}`);
}

// 🧩 Insertar datos en el informe
for (const page of data) {
  const { url, violations } = page;
  if (!violations || !violations.length) continue;

  for (const v of violations) {
    const impact =
      v.impact === "critical" ? "Alta" :
      v.impact === "serious" ? "Media" :
      v.impact === "moderate" ? "Media" :
      v.impact === "minor" ? "Baja" : "Desconocida";

    const evidencia = copiarEvidenciaLocal(url, v.id, evidenciasDir);

    const row = [
      `${v.id}-${Math.random().toString(36).substring(2, 10)}`,
      "macOS + Electron/Chrome (Cypress) + axe-core",
      v.description || "Descripción no disponible",
      v.nodes?.[0]?.target?.join(", ") || "(Elemento no identificado)",
      url,
      v.help || v.description || "",
      "Cumplimiento esperado según WCAG 2.1/2.2",
      "WCAG 2.1 / 2.2 AA (automatizado con axe-core)",
      impact,
      obtenerCriterioWCAG(v.tags || []),
      evidencia,
      `https://www.w3.org/WAI/WCAG22/Understanding/${mapearCriterio(v.tags)}`,
      ""
    ];

    sheet.insertRow(rowIndex, row);
    rowIndex++;
  }
}

// 📦 Guardar informe final
const outputPath = path.join(auditoriasDir, `Informe-${fecha}.xlsx`);
await workbook.xlsx.writeFile(outputPath);

console.log(`✅ Informe generado correctamente: ${outputPath}`);
console.log(`📊 Total de filas exportadas: ${rowIndex - 2}`);
console.log(`📸 Evidencias copiadas en: ${evidenciasDir}`);

// 📦 Crear ZIP (informe + evidencias)
const zipPath = path.join(auditoriasDir, `Informe-WCAG-${fecha}.zip`);
await crearZIP(zipPath, outputPath, evidenciasDir);

console.log(`🗜️ ZIP final creado: ${zipPath}`);
console.log("✅ Auditoría completada con éxito.");

// ===========================================================
// 🔍 Funciones auxiliares (versión robusta con evidencias)
// ===========================================================

function normalizarTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);
  }
  return [];
}

function obtenerCriterioWCAG(tags) {
  const list = normalizarTags(tags);
  if (!list.length) return "";
  const wcagTag = list.find(t => t.startsWith("wcag"));
  if (!wcagTag) return "";
  const criterio = wcagTag.replace("wcag", "").replace(/(\d)(\d)(\d)/, "$1.$2.$3");
  return `WCAG ${criterio}`;
}

function mapearCriterio(tags) {
  const list = normalizarTags(tags);
  if (!list.length) return "bypass-blocks.html";
  const wcagTag = list.find(t => t.startsWith("wcag"));
  if (!wcagTag) return "bypass-blocks.html";
  const criterio = wcagTag.replace("wcag", "").replace(/(\d)(\d)(\d)/, "$1.$2.$3");
  return criterio ? criterio + ".html" : "bypass-blocks.html";
}

function copiarEvidenciaLocal(url, violationId, evidenciasDir) {
  const domain = new URL(url).hostname.replace(/\W+/g, "-");
  const screenshotPattern = `${domain}.*${violationId}.*\\.png$`;

  const allScreens = listarArchivos(screenshotsDir).filter(f =>
    f.match(new RegExp(screenshotPattern, "i"))
  );

  if (allScreens.length > 0) {
    const source = allScreens[0];
    const fileName = path.basename(source);
    const destination = path.join(evidenciasDir, fileName);

    try {
      fs.copyFileSync(source, destination);
      return `Evidencias/${fileName}`;
    } catch (err) {
      console.warn(`⚠️ No se pudo copiar ${fileName}:`, err.message);
    }
  }

  return "Sin captura disponible";
}

function listarArchivos(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(listarArchivos(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * 🗜️ Crea un ZIP con el informe y las evidencias
 */
async function crearZIP(zipPath, informePath, evidenciasDir) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`📦 ZIP creado con ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on("error", err => reject(err));

    archive.pipe(output);
    archive.file(informePath, { name: path.basename(informePath) });
    if (fs.existsSync(evidenciasDir)) {
      archive.directory(evidenciasDir, path.basename(evidenciasDir));
    }
    archive.finalize();
  });
}

// ===========================================================
// 🧹 Limpieza automática de archivos intermedios
// ===========================================================

function limpiarArchivosAntiguos() {
  console.log("🧹 Limpiando archivos intermedios...");

  const patrones = [
    /^results-merged-/,
    /^.*-results\.json$/,
    /^.*-results-fixed\.json$/,
  ];

  const files = fs.readdirSync(auditoriasDir);
  let eliminados = 0;

  for (const file of files) {
    if (patrones.some(p => p.test(file))) {
      try {
        fs.unlinkSync(path.join(auditoriasDir, file));
        eliminados++;
      } catch (err) {
        console.warn(`⚠️ No se pudo eliminar ${file}:`, err.message);
      }
    }
  }

  // Eliminar informes antiguos (mantener solo el del día)
  const hoy = format(new Date(), "yyyy-MM-dd");
  for (const file of files) {
    if (
      file.startsWith("Informe-") &&
      !file.includes(hoy) &&
      (file.endsWith(".xlsx") || file.endsWith(".zip"))
    ) {
      try {
        fs.unlinkSync(path.join(auditoriasDir, file));
        eliminados++;
      } catch (err) {
        console.warn(`⚠️ No se pudo eliminar ${file}:`, err.message);
      }
    }
  }

  console.log(`✅ Limpieza completada (${eliminados} archivos eliminados).`);
}

// Esperar a que el ZIP esté finalizado antes de limpiar
await new Promise(resolve => setTimeout(resolve, 500));
limpiarArchivosAntiguos();








