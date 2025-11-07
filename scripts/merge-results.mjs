/**
 * ♿ merge-results.mjs (v4.2.0 IAAP PRO Final)
 * -------------------------------------------------------------------------
 * ✅ Fusión profesional de auditorías WCAG (Sitemap + Interactiva)
 * ✅ Prioriza resultados interactivos sobre sitemap
 * ✅ Elimina duplicados entre ambos orígenes
 * ✅ Añade rutas de capturas PNG (si existen)
 * ✅ Ordena por URL + severidad de impacto
 * ✅ Añade ID único para análisis posteriores
 * ✅ Compatible con CI/CD (sin bloqueos de proceso)
 */

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");

// ===========================================================
// 🧱 Crear carpetas base si no existen
// ===========================================================
for (const dir of [AUDITORIAS_DIR, CAPTURAS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ===========================================================
// 🔍 Buscar todos los results*.json (excepto merged)
// ===========================================================
function findResultFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findResultFiles(full));
    else if (/^results.*\.json$/i.test(entry.name) && !entry.name.includes("merged"))
      results.push(full);
  }
  return results;
}

const resultFiles = findResultFiles(AUDITORIAS_DIR);
if (resultFiles.length === 0) {
  console.warn("⚠️ No se encontraron archivos results.json para combinar.");
  process.exitCode = 0;
  // no return (deja seguir el pipeline)
} else {
  console.log(`📦 Archivos detectados: ${resultFiles.length}`);
}

// ===========================================================
// 🧩 Cargar y normalizar resultados
// ===========================================================
const merged = [];

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

      const title =
        item.pageTitle ||
        item.title ||
        item.page_name ||
        "(sin título)";

      merged.push({
        id: `${origen}-${Buffer.from(urlItem + (item.selector || "body"))
          .toString("base64")
          .substring(0, 12)}`,
        origen,
        url: urlItem.trim(),
        pageTitle: title,
        selector: item.selector || "body",
        date: item.date || new Date().toISOString(),
        system: item.system || "macOS + Chrome (Cypress + axe-core)",
        violations: item.violations.map((v) => ({
          ...v,
          impact: v.impact || "unclassified",
        })),
      });
    }
  } catch (err) {
    console.warn(`⚠️ Error procesando ${file}: ${err.message}`);
  }
}

// ===========================================================
// 🧽 Deduplicación cruzada IAAP (prioriza interactiva)
// ===========================================================
const deduped = merged
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
// 🖼️ Vincular capturas PNG (búsqueda recursiva segura)
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

for (const item of deduped) {
  const capture = findCaptureFor(item.url, item.selector);
  if (capture)
    item.capturePath = path.relative(AUDITORIAS_DIR, capture).substring(0, 250);
}

// ===========================================================
// 🧩 Ordenar resultados por URL + severidad
// ===========================================================
const impactWeight = { critical: 4, serious: 3, moderate: 2, minor: 1, unclassified: 0 };

deduped.sort((a, b) => {
  if (a.url !== b.url) return a.url.localeCompare(b.url);
  const aMax = Math.max(...a.violations.map((v) => impactWeight[v.impact] || 0));
  const bMax = Math.max(...b.violations.map((v) => impactWeight[v.impact] || 0));
  return bMax - aMax;
});

// ===========================================================
// 💾 Guardar resultados IAAP combinados (v4.3.0 IAAP PRO)
// ===========================================================
if (deduped.length > 0) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Archivo principal con timestamp (histórico)
  const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(deduped, null, 2), "utf8");

  // Crear carpeta /reportes si no existe
  const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
  if (!fs.existsSync(REPORTES_DIR)) fs.mkdirSync(REPORTES_DIR, { recursive: true });

  // Copia estándar para los scripts IAAP PRO
  const mergedStandard = path.join(REPORTES_DIR, "merged-results.json");
  fs.writeFileSync(mergedStandard, JSON.stringify(deduped, null, 2), "utf8");

  // Guardar referencia del último merge
  fs.writeFileSync(path.join(AUDITORIAS_DIR, "last-merged.txt"), outputFile, "utf8");

  console.log(`\n✅ Archivo final generado: ${outputFile}`);
  console.log(`📂 Copia IAAP creada en: ${mergedStandard}`);
} else {
  console.log("⚠️ No se encontraron violaciones que combinar.");
}

// ===========================================================
// 📊 Estadísticas IAAP
// ===========================================================
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0, unclassified: 0 },
};

for (const r of deduped) {
  const s = stats[r.origen];
  s.urls.add(r.url);
  r.violations.forEach((v) => {
    const impact = v.impact?.toLowerCase() || "unclassified";
    if (s[impact] !== undefined) s[impact]++;
    s.total++;
  });
}

// ===========================================================
// 📈 Resumen IAAP profesional
// ===========================================================
console.log("\n===============================================");
console.log("♿ RESUMEN GLOBAL DE AUDITORÍA WCAG – IAAP PRO");
console.log("-----------------------------------------------");

for (const [origen, s] of Object.entries(stats)) {
  if (s.total === 0) continue;
  console.log(`🔹 ${origen.toUpperCase()}:`);
  console.log(`   • URLs con violaciones: ${s.urls.size}`);
  console.log(`   • Violaciones totales: ${s.total}`);
  console.log(`     🔴 critical: ${s.critical}`);
  console.log(`     🟠 serious: ${s.serious}`);
  console.log(`     🟡 moderate: ${s.moderate}`);
  console.log(`     🟢 minor: ${s.minor}`);
  if (s.unclassified > 0) console.log(`     ⚪ unclassified: ${s.unclassified}`);
  console.log("-----------------------------------------------");
}

const totalUrls = new Set([...stats.sitemap.urls, ...stats.interactiva.urls]).size;
const totalViolations = stats.sitemap.total + stats.interactiva.total;
console.log(`🌍 Cobertura total: ${totalUrls} URLs auditadas`);
console.log(`♿ Violaciones combinadas totales: ${totalViolations}`);
console.log("✅ Fusión IAAP PRO completada correctamente.");
console.log("===============================================\n");

