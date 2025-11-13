/**
 * ♿ wcag-map-pa11y.js (IAAP PRO v2.0)
 * ------------------------------------------------------------------
 * Normaliza los códigos de reglas de Pa11y para alinearlos con WCAG 2.1/2.2.
 * Permite fusionar resultados con axe-core sin duplicar criterios.
 * ------------------------------------------------------------------
 */

export const WCAG_MAP_PA11Y = {
  // ================================================================
  // 🌍 PRINCIPIO 1: PERCEPTIBLE
  // ================================================================
  "Principle1.Guideline1_1.1_1_1": "1.1.1 Non-text Content",
  "Principle1.Guideline1_2.1_2_1": "1.2.1 Audio-only and Video-only (Pre-recorded)",
  "Principle1.Guideline1_2.1_2_2": "1.2.2 Captions (Pre-recorded)",
  "Principle1.Guideline1_2.1_2_3": "1.2.3 Audio Description or Media Alternative (Pre-recorded)",
  "Principle1.Guideline1_2.1_2_4": "1.2.4 Captions (Live)",
  "Principle1.Guideline1_2.1_2_5": "1.2.5 Audio Description (Pre-recorded)",
  "Principle1.Guideline1_3.1_3_1": "1.3.1 Info and Relationships",
  "Principle1.Guideline1_3.1_3_2": "1.3.2 Meaningful Sequence",
  "Principle1.Guideline1_3.1_3_3": "1.3.3 Sensory Characteristics",
  "Principle1.Guideline1_3.1_3_4": "1.3.4 Orientation",
  "Principle1.Guideline1_3.1_3_5": "1.3.5 Identify Input Purpose",
  "Principle1.Guideline1_3.1_3_6": "1.3.6 Identify Purpose",
  "Principle1.Guideline1_4.1_4_1": "1.4.1 Use of Color",
  "Principle1.Guideline1_4.1_4_2": "1.4.2 Audio Control",
  "Principle1.Guideline1_4.1_4_3": "1.4.3 Contrast (Minimum)",
  "Principle1.Guideline1_4.1_4_4": "1.4.4 Resize Text",
  "Principle1.Guideline1_4.1_4_5": "1.4.5 Images of Text",
  "Principle1.Guideline1_4.1_4_10": "1.4.10 Reflow",
  "Principle1.Guideline1_4.1_4_11": "1.4.11 Non-text Contrast",
  "Principle1.Guideline1_4.1_4_12": "1.4.12 Text Spacing",
  "Principle1.Guideline1_4.1_4_13": "1.4.13 Content on Hover or Focus",

  // ================================================================
  // 🧭 PRINCIPIO 2: OPERABLE
  // ================================================================
  "Principle2.Guideline2_1.2_1_1": "2.1.1 Keyboard",
  "Principle2.Guideline2_1.2_1_2": "2.1.2 No Keyboard Trap",
  "Principle2.Guideline2_1.2_1_4": "2.1.4 Character Key Shortcuts",
  "Principle2.Guideline2_2.2_2_1": "2.2.1 Timing Adjustable",
  "Principle2.Guideline2_2.2_2_2": "2.2.2 Pause, Stop, Hide",
  "Principle2.Guideline2_3.2_3_1": "2.3.1 Three Flashes or Below Threshold",
  "Principle2.Guideline2_3.2_3_2": "2.3.2 Three Flashes",
  "Principle2.Guideline2_4.2_4_1": "2.4.1 Bypass Blocks",
  "Principle2.Guideline2_4.2_4_2": "2.4.2 Page Titled",
  "Principle2.Guideline2_4.2_4_3": "2.4.3 Focus Order",
  "Principle2.Guideline2_4.2_4_4": "2.4.4 Link Purpose (In Context)",
  "Principle2.Guideline2_4.2_4_5": "2.4.5 Multiple Ways",
  "Principle2.Guideline2_4.2_4_6": "2.4.6 Headings and Labels",
  "Principle2.Guideline2_4.2_4_7": "2.4.7 Focus Visible",
  "Principle2.Guideline2_4.2_4_8": "2.4.8 Location",
  "Principle2.Guideline2_4.2_4_9": "2.4.9 Link Purpose (Link Only)",
  "Principle2.Guideline2_5.2_5_1": "2.5.1 Pointer Gestures",
  "Principle2.Guideline2_5.2_5_2": "2.5.2 Pointer Cancellation",
  "Principle2.Guideline2_5.2_5_3": "2.5.3 Label in Name",
  "Principle2.Guideline2_5.2_5_4": "2.5.4 Motion Actuation",

  // ================================================================
  // 🧠 PRINCIPIO 3: COMPRENSIBLE
  // ================================================================
  "Principle3.Guideline3_1.3_1_1": "3.1.1 Language of Page",
  "Principle3.Guideline3_1.3_1_2": "3.1.2 Language of Parts",
  "Principle3.Guideline3_1.3_1_3": "3.1.3 Unusual Words",
  "Principle3.Guideline3_2.3_2_1": "3.2.1 On Focus",
  "Principle3.Guideline3_2.3_2_2": "3.2.2 On Input",
  "Principle3.Guideline3_2.3_2_3": "3.2.3 Consistent Navigation",
  "Principle3.Guideline3_2.3_2_4": "3.2.4 Consistent Identification",
  "Principle3.Guideline3_3.3_3_1": "3.3.1 Error Identification",
  "Principle3.Guideline3_3.3_3_2": "3.3.2 Labels or Instructions",
  "Principle3.Guideline3_3.3_3_3": "3.3.3 Error Suggestion",
  "Principle3.Guideline3_3.3_3_4": "3.3.4 Error Prevention (Legal, Financial, Data)",
  "Principle3.Guideline3_3.3_3_7": "3.3.7 Redundant Entry",

  // ================================================================
  // 🧩 PRINCIPIO 4: ROBUSTO
  // ================================================================
  "Principle4.Guideline4_1.4_1_1": "4.1.1 Parsing",
  "Principle4.Guideline4_1.4_1_2": "4.1.2 Name, Role, Value",
  "Principle4.Guideline4_1.4_1_3": "4.1.3 Status Messages",
  "Principle4.Guideline4_2.4_2_1": "4.2.1 API Compatibility",
  "Principle4.Guideline4_2.4_2_2": "4.2.2 Accessible Name from Authoring Tool",


};

// ===========================================================
// 🧠 Normalizador universal WCAG (Pa11y + axe)
// ===========================================================
export function getWcagUniversal(id = "") {
  if (!id) return null;
  const clean = id.replace(/^WCAG2(A|AA|AAA)\./, "").replace(/\.G\d+.*$/, "").trim();
  const match = equivalencias[clean] || equivalencias[id];
  if (match && wcagMap[match]) return { id, ...wcagMap[match] };

  const regex = /(\d\.\d\.\d+)/;
  const found = id.match(regex);
  if (found && wcagMap[found[1]]) return { id, ...wcagMap[found[1]] };

  console.warn(`[wcag-map] ⚠️ Criterio WCAG no identificado para la regla: ${id}`);
  return {
    id,
    criterio: "Criterio WCAG no identificado",
    principio: "Desconocido",
    nivel: "N/A",
    esperado: "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.",
    resumen: `Regla sin correspondencia directa (${id}).`,
    nota: "⚠️ Revisar correspondencia o nueva regla axe-core / Pa11y.",
    url: "https://www.w3.org/WAI/WCAG22/quickref/",
  };
}

// ===========================================================
// 📘 Diccionario de nombres legibles WCAG
// ===========================================================
export const wcagNombres = Object.fromEntries(
  Object.entries(wcagMap).map(([id, val]) => [id, `${val.criterio} (${val.nivel})`])
);