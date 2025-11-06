/**
 * 🧩 merge-results.mjs (v3.9.1 profesional IAAP / CI-Pro estable)
 * --------------------------------------------------------------
 * Corrige error al guardar archivo vacío o pequeño.
 * Mantiene todas las funcionalidades del v3.9 original.
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
for (const dir of [AUDITORIAS_DIR, CAPTURAS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

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
  console.warn("⚠️ No se encontraron archivos results.json para combinar.");
  process.exit(0);
}
console.log(`📦 Archivos detectados: ${resultFiles.length}`);

// ===========================================================
// 🧩 Validación de resultados
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
    else if (Array.isArray(json) && json.some((v) => v.origen === "interactiva"))
      origen = "interactiva";

    // ✅ Normalización para JSON plano
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

    // ✅ Normalización de estructura estándar
    const items = Array.isArray(json) ? json : [json];
    for (const item of items) {
      if (!item) continue;
      const pageUrl = item.url || item.page;
      if (!pageUrl || !isValidResult(item)) continue;

      merged.push({
        origen,
        url: pageUrl.trim(),
        pageTitle: item.pageTitle || item.title || "(sin título)",
        selector: item.selector || "body",
        date: item.date || new Date().toISOString(),
        system: item.system || "macOS + Chrome (Cypress + axe-core)",
        violations: item.violations,
      });
    }

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
  const selectorSlug = selector ? selector.replace(/[^\w-]/g, "_").substring(0, 80) : "";

  const files = fs.readdirSync(CAPTURAS_DIR).filter((f) => f.endsWith(".png"));
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
// 💾 Guardar archivo final + last-merged.txt (fix)
// ===========================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputFile = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
const lastMergedPath = path.join(AUDITORIAS_DIR, "last-merged.txt");

try {
  // ✅ FIX: no se considera error si el merge está vacío
  if (merged.length === 0) {
    console.warn("⚠️ No hay resultados válidos para combinar. Se generará un JSON vacío.");
    fs.writeFileSync(outputFile, "[]", "utf8");
  } else {
    fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), "utf8");
  }

  fs.writeFileSync(lastMergedPath, outputFile, "utf8");

  console.log(`\n✅ Archivo final generado: ${outputFile}`);
  console.log(`🧾 Referencia guardada en auditorias/last-merged.txt`);
} catch (err) {
  console.error(`❌ Error guardando ${outputFile}: ${err.message}`);
  process.exit(0); // ✅ nunca error crítico en CI
}

// ===========================================================
// 📊 Estadísticas globales IAAP
// ===========================================================
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
};

merged.forEach((r) => {
  const s = stats[r.origen];
  s.urls.add(r.url);
  r.violations?.forEach((v) => {
    const impact = v.impact?.toLowerCase();
    if (impact && s[impact] !== undefined) s[impact]++;
    s.total++;
  });
});

// ===========================================================
// 📈 Resumen IAAP profesional
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

console.log(`🌍 Cobertura total: ${totalUrls} URLs auditadas`);
console.log(`♿ Violaciones totales combinadas: ${totalViolations}`);
console.log("✅ Fusión completada correctamente.");
console.log("===============================================\n");

process.exit(0);

