/**
 * Mapa completo de reglas axe-core → criterios WCAG 2.1 / 2.2 AA
 * --------------------------------------------------------------
 * Cada entrada contiene:
 * - criterio: Criterio WCAG 2.x
 * - esperado: Qué debe cumplirse
 * - url: Enlace oficial W3C “Understanding”
 * --------------------------------------------------------------
 * Puedes ampliar o actualizar fácilmente las entradas si axe-core añade nuevas reglas.
 */

export default {
  // --- Perceptible (Principio 1) ---

  "image-alt": {
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Todas las imágenes deben tener un texto alternativo significativo o aria-label equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html"
  },

  "audio-caption": {
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "Todo contenido de audio grabado debe tener subtítulos sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html"
  },

  "video-caption": {
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "Todo vídeo con sonido debe incluir subtítulos visibles y sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html"
  },

  "color-contrast": {
    criterio: "1.4.3 Contraste (mínimo) (AA)",
    esperado: "El texto debe tener un contraste mínimo de 4.5:1 (3:1 para texto grande o iconos esenciales).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"
  },

  "color-contrast-enhanced": {
    criterio: "1.4.6 Contraste (mejorado) (AAA)",
    esperado: "Contraste mínimo de 7:1 para texto normal o 4.5:1 para texto grande.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html"
  },

  "image-redundant-alt": {
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Evita duplicar texto alternativo si ya existe texto visible equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html"
  },

  "link-in-text-block": {
    criterio: "1.4.1 Uso del color (A)",
    esperado: "Los enlaces deben distinguirse por algo más que el color, como subrayado o negrita.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html"
  },

  "text-spacing": {
    criterio: "1.4.12 Espaciado del texto (AA)",
    esperado: "El contenido debe seguir siendo legible cuando el usuario ajusta el espaciado de texto y líneas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html"
  },

  // --- Operable (Principio 2) ---

  "landmark-one-main": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Cada página debe tener un único elemento <main> que contenga el contenido principal.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },

  "landmark-unique": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Cada tipo de landmark (banner, main, nav, complementary, etc.) debe ser único y no repetirse.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },

  "landmark-no-duplicate-main": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Solo puede haber un elemento <main> por documento.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },

  "skip-link": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Debe existir un enlace visible que permita saltar directamente al contenido principal.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },

  "link-name": {
    criterio: "2.4.4 Propósito de los enlaces (en contexto) (A)",
    esperado: "Los enlaces deben tener texto visible o aria-label que describa claramente su propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html"
  },

  "focus-order-semantics": {
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "El orden del foco debe seguir una secuencia lógica y significativa.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html"
  },

  "focus-visible": {
    criterio: "2.4.7 Foco visible (AA)",
    esperado: "Cada elemento interactivo debe mostrar un indicador de foco visible al recibir el foco.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html"
  },

  "aria-hidden-focus": {
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "Los elementos con aria-hidden='true' no deben recibir el foco del teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html"
  },

  "heading-order": {
    criterio: "1.3.2 Secuencia significativa (A)",
    esperado: "Los encabezados deben seguir una jerarquía lógica (h1 → h2 → h3…).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html"
  },

  "link-in-context": {
    criterio: "2.4.4 Propósito de los enlaces (en contexto) (A)",
    esperado: "El texto del enlace debe comunicar su propósito incluso fuera de contexto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html"
  },

  "aria-allowed-role": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los roles ARIA deben aplicarse solo a los elementos que los permiten.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  // --- Comprensible (Principio 3) ---

  "label": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Todos los campos de formulario deben tener etiquetas visibles o aria-label descriptivo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html"
  },

  "input-button-name": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Todos los botones deben tener texto o aria-label que describa su acción.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  "duplicate-id": {
    criterio: "4.1.1 Procesamiento (A)",
    esperado: "Cada ID debe ser único dentro del documento.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html"
  },

  "form-field-multiple-labels": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Cada campo de formulario debe tener solo una etiqueta asociada.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html"
  },

  "aria-required-children": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los roles ARIA deben contener los elementos hijos requeridos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  "aria-required-parent": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los elementos con roles ARIA deben estar dentro de un contenedor padre válido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  // --- Robusto (Principio 4) ---

  "aria-valid-attr": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Solo deben usarse atributos ARIA válidos definidos en la especificación.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  "aria-valid-attr-value": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los valores de los atributos ARIA deben ser válidos según el rol del elemento.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  "aria-roles": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Usa roles ARIA reconocidos y válidos según las especificaciones.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },

  "html-has-lang": {
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "El elemento <html> debe tener un atributo lang válido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html"
  },

  "html-lang-valid": {
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "El atributo lang de <html> debe ser un código de idioma válido (por ejemplo, 'es', 'en').",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html"
  },

  "meta-refresh": {
    criterio: "2.2.1 Tiempo ajustable (A)",
    esperado: "Evita el refresco automático mediante meta refresh; usa técnicas controladas por el usuario.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html"
  },

  "aria-hidden-body": {
    criterio: "1.3.1 Información y relaciones (A)",
    esperado: "El atributo aria-hidden='true' no debe aplicarse al elemento <body>.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html"
  },

  "frame-title": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Los iframes deben tener un título que describa su contenido o propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },

  "frame-tested": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Todo iframe debe ser comprobado con axe-core si es de mismo origen.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  }
};
