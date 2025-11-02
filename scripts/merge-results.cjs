/**
 * 🧩 Combina resultados de auditorías en un solo archivo JSON
 * ------------------------------------------------------------
 * ✅ Versión CommonJS (100% compatible con Node 20 y GitHub Actions)
 * ✅ Fusiona múltiples archivos results-*.json en uno solo
 * ✅ Genera un archivo results-merged-YYYYMMDD-HHMMSS.json en /auditorias
 */

const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");
const process = require("process");

// Resolver __dirname y __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio raíz y de auditorías
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// Crear el directorio si no existe
if (!fs.existsSync(AUDITORIAS_DIR)) {
  fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
  console.log("📁 Directorio 'auditorias' creado.");
}

// Buscar todos los archivos results-*.json en el directorio de auditorías
const resultFiles = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter(f => f.startsWith("results-") && f.endsWith(".json"));

if (resultFiles.length === 0) {
  console.error("❌ No se encontraron archivos results-*.json para combinar.");
  process.exit(0);
}

console.log(`📂 Se encontraron ${resultFiles.length} archivos de resultados.`);

// Combinar todos los archivos en un solo array
let mergedResults = [];

for (const file of resultFiles) {
  const filePath = path.join(AUDITORIAS_DIR, file);
  try {
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(jsonData)) {
      mergedResults = mergedResults.concat(jsonData);
    } else if (jsonData && jsonData.violations) {
      mergedResults.push(jsonData);
    }
    console.log(`✅ Archivo combinado: ${file}`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

// Guardar el archivo combinado con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);

fs.writeFileSync(outputFile, JSON.stringify(mergedResults, null, 2), "utf8");

console.log("📊 Resultados combinados correctamente:");
console.log(`   → ${outputFile}`);
console.log(`   Total de páginas analizadas: ${mergedResults.length}`);
console.log("✅ Combinación de resultados finalizada sin errores.");

process.exit(0);


