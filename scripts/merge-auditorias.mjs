/**
 * ♿ merge-auditorias.mjs (IAAP PRO Híbrido v5.5)
 * ---------------------------------------------------------
 * ✅ Fusiona resultados de auditorías axe-core + Pa11y (Sitemap + Interactiva)
 * ✅ Acepta archivos con timestamp (results-interactiva-*.json)
 * ✅ Prioriza resultados interactivos sobre sitemap
 * ✅ Normaliza WCAG para Pa11y (usando wcag-map-pa11y.js)
 * ✅ Elimina duplicados entre ambos orígenes
 * ✅ Añade rutas de capturas PNG si existen
 * ✅ Ordena por URL + severidad de impacto
 * ✅ Añade ID único + origenId para trazabilidad
 * ✅ Genera merged-results.json, copia histórica y resumen JSON
 * ✅ Incluye estadísticas IAAP PRO
 * ✅ 100% compatible con CI/CD (no bloquea el pipeline)
 */

import fs from "fs";
import path from "path";
import url from "url";
import { getWcagFromPa11y } from "./wcag-map-pa11y.js"; // 🧠 Normalizador WCAG Pa11y

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT, "auditorias");
const REPORTES_DIR = path.join(AUDITORIAS_DIR, "reportes");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");

fs.mkdirSync(REPORTES_DIR, { recursive: true });

// ------------------------------------------------------------------
// 🧩 Localizar resultados más recientes (Sitemap + Interactiva)
// ------------------------------------------------------------------
const sitemapPath = path.join(AUDITORIAS_DIR, "auditoria-sitemap", "results.json");
const interactivaDir = path.join(AUDITORIAS_DIR, "auditoria-interactiva");
let interactivaPath = path.join(interactivaDir, "results.json");

// Si no hay results.json directo, buscar el más reciente con timestamp
if (!fs.existsSync(interactivaPath)) {
  const files = fs.existsSync(interactivaDir)
    ? fs.readdirSync(interactivaDir).filter(
        (f) => f.startsWith("results-interactiva-") && f.endsWith(".json")
      )
    : [];
  if (files.length > 0) {
    interactivaPath = path.join(interactivaDir, files.sort().reverse()[0]);
    console.log(`🧩 Usando resultado interactivo más reciente: ${path.basename(interactivaPath)}`);
  } else {
    console.warn("⚠️ No se encontraron archivos de auditoría interactiva.");
  }
}

// ------------------------------------------------------------------
// 📦 Recopilar archivos JSON válidos
// ------------------------------------------------------------------
const jsonFiles = [];
if (fs.existsSync(sitemapPath)) jsonFiles.push(sitemapPath);
if (fs.existsSync(interactivaPath)) jsonFiles.push(interactivaPath);

if (jsonFiles.length === 0) {
  console.warn("⚠️ No se encontraron archivos JSON de auditoría para combinar.");
  process.exit(0);
}

// ------------------------------------------------------------------
// 🧩 Cargar y normalizar resultados
// ------------------------------------------------------------------
const merged = [];

for (const file of jsonFiles) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) continue;
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) continue;

    const origen = /interactiva/i.test(file)
      ? "interactiva"
      : /sitemap/i.test(file)
      ? "sitemap"
      : "combinado";

    const origenId = path.basename(file).replace(/results-|\.json/g, "");

    for (const issue of data) {
      const engine =
        issue.engine?.toLowerCase() ||
        (issue.code?.includes("Principle") ? "pa11y" : "axe-core");

      const wcagRef =
        issue.wcag && issue.wcag !== ""
          ? issue.wcag
          : engine === "pa11y"
          ? getWcagFromPa11y(issue.code || "")
          : "Desconocido";

      merged.push({
        id: `${origen}-${Buffer.from(
          (issue.pageUrl || issue.url || "") + (issue.selector || "body")
        )
          .toString("base64")
          .substring(0, 12)}`,
        origen,
        origenId,
        engine,
        pageUrl: issue.pageUrl || issue.url || "",
        pageTitle: issue.pageTitle || issue.title || "(sin título)",
        impact: issue.impact || issue.type || "n/a",
        description: issue.description || issue.message || "",
        helpUrl: issue.helpUrl || issue.help || "",
        selector: issue.selector || "",
        context: issue.context || "",
        wcag: wcagRef,
        nodes: issue.nodes || 0,
      });
    }
  } catch (err) {
    console.warn(`⚠️ Error leyendo ${file}: ${err.message}`);
  }
}

if (merged.length === 0) {
  console.warn("⚠️ No se detectaron issues combinables.");
  process.exit(0);
}

// ------------------------------------------------------------------
// 🧽 Deduplicación IAAP PRO (prioriza interactiva)
// ------------------------------------------------------------------
const deduped = merged
  .sort((a, b) => (a.origen === "interactiva" && b.origen !== "interactiva" ? -1 : 1))
  .filter(
    (item, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.pageUrl === item.pageUrl &&
          t.selector === item.selector &&
          t.wcag === item.wcag &&
          t.description === item.description &&
          t.engine === item.engine
      )
  );

// ------------------------------------------------------------------
// 🖼️ Asociar capturas PNG si existen
// ------------------------------------------------------------------
function findPngs(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...findPngs(full));
    else if (e.isFile() && e.name.endsWith(".png")) result.push(full);
  }
  return result;
}

const pngs = findPngs(CAPTURAS_DIR);

deduped.forEach((issue) => {
  const hint = issue.pageUrl.replace(/[^\w-]/g, "_").slice(0, 60);
  const match = pngs.find((p) => p.includes(hint));
  if (match) issue.capturePath = path.relative(AUDITORIAS_DIR, match);
});

// ------------------------------------------------------------------
// 🧮 Ordenar resultados por URL + severidad
// ------------------------------------------------------------------
const impactWeight = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
  error: 3,
  warning: 2,
  notice: 1,
  "n/a": 0,
  n: 0,
};

deduped.sort((a, b) => {
  if (a.pageUrl !== b.pageUrl) return a.pageUrl.localeCompare(b.pageUrl);
  const aW = impactWeight[a.impact?.toLowerCase()] || 0;
  const bW = impactWeight[b.impact?.toLowerCase()] || 0;
  return bW - aW;
});

// ------------------------------------------------------------------
// 💾 Guardar resultados IAAP combinados
// ------------------------------------------------------------------
if (deduped.length === 0) {
  console.warn("⚠️ No se detectaron resultados combinables. No se guardará merged.");
  process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const mergedHistoric = path.join(AUDITORIAS_DIR, `results-merged-${timestamp}.json`);
const mergedStandard = path.join(REPORTES_DIR, "merged-results.json");

fs.writeFileSync(mergedHistoric, JSON.stringify(deduped, null, 2), "utf8");
fs.writeFileSync(mergedStandard, JSON.stringify(deduped, null, 2), "utf8");
fs.writeFileSync(path.join(AUDITORIAS_DIR, "last-merged.txt"), mergedHistoric, "utf8");

console.log(`\n✅ IAAP PRO Híbrido: ${deduped.length} issues combinados.`);
console.log(`📁 Archivo principal: ${mergedStandard}`);
console.log(`🕒 Histórico guardado en: ${path.basename(mergedHistoric)}\n`);

// ------------------------------------------------------------------
// 📊 Estadísticas IAAP PRO
// ------------------------------------------------------------------
const stats = {
  sitemap: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  interactiva: { urls: new Set(), total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
};

for (const r of deduped) {
  const s = stats[r.origen];
  s.urls.add(r.pageUrl);
  const imp = (r.impact || "n/a").toLowerCase();
  if (s[imp] !== undefined) s[imp]++;
  s.total++;
}

// ------------------------------------------------------------------
// 📈 Resumen global IAAP PRO
// ------------------------------------------------------------------
console.log("===============================================");
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
  console.log("-----------------------------------------------");
}

const totalUrls = new Set([...stats.sitemap.urls, ...stats.interactiva.urls]).size;
const totalIssues = stats.sitemap.total + stats.interactiva.total;
console.log(`🌍 Cobertura total: ${totalUrls} URLs auditadas`);
console.log(`♿ Violaciones totales combinadas: ${totalIssues}`);
console.log("✅ Fusión IAAP PRO completada correctamente.");
console.log("===============================================\n");

// ------------------------------------------------------------------
// 💾 Guardar resumen global IAAP PRO (JSON)
// ------------------------------------------------------------------
const resumenData = {
  fecha: new Date().toISOString(),
  totalUrls,
  totalIssues,
  sitemap: {
    urls: stats.sitemap.urls.size,
    total: stats.sitemap.total,
    critical: stats.sitemap.critical,
    serious: stats.sitemap.serious,
    moderate: stats.sitemap.moderate,
    minor: stats.sitemap.minor,
  },
  interactiva: {
    urls: stats.interactiva.urls.size,
    total: stats.interactiva.total,
    critical: stats.interactiva.critical,
    serious: stats.interactiva.serious,
    moderate: stats.interactiva.moderate,
    minor: stats.interactiva.minor,
  },
};

const resumenPath = path.join(REPORTES_DIR, "merged-summary.json");
fs.writeFileSync(resumenPath, JSON.stringify(resumenData, null, 2), "utf8");
console.log(`📊 Resumen IAAP PRO guardado en: ${resumenPath}`);
