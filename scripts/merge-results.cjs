/**
 * 🧩 merge-results.cjs (versión limpia y robusta)
 * --------------------------------------------------------------
 * Combina resultados de auditorías WCAG:
 *   - Auditoría general (sitemap)
 *   - Auditoría interactiva (modales, menús, banners)
 *
 * ✅ Incluye páginas con errores de carga (errorMessage)
 * ✅ Elimina URLs sin violaciones reales
 * ✅ Normaliza estructura y elimina duplicados
 * ✅ Muestra resumen estadístico por severidad y origen
 * ✅ Compatible con export-to-xlsx.mjs y Node 20+
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// 🔍 Buscar recursivamente results.json (excepto los merged previos)
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

// ⚙️ Validación inicial
if (!fs.existsSync(AUDITORIAS_DIR)) {
  console.error("❌ No existe el directorio /auditorias");
  process.exit(1);
}

const resultFiles = findResultFiles(AUDITORIAS_DIR);
if (resultFiles.length === 0) {
  console.error("❌ No se encontraron archivos results.json para combinar.");
  process.exit(0);
}

console.log(`📦 Archivos detectados para combinar: ${resultFiles.length}`);

let mergedResults = [];

// 🧩 Cargar y normalizar cada archivo de resultados
for (const file of resultFiles) {
  try {
    const jsonData = JSON.parse(fs.readFileSync(file, "utf8"));
    const relative = path.relative(AUDITORIAS_DIR, file);

    // 🧠 Detectar origen
    let origen = "sitemap";
    if (relative.includes("interactiva")) origen = "interactiva";

    const items = Array.isArray(jsonData) ? jsonData : [jsonData];

    items.forEach((item) => {
      if (!item) return;

      const url = item.url || item.page;
      item.origen = item.origen || origen;
      item.url = url;

      // 🔸 Si hay error de carga, incluirlo como violación simbólica
      if (item.error) {
        item.violations = [
          {
            id: "error-carga",
            impact: "minor",
            description:
              "Error de análisis — No se pudo cargar o auditar el contenido de esta página.",
            help: item.errorMessage || "Verifica la disponibilidad del sitio o CORS.",
            nodes: [],
          },
        ];
      }

      // 🧹 Solo guardar si hay violaciones reales (o simbólicas por error)
      if (url && Array.isArray(item.violations) && item.violations.length > 0) {
        mergedResults.push(item);
      }
    });

    console.log(`✅ Archivo combinado: ${relative} (${origen})`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

// 🧽 Eliminar duplicados exactos (misma URL + mismo set de violaciones)
const uniqueResults = mergedResults.filter(
  (item, index, self) =>
    index ===
    self.findIndex(
      (t) =>
        t.url === item.url &&
        t.origen === item.origen &&
        JSON.stringify(t.violations.map((v) => v.id).sort()) ===
          JSON.stringify(item.violations.map((v) => v.id).sort())
    )
);

// 📊 Generar estadísticas por origen
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
};

uniqueResults.forEach((page) => {
  const origen = page.origen || "sitemap";
  stats[origen].urls.add(page.url);

  page.violations.forEach((v) => {
    stats[origen].total++;
    const impact = v.impact?.toLowerCase();
    if (impact && stats[origen][impact] !== undefined) {
      stats[origen][impact]++;
    }
  });
});

// 🕒 Crear archivo final con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
fs.writeFileSync(outputFile, JSON.stringify(uniqueResults, null, 2), "utf8");

// 🧠 Mostrar resumen
console.log("===============================================");
console.log("📊 RESULTADOS COMBINADOS DE AUDITORÍA WCAG");
console.log(`→ Archivo generado: ${outputFile}`);
console.log("--------------------------------------------------");

for (const origen of Object.keys(stats)) {
  const s = stats[origen];
  if (s.total === 0) continue;
  console.log(`🔹 ${origen.toUpperCase()}:`);
  console.log(`   • URLs con violaciones: ${s.urls.size}`);
  console.log(`   • Violaciones totales: ${s.total}`);
  console.log(`     - critical: ${s.critical}`);
  console.log(`     - serious: ${s.serious}`);
  console.log(`     - moderate: ${s.moderate}`);
  console.log(`     - minor: ${s.minor}`);
  console.log("--------------------------------------------------");
}

const totalUrls = new Set([...stats.sitemap.urls, ...stats.interactiva.urls]).size;
const totalViolations = stats.sitemap.total + stats.interactiva.total;

console.log(`🌍 Cobertura total: ${totalUrls} URLs con violaciones`);
console.log(`♿ Violaciones totales combinadas: ${totalViolations}`);
console.log("✅ Combinación finalizada correctamente.");
console.log("===============================================");

process.exit(0);
