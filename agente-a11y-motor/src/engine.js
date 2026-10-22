/**
 * Motor de accesibilidad — núcleo determinista (etapas Entiende + Analiza).
 * Extraído del prototipo "Agente de Accesibilidad" sin cambios de comportamiento.
 *
 * Toma el HTML de un componente y produce un modelo del árbol de accesibilidad
 * (rol, nombre y descripción accesibles, estados, relaciones, anuncio de lector),
 * y dictamina los 55 criterios WCAG 2.2 A+AA aplicables con su cláusula EN 301 549.
 *
 * Isomorfo: en el navegador usa el DOMParser nativo; en Node se le inyecta uno
 * (p. ej. el de linkedom) con setDOMParser().
 */

let _DOMParser = (typeof DOMParser !== "undefined") ? DOMParser : null;

/** Inyecta el constructor DOMParser (Node). En navegador no hace falta. */
export function setDOMParser(P) { _DOMParser = P; }

function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

// Recorte de espacio en blanco según accname: solo espacio ASCII, tab, saltos
// de línea y form-feed; NO recorta nbsp (U+00A0) ni otros espacios Unicode
// (p. ej. el patrón braille en blanco), que forman parte del nombre.
function accTrim(s) { return String(s).replace(/^[\t\n\f\r ]+/, "").replace(/[\t\n\f\r ]+$/, ""); }
function accCollapse(s) { return accTrim(String(s).replace(/[\t\n\f\r ]+/g, " ")); }

// Escape para selectores CSS, isomorfo: usa CSS.escape en el navegador y un
// sustituto en Node (linkedom no expone el global CSS).
function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_\u00a0-\uffff-]/g, function (ch) { return "\\" + ch; });
}

// ¿El elemento está dentro de un contenido de sección (article/aside/main/nav/section)?
// Regla de scoping de HTML-AAM para header/footer/aside.
function inSectioningContent(el) {
  let p = el.parentElement;
  while (p) {
    const t = p.tagName ? p.tagName.toLowerCase() : "";
    if (t === "article" || t === "aside" || t === "main" || t === "nav" || t === "section") return true;
    p = p.parentElement;
  }
  return false;
}
function hasAccName(el) {
  const lb = el.getAttribute("aria-labelledby");
  const al = el.getAttribute("aria-label");
  return !!((al && al.trim()) || (lb && lb.trim()));
}

function implicitRole(el) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") || "").toLowerCase();
  switch (tag) {
    case "a": return el.hasAttribute("href") ? "link" : "(genérico)";
    case "area": return el.hasAttribute("href") ? "link" : "(genérico)";
    case "button": return "button";
    case "summary": return "button";
    case "select": return (el.hasAttribute("multiple") || parseInt(el.getAttribute("size") || "0", 10) > 1) ? "listbox" : "combobox";
    case "textarea": return "textbox";
    case "img": return el.getAttribute("alt") === "" ? "(presentación)" : "img";
    case "video": return "(medios)";
    case "audio": return "(medios)";
    case "nav": return "navigation";
    case "main": return "main";
    // header/footer solo son landmark si NO están en contenido de sección (HTML-AAM)
    case "header": return inSectioningContent(el) ? "(genérico)" : "banner";
    case "footer": return inSectioningContent(el) ? "(genérico)" : "contentinfo";
    // aside anidado sin nombre accesible → genérico; con nombre o a nivel raíz → complementary
    case "aside": return (inSectioningContent(el) && !hasAccName(el)) ? "(genérico)" : "complementary";
    case "ul": case "ol": return "list";
    case "li": return "listitem";
    case "table": return "table";
    case "thead": case "tbody": case "tfoot": return "rowgroup";
    case "tr": return "row";
    case "td": return "cell";
    case "th": return (el.getAttribute("scope") || "").toLowerCase() === "row" ? "rowheader" : "columnheader";
    case "caption": return "caption";
    case "article": return "article";
    case "section": return (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) ? "region" : "(genérico)";
    case "form": return (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) ? "form" : "(genérico)";
    case "search": return "search";
    case "figure": return "figure";
    case "dialog": return "dialog";
    case "details": return "group";
    case "fieldset": return "group";
    case "dl": return "list";
    case "dt": return "term";
    case "dd": return "definition";
    case "output": return "status";
    case "progress": return "progressbar";
    case "meter": return "meter";
    case "hr": return "separator";
    case "option": return "option";
    case "optgroup": return "group";
    case "datalist": return "listbox";
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": return "heading";
    case "input":
      switch (type) {
        case "button": case "submit": case "reset": return "button";
        case "image": return "button";
        case "checkbox": return "checkbox";
        case "radio": return "radio";
        case "range": return "slider";
        case "number": return "spinbutton";
        case "search": return "searchbox";
        case "email": case "tel": case "url": case "text": case "": return "textbox";
        case "hidden": return "(sin rol)";
        default: return "textbox";
      }
    default: return "(genérico)";
  }
}

const FOCUSABLE = new Set(["a", "button", "input", "select", "textarea", "summary"]);
function nativelyFocusable(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "a" || tag === "area") return el.hasAttribute("href");
  if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return false;
  return FOCUSABLE.has(tag);
}

// ¿Elemento no renderizado (hidden / display:none / visibility:hidden)? Sin layout
// solo podemos mirar el atributo hidden y el style en línea.
function isHiddenEl(node) {
  if (!node.getAttribute) return false;
  if (node.hasAttribute && node.hasAttribute("hidden")) return true;
  const st = String(node.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  return st.indexOf("display:none") !== -1 || st.indexOf("visibility:hidden") !== -1;
}

/* 2.1.1: la función que solo se puede hacer con el ratón (fallo F54).
 *
 * De 2.1.1 la medición dice `pasa` cuando el control RECIBE EL FOCO, y eso no
 * es operar con el teclado. Para los controles no nativos ya hay una sospecha
 * —Enter y Espacio no los activan solos—, pero medido sobre el marcado apareció
 * el hueco en los NATIVOS: `<button onmousedown="x()">` salía 2.1.1 `cumple`,
 * es decir exportable como conforme, cuando Enter y Espacio disparan `click` y
 * NO `mousedown`: con el teclado ese botón no hace nada. Lo mismo con
 * `ondblclick` —que no tiene equivalente de teclado— y con `onmouseover`.
 *
 * El veredicto es `revisar`, nunca `falla`, por la misma razón que el resto de
 * lo que se deduce de los manejadores en línea: desde el marcado no se ve si lo
 * que hace el manejador es una FUNCIÓN o un efecto visual
 * (`onmousedown="this.classList.add('pulsado')"` no es una función). Lo que no
 * se puede es firmar conformidad con un manejador de puntero como único camino.
 *
 * Alcance: solo elementos interactivos o enfocables, que es donde 2.1.1 muerde.
 * Un `<div onmousedown>` que no es control ni recibe foco queda fuera: ahí no
 * se puede distinguir una función de un adorno sin ejecutar la página, y de eso
 * se encarga la capa dinámica.
 */
const PUNTERO_PULSA = ["onmousedown", "onmouseup", "ondblclick", "onpointerdown", "onpointerup", "ontouchstart", "ontouchend"];
const PUNTERO_PASA = ["onmouseover", "onmouseout", "onmousemove", "onmouseenter", "onmouseleave", "onpointerover", "onpointerout", "onpointermove"];
const DA_IGUAL_EL_RATON = ["onclick", "onkeydown", "onkeyup", "onkeypress", "onchange", "oninput", "onsubmit"];
/* ¿Tiene el elemento una acción NATIVA que el teclado ya dispara?
 *
 * Esto es lo que evita el falso positivo más probable de todos: el
 * `<a href="/x" onmousedown="telemetria()">`. Ese enlace se opera con el
 * teclado perfectamente —Enter navega—, y el manejador de ratón es un añadido;
 * acusarlo sacaría un aviso en cada enlace con analítica de medio internet. Lo
 * que no tiene salida nativa es el `<button type="button" onmousedown="x()">`:
 * ahí el `mousedown` es la única función, y Enter dispara `click`, no
 * `mousedown`. Y un `<button>` sin tipo solo envía si está DENTRO de un
 * formulario; fuera no hace nada por sí mismo.
 */
function accionNativaDeTeclado(el, tag) {
  const t = String(tag || "").toLowerCase();
  if (t === "a" || t === "area") return el.hasAttribute("href");
  if (t === "summary" || t === "select" || t === "textarea") return true;
  if (t === "label") return el.hasAttribute("for");
  const tipo = String(el.getAttribute("type") || "").toLowerCase();
  if (t === "input") return ["submit", "reset", "image", "checkbox", "radio", "file", "text", "search", "email", "tel", "url", "password", "number", "date", "time", "range", "color", ""].indexOf(tipo) !== -1;
  if (t === "button") {
    if (tipo === "button") return false;
    return !!(el.closest && el.closest("form"));   // submit/reset solo valen dentro de un formulario
  }
  return false;
}
function funcionSoloConRaton(el, interactivo, enfocable, tag) {
  if (!el || !el.hasAttribute) return null;
  if (!interactivo && !enfocable) return null;
  if (accionNativaDeTeclado(el, tag)) return null;
  const tiene = function (lista) {
    const hay = [];
    for (let i = 0; i < lista.length; i++) if (el.hasAttribute(lista[i])) hay.push(lista[i]);
    return hay;
  };
  // Con `click` o una tecla por medio, el teclado llega: no hay nada que decir.
  if (tiene(DA_IGUAL_EL_RATON).length) return null;
  const pulsa = tiene(PUNTERO_PULSA), pasa = tiene(PUNTERO_PASA);
  if (!pulsa.length && !pasa.length) return null;
  return { pulsa: pulsa, pasa: pasa };
}

/* 3.2.1 y 3.2.2: el cambio de contexto que viene ESCRITO en el marcado.
 *
 * De estos dos criterios se encarga la capa dinámica, que enfoca cada control y
 * le cambia el valor para ver si se mueve el suelo. Pero esa capa viene apagada
 * por defecto, y en la extensión y en el artifact no existe: ahí el motor daba
 * `humano` —«ninguna máquina lo dictamina»— incluso con el fallo escrito dentro
 * del atributo. Medido: `<select onchange="location.href=this.value">`, que es
 * el fallo F37 de libro, salía como «requiere evaluación humana».
 *
 * Lo que sigue solo mira manejadores EN LÍNEA, y solo las acciones que son un
 * cambio de contexto sin discusión: navegar, abrir una ventana, enviar el
 * formulario o mover el foco a otro sitio. Un `onchange="pinta(this.value)"` no
 * dice nada: lo que hace está en un script que el marcado no ve, y de eso se
 * encarga la capa dinámica. Inventar una barrera con un nombre de función es
 * exactamente lo que este agente no hace.
 */
const NAVEGA = /\b(?:window\s*\.\s*open|location\s*\.\s*(?:href|replace|assign)|(?:window|document|top|self|parent)\s*\.\s*location|location\s*=)/;
const ENVIA = /\.\s*submit\s*\(/;
function accionDeContexto(codigo) {
  const c = String(codigo || "");
  if (NAVEGA.test(c)) return { que: "navega a otra página o abre una ventana", duro: true };
  if (ENVIA.test(c)) return { que: "envía el formulario", duro: true };
  // `this.blur()` quita el foco de donde la persona acaba de ponerlo; un
  // `.focus()` sobre OTRA cosa se lo lleva a un sitio que no eligió. `this.focus()`
  // y `this.select()` no mueven nada.
  if (/\.\s*blur\s*\(/.test(c)) return { que: "quita el foco del control al recibirlo", duro: true };
  if (/\.\s*focus\s*\(/.test(c) && !/\bthis\s*\.\s*focus\s*\(/.test(c)) return { que: "mueve el foco a otro elemento", duro: true };
  // Un diálogo del navegador también se lleva el foco, pero puede ser un aviso
  // legítimo disparado por otra cosa: sospecha, no barrera.
  if (/\b(?:alert|confirm|prompt)\s*\(/.test(c)) return { que: "abre un diálogo del navegador", duro: false };
  return null;
}
/**
 * Observaciones de 3.2.1 / 3.2.2 leyendo los manejadores en línea del elemento.
 * Devuelve [] cuando no hay nada que afirmar, que es el caso de casi todo.
 */
function cambioDeContextoEnLinea(el, tag, role) {
  const out = [];
  const foco = accionDeContexto(el.getAttribute && el.getAttribute("onfocus"));
  if (foco) {
    out.push({
      html: "Al recibir el foco, <code>onfocus</code> " + esc(foco.que) +
        ": recorrer la página con el tabulador dispara el cambio sin que nadie lo haya pedido" +
        (foco.duro ? " (fallos F52 y F55)" : ", conviene comprobar cuándo salta") + ".",
      crit: "3.2.1", sev: foco.duro ? "grave" : "moderada", type: "onfocus-contexto",
      nivel: foco.duro ? undefined : "revisar"
    });
  }
  // 3.2.2 es «cambiar el AJUSTE de un componente»: el valor de un control, no
  // escribir en un campo de texto cualquiera. Por eso solo cuentan los que
  // tienen ajuste —listas, casillas, radios, deslizadores— y el `oninput` de
  // un campo de texto no entra aquí.
  const tipo = String((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
  const conAjuste = tag === "select" || (tag === "input" && ["checkbox", "radio", "range", "file", "color", "date", "time"].indexOf(tipo) !== -1) ||
    ["listbox", "combobox", "checkbox", "radio", "switch", "slider", "option", "menuitemcheckbox", "menuitemradio"].indexOf(role) !== -1;
  if (conAjuste) {
    const cambio = accionDeContexto(el.getAttribute && el.getAttribute("onchange")) ||
      accionDeContexto(el.getAttribute && el.getAttribute("oninput"));
    if (cambio) {
      out.push({
        html: "Cambiar el valor de este <code>" + esc(tag) + "</code> " + esc(cambio.que) +
          " en el propio <code>onchange</code>, sin que la persona pulse nada (fallo F37). Con el teclado es peor: recorrer las opciones cambia el valor una por una. " +
          "La norma solo lo salva si se avisa del comportamiento ANTES de usar el control; si ese aviso está junto a la etiqueta, compruébalo.",
        crit: "3.2.2", sev: cambio.duro ? "grave" : "moderada", type: "onchange-contexto",
        nivel: cambio.duro ? undefined : "revisar"
      });
    }
  }
  return out;
}

/* 2.5.3 Etiqueta en el nombre: el texto que se VE, no el que se calcula.
 *
 * El criterio existe por quien maneja el ordenador hablando: dice «pulsa
 * Enviar» porque es lo que lee en el botón, y si el nombre accesible es
 * «Submit form» el reconocimiento de voz no encuentra nada. Es el fallo F96, de
 * los más comunes en sitios en español con ARIA copiado en inglés.
 *
 * Medido antes de escribir esto: el motor daba 2.5.3 `cumple-parcial` SIEMPRE,
 * también en el caso de libro (`<button aria-label="Submit form">Enviar</button>`),
 * y axe con la configuración del agente no decía nada tampoco, porque su regla
 * `label-content-name-mismatch` es experimental y las reglas experimentales
 * vienen desactivadas cuando se pide por etiquetas. Es decir: este criterio NO
 * podía denunciar una barrera en ninguna capa.
 *
 * El texto visible NO es `subtreeText`: ese mete los `aria-label` de los hijos y
 * el `alt` de las imágenes, que no se ven, y sobre todo mete el texto de los
 * iconos de fuente —`<i class="material-icons">search</i>` se ve como una lupa,
 * no como la palabra «search»—, que es la vía clásica del falso positivo aquí.
 * Por eso esto se calcula aparte, dejando fuera lo que no se lee con los ojos. */
const CLASE_ICONO = /icon|glyph|material-icons|fa-|\bfas\b|\bfar\b|\bfab\b|\bbi-|symbol|sprite|emoji/i;
function pareceIcono(el) {
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "svg" || tag === "img" || tag === "picture" || tag === "canvas" || tag === "use") return true;
  const cls = String(el.getAttribute ? el.getAttribute("class") || "" : "");
  if (CLASE_ICONO.test(cls)) return true;
  // <i class="…"> sin más es el patrón de icono por excelencia; <i> con texto y
  // sin clase es cursiva de verdad y sí se lee.
  return tag === "i" && !!cls;
}
function textoVisibleHijos(el) {
  let out = "";
  (el.childNodes || []).forEach(function (n) {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return;
    if (isHiddenEl(n)) return;
    if (pareceIcono(n)) return;
    out += textoVisibleHijos(n);
  });
  return out;
}
/* EL IDIOMA DE OCULTACIÓN VISUAL, VISTO SIN CSS.
 *
 * `isHiddenEl` solo ve el atributo `hidden` y el estilo en línea, y el idioma de
 * `.sr-only` vive en una hoja de estilos: esta capa corre sobre linkedom y no
 * resuelve CSS. Resultado medido contra un sitio real conforme: el texto «visible»
 * de un enlace salía como «LinkedIn Profesional(se abre en nueva pestaña)», con el
 * paréntesis que NADIE ve metido dentro — y de esa comparación sale el veredicto
 * de 2.5.3. La evidencia citaba como visible algo que no lo es.
 *
 * Aquí se distinguen dos clases de señal, y no valen lo mismo:
 *   · el estilo EN LÍNEA con el idioma (clip a cero, caja de 1px con overflow,
 *     puesto fuera de pantalla) es un hecho leído del marcado;
 *   · el NOMBRE DE LA CLASE es una convención. `sr-only` lo usan Bootstrap y
 *     Tailwind, `screen-reader-text` WordPress, `show-for-sr` Foundation… pero
 *     nada impide que una clase así se llame de otra forma, ni que una llamada
 *     así no haga eso.
 *
 * Por eso esto NO decide solo: el criterio 2.5.3 se juzga con las DOS lecturas, y
 * cuando no coinciden el veredicto es `revisar` con las dos escritas. Es el mismo
 * patrón que ya se usa con la sombra del texto en 1.4.3: cuando la medida depende
 * de una decisión que no es del agente, se dan los dos números y decide la persona.
 */
const CLASES_OCULTAS = ["sr-only", "visually-hidden", "visuallyhidden", "screen-reader-text",
  "screen-reader-only", "show-for-sr", "is-sr-only", "a11y-hidden", "assistive-text", "sr-text"];
function pareceOcultoVisualmente(node) {
  if (!node || !node.getAttribute) return null;
  const st = String(node.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  /* `duro` = leído del marcado, no conjeturado. Importa porque decide el
   * veredicto: con un hecho el agente puede afirmar; con una convención de
   * nombres, no. */
  if (st) {
    if (/clip:rect\(0/.test(st) || /clip-path:inset\((50|100)%\)/.test(st)) return { porQue: "estilo en línea: recortado con clip", duro: true };
    if (/width:1px/.test(st) && /height:1px/.test(st) && /overflow:hidden/.test(st)) return { porQue: "estilo en línea: caja de 1 px con overflow oculto", duro: true };
    if (/left:-\d{4,}px/.test(st) || /top:-\d{4,}px/.test(st)) return { porQue: "estilo en línea: fuera de la pantalla", duro: true };
  }
  const cls = String(node.getAttribute("class") || "").toLowerCase().split(/\s+/).filter(Boolean);
  for (const c of cls) if (CLASES_OCULTAS.indexOf(c) !== -1) return { porQue: "clase «" + c + "» (convención de ocultación visual)", duro: false };
  return null;
}
/* El texto de los hijos descontando los que parecen ocultos a la vista, y cuántos
 * se han descontado: hace falta para poder DECIRLO en la evidencia. */
function textoVisibleHijosSinOcultos(el, cuenta) {
  let out = "";
  (el.childNodes || []).forEach(function (n) {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return;
    if (isHiddenEl(n)) return;
    if (pareceIcono(n)) return;
    const senal = pareceOcultoVisualmente(n);
    if (senal) { cuenta.push({ locator: n.tagName.toLowerCase(), porQue: senal.porQue, duro: senal.duro, texto: accCollapse(textoVisibleHijos(n)) }); return; }
    out += textoVisibleHijosSinOcultos(n, cuenta);
  });
  return out;
}
function textoDeEtiqueta(el, tag) {
  if (tag === "input") {
    const t = String(el.getAttribute("type") || "").toLowerCase();
    // En estos el texto del botón es el `value`; en el resto, lo que se ve es su
    // etiqueta externa, que no es «la etiqueta del componente» a estos efectos.
    return (t === "submit" || t === "reset" || t === "button") ? accCollapse(el.getAttribute("value") || "") : "";
  }
  return accCollapse(textoVisibleHijos(el));
}
function etiquetaSinOcultos(el, tag) {
  if (tag === "input") return { texto: textoDeEtiqueta(el, tag), descontados: [] };
  const cuenta = [];
  return { texto: accCollapse(textoVisibleHijosSinOcultos(el, cuenta)), descontados: cuenta };
}
/* Normalizar para comparar: fuera mayúsculas y TODO lo que no sea letra o
 * número —signos, símbolos, emoji y los glifos de uso privado de las fuentes de
 * iconos—, que es ruido para quien dicta. Las tildes se conservan aquí; de ellas
 * se encarga la segunda vuelta, con un veredicto más suave. */
function normalizaEtiqueta(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
function sinTildesEtiqueta(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }

/**
 * ¿El nombre accesible contiene el texto visible de la etiqueta?
 *
 * Devuelve null cuando el criterio no se puede juzgar desde aquí (sin texto
 * visible, nombre que viene del propio contenido, rol que no se opera por voz).
 * Callar en esos casos no es callar el criterio: la ficha sigue saliendo como
 * `cumple-parcial` con lo que falta por juzgar.
 */
function etiquetaEnNombre(visible, nombre) {
  const v = normalizaEtiqueta(visible), n = normalizaEtiqueta(nombre);
  if (!v || !n) return null;
  /* Un solo carácter NO es una etiqueta de texto: es un icono escrito con el
   * teclado. La «x» del botón de cerrar es el caso de todos los días —
   * `<button aria-label="Cerrar">x</button>`—, y denunciarla sería inventar una
   * barrera en media web. Comprobado contra axe 4.13 con su propia regla
   * `label-content-name-mismatch`: acusa «OK» frente a «Aceptar» (dos
   * caracteres, palabra de verdad) y deja pasar «x» y «×». El corte es el
   * mismo. */
  if (v.length < 2) return null;
  if (v.split(" ").length > 12) return null;   // un párrafo no es una etiqueta
  if (n.indexOf(v) !== -1) return { ok: true, visible: v, nombre: n };
  const v2 = sinTildesEtiqueta(v), n2 = sinTildesEtiqueta(n);
  if (n2.indexOf(v2) !== -1) return { ok: false, soloAcentos: true, visible: v, nombre: n };
  return { ok: false, soloAcentos: false, visible: v, nombre: n };
}

// --- Texto accesible de un subárbol (versión simplificada) ---
// includeHidden=true solo en la ruta aria-labelledby, donde el spec sí incluye
// objetivos ocultos; en name-from-content los subárboles no renderizados se excluyen.
function subtreeText(el, includeHidden) {
  let out = "";
  el.childNodes.forEach(function (node) {
    if (node.nodeType === 3) {
      out += node.nodeValue;
    } else if (node.nodeType === 1) {
      if (node.getAttribute && node.getAttribute("aria-hidden") === "true") return;
      if (!includeHidden && isHiddenEl(node)) return;
      const al = node.getAttribute && node.getAttribute("aria-label");
      if (al) { out += " " + al + " "; return; }
      if (node.tagName.toLowerCase() === "img") {
        const alt = node.getAttribute("alt");
        if (alt) out += " " + alt + " ";
        return;
      }
      out += subtreeText(node, includeHidden);
    }
  });
  return accCollapse(out);
}

function idText(doc, ids) {
  return ids.split(/\s+/).map(function (id) {
    const ref = doc.getElementById(id);
    if (!ref) return null;
    const al = ref.getAttribute("aria-label");
    return (al || subtreeText(ref, true) || "").trim();
  }).filter(Boolean).join(" ").trim();
}

// --- Roles/elementos que toman su nombre del contenido (name from content) ---
const CONTENT_NAME_ROLES = new Set(["button", "link", "heading", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "radio", "checkbox", "switch", "treeitem", "cell", "gridcell", "columnheader", "rowheader", "tooltip", "term"]);
const CONTENT_NAME_TAGS = new Set(["th", "td", "legend", "figcaption", "caption", "output", "dt"]);
function namesFromContent(tag, role) { return CONTENT_NAME_ROLES.has(role) || CONTENT_NAME_TAGS.has(tag); }

// --- Algoritmo de nombre accesible (accname) simplificado ---
// Devuelve { name, source, insufficient }
function accessibleName(el, doc, role) {
  role = role || "";
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") || "").toLowerCase();

  // 1. aria-labelledby
  const lb = el.getAttribute("aria-labelledby");
  if (lb) {
    const t = idText(doc, lb);
    if (t) return { name: t, source: "aria-labelledby → «" + lb + "»", insufficient: false };
  }
  // 2. aria-label (recorte accname: preserva nbsp; ignora si es solo espacio ASCII)
  const al = el.getAttribute("aria-label");
  if (al != null) { const t = accTrim(al); if (t) return { name: t, source: "aria-label", insufficient: false }; }

  // 3. Nativo por tipo de elemento
  if (tag === "input" && (type === "button" || type === "submit" || type === "reset")) {
    const v = el.getAttribute("value");
    if (v && v.trim()) return { name: v.trim(), source: "atributo value", insufficient: false };
    if (type === "submit") return { name: "Enviar", source: "valor por defecto del navegador", insufficient: false };
    if (type === "reset") return { name: "Restablecer", source: "valor por defecto del navegador", insufficient: false };
  }
  if (tag === "img" || tag === "area") {
    const alt = el.getAttribute("alt");
    if (alt && alt.trim()) return { name: alt.trim(), source: "atributo alt", insufficient: false };
    if (alt === "") return { name: "", source: "alt vacío (decorativa)", insufficient: false };
  }
  // input[type=image]: alt → value → (default), como botón de imagen
  if (tag === "input" && type === "image") {
    const alt = el.getAttribute("alt");
    if (alt && alt.trim()) return { name: alt.trim(), source: "atributo alt", insufficient: false };
    const v = el.getAttribute("value");
    if (v && v.trim()) return { name: v.trim(), source: "atributo value", insufficient: false };
  }
  // Contenedores que toman su nombre de un hijo específico
  if (tag === "fieldset") { const lg = el.querySelector(":scope > legend"); if (lg) { const t = subtreeText(lg); if (t) return { name: t, source: "<legend>", insufficient: false }; } }
  if (tag === "table") { const cap = el.querySelector(":scope > caption"); if (cap) { const t = subtreeText(cap); if (t) return { name: t, source: "<caption>", insufficient: false }; } }
  if (tag === "figure") { const fc = el.querySelector(":scope > figcaption"); if (fc) { const t = subtreeText(fc); if (t) return { name: t, source: "<figcaption>", insufficient: false }; } }
  // Controles de formulario: <label> asociada
  if (tag === "input" || tag === "textarea" || tag === "select") {
    if (el.id) {
      const lab = doc.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (lab) { const t = subtreeText(lab); if (t) return { name: t, source: "<label for>", insufficient: false }; }
    }
    // label envolvente
    let p = el.parentElement;
    while (p) { if (p.tagName && p.tagName.toLowerCase() === "label") { const t = subtreeText(p); if (t) return { name: t, source: "<label> envolvente", insufficient: false }; break; } p = p.parentElement; }
  }
  // 4. Contenido de texto — SOLO en roles/elementos que toman el nombre del contenido
  if (namesFromContent(tag, role)) {
    const st = subtreeText(el);
    if (st) return { name: st, source: "contenido de texto", insufficient: false };
  }

  // 5. title
  const title = el.getAttribute("title");
  if (title && title.trim()) return { name: title.trim(), source: "atributo title", insufficient: true };

  // 6. placeholder (solo como último recurso; insuficiente por sí solo)
  const ph = el.getAttribute("placeholder");
  if (ph && ph.trim()) return { name: ph.trim(), source: "placeholder", insufficient: true };

  return { name: "", source: "sin fuente de nombre", insufficient: false };
}

// --- Estados y propiedades relevantes ---
const STATE_ATTRS = [
  ["disabled", "disabled"], ["aria-disabled", "aria-disabled"], ["readonly", "readonly"],
  ["required", "required"], ["aria-required", "aria-required"], ["aria-expanded", "aria-expanded"],
  ["aria-checked", "aria-checked"], ["aria-selected", "aria-selected"], ["aria-pressed", "aria-pressed"],
  ["aria-current", "aria-current"], ["aria-invalid", "aria-invalid"], ["aria-haspopup", "aria-haspopup"],
  ["aria-hidden", "aria-hidden"], ["checked", "checked"]
];
function collectStates(el) {
  const out = [];
  STATE_ATTRS.forEach(function (pair) {
    if (el.hasAttribute(pair[0])) {
      const v = el.getAttribute(pair[0]);
      out.push({ key: pair[1], value: (v === "" ? "true" : v) });
    }
  });
  if (el.hasAttribute("tabindex")) out.push({ key: "tabindex", value: el.getAttribute("tabindex") });
  return out;
}

const REL_ATTRS = [
  ["aria-labelledby", "etiquetado por"], ["aria-describedby", "descrito por"],
  ["aria-controls", "controla"], ["aria-owns", "posee"], ["for", "etiqueta a"],
  ["aria-activedescendant", "descendiente activo"]
];
function collectRelations(el) {
  const out = [];
  REL_ATTRS.forEach(function (pair) {
    if (el.hasAttribute(pair[0])) out.push({ attr: pair[0], rel: pair[1], target: el.getAttribute(pair[0]) });
  });
  return out;
}

// --- Descripción accesible (aria-describedby / title) ---
function accessibleDescription(el, doc, nameSource) {
  const db = el.getAttribute("aria-describedby");
  if (db) { const t = idText(doc, db); if (t) return { text: t, source: "aria-describedby" }; }
  const title = el.getAttribute("title");
  if (title && title.trim() && nameSource !== "atributo title") return { text: title.trim(), source: "title" };
  return { text: "", source: "" };
}

// --- Cómo lo anuncia un lector de pantalla (aprox. NVDA/VoiceOver en español) ---
const ROLE_SAY = {
  button: "botón", link: "enlace", checkbox: "casilla de verificación", radio: "botón de opción",
  textbox: "cuadro de edición", searchbox: "cuadro de búsqueda", combobox: "cuadro combinado",
  listbox: "cuadro de lista", slider: "control deslizante", spinbutton: "cuadro de número",
  menuitem: "elemento de menú", menuitemcheckbox: "casilla de menú", menuitemradio: "opción de menú",
  tab: "pestaña", switch: "conmutador", option: "opción", treeitem: "elemento de árbol",
  heading: "encabezado", img: "imagen", list: "lista", listitem: "elemento de lista",
  navigation: "navegación", main: "principal", banner: "banner", contentinfo: "información de contenido",
  complementary: "complementario", region: "región", dialog: "diálogo", alertdialog: "diálogo de alerta",
  menu: "menú", menubar: "barra de menús", tablist: "lista de pestañas", tabpanel: "panel de pestaña",
  table: "tabla", toolbar: "barra de herramientas", group: "grupo", radiogroup: "grupo de opciones",
  status: "estado", alert: "alerta", tree: "árbol"
};
function statesSay(node) {
  const out = [];
  node.states.forEach(function (s) {
    const k = s.key, v = s.value;
    if (k === "aria-expanded") out.push(v === "true" ? "expandido" : "contraído");
    else if (k === "aria-checked" || k === "checked") out.push((v === "true" || v === "") ? "marcado" : (v === "mixed" ? "parcialmente marcado" : "no marcado"));
    else if (k === "aria-selected") out.push(v === "true" ? "seleccionado" : "no seleccionado");
    else if (k === "aria-pressed") out.push(v === "true" ? "presionado" : "no presionado");
    else if (k === "disabled" || k === "aria-disabled") out.push("no disponible");
    else if (k === "required" || k === "aria-required") out.push("requerido");
    else if (k === "readonly") out.push("solo lectura");
    else if (k === "aria-invalid" && v !== "false") out.push("dato no válido");
    else if (k === "aria-current" && v !== "false") out.push("actual");
    else if (k === "aria-haspopup" && v !== "false") out.push("tiene emergente");
  });
  return out;
}
function announcement(node) {
  const parts = [];
  if (node.name.name) parts.push(node.name.name);
  const label = ROLE_SAY[node.role];
  if (label) parts.push(node.role === "heading" && node.level ? "encabezado de nivel " + node.level : label);
  statesSay(node).forEach(function (x) { parts.push(x); });
  if (node.desc) parts.push(node.desc);
  return parts.length ? parts.join(", ") : "(sin exposición semántica)";
}

// --- Validación ARIA (subconjunto pragmático) ---
const VALID_ROLES = new Set(["alert", "alertdialog", "application", "article", "banner", "button", "cell", "checkbox", "columnheader", "combobox", "complementary", "contentinfo", "definition", "dialog", "directory", "document", "feed", "figure", "form", "grid", "gridcell", "group", "heading", "img", "link", "list", "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none", "note", "option", "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup", "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status", "switch", "tab", "table", "tablist", "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
  // ARIA 1.2: roles de contenido/estructura y genérico
  "generic", "blockquote", "code", "emphasis", "strong", "paragraph", "subscript", "superscript", "deletion", "insertion", "time", "mark", "caption", "associationlist", "associationlistitemkey", "associationlistitemvalue"]);
const ABSTRACT_ROLES = new Set(["command", "composite", "input", "landmark", "range", "roletype", "section", "sectionhead", "select", "structure", "widget", "window"]);
const STATE_ROLE_RULES = {
  "aria-checked": ["checkbox", "radio", "menuitemcheckbox", "menuitemradio", "switch", "option", "treeitem"],
  "aria-selected": ["option", "tab", "row", "gridcell", "columnheader", "rowheader", "treeitem"],
  "aria-pressed": ["button"]
};
const REQUIRED_PARENT = {
  tab: ["tablist"], menuitem: ["menu", "menubar"], menuitemcheckbox: ["menu", "menubar"], menuitemradio: ["menu", "menubar", "group"],
  option: ["listbox"], listitem: ["list", "group", "directory"], row: ["table", "grid", "treegrid", "rowgroup"], treeitem: ["tree", "group"]
};
const REQUIRED_OWNED = {
  menu: ["menuitem", "menuitemcheckbox", "menuitemradio"], menubar: ["menuitem", "menuitemcheckbox", "menuitemradio"],
  listbox: ["option"], radiogroup: ["radio"], tree: ["treeitem"], grid: ["row"], treegrid: ["row"]
};
const ARIA_ATTRS = new Set(["aria-label", "aria-labelledby", "aria-describedby", "aria-description", "aria-hidden", "aria-live", "aria-atomic", "aria-relevant", "aria-busy", "aria-controls", "aria-owns", "aria-flowto", "aria-activedescendant", "aria-expanded", "aria-haspopup", "aria-checked", "aria-selected", "aria-pressed", "aria-current", "aria-disabled", "aria-readonly", "aria-required", "aria-invalid", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext", "aria-orientation", "aria-sort", "aria-level", "aria-setsize", "aria-posinset", "aria-multiselectable", "aria-multiline", "aria-autocomplete", "aria-placeholder", "aria-modal", "aria-keyshortcuts", "aria-roledescription", "aria-colcount", "aria-colindex", "aria-colspan", "aria-rowcount", "aria-rowindex", "aria-rowspan", "aria-details", "aria-errormessage", "aria-colindextext", "aria-rowindextext", "aria-braillelabel", "aria-brailleroledescription"]);
const TOKEN_RULES = {
  "aria-expanded": ["true", "false", "undefined"], "aria-checked": ["true", "false", "mixed", "undefined"],
  "aria-pressed": ["true", "false", "mixed", "undefined"], "aria-selected": ["true", "false", "undefined"],
  "aria-current": ["true", "false", "page", "step", "location", "date", "time"],
  "aria-haspopup": ["true", "false", "menu", "listbox", "tree", "grid", "dialog"],
  "aria-hidden": ["true", "false"], "aria-disabled": ["true", "false"], "aria-readonly": ["true", "false"],
  "aria-required": ["true", "false"], "aria-invalid": ["true", "false", "grammar", "spelling"],
  "aria-live": ["off", "polite", "assertive"], "aria-orientation": ["horizontal", "vertical", "undefined"],
  "aria-sort": ["ascending", "descending", "none", "other"], "aria-atomic": ["true", "false"],
  "aria-modal": ["true", "false"], "aria-multiline": ["true", "false"], "aria-multiselectable": ["true", "false"],
  "aria-autocomplete": ["inline", "list", "both", "none"]
};
// Estados REQUERIDOS por rol (ARIA 1.2). tab NO requiere aria-selected (es "supported",
// con valor por defecto false), por eso no está aquí.
/* Estados y propiedades que un rol declarado NECESITA para exponer su estado.
 *
 * La tabla tenía solo la familia de `aria-checked` y `combobox` a medias, así
 * que un `<div role="slider" tabindex="0">` sin `aria-valuenow` salía 4.1.2
 * «cumple»: un deslizador que no dice en qué valor está, declarado conforme.
 *
 * La lista es la de «Required States and Properties» de WAI-ARIA 1.2, §5.2.2
 * («Content authors MUST provide a non-empty value for required states and
 * properties»), comprobada contra la propia especificación y contra
 * `aria-query` 5.3.2, que la publica en forma de datos. Doce roles, y solo
 * doce. En concreto NO están, y no se exigen por mucho que lo parezca:
 *   · `spinbutton` y `tab` — ARIA 1.2 no les exige ningún estado;
 *   · `progressbar` — `aria-valuenow` ausente es justamente cómo se expresa el
 *     progreso INDETERMINADO (la barra que gira sin saber cuánto queda);
 *   · `aria-valuemin`/`aria-valuemax` — tienen valor por defecto (0 y 100), así
 *     que su ausencia no deja el estado sin exponer.
 *
 * Los valores son LISTAS: `combobox` y `scrollbar` exigen dos cosas cada uno, y
 * con un solo campo de texto se comprobaba una y se callaba la otra. */
const REQUIRED_STATE = {
  checkbox: ["aria-checked"], switch: ["aria-checked"],
  menuitemcheckbox: ["aria-checked"], menuitemradio: ["aria-checked"], radio: ["aria-checked"],
  combobox: ["aria-controls", "aria-expanded"],
  scrollbar: ["aria-controls", "aria-valuenow"],
  slider: ["aria-valuenow"], meter: ["aria-valuenow"],
  heading: ["aria-level"],
  option: ["aria-selected"]
};
/* `treeitem` también lleva `aria-selected` entre los requeridos (lo hereda de
 * `option`), pero la guía de patrones ARIA dice explícitamente que en un árbol
 * de selección ÚNICA se puede omitir. Emitir `falla` ahí sería un falso
 * positivo en un patrón correcto, así que va como sospecha. */
const ESTADO_SOSPECHA = { treeitem: ["aria-selected"] };
function ariaValidation(el, tag, role, explicitRole, implicit) {
  const obs = [];
  if (explicitRole) {
    const first = explicitRole.split(/\s+/)[0];
    if (ABSTRACT_ROLES.has(first)) obs.push({ html: '<code>role="' + esc(first) + '"</code> es un rol abstracto: no debe usarse en el marcado.', crit: "4.1.2", sev: "grave", type: "role-abstract" });
    else if (!VALID_ROLES.has(first)) obs.push({ html: '<code>role="' + esc(first) + '"</code> no es un rol ARIA válido (¿mal escrito?).', crit: "4.1.2", sev: "grave", type: "role-invalid" });
    // `nivel:"revisar"` — NO es una barrera. `<ul role="list">` es incluso la
    // corrección recomendada para que VoiceOver siga anunciando la lista cuando
    // el CSS le quita las viñetas. Emitirlo como `falla` metía una barrera
    // inventada en el IRA en casi cualquier sitio.
    else if (first === implicit) obs.push({ html: "Rol redundante: <code>&lt;" + esc(tag) + "&gt;</code> ya expone el rol <code>" + esc(first) + "</code> de forma nativa.", crit: "4.1.2", sev: "leve", type: "role-redundant", nivel: "revisar" });
    else if ((tag === "button" || (tag === "a" && el.hasAttribute("href")) || tag === "input") && ["button", "link", "checkbox", "radio", "tab", "menuitem"].indexOf(first) !== -1) {
      // También sospecha: pisar el rol nativo está desaconsejado, no prohibido.
      // El propio texto dice «revisa si es intencionado», que es literalmente un
      // `revisar`; salía como falla.
      obs.push({ html: "El <code>role</code> pisa la semántica nativa de <code>&lt;" + esc(tag) + "&gt;</code>: revisa si es intencionado (se pierden teclado y comportamiento nativos).", crit: "4.1.2", sev: "moderada", type: "native-override", nivel: "revisar" });
    }
    else if (/^h[1-6]$/.test(tag) && (first === "presentation" || first === "none")) {
      obs.push({ html: 'Un encabezado con <code>role="' + esc(first) + '"</code> deja de anunciarse como encabezado.', crit: "1.3.1", sev: "grave", type: "heading-presentation" });
    }
  }
  Object.keys(STATE_ROLE_RULES).forEach(function (attr) {
    if (el.hasAttribute(attr) && STATE_ROLE_RULES[attr].indexOf(role) === -1) {
      obs.push({ html: "<code>" + attr + "</code> no es válido para el rol <code>" + esc(role) + "</code>.", crit: "4.1.2", sev: "grave", type: "state-invalid" });
    }
  });
  Object.keys(TOKEN_RULES).forEach(function (attr) {
    if (el.hasAttribute(attr)) {
      const v = (el.getAttribute(attr) || "").trim().toLowerCase();
      if (v !== "" && TOKEN_RULES[attr].indexOf(v) === -1) obs.push({ html: '<code>' + attr + '="' + esc(el.getAttribute(attr)) + '"</code> no es un valor válido para ese atributo.', crit: "4.1.2", sev: "grave", type: "aria-bad-value" });
    }
  });
  Array.prototype.forEach.call(el.attributes, function (a) {
    const n = a.name.toLowerCase();
    if (n.indexOf("aria-") === 0 && !ARIA_ATTRS.has(n)) obs.push({ html: "<code>" + esc(n) + "</code> no es un atributo ARIA válido (¿mal escrito?).", crit: "4.1.2", sev: "moderada", type: "aria-unknown-attr" });
  });
  // Un input nativo checkbox/radio ya expone el estado "checked" por el DOM: no exigir aria-checked.
  const type = (el.getAttribute("type") || "").toLowerCase();
  const nativeInput = tag === "input" && (type === "checkbox" || type === "radio");
  // `aria-level` de un encabezado lo da el propio <h1>…<h6>: no se exige aparte.
  const nativeHeading = /^h[1-6]$/.test(tag);
  if (explicitRole) {
    (REQUIRED_STATE[role] || []).forEach(function (attr) {
      if (el.hasAttribute(attr)) return;
      if (attr === "aria-checked" && nativeInput) return;
      if (attr === "aria-level" && nativeHeading) return;
      obs.push({ html: "Un <code>" + esc(role) + "</code> declarado con <code>role</code> necesita <code>" + attr + "</code> para exponer su estado a la API de accesibilidad.", crit: "4.1.2", sev: "grave", type: "aria-missing-state" });
    });
    (ESTADO_SOSPECHA[role] || []).forEach(function (attr) {
      if (el.hasAttribute(attr)) return;
      obs.push({
        html: "Un <code>" + esc(role) + "</code> lleva <code>" + attr + "</code> entre los estados requeridos de ARIA. Se puede omitir si el árbol es de selección ÚNICA; si se puede seleccionar más de un nodo, falta el estado.",
        crit: "4.1.2", sev: "moderada", type: "aria-missing-state-duda", nivel: "revisar"
      });
    });
  }
  return obs;
}

// --- Mapeo normativo: EN 301 549 v3.2.1 (RD 1112/2018) ---
const EN_EXCLUDED = new Set(["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"]); // nuevos en WCAG 2.2, aún no en la EN vigente
function enClause(n) { return EN_EXCLUDED.has(n) ? null : "9." + n; }
const QUALITY_MANUAL = new Set(["1.1.1", "2.4.6", "2.5.3", "3.3.2", "1.3.5"]); // "auto" solo en presencia; la calidad exige juicio

/**
 * Qué CAPA del agente mide cada criterio, más allá del motor.
 *
 * `det` dice lo que el MOTOR puede hacer desde el marcado, y eso sigue siendo
 * cierto. El problema era la frase que emitía: «Requiere evaluación humana;
 * ninguna máquina lo dictamina» para catorce criterios que otra capa sí mide —
 * el contraste, el reflujo, el foco visible, la coherencia entre páginas… Solo
 * la agregación los corregía después, y quien leyera el informe del motor a
 * secas se llevaba una idea equivocada de qué queda por hacer.
 *
 * Con esta tabla la evidencia distingue tres cosas distintas: lo que nadie
 * puede dictaminar, lo que mide otra capa que no has ejecutado, y lo que
 * requiere de verdad una persona.
 */
const CAPA_QUE_MIDE = {
  "1.2.1": "página (inventario de medios)", "1.2.2": "página (inventario de medios)",
  "1.2.3": "página (inventario de medios)", "1.4.2": "página (inventario de medios)",
  "3.1.2": "página", "2.2.1": "página", "2.1.4": "página",
  "2.5.1": "medición (censo de oyentes)", "2.5.2": "medición (censo de oyentes)",
  "2.5.4": "medición (censo de oyentes)", "2.5.7": "medición (censo de oyentes)", "2.2.2": "medición",
  "1.3.1": "página / dinámico", "1.3.4": "adaptación", "1.4.1": "medición", "1.4.3": "medición / píxeles",
  "1.4.4": "adaptación", "1.4.10": "adaptación", "1.4.11": "medición", "1.4.12": "adaptación",
  "1.4.13": "adaptación", "2.1.1": "medición / dinámico", "2.1.2": "dinámico",
  "2.4.1": "página", "2.4.3": "medición / dinámico", "2.4.5": "coherencia", "2.4.11": "medición",
  "2.4.6": "página", "2.4.7": "medición", "2.5.8": "medición",
  "3.2.3": "coherencia", "3.2.4": "coherencia", "3.2.6": "coherencia",
  "3.3.1": "dinámico", "4.1.3": "dinámico", "3.2.1": "dinámico", "3.2.2": "dinámico"
};
function capaQueMide(n) { return CAPA_QUE_MIDE[n] || null; }

// --- Base de conocimiento WCAG 2.2 · Nivel A + AA (55 criterios) ---
//   scope: componente | contexto | página | medios
//   det (qué puede hacer el agente): auto | semi | manual
//   ap: predicado de aplicabilidad sobre el modelo del componente
const WCAG22 = [
  { n: "1.1.1", t: "Contenido no textual", lvl: "A", pr: "Perceptible", scope: "componente", det: "auto",
    d: "Toda imagen o icono necesita una alternativa textual equivalente.", ap: function (m) { return m.isImage || m.hasIcon; } },
  { n: "1.2.1", t: "Solo audio y solo vídeo (grabado)", lvl: "A", pr: "Perceptible", scope: "medios", det: "manual",
    d: "El contenido solo-audio o solo-vídeo necesita una alternativa.", ap: function (m) { return m.isMedia; } },
  { n: "1.2.2", t: "Subtítulos (grabados)", lvl: "A", pr: "Perceptible", scope: "medios", det: "manual",
    d: "El vídeo con audio necesita subtítulos sincronizados.", ap: function (m) { return m.isMedia; } },
  { n: "1.2.3", t: "Audiodescripción o alternativa (grabado)", lvl: "A", pr: "Perceptible", scope: "medios", det: "manual",
    d: "El vídeo necesita audiodescripción o una alternativa textual.", ap: function (m) { return m.isMedia; } },
  { n: "1.2.4", t: "Subtítulos (en directo)", lvl: "AA", pr: "Perceptible", scope: "medios", det: "manual",
    d: "El audio en directo necesita subtítulos.", ap: function (m) { return m.isMedia; } },
  { n: "1.2.5", t: "Audiodescripción (grabado)", lvl: "AA", pr: "Perceptible", scope: "medios", det: "manual",
    d: "El vídeo grabado necesita audiodescripción.", ap: function (m) { return m.isMedia; } },
  { n: "1.3.1", t: "Información y relaciones", lvl: "A", pr: "Perceptible", scope: "componente", det: "auto",
    /* Las tablas y las listas entran en el criterio por derecho propio.
     *
     * Sin ellas, una tabla CORRECTA (con `<th>` y `<caption>`) no recibía
     * ningún veredicto de 1.3.1: el criterio no aparecía, y un criterio que no
     * aparece se lee en el informe igual que uno conforme. Ahora una tabla bien
     * marcada dice «cumple» y una sin encabezados dice «falla»: las dos cosas
     * son afirmaciones, y eso es lo que se puede defender. */
    d: "La estructura y las relaciones deben exponerse por código.",
    ap: function (m) {
      return m.isFormControl || m.isHeading || m.interactive || m.isImage || m.relations.length > 0 ||
        ["table", "grid", "treegrid", "list", "rowheader", "columnheader"].indexOf(m.role) !== -1;
    } },
  { n: "1.3.2", t: "Secuencia significativa", lvl: "A", pr: "Perceptible", scope: "página", det: "manual",
    d: "El orden de lectura debe ser correcto cuando el orden importa.", ap: function () { return false; } },
  { n: "1.3.3", t: "Características sensoriales", lvl: "A", pr: "Perceptible", scope: "contexto", det: "manual",
    d: "Las instrucciones no deben depender solo de forma, color o posición.", ap: function (m) { return m.interactive; } },
  { n: "1.3.4", t: "Orientación", lvl: "AA", pr: "Perceptible", scope: "página", det: "semi",
    d: "El contenido no debe bloquearse a una única orientación de pantalla.", ap: function () { return false; } },
  { n: "1.3.5", t: "Identificar el propósito de la entrada", lvl: "AA", pr: "Perceptible", scope: "componente", det: "auto",
    d: "Los campos de datos del usuario deben declarar su propósito (autocomplete).", ap: function (m) { return m.isFormControl; } },
  { n: "1.4.1", t: "Uso del color", lvl: "A", pr: "Perceptible", scope: "contexto", det: "manual",
    d: "El color no puede ser el único medio para transmitir información.", ap: function (m) { return m.interactive || m.hasText; } },
  { n: "1.4.2", t: "Control del audio", lvl: "A", pr: "Perceptible", scope: "página", det: "manual",
    d: "El audio que suena solo debe poder pausarse o silenciarse.", ap: function () { return false; } },
  { n: "1.4.3", t: "Contraste (mínimo)", lvl: "AA", pr: "Perceptible", scope: "contexto", det: "semi",
    d: "El texto necesita ratio de contraste suficiente (requiere los colores).", ap: function (m) { return m.hasText; } },
  { n: "1.4.4", t: "Redimensionar el texto", lvl: "AA", pr: "Perceptible", scope: "página", det: "semi",
    d: "El texto debe poder ampliarse al 200 % sin pérdida de contenido.", ap: function () { return false; } },
  { n: "1.4.5", t: "Imágenes de texto", lvl: "AA", pr: "Perceptible", scope: "contexto", det: "manual",
    d: "Evitar texto incrustado en imágenes salvo excepciones.", ap: function (m) { return m.isImage; } },
  { n: "1.4.10", t: "Reflujo (reflow)", lvl: "AA", pr: "Perceptible", scope: "página", det: "semi",
    d: "El contenido debe reajustarse sin scroll en dos dimensiones.", ap: function () { return false; } },
  { n: "1.4.11", t: "Contraste no textual", lvl: "AA", pr: "Perceptible", scope: "contexto", det: "semi",
    d: "Controles, estados y bordes necesitan contraste suficiente.", ap: function (m) { return m.interactive || m.isFormControl || m.isImage; } },
  { n: "1.4.12", t: "Espaciado del texto", lvl: "AA", pr: "Perceptible", scope: "página", det: "semi",
    d: "El texto debe soportar ajustes de espaciado sin pérdida.", ap: function () { return false; } },
  { n: "1.4.13", t: "Contenido al recibir foco o puntero", lvl: "AA", pr: "Perceptible", scope: "componente", det: "semi",
    d: "Tooltips y popovers deben ser descartables, sostenibles y persistentes.", ap: function (m) { return m.interactive || m.hasTitle; } },

  { n: "2.1.1", t: "Teclado", lvl: "A", pr: "Operable", scope: "componente", det: "auto",
    d: "Toda función debe poder operarse con teclado.", ap: function (m) { return m.interactive; } },
  { n: "2.1.2", t: "Sin trampas para el foco", lvl: "A", pr: "Operable", scope: "componente", det: "semi",
    d: "El foco no debe quedar atrapado sin salida por teclado.", ap: function (m) { return m.interactive; } },
  { n: "2.1.4", t: "Atajos de teclado de un carácter", lvl: "A", pr: "Operable", scope: "página", det: "manual",
    d: "Los atajos de una sola tecla deben poder desactivarse o remapearse.", ap: function () { return false; } },
  { n: "2.2.1", t: "Tiempo ajustable", lvl: "A", pr: "Operable", scope: "página", det: "manual",
    d: "Los límites de tiempo deben poder ajustarse.", ap: function () { return false; } },
  { n: "2.2.2", t: "Poner en pausa, detener, ocultar", lvl: "A", pr: "Operable", scope: "página", det: "manual",
    d: "El contenido en movimiento o parpadeo debe poder detenerse.", ap: function () { return false; } },
  { n: "2.3.1", t: "Umbral de tres destellos o menos", lvl: "A", pr: "Operable", scope: "página", det: "manual",
    d: "Nada debe destellar más de tres veces por segundo.", ap: function () { return false; } },
  { n: "2.4.1", t: "Evitar bloques", lvl: "A", pr: "Operable", scope: "página", det: "semi",
    d: "Debe existir un mecanismo para saltar bloques de contenido repetido.", ap: function () { return false; } },
  { n: "2.4.2", t: "Página titulada", lvl: "A", pr: "Operable", scope: "página", det: "auto",
    d: "Cada página necesita un título descriptivo.", ap: function () { return false; } },
  { n: "2.4.3", t: "Orden del foco", lvl: "A", pr: "Operable", scope: "página", det: "semi",
    d: "El orden de foco debe preservar el significado y la operabilidad.", ap: function () { return false; } },
  { n: "2.4.4", t: "Propósito de los enlaces (en contexto)", lvl: "A", pr: "Operable", scope: "componente", det: "semi",
    d: "El destino del enlace debe entenderse por su texto o su contexto.", ap: function (m) { return m.isLink; } },
  { n: "2.4.5", t: "Múltiples vías", lvl: "AA", pr: "Operable", scope: "página", det: "manual",
    d: "Debe haber más de una forma de localizar una página.", ap: function () { return false; } },
  { n: "2.4.6", t: "Encabezados y etiquetas", lvl: "AA", pr: "Operable", scope: "componente", det: "semi",
    d: "Encabezados y etiquetas deben describir el tema o propósito.", ap: function (m) { return m.isHeading || m.isFormControl; } },
  { n: "2.4.7", t: "Foco visible", lvl: "AA", pr: "Operable", scope: "componente", det: "semi",
    d: "El indicador de foco del teclado debe ser visible.", ap: function (m) { return m.focusable || m.interactive; } },
  { n: "2.4.11", t: "Foco no oscurecido (mínimo)", lvl: "AA", pr: "Operable", scope: "página", det: "semi",
    d: "El elemento con foco no debe quedar totalmente oculto por otro contenido.", ap: function () { return false; } },
  { n: "2.5.1", t: "Gestos del puntero", lvl: "A", pr: "Operable", scope: "componente", det: "manual",
    d: "Los gestos complejos deben tener una alternativa de un solo punto.", ap: function (m) { return m.interactive; } },
  { n: "2.5.2", t: "Cancelación del puntero", lvl: "A", pr: "Operable", scope: "componente", det: "manual",
    d: "Una acción de puntero debe poder cancelarse antes de soltar.", ap: function (m) { return m.interactive; } },
  { n: "2.5.3", t: "Etiqueta en el nombre", lvl: "A", pr: "Operable", scope: "componente", det: "auto",
    d: "El nombre accesible debe contener el texto visible de la etiqueta.", ap: function (m) { return m.interactive && !!m.name.name; } },
  { n: "2.5.4", t: "Actuación por movimiento", lvl: "A", pr: "Operable", scope: "componente", det: "manual",
    d: "Las funciones activadas por movimiento deben tener alternativa.", ap: function (m) { return m.interactive; } },
  { n: "2.5.7", t: "Movimientos de arrastre", lvl: "AA", pr: "Operable", scope: "componente", det: "manual",
    d: "Toda acción de arrastre debe tener una alternativa sin arrastre.", ap: function (m) { return m.interactive; } },
  { n: "2.5.8", t: "Tamaño del objetivo (mínimo)", lvl: "AA", pr: "Operable", scope: "contexto", det: "semi",
    d: "Los objetivos táctiles deben medir al menos 24×24 px (con excepciones).", ap: function (m) { return m.interactive; } },

  { n: "3.1.1", t: "Idioma de la página", lvl: "A", pr: "Comprensible", scope: "página", det: "auto",
    d: "El idioma principal debe declararse por código (atributo lang).", ap: function () { return false; } },
  { n: "3.1.2", t: "Idioma de las partes", lvl: "AA", pr: "Comprensible", scope: "contexto", det: "semi",
    d: "Los fragmentos en otro idioma deben declararlo.", ap: function () { return false; } },
  { n: "3.2.1", t: "Al recibir el foco", lvl: "A", pr: "Comprensible", scope: "componente", det: "manual",
    d: "Recibir el foco no debe provocar un cambio de contexto.", ap: function (m) { return m.interactive; } },
  { n: "3.2.2", t: "Al recibir entradas", lvl: "A", pr: "Comprensible", scope: "componente", det: "manual",
    d: "Cambiar un campo no debe provocar un cambio de contexto inesperado.", ap: function (m) { return m.isFormControl; } },
  { n: "3.2.3", t: "Navegación coherente", lvl: "AA", pr: "Comprensible", scope: "página", det: "manual",
    d: "La navegación repetida debe mantener el mismo orden relativo.", ap: function () { return false; } },
  { n: "3.2.4", t: "Identificación coherente", lvl: "AA", pr: "Comprensible", scope: "página", det: "manual",
    d: "Los componentes con igual función deben identificarse igual.", ap: function () { return false; } },
  { n: "3.2.6", t: "Ayuda coherente", lvl: "A", pr: "Comprensible", scope: "página", det: "manual",
    d: "Los mecanismos de ayuda deben aparecer en orden coherente.", ap: function () { return false; } },
  { n: "3.3.1", t: "Identificación de errores", lvl: "A", pr: "Comprensible", scope: "contexto", det: "manual",
    d: "Los errores de entrada deben identificarse y describirse en texto.", ap: function (m) { return m.isFormControl; } },
  { n: "3.3.2", t: "Etiquetas o instrucciones", lvl: "A", pr: "Comprensible", scope: "componente", det: "auto",
    d: "Los campos necesitan etiqueta o instrucciones visibles.", ap: function (m) { return m.isFormControl; } },
  { n: "3.3.3", t: "Sugerencias ante errores", lvl: "AA", pr: "Comprensible", scope: "contexto", det: "manual",
    d: "Cuando se detecta un error, debe sugerirse cómo corregirlo.", ap: function (m) { return m.isFormControl; } },
  { n: "3.3.4", t: "Prevención de errores (legal, financiero, datos)", lvl: "AA", pr: "Comprensible", scope: "página", det: "manual",
    d: "Los envíos importantes deben poder revisarse, revertirse o confirmarse.", ap: function () { return false; } },
  { n: "3.3.7", t: "Entrada redundante", lvl: "A", pr: "Comprensible", scope: "página", det: "manual",
    d: "No debe pedirse la misma información dos veces en un mismo proceso.", ap: function () { return false; } },
  { n: "3.3.8", t: "Autenticación accesible (mínimo)", lvl: "AA", pr: "Comprensible", scope: "página", det: "manual",
    d: "La autenticación no debe exigir pruebas cognitivas sin alternativa.", ap: function () { return false; } },

  { n: "4.1.2", t: "Nombre, función, valor", lvl: "A", pr: "Robusto", scope: "componente", det: "auto",
    d: "Rol, nombre y estado deben exponerse a la API de accesibilidad.", ap: function (m) { return m.interactive || m.isFormControl; } },
  { n: "4.1.3", t: "Mensajes de estado", lvl: "AA", pr: "Robusto", scope: "componente", det: "semi",
    d: "Los mensajes de estado deben anunciarse sin mover el foco.", ap: function (m) { return m.hasLiveRegion; } }
];
const WCAG_TOTAL = WCAG22.length; // 55

function cmpSC(a, b) {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < 3; i++) {
    const d = (parseInt(pa[i] || 0, 10)) - (parseInt(pb[i] || 0, 10));
    if (d) return d;
  }
  return 0;
}

function applicableCriteria(model) {
  return WCAG22.filter(function (c) { return c.ap(model); })
    .sort(function (a, b) { return cmpSC(a.n, b.n); });
}

const WCAG_IX = {};
WCAG22.forEach(function (c) { WCAG_IX[c.n] = c; });

// --- Severidad de las barreras ---
const SEV_RANK = { "crítica": 4, "grave": 3, "moderada": 2, "leve": 1 };
const SEV_CRIT = { "4.1.2": "crítica", "2.1.1": "crítica", "1.1.1": "grave", "3.3.2": "grave", "1.3.1": "grave", "2.5.3": "grave", "1.3.5": "grave", "2.4.4": "moderada", "2.4.6": "moderada", "2.4.3": "moderada", "4.1.3": "moderada" };
function severityByCrit(n, lvl) { return SEV_CRIT[n] || (lvl === "A" ? "grave" : "moderada"); }

// --- ANÁLISIS (Paso 2): convierte el modelo en veredictos de conformidad ---
function analyze(m) {
  const failMap = {}, dudaMap = {};
  m.observations.forEach(function (o) {
    // Una observación marcada `nivel:"revisar"` es una SOSPECHA, no una barrera.
    // Antes `analyze` convertía toda observación en `falla`, así que un rol
    // redundante o un `role` que pisa el nativo —dos cosas legítimas— salían
    // como barrera en un entregable legal.
    if (o.nivel === "revisar") {
      const d = dudaMap[o.crit] || (dudaMap[o.crit] = { evid: [], nodes: [], types: [] });
      d.evid.push(o.html);
      if (o.type && d.types.indexOf(o.type) === -1) d.types.push(o.type);
      if (o.node && o.node.locator) d.nodes.push(o.node);
      return;
    }
    const lvl = (WCAG_IX[o.crit] || {}).lvl;
    const sev = o.sev || severityByCrit(o.crit, lvl);
    const f = failMap[o.crit] || (failMap[o.crit] = { sev: sev, evid: [], nodes: [], types: [], sinNodo: [] });
    if (SEV_RANK[sev] > SEV_RANK[f.sev]) f.sev = sev;
    f.evid.push(o.html);
    if (o.type && f.types.indexOf(o.type) === -1) f.types.push(o.type);
    // Las observaciones que no son DE un elemento (las estructurales del
    // documento) se apartan: no se le pueden cargar a ninguna fila en concreto,
    // así que acompañan a todas.
    if (!(o.node && o.node.locator)) f.sinNodo.push(o.html);
    // Deduplicación por IDENTIDAD del nodo, no por su locator: dos <img> sin id
    // ni clase comparten locator («img») y se fusionaban en uno solo, así que dos
    // barreras distintas salían como una sola fila en el IRA. El locator sirve
    // para leerlo; para contar hace falta la identidad.
    if (o.node && o.node.locator) {
      let yaEsta = null;
      f.nodes.forEach(function (x) {
        const mismo = (x.id != null && o.node.id != null)
          ? x.id === o.node.id
          : (x.locator === o.node.locator && x.role === o.node.role);
        if (mismo) yaEsta = x;
      });
      /* La evidencia se queda PEGADA a su elemento.
       *
       * El hallazgo junta en `evid` todos los mensajes del criterio, y la hoja de
       * Barreras saca una fila por elemento: las N filas salían con la UNIÓN de
       * los mensajes, así que la fila de un `role="slider"` arrastraba también lo
       * del `div` con `onclick` y lo del botón vacío. Cada mensaje lleva delante
       * el elemento del que habla, así que no era falso — pero filtrar una fila a
       * lo suyo no se podía. Ahora cada nodo se lleva los suyos. */
      /* Y el TIPO de regla también se queda pegado al nodo.
       *
       * `f.types` junta los tipos de todo el criterio, y la letra del subcriterio
       * OAW de 4.1.2 se decide con ellos: un solo deslizador sin `aria-valuenow`
       * ponía `aria-missing-state` en la lista del criterio y TODAS las filas de
       * 4.1.2 de la página salían con la letra -B («estados y propiedades»),
       * incluidos un botón vacío y un div sin nombre, que son -A («nombre y
       * rol»). Medido en el entregable del sitio de prueba. */
      if (yaEsta) {
        (yaEsta.evid = yaEsta.evid || []).push(o.html);
        if (o.type && (yaEsta.types = yaEsta.types || []).indexOf(o.type) === -1) yaEsta.types.push(o.type);
      } else {
        f.nodes.push(Object.assign({}, o.node, { evid: [o.html], types: o.type ? [o.type] : [] }));
      }
    }
  });
  const critObjs = {};
  m.criteria.forEach(function (c) { critObjs[c.n] = c; });
  Object.keys(failMap).forEach(function (n) { if (!critObjs[n] && WCAG_IX[n]) critObjs[n] = WCAG_IX[n]; });

  Object.keys(dudaMap).forEach(function (n) { if (!critObjs[n] && WCAG_IX[n]) critObjs[n] = WCAG_IX[n]; });

  const findings = Object.keys(critObjs).sort(cmpSC).map(function (n) {
    const c = critObjs[n];
    if (failMap[n]) return { c: c, verdict: "falla", sev: failMap[n].sev, evid: failMap[n].evid, nodes: failMap[n].nodes, types: failMap[n].types, evidSinNodo: failMap[n].sinNodo, scope: "componente" };
    if (dudaMap[n]) return { c: c, verdict: "revisar", sev: null, evid: dudaMap[n].evid, nodes: dudaMap[n].nodes, types: dudaMap[n].types, scope: "componente" };
    // Todo hallazgo lleva evidencia, también el que no es una barrera. Un informe
    // con filas «No se puede comprobar» y la casilla de evidencia vacía no le dice
    // a nadie qué hay que mirar; con `c.d` al menos dice por qué queda pendiente.
    const porque = c.d ? " " + c.d : "";
    if (c.det === "auto") {
      return QUALITY_MANUAL.has(n)
        ? { c: c, verdict: "cumple-parcial", sev: null, scope: "componente",
            evid: [(n === "1.3.5"
              ? "Los campos de entrada declaran un token de `autocomplete` válido; que cada campo pida el token correcto exige juicio humano."
              : "La parte automatizable se cumple; la calidad del texto exige juicio humano.") + porque] }
        : { c: c, verdict: "cumple", sev: null, scope: "componente", evid: ["Determinable desde el marcado y correcto." + porque] };
    }
    const capa = CAPA_QUE_MIDE[n];
    /* «QUE EN ESTA EJECUCIÓN NO HA CORRIDO» ERA UNA AFIRMACIÓN FALSA.
     *
     * El motor analiza el marcado y nada más: no lanza las capas ni sabe cuáles
     * va a lanzar la orquestación después. Decir que una capa «no ha corrido» es
     * hablar de algo que no ve. Medido sobre el sitio de prueba con la capa
     * dinámica ENCENDIDA: 2.1.2 salía con esta frase —«lo mide la capa de
     * dinámico, que en esta ejecución no ha corrido»— en la misma auditoría en
     * la que esa capa había corrido y había dictaminado. Una frase falsa en la
     * evidencia de un informe con efectos legales.
     *
     * Ahora dice lo que es cierto desde donde está: este análisis del marcado no
     * la ejecuta. Y el relleno se marca con `origen: "motor-sin-capa"` para que
     * la orquestación pueda retirarlo cuando la capa sí haya hablado. */
    if (c.det === "semi") {
      return { c: c, verdict: "revisar", sev: null, scope: "componente",
        origen: capa ? "motor-sin-capa" : undefined, evid: [
        (capa
          ? "El motor no lo dictamina desde el marcado; lo mide la capa de " + capa + ", que este análisis del marcado no ejecuta."
          : "No es determinable solo desde el marcado: hay que comprobarlo sobre el render real o a mano.") + porque] };
    }
    return { c: c, verdict: "humano", sev: null, scope: "componente",
      origen: capa ? "motor-sin-capa" : undefined, evid: [
      (capa
        ? "El motor no lo dictamina desde el marcado; lo mide la capa de " + capa + ", que este análisis del marcado no ejecuta."
        : "Requiere evaluación humana; ninguna máquina lo dictamina.") + porque] };
  });

  /* Un cubo por veredicto, y `cumple` solo para `cumple`.
   *
   * El `else` que había aquí metía en `cumple` todo lo que no era falla, revisar
   * ni humano: también `cumple-parcial`. Y `cumple-parcial` significa lo
   * contrario de conforme — «la presencia está medida, la calidad la juzga una
   * persona»—, así que el CLI imprimía «5 cumplen» contando el 1.1.1 de una
   * página cuyos textos alternativos nadie había leído. Eso es exactamente lo que
   * la regla de oro prohíbe: un criterio sin comprobar no se cuenta como
   * conforme. Cualquier veredicto que no reconozcamos cae en `otros` y no infla
   * ninguna columna. */
  const summary = {
    falla: 0, revisar: 0, humano: 0, "cumple-parcial": 0, pasa: 0, cumple: 0, "no-aplica": 0, otros: 0,
    "crítica": 0, "grave": 0, "moderada": 0, "leve": 0
  };
  findings.forEach(function (f) {
    if (f.verdict === "falla") { summary.falla++; if (summary[f.sev] !== undefined) summary[f.sev]++; }
    else if (summary[f.verdict] !== undefined) summary[f.verdict]++;
    else summary.otros++;
  });
  return { findings: findings, summary: summary };
}

// --- Observaciones a nivel de nodo (anticipo de la etapa 2) ---
var PRIMARY_CTL = ["button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "checkbox", "radio", "switch", "combobox", "option", "slider", "spinbutton"];
function nodeObservations(model) {
  const obs = [];
  const isPrimary = PRIMARY_CTL.indexOf(model.role) !== -1;
  if (model.interactive && !model.name.name && model.role !== "(presentación)" && !model.isMedia) {
    obs.push({ html: "Operable pero <strong>sin nombre accesible</strong>: un lector lo anunciaría solo como «" + esc(model.role) + "».", crit: "4.1.2", sev: isPrimary ? "crítica" : "grave", type: "name-missing" });
  }
  if (model.name.insufficient && model.name.source.indexOf("placeholder") !== -1) {
    obs.push({ html: "El nombre proviene solo de <code>placeholder</code>, que desaparece al escribir y no cuenta como etiqueta.", crit: "3.3.2", sev: "grave", type: "placeholder-name" });
  }
  // Campo de entrada sin nombre alguno: falla 3.3.2 (etiqueta/instrucciones), aparte del 4.1.2.
  if (model.isFormControl && !model.name.name && model.role !== "button") {
    obs.push({ html: "Campo de formulario <strong>sin etiqueta ni instrucciones</strong>: no hay <code>&lt;label&gt;</code>, <code>aria-label</code> ni <code>aria-labelledby</code>.", crit: "3.3.2", sev: "grave", type: "label-missing" });
  }
  /* 4.1.2 habla de COMPONENTES DE INTERFAZ, y esta regla no lo comprobaba.
   *
   * Medido contra un sitio real conforme: cuatro de las nueve acusaciones de 4.1.2
   * eran `span` con `title` y rol genérico —texto de migas recortado con
   * `max-width` y el texto completo en el tooltip—. Un `span` sin rol ni
   * interacción no es un componente de interfaz, así que 4.1.2 no le aplica, y
   * decir que «su nombre depende de title» afirma que tiene un nombre que exponer.
   *
   * El caso de debajo sí existe —texto que se corta y solo está entero en el
   * tooltip—, pero no es 4.1.2: es pérdida de información (1.4.4 / 1.4.10) y
   * contenido al pasar el puntero (1.4.13), y las dos cosas necesitan CSS, que
   * esta capa no tiene. Queda como limitación conocida, no como acusación en el
   * criterio equivocado. */
  if (model.name.insufficient && model.name.source.indexOf("title") !== -1 &&
      (model.interactive || model.focusable || isPrimary)) {
    obs.push({ html: "El nombre depende de <code>title</code>, poco fiable en móvil y con soporte desigual entre lectores.", crit: "4.1.2", sev: "moderada", type: "title-name" });
  }
  // OJO al valor: `tabindex="-1"` es la técnica estándar para que un contenedor
  // reciba el foco por programa (destino de salto, región tras cambiar de ruta).
  // Mirando solo la PRESENCIA del atributo, eso salía como «control genérico» y
  // fallaba 4.1.2 — una barrera inventada sobre un patrón correcto.
  const tiPositivo = model.states.some(function (s) { return s.key === "tabindex" && parseInt(s.value, 10) >= 0; });
  if ((model.role === "(genérico)" || model.role === "(sin rol)") && (model.hasClick || tiPositivo)) {
    obs.push({ html: "Control hecho con un elemento genérico (<code>&lt;" + esc(model.tag) + "&gt;</code>): sin rol nativo, no comunica que es interactivo.", crit: "4.1.2", sev: "grave", type: "generic-control" });
    if (model.visibleText) obs.push({ html: "Tiene texto visible («" + esc(model.visibleText) + "») que <strong>no se expone como nombre</strong> porque el rol es genérico.", crit: "4.1.2", sev: "moderada", type: "text-not-exposed" });
  }
  if (model.tag === "img" && !model.name.name && model.role !== "(presentación)") {
    obs.push({ html: "La imagen no tiene alternativa textual (ni <code>alt</code>, ni <code>aria-label/labelledby</code>): el lector puede leer la URL del archivo en su lugar.", crit: "1.1.1", sev: "grave", type: "img-no-alt" });
  }
  /* 2.5.3: el nombre tiene que CONTENER el texto visible.
   *
   * Solo cuando el nombre viene de `aria-label`/`aria-labelledby`: si sale del
   * propio contenido, no puede haber desajuste y preguntarlo es ruido. Y solo
   * en los controles que se operan por voz —botones, enlaces, pestañas, casillas—,
   * que es para quien existe el criterio. */
  if (isPrimary && model.etiquetaVisible && /aria-label/.test(model.name.source || "")) {
    const cmp = etiquetaEnNombre(model.etiquetaVisible, model.name.name);
    /* LAS DOS LECTURAS, cuando hay texto descontado por parecer oculto a la vista.
     *
     * Medido contra un sitio real conforme: el texto «visible» de un enlace salía
     * como «LinkedIn Profesional(se abre en nueva pestaña)», con un `span.sr-only`
     * dentro. Esa cadena es la que se compara con el nombre accesible, así que un
     * paréntesis que nadie ve decidía el veredicto de 2.5.3.
     *
     * Descontarlo sin más tampoco vale: el descuento se apoya en parte en el
     * NOMBRE DE LA CLASE, que es una convención y no un hecho. Así que se juzga con
     * las dos lecturas y, si no coinciden, el veredicto es `revisar` con las dos
     * escritas — mismo patrón que la sombra del texto en 1.4.3. Si coinciden, se
     * cita la lectura sin lo oculto, que es la honesta, y se dice qué se descontó. */
    const limpia = model.etiquetaSinOcultos || { texto: model.etiquetaVisible, descontados: [] };
    const hayDescuento = limpia.descontados.length > 0 && limpia.texto !== model.etiquetaVisible;
    const cmpLimpia = hayDescuento ? etiquetaEnNombre(limpia.texto, model.name.name) : cmp;
    const comoSeDescuenta = limpia.descontados.map(function (d) {
      return "«" + esc(d.texto) + "» (" + esc(d.porQue) + ")";
    }).join(", ");

    /* Y la fuerza de la señal decide quién decide.
     *
     * Con el idioma escrito en el atributo `style` esto es un hecho leído del
     * marcado: el agente puede afirmar, y quedarse en `revisar` sería esconderse.
     * Con el nombre de la clase es una convención, y entonces el veredicto depende
     * de algo que el agente no ha comprobado. Lo encontré escribiendo el test del
     * caso en línea: el mensaje decía «parte de esto se apoya en el nombre de la
     * clase» sobre un descuento en el que no había ninguna clase. */
    const soloBlandas = limpia.descontados.length > 0 && limpia.descontados.every(function (d) { return !d.duro; });
    if (hayDescuento && soloBlandas && !!(cmp && !cmp.ok) !== !!(cmpLimpia && !cmpLimpia.ok)) {
      /* Las dos lecturas no dicen lo mismo: el veredicto depende de si ese texto se
       * ve o no, y eso lo decide quien mira la página, no el agente. */
      obs.push({
        html: "El veredicto de 2.5.3 depende de si cuenta como visible un texto que parece estar oculto a la vista. " +
          "Contándolo, el texto visible es «" + esc(model.etiquetaVisible) + "»; sin contarlo, «" + esc(limpia.texto) + "». " +
          "El nombre accesible es «" + esc(model.name.name) + "», que " +
          ((cmpLimpia && cmpLimpia.ok) ? "<strong>sí</strong> contiene la segunda lectura y <strong>no</strong> la primera" : "contiene la primera y no la segunda") + ". " +
          "Se ha descontado " + comoSeDescuenta + ", y parte de eso se apoya en el nombre de la clase, " +
          "que es una convención y no un hecho: compruébalo mirando la página.",
        crit: "2.5.3", sev: "moderada", type: "etiqueta-en-nombre-dudoso", nivel: "revisar" });
    } else if (cmpLimpia && !cmpLimpia.ok) {
      const cola = hayDescuento
        ? " (se ha descontado del texto visible " + comoSeDescuenta + ": no se ve, así que quien dicta no lo dice" +
          (soloBlandas ? ", y eso se apoya en el nombre de la clase, que es una convención: compruébalo" : "") + ")"
        : "";
      obs.push(cmpLimpia.soloAcentos
        ? { html: "El nombre accesible («" + esc(model.name.name) + "») contiene el texto visible («" + esc(limpia.texto) +
              "») salvo por tildes o signos" + cola + ". Quien dicta por voz dice lo que ve: comprueba si su reconocedor lo casa.",
            crit: "2.5.3", sev: "moderada", type: "etiqueta-en-nombre-acentos", nivel: "revisar" }
        : { html: "El texto visible es «" + esc(limpia.texto) + "» y el nombre accesible es «" + esc(model.name.name) +
              "», que <strong>no lo contiene</strong>" + cola + ": quien maneja el equipo hablando dice lo que ve y el reconocimiento de voz no encuentra el control (fallo F96).",
            crit: "2.5.3", sev: "grave", type: "etiqueta-en-nombre" });
    }
  }
  if (model.role === "link" && /^(aqu[íi]|leer m[áa]s|pincha aqu[íi]|m[áa]s|ver m[áa]s|click here|here|read more)$/i.test((model.name.name || "").trim())) {
    obs.push({ html: "El texto del enlace («" + esc(model.name.name) + "») no describe su destino fuera de contexto.", crit: "2.4.4", sev: "moderada", type: "vague-link" });
  }
  if (model.autocomplete && !model.autocomplete.ok) {
    // `revisar`, no `falla`: que ESTE campo pida un token de propósito depende de
    // qué recoja el formulario, y eso no se ve en el marcado. Lo que sí se ve es
    // si el token está y si es válido.
    obs.push({
      html: "Campo de entrada " + model.autocomplete.motivo + ". Si recoge un dato del usuario (nombre, correo, teléfono, dirección…), 1.3.5 exige identificar su propósito.",
      crit: "1.3.5", sev: "moderada", type: "autocomplete-ausente", nivel: "revisar"
    });
  }
  if (model.interactive && !model.focusable && !model.isMedia && !model.disabled && !model.managed) {
    obs.push({ html: "Es interactivo pero <strong>no es enfocable por teclado</strong> (sin elemento nativo ni <code>tabindex</code> ≥ 0).", crit: "2.1.1", sev: "crítica", type: "not-focusable" });
  }
  // Alcanzable con Tab NO es operable con teclado. Un <div role="button"
  // tabindex="0"> recibe el foco, pero no dispara su `onclick` con Enter ni con
  // Espacio: eso lo hace el navegador solo con los elementos NATIVOS. Hace falta
  // un manejador de teclado, y desde el marcado no se ve si lo hay (puede estar
  // en un addEventListener). Antes esto salía «2.1.1 cumple»: la barrera más
  // común de la web, declarada conforme.
  /* El rol NO es lo que hace que algo sea un control: lo que lo hace es que
   * responda al ratón. Esta comprobación estaba atada a `INTERACTIVE_ROLES`, así
   * que el caso más vulgar de la web —`<div tabindex="0" onclick="…">` SIN rol—
   * se escapaba entero y 2.1.1 salía «cumple». Y es el peor de los dos: un
   * `role="button"` sin manejador de teclado al menos se anuncia como botón;
   * este no se anuncia como nada Y tampoco se activa con el teclado.
   *
   * (Que además no tenga rol es una barrera de 4.1.2, y ahí ya se emite. Aquí lo
   * que se dice es lo de 2.1.1: que recibir el foco no es ser operable.) */
  const conRol = model.role !== "(genérico)" && model.role !== "(sin rol)" && INTERACTIVE_ROLES.indexOf(model.role) !== -1;
  const porClic = model.hasClick && !conRol;
  if ((conRol || porClic) &&
      NATIVOS_OPERABLES.indexOf(model.tag) === -1 &&
      model.focusable && !model.disabled) {
    const conTeclado = model.hasKeyHandler;
    const quien = conRol
      ? "Control no nativo (<code>&lt;" + esc(model.tag) + '&gt;</code> con <code>role="' + esc(model.role) + '"</code>)'
      : "Elemento con <code>onclick</code> y <code>tabindex</code> pero SIN rol (<code>&lt;" + esc(model.tag) + "&gt;</code>)";
    obs.push({
      html: quien + ": recibe el foco, pero Enter y Espacio no lo activan solos como harían en un elemento nativo" +
        (conTeclado ? ", y aunque declara un manejador de teclado en el marcado hay que comprobar que responde a las dos teclas" : ". No se ve ningún manejador de teclado en el marcado") +
        ". Compruébalo con el teclado.",
      crit: "2.1.1", sev: "crítica", type: "custom-control-keyboard", nivel: "revisar"
    });
  }
  (model.brokenRefs || []).forEach(function (br) {
    /* Una referencia colgante de `aria-controls` en un widget CERRADO no es lo
     * mismo que una de `aria-labelledby`. La primera es el idioma de todo
     * componente colapsado que renderiza su destino al abrirse; la segunda
     * pierde el nombre de verdad. Medido en el banco del sitio limpio: siete de
     * las veintiséis acusaciones eran `aria-controls` hacia un panel que aparece
     * al expandir, y se firmaban como barrera.
     *
     * El estado se lee del propio elemento: `aria-expanded="false"` o
     * `aria-haspopup` dicen que el destino está legítimamente ausente AHORA. Con
     * esa señal el veredicto baja a `revisar` y se dan las dos lecturas; sin
     * ella se mantiene la observación, que tampoco afirmaba una barrera. */
    const relacional = br.attr === "aria-controls" || br.attr === "aria-owns" || br.attr === "aria-flowto";
    const cerrado = model.expanded === "false" || (model.haspopup != null && model.haspopup !== "" && model.haspopup !== false);
    if (relacional && cerrado) {
      obs.push({
        html: "La relación <code>" + esc(br.attr) + "</code> apunta a IDs que no existen en este estado: <code>" + esc(br.ids) +
          "</code>. Pero este control está CERRADO (<code>aria-expanded=\"false\"</code>" +
          (model.haspopup != null && model.haspopup !== "" ? " / <code>aria-haspopup</code>" : "") +
          "), y lo normal es que el destino se cree al abrirlo: entonces resuelve y no hay barrera. Su nombre, su rol y su estado no dependen de esta relación y llegan igual a la API. " +
          "COMPRUEBA si <code>#" + esc(String(br.ids).split(/\s+/)[0]) + "</code> existe tras expandir: si existe, no es barrera; si no aparece nunca, sí lo es.",
        crit: br.crit, sev: "moderada", type: "broken-ref-colapsado", nivel: "revisar"
      });
      return;
    }
    obs.push({ html: "La relación <code>" + esc(br.attr) + "</code> apunta a IDs inexistentes: <code>" + esc(br.ids) + "</code>.", crit: br.crit, sev: br.attr === "aria-labelledby" ? "grave" : "moderada", type: "broken-ref" });
  });
  return obs;
}

/* =========================================================================
   ÁRBOL DE ACCESIBILIDAD (componentes compuestos)
   ========================================================================= */
// OJO a las celdas: `table`, `row` y `rowgroup` estaban, pero `cell` no, así que
// el recorrido moría en el <td> y TODO lo que hubiera dentro de una tabla era
// invisible para el motor — un botón sin nombre en una tabla no generaba nada.
const CONTAINER_ROLES = new Set(["list", "listitem", "tablist", "tabpanel", "menu", "menubar", "listbox", "group", "radiogroup", "navigation", "main", "banner", "contentinfo", "complementary", "region", "dialog", "alertdialog", "table", "row", "rowgroup", "grid", "treegrid", "tree", "toolbar", "form", "search", "article", "feed", "figure", "status", "alert", "log",
  "cell", "gridcell", "columnheader", "rowheader", "term", "definition", "caption", "separator", "blockquote", "note", "document", "application", "presentation"]);
const INTERACTIVE_ROLES = ["button", "link", "checkbox", "radio", "textbox", "searchbox", "combobox", "listbox", "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "option", "treeitem"];
// Roles gestionados por foco itinerante (roving tabindex / aria-activedescendant):
// es normal que estén fuera del orden de Tab, así que no se les exige ser enfocables por Tab.
const MANAGED_ROLES = ["menuitem", "menuitemcheckbox", "menuitemradio", "tab", "option", "treeitem", "gridcell"];
// Enfocable por teclado (Tab): nativo, o tabindex >= 0. tabindex negativo NO cuenta.
function keyboardFocusable(el) {
  if ((nativelyFocusable(el)) && !el.hasAttribute("disabled")) return true;
  const ti = el.getAttribute("tabindex");
  return ti != null && !isNaN(parseInt(ti, 10)) && parseInt(ti, 10) >= 0 && !el.hasAttribute("disabled");
}
const REF_CRIT = { "aria-labelledby": "4.1.2", "aria-describedby": "4.1.2", "aria-controls": "1.3.1", "aria-owns": "1.3.1", "aria-activedescendant": "1.3.1", "for": "1.3.1" };

function isExposedInfo(el) {
  const tag = el.tagName.toLowerCase();
  if (["script", "style", "template", "noscript", "br", "source", "track", "link", "meta"].indexOf(tag) !== -1) return { exposed: false, reason: "no renderizable" };
  if (el.hasAttribute("hidden")) return { exposed: false, reason: "atributo hidden" };
  if (el.getAttribute("aria-hidden") === "true") return { exposed: false, reason: 'aria-hidden="true"' };
  if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return { exposed: false, reason: 'type="hidden"' };
  const style = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
  if (style.indexOf("display:none") !== -1) return { exposed: false, reason: "display:none" };
  if (style.indexOf("visibility:hidden") !== -1) return { exposed: false, reason: "visibility:hidden" };
  return { exposed: true, reason: "" };
}
function hasFocusableDescendant(el) {
  return !!el.querySelector('a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
}
function childElements(el) { return Array.prototype.slice.call(el.children); }
/**
 * Ruta CSS única hasta el elemento, en el mismo formato que ya usan la capa
 * dinámica y la de píxeles (`html > body > tag:nth-of-type(n) > …`).
 *
 * El locator legible NO identifica: dos `<img>` sin id ni clase son las dos
 * «img», y en la columna «Elemento» del IRA salían dos filas idénticas que no
 * sirven para ir a buscar el elemento. Esta ruta se pega en la consola y
 * selecciona uno y solo uno.
 *
 * Se corta en el envoltorio sintético `#__root__` (que no existe en la página
 * real) y se prefija `html > body`, porque tanto un documento completo como un
 * fragmento acaban colgando del body de la página analizada.
 */
// Los que el NAVEGADOR activa solo con Enter/Espacio. En cualquier otra
// etiqueta, la activación por teclado la tiene que escribir quien programa.
const NATIVOS_OPERABLES = ["a", "area", "button", "input", "select", "textarea", "summary", "details", "audio", "video", "label", "option"];
/**
 * 1.3.5 Identificar el propósito de la entrada.
 *
 * Los 53 tokens de «Input Purposes for User Interface Components» de WCAG 2.1.
 * La comprobación SÍ es automatizable —el token está o no está, y es o no es
 * válido—; lo que exige juicio es si el campo pedía uno. Antes la evidencia
 * afirmaba «la parte automatizable se cumple» sin que nada mirara `autocomplete`.
 */
const TOKENS_AUTOCOMPLETE = new Set(["name", "honorific-prefix", "given-name", "additional-name", "family-name",
  "honorific-suffix", "nickname", "organization-title", "username", "new-password", "current-password",
  "organization", "street-address", "address-line1", "address-line2", "address-line3",
  "address-level4", "address-level3", "address-level2", "address-level1", "country", "country-name",
  "postal-code", "cc-name", "cc-given-name", "cc-additional-name", "cc-family-name", "cc-number",
  "cc-exp", "cc-exp-month", "cc-exp-year", "cc-csc", "cc-type", "transaction-currency", "transaction-amount",
  "language", "bday", "bday-day", "bday-month", "bday-year", "sex", "url", "photo",
  "tel", "tel-country-code", "tel-national", "tel-area-code", "tel-local", "tel-local-prefix",
  "tel-local-suffix", "tel-extension", "email", "impp", "one-time-code"]);
// Prefijos y modificadores que la especificación permite delante del token.
const PREFIJOS_AC = new Set(["shipping", "billing", "home", "work", "mobile", "fax", "pager", "section"]);
/** @returns {null|{ok:boolean, motivo:string}} null si el campo no aplica. */
function revisaAutocomplete(el, tag, tipo) {
  if (tag !== "input" && tag !== "select" && tag !== "textarea") return null;
  const NO_APLICA = ["hidden", "submit", "button", "reset", "image", "file", "checkbox", "radio", "range", "color"];
  if (tag === "input" && NO_APLICA.indexOf(tipo) !== -1) return null;
  const crudo = (el.getAttribute("autocomplete") || "").trim().toLowerCase();
  if (!crudo) return { ok: false, motivo: "sin atributo <code>autocomplete</code>" };
  if (crudo === "off" || crudo === "on") {
    return { ok: false, motivo: '<code>autocomplete="' + crudo + '"</code> no identifica el propósito: hace falta un token concreto' };
  }
  const partes = crudo.split(/\s+/).filter(Boolean);
  // `section-*` puede ir delante; luego prefijos; el ÚLTIMO es el token.
  const token = partes[partes.length - 1];
  if (!TOKENS_AUTOCOMPLETE.has(token)) {
    return { ok: false, motivo: '<code>autocomplete="' + crudo + '"</code>: «' + token + "» no es un token de propósito de WCAG 2.1" };
  }
  const resto = partes.slice(0, -1);
  const malo = resto.find(function (x) { return !PREFIJOS_AC.has(x) && x.indexOf("section-") !== 0; });
  if (malo) return { ok: false, motivo: '<code>autocomplete="' + crudo + '"</code>: «' + malo + "» no es un modificador válido" };
  return { ok: true, motivo: '<code>autocomplete="' + crudo + '"</code>' };
}
/**
 * La ruta CSS de un elemento, para la columna «Elemento» del informe y para que
 * la guía de capturas pueda resaltarlo.
 *
 * EL PREFIJO SE DECIDE, NO SE SUPONE. Esto prefijaba siempre `html > body`, así
 * que todo lo que vive en el `<head>` salía con una ruta que no selecciona
 * NADA. Medido: `title` → «html > body > head:nth-of-type(1) > title:nth-of-type(1)»,
 * 0 elementos; igual el `meta` de refresco y el de viewport. Y no son criterios
 * menores: el viewport es 1.4.4 y 1.4.10 (`user-scalable=no`), el `<title>` es
 * 2.4.2 y el refresco es 2.2.1 — cosas por las que se sanciona, con el selector
 * apuntando a ningún sitio.
 *
 * Las rutas de dentro de `<body>` y las de los fragmentos salen EXACTAMENTE
 * iguales que antes: el prefijo solo cambia cuando el camino pasa por `<head>`.
 */
function buildPath(el) {
  const parts = [];
  let n = el, enCabeza = false;
  while (n && n.nodeType === 1) {
    const t = n.tagName.toLowerCase();
    if (t === "html" || t === "body") break;
    if (t === "head") { enCabeza = true; break; }
    if (n.id === "__root__") break;
    const p = n.parentElement;
    if (!p) { parts.unshift(t); break; }
    let i = 1, sib = p.firstElementChild;
    while (sib && sib !== n) { if (sib.tagName === n.tagName) i++; sib = sib.nextElementSibling; }
    parts.unshift(t + ":nth-of-type(" + i + ")");
    n = p;
  }
  return parts.length ? "html > " + (enCabeza ? "head > " : "body > ") + parts.join(" > ") : "body";
}
function buildLocator(el, tag) {
  if (el.id) return tag + "#" + el.id;
  const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  if (cls) return tag + "." + cls;
  const type = (el.getAttribute("type") || "");
  if (tag === "input" && type) return tag + '[type=' + type + ']';
  return tag;
}

let NODE_SEQ = 0;
function makeNode(el, doc, depth, presentacionHeredada) {
  const tag = el.tagName.toLowerCase();
  const explicitRole = el.getAttribute("role");
  // Un descendiente estructural de un contenedor con `role="presentation"`
  // tampoco expone su rol implícito (ARIA 1.2): si no, el nodo seguiría
  // apareciendo en el informe como `cell` o `row` de una tabla que ya no existe.
  const implicit = presentacionHeredada ? "presentation" : implicitRole(el);
  const role = explicitRole ? explicitRole.split(/\s+/)[0] : implicit;
  const disabled = el.hasAttribute("disabled");
  const focusable = keyboardFocusable(el);
  const hasClick = el.hasAttribute("onclick");
  // Solo ve los manejadores EN LÍNEA: un addEventListener no está en el marcado.
  // Por eso el veredicto que se emite con esto es `revisar`, nunca `falla`.
  const hasKeyHandler = el.hasAttribute("onkeydown") || el.hasAttribute("onkeyup") || el.hasAttribute("onkeypress");
  const autocomplete = revisaAutocomplete(el, tag, (el.getAttribute("type") || "text").toLowerCase());
  const interactive = focusable || INTERACTIVE_ROLES.indexOf(role) !== -1 || hasClick;
  const nameObj = accessibleName(el, doc, role);
  const descObj = accessibleDescription(el, doc, nameObj.source);
  const subtree = subtreeText(el);
  const formTags = (tag === "input" || tag === "textarea" || tag === "select");
  const formRoles = ["textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "slider", "spinbutton", "switch"];
  const relations = collectRelations(el);
  const level = /^h[1-6]$/.test(tag) ? tag.slice(1) : (role === "heading" && el.getAttribute("aria-level") ? el.getAttribute("aria-level") : "");

  const brokenRefs = [];
  relations.forEach(function (r) {
    if (r.attr === "for") return;
    const missing = r.target.split(/\s+/).filter(function (id) { return id && !doc.getElementById(id); });
    if (missing.length) brokenRefs.push({ attr: r.attr, ids: missing.join(" "), crit: REF_CRIT[r.attr] || "1.3.1" });
  });

  const tabAttr = el.getAttribute("tabindex");
  const managed = MANAGED_ROLES.indexOf(role) !== -1;
  const focusObs = [];
  if (tabAttr && parseInt(tabAttr, 10) > 0) focusObs.push({ html: '<code>tabindex="' + esc(tabAttr) + '"</code> positivo: altera el orden natural de tabulación (antipatrón).', crit: "2.4.3", sev: "moderada", type: "tabindex-positive" });
  // 3.2.1 / 3.2.2 cuando el cambio de contexto viene escrito en el atributo.
  cambioDeContextoEnLinea(el, tag, role).forEach(function (o) { focusObs.push(o); });
  // 2.1.1 cuando el único camino escrito en el marcado es el ratón.
  const soloRaton = funcionSoloConRaton(el, interactive, focusable, tag);
  if (soloRaton) {
    const cuales = soloRaton.pulsa.concat(soloRaton.pasa).map(function (h) { return "<code>" + h + "</code>"; }).join(", ");
    focusObs.push({
      html: (soloRaton.pulsa.length
        ? "La única forma de accionarlo que aparece en el marcado es del ratón (" + cuales +
          "), sin <code>onclick</code> ni manejador de teclado: Enter y Espacio disparan <code>click</code>, no " +
          "<code>" + soloRaton.pulsa[0] + "</code>, así que con el teclado esto no responde (fallo F54)"
        : "Lo único que tiene escrito es un manejador de paso del ratón (" + cuales +
          "): si de ahí depende alguna función, con el teclado no hay forma de llegar (fallo F54)") +
        ". Desde el marcado no se ve si eso hace algo o solo pinta: compruébalo con el teclado.",
      crit: "2.1.1", sev: "crítica", type: "solo-raton", nivel: "revisar"
    });
  }

  const model = {
    id: ++NODE_SEQ, depth: depth, tag: tag, role: role, level: level, locator: buildLocator(el, tag), path: buildPath(el),
    roleSource: explicitRole ? "atributo role (explícito)" : "rol implícito de <" + tag + ">",
    name: nameObj, desc: descObj.text, descSource: descObj.source,
    interactive: interactive, focusable: focusable, disabled: disabled, managed: managed, hasClick: hasClick, hasKeyHandler: hasKeyHandler, autocomplete: autocomplete, tabindex: tabAttr,
    states: collectStates(el), relations: relations, brokenRefs: brokenRefs,
    isImage: (tag === "img" || role === "img" || role === "(presentación)"),
    isMedia: (tag === "video" || tag === "audio" || role === "(medios)"),
    isFormControl: (formTags && (el.getAttribute("type") || "").toLowerCase() !== "hidden") || formRoles.indexOf(role) !== -1,
    isLink: role === "link", isHeading: role === "heading",
    hasIcon: !!el.querySelector("svg, img, i[class], [class*=icon]"),
    hasText: !!(nameObj.name || subtree),
    hasLiveRegion: el.hasAttribute("aria-live") || ["status", "alert", "log"].indexOf(role) !== -1,
    hasTitle: el.hasAttribute("title"),
    haspopup: el.getAttribute("aria-haspopup"), expanded: el.getAttribute("aria-expanded"),
    visibleText: subtree ? (subtree.length > 40 ? subtree.slice(0, 40) + "…" : subtree) : "",
    // Para 2.5.3: el texto que se LEE con los ojos, sin iconos ni `alt`, y sin
    // recortar — `visibleText` va truncado a 40 y no sirve para comparar.
    etiquetaVisible: textoDeEtiqueta(el, tag),
    // La misma etiqueta descontando lo que parece oculto a la vista, para las dos
    // lecturas de 2.5.3 (ver `etiquetaSinOcultos`).
    etiquetaSinOcultos: etiquetaSinOcultos(el, tag),
    children: []
  };
  model.say = announcement(model);
  model.criteria = applicableCriteria(model);
  model.observations = nodeObservations(model)
    .concat(ariaValidation(el, tag, role, explicitRole, implicit))
    .concat(focusObs);
  return model;
}

function isTransparent(el, role, name, interactive) {
  // role="none"/"presentation" elimina la semántica: se colapsa el nodo pero se
  // recorren sus hijos (p. ej. <li role="none"> en un menubar mantiene los menuitem).
  const stripped = (role === "(genérico)" || role === "(sin rol)" || role === "none" || role === "presentation");
  return stripped && !interactive && !name && !el.hasAttribute("aria-live");
}

/* `role="presentation"` SE HEREDA a los elementos estructurales obligatorios.
 *
 * WAI-ARIA 1.2: «When an explicit or inherited role of presentation is applied
 * to an element with the implicit semantic of a WAI-ARIA role that has required
 * owned elements, […] the user agent MUST apply an inherited role of
 * presentation to any owned elements that do not have an explicit role
 * defined», y la especificación pone de ejemplo exactamente este caso: «the
 * implicit native semantics of an HTML table element's thead/tbody/tfoot/tr/
 * th/td descendants will also be removed».
 *
 * El motor no lo hacía, y el resultado era un falso positivo grave en el
 * marcado RECOMENDADO para una tabla de maquetación: `<table
 * role="presentation">` perdía el rol de la tabla pero sus `<tr>` seguían
 * siendo `row`, así que cada fila salía como «row huérfano» y el criterio 1.3.1
 * se declaraba FALLA grave en una tabla correctamente marcada. Y lo mismo con
 * `<ul role="presentation">` y sus `<li>`.
 *
 * Clave: el tag del contenedor; valor: los tags cuya semántica implícita se
 * cae con él. La herencia es transitiva por la cadena (table → tr → td).
 */
const ESTRUCTURA_OBLIGADA = {
  table: ["thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col"],
  tr: ["th", "td"], thead: ["tr", "th", "td"], tbody: ["tr", "th", "td"], tfoot: ["tr", "th", "td"],
  ul: ["li"], ol: ["li"], menu: ["li"], dl: ["dt", "dd", "div"]
};
/** ¿Hereda este elemento la presentación del contenedor que la perdió? */
function heredaPresentacion(el, tagsCaidos) {
  if (!tagsCaidos || !tagsCaidos.length) return false;
  if (el.getAttribute("role")) return false;   // un rol explícito corta la herencia
  return tagsCaidos.indexOf(el.tagName.toLowerCase()) !== -1;
}

// Recorre el DOM y produce nodos expuestos; los contenedores genéricos vacíos se colapsan.
function collectTree(el, doc, depth, ctx, ancestors, tagsCaidos) {
  ancestors = ancestors || [];
  const info = isExposedInfo(el);
  if (!info.exposed) {
    if ((keyboardFocusable(el) || hasFocusableDescendant(el)) && (info.reason === 'aria-hidden="true"' || info.reason.indexOf("display") !== -1 || info.reason === "atributo hidden")) {
      ctx.structural.push({ html: "Hay contenido enfocable dentro de un subárbol oculto (<code>" + esc(info.reason) + "</code>): recibe foco pero no se anuncia.", crit: "4.1.2", sev: "grave", type: "hidden-focusable" });
    }
    ctx.hidden++;
    return [];
  }
  const explicitRole = el.getAttribute("role");
  const presentacionHeredada = heredaPresentacion(el, tagsCaidos);
  const role = explicitRole ? explicitRole.split(/\s+/)[0]
    : (presentacionHeredada ? "presentation" : implicitRole(el));
  const nameObj = accessibleName(el, doc, role);
  const focusable = keyboardFocusable(el);
  const interactive = focusable || INTERACTIVE_ROLES.indexOf(role) !== -1 || el.hasAttribute("onclick");
  const tag = el.tagName.toLowerCase();

  if (isTransparent(el, role, nameObj.name, interactive)) {
    // Si el que pierde la semántica es un contenedor con estructura obligada,
    // sus descendientes estructurales la pierden también (ARIA 1.2).
    const caen = (role === "none" || role === "presentation") ? (ESTRUCTURA_OBLIGADA[tag] || null) : null;
    let out = [];
    childElements(el).forEach(function (c) { out = out.concat(collectTree(c, doc, depth, ctx, ancestors, caen)); });
    return out;
  }
  const node = makeNode(el, doc, depth, presentacionHeredada);
  const req = REQUIRED_PARENT[node.role];
  if (req && !req.some(function (r) { return ancestors.indexOf(r) !== -1; })) {
    node.observations.push({ html: "Un <code>" + esc(node.role) + "</code> debe estar dentro de un <code>" + req.join("</code> o <code>") + "</code>; aquí aparece huérfano.", crit: "1.3.1", sev: "grave", type: "orphan-role" });
  }
  if (CONTAINER_ROLES.has(role)) {
    const childAnc = ancestors.concat(role);
    childElements(el).forEach(function (c) { node.children = node.children.concat(collectTree(c, doc, depth + 1, ctx, childAnc, null)); });
  }
  return [node];
}

/**
 * Marca los nodos que cuelgan de un enlace. Es un dato estructural, no de texto:
 * una imagen sin alternativa DENTRO de un enlace es otro subcriterio OAW que una
 * imagen suelta, y desde el hallazgo ya no hay forma de saberlo — el nodo del
 * hallazgo es la imagen, no su ascendencia.
 */
function marcarDentroDeEnlace(nodes, dentro) {
  nodes.forEach(function (n) {
    n.enEnlace = dentro;
    marcarDentroDeEnlace(n.children, dentro || n.role === "link" || n.tag === "a");
  });
}
function flatten(nodes, out) {
  out = out || [];
  nodes.forEach(function (n) { out.push(n); flatten(n.children, out); });
  return out;
}

function detectPattern(all) {
  const roles = all.map(function (n) { return n.role; });
  function has(r) { return roles.indexOf(r) !== -1; }
  if (has("tablist")) return { name: "Patrón de pestañas (tabs)", kind: "tabs" };
  if (has("dialog") || has("alertdialog")) return { name: "Diálogo", kind: "dialog" };
  if (has("menu") || has("menubar")) return { name: "Menú", kind: "menu" };
  if (all.some(function (n) { return n.haspopup && n.expanded != null; })) return { name: "Botón desplegable (disclosure)", kind: "disclosure" };
  if (has("radiogroup")) return { name: "Grupo de opciones", kind: "group" };
  if (has("navigation")) return { name: "Navegación", kind: "nav" };
  if (has("table") || has("grid")) return { name: "Tabla", kind: "table" };
  if (has("list")) return { name: "Lista", kind: "list" };
  return { name: "Componente compuesto", kind: "composite" };
}

function structuralObservations(all, ctx) {
  const obs = ctx.structural.slice();
  all.forEach(function (n) {
    // Con `id`: sin él la deduplicación de `analyze` caía a «locator + rol» y dos
    // elementos distintos sin id ni clase se fusionaban en un solo nodo, así que
    // el IRA contaba una barrera donde había dos.
    const nd = { id: n.id, role: n.role, name: n.name.name, locator: n.locator, path: n.path };
    if (n.role === "tablist" && !flatten(n.children).some(function (c) { return c.role === "tab"; })) {
      obs.push({ html: "Un <code>tablist</code> no contiene ningún <code>tab</code>: la estructura de pestañas está incompleta.", crit: "1.3.1", sev: "grave", node: nd, type: "tablist-no-tabs" });
    }
    if (n.role === "list" && n.children.length && !n.children.some(function (c) { return c.role === "listitem"; })) {
      obs.push({ html: "Una <code>list</code> contiene elementos que no son <code>listitem</code>: se rompe la relación de lista.", crit: "1.3.1", sev: "moderada", node: nd, type: "list-no-items" });
    }
    if (n.interactive && flatten(n.children).some(function (c) { return c.interactive; })) {
      obs.push({ html: "Un elemento interactivo (<code>" + esc(n.role) + "</code>) contiene otro interactivo anidado: teclado y lectores se comportan de forma imprevisible.", crit: "4.1.2", sev: "grave", node: nd, type: "nested-interactive" });
    }
    const owned = REQUIRED_OWNED[n.role];
    if (owned && n.children.length && !flatten(n.children).some(function (c) { return owned.indexOf(c.role) !== -1; })) {
      obs.push({ html: "Un <code>" + esc(n.role) + "</code> no contiene ningún <code>" + owned.join("</code>/<code>") + "</code>: la estructura del patrón está incompleta.", crit: "1.3.1", sev: "grave", node: nd, type: "owned-missing" });
    }
    /* Una tabla SIN NINGUNA celda de encabezado.
     *
     * Esto no se comprobaba en ninguna capa, y es la barrera clásica de 1.3.1:
     * la tabla salía «cumple · Determinable desde el marcado y correcto», que en
     * el IRA se lee «Correcto». Un lector de pantalla que recorre una tabla sin
     * `<th>` canta los números sin decir de qué columna son, y la relación entre
     * el dato y su cabecera —que es literalmente lo que pide el criterio— no
     * está expuesta por código.
     *
     * Y da igual de qué tabla se trate: si son datos, le faltan los encabezados;
     * si es una tabla de maquetación, no debería estar exponiendo rol de tabla
     * (le falta `role="presentation"`). Las dos lecturas son el mismo defecto de
     * 1.3.1, así que se dicen las dos y decide quien audita. */
    if (n.role === "table" || n.role === "grid" || n.role === "treegrid") {
      const dentro = flatten(n.children);
      const cabeceras = dentro.filter(function (c) { return c.role === "columnheader" || c.role === "rowheader"; });
      const filas = dentro.filter(function (c) { return c.role === "row"; });
      const celdasPorFila = filas.map(function (f) {
        return flatten(f.children).filter(function (c) { return c.role === "cell" || c.role === "gridcell" || c.role === "columnheader" || c.role === "rowheader"; }).length;
      });
      const anchoMax = celdasPorFila.length ? Math.max.apply(null, celdasPorFila) : 0;
      if (!cabeceras.length && filas.length) {
        // Con una sola fila o una sola columna puede ser cualquier cosa; con dos
        // por dos, la forma ya es de tabla de datos.
        const formaDeDatos = filas.length >= 2 && anchoMax >= 2;
        obs.push({
          html: "Una tabla de " + filas.length + "×" + anchoMax + " sin NINGUNA celda de encabezado (<code>&lt;th&gt;</code> o <code>role=\"columnheader\"/\"rowheader\"</code>): " +
            "los datos se anuncian sin decir a qué columna o fila pertenecen. Si son datos, marca los encabezados con <code>&lt;th scope=\"col\"&gt;</code> o <code>scope=\"row\"</code>" +
            (dentro.some(function (c) { return c.tag === "caption"; }) ? "" : " y pon un <code>&lt;caption&gt;</code>") +
            "; si la tabla es solo de maquetación, quítale la semántica con <code>role=\"presentation\"</code>.",
          crit: "1.3.1", sev: formaDeDatos ? "grave" : "moderada", node: nd,
          type: "table-sin-cabeceras", nivel: formaDeDatos ? undefined : "revisar"
        });
      }
    }
  });
  return obs;
}

// --- Análisis principal: construye el árbol de accesibilidad completo ---
function understand(html) {
  NODE_SEQ = 0;
  const doc = new _DOMParser().parseFromString('<div id="__root__">' + html + "</div>", "text/html");
  const root = doc.getElementById("__root__");
  const ctx = { hidden: 0, structural: [] };
  let roots = [];
  childElements(root).forEach(function (c) { roots = roots.concat(collectTree(c, doc, 0, ctx)); });
  if (!roots.length) return null;

  const all = flatten(roots);
  const pattern = detectPattern(all);

  let primary = roots[0];
  roots.forEach(function (r) { if (flatten([r]).length > flatten([primary]).length) primary = r; });

  const critMap = {};
  all.forEach(function (n) { n.criteria.forEach(function (c) { critMap[c.n] = c; }); });
  const criteria = Object.keys(critMap).map(function (k) { return critMap[k]; }).sort(function (a, b) { return cmpSC(a.n, b.n); });

  marcarDentroDeEnlace(roots, false);

  let observations = [];
  all.forEach(function (n) {
    n.observations.forEach(function (o) {
      const where = (all.length > 1) ? '<span class="obs-where">' + esc(n.role) + (n.name.name ? " «" + esc(n.name.name) + "»" : "") + ":</span> " : "";
      // `tag` y `enEnlace` viajan con el nodo porque el mapeo a subcriterio OAW
      // los necesita (una imagen dentro de un enlace es otro subcriterio que una
      // imagen suelta) y desde el hallazgo ya no se pueden deducir.
      observations.push({
        // `nivel` viaja con la observación: si se queda aquí, `analyze` no puede
        // distinguir una sospecha de una barrera y todo acaba en `falla`.
        html: where + o.html, crit: o.crit, sev: o.sev, type: o.type, nivel: o.nivel,
        node: { id: n.id, role: n.role, name: n.name.name, locator: n.locator, path: n.path, tag: n.tag, enEnlace: !!n.enEnlace }
      });
    });
  });
  observations = observations.concat(structuralObservations(all, ctx));

  return { roots: roots, all: all, primary: primary, pattern: pattern, hidden: ctx.hidden, criteria: criteria, observations: observations };
}

/* ---- API pública del motor ---- */
export {
  capaQueMide,
  buildPath,
  cambioDeContextoEnLinea,
  funcionSoloConRaton,
  accionNativaDeTeclado,
  accionDeContexto,
  etiquetaEnNombre,
  textoDeEtiqueta,
  normalizaEtiqueta,
  understand,
  analyze,
  esc,
  implicitRole,
  accessibleName,
  accessibleDescription,
  announcement,
  collectStates,
  collectRelations,
  ariaValidation,
  applicableCriteria,
  severityByCrit,
  enClause,
  cmpSC,
  WCAG22,
  WCAG_TOTAL,
  EN_EXCLUDED,
  QUALITY_MANUAL
};
