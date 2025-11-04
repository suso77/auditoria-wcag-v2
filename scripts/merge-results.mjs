/**
 * 🧩 merge-results.mjs (versión 3.1 profesional final)
 * --------------------------------------------------------------
 * Combina y normaliza resultados de auditorías WCAG:
 *   - Auditoría Sitemap (páginas completas)
 *   - Auditoría Interactiva (componentes, modales, menús...)
 *
 * ✅ Deduplica por URL + selector + origen + ID de violación.
 * ✅ Detecta automáticamente capturas PNG asociadas.
 * ✅ Añade campo `capturePath` relativo a /auditorias/capturas.
 * ✅ Limpia URLs rotas o sin violaciones reales.
 * ✅ Compatible con export-to-xlsx.mjs (IAAP/W3C).
 * ✅ Logs claros con totales por severidad y origen.
 */

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");

// ===========================================================
// 🔍 Buscar recursivamente todos los results.json (excepto merged previos)
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

// ===========================================================
// ⚙️ Validación inicial
// ===========================================================
if (!fs.existsSync(AUDITORIAS_DIR)) {
  console.error("❌ No existe el directorio /auditorias");
  process.exit(1);
}

const resultFiles = findResultFiles(AUDITORIAS_DIR);
if (resultFiles.length === 0) {
  console.error("❌ No se encontraron archivos results.json para combinar.");
  process.exit(0);
}

console.log(`📦 Archivos detectados: ${resultFiles.length}`);

// ===========================================================
// 🧩 Cargar y normalizar resultados
// ===========================================================
let merged = [];

for (const file of resultFiles) {
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    const relative = path.relative(AUDITORIAS_DIR, file);
    const origen = relative.includes("interactiva") ? "interactiva" : "sitemap";

    (Array.isArray(json) ? json : [json]).forEach((item) => {
      if (!item) return;
      const pageUrl = item.url || item.page;
      if (!pageUrl) return;

      const violations = Array.isArray(item.violations) ? item.violations : [];
      if (violations.length === 0) return;

      merged.push({
        origen,
        url: pageUrl.trim(),
        pageTitle: item.pageTitle || item.title || "(sin título)",
        selector: item.selector || "body",
        date: item.date || new Date().toISOString(),
        system: item.system || "macOS + Chrome (Cypress) + axe-core",
        violations,
      });
    });

    console.log(`✅ Combinado: ${relative} (${origen})`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

// ===========================================================
// 🧽 Deduplicar resultados (misma URL + selector + origen + ID de violación)
// ===========================================================
merged = merged.filter(
  (item, i, self) =>
    i ===
    self.findIndex(
      (t) =>
        t.url === item.url &&
        t.selector === item.selector &&
        t.origen === item.origen &&
        JSON.stringify(t.violations.map((v) => v.id).sort()) ===
          JSON.stringify(item.violations.map((v) => v.id).sort())
    )
);

// ===========================================================
// 🖼️ Vincular capturas PNG si existen
// ===========================================================
function findCaptureFor(urlString, selector = "") {
  if (!fs.existsSync(CAPTURAS_DIR)) return null;
  const slug = urlString
    .replace(/https?:\/\/|\/$/g, "")
    .replace(/[^\w-]/g, "-")
    .substring(0, 150);

  const files = fs.readdirSync(CAPTURAS_DIR).filter((f) => f.endsWith(".png"));
  const selectorSlug = selector ? selector.replace(/[^\w-]/g, "_").substring(0, 100) : "";

  return (
    files.find((f) => f.includes(slug) && (!selectorSlug || f.includes(selectorSlug))) ||
    files.find((f) => f.includes(slug.split("-").slice(-1)[0])) ||
    null
  );
}

merged = merged.map((item) => {
  const capture =
    findCaptureFor(item.url, item.selector) || findCaptureFor(item.url, "body");
  if (capture) item.capturePath = `capturas/${capture}`;
  return item;
});

// ===========================================================
// 📊 Estadísticas globales
// ===========================================================
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
};

merged.forEach((r) => {
  const s = stats[r.origen];
  s.urls.add(r.url);
  r.violations.forEach((v) => {
    const impact = v.impact?.toLowerCase();
    if (impact && s[impact] !== undefined) s[impact]++;
    s.total++;
  });
});

// ===========================================================
// 💾 Guardar archivo final
// ===========================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), "utf8");

// ===========================================================
// 📈 Mostrar resumen profesional
// ===========================================================
console.log("\n===============================================");
console.log("📊 RESULTADOS COMBINADOS DE AUDITORÍA WCAG");
console.log(`→ Archivo generado: ${outputFile}`);
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
console.log(`🌍 Cobertura total: ${totalUrls} URLs con violaciones`);
console.log(`♿ Violaciones totales combinadas: ${totalViolations}`);
console.log("✅ Fusión completada correctamente.");
console.log("===============================================\n");

process.exit(0);
