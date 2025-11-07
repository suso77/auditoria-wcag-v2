/**
 * ♿ IAAP PRO v4.13.1 — Exportar resultados combinados a CSV
 * Compatible con Numbers, Google Sheets y Excel
 */

import fs from "fs";
import path from "path";
import { Parser } from "json2csv";

const ROOT_DIR = process.cwd();
const inputFile = process.argv[2] || path.join(ROOT_DIR, "auditorias/reportes/merged-results.json");
const outputDir = path.join(ROOT_DIR, "auditorias/reportes");
const outputFile = path.join(outputDir, "Informe-WCAG-IAAP.csv");

if (!fs.existsSync(inputFile)) {
  console.error(`❌ No se encontró el archivo de entrada: ${inputFile}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputFile, "utf8");
const data = JSON.parse(raw);

const rows = [];

data.forEach((item) => {
  const { page, selector, origen } = item;
  (item.violations || []).forEach((v) => {
    rows.push({
      Página: page,
      Selector: selector || "body",
      Origen: origen || "desconocido",
      ID: v.id,
      Descripción: v.description,
      Impacto: v.impact,
      WCAG: (v.tags || []).join(", "),
      Solución: v.help,
      "Ayuda (URL)": v.helpUrl,
    });
  });
});

if (rows.length === 0) {
  console.warn("⚠️ No se encontraron violaciones para exportar.");
  process.exit(0);
}

const parser = new Parser();
const csv = parser.parse(rows);

fs.writeFileSync(outputFile, csv, "utf8");
console.log(`✅ CSV IAAP generado: ${outputFile}`);
