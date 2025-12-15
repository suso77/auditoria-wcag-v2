/**
 * ♿ export-to-csv.mjs — IAAP PRO v5.0 (Híbrido total)
 * -----------------------------------------------------------------
 * Exporta merged-results.json (axe-core + Pa11y + needs_review)
 * a un CSV universal compatible con Sheets, Numbers y Excel.
 *
 * ✅ Compatible con merge-auditorias.mjs v5.0
 * ✅ Limpia campos vacíos y normaliza WCAG / Impactos
 * ✅ Ideal para Looker Studio, Power BI o Dashboards IAAP
 */

import fs from "fs";
import path from "path";
import { Parser } from "json2csv";

// ===========================================================
// 📁 Rutas
// ===========================================================
const ROOT_DIR = process.cwd();
const AUDITORIAS_DIR = path.join(ROOT_DIR, "auditorias");
const CAPTURAS_DIR = path.join(AUDITORIAS_DIR, "capturas");
const INPUT_FILE =
  process.argv[2] || path.join(ROOT_DIR, "auditorias/reportes/merged-results.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "auditorias/reportes");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Informe-WCAG-IAAP.csv");
const DEVICE_INFO =
  process.env.AUDIT_DEVICE_INFO ||
  process.env.DEVICE_INFO ||
  "MacBook Pro / macOS 14.6.1 / Chrome 143 / Axe DevTools";

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ No se encontró el archivo de entrada: ${INPUT_FILE}`);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_FILE, "utf8");
const data = JSON.parse(raw);

if (!Array.isArray(data) || data.length === 0) {
  console.warn("⚠️ No hay datos válidos para exportar a CSV.");
  process.exit(0);
}

const CAPTURE_FILES = fs.existsSync(CAPTURAS_DIR) ? walkCaptureFiles(CAPTURAS_DIR) : [];

function walkCaptureFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkCaptureFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function sanitizeForCapture(value) {
  return (value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 80);
}

function getCapturePath(issue) {
  if (issue.capturePath) {
    const abs = path.isAbsolute(issue.capturePath)
      ? issue.capturePath
      : path.join(AUDITORIAS_DIR, issue.capturePath);
    if (fs.existsSync(abs)) return abs;
  }
  const slug = sanitizeForCapture(issue.pageUrl || issue.url);
  if (!slug) return null;
  return (
    CAPTURE_FILES.find((file) => path.basename(file).toLowerCase().includes(slug)) ||
    null
  );
}

function buildRelativeCapturePath(absPath) {
  if (!absPath) return null;
  const rel = path.relative(OUTPUT_DIR, absPath).split(path.sep).join("/");
  return rel.startsWith("..") ? rel : `./${rel}`;
}

function buildMethod(issue) {
  const engine = (issue.engine || "IAAP PRO").toLowerCase();
  const source = issue.source || "sitemap";
  if (source.includes("manual")) return "Manual – Revisión experta";
  if (engine.includes("pa11y")) return `Automático – Pa11y (${source})`;
  if (engine.includes("axe")) return `Automático – Axe DevTools (${source})`;
  return `Automático – ${issue.engine || "IAAP PRO"} (${source})`;
}

function buildResumen(issue) {
  return (
    issue.resultadoActual ||
    issue.description ||
    "Incidencia detectada por IAAP PRO."
  );
}

function buildNotas(issue) {
  const notes = [];
  if (issue.resultadoEsperado) notes.push(`Esperado: ${issue.resultadoEsperado}`);
  if (issue.recomendacionW3C) notes.push(`Recomendación: ${issue.recomendacionW3C}`);
  if (issue.helpUrl) notes.push(`Guía: ${issue.helpUrl}`);
  return notes.join(" | ") || "—";
}

// ===========================================================
// 🧩 Transformar datos al formato IAAP PRO CSV
// ===========================================================
const rows = data.map((item, index) => {
  const capturePath = getCapturePath(item);
  const captureRelative = buildRelativeCapturePath(capturePath);
  const captureFormula = captureRelative
    ? `=HYPERLINK("${captureRelative}","Ver captura")`
    : "—";

  return {
    ID: item.id || `ISSUE-${index + 1}`,
    "Dispositivo, Sistema operativo, navegador y tecnología asistiva": DEVICE_INFO,
    Resumen: buildResumen(item),
    "Páginas afectadas": item.pageUrl || item.url || "(sin URL)",
    "Metodología de testing": buildMethod(item),
    "Criterio WCAG": item.wcag || "(sin criterio)",
    "Captura de pantalla": captureFormula,
    Notas: buildNotas(item),
  };
});

// ===========================================================
// 💾 Generar CSV IAAP PRO
// ===========================================================
const parser = new Parser({
  delimiter: ";",
  quote: '"',
  fields: [
    "ID",
    "Dispositivo, Sistema operativo, navegador y tecnología asistiva",
    "Resumen",
    "Páginas afectadas",
    "Metodología de testing",
    "Criterio WCAG",
    "Captura de pantalla",
    "Notas",
  ],
});

const csv = parser.parse(rows);
fs.writeFileSync(OUTPUT_FILE, csv, "utf8");

console.log(`✅ CSV IAAP PRO v5.0 generado correctamente: ${OUTPUT_FILE}`);
console.log(`📊 Total de filas exportadas: ${rows.length}`);
