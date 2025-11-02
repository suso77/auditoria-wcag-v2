/**
 * 📘 Mapa completo WCAG 2.1 / 2.2 (niveles A + AA)
 * ------------------------------------------------------------------
 * 🧩 Compatible con Node.js (CommonJS)
 * 🧭 Índice por número de criterio WCAG (ej: "1.1.1")
 * 💡 Cobertura: A + AA (exigidos por EN 301 549 y WCAG 2.1 AA)
 */

const wcagMapFull = {
  // === PRINCIPIO 1: PERCEPTIBLE ===
  "1.1.1": {
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Todo contenido no textual debe tener un texto alternativo equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
  },
  "1.2.1": {
    criterio: "1.2.1 Solo audio y solo vídeo (grabado) (A)",
    esperado: "Debe proporcionarse una alternativa textual o una versión con contenido equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html",
  },
  "1.2.2": {
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "Los contenidos de audio grabados deben tener subtítulos sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
  },
  "1.2.3": {
    criterio: "1.2.3 Audiodescripción o alternativa multimedia (grabado) (A)",
    esperado: "Los vídeos grabados deben tener audiodescripción o alternativa textual equivalente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html",
  },
  "1.2.4": {
    criterio: "1.2.4 Subtítulos (en directo) (AA)",
    esperado: "Los contenidos de audio en directo deben contar con subtítulos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html",
  },
  "1.2.5": {
    criterio: "1.2.5 Audiodescripción (grabado) (AA)",
    esperado: "Los vídeos grabados deben incluir audiodescripción sincronizada.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html",
  },
  "1.3.1": {
    criterio: "1.3.1 Información y relaciones (A)",
    esperado: "La información, estructura y relaciones deben estar programáticamente determinadas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
  },
  "1.3.2": {
    criterio: "1.3.2 Secuencia significativa (A)",
    esperado: "El orden de lectura debe ser lógico y coherente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html",
  },
  "1.3.3": {
    criterio: "1.3.3 Características sensoriales (A)",
    esperado: "Las instrucciones no deben depender solo de características sensoriales (color, forma, etc.).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html",
  },
  "1.4.1": {
    criterio: "1.4.1 Uso del color (A)",
    esperado: "El color no debe ser el único medio para transmitir información.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html",
  },
  "1.4.2": {
    criterio: "1.4.2 Control del audio (A)",
    esperado: "Debe ofrecerse un mecanismo para detener o controlar el audio que se reproduce automáticamente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html",
  },
  "1.4.3": {
    criterio: "1.4.3 Contraste (mínimo) (AA)",
    esperado: "El texto debe tener un contraste mínimo de 4.5:1 (3:1 para texto grande).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
  },
  "1.4.4": {
    criterio: "1.4.4 Redimensionar texto (AA)",
    esperado: "El texto debe poder ampliarse hasta un 200% sin pérdida de contenido o funcionalidad.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html",
  },
  "1.4.5": {
    criterio: "1.4.5 Imágenes de texto (AA)",
    esperado: "Evitar el uso de imágenes para mostrar texto, salvo necesidad esencial.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html",
  },
  "1.4.10": {
    criterio: "1.4.10 Reflujo (AA)",
    esperado: "El contenido no debe requerir desplazamiento horizontal en pantallas pequeñas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html",
  },
  "1.4.11": {
    criterio: "1.4.11 Contraste no textual (AA)",
    esperado: "Los elementos gráficos y componentes deben tener contraste suficiente (3:1).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html",
  },
  "1.4.12": {
    criterio: "1.4.12 Espaciado del texto (AA)",
    esperado: "El contenido debe seguir siendo legible con ajustes de espaciado y líneas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html",
  },
  "1.4.13": {
    criterio: "1.4.13 Contenido al pasar el puntero o al tener el foco (AA)",
    esperado: "Debe poderse descartar sin mover el foco o el puntero.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html",
  },

  // === PRINCIPIO 2: OPERABLE ===
  "2.1.1": {
    criterio: "2.1.1 Teclado (A)",
    esperado: "Toda funcionalidad debe ser operable mediante teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
  },
  "2.1.2": {
    criterio: "2.1.2 Sin trampa para el foco del teclado (A)",
    esperado: "Debe ser posible mover el foco fuera de cualquier componente solo con el teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html",
  },
  "2.2.1": {
    criterio: "2.2.1 Tiempo ajustable (A)",
    esperado: "Los usuarios deben poder detener o extender los límites de tiempo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html",
  },
  "2.2.2": {
    criterio: "2.2.2 Pausar, detener, ocultar (A)",
    esperado: "Los usuarios deben poder pausar o detener contenido en movimiento o parpadeo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html",
  },
  "2.3.1": {
    criterio: "2.3.1 Tres destellos o menos (A)",
    esperado: "El contenido no debe destellar más de tres veces por segundo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html",
  },
  "2.4.1": {
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Debe existir un mecanismo para saltar bloques repetidos de contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "2.4.2": {
    criterio: "2.4.2 Titulado de página (A)",
    esperado: "Cada página debe tener un título descriptivo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html",
  },
  "2.4.3": {
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "El orden del foco debe seguir una secuencia lógica.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
  },
  "2.4.4": {
    criterio: "2.4.4 Propósito de los enlaces (en contexto) (A)",
    esperado: "El propósito de cada enlace debe ser claro por su texto o contexto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
  },
  "2.4.5": {
    criterio: "2.4.5 Múltiples vías (AA)",
    esperado: "Debe ofrecerse más de un método para localizar una página (navegación, búsqueda…).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html",
  },
  "2.4.6": {
    criterio: "2.4.6 Encabezados y etiquetas (AA)",
    esperado: "Los encabezados y etiquetas deben describir el tema o propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html",
  },
  "2.4.7": {
    criterio: "2.4.7 Foco visible (AA)",
    esperado: "Los elementos interactivos deben mostrar foco visible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  },

  // === PRINCIPIO 3: COMPRENSIBLE ===
  "3.1.1": {
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "Debe especificarse el idioma principal del documento.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
  },
  "3.1.2": {
    criterio: "3.1.2 Idioma de las partes (AA)",
    esperado: "El idioma de las frases o palabras en otro idioma debe indicarse.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html",
  },
  "3.2.1": {
    criterio: "3.2.1 Al recibir el foco (A)",
    esperado: "No debe cambiar el contexto automáticamente al recibir el foco.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html",
  },
  "3.2.2": {
    criterio: "3.2.2 Al ingresar datos (A)",
    esperado: "El contexto no debe cambiar automáticamente al modificar un campo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html",
  },
  "3.2.3": {
    criterio: "3.2.3 Navegación coherente (AA)",
    esperado: "Los menús deben mantenerse en el mismo orden entre páginas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html",
  },
  "3.2.4": {
    criterio: "3.2.4 Identificación coherente (AA)",
    esperado: "Los componentes con la misma función deben tener etiquetas consistentes.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html",
  },
  "3.3.1": {
    criterio: "3.3.1 Identificación de errores (A)",
    esperado: "Los errores deben identificarse claramente en el formulario.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html",
  },
  "3.3.2": {
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Cada campo debe tener una etiqueta visible o instrucciones claras.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "3.3.3": {
    criterio: "3.3.3 Sugerencias ante errores (AA)",
    esperado: "El sistema debe ofrecer sugerencias cuando se detecten errores.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html",
  },
  "3.3.4": {
    criterio: "3.3.4 Prevención de errores (AA)",
    esperado: "Debe haber revisión o confirmación antes de enviar datos críticos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html",
  },

  // === PRINCIPIO 4: ROBUSTO ===
  "4.1.1": {
    criterio: "4.1.1 Procesamiento (A)",
    esperado: "El código debe estar correctamente anidado y sin errores de marcado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html",
  },
  "4.1.2": {
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los componentes deben tener nombre, función y valor accesibles.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "4.1.3": {
    criterio: "4.1.3 Mensajes de estado (AA)",
    esperado: "Los cambios de estado deben anunciarse automáticamente a los usuarios de AT.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  },
};

module.exports = wcagMapFull;
