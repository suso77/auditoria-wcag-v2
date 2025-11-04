/**
 * ♿ Mapa axe-core → WCAG 2.1 / 2.2 (niveles A + AA)
 * ------------------------------------------------------------
 * 🧩 Uso: const wcagMapAxe = require("./wcag-map-axe.cjs");
 *        const info = wcagMapAxe[v.id];
 * ------------------------------------------------------------
 * Solo contiene reglas detectables automáticamente por axe-core.
 * Los criterios A + AA no cubiertos se listan en wcag-map-full.cjs
 */

const wcagMapAxe = {
  // === Principio 1: Perceptible ===
  "image-alt": {
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Todas las imágenes deben tener texto alternativo significativo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
  },
  "image-redundant-alt": {
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Evita duplicar texto alternativo si el texto visible ya describe la imagen.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
  },
  "audio-caption": {
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "El contenido de audio grabado debe tener subtítulos sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
  },
  "video-caption": {
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "Todo vídeo con audio debe incluir subtítulos visibles y sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
  },
  "video-description": {
    criterio: "1.2.5 Audiodescripción (grabado) (AA)",
    esperado: "El vídeo debe tener audiodescripción o alternativa textual equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html",
  },
  "color-contrast": {
    criterio: "1.4.3 Contraste (mínimo) (AA)",
    esperado: "El texto debe tener un contraste mínimo de 4.5:1 (3:1 para texto grande).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
  },
  "color-contrast-enhanced": {
    criterio: "1.4.6 Contraste (mejorado) (AAA)",
    esperado: "El texto debe tener un contraste de 7:1 (4.5:1 para texto grande).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html",
  },
  "link-in-text-block": {
    criterio: "1.4.1 Uso del color (A)",
    esperado: "Los enlaces deben distinguirse por algo más que el color.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html",
  },
  "text-spacing": {
    criterio: "1.4.12 Espaciado del texto (AA)",
    esperado: "El texto debe seguir siendo legible al modificar el espaciado de líneas y párrafos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html",
  },

  // === Principio 2: Operable ===
  "landmark-one-main": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Debe haber un único elemento <main> en cada página.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "landmark-unique": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Cada tipo de landmark debe ser único (banner, main, nav…).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "landmark-no-duplicate-main": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Solo puede existir un elemento <main> por documento.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "skip-link": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Debe existir un enlace que permita saltar al contenido principal.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "link-name": {
    criterio: "2.4.4 Propósito de los enlaces (A)",
    esperado: "Los enlaces deben describir su destino mediante texto o aria-label.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
  },
  "link-in-context": {
    criterio: "2.4.4 Propósito de los enlaces (A)",
    esperado: "El texto del enlace debe ser claro incluso fuera de contexto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
  },
  "focus-order-semantics": {
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "El orden del foco debe seguir una secuencia lógica y predecible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
  },
  "focus-visible": {
    criterio: "2.4.7 Foco visible (AA)",
    esperado: "Los elementos interactivos deben mostrar foco visible al recibirlo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  },
  "aria-hidden-focus": {
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "Los elementos con aria-hidden='true' no deben recibir foco.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
  },
  "meta-refresh": {
    criterio: "2.2.1 Tiempo ajustable (A)",
    esperado: "Evita el refresco automático mediante meta refresh.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html",
  },
  "frame-title": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Los iframes deben tener título que describa su contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },

  // === Principio 3: Comprensible ===
  "label": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Todos los campos deben tener una etiqueta visible o aria-label.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "form-field-multiple-labels": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Cada campo de formulario debe tener solo una etiqueta asociada.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "label-title-only": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "El atributo title no es suficiente como etiqueta accesible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "html-has-lang": {
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "El elemento <html> debe tener atributo lang válido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
  },
  "html-lang-valid": {
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "El valor de lang debe ser un código de idioma válido (ej. 'es', 'en').",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
  },

  // === Principio 4: Robusto ===
  "aria-allowed-role": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Usa roles ARIA solo en elementos compatibles.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-required-children": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los roles ARIA deben incluir sus hijos requeridos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-required-parent": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los elementos ARIA deben estar dentro de un contenedor padre válido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-valid-attr": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Usa solo atributos ARIA válidos según la especificación.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-valid-attr-value": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los valores ARIA deben ser válidos según el rol.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-roles": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Usa roles ARIA reconocidos y definidos por la especificación.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "duplicate-id": {
    criterio: "4.1.1 Procesamiento (A)",
    esperado: "Cada ID en el documento debe ser único.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html",
  },
  "input-button-name": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los botones deben tener nombre accesible (texto o aria-label).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "aria-hidden-body": {
    criterio: "1.3.1 Información y relaciones (A)",
    esperado: "No uses aria-hidden='true' en el elemento <body>.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
  },
};

module.exports = wcagMapAxe;
