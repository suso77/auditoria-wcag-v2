import { wcagMap } from "../../scripts/wcag-map.mjs";

/**
 * IAAP PRO – Highlight System v4
 * Sistema profesional de evidencias visuales para auditorías WCAG
 *
 * ✔️ Overlay adaptativo con colores por severidad
 * ✔️ Etiquetas enriquecidas con criterio WCAG y nivel
 * ✔️ Resumen contextual bajo cada barrera
 * ✔️ Datos estructurados para informes y capturas IAAP
 * ✔️ Compatible con Cypress + Axe-Core
 */

const IMPACT_COLORS = {
  critical: "#d60000",
  serious: "#ff4c00",
  moderate: "#ffaa00",
  minor: "#008ccf",
  default: "#c63d7e",
};

function getImpactColor(impact) {
  return IMPACT_COLORS[impact] || IMPACT_COLORS.default;
}

function getWcagMetadata(ruleId) {
  if (!ruleId) return null;
  return wcagMap[ruleId] || null;
}

/* ---------------------------------------------------------
   1) HIGHLIGHT PRINCIPAL (Rectángulo rojo)
--------------------------------------------------------- */
export function highlightNode(win, el, index = 1, violation = {}, wcag = null) {
  if (!win || !el) return null;

  const doc = win.document;
  const rect = el.getBoundingClientRect();
  const scrollY = win.scrollY || doc.documentElement.scrollTop || 0;
  const scrollX = win.scrollX || doc.documentElement.scrollLeft || 0;
  const color = getImpactColor(violation?.impact);

  // Crea overlay base
  const overlay = doc.createElement("div");
  overlay.setAttribute("data-iaap-overlay", "true");

  Object.assign(overlay.style, {
    position: "absolute",
    top: `${rect.top + scrollY}px`,
    left: `${rect.left + scrollX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    border: `3px solid ${color}`,
    background: "rgba(0, 0, 0, 0.12)",
    borderRadius: "4px",
    zIndex: "999999",
    pointerEvents: "none",
    boxShadow: `0 0 18px ${color}55`,
  });

  doc.body.appendChild(overlay);

  // Número ID
  const label = doc.createElement("div");
  label.setAttribute("data-iaap-overlay", "true");

  Object.assign(label.style, {
    position: "absolute",
    top: `${rect.top + scrollY - 28}px`,
    left: `${rect.left + scrollX}px`,
    padding: "4px 8px",
    background: color,
    color: "white",
    fontSize: "12px",
    fontWeight: "bold",
    borderRadius: "3px",
    zIndex: "1000000",
    pointerEvents: "none",
    fontFamily: "Arial, sans-serif",
    letterSpacing: "0.2px",
    boxShadow: `0 6px 10px ${color}55`,
  });

  const criterioText = wcag?.criterio || violation?.id || "WCAG";
  const nivelText = wcag?.nivel ? ` · Nivel ${wcag.nivel}` : "";
  label.textContent = `#${index} · ${criterioText}${nivelText}`;
  doc.body.appendChild(label);

  if (wcag?.resumen || violation?.description) {
    const caption = doc.createElement("div");
    caption.setAttribute("data-iaap-overlay", "true");

    Object.assign(caption.style, {
      position: "absolute",
      top: `${rect.bottom + scrollY + 8}px`,
      left: `${rect.left + scrollX}px`,
      maxWidth: `${Math.max(rect.width, 240)}px`,
      padding: "6px 10px",
      background: "rgba(0, 0, 0, 0.82)",
      color: "white",
      fontSize: "11px",
      borderRadius: "4px",
      zIndex: "1000000",
      pointerEvents: "none",
      fontFamily: "Arial, sans-serif",
      lineHeight: "1.45",
      boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
    });

    caption.textContent = wcag?.resumen || violation.description;
    doc.body.appendChild(caption);
  }

  return { overlay, label, color };
}

/* ---------------------------------------------------------
   2) ELIMINA TODOS LOS HIGHLIGHTS
--------------------------------------------------------- */
export function clearHighlights(win) {
  const doc = win?.document;
  if (!doc) return;

  doc.querySelectorAll('[data-iaap-overlay="true"]').forEach((el) => el.remove());
}

/* ---------------------------------------------------------
   3) ANOTACIÓN ESTRUCTURADA PARA INFORMES
--------------------------------------------------------- */
export function annotateViolation(win, violation, index = 1) {
  const doc = win?.document;
  if (!doc) return null;

  const selector = violation.nodes?.[0]?.target?.[0];
  if (!selector) return null;

  const el = doc.querySelector(selector);
  if (!el) return null;

  const wcag = getWcagMetadata(violation.id);
  // Dibuja highlight visual + numeración
  const highlighted = highlightNode(win, el, index, violation, wcag);

  const rect = el.getBoundingClientRect();

  return {
    index,
    selector,
    rule: violation.id,
    impact: violation.impact,
    description: violation.description,
    help: violation.help,
    helpUrl: violation.helpUrl,
    html: el.outerHTML,
    snippet: (el.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 150),
    boundingBox: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    wcag: wcag
      ? {
          id: violation.id,
          ...wcag,
        }
      : null,
    highlightColor: highlighted?.color,
  };
}
