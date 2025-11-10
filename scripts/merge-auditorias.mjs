/**
 * ♿ IAAP PRO v4.44 — Merge de auditorías de accesibilidad (FINAL TOTAL)
 * ---------------------------------------------------------------------
 * Une los resultados de:
 *  - auditorias/auditoria-sitemap/results.json
 *  - auditorias/auditoria-interactiva/results.json
 *  - auditorias/auditoria-interactiva/results-batch-*.json
 *  - auditorias/pa11y-results.json
 *  - auditorias/needs_review.json
 *
 * Genera:
 *  - auditorias/reportes/merged-results.json
 *  - auditorias/reportes/merged-summary.md
 *  - auditorias/results-merged-[timestamp].json (compatibilidad)
 * ---------------------------------------------------------------------
 * ✅ IAAP PRO compatible con v4.16-H3, 4.4x y flujo híbrido Cypress
 */

import fs from "fs";
import path from "path";

// =====================================================
// 📁 Configuración
// =====================================================
const ROOT = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT, "auditorias");
const OUTPUT_DIR = path.join(AUDITORIAS_DIR, "reportes");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const MERGED_FILE = path.join(OUTPUT_DIR, "merged-results.json");
const SUMMARY_FILE = path.join(OUTPUT_DIR, "merged-summary.md");

// =====================================================
// 📦 Fuentes principales
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
// 🔍 Cargar resultados base
// =====================================================
for (const f of FUENTES) {
  const file = path.join(AUDITORIAS_DIR, f);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️ No se encontró ${f}, se omite.`);
    continue;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) continue;
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : [data];
    merged.push(...arr);
    total += arr.length;
    console.log(`📥 ${arr.length} resultados añadidos desde ${f}`);
  } catch (err) {
    console.warn(`⚠️ Error leyendo ${f}: ${err.message}`);
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

  for (const file of batchFiles) {
    try {
      const raw = fs.readFileSync(path.join(batchDir, file), "utf8");
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : [data];
      merged.push(...arr);
      total += arr.length;
      console.log(`🧩 Añadidos ${arr.length} resultados desde ${file}`);
    } catch (err) {
      console.warn(`⚠️ Error leyendo lote ${file}: ${err.message}`);
    }
  }
}

if (merged.length === 0) {
  console.error("❌ No hay resultados para combinar. Ejecuta las auditorías primero.");
  process.exit(1);
}

// =====================================================
// 🔗 Normalizar estructura IAAP PRO
// =====================================================
const normalizados = merged.map((item) => ({
  origen: item.origen || inferOrigen(item),
  page: item.page || item.url || "(sin URL)",
  violations: Array.isArray(item.violations) ? item.violations : [],
  needs_review: Array.isArray(item.needs_review) ? item.needs_review : [],
  pa11y: Array.isArray(item.pa11y)
    ? item.pa11y
    : Array.isArray(item.results)
    ? item.results
    : [],
}));

function inferOrigen(item) {
  if (item.url?.includes("interactiva")) return "interactiva";
  if (item.url?.includes("sitemap")) return "sitemap";
  return "combinado";
}

// =====================================================
// 🧩 Fusionar por página
// =====================================================
const mergedByPage = {};
for (const r of normalizados) {
  const key = r.page;
  if (!mergedByPage[key]) mergedByPage[key] = { ...r };
  else {
    mergedByPage[key].violations.push(...r.violations);
    mergedByPage[key].needs_review.push(...r.needs_review);
    mergedByPage[key].pa11y.push(...r.pa11y);
  }
}

const finalResults = Object.values(mergedByPage);

// =====================================================
// 🧩 Deduplicar
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
// 💾 Guardar merged-results.json
// =====================================================
fs.writeFileSync(MERGED_FILE, JSON.stringify(finalResults, null, 2), "utf8");
console.log(`✅ Archivo combinado creado en: ${MERGED_FILE}`);
console.log(`📊 Total combinado: ${finalResults.length} páginas (${total} entradas)`);

// =====================================================
// 📈 Generar resumen Markdown
// =====================================================
const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 };
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

let summary = `# ♿ Informe Consolidado IAAP PRO v4.44 (Final)\n\n`;
summary += `📅 Fecha: ${new Date().toLocaleString("es-ES")}\n\n`;
summary += `📊 **Total de páginas:** ${finalResults.length}\n`;
summary += `🟡 **Revisiones manuales:** ${needsReviewCount}\n`;
summary += `🔵 **Resultados Pa11y:** ${pa11yCount}\n\n`;

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
    summary += `- axe-core: ${item.violations.length} | Pa11y: ${item.pa11y.length} | Review: ${item.needs_review.length}\n\n`;
  }
}

fs.writeFileSync(SUMMARY_FILE, summary, "utf8");
console.log(`📝 Resumen Markdown generado: ${SUMMARY_FILE}`);

// =====================================================
// 🪶 Copias adicionales
// =====================================================
const LEGACY_COPY = path.join(AUDITORIAS_DIR, `results-merged-${Date.now()}.json`);
fs.copyFileSync(MERGED_FILE, LEGACY_COPY);
fs.writeFileSync(path.join(AUDITORIAS_DIR, "last-merged.txt"), MERGED_FILE, "utf8");

console.log(`🧩 Copia de compatibilidad creada: ${LEGACY_COPY}`);
console.log("🎯 Merge completado correctamente (IAAP PRO v4.44-FINAL)");
