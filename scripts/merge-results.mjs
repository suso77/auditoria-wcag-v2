/**
 * 🧩 merge-results.mjs (v3.6 profesional IAAP / CI-safe)
 * --------------------------------------------------------------
 * Combina y normaliza resultados de auditorías WCAG:
 *   - Auditoría Sitemap (páginas completas)
 *   - Auditoría Interactiva (componentes, modales, menús...)
 *
 * ✅ Deduplica por URL + selector + origen + ID de violación.
 * ✅ Detecta capturas PNG asociadas (campo capturePath).
 * ✅ Limpia entradas vacías o con formato inválido.
 * ✅ Compatible con JSON plano de test-wcag.cy.js.
 * ✅ Logs IAAP claros con totales por severidad y origen.
 * ✅ Genera last-merged.txt para pipeline CI.
 */

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");

// ===========================================================
// 🧱 Asegurar carpetas base
// ===========================================================
if (!fs.existsSync(AUDITORIAS_DIR)) fs.mkdirSync(AUDITORIAS_DIR, { recursive: true });
if (!fs.existsSync(CAPTURAS_DIR)) fs.mkdirSync(CAPTURAS_DIR, { recursive: true });

// ===========================================================
// 🔍 Buscar recursivamente todos los results*.json (excepto merged previos)
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
  console.error("⚠️ No se encontraron archivos results.json para combinar.");
  process.exit(0);
}
console.log(`📦 Archivos detectados: ${resultFiles.length}`);

// ===========================================================
// 🧩 Validación rápida de resultados
// ===========================================================
function isValidResult(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.violations) &&
    obj.violations.length > 0 &&
    obj.violations.every((v) => typeof v.id === "string" && v.id.trim().length > 0)
  );
}

// ===========================================================
// 🧩 Cargar y normalizar resultados
// ===========================================================
let merged = [];

for (const file of resultFiles) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) {
      console.warn(`⚠️ ${file} está vacío, se omite.`);
      continue;
    }

    const json = JSON.parse(raw);
    const relative = path.relative(AUDITORIAS_DIR, file);
    let origen = "sitemap";

    if (/interactiva/i.test(relative)) origen = "interactiva";
    else if (/sitemap/i.test(relative)) origen = "sitemap";
    else if (Array.isArray(json) && json.some((v) => v.origen === "interactiva")) origen = "interactiva";

    // Si es JSON plano (array de violaciones sin estructura)
    if (Array.isArray(json) && json[0]?.id && !json[0]?.violations) {
      merged.push({
        origen,
        url: json[0].url || "https://example.cypress.io",
        pageTitle: "(sin título)",
        selector: "body",
        date: new Date().toISOString(),
        system: "macOS + Chrome (Cypress + axe-core)",
        violations: json,
      });
      console.log(`✅ Normalizado JSON plano: ${relative}`);
      continue;
    }

    // Si es formato estructurado con violaciones
    (Array.isArray(json) ? json : [json]).forEach((item) => {
      if (!item) return;
      const pageUrl = item.url || item.page;
      if (!pageUrl || !isValidResult(item)) return;

      merged.push({
        origen,
        url: pageUrl.trim(),
        pageTitle: item.pageTitle || item.title || "(sin título)",
        selector: item.selector || "body",
        date: item.date || new Date().toISOString(),
        system: item.system || "macOS + Chrome (Cypress + axe-core)",
        violations: item.violations,
      });
    });

    console.log(`✅ Combinado: ${relative} (${origen})`);
  } catch (err) {
    console.warn(`⚠️ Error al procesar ${file}: ${err.message}`);
  }
}

// ===========================================================
// 🧽 Deduplicar resultados (URL + selector + origen + IDs)
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
  const selectorSlug = selector ? selector.replace(/[^\w-]/g, "_").substring(0, 80) : "";

  return (
    files.find((f) => f.includes(slug) && (!selectorSlug || f.includes(selectorSlug))) ||
    files.find((f) => f.includes(slug.split("-").slice(-1)[0])) ||
    null
  );
}

merged = merged.map((item) => {
  const capture =
    findCaptureFor(item.url, item.selector) || findCaptureFor(item.url, "body");
  if (capture) {
    item.capturePath = `capturas/${capture}`.substring(0, 250);
  }
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
// 💾 Guardar archivo final y last-merged.txt
// ===========================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);

try {
  fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), "utf8");
  const stat = fs.statSync(outputFile);
  if (stat.size < 200) throw new Error("archivo demasiado pequeño o vacío");

  // Crear referencia para pipeline posterior
  fs.writeFileSync(path.join(AUDITORIAS_DIR, "last-merged.txt"), outputFile, "utf8");

  console.log(`\n✅ Archivo final generado: ${outputFile} (${stat.size} bytes)`);
  console.log(`🧾 Referencia guardada en auditorias/last-merged.txt`);
} catch (err) {
  console.error(`❌ Error guardando ${outputFile}: ${err.message}`);
  process.exit(1);
}

// ===========================================================
// 📈 Mostrar resumen profesional
// ===========================================================
console.log("\n===============================================");
console.log("📊 RESULTADOS COMBINADOS DE AUDITORÍA WCAG");
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
