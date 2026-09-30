/**
 * Léxico de lectores de pantalla: cómo nombran el rol NVDA/VoiceOver/JAWS.
 *
 * Las frases reales mezclan idiomas (VoiceOver en español dice «botón», pero a
 * veces expone el rol en inglés: «link Saltar al contenido»). Por eso cada rol
 * del motor se asocia a un conjunto de palabras clave en ES y EN, y la
 * comparación se hace sobre texto normalizado (sin acentos ni mayúsculas).
 *
 * ── Dos lectores, un léxico ───────────────────────────────────────────────
 * NVDA y VoiceOver no dicen lo mismo para lo mismo. Para una imagen, VoiceOver
 * dice «imagen» y NVDA dice «gráfico»; para un enlace, «enlace» y «vínculo»;
 * para un campo de texto, «campo de texto» y «edición»; para un radio, «botón
 * de radio» y «botón de opción». Las palabras de los dos conviven en la misma
 * tabla: reconocer de más un rol no absuelve ninguna barrera, porque el rol solo
 * se usa para CONFIRMAR lo que el motor ya predijo.
 *
 * El ruido es otra cosa. Ahí sí importa de quién es la frase, y por eso va por
 * lector: lo que se recorta de más puede convertir un control SIN nombre en uno
 * con nombre, y absolver un 4.1.2 real. Por defecto se aplica el ruido de los
 * dos —recortar de más es lo seguro aquí: deja el residuo más corto, y un
 * residuo corto es lo que confirma la barrera, no lo que la perdona.
 */

// Normaliza para comparar: minúsculas, sin diacríticos, espacios colapsados.
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Rol del motor (token en inglés) → palabras que un lector podría pronunciar.
export const ROLE_KEYWORDS = {
  button: ["boton", "button"],
  link: ["enlace", "link", "vinculo"],
  checkbox: ["casilla", "casilla de verificacion", "checkbox", "check box"],
  radio: ["boton de radio", "boton de opcion", "radio button", "radio"],
  switch: ["conmutador", "interruptor", "switch", "toggle"],
  textbox: ["campo de texto", "area de texto", "area de entrada de texto", "cuadro de texto", "text field", "edit text", "editable text", "campo editable", "cuadro de edicion", "edicion", "editable", "edit"],
  searchbox: ["campo de busqueda", "busqueda", "search field", "search"],
  combobox: ["cuadro combinado", "combo box", "combobox", "menu emergente", "pop up button", "desplegable"],
  slider: ["control deslizante", "deslizador", "slider"],
  spinbutton: ["campo incremental", "control numerico", "stepper", "spin button"],
  heading: ["encabezado", "titulo", "heading"],
  // NVDA en español dice «gráfico» donde VoiceOver dice «imagen».
  img: ["imagen", "image", "graphic", "grafico"],
  link_image: ["imagen", "image", "grafico"],
  tab: ["pestana", "tab"],
  menuitem: ["elemento de menu", "menu item", "opcion de menu"],
  option: ["opcion", "option"],
  listitem: ["elemento de lista", "list item", "vineta"],
  list: ["lista", "list"],
  dialog: ["dialogo", "dialog", "cuadro de dialogo"],
  // NVDA anuncia las regiones como «punto de referencia» (landmark).
  region: ["region", "punto de referencia", "landmark"],
  navigation: ["navegacion", "navigation", "punto de referencia"],
  main: ["principal", "contenido principal", "main"],
  banner: ["banner", "cabecera"],
  contentinfo: ["informacion del contenido", "pie de pagina", "contentinfo"],
  table: ["tabla", "table"],
  cell: ["celda", "cell"],
  gridcell: ["celda", "cell"]
};

// ¿La frase hablada contiene alguna palabra clave del rol esperado?
// Coincidencia por palabra completa para las de una palabra (evita que "tab"
// dispare dentro de "tabla"); por subcadena solo para las frases multi-palabra.
export function spokenHasRole(spoken, role) {
  const kws = ROLE_KEYWORDS[role];
  if (!kws) return false;
  const n = normalize(spoken);
  const tokens = new Set(n.split(/[^a-z0-9ñ]+/).filter(Boolean));
  return kws.some(function (kw) {
    const k = normalize(kw);
    return k.indexOf(" ") !== -1 ? n.indexOf(k) !== -1 : tokens.has(k);
  });
}

// Frases de "chrome" del lector que no son contenido (ayudas, foco, etc.).
// Se recortan antes de comparar el nombre, para no dar falsos positivos.
const RUIDO_VOICEOVER = [
  /est[aá]s en un elemento de tipo[\s\S]*$/i,
  /para (hacer clic|salir|dejar de interactuar|interactuar)[\s\S]*$/i,
  /tiene el foco del teclado/gi,
  /voiceover (activado|desactivado|est[aá] activado)/gi,
  /bienvenido a macos/gi,
  // Vistas en transcripciones reales de VoiceOver en español:
  /inserci[oó]n al (principio|final)( de la palabra| del texto)?[.:]?/gi,
  /sin selecci[oó]n\.?/gi,
  /fila \d+ de \d+/gi,
  /\b\d+ [ií]tems?\b/gi
];

/* Estado y posición: lo dicen LOS DOS lectores, así que se recorta siempre.
 *
 * Estaban dentro de `RUIDO_NVDA`, y `stripReaderNoise` aplica una sola lista
 * cuando se le pasa el lector. Con `lector: "voiceover"` —que es lo que hacen los
 * adaptadores reales— esas palabras sobrevivían: VoiceOver en español también dice
 * «contraído», «marcada» y «visitado», y con ese residuo un control SIN nombre
 * accesible dejaba de ser `barrera-confirmada` y pasaba a «divergente: el lector sí
 * pronuncia un nombre que el motor no previó: revisar posible falso positivo». Un
 * 4.1.2 real degradado a sospecha de falso positivo NUESTRO, y por una palabra que
 * no es un nombre.
 *
 * El criterio de reparto es simple: aquí va lo que describe el ESTADO o la POSICIÓN
 * de un elemento, que ningún lector cuenta como nombre; en las listas por lector se
 * queda solo la cháchara propia de cada sistema («bienvenido a macOS», «modo
 * exploración»). Se han añadido «pulsado», «atenuado» y compañía, que no estaban en
 * ninguna de las dos.
 */
const ESTADO_COMUN = [
  /\b(no )?marcad[oa]s?\b/gi,
  /\bparcialmente marcad[oa]\b/gi,
  /\b(contra[ií]do|expandido|plegado|desplegado)\b/gi,
  /\b(visitado|no visitado)\b/gi,
  /\b(pulsado|no pulsado|presionado)\b/gi,
  /\b(atenuado|deshabilitado|desactivado para edici[oó]n)\b/gi,
  /\b(seleccionado|no seleccionado)\b/gi,
  /\bsolo lectura\b/gi,
  /\bclic?able\b/gi,
  /\brequerido\b/gi,
  /\bobligatorio\b/gi,
  /\bno v[aá]lido\b/gi,
  /\bno disponible\b/gi,
  /\btiene men[uú] emergente\b/gi,
  /\bnivel \d+\b/gi,
  /\b\d+ de \d+\b/gi,
  /\bfila \d+( columna \d+)?\b/gi,
  /\bcolumna \d+\b/gi,
  /\bcon \d+ elementos?\b/gi,
  /\bcon \d+ filas? y \d+ columnas?\b/gi
];

/* Ruido de NVDA en español.
 *
 * NVDA acompaña cada elemento de su ESTADO y su POSICIÓN, y eso no es el nombre
 * del control: «casilla no marcada», «contraído», «visitado», «1 de 7», «nivel
 * 2», «fila 3 columna 1», «tiene menú emergente», «clicable». Si no se recorta,
 * un control sin nombre accesible se queda con «no marcada» de residuo y el
 * puente lo da por nombrado: un 4.1.2 real absuelto por una palabra de estado.
 *
 * También los avisos de modo («modo exploración», «modo foco»), que NVDA dice al
 * entrar y salir de un formulario y no son contenido de la página.
 */
const RUIDO_NVDA = [
  /\bmodo (exploraci[oó]n|foco|navegaci[oó]n)\b/gi,
  /\bsaliendo de (la tabla|la lista|el formulario)\b/gi
];

const RUIDO = { voiceover: RUIDO_VOICEOVER, nvda: RUIDO_NVDA };

/**
 * Recorta lo que dice el lector que no es el contenido de la página.
 *
 * El estado y la posición (`ESTADO_COMUN`) se recortan SIEMPRE: los dicen los dos
 * lectores y ninguno los cuenta como nombre. Lo que depende del lector es su
 * cháchara propia, y ahí sí manda el parámetro.
 *
 * @param {string} spoken
 * @param {"voiceover"|"nvda"} [lector]  sin él se aplica la cháchara de los dos.
 */
export function stripReaderNoise(spoken, lector) {
  let s = String(spoken || "");
  const listas = [ESTADO_COMUN].concat(lector && RUIDO[lector] ? [RUIDO[lector]] : [RUIDO_VOICEOVER, RUIDO_NVDA]);
  listas.forEach(function (lista) { lista.forEach(function (re) { s = s.replace(re, " "); }); });
  return s.replace(/\s+/g, " ").trim();
}

/**
 * ¿La frase es del ESCRITORIO y no de la página?
 *
 * VoiceOver habla de todo el sistema, no solo del navegador. En transcripciones
 * reales de Suso, `lastSpokenPhrase()` devolvió cosas como «Playwright no tiene
 * ventanas. VoiceOver desactivado. Bienvenido a macOS… Chrome Prompts … Terminal
 * suso — -zsh — 80×24 ventana shell…»: el Finder, el Terminal y otra app
 * colándose en la captura.
 *
 * Importa porque esas palabras sobreviven al recorte y la comparación las toma
 * por el NOMBRE del control. Un botón de icono sin nombre accesible —un 4.1.2
 * real— pasaría de «barrera-confirmada» a «divergente: el lector sí pronuncia un
 * nombre», es decir, una barrera de verdad absuelta por ruido del escritorio.
 *
 * Así que no se intenta adivinar el nombre: se declara que esa frase NO es
 * evidencia sobre la página.
 */
const PISTAS_MACOS = [
  /\bno tiene ventanas\b/i,
  /\bvoiceover (est[aá] )?(activado|desactivado)\b/i,
  /\bbienvenido a macos\b/i,
  /\bajustes del sistema\b/i,
  /\bfinder\b/i,
  /\bventana shell\b/i,
  /\blast login:/i,
  /\bescritorio\b.*\bventana\b/i
];
/* Lo mismo en Windows. NVDA también habla de todo el sistema: al arrancar
 * anuncia su propia carga, y entre paso y paso se pueden colar la barra de
 * tareas, el menú Inicio o la ventana de la consola desde la que se lanzó la
 * prueba en CI. Esas frases no son evidencia sobre la página. */
const PISTAS_WINDOWS = [
  /\bnvda (iniciado|cargando|activado|desactivado)\b/i,
  /\bsaliendo de nvda\b/i,
  /\bbarra de tareas\b/i,
  /\bmen[uú] inicio\b/i,
  /\bescritorio lista\b/i,
  /\bexplorador de archivos\b/i,
  /\b(s[ií]mbolo del sistema|windows powershell|ventana de consola)\b/i,
  /\bbandeja del sistema\b/i
];
const PISTAS_ESCRITORIO = { voiceover: PISTAS_MACOS, nvda: PISTAS_WINDOWS };

/**
 * ¿La frase es del escritorio y no de la página?
 * @param {string} spoken
 * @param {"voiceover"|"nvda"} [lector]  sin él se comprueban las pistas de los dos.
 */
export function esRuidoDeEscritorio(spoken, lector) {
  const s = String(spoken || "");
  if (!s.trim()) return false; // vacío no es ruido: es que no se capturó nada
  // Si la frase dice explícitamente que está en el contenido web, es de la
  // página aunque arrastre alguna coletilla del sistema.
  if (/dentro del contenido web/i.test(s)) return false;
  const listas = lector && PISTAS_ESCRITORIO[lector] ? [PISTAS_ESCRITORIO[lector]] : [PISTAS_MACOS, PISTAS_WINDOWS];
  for (let j = 0; j < listas.length; j++) {
    for (let i = 0; i < listas[j].length; i++) if (listas[j][i].test(s)) return true;
  }
  return false;
}

/**
 * ¿En qué idioma está hablando el lector?
 *
 * Hace falta porque el runner de GitHub es una máquina en inglés y su NVDA
 * anuncia «button», «link», «heading, level 1». Eso verifica el mecanismo y las
 * palabras inglesas del léxico, pero NO el léxico español, que es el que hace
 * falta para auditar aquí. Guardar esa transcripción como «NVDA en español»
 * sería exactamente la clase de fixture que no prueba nada y lo parece.
 *
 * La detección es por palabras de rol inequívocas, no por el texto del
 * contenido —que es español en las dos— y solo se pronuncia cuando hay
 * diferencia clara. Ante la duda devuelve null, y quien llame decide.
 *
 * @param {Array<string>} frases
 * @returns {"es"|"en"|null}
 */
const SOLO_INGLES = /\b(button|link|heading|graphic|checkbox|edit|landmark|list item|clickable|not checked|collapsed|visited|level \d)\b/gi;
const SOLO_ESPANOL = /\b(bot[oó]n|enlace|v[ií]nculo|encabezado|gr[aá]fico|casilla|edici[oó]n|punto de referencia|elemento de lista|marcad[oa]|contra[ií]do|visitado|nivel \d)\b/gi;
export function idiomaDelLector(frases) {
  const texto = (frases || []).map(function (f) { return typeof f === "string" ? f : (f && f.spoken) || ""; }).join(" \n ");
  if (!texto.trim()) return null;
  const en = (texto.match(SOLO_INGLES) || []).length;
  const es = (texto.match(SOLO_ESPANOL) || []).length;
  if (en === es) return null;          // empate o nada reconocible: no se inventa
  return en > es ? "en" : "es";
}
