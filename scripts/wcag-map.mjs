/** 
 * @module wcag-map
 * ♿ Mapa maestro WCAG 2.1 / 2.2 (A + AA)
 * Versión profesional IAAP / EN 301 549 v4.1.1 (2025)
 * Compatible con export-to-xlsx.mjs y capture-evidence.mjs
 */

export const wcagMap = {
  // === PRINCIPIO 1: PERCEPTIBLE ===
  "1.1.1": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.1.1 Contenido no textual",
    esperado: "Todo contenido no textual tiene texto alternativo equivalente.",
    resumen: "El elemento visual carece de texto alternativo significativo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
  },
  "1.2.1": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.2.1 Solo audio y solo vídeo (grabado)",
    esperado:
      "Se ofrece alternativa textual o versión con contenido equivalente.",
    resumen:
      "No se proporciona alternativa textual para el contenido multimedia.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html",
  },
  "1.2.2": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.2.2 Subtítulos (grabado)",
    esperado: "Los vídeos con audio incluyen subtítulos sincronizados.",
    resumen: "El vídeo no tiene subtítulos sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
  },
  "1.2.3": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.2.3 Audiodescripción o alternativa multimedia",
    esperado: "Los vídeos ofrecen audiodescripción o texto equivalente.",
    resumen: "No se proporciona audiodescripción o alternativa textual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html",
  },
  "1.2.5": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.2.5 Audiodescripción (grabado)",
    esperado: "Los vídeos grabados incluyen audiodescripción sincronizada.",
    resumen: "El vídeo no proporciona audiodescripción.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html",
  },
  "1.3.1": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.3.1 Información y relaciones",
    esperado: "La estructura y relaciones se determinan programáticamente.",
    resumen:
      "Las relaciones entre elementos no son reconocibles por tecnologías de asistencia.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
  },
  "1.3.2": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.3.2 Secuencia significativa",
    esperado: "El orden de lectura es lógico y coherente.",
    resumen: "El orden visual no coincide con el orden de lectura.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html",
  },
  "1.3.3": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.3.3 Características sensoriales",
    esperado:
      "Las instrucciones no dependen solo del color, forma o posición.",
    resumen:
      "Las instrucciones dependen únicamente de características sensoriales.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html",
  },
  "1.4.1": {
    principio: "Perceptible",
    nivel: "A",
    criterio: "1.4.1 Uso del color",
    esperado: "El color no es el único medio para transmitir información.",
    resumen: "El color se usa como único indicador de significado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html",
  },
  "1.4.3": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.4.3 Contraste (mínimo)",
    esperado:
      "El texto tiene contraste mínimo 4.5:1 (3:1 para texto grande).",
    resumen: "El contraste entre texto y fondo es insuficiente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
  },
  "1.4.10": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.4.10 Reflujo",
    esperado: "El contenido se adapta sin desplazamiento horizontal.",
    resumen:
      "Hay desplazamiento horizontal al aumentar zoom o reducir ancho.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html",
  },
  "1.4.11": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.4.11 Contraste no textual",
    esperado: "Elementos gráficos y componentes tienen contraste 3:1.",
    resumen:
      "El contraste de iconos o bordes interactivos no cumple el mínimo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html",
  },
  "1.4.12": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.4.12 Espaciado del texto",
    esperado: "El contenido sigue siendo legible con ajustes de espaciado.",
    resumen: "El texto se corta o solapa al modificar espaciado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html",
  },
  "1.4.13": {
    principio: "Perceptible",
    nivel: "AA",
    criterio: "1.4.13 Contenido al pasar el puntero o al tener el foco",
    esperado: "Debe poderse cerrar sin mover el puntero o foco.",
    resumen: "Los tooltips no pueden cerrarse fácilmente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html",
  },

  // === PRINCIPIO 2: OPERABLE ===
  "2.1.1": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.1.1 Teclado",
    esperado: "Toda funcionalidad es operable con teclado.",
    resumen: "Hay elementos inaccesibles mediante teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
  },
  "2.1.2": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.1.2 Sin trampa para el foco",
    esperado: "Puede moverse el foco fuera de cualquier componente.",
    resumen: "El foco queda atrapado en un componente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html",
  },
  "2.4.1": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.4.1 Evitar bloques",
    esperado: "Hay mecanismo para saltar bloques repetitivos.",
    resumen: "No hay enlace para saltar la navegación repetida.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "2.4.3": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.4.3 Orden del foco",
    esperado: "El foco sigue un orden lógico.",
    resumen: "El foco se mueve de forma incoherente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
  },
  "2.4.4": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.4.4 Propósito de los enlaces (en contexto)",
    esperado:
      "El propósito del enlace se comprende por su texto o contexto.",
    resumen: "El enlace no comunica claramente su propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
  },
  "2.4.6": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.4.6 Encabezados y etiquetas",
    esperado: "Describen el tema o propósito del contenido.",
    resumen: "Las etiquetas no son suficientemente descriptivas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html",
  },
  "2.4.7": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.4.7 Foco visible",
    esperado: "Los elementos interactivos muestran foco visible.",
    resumen: "El foco no es visible al navegar con teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  },
  "2.4.11": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.4.11 Foco no oculto (mínimo)",
    esperado:
      "El foco visible no queda oculto por contenido superpuesto o desplazado.",
    resumen:
      "El indicador de foco se oculta parcialmente cuando el elemento gana foco.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html",
  },
  "2.4.12": {
    principio: "Operable",
    nivel: "AAA",
    criterio: "2.4.12 Foco no oculto (mejorado)",
    esperado: "El foco permanece completamente visible en todo momento.",
    resumen:
      "El foco queda oculto bajo otros elementos o fuera del área visible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html",
  },
  "2.5.1": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.5.1 Gestos con puntero",
    esperado:
      "Debe poderse ejecutar sin gestos multipunto o basados en trayectoria.",
    resumen: "No hay alternativa a gestos complejos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html",
  },
  "2.5.3": {
    principio: "Operable",
    nivel: "A",
    criterio: "2.5.3 Etiqueta en el nombre",
    esperado: "El texto visible coincide con el nombre accesible.",
    resumen: "El texto visible no coincide con el aria-label.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html",
  },
  "2.5.5": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.5.5 Tamaño del objetivo (mínimo)",
    esperado: "Las áreas táctiles tienen al menos 24×24 px.",
    resumen: "Los controles son demasiado pequeños o próximos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
  },
  "2.5.7": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.5.7 Arrastre con puntero",
    esperado:
      "Las funciones de arrastre pueden ejecutarse con un solo puntero.",
    resumen:
      "El componente requiere movimientos de arrastre complejos sin alternativa simple.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
  },
  "2.5.8": {
    principio: "Operable",
    nivel: "AA",
    criterio: "2.5.8 Tamaño del objetivo (mejorado)",
    esperado:
      "Todos los objetivos tienen área de al menos 24×24 px sin excepciones.",
    resumen: "Algunos controles no alcanzan el tamaño táctil recomendado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html",
  },

  // === PRINCIPIO 3: COMPRENSIBLE ===
  "3.1.1": {
    principio: "Comprensible",
    nivel: "A",
    criterio: "3.1.1 Idioma de la página",
    esperado: "El idioma principal se define correctamente en <html>.",
    resumen: "El atributo lang está ausente o incorrecto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
  },
  "3.2.2": {
    principio: "Comprensible",
    nivel: "A",
    criterio: "3.2.2 Al ingresar datos",
    esperado:
      "El contexto no cambia automáticamente al modificar un campo.",
    resumen:
      "Cambiar un campo provoca redirección o actualización automática.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html",
  },
  "3.2.6": {
    principio: "Comprensible",
    nivel: "AA",
    criterio: "3.2.6 Ayuda consistente",
    esperado: "Debe ofrecerse ayuda coherente en todas las páginas.",
    resumen: "La ayuda o contacto no es consistente entre páginas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html",
  },
  "3.3.1": {
    principio: "Comprensible",
    nivel: "A",
    criterio: "3.3.1 Identificación de errores",
    esperado: "Los errores se identifican claramente.",
    resumen:
      "Los campos erróneos no informan al usuario del problema.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html",
  },
  "3.3.2": {
    principio: "Comprensible",
    nivel: "A",
    criterio: "3.3.2 Etiquetas o instrucciones",
    esperado:
      "Cada campo tiene etiqueta visible o instrucciones claras.",
    resumen: "Campos sin etiqueta o ayuda contextual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "3.3.3": {
    principio: "Comprensible",
    nivel: "AA",
    criterio: "3.3.3 Sugerencias ante errores",
    esperado:
      "Se ofrecen sugerencias para corregir errores detectados.",
    resumen: "No se proponen sugerencias ante errores de entrada.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html",
  },
  "3.3.4": {
    principio: "Comprensible",
    nivel: "AA",
    criterio: "3.3.4 Prevención de errores",
    esperado:
      "Debe haber revisión o confirmación antes de enviar datos críticos.",
    resumen: "No hay confirmación al enviar información importante.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html",
  },
  "3.3.8": {
    principio: "Comprensible",
    nivel: "AA",
    criterio: "3.3.8 Entrada redundante",
    esperado:
      "No se requiere volver a introducir información ya proporcionada.",
    resumen:
      "El usuario debe repetir información que el sistema ya posee.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html",
  },

  // === PRINCIPIO 4: ROBUSTO ===
  "4.1.1": {
    principio: "Robusto",
    nivel: "A",
    criterio: "4.1.1 Procesamiento",
    esperado:
      "El código está correctamente anidado y sin errores de marcado.",
    resumen: "Hay errores de sintaxis o etiquetas mal anidadas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html",
  },
  "4.1.2": {
    principio: "Robusto",
    nivel: "A",
    criterio: "4.1.2 Nombre, función, valor",
    esperado: "Los componentes tienen nombre, rol y valor accesibles.",
    resumen:
      "Un elemento interactivo carece de nombre o rol accesible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "4.1.3": {
    principio: "Robusto",
    nivel: "AA",
    criterio: "4.1.3 Mensajes de estado",
    esperado:"Los cambios de estado se anuncian a los usuarios de AT.",
    resumen: "Los mensajes no se comunican a los lectores de pantalla.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  },
};

/**
 * Obtiene la información WCAG completa según ID o regla axe
 * @param {string} id - Código o nombre de la regla (ej: "color-contrast", "1.4.3")
 */
export function getWcagInfo(id) {
  if (!id) return null;

  const normalized = id
    .toLowerCase()
    .replace(/^wcag\d{2}-/, "")
    .replace(/^best-practice-/, "")
    .trim();
  const equivalencias = {
    "image-alt": "1.1.1",
    "area-alt": "1.1.1",
    "input-image-alt": "1.1.1",
    "object-alt": "1.1.1",
    "svg-img-alt": "1.1.1",
    "text-alternatives": "1.1.1",
    "video-caption": "1.2.2",
    "audio-caption": "1.2.1",
    "video-description": "1.2.3",
    "video-description-prerecorded": "1.2.5",
    "link-in-text-block": "1.4.1",
    "link-in-text-block-color": "1.4.1",
    "color-contrast": "1.4.3",
    "color-contrast-enhanced": "1.4.6",
    "meta-viewport": "1.4.4",
    "landmark-one-main": "1.3.1",
    "region": "1.3.1",
    "landmark-unique": "1.3.1",
    "landmark-no-duplicate-contentinfo": "1.3.1",
    "heading-order": "1.3.1",
    "heading-level": "1.3.1",
    "label-content-name-mismatch": "3.3.2",
    "focus-order": "2.4.3",
    "focus-order-semantics": "2.4.3",
    "focus-visible": "2.4.7",
    "tabindex": "2.4.3",
    "bypass": "2.4.1",
    "skip-link": "2.4.1",
    "link-name": "2.4.4",
    "role-link-name": "2.4.4",
    "page-has-heading-one": "2.4.6",
    "role-heading-name": "2.4.6",
    "keyboard": "2.1.1",
    "keyboard-trap": "2.1.2",
    "meta-refresh": "2.2.1",
    "meta-refresh-no-exception": "2.2.1",
    "blink": "2.2.2",
    "marquee": "2.2.2",
    "scrolling-content": "2.2.2",
    "no-autoplay-audio": "1.4.2",
    "no-autoplay": "2.2.2",
    "target-size": "2.5.5",
    "pointer-gestures": "2.5.1",
    "pointer-cancellation": "2.5.2",
    "label-in-name": "2.5.3",
    "label": "3.3.2",
    "label-title-only": "3.3.2",
    "input-label": "3.3.2",
    "form-field-multiple-labels": "3.3.2",
    "input-required": "3.3.1",
    "aria-input-field-name": "4.1.2",
    "aria-toggle-field-name": "4.1.2",
    "aria-tooltip-name": "4.1.2",
    "aria-progressbar-name": "4.1.2",
    "aria-meter-name": "4.1.2",
    "aria-menuitem-name": "4.1.2",
    "aria-modal-name": "4.1.2",
    "aria-multiselectable": "4.1.2",
    "aria-allowed-role": "4.1.2",
    "html-has-lang": "3.1.1",
    "html-lang-valid": "3.1.1",
    "valid-lang": "3.1.1",
    "duplicate-id": "4.1.1",
    "id-unique": "4.1.1",
    "no-duplicate-id": "4.1.1",
    "aria-hidden-focus": "4.1.2",
    "aria-allowed-attr": "4.1.2",
    "aria-allowed-attr-value": "4.1.2",
    "aria-roles": "4.1.2",
    "aria-valid-attr": "4.1.2",
    "aria-valid-attr-value": "4.1.2",
    "aria-command-name": "4.1.2",
    "aria-dialog-name": "4.1.2",
    "aria-treeitem-name": "4.1.2",
    "aria-gridcell-name": "4.1.2",
    "aria-combobox-name": "4.1.2",
    "aria-checkbox-name": "4.1.2",
    "aria-radio-name": "4.1.2",
    "aria-tab-name": "4.1.2",
    "aria-slider-name": "4.1.2",
    "aria-switch-name": "4.1.2",
    "aria-textbox-name": "4.1.2",
    "role-button-name": "4.1.2",
    "presentation-role-conflict": "1.3.1",
    "role-required-parent": "4.1.2",
    "role-required-child": "4.1.2",
    "role-img-alt": "1.1.1",
    "aria-hidden-body": "1.3.1",
    "aria-dpub-role-fallback": "4.1.2",
  };

   const match = equivalencias[normalized];
  if (match && wcagMap[match]) return { id, ...wcagMap[match] };

  if (wcagMap[id]) return { id, ...wcagMap[id] };

  const found = Object.entries(wcagMap).find(([key]) =>
    normalized.includes(key)
  );
  if (found) return { id, ...found[1] };

  // Smart search en español
  const keywords = {
    contraste: "1.4.3",
    foco: "2.4.7",
    teclado: "2.1.1",
    idioma: "3.1.1",
    etiqueta: "3.3.2",
    error: "3.3.1",
  };
  for (const [k, v] of Object.entries(keywords)) {
    if (normalized.includes(k) && wcagMap[v]) return { id, ...wcagMap[v] };
  }

  // Fallback
  return {
    id,
    criterio: "Criterio WCAG no identificado",
    principio: "Desconocido",
    nivel: "N/A",
    esperado: "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.",
    resumen: `Regla sin correspondencia directa (${id}).`,
    url: "https://www.w3.org/WAI/WCAG22/quickref/",
  };
}