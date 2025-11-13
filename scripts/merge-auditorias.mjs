/**
 * ♿ merge-auditorias.mjs — IAAP PRO Híbrido v6.8 (Node 24+)
 * ------------------------------------------------------------------------
 * ✅ Fusiona resultados axe-core + Pa11y + revisiones manuales
 * ✅ Clasifica por severidad, motor y origen (sitemap / interactiva / manual)
 * ✅ Normaliza campos WCAG, engine, nivel y principio
 * ✅ Traduce descripciones y genera resultados esperados
 * ✅ Vincula capturas automáticamente y exporta resultados por motor
 * ✅ Totalmente compatible con generate-summary.mjs v6.8
 */

import fs from "fs";
import path, { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fsPromises from "fs/promises";

// ============================================================
// 🧩 Inicialización
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.cwd();

const AUDITORIAS_DIR = join(ROOT, "auditorias");
const REPORTES_DIR = join(AUDITORIAS_DIR, "reportes");
const CAPTURAS_DIR = join(AUDITORIAS_DIR, "capturas");
await fsPromises.mkdir(REPORTES_DIR, { recursive: true });

// ============================================================
// 🧠 Cargar mapa WCAG universal
// ============================================================
let getWcagInfo;
try {
  const wcagModuleUrl = pathToFileURL(join(__dirname, "wcag-map.mjs")).href;
  const wcagModule = await import(wcagModuleUrl);
  getWcagInfo = wcagModule.getWcagInfo;
  console.log("✅ Mapa WCAG importado correctamente");
} catch (err) {
  console.error("❌ Error importando wcag-map.mjs:", err.message);
  process.exit(1);
}

// ============================================================
// 🌐 Traducción de descripciones técnicas
// ============================================================
function traducirDescripcion(text = "") {
  return text
    .replace(/Img element is marked so that it is ignored by Assistive Technology/gi, "El elemento de imagen está marcado para ser ignorado por los lectores de pantalla")
    .replace(/Iframe element requires a non-empty title attribute/gi, "El elemento iframe requiere un atributo title no vacío que describa su contenido")
    .replace(/must have discernible text/gi, "debe tener texto visible o etiqueta accesible")
    .replace(/contrast ratio/gi, "relación de contraste insuficiente entre texto y fondo")
    .replace(/missing alt attribute/gi, "falta el atributo alt en la imagen")
    .replace(/Empty heading/gi, "El encabezado está vacío o sin contenido")
    .replace(/decorative/gi, "decorativo o sin información relevante")
    .replace(/This element does not have a role/gi, "El elemento no tiene un rol ARIA definido")
    .trim();
}

// ============================================================
// 📁 Buscar archivos de auditoría
// ============================================================
function findJsonFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) result.push(...findJsonFiles(full));
    else if (e.isFile() && e.name.endsWith(".json")) result.push(full);
  }
  return result;
}

const allJsonFiles = findJsonFiles(AUDITORIAS_DIR).filter(
  (f) =>
    !f.includes("merged") &&
    !f.includes("summary") &&
    !f.endsWith("urls.json") &&
    !f.includes("export") &&
    !f.includes("results-merged")
);

const sitemapFiles = allJsonFiles.filter((f) => /sitemap/i.test(f));
const interactivaFiles = allJsonFiles.filter((f) => /interactiva/i.test(f));
const manualFiles = allJsonFiles.filter((f) => /needs_review|manual/i.test(f));

console.log(`🧩 Detectados: ${sitemapFiles.length} sitemap | ${interactivaFiles.length} interactivas | ${manualFiles.length} manuales`);

if (sitemapFiles.length + interactivaFiles.length + manualFiles.length === 0) {
  console.warn("⚠️ No se encontraron archivos de auditoría.");
  process.exit(0);
}

// ============================================================
// 🔄 Procesamiento y normalización
// ============================================================
const merged = [];

function processFile(file, origen) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data)) return;

    for (const item of data) {
      const src = origen;

      // 🧠 Normalización de identificadores WCAG
      const wcag = getWcagInfo(item.id || item.ruleId || item.code || item.wcag);

      // 🧩 Severidad y motor
      const impacto =
        (item.impact || item.type || item.severity || "moderate").toLowerCase();
      const motor =
        item.engine?.toLowerCase() ||
        (file.toLowerCase().includes("pa11y") ? "pa11y" :
        file.toLowerCase().includes("axe") ? "axe-core" :
        src === "interactiva" ? "pa11y" : "axe-core");

      // 🧠 Traducción y campos IAAP PRO
      const descripcion = traducirDescripcion(item.description || item.message || "");
      const resultadoEsperado =
        wcag?.resumen || "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.";

      merged.push({
        id:
          item.ruleId ||
          item.id ||
          `${src}-${Buffer.from(
            (item.pageUrl || "") + (item.selector || "")
          )
            .toString("base64")
            .substring(0, 10)}`,
        pageUrl: item.pageUrl || item.url || "",
        pageTitle: item.pageTitle || item.title || "(sin título)",
        source: src,
        engine: motor,
        impact: impacto,
        severity: impacto.replace("n/a", "moderate"),
        wcag: wcag?.criterio || "Desconocido",
        nivel: wcag?.nivel || "AA",
        principio: wcag?.principio || "",
        resumen: wcag?.resumen || descripcion || "",
        resultadoActual: descripcion || "Sin descripción disponible",
        resultadoEsperado,
        recomendacionW3C: wcag?.url
          ? `Ver recomendación W3C: ${wcag.url}`
          : "Revisión manual requerida",
        selector: item.selector || "",
        context: item.context || "",
        helpUrl: item.helpUrl || item.help || "",
      });
    }
  } catch (err) {
    console.warn(`⚠️ Error procesando ${file}: ${err.message}`);
  }
}

sitemapFiles.forEach((f) => processFile(f, "sitemap"));
interactivaFiles.forEach((f) => processFile(f, "interactiva"));
manualFiles.forEach((f) => processFile(f, "manual"));

// ============================================================
// 🧽 Deduplicación
// ============================================================
const deduped = merged.filter(
  (item, index, self) =>
    index ===
    self.findIndex(
      (t) =>
        t.pageUrl === item.pageUrl &&
        t.selector === item.selector &&
        t.wcag === item.wcag &&
        t.resultadoActual === item.resultadoActual &&
        t.source === item.source
    )
);

// ============================================================
// 🖼️ Vinculación automática de capturas
// ============================================================
function findPngs(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) result.push(...findPngs(full));
    else if (e.isFile() && e.name.endsWith(".png")) result.push(full);
  }
  return result;
}

const pngs = [
  ...findPngs(join(AUDITORIAS_DIR, "auditoria-sitemap")),
  ...findPngs(join(AUDITORIAS_DIR, "auditoria-interactiva")),
  ...findPngs(CAPTURAS_DIR),
];

deduped.forEach((issue) => {
  const hint = issue.pageUrl.replace(/[^\w-]/g, "_").slice(0, 60);
  const match = pngs.find((p) => p.includes(hint));
  if (match) issue.capturePath = path.relative(AUDITORIAS_DIR, match);
});

// ============================================================
// 💾 Guardar resultados combinados
// ============================================================
const mergedStandard = join(REPORTES_DIR, "merged-results.json");
await fsPromises.writeFile(mergedStandard, JSON.stringify(deduped, null, 2));
console.log(`✅ IAAP PRO v6.8 — ${deduped.length} issues combinados.`);

// ============================================================
// 📊 Resumen global
// ============================================================
const stats = {};
for (const r of deduped) {
  const key = `${r.source}_${r.engine}`;
  if (!stats[key])
    stats[key] = { total: 0, critical: 0, serious: 0, moderate: 0, minor: 0 };
  stats[key].total++;
  if (stats[key][r.severity] !== undefined) stats[key][r.severity]++;
}

console.log("\n♿ RESUMEN GLOBAL DE AUDITORÍA – IAAP PRO v6.8");
console.log("------------------------------------------------");
Object.entries(stats).forEach(([k, v]) => {
  console.log(
    `🔹 ${k}: ${v.total} issues (${v.critical} critical, ${v.serious} serious, ${v.moderate} moderate, ${v.minor} minor)`
  );
});
console.log("------------------------------------------------\n");

// ============================================================
// 🔄 Exportar por motor
// ============================================================
await fsPromises.mkdir(join(REPORTES_DIR, "por-motor"), { recursive: true });
const axeResults = deduped.filter((r) => r.engine === "axe-core");
const pa11yResults = deduped.filter((r) => r.engine === "pa11y");

await fsPromises.writeFile(
  join(REPORTES_DIR, "por-motor/axe-results.json"),
  JSON.stringify(axeResults, null, 2)
);
await fsPromises.writeFile(
  join(REPORTES_DIR, "por-motor/pa11y-results.json"),
  JSON.stringify(pa11yResults, null, 2)
);

console.log(`🔄 Exportaciones IAAP PRO generadas correctamente:
   • axe-results.json → ${axeResults.length} issues
   • pa11y-results.json → ${pa11yResults.length} issues`);

console.log("\n✅ Fusión completada correctamente – IAAP PRO v6.8\n");

