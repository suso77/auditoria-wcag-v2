/**
 * 🧩 merge-results.cjs
 * ------------------------------------------------------------
 * Combina los resultados parciales generados por Cypress + axe-core
 * en un solo archivo results-merged-[fecha].json dentro de /auditorias.
 * ------------------------------------------------------------
 * ✅ Totalmente CommonJS (sin import.meta.url)
 * ✅ Crea el directorio /auditorias si no existe
 * ✅ Acepta tanto arrays como objetos { violations }
 * ✅ Registra logs claros para GitHub Actions
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// Crear el directorio si no existe
if (!fs.existsSync(AUDITORIAS_DIR)) {
  fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
  console.log("📁 Directorio 'auditorias' creado automáticamente.");
}

// Buscar todos los archivos results-*.json
const resultFiles = fs
  .readdirSync(AUDITORIAS_DIR)
  .filter(f => f.startsWith("results-") && f.endsWith(".json") && !f.includes("merged"));

if (resultFiles.length === 0) {
  console.error("❌ No se encontraron archivos results-*.json para combinar.");
  process.exit(0);
}

console.log(`📦 Archivos a combinar: ${resultFiles.length}`);

// Combinar resultados
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

if (mergedResults.length === 0) {
  console.error("❌ No se encontraron datos válidos para combinar.");
  process.exit(1);
}

// Crear nombre con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);

// Guardar archivo combinado
fs.writeFileSync(outputFile, JSON.stringify(mergedResults, null, 2), "utf8");

console.log("===============================================");
console.log("📊 Resultados combinados correctamente:");
console.log(`→ Archivo: ${outputFile}`);
console.log(`→ Total de páginas analizadas: ${mergedResults.length}`);
console.log("✅ Combinación de resultados finalizada sin errores.");
console.log("===============================================");

process.exit(0);
