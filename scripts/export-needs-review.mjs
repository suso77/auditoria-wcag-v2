/**
 * ♿ IAAP PRO v6.0 — Extracción de revisiones manuales (needs_review)
 * ---------------------------------------------------------------------
 * Lee los resultados de auditoría (sitemap + interactiva)
 * y genera auditorias/needs_review.json con los items que
 * requieren revisión manual o son incompletos.
 *
 * ✅ Soporta resultados híbridos (axe-core + Pa11y)
 * ✅ Combina sitemap + interactiva en un único JSON
 * ✅ Compatible con merge-auditorias.mjs v6.0
 * ✅ No rompe el pipeline si algún archivo no existe
 * ---------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";

const DIR_AUDITORIAS = "auditorias";
const FILES = [
  path.join(DIR_AUDITORIAS, "auditoria-sitemap", "results.json"),
  path.join(DIR_AUDITORIAS, "auditoria-interactiva", "results.json"),
];
const OUTPUT_PATH = path.join(DIR_AUDITORIAS, "needs_review.json");

console.log("♿ IAAP PRO v6.0 — Extracción de revisiones manuales");

// ===========================================================
// 🔍 Recolección global
// ===========================================================
let allIssues = [];

FILES.forEach((filePath) => {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ No existe ${filePath}, se omite.`);
    return;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      console.warn(`⚠️ ${filePath} está vacío.`);
      return;
    }

    const data = JSON.parse(raw);
    let extracted = [];

    if (Array.isArray(data)) {
      // 🔹 axe-core / Pa11y híbrido
      extracted = data.filter(
        (item) =>
          item.impact === "needs-review" ||
          item.impact === "manual" ||
          item.impact === "incomplete" ||
          (item.description && /manual|revisión/i.test(item.description))
      );
    } else if (Array.isArray(data.incomplete)) {
      // 🔹 formato legacy (v4)
      extracted = data.incomplete;
    }

    console.log(
      `📄 ${path.basename(filePath)} → ${extracted.length} revisiones manuales encontradas`
    );
    allIssues.push(...extracted);
  } catch (err) {
    console.error(`❌ Error procesando ${filePath}:`, err.message);
  }
});

// ===========================================================
// 🧩 Normalización IAAP PRO
// ===========================================================
const normalized = allIssues.map((item) => ({
  id: item.id || item.ruleId || "manual-check",
  impact: item.impact || "needs-review",
  description:
    item.description ||
    item.help ||
    "Requiere revisión manual según WCAG 2.2.",
  helpUrl:
    item.helpUrl ||
    "https://www.w3.org/WAI/WCAG22/quickref/?showtechniques=es",
  origen: "needs_review",
  selector:
    item.nodes?.[0]?.target?.join(", ") ||
    item.selector ||
    "(sin selector definido)",
  page: item.pageUrl || item.page || item.url || "(sin URL)",
  criterio: item.id || item.ruleId || "",
  nivel:
    (item.tags &&
      item.tags.find((t) => t.includes("wcag2") || t.includes("wcag21"))) ||
    "AA",
}));

// ===========================================================
// 💾 Guardado final
// ===========================================================
if (normalized.length > 0) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(normalized, null, 2));
  console.log(`✅ Se exportaron ${normalized.length} revisiones manuales a ${OUTPUT_PATH}`);
  console.log("🧩 Listas para el merge IAAP PRO v6.0");
} else {
  console.warn("⚠️ No se encontraron revisiones manuales en ningún resultado.");
  fs.writeFileSync(OUTPUT_PATH, "[]");
}
