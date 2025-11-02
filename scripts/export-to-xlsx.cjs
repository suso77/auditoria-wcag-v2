/**
 * ♿ export-to-xlsx.cjs (versión CommonJS corregida)
 * ------------------------------------------------------------------
 * ✅ Busca recursivamente el último results-merged-*.json
 * ✅ Genera Excel profesional WCAG 2.1 / 2.2 AA + ZIP con evidencias
 * ✅ Totalmente compatible con Node.js 20+ y GitHub Actions
 */

const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");
const ExcelJS = require("exceljs");
const archiver = require("archiver");

const wcagMapAxe = require("./wcag-map-axe.cjs");
const wcagMapFull = require("./wcag-map-full.cjs");

async function main() {
  const ROOT_DIR = process.cwd();
  const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
  const SCREENSHOTS_DIR = path.join(ROOT_DIR, "cypress", "screenshots");
  const PLANTILLA_PATH = path.join(ROOT_DIR, "Informe.xlsx");

  // 🔍 Buscar recursivamente results-merged-*.json
  function findMergedResults(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) results = results.concat(findMergedResults(fullPath));
      else if (entry.name.startsWith("results-merged-") && entry.name.endsWith(".json"))
        results.push(fullPath);
    }
    return results;
  }

  const mergedFiles = findMergedResults(AUDITORIAS_DIR)
    .map(f => ({ path: f, time: fs.statSync(f).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (!mergedFiles.length) {
    console.error("❌ No se encontró ningún archivo results-merged-*.json (ni en subcarpetas)");
    process.exit(1);
  }

  const latestFile = mergedFiles[0].path;
  console.log(`📄 Cargando resultados desde: ${latestFile}`);

  const data = JSON.parse(fs.readFileSync(latestFile, "utf8"));
  if (!Array.isArray(data) || !data.length) {
    console.error("❌ El archivo de resultados está vacío o tiene formato inválido.");
    process.exit(1);
  }

  // 📘 Crear plantilla base si no existe
  if (!fs.existsSync(PLANTILLA_PATH)) {
    console.log("⚙️ No se encontró Informe.xlsx — creando plantilla base...");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Informe WCAG");
    const HEADERS = [
      "ID",
      "Sistema operativo, navegador y tecnología asistiva",
      "Resumen",
      "Elemento afectado",
      "Página",
      "Resultado actual",
      "Resultado esperado",
      "Metodología de testing",
      "Severidad",
      "Criterio WCAG",
      "Captura de pantalla",
      "Enlace oficial (W3C)",
      "Recomendación (W3C)"
    ];
    sheet.addRow(HEADERS);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = HEADERS.map(h => ({ header: h, width: 30 }));
    await workbook.xlsx.writeFile(PLANTILLA_PATH);
    console.log(`✅ Plantilla creada: ${PLANTILLA_PATH}`);
  }

  // 📗 Cargar plantilla existente
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(PLANTILLA_PATH);
  const sheet = workbook.worksheets[0];
  let rowIndex = sheet.rowCount + 1;

  // 📁 Crear carpeta de evidencias
  const fecha = format(new Date(), "yyyy-MM-dd");
  const evidenciasDir = path.join(AUDITORIAS_DIR, `${fecha}-evidencias`);
  if (!fs.existsSync(evidenciasDir)) {
    fs.mkdirSync(evidenciasDir, { recursive: true });
    console.log(`📸 Carpeta de evidencias creada: ${evidenciasDir}`);
  }

  // 🧠 Funciones auxiliares
  function obtenerDatosWCAG(violationId, tags = []) {
    if (wcagMapAxe[violationId]) return wcagMapAxe[violationId];
    const wcagTag = tags.find(t => t.startsWith("wcag"));
    if (wcagTag) {
      const criterio = wcagTag.replace("wcag", "").replace(/(\d)(\d)(\d)/, "$1.$2.$3");
      if (wcagMapFull[criterio]) return wcagMapFull[criterio];
    }
    return {
      criterio: "Criterio WCAG no identificado",
      esperado: "Verifica manualmente la correspondencia normativa.",
      url: "https://www.w3.org/WAI/WCAG22/quickref/"
    };
  }

  function listarArchivos(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) results = results.concat(listarArchivos(filePath));
      else results.push(filePath);
    }
    return results;
  }

  function copiarEvidenciaLocal(url, violationId, evidenciasDir) {
    const domain = new URL(url).hostname.replace(/\W+/g, "-");
    const screenshotPattern = `${domain}.*${violationId}.*\\.png$`;
    const allScreens = listarArchivos(SCREENSHOTS_DIR).filter(f =>
      f.match(new RegExp(screenshotPattern, "i"))
    );
    if (allScreens.length > 0) {
      const source = allScreens[0];
      const fileName = path.basename(source);
      const destination = path.join(evidenciasDir, fileName);
      try {
        fs.copyFileSync(source, destination);
        return `Evidencias/${fileName}`;
      } catch {
        console.warn(`⚠️ No se pudo copiar ${fileName}`);
      }
    }
    return "Sin captura disponible";
  }

  // 🧩 Insertar datos en el informe
  for (const page of data) {
    const { url, violations } = page;
    if (!violations || !violations.length) continue;

    for (const v of violations) {
      const impact =
        v.impact === "critical"
          ? "Alta"
          : v.impact === "serious"
          ? "Media"
          : v.impact === "moderate"
          ? "Media"
          : v.impact === "minor"
          ? "Baja"
          : "Desconocida";

      const evidencia = copiarEvidenciaLocal(url, v.id, evidenciasDir);
      const datosWCAG = obtenerDatosWCAG(v.id, v.tags);

      const row = [
        `${v.id}-${Math.random().toString(36).substring(2, 10)}`,
        "macOS + Chrome + axe-core",
        v.description || "Descripción no disponible",
        v.nodes?.[0]?.target?.join(", ") || "(Elemento no identificado)",
        url,
        v.help || v.description || "",
        "Cumplimiento esperado según WCAG 2.1/2.2 AA",
        "WCAG 2.1 / 2.2 AA (automatizado con axe-core)",
        impact,
        datosWCAG.criterio,
        evidencia,
        datosWCAG.url,
        datosWCAG.esperado
      ];

      sheet.insertRow(rowIndex, row);
      rowIndex++;
    }
  }

  const outputPath = path.join(AUDITORIAS_DIR, `Informe-${fecha}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Informe Excel generado: ${outputPath}`);

  const zipPath = path.join(AUDITORIAS_DIR, `Informe-WCAG-${fecha}.zip`);
  await crearZIP(zipPath, outputPath, evidenciasDir);
  console.log(`🗜️ ZIP creado: ${zipPath}`);

  async function crearZIP(zipPath, informePath, evidenciasDir) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(informePath, { name: path.basename(informePath) });
      if (fs.existsSync(evidenciasDir)) archive.directory(evidenciasDir, path.basename(evidenciasDir));
      archive.finalize();
    });
  }

  console.log("♿ Auditoría completada correctamente.");
}

// 🚀 Ejecutar
main().catch(err => {
  console.error("❌ Error durante la generación del informe:", err);
  process.exit(1);
});


