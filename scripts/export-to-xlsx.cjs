/**
 * ♿ export-to-xlsx.cjs
 * ------------------------------------------------------------
 * Genera informe Excel profesional WCAG + evidencias + ZIP
 * ------------------------------------------------------------
 * ✅ Compatible con Node.js 20 (CommonJS puro)
 * ✅ Usa mapas automáticos: wcag-map-axe.cjs + wcag-map-full.cjs
 * ✅ Crea Informe.xlsx y ZIP con evidencias
 * ✅ Limpia archivos intermedios al final
 */

const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");
const ExcelJS = require("exceljs");
const archiver = require("archiver");
const wcagMapAxe = require("./wcag-map-axe.cjs");
const wcagMapFull = require("./wcag-map-full.cjs");

(async () => {
  // 📁 Rutas principales
  const ROOT_DIR = process.cwd();
  const auditoriasDir = path.join(ROOT_DIR, "auditorias");
  const screenshotsDir = path.join(ROOT_DIR, "cypress", "screenshots");
  const plantillaPath = path.join(ROOT_DIR, "Informe.xlsx");

  // 🔗 Variables de entorno (para GitHub Actions)
  const REPO_URL =
    process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_NUMBER
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}/tree/main/cypress/screenshots`
      : null;

  // 🧠 Cabeceras del informe Excel
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

  // 🔍 Buscar el último results-merged-*.json
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

  // 📁 Crear carpeta de evidencias
  const fecha = format(new Date(), "yyyy-MM-dd");
  const evidenciasDir = path.join(auditoriasDir, `${fecha}-evidencias`);
  if (!fs.existsSync(evidenciasDir)) {
    fs.mkdirSync(evidenciasDir, { recursive: true });
    console.log(`📸 Carpeta de evidencias creada: ${evidenciasDir}`);
  }

  /**
   * 🔎 Obtener información WCAG combinando mapas axe + full
   */
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

  /**
   * 📸 Copiar evidencia local si existe
   */
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
      } catch {
        console.warn(`⚠️ No se pudo copiar ${fileName}`);
      }
    }
    return "Sin captura disponible";
  }

  // 🧩 Insertar datos en el Excel
  for (const page of data) {
    const { url, violations } = page;
    if (!violations?.length) continue;

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

  // 📦 Guardar informe final
  const outputPath = path.join(auditoriasDir, `Informe-${fecha}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Informe Excel generado: ${outputPath}`);

  // 🗜️ Crear ZIP con el informe y las evidencias
  const zipPath = path.join(auditoriasDir, `Informe-WCAG-${fecha}.zip`);
  await crearZIP(zipPath, outputPath, evidenciasDir);
  console.log(`🗜️ ZIP final creado: ${zipPath}`);

  /**
   * 🔧 Función para crear ZIP
   */
  function crearZIP(zipPath, informePath, evidenciasDir) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.file(informePath, { name: path.basename(informePath) });
      if (fs.existsSync(evidenciasDir)) {
        archive.directory(evidenciasDir, path.basename(evidenciasDir));
      }
      archive.finalize();
    });
  }

  // 🧹 Limpieza de archivos intermedios
  console.log("🧹 Limpiando archivos intermedios...");
  const patrones = [/^results-merged-/, /^.*-results\.json$/, /^.*-results-fixed\.json$/];
  const filesToDelete = fs.readdirSync(auditoriasDir);
  for (const file of filesToDelete) {
    if (patrones.some(p => p.test(file))) {
      try {
        fs.unlinkSync(path.join(auditoriasDir, file));
      } catch {}
    }
  }
  console.log("✅ Limpieza completada.");
  console.log("♿ Auditoría completada correctamente.");
})();
