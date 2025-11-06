/**
 * ♿ merge-results.mjs (v4.0.0 IAAP PRO)
 * -------------------------------------------------------------------------
 * ✅ Fusión profesional de auditorías WCAG (Sitemap + Interactiva)
 * ✅ Prioriza resultados interactivos sobre sitemap
 * ✅ Elimina duplicados entre ambos orígenes
 * ✅ Añade rutas de capturas PNG (si existen)
 * ✅ Ordena por URL + severidad de impacto
 * ✅ Genera resumen IAAP visual en consola
 */

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");

// ===========================================================
// 🧱 Crear carpetas si no existen
// ===========================================================
for (const dir of [AUDITORIAS_DIR, CAPTURAS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ===========================================================
// 🔍 Buscar recursivamente todos los results*.json
// ===========================================================
function findResultFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(findResultFiles(full));
    else if (/^results.*\.json$/i.test(entry.name) && !entry.name.includes("merged"))
      results.push(full);
  }
  return results;
}

const resultFiles = findResultFiles(AUDITORIAS_DIR);
if (resultFiles.length === 0) {
  console.warn("⚠️ No se encontraron archivos results.json para combinar.");
  process.exit(0);
}
console.log(`📦 Archivos detectados: ${resultFiles.length}`);

// ===========================================================
// 🧩 Cargar y normalizar resultados
// ===========================================================
let merged = [];

function isValidResult(obj) {
  return obj && Array.isArray(obj.violations) && obj.violations.length > 0;
}

for (const file of resultFiles) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) continue;
    const json = JSON.parse(raw);
    const relative = path.relative(AUDITORIAS_DIR, file);
    const origen = /interactiva/i.test(relative) ? "interactiva" : "sitemap";
    const items = Array.isArray(json) ? json : [json];

    for (const item of items) {
      if (!isValidResult(item)) continue;
      const urlItem = item.url || item.page;
      if (!urlItem) continue;

      merged.push({
        origen,
        url: urlItem.trim(),
        pageTitle: item.pageTitle || item.title || "(sin título)",
        selector: item.selector || "body",
        date: item.date || new Date().toISOString(),
        system: item.system || "macOS + Chrome (Cypress + axe-core)",
        violations: item.violations,
      });
    }
  } catch (err) {
    console.warn(`⚠️ Error procesando ${file}: ${err.message}`);
  }
}

// ===========================================================
// 🧽 Deduplicación cruzada IAAP (prioriza interactiva)
// ===========================================================
merged = merged
  .sort((a, b) => (a.origen === "interactiva" && b.origen !== "interactiva" ? -1 : 1))
  .filter(
    (item, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.url === item.url &&
          t.selector === item.selector &&
          JSON.stringify(t.violations.map((v) => v.id).sort()) ===
            JSON.stringify(item.violations.map((v) => v.id).sort())
      )
  );

// ===========================================================
// 🖼️ Vincular capturas PNG si existen (búsqueda recursiva)
// ===========================================================
function findAllPngFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...findAllPngFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".png")) result.push(full);
  }
  return result;
}

const allPngs = findAllPngFiles(CAPTURAS_DIR);

function findCaptureFor(urlString, selector = "") {
  const slug = urlString.replace(/https?:\/\/|\/$/g, "").replace(/[^\w-]/g, "-");
  const selSlug = selector.replace(/[^\w-]/g, "_");
  return (
    allPngs.find((f) => f.includes(slug) && f.includes(selSlug)) ||
    allPngs.find((f) => f.includes(slug)) ||
    null
  );
}

merged = merged.map((item) => {
  const capture = findCaptureFor(item.url, item.selector);
  if (capture)
    item.capturePath = path.relative(AUDITORIAS_DIR, capture).substring(0, 250);
  return item;
});

// ===========================================================
// 🧩 Ordenar resultados por URL + severidad
// ===========================================================
const impactWeight = { critical: 4, serious: 3, moderate: 2, minor: 1 };

merged.sort((a, b) => {
  if (a.url !== b.url) return a.url.localeCompare(b.url);
  const aMax = Math.max(...a.violations.map((v) => impactWeight[v.impact] || 0));
  const bMax = Math.max(...b.violations.map((v) => impactWeight[v.impact] || 0));
  return bMax - aMax;
});

// ===========================================================
// 💾 Guardar resultados IAAP combinados
// ===========================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
const lastMergedPath = path.join(AUDITORIAS_DIR, "last-merged.txt");

fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), "utf8");
fs.writeFileSync(lastMergedPath, outputFile, "utf8");

console.log(`\n✅ Archivo final generado: ${outputFile}`);
console.log(`🧾 Referencia actualizada en auditorias/last-merged.txt`);

// ===========================================================
// 📊 Estadísticas globales IAAP
// ===========================================================
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
};

for (const r of merged) {
  const s = stats[r.origen];
  s.urls.add(r.url);
  r.violations.forEach((v) => {
    const impact = v.impact?.toLowerCase();
    if (s[impact] !== undefined) s[impact]++;
    s.total++;
  });
}

// ===========================================================
// 📈 Resumen IAAP profesional
// ===========================================================
console.log("\n===============================================");
console.log("♿ RESUMEN GLOBAL DE AUDITORÍA WCAG – IAAP PRO");
console.log("--------------------------------------------------");

for (const [origen, s] of Object.entries(stats)) {
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

console.log(`🌍 Cobertura total: ${totalUrls} URLs auditadas`);
console.log(`♿ Violaciones combinadas totales: ${totalViolations}`);
console.log("✅ Fusión IAAP PRO completada correctamente.");
console.log("===============================================\n");

process.exit(0);
