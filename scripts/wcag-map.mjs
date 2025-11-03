/**
 * ♿ Mapa maestro WCAG 2.1 / 2.2 (niveles A + AA)
 * ------------------------------------------------------------
 * Incluye todos los criterios WCAG relevantes para auditorías web y app.
 * Devuelve descripción, criterio, texto esperado, resumen y enlace W3C.
 */

export const wcagMap = {
  // === PRINCIPIO 1: PERCEPTIBLE ===
  "1.1.1": {
    principio: "Perceptible",
    criterio: "1.1.1 Contenido no textual (A)",
    esperado: "Todo contenido no textual debe tener un texto alternativo equivalente.",
    resumen: "La imagen, icono o elemento visual carece de un texto alternativo significativo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
  },
  "1.2.1": {
    principio: "Perceptible",
    criterio: "1.2.1 Solo audio y solo vídeo (grabado) (A)",
    esperado: "Debe proporcionarse una alternativa textual o una versión con contenido equivalente.",
    resumen: "El contenido multimedia no tiene alternativa textual o descriptiva.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html",
  },
  "1.2.2": {
    principio: "Perceptible",
    criterio: "1.2.2 Subtítulos (grabado) (A)",
    esperado: "Los vídeos con audio deben incluir subtítulos sincronizados.",
    resumen: "El vídeo no tiene subtítulos sincronizados que representen el contenido sonoro.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
  },
  "1.2.3": {
    principio: "Perceptible",
    criterio: "1.2.3 Audiodescripción o alternativa multimedia (A)",
    esperado: "Los vídeos deben ofrecer audiodescripción o alternativa textual equivalente.",
    resumen: "No se proporciona audiodescripción ni alternativa textual para el vídeo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html",
  },
  "1.2.4": {
    principio: "Perceptible",
    criterio: "1.2.4 Subtítulos (en directo) (AA)",
    esperado: "Los contenidos de audio en directo deben contar con subtítulos en tiempo real.",
    resumen: "El contenido en directo no dispone de subtítulos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html",
  },
  "1.2.5": {
    principio: "Perceptible",
    criterio: "1.2.5 Audiodescripción (grabado) (AA)",
    esperado: "Los vídeos grabados deben incluir audiodescripción sincronizada.",
    resumen: "El vídeo no proporciona audiodescripción para usuarios ciegos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html",
  },
  "1.3.1": {
    principio: "Perceptible",
    criterio: "1.3.1 Información y relaciones (A)",
    esperado: "La información, estructura y relaciones deben estar programáticamente determinadas.",
    resumen: "Las relaciones entre etiquetas, encabezados o grupos no son reconocibles por tecnologías de asistencia.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
  },
  "1.3.2": {
    principio: "Perceptible",
    criterio: "1.3.2 Secuencia significativa (A)",
    esperado: "El orden de lectura debe ser lógico y coherente.",
    resumen: "El orden visual y el orden de lectura del contenido no coinciden.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html",
  },
  "1.3.3": {
    principio: "Perceptible",
    criterio: "1.3.3 Características sensoriales (A)",
    esperado: "Las instrucciones no deben depender solo de características sensoriales (color, forma, etc.).",
    resumen: "Las indicaciones dependen únicamente de color o forma.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html",
  },
  "1.4.1": {
    principio: "Perceptible",
    criterio: "1.4.1 Uso del color (A)",
    esperado: "El color no debe ser el único medio para transmitir información.",
    resumen: "El color es el único indicador de estado o categoría.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html",
  },
  "1.4.2": {
    principio: "Perceptible",
    criterio: "1.4.2 Control del audio (A)",
    esperado: "Debe ofrecerse un mecanismo para detener o controlar el audio que se reproduce automáticamente.",
    resumen: "Se reproduce audio automáticamente sin control del usuario.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html",
  },
  "1.4.3": {
    principio: "Perceptible",
    criterio: "1.4.3 Contraste (mínimo) (AA)",
    esperado: "El texto debe tener un contraste mínimo de 4.5:1 (3:1 para texto grande).",
    resumen: "El contraste entre texto y fondo es insuficiente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
  },
  "1.4.10": {
    principio: "Perceptible",
    criterio: "1.4.10 Reflujo (AA)",
    esperado: "El contenido debe presentarse sin desplazamiento horizontal al aumentar zoom o reducir ancho.",
    resumen: "El diseño obliga a desplazamiento horizontal en pantallas pequeñas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html",
  },
  "1.4.11": {
    principio: "Perceptible",
    criterio: "1.4.11 Contraste no textual (AA)",
    esperado: "Los elementos gráficos y componentes deben tener contraste mínimo de 3:1.",
    resumen: "El contraste de iconos o bordes interactivos no cumple los niveles mínimos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html",
  },
  "1.4.12": {
    principio: "Perceptible",
    criterio: "1.4.12 Espaciado del texto (AA)",
    esperado: "El contenido debe seguir siendo legible con ajustes de espaciado y líneas.",
    resumen: "El contenido se solapa o corta al ajustar espaciado entre líneas o letras.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html",
  },
  "1.4.13": {
    principio: "Perceptible",
    criterio: "1.4.13 Contenido al pasar el puntero o al tener el foco (AA)",
    esperado: "Debe poderse descartar sin mover el foco o el puntero.",
    resumen: "Los tooltips o elementos flotantes no se pueden cerrar fácilmente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html",
  },

  // === PRINCIPIO 2: OPERABLE ===
  "2.1.1": {
    principio: "Operable",
    criterio: "2.1.1 Teclado (A)",
    esperado: "Toda funcionalidad debe ser operable mediante teclado.",
    resumen: "Algunos elementos no son accesibles sin ratón.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
  },
  "2.1.2": {
    principio: "Operable",
    criterio: "2.1.2 Sin trampa para el foco (A)",
    esperado: "Debe ser posible mover el foco fuera de cualquier componente solo con el teclado.",
    resumen: "El foco queda atrapado en un componente sin opción de salida con teclado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html",
  },
  "2.1.4": {
    principio: "Operable",
    criterio: "2.1.4 Atajos de teclado de un solo carácter (A)",
    esperado: "Los atajos deben poder desactivarse o modificarse.",
    resumen: "Los atajos con una sola tecla no se pueden desactivar, provocando errores.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html",
  },
  "2.2.1": {
    principio: "Operable",
    criterio: "2.2.1 Tiempo ajustable (A)",
    esperado: "Los usuarios deben poder detener o extender los límites de tiempo.",
    resumen: "No hay forma de pausar o extender límites temporales de sesión o contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html",
  },
  "2.2.2": {
    principio: "Operable",
    criterio: "2.2.2 Pausar, detener, ocultar (A)",
    esperado: "Los usuarios deben poder pausar o detener contenido en movimiento o parpadeo.",
    resumen: "No se permite pausar animaciones o carruseles automáticos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html",
  },
  "2.3.1": {
    principio: "Operable",
    criterio: "2.3.1 Tres destellos o menos (A)",
    esperado: "El contenido no debe destellar más de tres veces por segundo.",
    resumen: "Hay contenido que parpadea más de tres veces por segundo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html",
  },
  "2.4.1": {
    principio: "Operable",
    criterio: "2.4.1 Evitar bloques (A)",
    esperado: "Debe existir un mecanismo para saltar bloques repetidos de contenido.",
    resumen: "No hay enlace o método para saltar navegación repetitiva.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
  },
  "2.4.2": {
    principio: "Operable",
    criterio: "2.4.2 Titulado de página (A)",
    esperado: "Cada página debe tener un título descriptivo.",
    resumen: "El título de la página no describe su contenido o está vacío.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html",
  },
  "2.4.3": {
    principio: "Operable",
    criterio: "2.4.3 Orden del foco (A)",
    esperado: "El orden del foco debe seguir una secuencia lógica.",
    resumen: "El foco se mueve en un orden incoherente respecto al contenido visual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
  },
  "2.4.4": {
    principio: "Operable",
    criterio: "2.4.4 Propósito de los enlaces (A)",
    esperado: "El propósito de cada enlace debe ser claro por su texto o contexto.",
    resumen: "El enlace no comunica su propósito de manera comprensible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
  },
  "2.4.6": {
    principio: "Operable",
    criterio: "2.4.6 Encabezados y etiquetas (AA)",
    esperado: "Los encabezados y etiquetas deben describir el tema o propósito.",
    resumen: "Las etiquetas no describen adecuadamente la función del campo o sección.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html",
  },
  "2.4.7": {
    principio: "Operable",
    criterio: "2.4.7 Foco visible (AA)",
    esperado: "Los elementos interactivos deben mostrar foco visible.",
    resumen: "El foco del teclado no es visible en los elementos interactivos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  },
  "2.4.11": {
    principio: "Operable",
    criterio: "2.4.11 Apariencia del foco (AA)",
    esperado: "El indicador de foco debe tener un contraste suficiente y tamaño mínimo.",
    resumen: "El foco visible no cumple con el contraste o área mínima exigida.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html",
  },
  "2.5.1": {
    principio: "Operable",
    criterio: "2.5.1 Gestos con puntero (A)",
    esperado: "Las funciones deben poder ejecutarse sin gestos multipunto o basados en trayectoria.",
    resumen: "Solo se puede interactuar mediante gestos complejos sin alternativa simple.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html",
  },
  "2.5.2": {
    principio: "Operable",
    criterio: "2.5.2 Cancelación del puntero (A)",
    esperado: "Debe poderse cancelar la acción antes de completar el gesto.",
    resumen: "Acciones táctiles se activan antes de poder cancelarlas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html",
  },
  "2.5.3": {
    principio: "Operable",
    criterio: "2.5.3 Etiqueta en el nombre (A)",
    esperado: "El texto visible debe coincidir con el nombre accesible del control.",
    resumen: "El texto visible del botón no coincide con su etiqueta aria-label.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html",
  },
  "2.5.5": {
    principio: "Operable",
    criterio: "2.5.5 Tamaño del objetivo (AA)",
    esperado: "Las áreas táctiles deben tener al menos 24×24 px.",
    resumen: "Los controles táctiles son demasiado pequeños o están muy próximos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
  },
  "2.5.7": {
    principio: "Operable",
    criterio: "2.5.7 Arrastrar movimientos (AA)",
    esperado: "Debe existir alternativa a gestos de arrastrar.",
    resumen: "No se puede realizar la acción sin arrastrar, dificultando a usuarios con movilidad reducida.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
  },
  "2.5.8": {
    principio: "Operable",
    criterio: "2.5.8 Tamaño del objetivo mínimo (AA)",
    esperado: "Los elementos táctiles deben medir al menos 24 px por lado o tener espacio equivalente.",
    resumen: "Los elementos interactivos táctiles son demasiado pequeños.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
  },

  // === PRINCIPIO 3: COMPRENSIBLE ===
  "3.1.1": {
    principio: "Comprensible",
    criterio: "3.1.1 Idioma de la página (A)",
    esperado: "Debe especificarse el idioma principal del documento.",
    resumen: "El atributo lang en <html> está ausente o incorrecto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
  },
  "3.2.2": {
    principio: "Comprensible",
    criterio: "3.2.2 Al ingresar datos (A)",
    esperado: "El contexto no debe cambiar automáticamente al modificar un campo.",
    resumen: "Cambiar un campo provoca redirección o actualización automática.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html",
  },
  "3.2.4": {
    principio: "Comprensible",
    criterio: "3.2.4 Identificación coherente (AA)",
    esperado: "Los componentes con la misma función deben tener etiquetas consistentes.",
    resumen: "Los botones con igual función tienen nombres distintos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html",
  },
  "3.3.1": {
    principio: "Comprensible",
    criterio: "3.3.1 Identificación de errores (A)",
    esperado: "Los errores deben identificarse claramente en el formulario.",
    resumen: "Los campos erróneos no informan al usuario del problema.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html",
  },
  "3.3.2": {
    principio: "Comprensible",
    criterio: "3.3.2 Etiquetas o instrucciones (A)",
    esperado: "Cada campo debe tener etiqueta visible o instrucciones claras.",
    resumen: "Campos sin etiqueta ni ayuda contextual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
  },
  "3.3.3": {
    principio: "Comprensible",
    criterio: "3.3.3 Sugerencias ante errores (AA)",
    esperado: "El sistema debe ofrecer sugerencias cuando se detecten errores.",
    resumen: "El formulario muestra errores pero no sugiere cómo resolverlos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html",
  },
  "3.3.4": {
    principio: "Comprensible",
    criterio: "3.3.4 Prevención de errores (AA)",
    esperado: "Debe haber revisión o confirmación antes de enviar datos críticos.",
    resumen: "No hay confirmación al enviar información importante.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html",
  },
  "3.3.7": {
    principio: "Comprensible",
    criterio: "3.3.7 Ayuda consistente (AA)",
    esperado: "Debe ofrecerse ayuda coherente y localizada en todas las páginas.",
    resumen: "El acceso a ayuda o contacto no es consistente entre páginas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html",
  },
  "3.3.8": {
    principio: "Comprensible",
    criterio: "3.3.8 Validación redundante (AA)",
    esperado: "La validación no debe requerir múltiples pasos innecesarios.",
    resumen: "Se exige validación redundante o repetitiva al usuario.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html",
  },

  // === PRINCIPIO 4: ROBUSTO ===
  "4.1.1": {
    principio: "Robusto",
    criterio: "4.1.1 Procesamiento (A)",
    esperado: "El código debe estar correctamente anidado y sin errores de marcado.",
    resumen: "Hay errores de sintaxis o etiquetas mal anidadas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html",
  },
  "4.1.2": {
    principio: "Robusto",
    criterio: "4.1.2 Nombre, función, valor (A)",
    esperado: "Los componentes deben tener nombre, función y valor accesibles.",
    resumen: "Un elemento interactivo carece de nombre o rol accesible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
  },
  "4.1.3": {
    principio: "Robusto",
    criterio: "4.1.3 Mensajes de estado (AA)",
    esperado: "Los cambios de estado deben anunciarse automáticamente a los usuarios de AT.",
    resumen: "Mensajes de éxito o error no son anunciados por el lector de pantalla.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  },
};

/**
 * 🔍 Devuelve información completa y compatible con axe-core
 * @param {string} id - ID de la regla (por ejemplo "color-contrast" o "1.4.3")
 * @returns {{criterio:string, esperado:string, resumen:string, url:string, principio?:string}|null}
 */
export function getWcagInfo(id) {
  if (!id) return null;
  const normalized = id.trim().toLowerCase();

  // 1️⃣ Búsqueda directa por número o nombre exacto
  if (wcagMap[normalized]) return { id, ...wcagMap[normalized] };

  // 2️⃣ Coincidencia parcial: axe-core → WCAG
  const equivalencias = {
    // === PERCEPTIBLE ===
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

    // === OPERABLE ===
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

    // === COMPRENSIBLE ===
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

    // === ROBUSTO ===
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

  const matchKey = equivalencias[normalized];
  if (matchKey && wcagMap[matchKey]) return { id, ...wcagMap[matchKey] };

  // 3️⃣ Búsqueda aproximada (por prefijo del número de criterio)
  const found = Object.entries(wcagMap).find(([key]) =>
    key.startsWith(normalized.slice(0, 3))
  );
  if (found) return { id, ...found[1] };

  // 4️⃣ Fallback: texto genérico para reglas no mapeadas
  return {
    id,
    criterio: "Criterio WCAG no identificado",
    esperado: "Debe cumplir las pautas WCAG 2.1/2.2 aplicables.",
    resumen: `Regla sin correspondencia directa (${id}).`,
    url: "https://www.w3.org/WAI/WCAG22/quickref/",
  };
}
