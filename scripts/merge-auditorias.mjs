/**
 * ♿ IAAP PRO v4.13.1 — Merge de auditorías de accesibilidad
 * ---------------------------------------------------------
 * Une los resultados de:
 *  - auditorias/auditoria-sitemap/results.json
 *  - auditorias/auditoria-interactiva/results.json
 *  - auditorias/auditoria-interactiva/results-batch-*.json (si existen)
 *
 * Genera:
 *  - auditorias/reportes/merged-results.json
 *  - auditorias/reportes/merged-summary.md
 *  - auditorias/results-merged-[timestamp].json (compatibilidad)
 */

import fs from "fs";
import path from "path";

// =====================================================
// 📁 Configuración de rutas
// =====================================================
const rootDir = process.cwd();
const auditoriasDir = path.join(rootDir, "auditorias");
const outputDir = path.join(auditoriasDir, "reportes");
const mergedFile = path.join(outputDir, "merged-results.json");
const summaryFile = path.join(outputDir, "merged-summary.md");

// Crear carpeta de salida si no existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Carpeta creada: ${outputDir}`);
}

// =====================================================
// 📦 Fuentes de resultados base
// =====================================================
const fuentes = [
  "auditoria-sitemap/results.json",
  "auditoria-interactiva/results.json",
];

let merged = [];
let total = 0;

// =====================================================
// 🔍 Leer y unir resultados base
// =====================================================
for (const fuente of fuentes) {
  const filePath = path.join(auditoriasDir, fuente);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.trim()) continue;

      // Validar formato JSON
      if (!raw.trim().startsWith("[") && !raw.trim().startsWith("{")) {
        console.warn(`⚠️ ${fuente} no parece un JSON válido, se omite.`);
        continue;
      }

      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : [data];
      merged.push(...arr);
      total += arr.length;
      console.log(`📥 ${arr.length} resultados añadidos desde ${fuente}`);
    } catch (err) {
      console.error(`❌ Error al leer ${fuente}: ${err.message}`);
    }
  } else {
    console.warn(`⚠️ No se encontró ${fuente}, se omitirá.`);
  }
}

// =====================================================
// 🧩 Integrar resultados por lotes (paralelismo CI)
// =====================================================
const batchDir = path.join(auditoriasDir, "auditoria-interactiva");
if (fs.existsSync(batchDir)) {
  const batchFiles = fs
    .readdirSync(batchDir)
    .filter((f) => f.startsWith("results-batch-") && f.endsWith(".json"));
  if (batchFiles.length > 0) {
    console.log(`🧩 Detectados ${batchFiles.length} archivos de lotes paralelos.`);
    for (const f of batchFiles) {
      try {
        const raw = fs.readFileSync(path.join(batchDir, f), "utf8");
        if (!raw.trim()) continue;
        const data = JSON.parse(raw);
        const arr = Array.isArray(data) ? data : [data];
        merged.push(...arr);
        total += arr.length;
        console.log(`📦 ${arr.length} resultados añadidos desde ${f}`);
      } catch (err) {
        console.warn(`⚠️ No se pudo leer ${f}: ${err.message}`);
      }
    }
  }
}

if (merged.length === 0) {
  console.error("❌ No hay resultados para combinar. Ejecuta las auditorías primero.");
  process.exit(1);
}

// =====================================================
// 🧩 Eliminar duplicados (por page + selector + origen)
// =====================================================
const uniqueResults = Object.values(
  merged.reduce((acc, r) => {
    const key = `${r.page || r.url}::${r.selector || "body"}::${r.origen || "desconocido"}`;
    acc[key] = r;
    return acc;
  }, {})
);

// ✅ Ordenar resultados por página (mejora de legibilidad)
uniqueResults.sort((a, b) => (a.page || "").localeCompare(b.page || ""));

fs.writeFileSync(mergedFile, JSON.stringify(uniqueResults, null, 2));
console.log(`✅ Archivo combinado creado en: ${mergedFile}`);
console.log(`📊 Total combinado: ${uniqueResults.length} resultados únicos (${total} originales)`);

// =====================================================
// 📊 Generar resumen Markdown
// =====================================================
const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 };
uniqueResults.forEach((item) => {
  item.violations?.forEach((v) => {
    const impact = v.impact?.toLowerCase() || "unclassified";
    if (byImpact[impact] !== undefined) byImpact[impact]++;
  });
});

let summary = `# ♿ Informe Consolidado IAAP PRO v4.13.1\n\n`;
summary += `📅 Fecha de generación: ${new Date().toISOString().replace("T", " ").split(".")[0]}\n\n`;
summary += `📊 **Total de resultados combinados:** ${uniqueResults.length}\n\n`;

summary += `| Severidad | Nº de violaciones |\n|------------|------------------|\n`;
for (const [impact, count] of Object.entries(byImpact)) {
  summary += `| ${impact} | ${count} |\n`;
}
summary += `\n## 🧭 Detalle por página\n\n`;

const byPage = {};
uniqueResults.forEach((item) => {
  const page = item.page || item.url || "(sin URL)";
  if (!byPage[page]) byPage[page] = [];
  byPage[page].push(...(item.violations || []));
});

for (const [page, violations] of Object.entries(byPage)) {
  summary += `### 🌐 ${page}\n`;
  if (violations.length === 0) {
    summary += `- ✅ Sin violaciones detectadas.\n\n`;
  } else {
    violations.forEach((v) => {
      summary += `- **${v.id}** (${v.impact || "?"}) → ${v.help}\n`;
    });
    summary += `\n`;
  }
}

fs.writeFileSync(summaryFile, summary, "utf8");
console.log(`📝 Resumen Markdown generado: ${summaryFile}`);

// =====================================================
// 💾 Registrar ruta final del merge
// =====================================================
fs.writeFileSync(path.join(auditoriasDir, "last-merged.txt"), mergedFile, "utf8");
console.log("💾 Ruta registrada en auditorias/last-merged.txt");

// =====================================================
// 🧠 Copia de compatibilidad con versiones anteriores
// =====================================================
try {
  const legacyCopy = path.join(auditoriasDir, `results-merged-${Date.now()}.json`);
  fs.copyFileSync(mergedFile, legacyCopy);
  console.log(`🧩 Copia de compatibilidad creada: ${legacyCopy}`);
} catch (err) {
  console.warn(`⚠️ No se pudo crear la copia de compatibilidad: ${err.message}`);
}

console.log("🎯 Merge completado con éxito (IAAP PRO v4.13.1)");
