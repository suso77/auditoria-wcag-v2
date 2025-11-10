/**
 * ♿ IAAP PRO v4.16-H3 — Extracción de revisiones manuales (needs_review)
 * ---------------------------------------------------------------------
 * Lee los resultados de auditoría interactiva (axe-core / Cypress)
 * y genera auditorias/needs_review.json con los items "incomplete"
 * o "needs_review" detectados en resultados híbridos.
 * ---------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

const INTERACTIVA_PATH = path.join("auditorias", "auditoria-interactiva", "results.json");
const OUTPUT_PATH = path.join("auditorias", "needs_review.json");

// ===========================================================
// 📁 Verificación de archivo de origen
// ===========================================================
if (!fs.existsSync(INTERACTIVA_PATH)) {
  console.error("❌ No se encontró auditorias/auditoria-interactiva/results.json");
  process.exit(1);
}

// ===========================================================
// 📖 Lectura de datos IAAP PRO
// ===========================================================
const raw = fs.readFileSync(INTERACTIVA_PATH, "utf8");
if (!raw.trim()) {
  console.warn("⚠️ El archivo de resultados está vacío.");
  process.exit(0);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`❌ Error al parsear el JSON de auditoría: ${err.message}`);
  process.exit(1);
}

// ===========================================================
// ♿ Extracción de revisiones manuales ("incomplete" / "needs_review")
// ===========================================================
const incomplete = Array.isArray(data.incomplete)
  ? data.incomplete
  : Array.isArray(data)
  ? data.flatMap((d) => d.incomplete || d.needs_review || [])
  : [];

if (incomplete.length === 0) {
  console.warn("⚠️ No se encontraron revisiones manuales (needs_review).");
  console.log("ℹ️ Ejecuta la auditoría interactiva híbrida antes para generarlas (v4.16-H3).");
  process.exit(0);
}

// ===========================================================
// 🧩 Normalización IAAP PRO
// ===========================================================
const normalized = incomplete.map((item) => ({
  id: item.id || item.ruleId || "manual-check",
  impact: item.impact || "needs-review",
  description:
    item.description ||
    item.help ||
    "Requiere revisión manual según WCAG 2.1 / 2.2.",
  helpUrl:
    item.helpUrl ||
    "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
  origen: "needs_review",
  selector:
    item.nodes?.[0]?.target?.join(", ") ||
    item.selector ||
    "(sin selector definido)",
  page: item.page || item.url || "(sin URL)",
  criterio: item.id || item.ruleId || "",
  nivel: item.tags?.find((t) => t.includes("wcag2")) || "AA",
}));

// ===========================================================
// 💾 Guardado de archivo final
// ===========================================================
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(normalized, null, 2));
console.log(`✅ Se exportaron ${normalized.length} revisiones manuales a ${OUTPUT_PATH}`);
console.log("🧩 Listas para integrarse automáticamente en el merge IAAP PRO (v4.16-H3)");



