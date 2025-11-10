/**
 * ♿ IAAP PRO v4.16-H3 — Merge de auditorías de accesibilidad (Estable)
 * --------------------------------------------------------------------
 * Une los resultados de:
 *  - auditorias/auditoria-sitemap/results.json
 *  - auditorias/auditoria-interactiva/results.json
 *  - auditorias/auditoria-interactiva/results-batch-*.json (si existen)
 *  - auditorias/pa11y-results.json (HTML_CodeSniffer)
 *  - auditorias/needs_review.json (axe-core)
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
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const OUTPUT_DIR = path.join(AUDITORIAS_DIR, "reportes");
const MERGED_FILE = path.join(OUTPUT_DIR, "merged-results.json");
const SUMMARY_FILE = path.join(OUTPUT_DIR, "merged-summary.md");

// Crear carpeta de salida si no existe
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Carpeta creada: ${OUTPUT_DIR}`);
}

// =====================================================
// 📦 Fuentes base de resultados
// =====================================================
const FUENTES = [
  "auditoria-sitemap/results.json",
  "auditoria-interactiva/results.json",
  "pa11y-results.json",
  "needs_review.json",
];

let merged = [];
let total = 0;

// =====================================================
// 🔍 Leer y unir resultados base
// =====================================================
for (const fuente of FUENTES) {
  const filePath = path.join(AUDITORIAS_DIR, fuente);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.trim()) continue;

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
// 🧩 Integrar resultados por lotes (interactiva batch)
// =====================================================
const batchDir = path.join(AUDITORIAS_DIR, "auditoria-interactiva");
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
// 🔗 Normalizar estructura IAAP PRO (violations + needs_review + pa11y)
// =====================================================
const normalizados = merged.map((item) => {
  const base = {
    origen: item.origen || "combinado",
    page: item.page || item.url || "(sin URL)",
    violations: Array.isArray(item.violations) ? item.violations : [],
    needs_review: Array.isArray(item.needs_review) ? item.needs_review : [],
    pa11y: Array.isArray(item.pa11y) ? item.pa11y : [],
  };

  // Integrar si Pa11y o Needs Review están en estructuras separadas
  if (item.results && Array.isArray(item.results)) {
    base.pa11y.push(...item.results);
  }
  if (item.review && Array.isArray(item.review)) {
    base.needs_review.push(...item.review);
  }

  return base;
});

// =====================================================
// 🧩 Fusionar por página (manteniendo todos los tipos)
// =====================================================
const mergedByPage = {};
for (const r of normalizados) {
  const key = r.page;
  if (!mergedByPage[key]) {
    mergedByPage[key] = { ...r };
  } else {
    mergedByPage[key].violations.push(...r.violations);
    mergedByPage[key].needs_review.push(...r.needs_review);
    mergedByPage[key].pa11y.push(...r.pa11y);
  }
}

const finalResults = Object.values(mergedByPage);

// =====================================================
// 🧩 Eliminar duplicados dentro de cada tipo
// =====================================================
for (const item of finalResults) {
  const dedup = (arr) =>
    Object.values(
      arr.reduce((acc, v) => {
        const id = v.id || v.code || JSON.stringify(v);
        acc[id] = v;
        return acc;
      }, {})
    );
  item.violations = dedup(item.violations);
  item.needs_review = dedup(item.needs_review);
  item.pa11y = dedup(item.pa11y);
}

// =====================================================
// ✅ Guardar archivo combinado
// =====================================================
fs.writeFileSync(MERGED_FILE, JSON.stringify(finalResults, null, 2));
console.log(`✅ Archivo combinado creado en: ${MERGED_FILE}`);
console.log(
  `📊 Total combinado: ${finalResults.length} páginas (${total} entradas originales)`
);

// =====================================================
// 📊 Generar resumen Markdown IAAP PRO
// =====================================================
const byImpact = {
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  unclassified: 0,
};
let pa11yCount = 0;
let needsReviewCount = 0;

finalResults.forEach((item) => {
  item.violations?.forEach((v) => {
    const impact = v.impact?.toLowerCase() || "unclassified";
    if (byImpact[impact] !== undefined) byImpact[impact]++;
  });
  needsReviewCount += item.needs_review?.length || 0;
  pa11yCount += item.pa11y?.length || 0;
});

let summary = `# ♿ Informe Consolidado IAAP PRO v4.16-H3\n\n`;
summary += `📅 Fecha de generación: ${new Date()
  .toISOString()
  .replace("T", " ")
  .split(".")[0]}\n\n`;
summary += `📊 **Total de páginas combinadas:** ${finalResults.length}\n`;
summary += `🔍 **Revisiones manuales:** ${needsReviewCount}\n`;
summary += `🧪 **Resultados Pa11y:** ${pa11yCount}\n\n`;

summary += `| Severidad | Nº de violaciones |\n|------------|------------------|\n`;
for (const [impact, count] of Object.entries(byImpact)) {
  summary += `| ${impact} | ${count} |\n`;
}
summary += `\n## 🧭 Detalle por página\n\n`;

for (const item of finalResults) {
  const page = item.page || "(sin URL)";
  summary += `### 🌐 ${page}\n`;
  const totalV =
    (item.violations?.length || 0) +
    (item.needs_review?.length || 0) +
    (item.pa11y?.length || 0);
  if (totalV === 0) {
    summary += `- ✅ Sin violaciones detectadas.\n\n`;
  } else {
    item.violations?.forEach(
      (v) => (summary += `- **${v.id}** (${v.impact || "?"}) → ${v.help || v.description}\n`)
    );
    item.needs_review?.forEach(
      (v) => (summary += `- 🟡 (Review) **${v.id}** → ${v.help || v.description}\n`)
    );
    item.pa11y?.forEach(
      (v) => (summary += `- 🔵 (Pa11y) **${v.code || v.id}** → ${v.message}\n`)
    );
    summary += `\n`;
  }
}

fs.writeFileSync(SUMMARY_FILE, summary, "utf8");
console.log(`📝 Resumen Markdown generado: ${SUMMARY_FILE}`);

// =====================================================
// 💾 Registrar ruta final del merge
// =====================================================
fs.writeFileSync(path.join(AUDITORIAS_DIR, "last-merged.txt"), MERGED_FILE, "utf8");
console.log("💾 Ruta registrada en auditorias/last-merged.txt");

// =====================================================
// 🧠 Copia de compatibilidad (v4.13.x)
// =====================================================
try {
  const legacyCopy = path.join(
    AUDITORIAS_DIR,
    `results-merged-${Date.now()}.json`
  );
  fs.copyFileSync(MERGED_FILE, legacyCopy);
  console.log(`🧩 Copia de compatibilidad creada: ${legacyCopy}`);
} catch (err) {
  console.warn(`⚠️ No se pudo crear la copia de compatibilidad: ${err.message}`);
}

console.log("🎯 Merge completado con éxito (IAAP PRO v4.16-H3)");
