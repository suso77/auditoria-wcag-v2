/**
 * 🧩 merge-results.cjs (versión final con resumen automático)
 * ------------------------------------------------------------
 * Combina resultados de auditorías WCAG:
 *   - Auditoría general (sitemap)
 *   - Auditoría interactiva (modales, menús, banners)
 *
 * ✅ Detección automática del origen según ruta
 * ✅ Normaliza estructura y filtra duplicados
 * ✅ Elimina registros vacíos o corruptos
 * ✅ Acepta campos "url" o "page"
 * ✅ Ordena resultados y muestra estadísticas por origen y severidad
 * ✅ Calcula cobertura total de URLs auditadas
 * ✅ Compatible con Node 20+ y GitHub Actions
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");

// 🔍 Buscar recursivamente results.json (excepto merged)
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

    // 🧩 Normalizar estructura
    const items = Array.isArray(jsonData) ? jsonData : [jsonData];
    items.forEach((item) => {
      if (!item) return;
      const url = item.url || item.page;
      if (!url || !Array.isArray(item.violations)) return;
      item.origen = item.origen || origen;
      item.url = url;
      mergedResults.push(item);
    });

    console.log(`✅ Archivo combinado: ${relative} (${origen})`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

// 🧹 Eliminar registros vacíos o corruptos
mergedResults = mergedResults.filter(
  (r) => r.url && Array.isArray(r.violations) && r.violations.length > 0
);

if (mergedResults.length === 0) {
  console.error("❌ No se encontraron datos válidos para combinar.");
  process.exit(1);
}

// 🧽 Deduplicar por URL + ID de violación + origen
const uniqueResults = mergedResults.filter(
  (item, index, self) =>
    index ===
    self.findIndex(
      (t) =>
        t.url === item.url &&
        t.origen === item.origen &&
        t.violations?.map((v) => v.id).join(",") ===
          item.violations?.map((v) => v.id).join(",")
    )
);

// 🗂️ Ordenar resultados (por origen > URL)
uniqueResults.sort((a, b) => {
  if (a.origen === b.origen) return a.url.localeCompare(b.url);
  return a.origen.localeCompare(b.origen);
});

// 📊 Estadísticas de severidades y cobertura
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

// 🕒 Crear nombre con timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);

// 💾 Guardar resultado combinado
fs.writeFileSync(outputFile, JSON.stringify(uniqueResults, null, 2), "utf8");

// 🧠 Mostrar resumen en consola
console.log("===============================================");
console.log("📊 RESULTADOS COMBINADOS DE AUDITORÍA WCAG");
console.log(`→ Archivo generado: ${outputFile}`);
console.log("--------------------------------------------------");

for (const origen of Object.keys(stats)) {
  const s = stats[origen];
  if (s.total === 0) continue;
  console.log(`🔹 ${origen.toUpperCase()}:`);
  console.log(`   • URLs auditadas: ${s.urls.size}`);
  console.log(`   • Violaciones totales: ${s.total}`);
  console.log(`     - critical: ${s.critical}`);
  console.log(`     - serious: ${s.serious}`);
  console.log(`     - moderate: ${s.moderate}`);
  console.log(`     - minor: ${s.minor}`);
  console.log("--------------------------------------------------");
}

const totalUrls = new Set([...stats.sitemap.urls, ...stats.interactiva.urls]).size;
const totalViolations = stats.sitemap.total + stats.interactiva.total;

console.log(`🌍 Cobertura total: ${totalUrls} URLs auditadas`);
console.log(`♿ Violaciones totales: ${totalViolations}`);
console.log("✅ Combinación finalizada sin errores.");
console.log("===============================================");

process.exit(0);
