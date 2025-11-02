/**
 * 🧩 merge-results.cjs (versión mejorada)
 * ------------------------------------------------------------
 * Combina automáticamente todos los results.json encontrados
 * en auditorias/ y sus subcarpetas.
 *
 * ✅ Busca recursivamente en /auditorias
 * ✅ Soporta arrays o estructuras { url, violations }
 * ✅ Ignora archivos vacíos o corruptos
 * ✅ Crea un único results-merged-[fecha].json
 * ✅ Compatible con Node.js 20 y GitHub Actions
 */

const fs = require("fs");
const path = require("path");

// 📁 Directorio raíz
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// 🧭 Buscar archivos recursivamente
function findResultFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findResultFiles(fullPath));
    } else if (
      entry.name.match(/^results.*\.json$/i) &&
      !entry.name.includes("merged")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

if (!fs.existsSync(AUDITORIAS_DIR)) {
  console.error("❌ No existe el directorio /auditorias");
  process.exit(1);
}

const resultFiles = findResultFiles(AUDITORIAS_DIR);

if (resultFiles.length === 0) {
  console.error("❌ No se encontraron archivos results-*.json para combinar.");
  process.exit(0);
}

console.log(`📦 Archivos detectados para combinar: ${resultFiles.length}`);

// 🔄 Combinar resultados
let mergedResults = [];

for (const file of resultFiles) {
  try {
    const jsonData = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(jsonData)) {
      mergedResults = mergedResults.concat(jsonData);
    } else if (jsonData && jsonData.violations) {
      mergedResults.push(jsonData);
    }
    console.log(`✅ Archivo combinado: ${path.relative(AUDITORIAS_DIR, file)}`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

if (mergedResults.length === 0) {
  console.error("❌ No se encontraron datos válidos para combinar.");
  process.exit(1);
}

// 🕒 Crear nombre con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);

// 💾 Guardar resultado combinado
fs.writeFileSync(outputFile, JSON.stringify(mergedResults, null, 2), "utf8");

console.log("===============================================");
console.log("📊 Resultados combinados correctamente:");
console.log(`→ Archivo generado: ${outputFile}`);
console.log(`→ Total de páginas analizadas: ${mergedResults.length}`);
console.log("✅ Combinación de resultados finalizada sin errores.");
console.log("===============================================");

process.exit(0);
