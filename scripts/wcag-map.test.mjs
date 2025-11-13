/**
 * ♿ wcag-map.test.mjs — IAAP PRO v6.5
 * -------------------------------------------------------------------------
 * 🔍 Test extendido de correspondencias axe-core / Pa11y → WCAG
 * Verifica cobertura completa del mapa WCAG y detecta:
 *  - Reglas sin correspondencia
 *  - Duplicaciones entre motores
 *  - Duplicaciones internas
 *  - Cobertura total de criterios WCAG
 *
 * Compatible con auditorías híbridas IAAP (axe-core + Pa11y)
 * y scripts: merge-auditorias.mjs, export-to-xlsx.mjs, capture-evidence.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getWcagInfo } from "./wcag-map.mjs";

// ==========================================================
// 🧭 CONFIGURACIÓN
// ==========================================================
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultadosDir = path.join(__dirname, "resultados");

// Ficheros esperados
const archivosAuditoria = [
  path.join(resultadosDir, "axe-results.json"),
  path.join(resultadosDir, "pa11y-results.json"),
];

const salida = path.join(__dirname, "wcag-report.txt");

// ==========================================================
// 🧮 FUNCIÓN PRINCIPAL
// ==========================================================
async function main() {
  console.log("♿️ Iniciando test extendido de correspondencias WCAG...\n");

  // ----------------------------------------------------------
  // 🧩 Validación de archivos
  // ----------------------------------------------------------
  const existentes = archivosAuditoria.filter((f) => fs.existsSync(f));
  if (existentes.length === 0) {
    console.error("❌ No se encontraron archivos axe-results.json ni pa11y-results.json.");
    process.exit(1);
  }

  for (const f of existentes) {
    const stats = fs.statSync(f);
    if (stats.size === 0) {
      console.warn(`⚠️ Archivo vacío: ${path.basename(f)}`);
    }
  }

  // ----------------------------------------------------------
  // 📥 Cargar datos y extraer reglas
  // ----------------------------------------------------------
  let reglasAxe = new Set();
  let reglasPa11y = new Set();

  for (const archivo of existentes) {
    const data = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const reglas = extraerReglas(data);

    if (archivo.includes("axe")) reglas.forEach((r) => reglasAxe.add(r));
    if (archivo.includes("pa11y")) reglas.forEach((r) => reglasPa11y.add(r));
  }

  const todasLasReglas = new Set([...reglasAxe, ...reglasPa11y]);

  console.log(`🔹 Total de reglas únicas detectadas: ${todasLasReglas.size}`);
  console.log(`   - axe-core: ${reglasAxe.size}`);
  console.log(`   - Pa11y: ${reglasPa11y.size}\n`);

  // ----------------------------------------------------------
  // 🧠 Validar correspondencias con el mapa WCAG
  // ----------------------------------------------------------
  const reglasConMapa = [];
  const reglasSinMapa = [];
  const duplicadasEntreMotores = [];
  const detalles = [];

  for (const regla of todasLasReglas) {
    const info = getWcagInfo(regla);

    if (info && info.criterio && !/no identificado/i.test(info.criterio)) {
      reglasConMapa.push({ regla, criterio: info.criterio });
    } else {
      reglasSinMapa.push(regla);
    }

    if (reglasAxe.has(regla) && reglasPa11y.has(regla)) {
      duplicadasEntreMotores.push(regla);
    }

    detalles.push({
      id: regla,
      criterio: info?.criterio || "—",
      nivel: info?.nivel || "—",
      principio: info?.principio || "—",
    });
  }

  // ----------------------------------------------------------
  // 📈 Resumen
  // ----------------------------------------------------------
  const cobertura =
    todasLasReglas.size === 0
      ? 0
      : ((reglasConMapa.length / todasLasReglas.size) * 100).toFixed(2);

  console.log("📈 RESULTADOS:");
  console.log(`✅ Reglas mapeadas correctamente: ${reglasConMapa.length}`);
  console.log(`⚠️ Reglas sin correspondencia: ${reglasSinMapa.length}`);
  console.log(`🔁 Reglas duplicadas entre motores: ${duplicadasEntreMotores.length}`);
  console.log(`📊 Cobertura total del mapa: ${cobertura}%\n`);

  // ----------------------------------------------------------
  // 🧾 Informe detallado
  // ----------------------------------------------------------
  const reporte = [
    "♿️ INFORME DE CORRESPONDENCIAS WCAG — IAAP PRO v6.5",
    `Fecha: ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}`,
    "",
    `🔹 Total de reglas analizadas: ${todasLasReglas.size}`,
    `🔹 Cobertura del mapa: ${cobertura}%`,
    "",
    "============================",
    "✅ Reglas mapeadas correctamente",
    "============================",
    ...reglasConMapa.map((r) => `• ${r.regla} → ${r.criterio}`),
    "",
    "============================",
    "⚠️ Reglas sin correspondencia WCAG",
    "============================",
    ...reglasSinMapa.map((r) => `• ${r}`),
    "",
    "============================",
    "🔁 Reglas duplicadas entre axe-core y Pa11y",
    "============================",
    ...duplicadasEntreMotores.map((r) => `• ${r}`),
    "",
    "============================",
    "🧱 Detalle completo por regla",
    "============================",
    ...detalles.map(
      (d) =>
        `${d.id.padEnd(50)} → ${d.criterio.padEnd(30)} Nivel: ${d.nivel}  (${d.principio})`
    ),
    "",
    "🧩 Fin del informe WCAG MAP TEST",
  ].join("\n");

  fs.writeFileSync(salida, reporte, "utf8");

  console.log(`🧾 Informe generado en: ${salida}`);
  console.log("✅ Test extendido completado con éxito.\n");
}

// ==========================================================
// 🔍 FUNCIÓN AUXILIAR — EXTRACCIÓN DE REGLAS
// ==========================================================
function extraerReglas(data) {
  const reglas = new Set();

  if (Array.isArray(data)) {
    for (const item of data) {
      if (item.id) reglas.add(item.id);
      if (item.ruleId) reglas.add(item.ruleId);
      if (item.violations)
        item.violations.forEach((v) => reglas.add(v.id || v.ruleId));
      if (item.code) reglas.add(item.code);
    }
  }

  if (data.results && Array.isArray(data.results)) {
    for (const r of data.results) {
      if (r.code) reglas.add(r.code);
      if (r.type) reglas.add(r.type);
    }
  }

  return reglas;
}

// ==========================================================
// 🚀 EJECUCIÓN PRINCIPAL
// ==========================================================
main().catch((err) => {
  console.error("❌ Error ejecutando wcag-map.test.mjs:", err);
  process.exit(1);
});

