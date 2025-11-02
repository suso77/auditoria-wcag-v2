/* === DICCIONARIO PROFESIONAL DE CRITERIOS WCAG 2.2 A/AA (Parte 1 de 3) === */
const WCAG_TEXTOS = {
  "1.1.1": {
    titulo: "Contenido no textual",
    nivel: "A",
    resumen: "Proporcionar texto alternativo para todo contenido no textual.",
    actual: "Algunos elementos visuales o gráficos carecen de texto alternativo o este no describe adecuadamente su función o propósito.",
    esperado: "Todo contenido no textual tiene un texto alternativo que cumple la misma función o propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html"
  },
  "1.2.1": {
    titulo: "Solo audio o vídeo (pregrabado)",
    nivel: "A",
    resumen: "Proporcionar alternativas para contenido solo-audio o solo-vídeo pregrabado.",
    actual: "Los contenidos multimedia solo-audio o solo-vídeo no tienen una alternativa textual equivalente.",
    esperado: "Se ofrece una transcripción o alternativa textual equivalente al contenido audiovisual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html"
  },
  "1.2.2": {
    titulo: "Subtítulos (pregrabado)",
    nivel: "A",
    resumen: "Proporcionar subtítulos sincronizados para todo vídeo pregrabado con audio.",
    actual: "Los vídeos con sonido no incluyen subtítulos.",
    esperado: "Todos los vídeos con audio incorporan subtítulos sincronizados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html"
  },
  "1.2.3": {
    titulo: "Audiodescripción o alternativa (pregrabado)",
    nivel: "A",
    resumen: "Ofrecer audiodescripción o transcripción para el contenido de vídeo pregrabado.",
    actual: "Los vídeos no incluyen audiodescripción o alternativa textual equivalente.",
    esperado: "Se proporciona audiodescripción o transcripción que describa la acción y la información visual relevante.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html"
  },
  "1.2.4": {
    titulo: "Subtítulos (en directo)",
    nivel: "AA",
    resumen: "Proporcionar subtítulos en contenido multimedia en directo.",
    actual: "Las transmisiones en directo con audio no ofrecen subtítulos.",
    esperado: "Se proporcionan subtítulos en tiempo real para el contenido de audio en directo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html"
  },
  "1.2.5": {
    titulo: "Audiodescripción (pregrabado)",
    nivel: "AA",
    resumen: "Proporcionar audiodescripción para vídeos pregrabados con información visual relevante.",
    actual: "Los vídeos pregrabados no incluyen pista de audiodescripción.",
    esperado: "Se incluye una pista de audiodescripción sincronizada con el contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html"
  },
  "1.3.1": {
    titulo: "Información y relaciones",
    nivel: "A",
    resumen: "Las relaciones y la estructura deben ser programáticamente determinables.",
    actual: "El marcado no refleja la estructura semántica del contenido.",
    esperado: "La estructura y las relaciones se representan mediante HTML semántico o ARIA adecuado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html"
  },
  "1.3.2": {
    titulo: "Secuencia significativa",
    nivel: "A",
    resumen: "El orden del contenido debe ser lógico y coherente.",
    actual: "El orden del DOM no coincide con el orden visual o semántico.",
    esperado: "El contenido se presenta en un orden que conserva su significado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html"
  },
  "1.3.3": {
    titulo: "Características sensoriales",
    nivel: "A",
    resumen: "Las instrucciones no deben depender únicamente de la forma, color o posición.",
    actual: "Se proporcionan instrucciones que dependen exclusivamente de características sensoriales.",
    esperado: "Las instrucciones incluyen texto o etiquetas que no dependen solo de la apariencia visual.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html"
  },
  "1.3.4": {
    titulo: "Orientación",
    nivel: "AA",
    resumen: "El contenido debe funcionar en cualquier orientación de pantalla.",
    actual: "El contenido bloquea el cambio de orientación.",
    esperado: "El contenido puede visualizarse tanto en vertical como en horizontal.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/orientation.html"
  },
  "1.3.5": {
    titulo: "Propósito de la entrada",
    nivel: "AA",
    resumen: "Identificar el propósito de cada campo de formulario.",
    actual: "Los campos de formulario no especifican atributos semánticos o autocomplete adecuados.",
    esperado: "Cada campo utiliza atributos semánticos o autocomplete que identifican su propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html"
  },
  "1.3.6": {
    titulo: "Propósito de los componentes de interfaz",
    nivel: "AA",
    resumen: "Identificar el propósito de iconos, botones o controles mediante nombre accesible.",
    actual: "Los controles no tienen etiquetas o roles que describan su propósito.",
    esperado: "Todos los componentes comunican su función a las tecnologías asistivas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/identify-purpose.html"
  },
  "1.4.1": {
    titulo: "Uso del color",
    nivel: "A",
    resumen: "El color no debe ser el único medio para transmitir información.",
    actual: "La información o el estado se comunican solo mediante color.",
    esperado: "Además del color, se usa texto o forma para comunicar la información.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html"
  },
  "1.4.2": {
    titulo: "Control del audio",
    nivel: "A",
    resumen: "Permitir detener o pausar cualquier audio que se reproduzca automáticamente.",
    actual: "El audio se reproduce automáticamente sin controles para detenerlo.",
    esperado: "El usuario puede detener o pausar el audio reproducido automáticamente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html"
  },
  "1.4.3": {
    titulo: "Contraste mínimo",
    nivel: "AA",
    resumen: "El texto debe tener contraste mínimo 4.5:1 con el fondo.",
    actual: "Algunos textos no cumplen el contraste mínimo requerido.",
    esperado: "Todo texto tiene contraste de al menos 4.5:1.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html"
  },
  "1.4.4": {
    titulo: "Redimensionar texto",
    nivel: "AA",
    resumen: "El texto debe poder ampliarse hasta un 200 % sin pérdida de contenido o funcionalidad.",
    actual: "El texto se corta o desborda al aumentar el zoom.",
    esperado: "El contenido sigue siendo legible y funcional al 200 % de zoom.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html"
  },
  "1.4.5": {
    titulo: "Imágenes de texto",
    nivel: "AA",
    resumen: "Evitar usar imágenes de texto salvo necesidad esencial.",
    actual: "El texto se presenta como imagen sin motivo funcional.",
    esperado: "El texto se muestra con fuentes reales, no como imágenes.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html"
  },
  "1.4.10": {
    titulo: "Reflow",
    nivel: "AA",
    resumen: "El contenido debe adaptarse sin desplazamiento horizontal.",
    actual: "El diseño requiere desplazamiento lateral o se corta al reducir ancho.",
    esperado: "El contenido se adapta correctamente a pantallas pequeñas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html"
  },
  "1.4.11": {
    titulo: "Contraste no textual",
    nivel: "AA",
    resumen: "Los gráficos y controles deben tener contraste mínimo de 3:1.",
    actual: "Algunos iconos o botones tienen contraste insuficiente.",
    esperado: "Todos los elementos no textuales tienen contraste 3:1 mínimo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html"
  },
  "1.4.12": {
    titulo: "Espaciado de texto",
    nivel: "AA",
    resumen: "El texto debe seguir siendo legible con espaciado ajustado.",
    actual: "El contenido se superpone o corta al aumentar el espaciado de texto.",
    esperado: "El contenido se muestra correctamente con los ajustes de espaciado recomendados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html"
  },
  "2.1.1": {
    titulo: "Teclado",
    nivel: "A",
    resumen: "Todo el contenido y la funcionalidad deben ser operables mediante teclado.",
    actual: "Algunos elementos interactivos no pueden usarse con el teclado.",
    esperado: "Todas las funciones pueden operarse mediante teclado sin requerir el ratón.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html"
  },
  "2.1.2": {
    titulo: "Sin trampa para el teclado",
    nivel: "A",
    resumen: "El foco no debe quedar atrapado dentro de ningún componente.",
    actual: "El foco de teclado se bloquea dentro de un modal o sección sin poder salir.",
    esperado: "El usuario puede mover el foco libremente hacia y desde cualquier elemento interactivo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html"
  },
  "2.1.4": {
    titulo: "Atajos de teclado de un solo carácter",
    nivel: "A",
    resumen: "Los atajos de teclado deben poder desactivarse o modificarse.",
    actual: "Hay atajos activados con una sola tecla sin opción de desactivarlos o reasignarlos.",
    esperado: "Los atajos pueden desactivarse, modificarse o se activan solo al tener foco.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html"
  },
  "2.2.1": {
    titulo: "Tiempo ajustable",
    nivel: "A",
    resumen: "Permitir al usuario extender o desactivar límites de tiempo.",
    actual: "El tiempo de sesión expira sin opción de ampliarlo o avisar al usuario.",
    esperado: "El usuario puede extender, ajustar o desactivar límites de tiempo según sus necesidades.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html"
  },
  "2.2.2": {
    titulo: "Pausar, detener o esconder",
    nivel: "A",
    resumen: "El contenido en movimiento o parpadeo debe poder pausarse o detenerse.",
    actual: "Carruseles o animaciones automáticas no tienen controles de pausa o detención.",
    esperado: "El usuario puede pausar, detener o esconder contenido en movimiento o parpadeo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html"
  },
  "2.3.1": {
    titulo: "Tres destellos o menos",
    nivel: "A",
    resumen: "El contenido no debe parpadear más de tres veces por segundo.",
    actual: "El contenido tiene destellos o parpadeos que superan los límites seguros.",
    esperado: "El contenido no parpadea más de tres veces por segundo o cumple umbrales de seguridad.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html"
  },
  "2.4.1": {
    titulo: "Evitar bloques",
    nivel: "A",
    resumen: "Proporcionar mecanismos para saltar bloques repetitivos.",
    actual: "No hay enlaces de salto o landmarks únicos para evitar contenido repetido.",
    esperado: "Existen enlaces de salto o landmarks únicos que permiten saltar bloques repetitivos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html"
  },
  "2.4.2": {
    titulo: "Títulos de página",
    nivel: "A",
    resumen: "Cada página debe tener un título descriptivo.",
    actual: "El título no refleja el propósito o está vacío.",
    esperado: "Cada página tiene un título claro y descriptivo que indica su propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html"
  },
  "2.4.3": {
    titulo: "Orden de foco",
    nivel: "A",
    resumen: "El foco debe seguir un orden lógico y predecible.",
    actual: "El orden de foco no sigue la secuencia visual o semántica esperada.",
    esperado: "El foco se mueve de forma lógica según el flujo de contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html"
  },
  "2.4.4": {
    titulo: "Propósito de los enlaces (en contexto)",
    nivel: "A",
    resumen: "Cada enlace debe tener un propósito claro dentro de su contexto.",
    actual: "Existen enlaces genéricos como 'clic aquí' sin contexto suficiente.",
    esperado: "El texto del enlace o su contexto dejan claro su propósito.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html"
  },
  "2.4.5": {
    titulo: "Múltiples vías",
    nivel: "AA",
    resumen: "Debe haber más de una manera de localizar una página dentro del sitio.",
    actual: "No existen alternativas para localizar contenido (solo navegación principal).",
    esperado: "Se proporciona al menos una alternativa (buscador, mapa del sitio, enlaces relacionados).",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html"
  },
  "2.4.6": {
    titulo: "Encabezados y etiquetas",
    nivel: "AA",
    resumen: "Los encabezados y etiquetas deben describir su tema o propósito.",
    actual: "Las etiquetas o encabezados no describen adecuadamente el contenido asociado.",
    esperado: "Las etiquetas y encabezados son precisos y comprensibles.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html"
  },
  "2.4.7": {
    titulo: "Foco visible",
    nivel: "AA",
    resumen: "El foco de teclado debe ser visible y claro.",
    actual: "El foco es invisible o tiene contraste insuficiente.",
    esperado: "El foco es fácilmente perceptible y tiene contraste adecuado.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html"
  },
  "2.5.1": {
    titulo: "Gestos de puntero",
    nivel: "A",
    resumen: "Las funciones que requieren gestos complejos deben tener alternativas simples.",
    actual: "El contenido requiere gestos de varios puntos (por ejemplo, pellizcar).",
    esperado: "Todas las funciones pueden realizarse con gestos de un solo punto o mediante controles alternativos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html"
  },
  "2.5.2": {
    titulo: "Cancelación del puntero",
    nivel: "A",
    resumen: "Las acciones de puntero deben poder cancelarse antes de completarse.",
    actual: "Los elementos se activan al presionar en lugar de al soltar, sin opción de cancelación.",
    esperado: "La activación ocurre al soltar o permite cancelarse antes de completarse.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html"
  },
  "2.5.3": {
    titulo: "Etiqueta en el nombre",
    nivel: "A",
    resumen: "El texto visible debe formar parte del nombre accesible del control.",
    actual: "El nombre accesible no coincide con el texto visible del control.",
    esperado: "El nombre accesible incluye el texto visible para garantizar coherencia.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html"
  },
  "2.5.4": {
    titulo: "Activación por movimiento",
    nivel: "A",
    resumen: "Las funciones activadas por movimiento deben tener alternativas.",
    actual: "El contenido requiere agitar o inclinar el dispositivo para interactuar.",
    esperado: "El usuario puede realizar la acción mediante controles estándar sin movimiento físico.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html"
  },
  "2.5.5": {
    titulo: "Tamaño del objetivo",
    nivel: "AA",
    resumen: "Los objetivos táctiles deben tener al menos 24x24 píxeles CSS o equivalente.",
    actual: "Los botones o enlaces son demasiado pequeños o están muy próximos entre sí.",
    esperado: "Los objetivos táctiles cumplen el tamaño mínimo recomendado para evitar errores.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html"
  },
  "3.1.1": {
    titulo: "Idioma de la página",
    nivel: "A",
    resumen: "El idioma principal del documento debe especificarse correctamente.",
    actual: "El atributo lang está ausente o es incorrecto.",
    esperado: "El atributo lang refleja correctamente el idioma principal del contenido.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html"
  },
  "3.1.2": {
    titulo: "Idioma de las partes",
    nivel: "AA",
    resumen: "Los cambios de idioma deben indicarse en el código.",
    actual: "Las frases en otros idiomas no se marcan con el atributo lang correspondiente.",
    esperado: "Cada cambio de idioma está correctamente etiquetado con su código de idioma.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html"
  },
  "3.2.1": {
    titulo: "En foco",
    nivel: "A",
    resumen: "Cambiar el foco no debe alterar el contexto automáticamente.",
    actual: "Mover el foco provoca cambios inesperados o navegación sin aviso.",
    esperado: "El cambio de foco no altera el contexto a menos que el usuario lo solicite.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html"
  },
  "3.2.2": {
    titulo: "En entrada",
    nivel: "A",
    resumen: "Cambiar un valor no debe alterar el contexto automáticamente.",
    actual: "Seleccionar una opción provoca cambios inesperados en la interfaz.",
    esperado: "Los cambios de valor no modifican el contexto salvo confirmación del usuario.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html"
  },
  "3.2.3": {
    titulo: "Navegación coherente",
    nivel: "AA",
    resumen: "Los elementos de navegación deben mantener el mismo orden y ubicación.",
    actual: "Los menús o enlaces cambian de posición entre páginas.",
    esperado: "Los elementos comunes de navegación se presentan de manera consistente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html"
  },
  "3.2.4": {
    titulo: "Identificación coherente",
    nivel: "AA",
    resumen: "Los componentes idénticos deben etiquetarse de la misma manera.",
    actual: "Controles iguales se nombran de forma distinta entre páginas.",
    esperado: "Los componentes con igual función usan las mismas etiquetas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html"
  },
  "3.3.1": {
    titulo: "Identificación de errores",
    nivel: "A",
    resumen: "Los errores de entrada deben identificarse claramente al usuario.",
    actual: "El sistema no comunica los errores de forma visible o comprensible.",
    esperado: "Cada error se identifica y describe junto al campo correspondiente.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html"
  },
  "3.3.2": {
    titulo: "Etiquetas o instrucciones",
    nivel: "A",
    resumen: "Los campos de entrada deben tener etiquetas o instrucciones claras.",
    actual: "Algunos campos carecen de etiquetas visibles o texto de ayuda.",
    esperado: "Cada campo tiene una etiqueta descriptiva o instrucciones adecuadas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html"
  },
  "3.3.3": {
    titulo: "Sugerencia de errores",
    nivel: "AA",
    resumen: "Los mensajes de error deben ofrecer sugerencias de corrección.",
    actual: "Los mensajes de error no indican cómo resolver el problema.",
    esperado: "Cada mensaje de error sugiere cómo corregir la entrada.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html"
  },
  "3.3.4": {
    titulo: "Prevención de errores (legal, financiero, datos)",
    nivel: "AA",
    resumen: "Las operaciones críticas deben confirmarse o poder deshacerse.",
    actual: "No se solicita confirmación antes de enviar formularios críticos.",
    esperado: "Las acciones críticas requieren confirmación, revisión o son reversibles.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html"

  },
  "2.4.8": {
    titulo: "Ubicación",
    nivel: "AAA",
    resumen: "Indicar claramente la ubicación del usuario dentro de un conjunto de páginas.",
    actual: "No hay indicador visible del lugar actual en el sitio (p. ej., migas de pan).",
    esperado: "El usuario puede identificar fácilmente en qué página o sección se encuentra.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/location.html"
  },
  "2.4.9": {
    titulo: "Propósito de los enlaces (solo enlace)",
    nivel: "AAA",
    resumen: "El texto del enlace por sí solo debe identificar su propósito.",
    actual: "Los enlaces carecen de texto suficientemente descriptivo fuera de contexto.",
    esperado: "Cada enlace describe claramente su destino incluso sin contexto adicional.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-link-only.html"
  },
  "2.4.10": {
    titulo: "Encabezados de sección",
    nivel: "AAA",
    resumen: "Las secciones de contenido deben tener encabezados descriptivos.",
    actual: "Bloques de contenido carecen de encabezados identificativos.",
    esperado: "Cada sección de contenido está encabezada por un título que describe su tema.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/section-headings.html"
  },
  "2.4.11": {
    titulo: "Apariencia del foco (nuevo 2.2)",
    nivel: "AA",
    resumen: "El indicador de foco visible debe tener suficiente tamaño y contraste.",
    actual: "El foco de teclado es difícil de distinguir o apenas visible.",
    esperado: "El indicador de foco es claro, visible y cumple requisitos mínimos de contraste y área.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html"
  },
  "2.4.12": {
    titulo: "No ocultar el foco (nuevo 2.2)",
    nivel: "AA",
    resumen: "El indicador de foco no debe quedar oculto por otros contenidos o desplazamiento.",
    actual: "El foco se desplaza fuera de la vista o queda cubierto al navegar por teclado.",
    esperado: "El foco siempre permanece visible y accesible en la ventana de visualización.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html"
  },
  "2.4.13": {
    titulo: "Apariencia del foco mejorada (nuevo 2.2)",
    nivel: "AAA",
    resumen: "El indicador de foco debe ser aún más visible que en el nivel mínimo.",
    actual: "El foco cumple el mínimo, pero sigue siendo poco perceptible para algunos usuarios.",
    esperado: "El indicador de foco tiene un contraste y tamaño significativamente superiores al mínimo.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance-enhanced.html"
  },
  "2.5.6": {
    titulo: "Entrada concurrente (nuevo 2.2)",
    nivel: "AAA",
    resumen: "Permitir el uso simultáneo de diferentes métodos de entrada (teclado, ratón, táctil).",
    actual: "El sistema bloquea la interacción si se cambia de método de entrada.",
    esperado: "El usuario puede alternar libremente entre métodos de entrada sin pérdida de contexto.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/concurrent-inputs.html"
  },
  "2.5.7": {
    titulo: "Arrastrar movimientos (nuevo 2.2)",
    nivel: "AA",
    resumen: "Toda función que requiera arrastrar debe tener una alternativa accesible.",
    actual: "El usuario debe arrastrar elementos sin alternativa de clic o teclado.",
    esperado: "Las acciones de arrastrar pueden realizarse mediante clics o controles de teclado equivalentes.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html"
  },
  "2.5.8": {
    titulo: "Tamaño del objetivo mejorado (nuevo 2.2)",
    nivel: "AA",
    resumen: "Los objetivos táctiles deben ser al menos de 24×24 píxeles CSS o tener separación suficiente.",
    actual: "Los botones o enlaces son pequeños o están demasiado juntos, dificultando la selección.",
    esperado: "Los objetivos táctiles son grandes o están lo bastante separados para facilitar su activación.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html"
  },
  "3.3.5": {
    titulo: "Ayuda",
    nivel: "AAA",
    resumen: "Se proporciona ayuda accesible y fácilmente localizable.",
    actual: "El usuario no tiene acceso a asistencia o información de contacto durante la tarea.",
    esperado: "Existe ayuda o soporte accesible para resolver incidencias durante la interacción.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/help.html"
  },
  "3.3.6": {
    titulo: "Prevención de errores (todos los contextos)",
    nivel: "AAA",
    resumen: "Evitar errores mediante revisión, confirmación o reversión de datos.",
    actual: "Las operaciones no ofrecen revisión o confirmación antes de enviarse.",
    esperado: "El usuario puede revisar, confirmar o revertir los datos antes de completarse una acción.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-all.html"
  },
  "4.1.1": {
    titulo: "Análisis sintáctico",
    nivel: "A",
    resumen: "El código debe estar libre de errores que afecten a las tecnologías asistivas.",
    actual: "El marcado HTML presenta errores estructurales o etiquetas sin cierre.",
    esperado: "El código cumple los estándares y no interfiere con la accesibilidad.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/parsing.html"
  },
  "4.1.2": {
    titulo: "Nombre, rol, valor",
    nivel: "A",
    resumen: "Los componentes de interfaz deben exponer correctamente su nombre, rol y estado.",
    actual: "Los controles personalizados no exponen información semántica o ARIA adecuada.",
    esperado: "Cada control comunica su rol, nombre y estado a las tecnologías asistivas.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html"
  },
  "4.1.3": {
    titulo: "Mensajes de estado",
    nivel: "AA",
    resumen: "Los mensajes de estado deben anunciarse automáticamente a los usuarios.",
    actual: "Los mensajes dinámicos no son detectados por los lectores de pantalla.",
    esperado: "Los mensajes utilizan roles ARIA apropiados (alert, status, etc.) para ser detectados.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html"
  }
  ,
  "2.4.11": {
    titulo: "Apariencia del foco (mínimo)",
    nivel: "AA",
    resumen: "El indicador de foco visible debe tener un tamaño y contraste mínimos para que sea perceptible.",
    actual: "El foco de teclado es difícil de distinguir o no cumple los requisitos de contraste o tamaño mínimo.",
    esperado: "El indicador de foco tiene un contraste de al menos 3:1 y una superficie visible suficiente para ser fácilmente perceptible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html"
  },
  "2.4.12": {
    titulo: "No ocultar el foco (mínimo)",
    nivel: "AA",
    resumen: "El indicador de foco no debe quedar oculto por otros contenidos o por desplazamiento.",
    actual: "El foco se desplaza fuera de la vista o queda cubierto por elementos superpuestos al navegar con el teclado.",
    esperado: "El indicador de foco siempre permanece visible dentro del área de visualización sin ser tapado por otros contenidos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html"
  },
  "2.4.13": {
    titulo: "Apariencia del foco mejorada",
    nivel: "AAA",
    resumen: "El indicador de foco debe ser claramente visible y cumplir requisitos mejorados de contraste y área.",
    actual: "El foco cumple los mínimos, pero sigue siendo poco perceptible para algunos usuarios o contextos de alto contraste.",
    esperado: "El indicador de foco tiene un contraste de al menos 4.5:1 y un tamaño de área mayor que el mínimo, siendo muy visible.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance-enhanced.html"
  },
  "2.5.6": {
    titulo: "Entrada concurrente",
    nivel: "AAA",
    resumen: "Debe permitirse el uso simultáneo de diferentes métodos de entrada (ratón, teclado, táctil, voz).",
    actual: "El sistema no responde correctamente al alternar entre ratón y teclado o al combinar métodos de entrada.",
    esperado: "El usuario puede usar o cambiar entre métodos de entrada sin perder el contexto o funcionalidad.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/concurrent-inputs.html"
  },
  "2.5.7": {
    titulo: "Movimientos de arrastre",
    nivel: "AA",
    resumen: "Las funciones que requieren arrastrar deben tener una alternativa accesible.",
    actual: "El contenido requiere arrastrar elementos sin ofrecer alternativa de clic o control mediante teclado.",
    esperado: "Las acciones de arrastrar pueden realizarse mediante clics o controles de teclado equivalentes.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html"
  },
  "2.5.8": {
    titulo: "Tamaño del objetivo (mejorado)",
    nivel: "AA",
    resumen: "Los objetivos táctiles deben ser suficientemente grandes o estar bien separados para evitar errores.",
    actual: "Los botones o enlaces son pequeños o están muy juntos, dificultando su activación táctil.",
    esperado: "Los objetivos táctiles tienen al menos 24x24 píxeles CSS o cuentan con suficiente separación.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html"
  },
  "3.2.6": {
    titulo: "Ayuda consistente",
    nivel: "A",
    resumen: "Los mecanismos de ayuda deben estar disponibles de manera coherente en todo el sitio.",
    actual: "La ayuda o el soporte no están ubicados de forma coherente o accesible en todas las páginas.",
    esperado: "Los enlaces o mecanismos de ayuda (contacto, chat, soporte) se encuentran en una posición coherente en todo el sitio.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html"
  },
  "3.3.7": {
    titulo: "Entrada redundante",
    nivel: "AA",
    resumen: "Evitar solicitar al usuario que repita información ya proporcionada en la misma sesión.",
    actual: "El usuario debe volver a introducir información ya facilitada (por ejemplo, dirección o correo electrónico).",
    esperado: "Los datos previamente introducidos se conservan o se ofrecen como sugerencia editable para evitar repeticiones.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html"
  },
  "4.1.4": {
    titulo: "Estados y propiedades dependientes",
    nivel: "A",
    resumen: "Los cambios en estados o propiedades dependientes deben comunicarse a las tecnologías asistivas.",
    actual: "Los elementos dependientes (campos dinámicos, pestañas o secciones) no anuncian sus cambios a los lectores de pantalla.",
    esperado: "Los estados dependientes se actualizan y comunican mediante atributos ARIA o propiedades HTML estándar accesibles.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/active-state.html"
  },
  "3.3.6": {
    titulo: "Prevención de errores (todos los contextos)",
    nivel: "AAA",
    resumen: "Proporcionar mecanismos de revisión, confirmación o reversión para evitar errores.",
    actual: "El sistema permite enviar información crítica sin confirmación ni revisión previa.",
    esperado: "Se ofrece una oportunidad de revisión o confirmación antes de completar acciones importantes o enviar datos.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-all.html"
  },
  "3.3.8": {
    titulo: "Confirmación accesible de acciones críticas",
    nivel: "AAA",
    resumen: "Las confirmaciones deben ser comprensibles y operables por cualquier usuario antes de realizar acciones irreversibles.",
    actual: "Las confirmaciones o avisos no son detectadas por lectores de pantalla o requieren interacciones complejas.",
    esperado: "Las confirmaciones se presentan de forma clara y son accesibles mediante teclado y lector de pantalla.",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-all.html"
  },

}
module.exports = { WCAG_TEXTOS };

