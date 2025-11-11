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
const INPUT_FILE =
  process.argv[2] || path.join(ROOT_DIR, "auditorias/reportes/merged-results.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "auditorias/reportes");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Informe-WCAG-IAAP.csv");

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

// ===========================================================
// 🧩 Transformar datos al formato IAAP PRO CSV
// ===========================================================
const rows = data.map((item) => ({
  Origen: item.origen || "combinado",
  Motor: item.engine || "desconocido",
  "Página analizada": item.pageUrl || item.url || "(sin URL)",
  "Selector": item.selector || "(sin selector)",
  "ID": item.id || "(sin id)",
  "Impacto / Severidad": item.impact || "sin severidad",
  "Descripción": item.description || "",
  "Criterio WCAG": item.wcag || "",
  "Contexto": item.context || "",
  "Enlace de ayuda": item.helpUrl || "",
  "Captura asociada": item.capturePath || "—",
}));

// ===========================================================
// 💾 Generar CSV IAAP PRO
// ===========================================================
const parser = new Parser({
  delimiter: ";",
  quote: '"',
  fields: Object.keys(rows[0]),
});

const csv = parser.parse(rows);
fs.writeFileSync(OUTPUT_FILE, csv, "utf8");

console.log(`✅ CSV IAAP PRO v5.0 generado correctamente: ${OUTPUT_FILE}`);
console.log(`📊 Total de filas exportadas: ${rows.length}`);

