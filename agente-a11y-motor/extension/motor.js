/**
 * Núcleo del Agente de Accesibilidad — GENERADO, no editar a mano.
 *
 *   fuente:  agente-a11y-motor/src/
 *   genera:  npm run build:extension
 *
 * Cada módulo va en su propia IIFE y comparte el espacio de nombres `A11Y`:
 * varios definen por su cuenta funciones con el mismo nombre (F, crit, loc…)
 * y en un ámbito único se pisarían en silencio.
 */
var A11Y = (typeof globalThis !== "undefined" ? globalThis : self).A11Y || {};
(typeof globalThis !== "undefined" ? globalThis : self).A11Y = A11Y;

/* ── verdicts.js ── */
(function (NS) {
  /**
   * Vocabulario ÚNICO de veredictos y su orden de gravedad.
   *
   * Varios módulos (muestreo, export OAW, resumen) agregaban veredictos con su
   * propia tabla `RANK` parcial. Cualquier veredicto ausente de esa tabla caía a 0
   * —es decir, a «cumple»— y acababa exportado como «Correcto» en un IRA. Eso es
   * un error de entregable legal: un criterio que NUNCA se ha evaluado no puede
   * declararse conforme.
   *
   * Aquí está la tabla completa, y `rank()` trata cualquier veredicto DESCONOCIDO
   * como «no se puede comprobar», nunca como conforme. Es la política de fallo
   * seguro: ante la duda, el informe pide revisión humana.
   */

  /** Veredictos que produce el agente, de peor a mejor. */
  const VERDICTS = ["falla", "revisar", "humano", "cumple-parcial", "pasa", "cumple", "no-aplica"];

  const RANK = {
    falla: 5,            // barrera determinista
    revisar: 4,          // semi-determinable: el motor sospecha, decide una persona
    humano: 3,           // no determinable por máquina: evaluación humana obligatoria
    "cumple-parcial": 2, // la parte automatizable cumple; la calidad exige juicio
    pasa: 1,             // medido sobre render real y correcto
    cumple: 0,           // determinable automáticamente y correcto
    /* «No aplica» NO es conformidad, y tampoco es una duda: es que en esta página
     * no hay nada a lo que el criterio se refiera. Sin vídeo ni audio, 1.2.5 no se
     * cumple ni se incumple — no viene al caso, y el IRA tiene esa casilla.
     *
     * Va por debajo de `cumple` a propósito. Así, en cuanto UNA página de la
     * muestra aporta cualquier otro veredicto, ese otro gana: si una página no
     * tiene vídeo y otra sí, el criterio del sitio es el de la que lo tiene. Un
     * «no aplica» nunca puede tapar un hallazgo de otra página. */
    "no-aplica": -1
  };

  /** Rango de gravedad. Un veredicto desconocido NUNCA vale como conforme. */
  function rank(v) {
    const r = RANK[v];
    return r == null ? RANK.revisar : r;
  }

  /** Peor de dos veredictos. `null`/`undefined` se ignoran. */
  function worseOf(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return rank(a) >= rank(b) ? a : b;
  }

  /** Agrega una lista de veredictos al peor. Lista vacía → null (nada evaluado). */
  function worstOf(list) {
    let w = null;
    (list || []).forEach(function (v) { w = worseOf(w, v); });
    return w;
  }

  /** ¿Este veredicto permite declarar conformidad? Solo `cumple` y `pasa`. */
  function esConforme(v) {
    return v === "cumple" || v === "pasa";
  }

  /** ¿El criterio no viene al caso en este ámbito? */
  function esNoAplica(v) {
    return v === "no-aplica";
  }

  /**
   * ¿Queda sin determinar (necesita persona)?
   *
   * `no-aplica` NO está sin determinar: está decidido, y la decisión es que el
   * criterio no viene al caso. Meterlo en el montón de «pendiente de revisión»
   * inflaría el trabajo del auditor con criterios que no tiene nada que mirar.
   */
  function esIndeterminado(v) {
    return !esConforme(v) && !esNoAplica(v) && v !== "falla";
  }
  NS.VERDICTS = VERDICTS;
  NS.rank = rank;
  NS.worseOf = worseOf;
  NS.worstOf = worstOf;
  NS.esConforme = esConforme;
  NS.esNoAplica = esNoAplica;
  NS.esIndeterminado = esIndeterminado;
})(A11Y);

/* ── engine.js ── */
(function (NS) {
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
  function setDOMParser(P) { _DOMParser = P; }

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
  const REQUIRED_STATE = { checkbox: "aria-checked", switch: "aria-checked", menuitemcheckbox: "aria-checked", radio: "aria-checked", menuitemradio: "aria-checked", combobox: "aria-expanded" };
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
    const nativeChecked = REQUIRED_STATE[role] === "aria-checked" && tag === "input" && (type === "checkbox" || type === "radio");
    if (explicitRole && REQUIRED_STATE[role] && !el.hasAttribute(REQUIRED_STATE[role]) && !nativeChecked) {
      obs.push({ html: "Un <code>" + esc(role) + "</code> declarado con <code>role</code> necesita <code>" + REQUIRED_STATE[role] + "</code> para exponer su estado a la API de accesibilidad.", crit: "4.1.2", sev: "grave", type: "aria-missing-state" });
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
    "2.5.1": "página", "2.5.2": "página", "2.5.4": "página", "2.5.7": "página", "2.2.2": "medición",
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
      d: "La estructura y las relaciones deben exponerse por código.", ap: function (m) { return m.isFormControl || m.isHeading || m.interactive || m.isImage || m.relations.length > 0; } },
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
      const f = failMap[o.crit] || (failMap[o.crit] = { sev: sev, evid: [], nodes: [], types: [] });
      if (SEV_RANK[sev] > SEV_RANK[f.sev]) f.sev = sev;
      f.evid.push(o.html);
      if (o.type && f.types.indexOf(o.type) === -1) f.types.push(o.type);
      // Deduplicación por IDENTIDAD del nodo, no por su locator: dos <img> sin id
      // ni clase comparten locator («img») y se fusionaban en uno solo, así que dos
      // barreras distintas salían como una sola fila en el IRA. El locator sirve
      // para leerlo; para contar hace falta la identidad.
      if (o.node && o.node.locator) {
        const mismo = f.nodes.some(function (x) {
          return (x.id != null && o.node.id != null)
            ? x.id === o.node.id
            : (x.locator === o.node.locator && x.role === o.node.role);
        });
        if (!mismo) f.nodes.push(o.node);
      }
    });
    const critObjs = {};
    m.criteria.forEach(function (c) { critObjs[c.n] = c; });
    Object.keys(failMap).forEach(function (n) { if (!critObjs[n] && WCAG_IX[n]) critObjs[n] = WCAG_IX[n]; });

    Object.keys(dudaMap).forEach(function (n) { if (!critObjs[n] && WCAG_IX[n]) critObjs[n] = WCAG_IX[n]; });

    const findings = Object.keys(critObjs).sort(cmpSC).map(function (n) {
      const c = critObjs[n];
      if (failMap[n]) return { c: c, verdict: "falla", sev: failMap[n].sev, evid: failMap[n].evid, nodes: failMap[n].nodes, types: failMap[n].types, scope: "componente" };
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
      if (c.det === "semi") {
        return { c: c, verdict: "revisar", sev: null, scope: "componente", evid: [
          (capa
            ? "El motor no lo dictamina desde el marcado; lo mide la capa de " + capa + ", que en esta ejecución no ha corrido."
            : "No es determinable solo desde el marcado: hay que comprobarlo sobre el render real o a mano.") + porque] };
      }
      return { c: c, verdict: "humano", sev: null, scope: "componente", evid: [
        (capa
          ? "El motor no lo dictamina desde el marcado; lo mide la capa de " + capa + ", que en esta ejecución no ha corrido."
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
    if (model.name.insufficient && model.name.source.indexOf("title") !== -1) {
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
    if (model.role !== "(genérico)" && model.role !== "(sin rol)" &&
        INTERACTIVE_ROLES.indexOf(model.role) !== -1 &&
        NATIVOS_OPERABLES.indexOf(model.tag) === -1 &&
        model.focusable && !model.disabled) {
      const conTeclado = model.hasKeyHandler;
      obs.push({
        html: "Control no nativo (<code>&lt;" + esc(model.tag) + '&gt;</code> con <code>role="' + esc(model.role) + '"</code>): recibe el foco, pero Enter y Espacio no lo activan solos como harían en un elemento nativo' +
          (conTeclado ? ", y aunque declara un manejador de teclado en el marcado hay que comprobar que responde a las dos teclas" : ". No se ve ningún manejador de teclado en el marcado") +
          ". Compruébalo con el teclado.",
        crit: "2.1.1", sev: "crítica", type: "custom-control-keyboard", nivel: "revisar"
      });
    }
    (model.brokenRefs || []).forEach(function (br) {
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
  function buildPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const t = n.tagName.toLowerCase();
      if (t === "html" || t === "body") break;
      if (n.id === "__root__") break;
      const p = n.parentElement;
      if (!p) { parts.unshift(t); break; }
      let i = 1, sib = p.firstElementChild;
      while (sib && sib !== n) { if (sib.tagName === n.tagName) i++; sib = sib.nextElementSibling; }
      parts.unshift(t + ":nth-of-type(" + i + ")");
      n = p;
    }
    return parts.length ? "html > body > " + parts.join(" > ") : "body";
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
  function makeNode(el, doc, depth) {
    const tag = el.tagName.toLowerCase();
    const explicitRole = el.getAttribute("role");
    const implicit = implicitRole(el);
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

  // Recorre el DOM y produce nodos expuestos; los contenedores genéricos vacíos se colapsan.
  function collectTree(el, doc, depth, ctx, ancestors) {
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
    const role = explicitRole ? explicitRole.split(/\s+/)[0] : implicitRole(el);
    const nameObj = accessibleName(el, doc, role);
    const focusable = keyboardFocusable(el);
    const interactive = focusable || INTERACTIVE_ROLES.indexOf(role) !== -1 || el.hasAttribute("onclick");

    if (isTransparent(el, role, nameObj.name, interactive)) {
      let out = [];
      childElements(el).forEach(function (c) { out = out.concat(collectTree(c, doc, depth, ctx, ancestors)); });
      return out;
    }
    const node = makeNode(el, doc, depth);
    const req = REQUIRED_PARENT[node.role];
    if (req && !req.some(function (r) { return ancestors.indexOf(r) !== -1; })) {
      node.observations.push({ html: "Un <code>" + esc(node.role) + "</code> debe estar dentro de un <code>" + req.join("</code> o <code>") + "</code>; aquí aparece huérfano.", crit: "1.3.1", sev: "grave", type: "orphan-role" });
    }
    if (CONTAINER_ROLES.has(role)) {
      const childAnc = ancestors.concat(role);
      childElements(el).forEach(function (c) { node.children = node.children.concat(collectTree(c, doc, depth + 1, ctx, childAnc)); });
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
    });
    return obs;
  }

  // --- Análisis principal: construye el árbol de accesibilidad completo ---
  function understand(html) {
    NODE_SEQ = 0;
    const doc = new DOMParser().parseFromString('<div id="__root__">' + html + "</div>", "text/html");
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
  NS.setDOMParser = setDOMParser;
  NS.capaQueMide = capaQueMide;
  NS.buildPath = buildPath;
  NS.understand = understand;
  NS.analyze = analyze;
  NS.esc = esc;
  NS.implicitRole = implicitRole;
  NS.accessibleName = accessibleName;
  NS.accessibleDescription = accessibleDescription;
  NS.announcement = announcement;
  NS.collectStates = collectStates;
  NS.collectRelations = collectRelations;
  NS.ariaValidation = ariaValidation;
  NS.applicableCriteria = applicableCriteria;
  NS.severityByCrit = severityByCrit;
  NS.enClause = enClause;
  NS.cmpSC = cmpSC;
  NS.WCAG22 = WCAG22;
  NS.WCAG_TOTAL = WCAG_TOTAL;
  NS.EN_EXCLUDED = EN_EXCLUDED;
  NS.QUALITY_MANUAL = QUALITY_MANUAL;
})(A11Y);

/* ── measure.browser.js ── */
(function (NS) {
  /**
   * Núcleo de medición sobre render REAL.
   *
   * La matemática de contraste (WCAG + APCA, con composición alfa) se escribe una
   * sola vez como funciones puras, testeables en Node. Las funciones que dependen
   * del DOM (getComputedStyle / getBoundingClientRect) se escriben aparte y se
   * serializan a un string inyectable (`MEASURE_SRC`) que corre dentro de la página
   * real —vía Playwright, o vía la extensión de Chrome— para medir con estilos y
   * layout de verdad, no sobre un fragmento aislado.
   */

  /* ── Matemática pura (unit-testable en Node) ── */

  /**
   * Resuelve cualquier notación de color a rgba(), usando el propio navegador.
   *
   * `parseColor` solo entiende rgb()/rgba(), y Chromium NO serializa a rgb() los
   * colores en `oklch()`, `lab()`, `color(srgb …)` ni `color-mix()`: los devuelve
   * tal cual. Antes eso hacía que el fondo se degradara a blanco y un texto
   * ilegible saliera conforme; luego pasó a declararse «no medible». Pero el
   * navegador sí sabe resolverlos: basta pintarlo en un canvas de 1×1 y leer el
   * píxel. Así se mide de verdad, y lo que venga después (lch, color-contrast…)
   * funciona sin tocar nada.
   *
   * Solo existe dentro de la página; en Node no hay canvas y se devuelve null,
   * que es lo que activa la vía honesta de «no medible».
   */
  function resolverColor(css, doc) {
    const str = String(css || "").trim();
    if (!str || str === "none") return null;
    const directo = parseColor(str);
    if (directo) return directo;
    try {
      const d = doc || (typeof document !== "undefined" ? document : null);
      if (!d || !d.createElement) return null;
      if (!resolverColor._ctx) {
        const cv = d.createElement("canvas");
        cv.width = 1; cv.height = 1;
        resolverColor._ctx = cv.getContext("2d", { willReadFrequently: true });
      }
      const ctx = resolverColor._ctx;
      if (!ctx) return null;
      // Si el navegador no entiende el valor, `fillStyle` conserva el anterior:
      // se pone un centinela antes para distinguir «no entendido» de «negro».
      ctx.fillStyle = "#000";
      ctx.fillStyle = str;
      if (ctx.fillStyle === "#000000" && !/^#0{3,8}$|black|rgba?\(0[,\s]/i.test(str)) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillRect(0, 0, 1, 1);
      const px = ctx.getImageData(0, 0, 1, 1).data;
      return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
    } catch (e) { return null; }
  }
  function parseColor(s) {
    if (!s) return null;
    // rgb()/rgba() con comas o con espacios (getComputedStyle moderno) y / alfa
    const m = String(s).match(/rgba?\(([^)]+)\)/i);
    if (!m) return null;
    const parts = m[1].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean).map(function (x) {
      return x.indexOf("%") !== -1 ? parseFloat(x) * 2.55 : parseFloat(x);
    });
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: (parts[3] == null ? 1 : parts[3]) };
  }
  function over(src, dst) {
    const a = src.a == null ? 1 : src.a;
    return { r: src.r * a + dst.r * (1 - a), g: src.g * a + dst.g * (1 - a), b: src.b * a + dst.b * (1 - a), a: 1 };
  }
  function lum(c) {
    const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrastRatio(a, b) {
    const L1 = lum(a), L2 = lum(b), hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function rgbStr(c) { return "rgb(" + Math.round(c.r) + " " + Math.round(c.g) + " " + Math.round(c.b) + ")"; }
  function apcaContrast(fg, bg) {
    const sY = function (c) { const j = function (v) { return Math.pow(v / 255, 2.4); }; return 0.2126729 * j(c.r) + 0.7151522 * j(c.g) + 0.0721750 * j(c.b); };
    let Ytxt = sY(fg), Ybg = sY(bg);
    const blkThrs = 0.022, blkClmp = 1.414, soft = function (Y) { return Y < blkThrs ? Y + Math.pow(blkThrs - Y, blkClmp) : Y; };
    Ytxt = soft(Ytxt); Ybg = soft(Ybg);
    if (Math.abs(Ybg - Ytxt) < 0.0005) return 0;
    let SAPC, out;
    if (Ybg > Ytxt) { SAPC = (Math.pow(Ybg, 0.56) - Math.pow(Ytxt, 0.57)) * 1.14; out = SAPC < 0.1 ? 0 : SAPC - 0.027; }
    else { SAPC = (Math.pow(Ybg, 0.65) - Math.pow(Ytxt, 0.62)) * 1.14; out = SAPC > -0.1 ? 0 : SAPC + 0.027; }
    return out * 100;
  }
  function apcaMin(size, weight) {
    if (size >= 24 || (size >= 18.66 && weight >= 700)) return 60;
    if (size >= 16 && weight >= 400) return 75;
    return 90;
  }

  /* ── Funciones que corren en la página real (serializadas a MEASURE_SRC) ── */

  /**
   * Opacidad acumulada de toda la ascendencia.
   *
   * Va aparte del recorrido de fondos a propósito: aquel se PARA en el primer
   * fondo opaco, y la opacidad de un antepasado por encima de ese punto sigue
   * afectando a lo que se ve. Con el cálculo metido en el mismo bucle, un
   * `<div style="opacity:.25"><p style="background:#fff">` se paraba en el <p> y
   * la opacidad del div no se contaba: 21:1 medido sobre un glifo que en pantalla
   * es gris claro.
   */
  function opacidadAcumulada(el, win) {
    let p = el, acc = 1;
    while (p && p.nodeType === 1) {
      const op = parseFloat(win.getComputedStyle(p).opacity);
      if (!isNaN(op) && op < 1) acc *= op;
      p = p.parentElement;
    }
    return acc;
  }
  /* ¿Lo que se pinta DEBAJO es de verdad lo que hemos medido?
   *
   * `bgBehind` sube por la ASCENDENCIA del DOM, y la ascendencia no es el orden de
   * pintado. Un bloque `position:absolute` o una cabecera `position:fixed` con fondo
   * transparente se dibuja ENCIMA de una foto que no es antepasada suya, así que su
   * texto se medía contra el blanco del `body` —o, peor, contra el blanco inventado
   * cuando no había ningún fondo opaco arriba— y el detalle afirmaba ese blanco como
   * hecho medido. Comprobado: texto `#1a1a1a` sobre una foto `#141418` salía
   * «pasa · ratio 17.40:1 … sobre rgb(255 255 255)» con un contraste real de 1.06:1.
   * Una barrera total de 1.4.3 exportada como conforme.
   *
   * `elementsFromPoint` da la pila de pintado de verdad. Si el primero que pinta algo
   * por debajo del elemento no es uno de sus antepasados, lo medido no vale y el
   * criterio se queda sin dictaminar, que es la vía honesta que ya existe para los
   * fondos con imagen.
   *
   * Límite, y se dice: solo funciona dentro del viewport. Para el texto que queda por
   * debajo del pliegue no se puede comprobar sin desplazar la página en mitad de la
   * medición, y eso movería lo que están midiendo las demás comprobaciones.
   */
  function fondoRealCoincide(el, win, origen) {
    // Si el propio elemento pone un fondo opaco, lo que haya debajo da igual.
    if (origen === el) return { ok: true };
    const doc = el.ownerDocument;
    if (!doc || !doc.elementsFromPoint) return { ok: true };
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { ok: true };
    const x = Math.min(r.left + 2, r.right - 1);
    const y = Math.min(r.top + Math.min(4, r.height / 2), r.bottom - 1);
    if (x < 0 || y < 0 || x >= (win.innerWidth || 0) || y >= (win.innerHeight || 0)) {
      return { ok: true, fuera: true };   // fuera del viewport: no se afirma nada
    }
    let pila;
    try { pila = doc.elementsFromPoint(x, y) || []; } catch (e) { return { ok: true }; }
    const i = pila.indexOf(el);
    if (i === -1) return { ok: true };     // el punto no cae en el elemento
    for (let k = i + 1; k < pila.length; k++) {
      const cand = pila[k];
      const cs = win.getComputedStyle(cand);
      const tieneImagen = cs.backgroundImage && cs.backgroundImage !== "none";
      const b = resolverColor(cs.backgroundColor, doc);
      if (tieneImagen || (b && b.a > 0)) {
        if (cand.contains(el)) return { ok: true };
        // `locatorM` está declarada más abajo en el mismo ámbito (hoisting).
        return { ok: false, pintor: locatorM(cand),
          fondo: tieneImagen ? String(cs.backgroundImage).slice(0, 60) : cs.backgroundColor };
      }
    }
    return { ok: true };
  }
  function bgBehind(el, win) {
    let p = el, image = false, desconocido = false; const layers = [];
    let base = { r: 255, g: 255, b: 255, a: 1 };
    let origen = null;   // quién puso el fondo opaco con el que se mide
    while (p && p.nodeType === 1) {
      const cs = win.getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== "none") image = true;
      const crudo = cs.backgroundColor;
      const b = resolverColor(crudo, el.ownerDocument);
      if (!b && crudo && crudo !== "transparent" && crudo !== "none") {
        // `oklch()`, `lab()`, `color(srgb …)`, `color-mix()`: Chromium NO los
        // serializa a rgb(). Antes se seguía subiendo y se acababa midiendo contra
        // un blanco inventado — texto ilegible declarado conforme.
        desconocido = true;
        break;
      }
      if (b && b.a > 0) { if (b.a >= 1) { base = b; origen = p; break; } layers.push(b); }
      p = p.parentElement;
    }
    let outc = { r: base.r, g: base.g, b: base.b, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) outc = over(layers[i], outc);
    outc.image = image;
    outc.desconocido = desconocido;
    outc.opacidad = opacidadAcumulada(el, win);
    outc.origen = origen;
    // Sin fondo opaco en toda la ascendencia se estaba midiendo contra un blanco
    // supuesto; eso solo vale si lo que se pinta debajo es de verdad de la página.
    outc.real = fondoRealCoincide(el, win, origen);
    return outc;
  }
  /**
   * Texto PROPIO del elemento: solo sus nodos de texto directos.
   *
   * `textContent` incluye el de los descendientes, así que medíamos el `color` del
   * contenedor contra un texto que en realidad pinta un hijo con otro color. De ahí
   * salían tanto falsos positivos como falsos negativos de 1.4.3. El contraste se
   * mide donde de verdad hay texto.
   */
  function ownText(el) {
    let s = "";
    const kids = el.childNodes || [];
    for (let i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) s += kids[i].nodeValue || "";
    return s.replace(/\s+/g, " ").trim(); // \s ya incluye U+00A0
  }
  function contrastOf(el, win) {
    const txt = ownText(el); if (!txt) return null;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return null;
    const size0 = parseFloat(cs.fontSize) || 16, weight0 = parseInt(cs.fontWeight, 10) || 400;
    const large0 = size0 >= 24 || (size0 >= 18.66 && weight0 >= 700);
    let fg = resolverColor(cs.color, el.ownerDocument);
    // Un color de TEXTO que no se sabe leer tampoco puede desaparecer en silencio:
    // antes se devolvía `null` y el elemento no salía ni como pendiente.
    if (!fg) return { undetermined: true, large: large0, motivo: "el color del texto está en una notación que esta medición no sabe leer (" + String(cs.color).slice(0, 40) + ")" };
    const bg = bgBehind(el, win);
    const size = size0, weight = weight0;
    const large = large0;
    if (bg.desconocido) return { undetermined: true, large: large, motivo: "el fondo está en una notación que esta medición no sabe leer (oklch, lab, color-mix…)" };
    if (bg.opacidad < 1) return { undetermined: true, large: large, motivo: "hay opacidad (" + bg.opacidad.toFixed(2) + ") en la cadena de antepasados: lo que se ve pintado no es este color" };
    if (bg.real && bg.real.ok === false) {
      return { undetermined: true, large: large,
        motivo: "lo que se pinta detrás no es lo que dice el marcado: encima hay «" + bg.real.pintor +
          "» (fondo " + bg.real.fondo + "), que no es antepasado de este elemento, así que el contraste no se puede calcular desde los estilos. Mídelo por píxeles o a mano" };
    }
    if (bg.image) return { undetermined: true, large: large };
    if (fg.a != null && fg.a < 1) fg = over(fg, bg);
    return { ratio: contrastRatio(fg, bg), fg: rgbStr(fg), bg: rgbStr(bg), large: large, lc: apcaContrast(fg, bg), lcMin: apcaMin(size, weight) };
  }
  /**
   * 1.4.11 Contraste no textual: el LÍMITE del control contra lo que tiene detrás.
   *
   * Solo tiene sentido si el control pinta un relleno propio; si lo dibuja el
   * navegador (un <input> con estilo de UA) o el fondo lleva imagen, no es medible.
   */
  function boundaryContrastOf(el, win) {
    const own = resolverColor(win.getComputedStyle(el).backgroundColor, el.ownerDocument);
    if (!own || own.a === 0) return null;
    const bg = bgBehind(el.parentElement || el, win);
    if (bg.image) return null;
    const front = own.a < 1 ? over(own, bg) : own;
    const ratio = contrastRatio(front, bg);
    if (!(ratio > 1.001)) return null; // mismo color que el fondo: no hay límite que medir
    return { ratio: ratio, fg: rgbStr(front), bg: rgbStr(bg) };
  }
  const NATIVOS = ["a", "button", "input", "select", "textarea", "summary"];
  function isInteractiveM(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "a" || tag === "area") return el.hasAttribute("href");
    if (["button", "select", "textarea", "summary"].indexOf(tag) !== -1) return true;
    if (tag === "input") return (el.getAttribute("type") || "").toLowerCase() !== "hidden";
    const role = (el.getAttribute("role") || "").split(/\s+/)[0];
    const IR = ["button", "link", "checkbox", "radio", "textbox", "searchbox", "combobox", "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "option", "treeitem"];
    if (role && IR.indexOf(role) !== -1) return true;
    const ti = el.getAttribute("tabindex");
    return el.hasAttribute("onclick") || (ti != null && parseInt(ti, 10) >= 0);
  }
  /**
   * ¿Hay una regla CSS de foco que se aplique a este elemento y pinte un indicador?
   *
   * Es la salida cuando el documento NO tiene el foco del sistema. Se descubrió
   * probando sobre un sitio real desde un panel de navegador: con el panel abierto
   * el documento pierde el foco, `:focus` deja de aplicar y la comparación de
   * estilos daba «sin cambio medible» en TODOS los controles — un falso 2.4.7 por
   * cada elemento de la página. En Playwright no aparecía nunca, porque allí la
   * página siempre tiene el foco.
   */
  const PROP_INDICADOR = ["outline", "outline-width", "outline-style", "outline-color",
    "box-shadow", "border", "border-color", "border-width", "background", "background-color", "text-decoration"];
  // Palabras que NO pintan nada. `outline: none` es el borrador de indicadores más
  // extendido que hay: si contase como indicador, la regla `*:focus{outline:none}`
  // —que es justo la que quita el foco visible— daría «cumple-parcial» en toda la
  // página. `outline-offset` no está en la lista de arriba por lo mismo: desplaza
  // un contorno, no lo dibuja.
  const NULOS = ["none", "hidden", "0", "0px", "transparent", "initial", "unset", "revert", "medium", "currentcolor"];

  /* ── 2.4.7: qué es un indicador de foco que SE VE ──────────────────────────
   *
   * La comparación era una cadena: `outlineStyle|outlineWidth|outlineColor||
   * boxShadow||borderColor` antes y después de enfocar, y cualquier diferencia
   * textual contaba como indicador visible. Con eso, cinco indicadores literalmente
   * invisibles salían los cinco «pasa · cambio visible al enfocar»:
   *
   *     #a:focus{ outline: 2px solid transparent }
   *     #b:focus{ outline: 3px solid rgba(0,0,0,0) }
   *     #c:focus{ box-shadow: 0 0 0 3px rgba(0,0,0,0) }
   *     #d:focus{ border-color: #fff }        (sobre fondo blanco)
   *     #e:focus{ outline: 1px solid #fff }   (sobre fondo blanco)
   *
   * Un cambio que no se ve no es un indicador, y declararlo conforme es lo contrario
   * de lo que hace este motor. Así que se mira cada canal por separado: que tenga
   * tamaño, que su color tenga alfa, y que no sea del mismo color que lo que hay
   * detrás. De paso se recogen dos canales que la firma anterior no miraba —el fondo
   * y la decoración del texto—, con lo que un foco que solo cambia el fondo deja de
   * pasar desapercibido.
   */
  function coloresDe(s) {
    const out = [];
    const re = /rgba?\(([^)]+)\)/g;
    let m;
    while ((m = re.exec(String(s || "")))) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
      out.push({ r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p.length > 3 ? p[3] : 1 });
    }
    return out;
  }
  function mismoColor(a, b) {
    return a && b && a.r === b.r && a.g === b.g && a.b === b.b;
  }
  function aparienciaFoco(cs) {
    return {
      outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) || 0, outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow,
      borderColor: cs.borderTopColor + "/" + cs.borderRightColor + "/" + cs.borderBottomColor + "/" + cs.borderLeftColor,
      borderWidth: (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0) + (parseFloat(cs.borderLeftWidth) || 0),
      background: cs.backgroundColor, backgroundImage: cs.backgroundImage,
      color: cs.color,
      decoracion: (cs.textDecorationLine || "") + " " + (cs.textDecorationThickness || "")
    };
  }
  /** @returns {{visible:boolean, via:string, motivo:string}} */
  function indicadorDeFoco(base, foc, el, win) {
    if (!foc) return { visible: false, via: "", motivo: "no se pudo leer el estado con el foco puesto" };
    // Fondo contra el que se dibuja el indicador: el del PADRE, porque el contorno
    // se pinta justo fuera de la caja del elemento.
    const detras = bgBehind(el.parentElement || el, win);
    const nulos = [];

    // 1) Contorno.
    const oc = coloresDe(foc.outlineColor)[0];
    const hayContorno = foc.outlineStyle !== "none" && foc.outlineStyle !== "hidden" && foc.outlineWidth > 0;
    if (hayContorno) {
      if (!oc || oc.a === 0) nulos.push("el contorno es transparente (" + foc.outlineColor + ")");
      else if (mismoColor(oc, detras)) nulos.push("el contorno es del mismo color que el fondo de detrás (" + foc.outlineColor + ")");
      else return { visible: true, via: "contorno", motivo: "contorno de " + foc.outlineWidth + "px en " + foc.outlineColor };
    } else if (base && (base.outlineStyle !== foc.outlineStyle || base.outlineWidth !== foc.outlineWidth)) {
      nulos.push("el contorno cambia pero queda sin grosor o con estilo «" + foc.outlineStyle + "»");
    }

    // 2) Sombra.
    if (foc.boxShadow && foc.boxShadow !== "none" && (!base || foc.boxShadow !== base.boxShadow)) {
      const conAlfa = coloresDe(foc.boxShadow).filter(function (c) { return c.a > 0 && !mismoColor(c, detras); });
      if (conAlfa.length) return { visible: true, via: "sombra", motivo: "box-shadow visible (" + String(foc.boxShadow).slice(0, 60) + ")" };
      nulos.push("la sombra no se ve: " + String(foc.boxShadow).slice(0, 60));
    }

    // 3) Borde.
    if (base && foc.borderColor !== base.borderColor && foc.borderWidth > 0) {
      const bc = coloresDe(foc.borderColor).filter(function (c) { return c.a > 0 && !mismoColor(c, detras); });
      if (bc.length) return { visible: true, via: "borde", motivo: "el borde cambia a " + foc.borderColor.split("/")[0] };
      nulos.push("el borde cambia a un color que no se distingue del fondo (" + foc.borderColor.split("/")[0] + ")");
    }

    // 4) Fondo y 5) texto: canales que la firma anterior no miraba.
    if (base && (foc.background !== base.background || foc.backgroundImage !== base.backgroundImage)) {
      const fc = coloresDe(foc.background)[0];
      if ((foc.backgroundImage && foc.backgroundImage !== "none" && foc.backgroundImage !== base.backgroundImage) || (fc && fc.a > 0)) {
        return { visible: true, via: "fondo", motivo: "el fondo cambia a " + foc.background };
      }
      nulos.push("el fondo cambia a algo que no se ve (" + foc.background + ")");
    }
    if (base && (foc.color !== base.color || foc.decoracion !== base.decoracion)) {
      return { visible: true, via: "texto", motivo: "cambia el color o la decoración del texto" };
    }

    return { visible: false, via: "", motivo: nulos.length ? nulos.join("; ") : "no cambia ninguna propiedad al enfocar" };
  }
  // Hacia ABAJO, siempre. Con `toFixed(2)`, un 4.4995 se imprimía «4.50:1 (mín
  // 4.5:1)» junto al veredicto «revisar»: una contradicción en el informe que
  // invita a que el revisor lo suba a conforme.
  function ratioTxt(x) { return (Math.floor(x * 100) / 100).toFixed(2); }
  function pinta(valor) {
    const t = String(valor || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!t.length) return false;
    for (let i = 0; i < t.length; i++) if (NULOS.indexOf(t[i]) === -1) return true;
    return false;
  }
  function reglasDeFoco(el, doc) {
    let encontradas = 0, bloqueadas = 0, conIndicador = 0;
    const ejemplos = [];
    const hojas = doc.styleSheets || [];
    for (let i = 0; i < hojas.length; i++) {
      let reglas = null;
      try { reglas = hojas[i].cssRules; } catch (e) { bloqueadas++; continue; }
      if (!reglas) continue;
      const pila = [reglas];
      while (pila.length) {
        const lista = pila.pop();
        for (let j = 0; j < lista.length; j++) {
          const r = lista[j];
          // OJO: en Chrome moderno una CSSStyleRule TAMBIÉN tiene `cssRules` (CSS
          // anidado). Con un `if (r.cssRules) { bajar; continue; }` se saltarían
          // todas las reglas normales sin dar ningún error.
          const sel = r.selectorText;
          if (sel && /:focus/i.test(sel) && coincideSinFoco(el, sel)) {
            encontradas++;
            for (let k = 0; k < PROP_INDICADOR.length; k++) {
              if (r.style && pinta(r.style.getPropertyValue(PROP_INDICADOR[k]))) {
                conIndicador++;
                if (ejemplos.length < 2) ejemplos.push(sel.trim().slice(0, 80));
                break;
              }
            }
          }
          if (r.cssRules && r.cssRules.length) pila.push(r.cssRules);
        }
      }
    }
    return { encontradas: encontradas, conIndicador: conIndicador, hojasBloqueadas: bloqueadas, ejemplos: ejemplos };
  }
  /**
   * ¿El selector, quitándole las pseudoclases de foco, alcanza a este elemento?
   *
   * El recorte va carácter a carácter y no con una expresión regular porque en
   * Tailwind el propio nombre de clase lleva el prefijo escapado
   * (`.focus-visible\:outline-2:focus-visible`): una regex ingenua destroza la
   * clase y el selector deja de coincidir con nada.
   */
  function sinPseudoFoco(sel) {
    let out = "", i = 0;
    while (i < sel.length) {
      const c = sel[i];
      if (c === "\\") { out += sel[i] + (sel[i + 1] || ""); i += 2; continue; }
      if (c === ":") {
        const resto = sel.slice(i);
        const m = /^:focus(-visible|-within)?/.exec(resto);
        if (m) { i += m[0].length; continue; }
      }
      out += c; i++;
    }
    return out;
  }
  function coincideSinFoco(el, sel) {
    const partes = sinPseudoFoco(sel).split(",");
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i].trim();
      // Vacío = el selector era SOLO la pseudoclase, o sea universal. Chrome
      // normaliza `*:focus` a `:focus` en `selectorText`, así que descartar los
      // vacíos dejaba fuera precisamente las reglas que alcanzan a toda la página.
      if (!p) return true;
      try { if (el.matches(p)) return true; } catch (e) {}
    }
    return false;
  }
  /**
   * Ruta CSS única, en el mismo formato que usan la capa dinámica, la de píxeles y
   * el motor. El nombre legible (`locatorM`) no identifica: dos botones sin id ni
   * clase son los dos «button», y el informe no puede decir a cuál se refiere.
   */
  /* Recorre el árbol ENTERO, entrando en los shadow roots abiertos.
   *
   * Todos los barridos usaban `doc.querySelectorAll(...)`, que se detiene en la
   * frontera de un shadow root: el contenido de un componente web no se medía, y en un
   * sitio hecho con componentes eso puede ser la página entera. El contraste, el tamaño
   * de los objetivos, el foco visible y el orden de foco de todo eso quedaban sin
   * comprobar — antes sin decirlo, y desde la cuarta tanda al menos declarado.
   *
   * Aquí se mide de verdad. Un shadow root CERRADO sigue siendo inalcanzable (no hay
   * nada que mirar desde fuera) y se declara aparte, como los marcos de otro origen.
   *
   * Ojo al selector: dentro de un shadow root no hay `body`, así que un `body *` del
   * documento se convierte en `*` en cada raíz sombra.
   */
  function todosM(raiz, sel) {
    const out = [];
    const visto = [];
    const selDe = function (r) {
      if (r.nodeType === 9) return sel;                       // documento
      return sel.replace(/\bbody\s+/g, "").replace(/^body$/, "*");
    };
    const visitar = function (r, prof) {
      if (!r || !r.querySelectorAll || prof > 8) return;
      if (visto.indexOf(r) !== -1) return;
      visto.push(r);
      const l = r.querySelectorAll(selDe(r));
      for (let i = 0; i < l.length; i++) out.push(l[i]);
      const todos = r.querySelectorAll("*");
      for (let j = 0; j < todos.length; j++) {
        if (todos[j].shadowRoot) visitar(todos[j].shadowRoot, prof + 1);
      }
    };
    visitar(raiz, 0);
    return out;
  }
  /* ¿Está enfocado este elemento, esté donde esté?
   *
   * `document.activeElement` se detiene en la FRONTERA: cuando el foco está en un botón
   * dentro de un shadow root, `document.activeElement` es el HOST, no el botón. En
   * cuanto los barridos empezaron a entrar en los shadow roots, comparar contra
   * `doc.activeElement` producía un 2.1.1 «no recibe foco con Tab» sobre botones
   * perfectamente enfocables — una barrera inventada por el propio arreglo, y de las
   * graves. El foco de verdad se sigue bajando por `shadowRoot.activeElement`. */
  function enfocadoM(doc, el) {
    let a = doc.activeElement;
    for (let i = 0; i < 8 && a; i++) {
      if (a === el) return true;
      if (!a.shadowRoot || !a.shadowRoot.activeElement) return false;
      a = a.shadowRoot.activeElement;
    }
    return a === el;
  }
  /** Los hosts cuyo shadow root NO se puede abrir: se declaran, no se miden. */
  function shadowCerrados(doc) {
    // Un shadow root cerrado no expone `shadowRoot`, así que no se puede enumerar
    // directamente. Lo que sí se ve es un elemento personalizado (con guion en el
    // nombre) que está definido, se pinta y no tiene hijos propios ni shadowRoot
    // accesible: el contenido está ahí y no se puede alcanzar.
    return Array.prototype.slice.call(doc.querySelectorAll("*")).filter(function (el) {
      const t = el.tagName.toLowerCase();
      if (t.indexOf("-") === -1) return false;
      if (el.shadowRoot) return false;
      if (el.children && el.children.length) return false;
      return !!(el.getClientRects && el.getClientRects().length);
    });
  }
  /* La ruta cruza la frontera del shadow DOM, y lo dice con ` >> `.
   *
   * `parentElement` es `null` en el primer hijo de un shadow root —la raíz sombra es un
   * fragmento, no un elemento—, así que la ruta de un elemento de dentro salía como su
   * etiqueta a secas: no identificaba nada. Se salta al host y se marca el salto, con la
   * misma convención que usa Playwright, para que quede claro que ese selector no lo
   * resuelve un `document.querySelector` de una sola pieza. */
  function rutaM(el) {
    const tramos = [];
    let parts = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const t = n.tagName.toLowerCase();
      if (t === "html" || t === "body") break;
      const p = n.parentElement;
      if (!p) {
        const padre = n.parentNode;
        // ¿Es la raíz de un shadow root? Entonces se sigue por el host.
        if (padre && padre.nodeType === 11 && padre.host) {
          parts.unshift(t);
          tramos.unshift(parts.join(" > "));
          parts = [];
          n = padre.host;
          continue;
        }
        parts.unshift(t);
        break;
      }
      let i = 1, sib = p.firstElementChild;
      while (sib && sib !== n) { if (sib.tagName === n.tagName) i++; sib = sib.nextElementSibling; }
      parts.unshift(t + ":nth-of-type(" + i + ")");
      n = p;
    }
    const base = parts.length ? "html > body > " + parts.join(" > ") : "body";
    return tramos.length ? base + " >> " + tramos.join(" >> ") : base;
  }
  /**
   * 1.4.1 Uso del color: un enlace dentro de un párrafo distinguido SOLO por color.
   *
   * Es el caso clásico del criterio y es perfectamente medible: si un `<a>` va
   * embebido en texto corrido y lo único que lo separa de ese texto es el color
   * —sin subrayado, sin negrita, sin borde, sin fondo, sin icono—, quien no
   * distingue ese color no ve que hay un enlace. Se compara contra el texto que lo
   * rodea, que es exactamente lo que mira una persona auditando.
   *
   * Lo que esta comprobación NO decide: si el color es el único medio en una
   * leyenda, un gráfico o un estado de formulario. Eso sigue siendo juicio humano,
   * y el veredicto lo dice en vez de callarlo.
   */
  function distintivoDeEnlace(a, win) {
    const cs = win.getComputedStyle(a);
    const dec = String(cs.textDecorationLine || cs.textDecoration || "");
    if (dec.indexOf("underline") !== -1 || dec.indexOf("line-through") !== -1 || dec.indexOf("overline") !== -1) return "subrayado";
    const padre = a.parentElement;
    if (!padre) return null;
    const pcs = win.getComputedStyle(padre);
    const num = function (v) { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
    if (num(cs.fontWeight) >= num(pcs.fontWeight) + 100) return "grosor de letra";
    if (cs.fontStyle !== pcs.fontStyle) return "cursiva";
    if (cs.fontFamily !== pcs.fontFamily) return "otra tipografía";
    if (num(cs.fontSize) !== num(pcs.fontSize)) return "otro tamaño";
    if (pinta(cs.borderBottomWidth) && cs.borderBottomStyle !== "none") return "borde inferior";
    if (pinta(cs.backgroundColor) && cs.backgroundColor !== pcs.backgroundColor) return "fondo propio";
    if (cs.backgroundImage && cs.backgroundImage !== "none") return "imagen de fondo (¿subrayado dibujado?)";
    if (pinta(cs.outlineWidth) && cs.outlineStyle !== "none") return "contorno";
    if (pinta(cs.boxShadow)) return "sombra";
    if (a.querySelector && a.querySelector("img,svg,[class*=icon],[class*=icono]")) return "icono";
    /* La técnica G183, que es SUFICIENTE para 1.4.1 y no se estaba mirando.
     *
     * «Using a contrast ratio of 3:1 with surrounding text and providing additional
     * visual cues on focus for links or controls where color alone is used to identify
     * them»: si el enlace contrasta 3:1 con el texto que lo rodea Y cambia de aspecto
     * al recibir el foco o el puntero, el criterio se satisface. Aquí solo se miraba el
     * estado en reposo, así que un enlace que hace exactamente eso salía como `falla`
     * grave. Reproducido con `color:#0b5ed7` sobre texto `#111` (3.23:1) y un subrayado
     * en `:hover, :focus`.
     *
     * Se comprueba con la misma maquinaria que ya existe para el foco: las reglas de
     * las hojas de estilo (`reglasDeFoco`) dicen si hay señal adicional. */
    if (padre) {
      const cl = resolverColor(cs.color, a.ownerDocument);
      const ct = resolverColor(pcs.color, a.ownerDocument);
      if (cl && ct) {
        const r = contrastRatio(cl, ct);
        if (r >= 3) {
          const rf = reglasDeFoco(a, a.ownerDocument);
          if (rf && rf.conIndicador > 0) return "G183 (contraste " + r.toFixed(2) + ":1 con el texto de alrededor y señal adicional al foco)";
        }
      }
    }
    return null;
  }
  /** ¿El <a> va DENTRO de texto corrido, o es un enlace suelto (menú, botón, tarjeta)? */
  function enTextoCorrido(a) {
    const padre = a.parentElement;
    if (!padre) return false;
    const BLOQUES = ["p", "li", "td", "th", "dd", "dt", "blockquote", "figcaption", "caption", "div", "span", "section"];
    if (BLOQUES.indexOf(padre.tagName.toLowerCase()) === -1) return false;
    // Tiene que haber texto del PADRE alrededor: si el enlace es todo el contenido
    // (un menú, una tarjeta), no hay texto del que distinguirlo y el criterio no
    // aplica por esta vía.
    let alrededor = "";
    const kids = padre.childNodes || [];
    for (let i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) alrededor += kids[i].nodeValue || "";
    return alrededor.replace(/\s+/g, " ").trim().length >= 10;
  }
  /**
   * 2.4.11 Foco no oscurecido: ¿tapa algo al elemento que acaba de recibir el foco?
   *
   * Es el criterio nuevo de WCAG 2.2 que más se incumple sin querer: una cabecera
   * `position:sticky`, una barra de cookies fija al pie o un chat flotante tapan el
   * control enfocado cuando llegas a él tabulando, y nadie se entera porque con el
   * ratón nunca pasa. Se mide con lo que ya hay: el rect del elemento enfocado
   * contra los rects de lo que está fijo, comprobando además que de verdad se pinta
   * por encima.
   */
  function elementosFlotantes(doc, win) {
    const out = [];
    const todos = todosM(doc, "body *");
    for (let i = 0; i < todos.length && out.length < 30; i++) {
      const el = todos[i];
      const cs = win.getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) continue;
      if (cs.pointerEvents === "none") continue;   // decorativo: no tapa de verdad
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      out.push({ el: el, rect: r, z: parseInt(cs.zIndex, 10) || 0, loc: locatorM(el) });
    }
    return out;
  }
  /* El rect de un flotante se vuelve a leer después de desplazar.
   *
   * Un `position:fixed` no se mueve con el scroll, pero un `sticky` sí, y el rect
   * guardado al cargar deja de valer en cuanto la medición de 2.4.11 desplaza la página
   * para poner el foco donde de verdad estará al tabular. */
  function refrescar(f) {
    try { return f.el.getBoundingClientRect(); } catch (e) { return f.rect; }
  }
  /** Cuánto del rect del control queda tapado por un flotante, de 0 a 1. */
  function fraccionTapada(rc, flot) {
    const area = Math.max(1, rc.width * rc.height);
    const x = Math.max(0, Math.min(rc.right, flot.right) - Math.max(rc.left, flot.left));
    const y = Math.max(0, Math.min(rc.bottom, flot.bottom) - Math.max(rc.top, flot.top));
    return (x * y) / area;
  }
  /**
   * 2.2.2 Poner en pausa, detener u ocultar.
   *
   * El criterio habla de contenido que se mueve, parpadea o se desplaza **más de
   * cinco segundos** y arranca solo. Eso es medible: una animación CSS con
   * `animation-iteration-count: infinite`, un `<marquee>`, o un vídeo con
   * `autoplay loop`. Lo que NO se puede medir desde aquí es si existe un botón de
   * pausa en algún sitio de la página, así que el veredicto es `revisar` con los
   * elementos señalados — salvo el `<marquee>`, que no tiene control posible.
   *
   * Se respeta `prefers-reduced-motion`: si la animación ya está desactivada en la
   * medición, no se reporta. Para eso la medición corre sin esa preferencia.
   */
  function animacionesPersistentes(doc, win, limite) {
    const out = [];
    const todos = todosM(doc, "body *");
    for (let i = 0; i < todos.length && out.length < (limite || 25); i++) {
      const el = todos[i];
      if (!renderedM(el, win)) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === "marquee" || tag === "blink") {
        out.push({ loc: locatorM(el), ruta: rutaM(el), motivo: "<" + tag + ">", control: false });
        continue;
      }
      const cs = win.getComputedStyle(el);
      const nombre = String(cs.animationName || "none");
      if (nombre === "none" || !nombre) continue;
      const iter = String(cs.animationIterationCount || "1");
      const dur = String(cs.animationDuration || "0s").split(",")[0];
      const seg = parseFloat(dur) * (/ms$/.test(dur.trim()) ? 0.001 : 1);
      const play = String(cs.animationPlayState || "running");
      if (play === "paused") continue;
      const infinita = iter.split(",").some(function (x) { return x.trim() === "infinite"; });
      // Infinita, o una sola pasada que ya dura más de 5 s: los dos casos del
      // criterio. Una transición corta de hover no entra aquí.
      const total = infinita ? Infinity : seg * (parseFloat(iter) || 1);
      if (!infinita && !(total > 5)) continue;
      out.push({
        loc: locatorM(el), ruta: rutaM(el),
        motivo: "animación «" + nombre.split(",")[0] + "» " + (infinita ? "infinita" : "de " + total.toFixed(1) + " s"),
        control: null
      });
    }
    // Vídeos que arrancan solos y se repiten: se mueven más de 5 s por definición.
    todosM(doc, "video[autoplay]").forEach(function (v) {
      if (!renderedM(v, win)) return;
      if (!v.hasAttribute("loop")) return;
      out.push({ loc: locatorM(v), ruta: rutaM(v), motivo: "vídeo con autoplay y loop", control: v.hasAttribute("controls") });
    });
    return out;
  }
  function locatorM(el) {
    const propio = function (e) {
      const tag = e.tagName.toLowerCase();
      if (e.id) return tag + "#" + e.id;
      const cls = (e.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
      if (cls) return tag + "." + cls;
      return tag;
    };
    /* Y dice DENTRO DE QUÉ vive, cuando está en un shadow DOM.
     *
     * «p» a secas no le sirve de nada a quien tiene que ir a buscarlo: en un sitio de
     * componentes hay veinte. Con el componente delante —«mi-tarjeta >> p»— se sabe
     * dónde mirar, y se ve de un vistazo que la barrera está dentro de un componente. */
    const hosts = [];
    let n = el;
    for (let i = 0; i < 8; i++) {
      const raiz = n.getRootNode ? n.getRootNode() : null;
      if (!raiz || raiz.nodeType !== 11 || !raiz.host) break;
      hosts.unshift(propio(raiz.host));
      n = raiz.host;
    }
    return hosts.length ? hosts.join(" >> ") + " >> " + propio(el) : propio(el);
  }
  // ¿Está pintado? Sin caja ni visibilidad no hay nada que medir (ni que enfocar).
  function renderedM(el, win) {
    if (!el.getClientRects || !el.getClientRects().length) return false;
    const cs = win.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  // Deshabilitado de verdad: no es un fallo de teclado que no reciba el foco.
  function disabledM(el) {
    if (el.disabled === true || el.hasAttribute("disabled")) return true;
    if (el.closest && el.closest("fieldset[disabled],[inert]")) return true;
    return false;
  }
  /**
   * Elemento gestionado por un widget compuesto (tabs, listbox, menu, tree, grid,
   * radiogroup, toolbar). Ahí `tabindex="-1"` es el patrón CORRECTO de foco móvil
   * (roving tabindex): el contenedor recibe Tab y las flechas mueven el foco. Marcar
   * 2.1.1 falla en esos hijos era un falso positivo sistemático.
   */
  const MANAGED_PARENT = "[role=tablist],[role=listbox],[role=menu],[role=menubar],[role=tree],[role=grid],[role=treegrid],[role=radiogroup],[role=toolbar],[role=combobox]";
  function managedM(el) {
    const role = (el.getAttribute("role") || "").split(/\s+/)[0];
    const MI = ["tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "row", "gridcell", "radio"];
    if (MI.indexOf(role) !== -1 && el.closest && el.closest(MANAGED_PARENT)) return true;
    return false;
  }
  // Dónde hay texto de verdad dentro de un control: él mismo, o sus descendientes
  // con texto propio (un <button><span>Guardar</span></button> pinta en el span).
  function textTargets(el) {
    if (ownText(el)) return [el];
    const out = [];
    const kids = el.querySelectorAll ? el.querySelectorAll("*") : [];
    for (let i = 0; i < kids.length && out.length < 3; i++) if (ownText(kids[i])) out.push(kids[i]);
    return out;
  }
  function runChecksReal(doc, win, limit) {
    limit = limit || 400;
    const res = [];
    const sel = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[role],[tabindex],[onclick]';
    // Filtrar ANTES de recortar: con `.slice(0, limit)` primero, un encabezado con
    // role= o cien divs con tabindex consumían el cupo y los controles reales se
    // quedaban fuera de la medición sin que nadie se enterase.
    const candidatos = todosM(doc, sel).filter(isInteractiveM);
    const all = candidatos.slice(0, limit);
    const truncado = candidatos.length > all.length;
    const focusables = [];
    // Deduplicación por IDENTIDAD del elemento, no por el texto del locator: el
    // mismo <span> se nombra «button › span» en la pasada de controles y «span» en
    // la de texto, y con claves de texto se medía dos veces.
    const medidos = new Set();
    // Si el documento no tiene el foco del sistema, `:focus` NO se aplica por mucho
    // que `el.focus()` mueva `activeElement`: la comparación de estilos sale igual
    // siempre. Se decide una sola vez para toda la pasada y 2.4.7 cambia de vía.
    let docEnfocado = true;
    try { if (typeof doc.hasFocus === "function") docEnfocado = doc.hasFocus(); } catch (e) {}
    let porCss = 0, sinRegla = 0, hojasBloqueadas = 0;
    // Lo que flota por encima, una sola vez: se consulta por cada control enfocado.
    const flotantes = elementosFlotantes(doc, win);
    all.forEach(function (el) {
      const loc = locatorM(el);
      // Se sella al final del bloque en vez de repetir `path:` en las quince
      // inserciones de este bucle: menos sitios donde olvidarlo.
      const desde = res.length, ruta = rutaM(el);
      const pintado = renderedM(el, win);
      const deshabilitado = disabledM(el);
      const gestionado = managedM(el);
      const tiRaw = el.getAttribute("tabindex");
      const ti = tiRaw == null ? 0 : parseInt(tiRaw, 10);

      // 2.1.1 solo tiene sentido sobre controles operables y presentes.
      if (!pintado) {
        // `revisar`, no `pasa`: el propio texto dice «fuera del alcance». Los
        // controles de un menú, un modal o un acordeón cerrados al cargar son lo
        // normal, y declararlos conformes daba 2.1.1 por comprobado sin tabular.
        res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "revisar", detail: "no está renderizado ahora mismo (menú, modal o acordeón cerrado): esta medición no lo alcanza. Ábrelo y vuelve a medir, o compruébalo a mano" });
      } else if (deshabilitado) {
        res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "deshabilitado: no debe recibir el foco" });
      } else if (ti < 0) {
        // OJO: `el.focus()` SÍ enfoca un tabindex="-1" — es foco programático. Si se
        // usara la sonda de foco aquí, 2.1.1 saldría «pasa» sobre un control que el
        // tabulador no alcanza jamás. El atributo manda antes que la sonda.
        if (gestionado) {
          res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "hijo de un widget compuesto con foco móvil (roving tabindex): lo gobierna el contenedor, verifica las flechas" });
        } else {
          res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "revisar", detail: "tabindex=\"-1\": solo foco programático, el tabulador no lo alcanza. Comprueba que haya otra forma de operarlo con teclado" });
        }
      } else {
        const base = aparienciaFoco(win.getComputedStyle(el));
        let focusable = false, foc = null;
        try {
          el.focus({ preventScroll: true });
          focusable = enfocadoM(doc, el);
          foc = aparienciaFoco(win.getComputedStyle(el));
          if (el.blur) el.blur();
        } catch (e) {}
        res.push(focusable
          ? { crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "recibe el foco" }
          : { crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "falla", detail: "no recibe foco con Tab" });
        if (focusable) {
          // El RECT viaja con el control: sin él no se puede comparar el orden de
          // tabulación con el orden visual, que es de lo que habla 2.4.3.
          focusables.push({ loc: loc, ti: ti, path: ruta, rect: el.getBoundingClientRect(), texto: (el.textContent || "").replace(/[\s\u00a0]+/g, " ").trim().slice(0, 24) });
          // 2.4.11: con el foco puesto, ¿lo tapa algo fijo?
          if (flotantes.length) {
            /* El rect se lee CON la página desplazada, como cuando se tabula.
             *
             * El foco se ponía con `preventScroll: true` y el rect se leía en la
             * posición de scroll de la carga, así que los controles de más abajo se
             * medían con unas coordenadas que no son las que tendrán cuando el foco
             * llegue a ellos: la intersección con la barra fija salía 0 y la barrera no
             * se emitía. Medido: el último enlace de una página de 2000 px queda tapado
             * al 100 % por la barra de cookies al tabular hasta él, y no se decía nada.
             *
             * Aquí sí se desplaza —es lo que hace el navegador al tabular— y después se
             * devuelve el scroll a donde estaba, para no mover el suelo de las demás
             * comprobaciones. */
            const scrollX0 = win.scrollX, scrollY0 = win.scrollY;
            try { if (el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
            const rc = el.getBoundingClientRect();
            if (rc.width > 0 && rc.height > 0) {
              /* Primero se descarta lo que NO se pinta encima, y después se elige el peor.
               *
               * Al revés no sirve: una marca de agua `fixed; inset:0; z-index:-1` tapa el
               * 100 % de cualquier rectángulo, así que ganaba siempre la elección del
               * «peor» y se llevaba por delante la comprobación de pintado —el hallazgo
               * salía culpando a la marca incluso donde había un tapado de verdad—.
               *
               * Quién se pinta encima lo dice `elementFromPoint` en un punto DENTRO de
               * la intersección, que es donde el tapado ocurriría. */
              const tapan = [];
              flotantes.forEach(function (f) {
                if (f.el === el || f.el.contains(el)) return;   // está DENTRO del flotante: no lo tapa
                const fr = refrescar(f);
                const t = fraccionTapada(rc, fr);
                if (t <= 0.02) return;
                const ix = Math.min(Math.max(rc.left, fr.left) + 2, Math.min(rc.right, fr.right) - 1);
                const iy = Math.min(Math.max(rc.top, fr.top) + 2, Math.min(rc.bottom, fr.bottom) - 1);
                if (ix < 0 || iy < 0 || ix >= (win.innerWidth || 0) || iy >= (win.innerHeight || 0)) return;
                let arriba = null;
                try { arriba = doc.elementFromPoint(ix, iy); } catch (e) { arriba = null; }
                // Solo cuenta si lo que se pinta ahí es el flotante (o algo suyo).
                if (!arriba) return;
                if (arriba !== f.el && !f.el.contains(arriba)) return;
                tapan.push({ f: f, t: t });
              });
              let peor = null, frac = 0;
              tapan.forEach(function (x) { if (x.t > frac) { frac = x.t; peor = x.f; } });
              /* Y que de verdad se pinte ENCIMA, no solo que los rectángulos se cruzen.
               *
               * El comentario de `elementosFlotantes` decía que se comprobaba «que de
               * verdad se pinta por encima», y no se comprobaba: `z` se recogía y no se
               * leía nunca. Una marca de agua `position:fixed; inset:0; z-index:-1`
               * —que se pinta DETRÁS de todo— cruzaba su rectángulo con cualquier
               * control y producía un 2.4.11 `falla` grave por cada uno. Medido: tres
               * barreras graves inventadas en una página correcta, y
               * `document.elementFromPoint` devolviendo el propio enlace.
               *
               * El orden de pintado real lo dice `elementFromPoint`, y es lo que hay
               * que creer, no la aritmética de rectángulos. */
              if (peor && frac >= 0.999) {
                res.push({ crit: "2.4.11", label: "Foco no oscurecido", node: loc, path: ruta, verdict: "falla",
                  detail: "al recibir el foco queda COMPLETAMENTE tapado por «" + peor.loc + "» (" + win.getComputedStyle(peor.el).position + "): tabulando hasta aquí no se ve dónde está el foco" });
              } else if (peor && frac > 0.02) {
                res.push({ crit: "2.4.11", label: "Foco no oscurecido", node: loc, path: ruta, verdict: "revisar",
                  detail: "al recibir el foco queda tapado un " + Math.round(frac * 100) + " % por «" + peor.loc + "» (" + win.getComputedStyle(peor.el).position + "). El mínimo de 2.4.11 solo exige que no se oculte por completo, pero compruébalo" });
              }
            }
            // El suelo se devuelve donde estaba: las demás comprobaciones miden sobre
            // la misma página, y moverla por debajo sería medir otra cosa.
            try { win.scrollTo(scrollX0, scrollY0); } catch (e) {}
          }
          const ind = indicadorDeFoco(base, foc, el, win);
          const changed = ind.visible;
          if (docEnfocado || changed) {
            /* Y si algo cambió pero no se ve, eso es una medición CONCLUYENTE de que
             * no hay indicador: `falla`, no `revisar`. La duda se reserva para cuando
             * no cambia nada y puede estar en `:focus-visible` o en una hoja que no se
             * ha podido leer. */
            const cambioInvisible = !ind.visible && foc && JSON.stringify(foc) !== JSON.stringify(base);
            res.push(changed
              ? { crit: "2.4.7", label: "Foco visible", node: loc, path: ruta, verdict: "pasa", detail: "indicador visible al enfocar: " + ind.motivo }
              : cambioInvisible
                ? { crit: "2.4.7", label: "Foco visible", node: loc, path: ruta, verdict: "falla",
                    detail: "al enfocar cambia el estilo pero el indicador NO se ve: " + ind.motivo + ". Tabulando hasta aquí no se sabe dónde está el foco" }
                : { crit: "2.4.7", label: "Foco visible", node: loc, path: ruta, verdict: "revisar", detail: "sin cambio medible (revisar a ojo / :focus-visible)" });
          } else {
            const rf = reglasDeFoco(el, doc);
            hojasBloqueadas = Math.max(hojasBloqueadas, rf.hojasBloqueadas);
            const aviso = rf.hojasBloqueadas ? " Además, " + rf.hojasBloqueadas + " hoja(s) de estilo de otro origen no se han podido leer, así que puede haber reglas de foco fuera de alcance." : "";
            if (rf.conIndicador) {
              porCss++;
              res.push({
                crit: "2.4.7", label: "Foco visible", node: loc, verdict: "cumple-parcial",
                detail: "el documento no tiene el foco del sistema, así que :focus no se aplica y no se ha podido medir el render. En el CSS sí hay " + rf.conIndicador + " regla(s) de foco que alcanzan a este elemento y pintan indicador" + (rf.ejemplos.length ? " (" + rf.ejemplos.join(" ; ") + ")" : "") + ": la presencia está, falta comprobar a ojo que se vea y contraste lo suficiente." + aviso
              });
            } else {
              sinRegla++;
              res.push({
                crit: "2.4.7", label: "Foco visible", node: loc, verdict: "revisar",
                detail: "el documento no tiene el foco del sistema, así que :focus no se aplica y no se ha podido medir el render; tampoco se ha encontrado ninguna regla CSS de foco que alcance a este elemento. Compruébalo a ojo tabulando." + aviso
              });
            }
          }
        }
      }

      if (pintado) {
        const r = el.getBoundingClientRect(), w = r.width, h = r.height;
        if (w > 0 && h > 0 && !deshabilitado) {
          // Sobre el valor CRUDO: con `Math.round`, un objetivo de 23.59 px salía
          // «24×24 px (≥ 24×24) pasa» — un aprobado con una medida inventada.
          const ok = (w >= 24 && h >= 24);
          const fmt = function (n) { return (Math.round(n * 100) / 100) + ""; };
          res.push({ crit: "2.5.8", label: "Tamaño del objetivo", node: loc, verdict: ok ? "pasa" : "revisar", detail: fmt(w) + "×" + fmt(h) + " px" + (ok ? " (≥ 24×24)" : " (< 24×24)") });
        }
        textTargets(el).forEach(function (t) {
          const c = contrastOf(t, win);
          if (!c) return;
          const tl = (t === el) ? loc : loc + " › " + locatorM(t);
          const rt = rutaM(t);
          if (medidos.has(t)) return;
          medidos.add(t);
          if (c.undetermined) {
            res.push({ crit: "1.4.3", label: "Contraste del texto", node: tl, path: rt, verdict: "revisar", detail: c.motivo || "fondo con imagen o degradado: no medible automáticamente" });
          } else {
            const min = c.large ? 3 : 4.5, ok = c.ratio >= min, lc = Math.round(Math.abs(c.lc));
            const apca = " · APCA Lc " + lc + (lc >= c.lcMin ? " (≥ " + c.lcMin + ", ok en el borrador de WCAG 3)" : " (< " + c.lcMin + ", orientativo)");
            res.push({
              crit: "1.4.3", label: "Contraste del texto", node: tl, path: rt,
              verdict: ok ? "pasa" : (c.ratio >= min - 1 ? "revisar" : "falla"),
              detail: "ratio " + ratioTxt(c.ratio) + ":1" + (c.large ? " (texto grande, mín 3:1)" : " (mín 4.5:1)") + apca + " — " + c.fg + " sobre " + c.bg
            });
          }
        });
        // 1.4.11 solo para controles personalizados: en los nativos el límite lo
        // pinta el navegador y medirlo sobre el render no dice nada útil.
        if (NATIVOS.indexOf(el.tagName.toLowerCase()) === -1 && !deshabilitado) {
          const nc = boundaryContrastOf(el, win);
          if (nc) res.push({ crit: "1.4.11", label: "Contraste no textual", node: loc, verdict: nc.ratio >= 3 ? "pasa" : "revisar", detail: "límite del control " + nc.ratio.toFixed(2) + ":1 (mín 3:1) — " + nc.fg + " sobre " + nc.bg });
        }
      }
      for (let k = desde; k < res.length; k++) if (!res[k].path) res[k].path = ruta;
    });
    /* ── 2.2.2 Poner en pausa, detener u ocultar ── */
    const animadas = animacionesPersistentes(doc, win, 25);
    animadas.forEach(function (a) {
      res.push(a.control === false && /marquee|blink/.test(a.motivo)
        ? { crit: "2.2.2", label: "Poner en pausa, detener, ocultar", node: a.loc, path: a.ruta, verdict: "falla",
            detail: a.motivo + " se desplaza solo y no ofrece ningún mecanismo para pararlo: el elemento no admite controles" }
        : { crit: "2.2.2", label: "Poner en pausa, detener, ocultar", node: a.loc, path: a.ruta, verdict: "revisar",
            detail: a.motivo + ", arranca sola y dura más de 5 s" + (a.control === true ? ", aunque el elemento ofrece controles" : "") +
              ". 2.2.2 exige un mecanismo para pausarla, detenerla u ocultarla; desde aquí no se puede saber si existe en otro punto de la página" });
    });

    /* ── 1.4.1 Uso del color: enlaces en texto distinguidos solo por color ── */
    const enlacesEnTexto = todosM(doc, "a[href]")
      .filter(function (a) { return renderedM(a, win) && ownText(a) && enTextoCorrido(a); })
      .slice(0, limit);
    const soloColor = [], conDistintivo = [];
    enlacesEnTexto.forEach(function (a) {
      const d = distintivoDeEnlace(a, win);
      /* Y se mide el contraste enlace↔texto, porque la evidencia lo AFIRMABA sin
       * mirarlo: decía «sin ningún distintivo salvo el color» también cuando el enlace
       * tiene EXACTAMENTE el mismo color que el texto de alrededor. Medido: 1.00:1, o
       * sea que ahí el color no distingue nada y la frase era falsa — y el caso es peor,
       * no mejor, porque no hay ni siquiera un color del que fiarse. */
      const pa = a.parentElement;
      const cl = resolverColor(win.getComputedStyle(a).color, a.ownerDocument);
      const ct = pa ? resolverColor(win.getComputedStyle(pa).color, a.ownerDocument) : null;
      const rTxt = (cl && ct) ? contrastRatio(cl, ct) : null;
      (d ? conDistintivo : soloColor).push({ loc: locatorM(a), ruta: rutaM(a), texto: ownText(a).slice(0, 40), distintivo: d, rTxt: rTxt });
    });
    soloColor.slice(0, 25).forEach(function (x) {
      const niColor = x.rTxt != null && x.rTxt < 1.2;
      res.push({
        crit: "1.4.1", label: "Uso del color", node: x.loc, path: x.ruta, verdict: "falla",
        detail: niColor
          ? "enlace «" + x.texto + "» dentro de texto corrido sin NINGÚN distintivo: ni subrayado, ni grosor, ni borde, ni fondo, ni icono — y tampoco color, porque contrasta " +
            x.rTxt.toFixed(2) + ":1 con el texto que lo rodea (o sea, es del mismo color). No hay forma de saber que es un enlace"
          : "enlace «" + x.texto + "» dentro de texto corrido sin ningún distintivo salvo el color" +
            (x.rTxt != null ? " (contrasta " + x.rTxt.toFixed(2) + ":1 con el texto de alrededor)" : "") +
            ": ni subrayado, ni grosor, ni borde, ni fondo, ni icono. Quien no distinga ese color no ve que hay un enlace"
      });
    });
    if (!soloColor.length && enlacesEnTexto.length) {
      res.push({
        crit: "1.4.1", label: "Uso del color", node: enlacesEnTexto.length + " enlaces en texto", verdict: "cumple-parcial",
        detail: "los " + enlacesEnTexto.length + " enlaces embebidos en texto llevan otro distintivo además del color (" +
          Array.from(new Set(conDistintivo.map(function (x) { return x.distintivo; }))).join(", ") +
          "). Falta comprobar a ojo el resto del criterio: leyendas, gráficos, estados y cualquier instrucción que dependa del color"
      });
    }

    // 1.4.3 aplica a TODO el texto, no solo al de los controles. El barrido de
    // arriba solo recorre elementos interactivos, así que un párrafo gris claro se
    // colaba sin medir —lo pillaba axe y nosotros no—. Segunda pasada sobre los
    // bloques de texto de la página.
    const conTexto = todosM(doc, "body *").filter(function (el) { return ownText(el); });
    const textoLim = Math.min(conTexto.length, limit);
    /* El cupo se gasta en los que SE MIDEN, no en los que se descartan.
     *
     * El bucle recorría los primeros `limit` elementos de la lista y se saltaba los
     * ya medidos, los invisibles y los que no dan contraste — pero esos habían
     * gastado cupo igual. Con seis párrafos `display:none` delante, el cupo de seis
     * se agotaba sin medir ni uno y los seis visibles ilegibles de después no se
     * miraban. Y la nota de cobertura imprimía el CUPO como si fuera lo medido: «se
     * midió el contraste de 6 de 18» con cero mediciones detrás. Ni se detectaba la
     * barrera ni se avisaba: lo peor de los dos mundos. */
    let medidosAqui = 0, descartados = 0, yaMedidos = 0;
    for (let i = 0; i < conTexto.length && medidosAqui < limit; i++) {
      const el = conTexto[i];
      const loc = locatorM(el), ruta = rutaM(el);
      // Ya medido en la primera pasada (era un control): cuenta como medido, no como
      // pendiente — si no, la nota decía que quedaban por comprobar los que ya estaban.
      if (medidos.has(el)) { yaMedidos++; continue; }
      if (!renderedM(el, win)) { descartados++; continue; }
      const c = contrastOf(el, win);
      if (!c) { descartados++; continue; }
      medidos.add(el);
      medidosAqui++;
      if (c.undetermined) {
        res.push({ crit: "1.4.3", label: "Contraste del texto", node: loc, path: ruta, verdict: "revisar", detail: c.motivo || "fondo con imagen o degradado: no medible automáticamente" });
      } else {
        const min = c.large ? 3 : 4.5, ok = c.ratio >= min, lc = Math.round(Math.abs(c.lc));
        const apca = " · APCA Lc " + lc + (lc >= c.lcMin ? " (≥ " + c.lcMin + ", ok en el borrador de WCAG 3)" : " (< " + c.lcMin + ", orientativo)");
        res.push({
          crit: "1.4.3", label: "Contraste del texto", node: loc, path: ruta,
          verdict: ok ? "pasa" : (c.ratio >= min - 1 ? "revisar" : "falla"),
          detail: "ratio " + ratioTxt(c.ratio) + ":1" + (c.large ? " (texto grande, mín 3:1)" : " (mín 4.5:1)") + apca + " — " + c.fg + " sobre " + c.bg
        });
      }
    }
    /* Lo que la medición no alcanza se declara; lo que alcanza, se mide.
     *
     * Los barridos entran ya en los shadow roots ABIERTOS (ver `todosM`), así que el
     * contenido de un componente web se mide como el resto de la página y sus barreras
     * salen en el informe con su ruta cruzando la frontera («mi-tarjeta >> p»).
     *
     * Queda declarado lo que de verdad no se puede alcanzar: un shadow root CERRADO
     * —desde fuera no hay nada que mirar— y los marcos, que van en otro documento y los
     * audita `analyzeRendered` uno por uno. Un criterio que nadie ha comprobado no puede
     * parecerse a un criterio que cumple. */
    const cerrados = shadowCerrados(doc);
    const marcos = todosM(doc, "iframe,frame").filter(function (f) { return renderedM(f, win); });
    if (cerrados.length) {
      res.push({ crit: "__meta", label: "Shadow DOM cerrado", node: cerrados.length + " componente(s)", verdict: "revisar",
        detail: "hay " + cerrados.length + " componente(s) que parecen llevar un shadow root CERRADO (" +
          cerrados.slice(0, 5).map(function (el) { return locatorM(el); }).join(", ") + (cerrados.length > 5 ? ", …" : "") +
          "): su contenido no se puede inspeccionar desde fuera, así que el contraste, el tamaño de los objetivos y el foco de lo que haya dentro NO están comprobados. Compruébalo con el inspector del navegador o pídeselo a quien mantenga el componente." });
    }
    if (marcos.length) {
      res.push({ crit: "__meta", label: "Marcos: se auditan aparte", node: marcos.length + " iframe(s)", verdict: "revisar",
        detail: "hay " + marcos.length + " marco(s) pintado(s) (" +
          marcos.slice(0, 5).map(function (f) { return locatorM(f) + (f.getAttribute("src") ? " → " + String(f.getAttribute("src")).slice(0, 60) : ""); }).join(", ") +
          (marcos.length > 5 ? ", …" : "") +
          "). Esta medición recorre un solo documento: el contenido de cada marco se mide por separado, y si alguno es de otro origen no se puede medir en absoluto." });
    }

    // La nota dice lo que se midió DE VERDAD, y de cuántos.
    const cubiertos = medidosAqui + yaMedidos + descartados;
    const sinMirar = conTexto.length - cubiertos;
    if (sinMirar > 0) {
      res.push({ crit: "__meta", label: "Cobertura del contraste", node: (medidosAqui + yaMedidos) + "/" + conTexto.length, verdict: "revisar",
        detail: "se midió el contraste de " + (medidosAqui + yaMedidos) + " de " + conTexto.length + " bloques de texto con texto propio" +
          (descartados ? " (" + descartados + " más se descartaron por no estar pintados o no dar un contraste medible)" : "") +
          "; quedan " + sinMirar + " sin comprobar por el límite de la medición (" + limit + "). Súbelo para dictaminarlos." });
    }

    if (focusables.length > 1) {
      const positive = focusables.some(function (f) { return f.ti > 0; });
      // La SECUENCIA concreta, no solo el veredicto: es lo que permite comprobar de
      // un vistazo si el orden de tabulación sigue el orden visual.
      const ordenados = focusables.slice().sort(function (a, b) {
        const at = a.ti > 0 ? a.ti : Infinity, bt = b.ti > 0 ? b.ti : Infinity;
        return at - bt;
      }).slice(0, 25);
      /* 2.4.3 se COMPARA con el orden visual, que es de lo que habla el criterio.
       *
       * El único criterio de decisión era la existencia de un `tabindex` positivo:
       * sin él, `pasa` y la evidencia «sigue el orden del DOM». Pero 2.4.3 exige que
       * el orden de foco preserve el significado, y el orden del DOM y el visual se
       * separan con `flex-direction: row-reverse`, `order`, `grid-area`, `float` o
       * `position:absolute`, y nada de eso se miraba. Reproducido: una fila con
       * `row-reverse` se tabula de derecha a izquierda respecto a lo que se ve, y
       * salía «pasa».
       *
       * Se comparan las inversiones DENTRO de una misma línea visual, que es donde la
       * señal es limpia: dos controles que se solapan en vertical y cuyo orden
       * horizontal es el contrario al de tabulación. Entre líneas distintas no se
       * acusa —una barra lateral que va primero en el DOM y se pinta a la derecha es
       * una decisión de maquetación legítima, y juzgar si preserva el significado es
       * de una persona—, pero se dice cuántas hay.
       *
       * El veredicto es `revisar`, no `falla`: que el orden difiera del visual no es
       * automáticamente una barrera (el criterio habla de preservar el significado),
       * pero tampoco se puede firmar como conforme sin que alguien lo mire. */
      const rtl = (win.getComputedStyle(doc.documentElement).direction === "rtl");
      const conRect = ordenados.filter(function (f) { return f.rect && f.rect.width > 0 && f.rect.height > 0; });
      const mismaLinea = function (a, b) {
        const solape = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        return solape > Math.min(a.rect.height, b.rect.height) * 0.5;
      };
      /* Entre líneas se distingue una MAQUETACIÓN EN COLUMNAS de un salto de verdad.
       *
       * Contar cualquier salto hacia arriba como sospechoso deja el criterio a revisar
       * en media web: en dos columnas, terminar la primera y volver arriba para empezar
       * la segunda es el orden de lectura correcto, no un fallo. Lo que distingue los dos
       * casos es si los dos controles comparten espacio HORIZONTAL:
       *
       *  - no se solapan en horizontal → están en columnas distintas, y volver arriba es
       *    pasar de una columna a la siguiente. Orden de lectura normal.
       *  - sí se solapan → están en la misma columna, y el foco sube por donde ya había
       *    bajado. Ahí sí hay algo que mirar.
       *
       * Y se mide cuánto sube: un salto de unos píxeles es ruido de alineación (una
       * etiqueta y su campo que no cuadran al píxel); uno de media pantalla es otra cosa,
       * y es el que se dice con su cifra para que se pueda juzgar. */
      const vh = win.innerHeight || 800;
      const inversionesFila = [], inversionesVert = [], cambiosDeColumna = [];
      const solapanEnX = function (a, b) {
        const s = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        return s > Math.min(a.rect.width, b.rect.width) * 0.25;
      };
      for (let i = 0; i < conRect.length - 1; i++) {
        const a = conRect[i], b = conRect[i + 1];
        if (mismaLinea(a, b)) {
          const alRevés = rtl ? (b.rect.left > a.rect.left + 2) : (b.rect.left + 2 < a.rect.left);
          if (alRevés) inversionesFila.push({ a: a, b: b });
        } else if (b.rect.top + 2 < a.rect.top) {
          const sube = Math.round(a.rect.top - b.rect.top);
          if (!solapanEnX(a, b)) {
            // Columnas distintas: es el orden de lectura, no un salto.
            cambiosDeColumna.push({ a: a, b: b, sube: sube });
          } else if (sube > Math.max(24, a.rect.height * 1.5)) {
            // Misma columna y sube de verdad: eso hay que mirarlo.
            inversionesVert.push({ a: a, b: b, sube: sube, pantallas: sube / vh });
          }
        }
      }
      const nombra = function (f) { return f.loc + (f.texto ? " «" + f.texto + "»" : ""); };
      const seq = ordenados.map(function (f) { return nombra(f); });
      const cola = seq.join(" → ") + (focusables.length > 25 ? " → …" : "");
      const problemas = [];
      if (positive) problemas.push("hay un `tabindex` positivo, que altera el orden natural");
      if (inversionesFila.length) {
        problemas.push(inversionesFila.length + " salto(s) hacia atrás dentro de la misma línea visual: " +
          inversionesFila.slice(0, 4).map(function (x) { return nombra(x.a) + " → " + nombra(x.b) + ", que está a su " + (rtl ? "derecha" : "izquierda"); }).join(" · "));
      }
      if (inversionesVert.length) {
        const peorSalto = inversionesVert.reduce(function (m, x) { return x.sube > m.sube ? x : m; }, inversionesVert[0]);
        problemas.push(inversionesVert.length + " salto(s) del foco hacia ARRIBA dentro de la misma columna, por donde ya había bajado" +
          " (el mayor sube " + peorSalto.sube + " px" + (peorSalto.pantallas >= 0.5 ? ", más de media pantalla" : "") + ": " +
          nombra(peorSalto.a) + " → " + nombra(peorSalto.b) + ")");
      }
      res.push({
        crit: "2.4.3", label: "Orden de foco", node: focusables.length + " controles",
        verdict: problemas.length ? "revisar" : "pasa",
        detail: (problemas.length
          ? "el orden de tabulación no sigue el orden visual: " + problemas.join("; ") + ". Secuencia de tabulación: "
          : "la tabulación sigue el orden visual de la página (comparado línea a línea" +
            (cambiosDeColumna.length ? ", con " + cambiosDeColumna.length + " paso(s) de una columna a la siguiente, que es orden de lectura normal" : "") +
            "): ") + cola,
        // Este hallazgo no es de UN elemento, así que no lleva `path`: lleva la
        // secuencia de rutas. El nombre legible se repite («a → a → a») y por sí
        // solo no deja comprobar el orden; con las rutas sí.
        rutas: ordenados.map(function (f) { return f.path; })
      });
    }
    if (truncado) {
      res.push({ crit: "__meta", label: "Cobertura de los controles", node: all.length + "/" + candidatos.length, verdict: "revisar", detail: "se midieron " + all.length + " de " + candidatos.length + " controles (límite): el resto NO está comprobado" });
    }
    if (!docEnfocado && (porCss || sinRegla)) {
      res.push({
        crit: "__meta", label: "Foco visible sin foco del sistema", node: (porCss + sinRegla) + " controles", verdict: "revisar",
        detail: "el documento NO tenía el foco del sistema durante la medición (ventana en segundo plano, panel lateral o popup de extensión abierto): «:focus» no se aplica y el indicador de foco no se puede medir sobre el render. Se ha caído al CSS: " + porCss + " control(es) con regla de foco con indicador y " + sinRegla + " sin ninguna" + (hojasBloqueadas ? ", con " + hojasBloqueadas + " hoja(s) de otro origen ilegibles" : "") + ". Para medir 2.4.7 de verdad, haz clic en la página y vuelve a analizar con la ventana en primer plano."
      });
    }
    return res;
  }

  const FNS = [parseColor, over, lum, contrastRatio, rgbStr, apcaContrast, apcaMin,
    animacionesPersistentes, distintivoDeEnlace, enTextoCorrido, elementosFlotantes, fraccionTapada, ratioTxt, refrescar, todosM, enfocadoM, shadowCerrados, resolverColor, ownText, opacidadAcumulada, coloresDe, mismoColor, aparienciaFoco, indicadorDeFoco, fondoRealCoincide, bgBehind, contrastOf, boundaryContrastOf, isInteractiveM, locatorM, rutaM, renderedM, disabledM, managedM, textTargets,
    pinta, sinPseudoFoco, coincideSinFoco, reglasDeFoco, runChecksReal];
  const FN_SRC = "var MANAGED_PARENT = " + JSON.stringify(MANAGED_PARENT) + ";\nvar NATIVOS = " + JSON.stringify(NATIVOS) + ";\n" +
    "var PROP_INDICADOR = " + JSON.stringify(PROP_INDICADOR) + ";\nvar NULOS = " + JSON.stringify(NULOS) + ";\n" +
    FNS.map(function (f) { return f.toString(); }).join("\n");

  /**
   * Cuerpo para `page.evaluate(new Function("lim", MEASURE_BODY))`.
   *
   * Esta es la vía preferente en Playwright: la evaluación por CDP NO está sujeta a
   * la CSP de la página, mientras que `addScriptTag` sí — con una CSP restrictiva la
   * etiqueta se descartaba en silencio y `window.__a11yMeasure` no existía, así que
   * la medición fallaba sin decir por qué.
   */
  const MEASURE_BODY = FN_SRC + "\nreturn runChecksReal(document, window, lim || 400);";

  /**
   * Fuentes DESNUDAS de las funciones, sin envoltura ni asignación a `window`.
   *
   * Es lo que embebe el artifact: su capa de medición vive ya dentro de su propio
   * IIFE y llama a `runChecksReal(idoc, idoc.defaultView, 60)` directamente, así que
   * necesita las funciones en su ámbito, no escondidas dentro de otra IIFE.
   */
  const MEASURE_FNS = FN_SRC;

  /**
   * String inyectable para la extensión de Chrome (o un `<script>`). Va envuelto en
   * una IIFE: los nombres auxiliares (`over`, `lum`, `parseColor`…) son genéricos y
   * sueltos en el global colisionaban con los de la propia página auditada.
   */
  const MEASURE_SRC = "(function(){\n" + FN_SRC +
    "\nwindow.__a11yMeasure = function(limit){ return runChecksReal(document, window, limit||400); };\n})();";

  // También exportamos las funciones DOM para pruebas con un DOM simulado si se desea.
  NS.parseColor = parseColor;
  NS.over = over;
  NS.lum = lum;
  NS.contrastRatio = contrastRatio;
  NS.rgbStr = rgbStr;
  NS.apcaContrast = apcaContrast;
  NS.apcaMin = apcaMin;
  NS.MEASURE_BODY = MEASURE_BODY;
  NS.MEASURE_FNS = MEASURE_FNS;
  NS.MEASURE_SRC = MEASURE_SRC;
  NS.animacionesPersistentes = animacionesPersistentes;
  NS.distintivoDeEnlace = distintivoDeEnlace;
  NS.enTextoCorrido = enTextoCorrido;
  NS.elementosFlotantes = elementosFlotantes;
  NS.fraccionTapada = fraccionTapada;
  NS.ratioTxt = ratioTxt;
  NS.resolverColor = resolverColor;
  NS.opacidadAcumulada = opacidadAcumulada;
  NS.ownText = ownText;
  NS.bgBehind = bgBehind;
  NS.contrastOf = contrastOf;
  NS.boundaryContrastOf = boundaryContrastOf;
  NS.runChecksReal = runChecksReal;
  NS.renderedM = renderedM;
  NS.disabledM = disabledM;
  NS.managedM = managedM;
  NS.textTargets = textTargets;
  NS.rutaM = rutaM;
  NS.sinPseudoFoco = sinPseudoFoco;
  NS.coincideSinFoco = coincideSinFoco;
  NS.reglasDeFoco = reglasDeFoco;
  NS.pinta = pinta;
})(A11Y);

/* ── page-audit.js ── */
(function (NS) {
  const { WCAG22, enClause } = NS;
  /**
   * Auditoría de ÁMBITO DE PÁGINA.
   *
   * El motor de componente dictamina rol/nombre/estado/criterios por elemento.
   * Hay criterios WCAG que solo tienen sentido a nivel de página completa —título,
   * idioma, landmarks, saltar bloques, jerarquía de encabezados, ids duplicados—.
   * Este módulo los evalúa sobre el documento renderizado (post-JS).
   *
   * `auditPageDoc(doc)` recibe un documento ya parseado; `auditPageHtml(html, DP)`
   * lo parsea con el DOMParser dado (linkedom en Node, nativo en navegador).
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });

  function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "A") }; }
  function F(n, verdict, sev, evid, nodes) {
    const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "página", en: enClause(n) };
    if (nodes && nodes.length) f.nodes = nodes;
    return f;
  }

  const HEADING_SEL = "h1,h2,h3,h4,h5,h6,[role=heading]";
  const tag = function (el) { return el && el.tagName ? el.tagName.toLowerCase() : ""; };

  /**
   * ¿Está el elemento oculto para todo el mundo?
   *
   * Sin CSS aplicado no podemos saberlo todo, pero sí lo declarado: `hidden`,
   * `aria-hidden="true"`, `display:none`/`visibility:hidden` en línea, `inert`, o
   * un ancestro en esa situación. Un encabezado o un landmark oculto no cuenta:
   * antes inflaban el número de landmarks y el salto de jerarquía.
   */
  function ocultoEl(el) {
    let p = el;
    while (p && p.nodeType === 1) {
      if (p.hasAttribute("hidden") || p.hasAttribute("inert")) return true;
      if (p.getAttribute("aria-hidden") === "true") return true;
      const st = (p.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
      if (/display:none|visibility:hidden/.test(st)) return true;
      if (tag(p) === "template") return true;
      p = p.parentElement;
    }
    return false;
  }
  function visibles(list) { return Array.prototype.slice.call(list).filter(function (el) { return !ocultoEl(el); }); }
  function loc(el) {
    const t = tag(el);
    if (el.id) return t + "#" + el.id;
    const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
    return c ? t + "." + c : t;
  }

  /**
   * El <title> del documento: el que está en <head>.
   *
   * `doc.querySelector("title")` devolvía también el <title> de un <svg> o de un
   * <math> —que son texto alternativo del gráfico, no el título de la página—, así
   * que una página SIN título salía «cumple». Y si había varios <title> en head y el
   * primero estaba vacío, salía «falla» aunque el siguiente tuviera texto.
   */
  function tituloDocumento(doc) {
    const todos = Array.prototype.slice.call(doc.querySelectorAll("title")).filter(function (t) {
      let p = t.parentElement;
      while (p) { const n = tag(p); if (n === "svg" || n === "math") return false; p = p.parentElement; }
      return true;
    });
    const enHead = todos.filter(function (t) { return tag(t.parentElement) === "head"; });
    const cand = enHead.length ? enHead : todos;
    let texto = "";
    for (const t of cand) { const s = (t.textContent || "").trim(); if (s) { texto = s; break; } }
    return { texto: texto, n: cand.length };
  }

  // Conjunto (sin duplicados) de elementos que actúan como un landmark dado.
  function landmarks(doc, role, tags) {
    const set = new Set();
    visibles(doc.querySelectorAll("[role=" + role + "]")).forEach(function (el) { set.add(el); });
    (tags || []).forEach(function (t) {
      visibles(doc.querySelectorAll(t)).forEach(function (el) {
        // header/footer solo son banner/contentinfo si NO están dentro de contenido de sección.
        if ((t === "header" || t === "footer") && enSeccion(el)) return;
        // Un role explícito distinto gana sobre el rol implícito.
        const r = (el.getAttribute("role") || "").split(/\s+/)[0];
        if (r && r !== role) return;
        set.add(el);
      });
    });
    return Array.from(set); // ojo: slice.call sobre un Set devuelve [] (no tiene length)
  }
  function enSeccion(el) {
    let p = el.parentElement;
    while (p) { if (["article", "aside", "main", "nav", "section"].indexOf(tag(p)) !== -1) return true; p = p.parentElement; }
    return false;
  }

  // Atributos que apuntan a un id. Faltaban la mitad: un id duplicado usado por
  // aria-errormessage o aria-activedescendant pasaba desapercibido.
  const IDREF_ATTRS = ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
    "aria-flowto", "aria-details", "aria-errormessage", "aria-activedescendant", "headers", "list", "popovertarget"];

  /* ── 1.2.x Medios: el inventario SÍ es automatizable ─────────────────────── */

  /**
   * Qué medios hay y qué pistas declaran.
   *
   * Los cinco criterios de 1.2 estaban enteros en el cajón de «evaluación
   * humana», y la mitad del trabajo no lo es: que un `<video>` no declare NINGUNA
   * pista de subtítulos es una ausencia determinable desde el marcado, igual que
   * lo es que una imagen no tenga `alt`. Lo que exige juicio es la CALIDAD —si los
   * subtítulos están sincronizados, si la audiodescripción cubre lo que hace
   * falta—, y eso el veredicto lo dice en vez de fingir que lo ha mirado.
   *
   * Los medios incrustados de terceros (YouTube, Vimeo) se inventarían aparte: su
   * contenido no se ve desde aquí, así que se listan para que una persona los
   * abra, no se dictaminan.
   */
  const EMBEBIDOS = /(youtube\.com|youtu\.be|vimeo\.com|dailymotion|wistia|brightcove|jwplayer|spotify\.com|ivoox|soundcloud)/i;
  function inventarioMedios(doc) {
    const propios = [], externos = [];
    Array.prototype.forEach.call(doc.querySelectorAll("video,audio"), function (el) {
      if (ocultoEl(el)) return;
      const tag = el.tagName.toLowerCase();
      const pistas = Array.prototype.slice.call(el.querySelectorAll("track")).map(function (t) {
        return (t.getAttribute("kind") || "subtitles").toLowerCase();
      });
      propios.push({
        tag: tag, locator: loc(el),
        subtitulos: pistas.indexOf("captions") !== -1 || pistas.indexOf("subtitles") !== -1,
        descripciones: pistas.indexOf("descriptions") !== -1,
        pistas: pistas,
        autoplay: el.hasAttribute("autoplay"),
        controles: el.hasAttribute("controls"),
        silenciado: el.hasAttribute("muted")
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll("iframe[src],embed[src],object[data]"), function (el) {
      const src = el.getAttribute("src") || el.getAttribute("data") || "";
      if (!EMBEBIDOS.test(src)) return;
      if (ocultoEl(el)) return;
      externos.push({ locator: loc(el), src: src.slice(0, 120), nombre: (el.getAttribute("title") || "").slice(0, 60) });
    });
    return { propios: propios, externos: externos };
  }

  /**
   * 3.1.2 Idioma de las partes: un bloque en otro idioma sin `lang`.
   *
   * Detección por palabras funcionales, que son las que de verdad separan idiomas
   * en textos cortos. No pretende ser un detector de idioma: pretende no callarse
   * cuando un bloque largo está claramente en otro idioma que el declarado. Por
   * eso el veredicto es `revisar` y no `falla`.
   */
  const FUNCIONALES = {
    es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "para", "del", "se", "no", "es", "al", "lo", "su"],
    en: ["the", "of", "and", "to", "in", "a", "is", "that", "for", "it", "with", "as", "was", "on", "are", "this", "be", "by", "an", "from"],
    fr: ["le", "la", "les", "des", "et", "est", "un", "une", "pour", "dans", "que", "qui", "par", "sur", "avec", "au", "du", "ne", "pas", "ce"],
    pt: ["o", "os", "as", "de", "que", "e", "em", "um", "uma", "para", "com", "não", "por", "do", "da", "dos", "das", "no", "na", "se"],
    gl: ["o", "os", "as", "do", "da", "dos", "das", "e", "en", "un", "unha", "para", "con", "non", "que", "por", "ao", "nos", "se", "é"]
  };
  function idiomaProbable(texto) {
    const palabras = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z]+/).filter(Boolean);
    if (palabras.length < 25) return null;   // muy corto: no se puede afirmar nada
    const punt = {};
    Object.keys(FUNCIONALES).forEach(function (k) {
      punt[k] = palabras.filter(function (w) { return FUNCIONALES[k].indexOf(w) !== -1; }).length / palabras.length;
    });
    const orden = Object.keys(punt).sort(function (a, b) { return punt[b] - punt[a]; });
    // Exigir margen: sin diferencia clara entre el primero y el segundo, no se dice.
    if (punt[orden[0]] < 0.08 || punt[orden[0]] < punt[orden[1]] * 1.6) return null;
    return orden[0];
  }

  /* ── Lo que se puede ver en el marcado de los criterios «de interacción» ── */

  /**
   * 2.2.1 Tiempo ajustable: el temporizador que NADIE puede ajustar.
   *
   * `<meta http-equiv="refresh">` es el fallo determinable del criterio: recarga o
   * redirige sola, sin aviso y sin forma de pararla. WCAG solo la admite con un
   * retardo mayor de 20 horas (que en la práctica es «desactivada»).
   */
  function metaRefresh(doc) {
    const out = [];
    Array.prototype.forEach.call(doc.querySelectorAll('meta[http-equiv]'), function (m) {
      if (String(m.getAttribute("http-equiv") || "").toLowerCase() !== "refresh") return;
      const c = String(m.getAttribute("content") || "");
      const seg = parseFloat(c);
      out.push({ segundos: isNaN(seg) ? null : seg, contenido: c.slice(0, 80), redirige: /url\s*=/i.test(c) });
    });
    return out;
  }

  /**
   * 2.1.4 Atajos de teclado de un carácter.
   *
   * Solo ve los manejadores EN LÍNEA: un `addEventListener` no está en el marcado.
   * Por eso lo que sale es `revisar` con los candidatos, no un veredicto.
   */
  const TECLA_SUELTA = /\b(?:e|ev|evt|event)\.(?:key|which|keyCode|charCode)\s*(?:===?|==)\s*["']?[A-Za-z0-9]["']?/;
  const CON_MODIFICADOR = /\b(?:e|ev|evt|event)\.(?:ctrlKey|metaKey|altKey|shiftKey)/;
  function atajosDeUnaTecla(doc) {
    const out = [];
    const ATTR = ["onkeydown", "onkeyup", "onkeypress"];
    Array.prototype.forEach.call(doc.querySelectorAll("[onkeydown],[onkeyup],[onkeypress]"), function (el) {
      ATTR.forEach(function (a) {
        const code = el.getAttribute(a);
        if (!code) return;
        if (TECLA_SUELTA.test(code) && !CON_MODIFICADOR.test(code)) {
          out.push({ locator: loc(el), attr: a, code: code.replace(/\s+/g, " ").slice(0, 70) });
        }
      });
    });
    // Y los scripts en línea, que es donde suele estar de verdad.
    Array.prototype.forEach.call(doc.querySelectorAll("script:not([src])"), function (sc) {
      const code = String(sc.textContent || "");
      if (/addEventListener\s*\(\s*["']key(down|press|up)["']/.test(code) && TECLA_SUELTA.test(code) && !CON_MODIFICADOR.test(code)) {
        out.push({ locator: "script (en línea)", attr: "addEventListener", code: (TECLA_SUELTA.exec(code) || [""])[0].slice(0, 70) });
      }
    });
    return out;
  }

  /**
   * 2.5.1 / 2.5.2 / 2.5.4 / 2.5.7: candidatos de puntero, gesto y movimiento.
   *
   * Aquí no se dictamina nada: se localiza DÓNDE hay que mirar. Un `touchstart`,
   * un `pointerdown`, un `devicemotion` o un `draggable` no son una barrera por sí
   * mismos, pero son los únicos sitios donde estos cuatro criterios pueden fallar,
   * y encontrarlos a mano en un sitio grande es lo que cuesta.
   */
  const SONDAS_PUNTERO = [
    { crit: "2.5.1", etiqueta: "gestos de varios puntos o trazado", re: /\b(touchmove|gesturestart|gesturechange|pinch|swipe|hammer|interact\.js)\b/i },
    { crit: "2.5.2", etiqueta: "acciones en la pulsación (down) en vez de en la soltada (up)", re: /\b(onmousedown|onpointerdown|ontouchstart)\b/i },
    { crit: "2.5.4", etiqueta: "actuación por movimiento del dispositivo", re: /\b(devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent|shake)\b/i },
    { crit: "2.5.7", etiqueta: "movimientos de arrastre", re: /\b(dragstart|ondragstart|draggable\s*=|sortable|dnd-|drag-and-drop)\b/i }
  ];
  function candidatosPuntero(doc) {
    const porCrit = {};
    const fuentes = [];
    Array.prototype.forEach.call(doc.querySelectorAll("*"), function (el) {
      const attrs = el.attributes || [];
      for (let i = 0; i < attrs.length; i++) {
        const n = attrs[i].name.toLowerCase();
        if (n.indexOf("on") === 0 || n === "draggable") fuentes.push({ locator: loc(el), texto: n + "=" + String(attrs[i].value || "").slice(0, 40) });
      }
    });
    Array.prototype.forEach.call(doc.querySelectorAll("script:not([src])"), function (sc) {
      fuentes.push({ locator: "script (en línea)", texto: String(sc.textContent || "").slice(0, 4000) });
    });
    SONDAS_PUNTERO.forEach(function (sonda) {
      const hits = fuentes.filter(function (f) { return sonda.re.test(f.texto); });
      if (hits.length) porCrit[sonda.crit] = { etiqueta: sonda.etiqueta, hits: hits.slice(0, 6) };
    });
    return porCrit;
  }

  function auditPageDoc(doc) {
    const out = [];
    const html = doc.documentElement;

    // 2.4.2 Titulada
    const t = tituloDocumento(doc);
    out.push(t.texto
      ? F("2.4.2", "cumple-parcial", null, ["La página declara <title>: «" + t.texto.slice(0, 80) + "». Que sea descriptivo y único en el sitio exige juicio humano."])
      : F("2.4.2", "falla", "grave", ["La página no tiene <title> en <head> o está vacío: se anuncia por su URL."]));

    // 3.1.1 Idioma de la página. BCP-47 NO distingue mayúsculas: lang="ES" y
    // lang="es-ES" son válidos, y antes se marcaban a revisar.
    const lang = html ? (html.getAttribute("lang") || "").trim() : "";
    const xmlLang = html ? (html.getAttribute("xml:lang") || "").trim() : "";
    const efectivo = lang || xmlLang;
    if (!efectivo) out.push(F("3.1.1", "falla", "grave", ["<html> no declara el atributo lang: el lector no sabe en qué idioma leer."]));
    else if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(efectivo)) out.push(F("3.1.1", "falla", "grave", ["<html lang=\"" + efectivo + "\"> no es una etiqueta de idioma BCP-47 válida."]));
    else if (lang && xmlLang && lang.toLowerCase() !== xmlLang.toLowerCase()) out.push(F("3.1.1", "revisar", null, ["lang=\"" + lang + "\" y xml:lang=\"" + xmlLang + "\" no coinciden."]));
    else out.push(F("3.1.1", "cumple", null, ["Idioma declarado: lang=\"" + efectivo + "\"."]));

    // 1.3.1 Landmarks: exactamente un main; banner/contentinfo no duplicados
    const mains = landmarks(doc, "main", ["main"]);
    if (mains.length === 0) out.push(F("1.3.1", "revisar", null, ["No hay landmark <main>: dificulta ir directo al contenido principal."]));
    else if (mains.length > 1) out.push(F("1.3.1", "falla", "moderada", ["Hay " + mains.length + " landmarks main: debe haber solo uno."], mains.map(function (e) { return { locator: loc(e) }; })));
    const banners = landmarks(doc, "banner", ["header"]);
    const infos = landmarks(doc, "contentinfo", ["footer"]);
    if (banners.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + banners.length + " landmarks banner: normalmente debe haber uno."], banners.map(function (e) { return { locator: loc(e) }; })));
    if (infos.length > 1) out.push(F("1.3.1", "revisar", null, ["Hay " + infos.length + " landmarks contentinfo: normalmente debe haber uno."], infos.map(function (e) { return { locator: loc(e) }; })));

    // 2.4.1 Saltar bloques. Un enlace de salto de verdad apunta a un destino que
    // EXISTE y está al principio del documento; antes valía cualquier `a[href^='#']`
    // de la página —incluido `href="#"` de un botón falso o un ancla del pie—.
    const anclas = visibles(doc.querySelectorAll("a[href^='#']")).slice(0, 8);
    const salto = anclas.find(function (a) {
      const h = (a.getAttribute("href") || "").slice(1);
      if (!h) return false;
      let destino = null;
      try { destino = doc.getElementById(h) || doc.querySelector('a[name="' + h.replace(/"/g, '\\"') + '"]'); } catch (e) {}
      return !!destino;
    });
    const hayLandmarks = mains.length > 0 || visibles(doc.querySelectorAll("nav,[role=navigation]")).length > 0;
    const headings = visibles(doc.querySelectorAll(HEADING_SEL)).map(function (h) {
      const n = tag(h);
      const lvl = /^h[1-6]$/.test(n) ? parseInt(n[1], 10) : parseInt(h.getAttribute("aria-level") || "2", 10);
      return { lvl: lvl, text: (h.textContent || "").trim().slice(0, 40), el: h };
    });
    if (salto) out.push(F("2.4.1", "cumple-parcial", null, ["Hay un enlace de salto a un destino existente (" + salto.getAttribute("href") + "); confirma que sea visible al recibir el foco."], [{ locator: loc(salto) }]));
    else if (hayLandmarks || headings.length) out.push(F("2.4.1", "revisar", null, ["Sin enlace de salto con destino válido; hay landmarks/encabezados como mecanismo alternativo (revisar que basten)."]));
    else out.push(F("2.4.1", "falla", "moderada", ["No hay enlace de salto ni landmarks ni encabezados para saltar bloques repetidos."]));

    // 2.4.6 / 1.3.1 Encabezados: existe h1 y sin saltos de nivel (solo los visibles)
    if (!headings.length) {
      out.push(F("1.3.1", "revisar", null, ["La página no tiene encabezados visibles: no hay estructura navegable por títulos."]));
    } else {
      const hasH1 = headings.some(function (h) { return h.lvl === 1; });
      let skip = null, skipEl = null, prev = 0;
      for (const h of headings) { if (prev && h.lvl > prev + 1) { skip = prev + "→" + h.lvl; skipEl = h.el; break; } prev = h.lvl; }
      const vacios = headings.filter(function (h) { return !h.text; });
      if (!hasH1) out.push(F("2.4.6", "revisar", null, ["No hay un encabezado de nivel 1 (h1) en la página."]));
      if (skip) out.push(F("1.3.1", "revisar", null, ["Salto en la jerarquía de encabezados (" + skip + "): revisa que el orden de niveles sea correcto."], skipEl ? [{ locator: loc(skipEl) }] : null));
      if (vacios.length) out.push(F("2.4.6", "falla", "moderada", [vacios.length + " encabezado(s) sin texto: anuncian un nivel vacío."], vacios.map(function (h) { return { locator: loc(h.el) }; })));
      if (hasH1 && !skip && !vacios.length) out.push(F("2.4.6", "cumple-parcial", null, [headings.length + " encabezados con jerarquía sin saltos; la calidad del texto exige juicio."]));
    }

    // 1.3.1 / 4.1.2 IDs: duplicados usados en relaciones, y referencias colgantes
    const idCount = {};
    Array.prototype.forEach.call(doc.querySelectorAll("[id]"), function (el) {
      const id = el.getAttribute("id"); if (id) idCount[id] = (idCount[id] || 0) + 1;
    });
    const referenced = {};
    IDREF_ATTRS.forEach(function (attr) {
      Array.prototype.forEach.call(doc.querySelectorAll("[" + attr + "]"), function (el) {
        const multi = attr !== "aria-activedescendant" && attr !== "list" && attr !== "popovertarget";
        const v = (el.getAttribute(attr) || "").trim();
        (multi ? v.split(/\s+/) : [v]).forEach(function (id) { if (id) (referenced[id] = referenced[id] || []).push(el); });
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll("label[for]"), function (el) {
      const f = el.getAttribute("for"); if (f) (referenced[f] = referenced[f] || []).push(el);
    });
    const dupRef = Object.keys(idCount).filter(function (id) { return idCount[id] > 1 && referenced[id]; });
    if (dupRef.length) out.push(F("1.3.1", "falla", "grave", ["IDs duplicados usados en relaciones ARIA/label: " + dupRef.slice(0, 8).join(", ") + " — la relación se vuelve ambigua."]));
    const colgantes = Object.keys(referenced).filter(function (id) { return !idCount[id]; });
    if (colgantes.length) {
      out.push(F("4.1.2", "falla", "grave", ["Referencias a IDs que no existen: " + colgantes.slice(0, 8).join(", ") + " — el nombre, la descripción o la relación no llegan a la API de accesibilidad."],
        colgantes.slice(0, 8).map(function (id) { return { locator: loc(referenced[id][0]), name: id }; })));
    }

    /* ── 1.2.x Medios ── */
    const medios = inventarioMedios(doc);
    if (medios.propios.length || medios.externos.length) {
      const videos = medios.propios.filter(function (m) { return m.tag === "video"; });
      const audios = medios.propios.filter(function (m) { return m.tag === "audio"; });
      const sinSub = videos.filter(function (m) { return !m.subtitulos; });
      const sinDesc = videos.filter(function (m) { return !m.descripciones; });

      if (sinSub.length) {
        out.push(F("1.2.2", "falla", "grave", [
          sinSub.length + " vídeo(s) no declaran ninguna pista de subtítulos (<track kind=\"captions\">): " +
          sinSub.slice(0, 5).map(function (m) { return m.locator; }).join(", ") +
          ". La ausencia de pista sí es determinable; que los subtítulos existentes sean correctos, no."
        ], sinSub.slice(0, 8).map(function (m) { return { locator: m.locator, name: "sin subtítulos" }; })));
      } else if (videos.length) {
        out.push(F("1.2.2", "cumple-parcial", null, [
          "Los " + videos.length + " vídeo(s) declaran pista de subtítulos. Que estén completos, sincronizados y en el idioma correcto exige verlos."
        ]));
      }
      if (sinDesc.length) {
        out.push(F("1.2.3", "revisar", null, [
          sinDesc.length + " vídeo(s) no declaran pista de audiodescripción (<track kind=\"descriptions\">) ni se detecta una alternativa: " +
          sinDesc.slice(0, 5).map(function (m) { return m.locator; }).join(", ") +
          ". 1.2.3 admite una alternativa textual equivalente, que puede estar en la página sin marcado propio: compruébalo."
        ], sinDesc.slice(0, 8).map(function (m) { return { locator: m.locator, name: "sin audiodescripción" }; })));
      }
      if (audios.length) {
        out.push(F("1.2.1", "revisar", null, [
          audios.length + " elemento(s) de solo audio (" + audios.map(function (m) { return m.locator; }).join(", ") +
          "): 1.2.1 exige una transcripción equivalente, que no se puede reconocer desde el marcado. Búscala en la página."
        ], audios.slice(0, 8).map(function (m) { return { locator: m.locator, name: "solo audio" }; })));
      }
      if (medios.externos.length) {
        out.push(F("1.2.2", "revisar", null, [
          medios.externos.length + " medio(s) incrustados de terceros (" +
          medios.externos.slice(0, 4).map(function (m) { return m.locator + " → " + m.src.replace(/^https?:\/\//, "").slice(0, 45); }).join(", ") +
          "): su contenido no se ve desde aquí. Ábrelos y comprueba subtítulos y audiodescripción en el propio reproductor."
        ], medios.externos.slice(0, 8).map(function (m) { return { locator: m.locator, name: m.nombre || "medio incrustado" }; })));
      }

      // 1.4.2 Control del audio: lo que suena solo y no se puede parar.
      const suenanSolos = medios.propios.filter(function (m) { return m.autoplay && !m.silenciado; });
      if (suenanSolos.length) {
        const sinControl = suenanSolos.filter(function (m) { return !m.controles; });
        out.push(sinControl.length
          ? F("1.4.2", "falla", "grave", [
              sinControl.length + " medio(s) con <code>autoplay</code>, sin silenciar y SIN controles: " +
              sinControl.map(function (m) { return m.locator; }).join(", ") +
              ". Si suena más de 3 segundos no hay forma de pararlo, que es justo lo que prohíbe 1.4.2."
            ], sinControl.slice(0, 8).map(function (m) { return { locator: m.locator, name: "autoplay sin control" }; }))
          : F("1.4.2", "revisar", null, [
              suenanSolos.length + " medio(s) se reproducen solos con sonido pero ofrecen controles: comprueba que el mecanismo de parada esté al principio del orden de tabulación."
            ], suenanSolos.slice(0, 8).map(function (m) { return { locator: m.locator, name: "autoplay con control" }; })));
      }
    }

    /* ── 2.2.1 Tiempo ajustable ── */
    const refrescos = metaRefresh(doc);
    refrescos.forEach(function (r) {
      // El único umbral que WCAG admite son 20 horas: por debajo, o se puede
      // ajustar/parar/extender, o es una falla.
      if (r.segundos != null && r.segundos > 72000) return;
      out.push(F("2.2.1", "falla", "grave", [
        "La página se " + (r.redirige ? "redirige" : "recarga") + " sola con <code>&lt;meta http-equiv=\"refresh\"&gt;</code>" +
        (r.segundos != null ? " a los " + r.segundos + " segundos" : "") +
        " (<code>" + r.contenido + "</code>): no hay forma de apagarlo, ajustarlo ni prorrogarlo, que es lo que exige 2.2.1."
      ], [{ locator: "meta[http-equiv=refresh]", name: r.contenido }]));
    });

    /* ── 2.1.4 Atajos de teclado de un carácter ── */
    const atajos = atajosDeUnaTecla(doc);
    if (atajos.length) {
      out.push(F("2.1.4", "revisar", null, [
        atajos.length + " manejador(es) de teclado comparan una tecla suelta sin exigir Ctrl, Alt, Cmd ni Mayúsculas: " +
        atajos.slice(0, 4).map(function (a) { return a.locator + " (" + a.attr + ": " + a.code + ")"; }).join(" · ") +
        ". 2.1.4 exige poder desactivar el atajo, reasignarlo, o que solo actúe con el foco puesto en su control. Solo se ven los manejadores en línea: los de un bundle externo no se detectan desde aquí."
      ], atajos.slice(0, 8).map(function (a) { return { locator: a.locator, name: a.attr }; })));
    }

    /* ── 2.5.1 / 2.5.2 / 2.5.4 / 2.5.7: dónde hay que mirar ── */
    const puntero = candidatosPuntero(doc);
    Object.keys(puntero).forEach(function (crit) {
      const p = puntero[crit];
      out.push(F(crit, "revisar", null, [
        "Se detectan " + p.hits.length + " indicio(s) de " + p.etiqueta + ": " +
        p.hits.slice(0, 4).map(function (h) { return h.locator; }).join(", ") +
        ". El agente no dictamina este criterio; señala dónde mirar, que en un sitio grande es lo que cuesta."
      ], p.hits.map(function (h) { return { locator: h.locator, name: "" }; })));
    });

    /* ── 3.1.2 Idioma de las partes ── */
    const langPagina = String((html && html.getAttribute("lang")) || "").toLowerCase().split("-")[0];
    if (langPagina) {
      const sospechosos = [];
      const bloques = doc.querySelectorAll("p,li,blockquote,td,dd,figcaption,h1,h2,h3,h4,h5,h6");
      for (let i = 0; i < bloques.length && sospechosos.length < 12; i++) {
        const el = bloques[i];
        if (ocultoEl(el)) continue;
        // Si el propio bloque o un antepasado ya declara idioma, está resuelto.
        let p = el, declarado = null;
        while (p && p.nodeType === 1) { const l = p.getAttribute("lang"); if (l) { declarado = l.toLowerCase().split("-")[0]; break; } p = p.parentElement; }
        if (declarado && declarado !== langPagina) continue;
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
        const idioma = idiomaProbable(txt);
        if (idioma && idioma !== langPagina) {
          sospechosos.push({ locator: loc(el), idioma: idioma, texto: txt.slice(0, 60) });
        }
      }
      if (sospechosos.length) {
        out.push(F("3.1.2", "revisar", null, [
          sospechosos.length + " bloque(s) parecen estar en un idioma distinto del declarado (<code>lang=\"" + langPagina + "\"</code>) y no lo marcan: " +
          sospechosos.slice(0, 4).map(function (x) { return x.locator + " (¿" + x.idioma + "?) «" + x.texto + "»"; }).join(" · ") +
          ". La detección es por palabras funcionales y puede equivocarse con textos técnicos o con citas: confírmalo antes de anotarlo."
        ], sospechosos.slice(0, 8).map(function (x) { return { locator: x.locator, name: x.idioma }; })));
      }
    }

    return out;
  }

  function auditPageHtml(html, DP) {
    const P = DP || (typeof DOMParser !== "undefined" ? DOMParser : null);
    if (!P) throw new Error("auditPageHtml necesita un DOMParser (pásalo como 2.º argumento en Node)");
    const doc = new P().parseFromString(String(html || ""), "text/html");
    return auditPageDoc(doc);
  }

  // Resumen de veredictos de página.
  function pageSummary(findings) {
    const s = { falla: 0, revisar: 0, humano: 0, "cumple-parcial": 0, cumple: 0 };
    findings.forEach(function (f) { if (s[f.verdict] != null) s[f.verdict]++; });
    return s;
  }
  NS.auditPageDoc = auditPageDoc;
  NS.auditPageHtml = auditPageHtml;
  NS.pageSummary = pageSummary;
})(A11Y);

/* ── coherence.js ── */
(function (NS) {
  const { WCAG22, enClause } = NS;
  /**
   * Coherencia entre páginas de la muestra.
   *
   * Cuatro criterios que el motor daba por «evaluación humana» y que en cuanto hay
   * una muestra son deterministas: no hablan de juicio, hablan de comparar páginas
   * entre sí. Lo que hace falta es mirar más de una a la vez, y el muestreo ya está.
   *
   *   3.2.3 Navegación coherente     (AA) — el mismo orden relativo en cada página
   *   3.2.4 Identificación coherente (AA) — la misma función, el mismo nombre
   *   3.2.6 Ayuda coherente          (A)  — la ayuda, en el mismo sitio relativo
   *   2.4.5 Múltiples vías           (AA) — más de una forma de localizar una página
   *
   * `fingerprintPage(doc)` saca la huella de un documento ya renderizado; es pura y
   * corre igual en Node (linkedom) que en el navegador. `analyzeCoherence(huellas)`
   * compara las huellas y emite los veredictos. Ninguna de las dos toca la red.
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
  function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "AA") }; }
  function F(n, verdict, sev, evid, nodes) {
    const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "sitio", origen: "coherencia", en: enClause(n) };
    if (nodes && nodes.length) f.nodes = nodes;
    return f;
  }

  /* ── Normalización ───────────────────────────────────────────────────────── */

  /** Destino canónico de un enlace: es la IDENTIDAD de «misma función». */
  function normalizarHref(href, base) {
    const h = String(href || "").trim();
    if (!h) return null;
    if (/^(mailto:|tel:|javascript:)/i.test(h)) return h.toLowerCase().replace(/\s+/g, "");
    if (h === "#" || h.charAt(0) === "#") return null; // ancla interna: no identifica una página
    let u;
    try { u = new URL(h, base || "http://local/"); } catch (e) { return h.toLowerCase(); }
    u.hash = "";
    let p = u.pathname.replace(/\/+$/, "");
    if (!p) p = "/";
    /* El HOST no distingue mayúsculas; la RUTA sí.
     *
     * Minusculizándolo todo, `/Servicios` y `/servicios` quedaban como el mismo
     * destino, y 3.2.4 emitía un `falla` —«el mismo destino con nombres distintos»—
     * sobre dos páginas que en el servidor son dos páginas diferentes y pueden
     * llamarse cada una como quiera. En HTTP la ruta es sensible a mayúsculas, así
     * que se respeta tal cual; lo mismo la cadena de consulta, donde un valor puede
     * ser un identificador que las distinga. */
    return u.host.toLowerCase() + p + (u.search || "");
  }

  /** Nombre comparable: sin acentos, sin puntuación de adorno, en minúsculas. */
  function normalizarNombre(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[«»"'`´¡!¿?.,;:()\[\]|–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Mecanismos de ayuda que reconoce 3.2.6.
  const AYUDA = [
    { tipo: "contacto", re: /(^|\b)(contacto|contactar|contact|cont[aá]ctanos)\b/i },
    { tipo: "ayuda", re: /(^|\b)(ayuda|help|soporte|support|asistencia)\b/i },
    { tipo: "faq", re: /(^|\b)(faq|preguntas frecuentes|dudas)\b/i },
    { tipo: "chat", re: /(^|\b)(chat|chatbot|habla con)\b/i },
    { tipo: "teléfono", re: /^tel:/i },
    { tipo: "correo", re: /^mailto:/i }
  ];
  /* Un `mailto:` no es por sí solo un mecanismo de ayuda.
   *
   * Probando el esquema contra el `href` crudo, un «Compartir por correo» dentro de
   * un artículo se registraba como mecanismo de ayuda «correo». Y como solo se
   * guardaba la primera aparición de cada tipo, en la ficha ganaba la del contenido
   * y en la portada la del pie: 3.2.6 emitía un `falla` diciendo que el mecanismo
   * «cambia de sitio» en dos páginas que tienen la misma dirección de contacto en el
   * mismo pie.
   *
   * 3.2.6 habla de mecanismos de AYUDA. Un `tel:` o un `mailto:` cuentan cuando algo
   * dice que sirven para pedir ayuda: el nombre del enlace, o el hecho de estar en
   * la cabecera o el pie, que es donde se ponen los datos de contacto. Un `mailto:`
   * en medio del contenido, con un nombre que habla de compartir, es otra cosa.
   */
  const COMPARTIR_RE = /(compartir|share|env[ií]a(r)? (esto|a un amigo)|tweet|whatsapp)/i;
  function tipoAyuda(nombre, href, region) {
    const esquema = /^(mailto:|tel:)/i.test(String(href || ""));
    if (esquema) {
      if (COMPARTIR_RE.test(nombre)) return null;
      // Un mailto: «vacío» (sin destinatario) es para que lo rellene quien comparte.
      if (/^mailto:\s*(\?|$)/i.test(String(href || ""))) return null;
      const porNombre = AYUDA.find(function (a) { return a.tipo !== "correo" && a.tipo !== "teléfono" && a.re.test(nombre); });
      if (porNombre) return porNombre.tipo;
      const enSitioDeContacto = region === "pie" || region === "cabecera";
      if (!enSitioDeContacto) return null;
      return /^tel:/i.test(href) ? "teléfono" : "correo";
    }
    for (const a of AYUDA) {
      if (a.tipo === "correo" || a.tipo === "teléfono") continue;
      if (a.re.test(href) || a.re.test(nombre)) return a.tipo;
    }
    return null;
  }

  const MAPA_RE = /(mapa (del sitio|web)|sitemap|[ií]ndice del sitio)/i;
  const INDICE_RE = /(^|\b)([ií]ndice|a-z|directorio|listado alfab[eé]tico)\b/i;

  /* ── Huella de una página ────────────────────────────────────────────────── */

  function tagOf(el) { return (el && el.tagName) ? el.tagName.toLowerCase() : ""; }
  /**
   * ¿Oculto? Con `win` se usa getComputedStyle y se ve la verdad del render; sin
   * él solo se puede mirar lo declarado en el marcado.
   *
   * La diferencia importa aquí más que en otros sitios: casi todos los sitios
   * llevan un menú móvil duplicado que el CSS oculta en escritorio. Si se cuela en
   * la huella, la secuencia de navegación sale duplicada y 3.2.3 se inventa
   * cambios de orden que no existen.
   */
  function ocultoEl(el, win) {
    let p = el;
    while (p && p.nodeType === 1) {
      // `inert` también saca el contenido del árbol de accesibilidad: sin él, esta
      // copia de la función y la de page-audit.js daban respuestas distintas sobre
      // el mismo elemento.
      if (p.hasAttribute("hidden") || p.hasAttribute("inert") || p.getAttribute("aria-hidden") === "true") return true;
      if (win) {
        const cs = win.getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden") return true;
      } else {
        const st = (p.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
        if (st.indexOf("display:none") !== -1 || st.indexOf("visibility:hidden") !== -1) return true;
      }
      p = p.parentElement;
    }
    return false;
  }
  function loc(el) {
    const t = tagOf(el);
    if (el.id) return t + "#" + el.id;
    const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
    return c ? t + "." + c : t;
  }
  /**
   * Región de la página donde vive un elemento: cabecera, navegación, contenido o
   * pie. Es lo que de verdad mide 3.2.6 —dónde está la ayuda—, mucho más estable
   * que el orden entre mecanismos distintos.
   */
  /* La región es la MÁS EXTERNA, no la primera que se encuentra subiendo.
   *
   * Devolviendo la primera, un `<footer><a>Contacto</a>` daba «pie» y un
   * `<footer><nav><a>Contacto</a></nav>` daba «navegación»: la misma ubicación
   * visual, dos regiones distintas, y 3.2.6 emitía un `falla` diciendo que el
   * mecanismo de ayuda «cambia de sitio entre páginas» porque una de ellas envolvía
   * los enlaces del pie en un `<nav>`. 3.2.6 habla de la ubicación relativa, no del
   * envoltorio, así que un `nav` dentro del pie sigue siendo el pie.
   *
   * Se sube hasta arriba y manda el último landmark encontrado, con una excepción:
   * `navegación` no gana nunca a `pie`, `cabecera`, `contenido` ni `lateral`, porque
   * un `nav` casi siempre vive dentro de uno de ellos y es el contenedor el que dice
   * dónde está la cosa en la pantalla.
   */
  function regionDe(el) {
    let p = el, encontrada = null;
    while (p && p.nodeType === 1) {
      const t = tagOf(p), r = (p.getAttribute("role") || "").split(/\s+/)[0];
      let aqui = null;
      if (t === "footer" || r === "contentinfo") aqui = "pie";
      else if (t === "header" || r === "banner") aqui = "cabecera";
      else if (t === "nav" || r === "navigation") aqui = "navegación";
      else if (t === "main" || r === "main") aqui = "contenido";
      else if (t === "aside" || r === "complementary") aqui = "lateral";
      // El más externo manda, y «navegación» solo se queda si no hay nada mejor.
      if (aqui && (encontrada === null || aqui !== "navegación")) encontrada = aqui;
      p = p.parentElement;
    }
    return encontrada || "otra";
  }
  function nombreDe(el) {
    const al = el.getAttribute("aria-label");
    if (al && al.trim()) return al.trim();
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t) return t;
    const img = el.querySelector && el.querySelector("img[alt]");
    if (img) { const a = (img.getAttribute("alt") || "").trim(); if (a) return a; }
    const ti = el.getAttribute("title");
    return ti ? ti.trim() : "";
  }

  /**
   * Huella comparable de una página: sus enlaces de navegación en orden, los
   * mecanismos de ayuda y las vías de localización.
   *
   * @param {Document} doc  documento ya renderizado (post-JS)
   * @param {string} [url]  URL de la página, para resolver los enlaces relativos
   * @param {Window} [win]  ventana real, para descartar lo oculto por CSS
   */
  function fingerprintPage(doc, url, win) {
    const visibles = function (sel) {
      return Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(function (el) { return !ocultoEl(el, win); });
    };

    // Navegación: los enlaces dentro de landmarks de navegación, EN ORDEN de DOM.
    const navs = [];
    visibles("nav,[role=navigation]").forEach(function (nav) {
      const items = [];
      Array.prototype.slice.call(nav.querySelectorAll("a[href]")).forEach(function (a) {
        if (ocultoEl(a, win)) return;
        const href = normalizarHref(a.getAttribute("href"), url);
        if (!href) return;
        items.push({ href: href, name: nombreDe(a), locator: loc(a) });
      });
      if (items.length) navs.push({ locator: loc(nav), label: nombreDe(nav) || (nav.getAttribute("aria-label") || ""), items: items });
    });

    // Todos los enlaces de la página, en orden: identidad para 3.2.4 y 3.2.6.
    const enlaces = [];
    visibles("a[href]").forEach(function (a, i) {
      const raw = a.getAttribute("href");
      const href = normalizarHref(raw, url);
      if (!href) return;
      enlaces.push({ href: href, raw: raw, name: nombreDe(a), locator: loc(a), region: regionDe(a), orden: enlaces.length });
    });

    // Ayuda: mecanismos reconocibles, en el orden en que aparecen.
    const ayuda = [];
    enlaces.forEach(function (e) {
      const t = tipoAyuda(e.name, e.raw, e.region);
      if (t && !ayuda.some(function (x) { return x.tipo === t; })) {
        ayuda.push({ tipo: t, name: e.name, href: e.href, locator: e.locator, region: e.region, orden: e.orden });
      }
    });

    // Vías de localización (2.4.5).
    // OJO: visible, como el resto de la huella. Sin el filtro, un buscador dentro
    // de un menú móvil con `display:none` contaba como vía de localización y
    // empujaba 2.4.5 a «cumple» con algo que el usuario no puede usar.
    const buscador = Array.prototype.slice.call(doc.querySelectorAll('input[type=search],[role=search]'))
      .some(function (el) { return !ocultoEl(el, win); }) ||
      Array.prototype.slice.call(doc.querySelectorAll("form")).some(function (f) {
        if (ocultoEl(f, win)) return false;
        return /buscar|search|busqueda|búsqueda/i.test((f.getAttribute("action") || "") + " " + (f.id || "") + " " + (f.className || "") + " " + (f.getAttribute("role") || ""));
      });
    const mapaWeb = enlaces.some(function (e) { return MAPA_RE.test(e.name) || MAPA_RE.test(e.href); });
    const indice = enlaces.some(function (e) { return INDICE_RE.test(e.name); });
    const navegacion = navs.some(function (n) { return n.items.length >= 3; });

    return {
      url: url || null,
      navs: navs,
      enlaces: enlaces,
      ayuda: ayuda,
      vias: { buscador: buscador, mapaWeb: mapaWeb, indice: indice, navegacion: navegacion }
    };
  }

  /* ── Comparación ─────────────────────────────────────────────────────────── */

  /**
   * ¿Conservan las dos secuencias el mismo orden relativo en lo que comparten?
   * Devuelve `null` si sí, o la primera pareja invertida si no.
   */
  function ordenRelativo(a, b) {
    const setB = new Set(b);
    const comunes = a.filter(function (x) { return setB.has(x); });
    const posB = {};
    b.forEach(function (x, i) { if (posB[x] == null) posB[x] = i; });
    for (let i = 1; i < comunes.length; i++) {
      if (posB[comunes[i]] < posB[comunes[i - 1]]) {
        return { antes: comunes[i - 1], despues: comunes[i] };
      }
    }
    return null;
  }

  // Secuencia de destinos de navegación de una huella (todas sus navs concatenadas).
  function seqNav(h) {
    const out = [];
    (h.navs || []).forEach(function (n) {
      n.items.forEach(function (it) { if (out.indexOf(it.href) === -1) out.push(it.href); });
    });
    return out;
  }

  /** 3.2.3 Navegación coherente. */
  function analyzeNavConsistency(huellas) {
    const conNav = (huellas || []).filter(function (h) { return seqNav(h).length >= 2; });
    if (conNav.length < 2) {
      return [F("3.2.3", "revisar", null, [
        "Hace falta más de una página con navegación repetida para comprobar el orden relativo; en esta muestra hay " + conNav.length + "."
      ])];
    }
    // Para la evidencia manda el NOMBRE del enlace, no el destino normalizado: es
    // lo que ve una persona auditora en la pantalla.
    const nombres = {};
    conNav.forEach(function (h) {
      (h.navs || []).forEach(function (n) {
        n.items.forEach(function (it) { if (!nombres[it.href] && it.name) nombres[it.href] = it.name; });
      });
    });
    const etiqueta = function (href) { return nombres[href] ? "«" + nombres[href] + "»" : href; };

    /* TODOS los pares, no cada página contra la primera.
     *
     * Comparando solo contra `conNav[0]`, un destino que cambia de sitio entre la
     * página 2 y la 3 pero que no aparece en la 1 no se compara con nada: la
     * inversión pasa desapercibida y el criterio sale `cumple` afirmando «mantiene
     * el mismo orden relativo en las N páginas». Comprobado con tres páginas donde
     * «Blog» va antes de «Servicios» en una y después en otra, y ninguna de las dos
     * cosas se ve desde la primera, que no tiene Blog.
     *
     * 3.2.3 habla del orden relativo entre páginas, sin página privilegiada, así que
     * se comparan todos los pares. Con muestras de quince páginas son ciento cinco
     * comparaciones de listas cortas: nada. */
    const base = conNav[0], seqBase = seqNav(base);
    const problemas = [];
    const vistos = {};
    for (let i = 0; i < conNav.length; i++) {
      for (let j = i + 1; j < conNav.length; j++) {
        const inv = ordenRelativo(seqNav(conNav[i]), seqNav(conNav[j]));
        if (!inv) continue;
        // Una misma inversión aparece en varios pares: se cuenta una vez, y con las
        // dos páginas que la demuestran.
        const clave = inv.antes + "|" + inv.despues;
        if (vistos[clave]) continue;
        vistos[clave] = 1;
        problemas.push({ pagina: conNav[j].url, contra: conNav[i].url, inv: inv });
      }
    }
    if (!problemas.length) {
      return [F("3.2.3", "cumple", null, [
        "La navegación repetida mantiene el mismo orden relativo en las " + conNav.length + " páginas de la muestra que la tienen (" +
        seqBase.slice(0, 8).map(etiqueta).join(" → ") + (seqBase.length > 8 ? " → …" : "") + ")."
      ])];
    }
    return [F("3.2.3", "falla", "moderada", problemas.slice(0, 5).map(function (p) {
      return "En " + (p.pagina || "(página)") + " el orden de la navegación cambia: " + etiqueta(p.inv.despues) +
        " aparece antes que " + etiqueta(p.inv.antes) + ", al revés que en " + (p.contra || base.url || "otra página de la muestra") + ".";
    }), problemas.slice(0, 8).map(function (p) { return { locator: p.pagina || "(página)", name: "orden alterado" }; }))];
  }

  /**
   * 3.2.4 Identificación coherente: el mismo destino, el mismo nombre.
   *
   * Distingue dos grados, porque no son lo mismo: un nombre que CONTIENE al otro
   * («Inicio» / «Ir a inicio») es una inconsistencia menor a revisar; dos nombres
   * sin nada en común para el mismo destino sí es una falla.
   */
  function analyzeIdConsistency(huellas) {
    const porHref = {};
    (huellas || []).forEach(function (h) {
      (h.enlaces || []).forEach(function (e) {
        const nom = normalizarNombre(e.name);
        if (!nom) return;
        if (!porHref[e.href]) porHref[e.href] = { nombres: {}, locator: e.locator };
        if (!porHref[e.href].nombres[nom]) porHref[e.href].nombres[nom] = { crudo: e.name, paginas: [] };
        const p = porHref[e.href].nombres[nom].paginas;
        if (p.indexOf(h.url) === -1) p.push(h.url);
      });
    });

    const fallas = [], revisiones = [];
    // Solo cuentan los destinos que aparecen en DOS O MÁS páginas. 3.2.4 es un
    // criterio de conjunto: comparar un destino visto en una sola página no
    // comprueba nada, y contarlo como «coherente» declaraba conforme algo que
    // nadie había comparado. Dos anclas distintas de la misma página («/faq#envíos»
    // y «/faq#pagos») tampoco son el mismo destino visto dos veces.
    const comunes = Object.keys(porHref).filter(function (href) {
      const paginas = {};
      Object.keys(porHref[href].nombres).forEach(function (n) {
        porHref[href].nombres[n].paginas.forEach(function (u) { paginas[u] = true; });
      });
      return Object.keys(paginas).length >= 2;
    });
    comunes.forEach(function (href) {
      const noms = Object.keys(porHref[href].nombres);
      if (noms.length < 2) return;
      // Las dos variantes tienen que verse en páginas DISTINTAS: si conviven en la
      // misma página son dos enlaces distintos, no una identificación incoherente.
      const enPaginasDistintas = noms.some(function (a) {
        return noms.some(function (b) {
          if (a === b) return false;
          return porHref[href].nombres[a].paginas.some(function (u) {
            return porHref[href].nombres[b].paginas.indexOf(u) === -1;
          });
        });
      });
      if (!enPaginasDistintas) return;
      // ¿Uno contiene a otro? Entonces es matiz, no contradicción.
      const anidados = noms.every(function (a) {
        return noms.some(function (b) { return b !== a && (b.indexOf(a) !== -1 || a.indexOf(b) !== -1); });
      });
      const detalle = href + " → " + noms.map(function (n) { return "«" + porHref[href].nombres[n].crudo + "»"; }).join(" / ");
      (anidados ? revisiones : fallas).push({ href: href, detalle: detalle, locator: porHref[href].locator });
    });

    const out = [];
    if (fallas.length) {
      out.push(F("3.2.4", "falla", "moderada",
        [fallas.length + " destino(s) se identifican con nombres distintos en páginas distintas: " + fallas.slice(0, 5).map(function (f) { return f.detalle; }).join(" · ")],
        fallas.slice(0, 8).map(function (f) { return { locator: f.locator, name: f.href }; })));
    }
    if (revisiones.length) {
      out.push(F("3.2.4", "revisar", null,
        [revisiones.length + " destino(s) usan variantes del mismo nombre (uno contiene al otro): " + revisiones.slice(0, 5).map(function (r) { return r.detalle; }).join(" · ") + ". Comprueba si la diferencia desorienta."],
        revisiones.slice(0, 8).map(function (r) { return { locator: r.locator, name: r.href }; })));
    }
    if (!out.length) {
      out.push(comunes.length
        ? F("3.2.4", "cumple", null, ["Los " + comunes.length + " destinos que aparecen en dos o más páginas de la muestra se identifican siempre con el mismo nombre."])
        : F("3.2.4", "revisar", null, ["Ningún destino se repite entre las páginas de la muestra (" + (huellas || []).length + " página(s)): no hay nada que comparar, así que la coherencia de identificación NO se ha comprobado."]));
    }
    return out;
  }

  /**
   * 3.2.6 Ayuda coherente (WCAG 2.2, nivel A).
   *
   * El criterio habla de DÓNDE está la ayuda, no de en qué orden aparecen unos
   * mecanismos respecto de otros. Comparar el orden entre tipos distintos era
   * ruidoso: un «Contacto» en el menú y una «Ayuda» en el pie cambian de orden
   * relativo en cuanto una página mete un enlace contextual, sin que nada se haya
   * movido de sitio. Lo que sí es una incoherencia real es que el MISMO mecanismo
   * viva en la cabecera en una página y en el pie en otra.
   */
  function analyzeHelpConsistency(huellas) {
    const conAyuda = (huellas || []).filter(function (h) { return (h.ayuda || []).length; });
    if (!conAyuda.length) {
      // «No lo he encontrado» no es «no existe». La detección son unos cuantos
      // patrones sobre los enlaces visibles: un «Atención al cliente», un
      // <button>Asistencia</button> o un chat en un ancla interna se le escapan.
      // Declararlo conforme era dar por comprobado lo que no se miró.
      return [F("3.2.6", "revisar", null, [
        "No se han detectado mecanismos de ayuda con los patrones conocidos (contacto, ayuda, FAQ, soporte, chat) en las " +
        (huellas || []).length + " página(s) de la muestra. Confirma a mano que de verdad no los hay: si no existe ninguno, el criterio no aplica; si existe alguno que no se reconoció, hay que comprobar que está siempre en el mismo sitio."
      ])];
    }
    if (conAyuda.length < 2) {
      return [F("3.2.6", "revisar", null, ["Solo una página de la muestra ofrece ayuda (" + conAyuda[0].ayuda.map(function (a) { return a.tipo; }).join(", ") + "): hace falta más de una para comparar."])];
    }

    // Dónde aparece cada tipo de ayuda, página a página.
    const porTipo = {};
    conAyuda.forEach(function (h) {
      h.ayuda.forEach(function (a) {
        if (!porTipo[a.tipo]) porTipo[a.tipo] = {};
        const r = a.region || "otra";
        if (!porTipo[a.tipo][r]) porTipo[a.tipo][r] = [];
        if (porTipo[a.tipo][r].indexOf(h.url) === -1) porTipo[a.tipo][r].push(h.url);
      });
    });

    const movidos = Object.keys(porTipo).filter(function (t) { return Object.keys(porTipo[t]).length > 1; });
    if (movidos.length) {
      return [F("3.2.6", "falla", "moderada", movidos.slice(0, 4).map(function (t) {
        const regs = porTipo[t];
        return "El mecanismo de ayuda «" + t + "» cambia de sitio entre páginas: " +
          Object.keys(regs).map(function (r) { return r + " en " + regs[r].slice(0, 3).map(function (u) { return u || "(página)"; }).join(", "); }).join(" · ") + ".";
      }))];
    }

    // Mismo sitio. Dentro de una misma región, el orden relativo sí debe mantenerse.
    const seqEnRegion = function (h, region) {
      return h.ayuda.filter(function (a) { return (a.region || "otra") === region; }).map(function (a) { return a.tipo; });
    };
    const regiones = {};
    conAyuda.forEach(function (h) { h.ayuda.forEach(function (a) { regiones[a.region || "otra"] = 1; }); });
    const desordenes = [];
    Object.keys(regiones).forEach(function (r) {
      const base = conAyuda.find(function (h) { return seqEnRegion(h, r).length >= 2; });
      if (!base) return;
      conAyuda.forEach(function (h) {
        if (h === base) return;
        const inv = ordenRelativo(seqEnRegion(base, r), seqEnRegion(h, r));
        if (inv) desordenes.push({ region: r, pagina: h.url, inv: inv });
      });
    });
    if (desordenes.length) {
      return [F("3.2.6", "falla", "moderada", desordenes.slice(0, 4).map(function (d) {
        return "En " + (d.pagina || "(página)") + ", dentro de «" + d.region + "», la ayuda cambia de orden: «" + d.inv.despues + "» antes que «" + d.inv.antes + "».";
      }))];
    }

    const tipos = Object.keys(porTipo);
    const ev = ["Los mecanismos de ayuda (" + tipos.join(", ") + ") aparecen siempre en la misma parte de la página (" +
      tipos.map(function (t) { return t + " → " + Object.keys(porTipo[t])[0]; }).join(", ") + ") en las " + conAyuda.length + " páginas que los ofrecen."];
    const faltan = (huellas || []).filter(function (h) { return !(h.ayuda || []).length; });
    if (faltan.length) ev.push(faltan.length + " página(s) de la muestra no ofrecen ninguno; el criterio no les aplica, pero comprueba que sea intencionado.");
    return [F("3.2.6", "cumple-parcial", null, ev)];
  }

  /**
   * 2.4.5 Múltiples vías: es un criterio de SITIO, no de página. Se mira la unión
   * de mecanismos en toda la muestra.
   */
  function analyzeMultipleWays(huellas) {
    const hs = huellas || [];
    if (!hs.length) return [];
    const union = { buscador: false, mapaWeb: false, indice: false, navegacion: false };
    hs.forEach(function (h) { Object.keys(union).forEach(function (k) { if (h.vias && h.vias[k]) union[k] = true; }); });
    const ETQ = { buscador: "buscador", mapaWeb: "mapa web", indice: "índice o directorio", navegacion: "navegación del sitio" };
    const hay = Object.keys(union).filter(function (k) { return union[k]; });
    if (hay.length >= 2) {
      return [F("2.4.5", "cumple", null, ["El sitio ofrece " + hay.length + " vías para localizar una página: " + hay.map(function (k) { return ETQ[k]; }).join(", ") + "."])];
    }
    // Encontrar DOS vías en una sola página sí demuestra que el sitio las ofrece.
    // No encontrarlas, en cambio, no demuestra nada si solo se ha mirado una
    // página: el mapa web puede estar en el pie de otra. Un criterio de sitio no
    // se falla desde una página suelta.
    if (hs.length < 2) {
      return [F("2.4.5", "revisar", null, [
        "Solo hay " + hs.length + " página en la muestra y se detecta" + (hay.length ? "n " + hay.length + " vía(s): " + hay.map(function (k) { return ETQ[k]; }).join(", ") : " ninguna vía") +
        ". 2.4.5 es un criterio de SITIO: añade más páginas a la muestra antes de dictaminar."
      ])];
    }
    if (hay.length === 1) {
      return [F("2.4.5", "revisar", null, [
        "Solo se detecta una vía para localizar páginas (" + ETQ[hay[0]] + "). WCAG exige al menos dos, salvo que la página sea un paso de un proceso — eso no lo puede determinar el agente."
      ])];
    }
    return [F("2.4.5", "falla", "moderada", ["No se detecta ninguna vía para localizar páginas: ni buscador, ni mapa web, ni índice, ni una navegación con varios enlaces."])];
  }

  /** Los cuatro criterios de coherencia sobre la muestra. */
  function analyzeCoherence(huellas) {
    if (!huellas || !huellas.length) return [];
    return [].concat(
      analyzeMultipleWays(huellas),
      analyzeNavConsistency(huellas),
      analyzeIdConsistency(huellas),
      analyzeHelpConsistency(huellas)
    );
  }

  /* ── Código inyectable: la huella se toma DENTRO de la página real ───────── */

  const FN_SRC =
    "var AYUDA = [" + AYUDA.map(function (a) { return "{tipo:" + JSON.stringify(a.tipo) + ",re:" + String(a.re) + "}"; }).join(",") + "];\n" +
    "var MAPA_RE = " + String(MAPA_RE) + ";\n" +
    "var INDICE_RE = " + String(INDICE_RE) + ";\n" +
    [normalizarHref, tipoAyuda, tagOf, ocultoEl, loc, regionDe, nombreDe, fingerprintPage]
      .map(function (f) { return String(f).replace(/^export\s+/, ""); }).join("\n");

  /**
   * Cuerpo para `page.evaluate(new Function("url", FINGERPRINT_BODY))`.
   *
   * Se ejecuta en la página, con su `window`, para que `getComputedStyle` descarte
   * lo que el CSS oculta — el menú móvil duplicado, sobre todo.
   */
  const FINGERPRINT_BODY = FN_SRC + "\nreturn fingerprintPage(document, url, window);";

  /** Versión envuelta para la extensión de Chrome. */
  const FINGERPRINT_SRC = "(function(){\n" + FN_SRC +
    "\nwindow.__a11yHuella = function(url){ return fingerprintPage(document, url || location.href, window); };\n})();";
  NS.normalizarHref = normalizarHref;
  NS.normalizarNombre = normalizarNombre;
  NS.fingerprintPage = fingerprintPage;
  NS.ordenRelativo = ordenRelativo;
  NS.analyzeNavConsistency = analyzeNavConsistency;
  NS.analyzeIdConsistency = analyzeIdConsistency;
  NS.analyzeHelpConsistency = analyzeHelpConsistency;
  NS.analyzeMultipleWays = analyzeMultipleWays;
  NS.analyzeCoherence = analyzeCoherence;
  NS.FINGERPRINT_BODY = FINGERPRINT_BODY;
  NS.FINGERPRINT_SRC = FINGERPRINT_SRC;
})(A11Y);

/* ── viewport.js ── */
(function (NS) {
  const { WCAG22, enClause } = NS;
  /**
   * Adaptación del contenido — análisis PURO de las trazas de viewport.
   *
   * Cinco criterios que el motor marcaba `revisar` a ciegas, sin mirar nada, y que
   * en realidad son MECÁNICOS: se aplica un cambio (estrechar, agrandar el texto,
   * forzar el espaciado, girar) y se mide qué se rompe. Es exactamente el
   * procedimiento manual de la Guía Técnica del OAW —el bookmarklet de Text
   * Spacing, el zoom al 400 %— hecho por el agente.
   *
   *   1.4.4  Redimensionar el texto        (AA)
   *   1.4.10 Reflujo                       (AA)
   *   1.4.12 Espaciado del texto           (AA)
   *   1.4.13 Contenido al recibir foco o puntero (AA)
   *   1.3.4  Orientación                   (AA)
   *
   * El principio de siempre: estas funciones distinguen «lo he medido y está mal»
   * de «no he podido medirlo». Un recorte medido es `falla`; una excepción posible
   * o una traza incompleta es `revisar`.
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
  function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "AA") }; }
  function F(n, verdict, sev, evid, nodes) {
    const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "adaptación", origen: "medición", en: enClause(n) };
    if (nodes && nodes.length) f.nodes = nodes;
    return f;
  }
  function nodesOf(list, max) {
    return (list || []).slice(0, max || 10).map(function (x) { return { locator: x.locator, name: x.detalle || "" }; });
  }

  /**
   * Contenido que la propia WCAG exime de reflujo por «uso esencial»: lo que pierde
   * sentido si se reorganiza en una columna. No es una falla automática, pero
   * tampoco un aprobado: lo marcamos para que una persona confirme la excepción.
   */
  const EXENTOS_REFLUJO = ["table", "img", "svg", "canvas", "iframe", "video", "object", "embed", "pre", "code"];
  function esExento(o) {
    if (EXENTOS_REFLUJO.indexOf(String(o.tag || "").toLowerCase()) !== -1) return true;
    const r = String(o.role || "").toLowerCase();
    return r === "img" || r === "table" || r === "grid" || r === "treegrid" || r === "application";
  }

  /**
   * 1.4.10 Reflujo: a 320 px CSS de ancho (equivale al 400 % sobre 1280) el
   * contenido no puede exigir desplazamiento horizontal.
   * @param {{ w:number, h:number, scrollWidth:number, clientWidth:number,
   *           offenders?:Array<{locator:string, tag?:string, role?:string, ancho?:number, detalle?:string}> }} trace
   */
  function analyzeReflow(trace) {
    if (!trace || trace.clientWidth == null) return [];
    const exceso = Math.round(trace.scrollWidth - trace.clientWidth);
    const donde = " a " + trace.w + "×" + trace.h + " px CSS";
    /* El contenido RECORTADO cuenta, y cuenta antes que la barra.
     *
     * Dictaminando solo por el desplazamiento horizontal, un desbordamiento escondido
     * con `overflow:hidden` no produce barra, `scrollWidth` del documento no crece, y
     * 1.4.10 salía «cumple» con cientos de píxeles de texto ocultos e inalcanzables a
     * 320 px CSS. El criterio no habla de barras: exige que no haya pérdida de
     * información ni de funcionalidad. Esconder lo que no cabe es peor que la barra,
     * porque ni se ve que falte algo. */
    const rec = (trace.recortados || []).filter(function (r) { return !r.alcanzable; });
    if (rec.length) {
      return [F("1.4.10", "falla", "grave", [
        rec.length + " bloque(s) de contenido se RECORTAN" + donde + " y lo que sobra no se puede alcanzar: el desbordamiento está oculto con " +
        "`overflow:" + rec[0].overflow + "`, así que no hay barra ni forma de desplazarlo. " +
        rec.slice(0, 6).map(function (r) { return r.locator + " (" + r.px + " px ocultos, termina en «…" + r.muestra + "»)"; }).join(" · ") +
        (rec.length > 6 ? " · …" : "") + ". 1.4.10 exige que no haya pérdida de información, no solo que no haya barra horizontal."
      ], nodesOf(rec))];
    }
    if (exceso <= 2) {
      const tapado = (trace.recortados || []).filter(function (r) { return r.alcanzable; });
      if (tapado.length) {
        return [F("1.4.10", "revisar", null, [
          "Sin desplazamiento horizontal" + donde + ", pero " + tapado.length + " contenedor(es) esconden contenido que no les cabe (" +
          tapado.slice(0, 4).map(function (r) { return r.locator + ", " + r.px + " px"; }).join(" · ") +
          "). Tienen controles dentro, así que el teclado sí arrastra el contenedor al enfocarlos; comprueba que con el ratón y a la vista también se llegue, porque no hay barra."
        ], nodesOf(tapado))];
      }
      return [F("1.4.10", "cumple", null, ["Sin desplazamiento horizontal ni contenido recortado" + donde + " (equivale al 400 % sobre 1280 px)."])];
    }
    const off = trace.offenders || [];
    const todosExentos = off.length > 0 && off.every(esExento);
    if (todosExentos) {
      return [F("1.4.10", "revisar", null, [
        "Hay " + exceso + " px de desplazamiento horizontal" + donde + ", pero todo lo que desborda es contenido que WCAG puede eximir por uso esencial (" +
        off.slice(0, 6).map(function (o) { return o.locator; }).join(", ") + "). Confirma que la excepción aplica."
      ], nodesOf(off))];
    }
    return [F("1.4.10", "falla", "grave", [
      "El contenido exige desplazamiento horizontal" + donde + ": " + exceso + " px de exceso. " +
      (off.length ? "Desbordan " + off.length + " elemento(s): " + off.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (off.length > 6 ? "…" : "") : "No se ha podido señalar el elemento concreto.")
    ], nodesOf(off))];
  }

  // Recorte medido: el elemento no cabía y su desbordamiento queda OCULTO. Si
  // desborda con barra de desplazamiento, el contenido sigue siendo alcanzable.
  function informeRecorte(n, etiqueta, cambio, trace, sevFalla) {
    // Sin traza no hay nada que decir: el criterio no se ha mirado. Distinto de
    // `aplicado:false`, que sí es información — se intentó medir y no se pudo.
    if (!trace) return [];
    if (!trace.aplicado) {
      return [F(n, "revisar", null, ["No se pudo aplicar " + cambio + " sobre la página (" + ((trace && trace.motivo) || "motivo desconocido") + "): queda por comprobar a mano."])];
    }
    const rec = trace.recortados || [];
    const sup = trace.solapados || [];
    const prev = trace.previos || [];
    if (!rec.length && !sup.length) {
      // Nada empeora con el cambio. Si YA había contenido recortado de serie, eso
      // no lo causa el cambio —así que no es una falla de este criterio— pero es
      // pérdida de contenido real y no se puede dar por bueno en silencio.
      if (prev.length) {
        return [F(n, "revisar", null, [
          "Con " + cambio + " no empeora nada, pero " + prev.length + " bloque(s) YA venían con contenido recortado antes del cambio: " +
          prev.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (prev.length > 6 ? "…" : "") +
          ". No lo provoca " + cambio + ", pero hay texto que no se puede leer: compruébalo."
        ], nodesOf(prev))];
      }
      const cob = trace.cobertura;
      if (cob && cob.truncado) {
        // Con el tope, lo no medido quedaba fuera sin una palabra: la misma tarjeta
        // que se recorta daba «falla» sola y «cumple» detrás de 400 párrafos.
        return [F(n, "revisar", null, ["Con " + cambio + " no se recorta ni se solapa ningún bloque de texto de los " + cob.medidos +
          " medidos, pero la página tiene " + cob.total + ": el resto NO se ha comprobado. Sube el límite para dictaminar."])];
      }
      /* Y «cumple» solo si el cambio SURTIÓ EFECTO.
       *
       * `html{font-size:200%}` no toca nada cuando los tamaños están en `px`, que es
       * lo normal, y el criterio salía «cumple · con el texto al 200 % no se recorta
       * ni se solapa ningún bloque» sobre una medición de efecto nulo. Ahora la fase
       * dice por qué vía consiguió duplicarlo; si no lo consiguió por ninguna, no hay
       * nada medido que declarar conforme. */
      const ef = trace.efecto;
      if (ef && ef.muestra && !ef.crecioConLaRaiz && !ef.escalados) {
        return [F(n, "revisar", null, [
          "No se ha podido aplicar " + cambio + " a la página: ni cambiando el tamaño de la raíz ni escalando los elementos con texto. " +
          "No hay medición, así que el criterio queda por comprobar a mano (con el zoom de texto del navegador, no el de página)."
        ])];
      }
      return [F(n, "cumple", null, ["Con " + cambio + " no se recorta ni se solapa ningún bloque de texto (" + (trace.revisados || 0) + " elementos medidos" +
        (ef && ef.via && ef.via !== "raiz" ? "; el tamaño de la raíz no bastaba —la página declara el texto en px— y se escaló el tamaño computado de " + ef.escalados + " elemento(s), que es lo que hace el zoom de texto del navegador" : "") + ")."])];
    }
    const ev = [];
    if (rec.length) ev.push(rec.length + " bloque(s) de texto se recortan al aplicar " + cambio + " (el contenido queda oculto, sin barra de desplazamiento): " +
      rec.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (rec.length > 6 ? "…" : "") + ".");
    if (sup.length) ev.push(sup.length + " bloque(s) se solapan con el contenido contiguo: " + sup.slice(0, 6).map(function (o) { return o.locator; }).join(", ") + ".");
    return [F(n, rec.length ? "falla" : "revisar", rec.length ? sevFalla : null, ev, nodesOf(rec.concat(sup)))];
  }

  /**
   * 1.4.4 Redimensionar el texto: al 200 % el contenido y la funcionalidad siguen
   * disponibles, sin pérdida por recorte.
   */
  function analyzeResize(trace) {
    return informeRecorte("1.4.4", "Redimensionar el texto", "el texto al 200 %", trace, "grave");
  }

  /**
   * 1.4.12 Espaciado del texto: line-height 1.5, letter-spacing 0.12em,
   * word-spacing 0.16em y 2em entre párrafos, sin pérdida de contenido.
   */
  function analyzeTextSpacing(trace) {
    return informeRecorte("1.4.12", "Espaciado del texto", "el espaciado de 1.4.12", trace, "grave");
  }

  /**
   * 1.3.4 Orientación: el contenido no se restringe a una sola orientación.
   * @param {{ bloqueoJS?:boolean, mediaBloqueante?:Array<string>, textoVertical?:number, textoHorizontal?:number }} trace
   */
  function analyzeOrientation(trace) {
    if (!trace) return [];
    const out = [];
    if (trace.bloqueoJS) {
      out.push(F("1.3.4", "falla", "grave", ["La página llama a <code>screen.orientation.lock()</code>: fuerza una orientación concreta."]));
      return out;
    }
    if ((trace.mediaBloqueante || []).length) {
      out.push(F("1.3.4", "revisar", null, ["Hay reglas CSS que ocultan contenido según la orientación (" + trace.mediaBloqueante.slice(0, 3).join(" · ") + "): comprueba que no se pierda nada al girar."]));
      return out;
    }
    const v = trace.textoVertical || 0, h = trace.textoHorizontal || 0;
    if (v && h) {
      const perdida = Math.round((1 - Math.min(v, h) / Math.max(v, h)) * 100);
      if (perdida >= 15) {
        out.push(F("1.3.4", "revisar", null, ["Al girar el dispositivo cambia un " + perdida + " % la cantidad de texto visible (" + h + " → " + v + " caracteres): revisa que no se pierda contenido en una de las orientaciones."]));
      } else {
        out.push(F("1.3.4", "cumple", null, ["El contenido se mantiene en vertical y en horizontal (diferencia del " + perdida + " %) y no hay bloqueo de orientación."]));
      }
    }
    return out;
  }

  /**
   * 1.4.13 Contenido al recibir foco o puntero: lo que aparece al pasar el puntero
   * o al enfocar debe poder descartarse (Esc), poder señalarse con el puntero sin
   * que desaparezca, y persistir hasta que se retire.
   *
   * El atributo `title` está EXENTO de este criterio, y esto emitía un `falla` por él.
   *
   * El texto normativo de 1.4.13 termina así: «Exception: The visual presentation of
   * the additional content is controlled by the user agent and is not modified by the
   * author». El tooltip nativo del navegador es exactamente eso — lo pinta el agente
   * de usuario y el autor no lo toca—, así que no se puede fallar 1.4.13 por usar
   * `title`. Se emitía `falla` moderada en cualquier página con un `<abbr title>`.
   *
   * Que `title` sea mala idea sigue siendo verdad, pero por otras vías: no se alcanza
   * con teclado ni con el dedo, y el soporte en lectores es desigual. Eso aterriza en
   * 1.1.1, 2.5.3 y 4.1.2 según el caso, no aquí. Así que se dice, y se dice donde
   * corresponde, sin colgarle al criterio una barrera que su propia excepción excluye.
   *
   * @param {{ titles?:Array<{locator:string, texto:string, tieneNombre?:boolean}>,
   *           hovers?:Array<{locator:string, descartable?:boolean, señalable?:boolean}> }} trace
   */
  function analyzeHoverContent(trace) {
    if (!trace) return [];
    const out = [];
    const titles = (trace.titles || []).filter(function (t) { return t.texto && t.texto.trim(); });
    if (titles.length) {
      /* Y va como `revisar`, no como `falla`: la excepción del criterio lo excluye.
       * Lo que queda por decidir no es 1.4.13, sino si esa información solo está ahí
       * —y entonces el problema es de otro criterio—. */
      const sinNombre = titles.filter(function (t) { return t.tieneNombre === false; });
      out.push(F("1.4.13", "revisar", null, [
        titles.length + " elemento(s) llevan el atributo <code>title</code>. El tooltip nativo lo pinta el navegador y el autor no lo modifica, así que la EXCEPCIÓN de 1.4.13 lo excluye: no es una barrera de este criterio. " +
        titles.slice(0, 6).map(function (t) { return t.locator + " «" + String(t.texto).slice(0, 30) + "»"; }).join(", ") + (titles.length > 6 ? "…" : "") + ".",
        "Lo que sí hay que comprobar: que esa información no esté SOLO en el `title`, porque no se alcanza con teclado ni con el dedo y el soporte en lectores es desigual. Si es la única vía, la barrera es de 1.1.1, 2.5.3 o 4.1.2, según lo que aporte." +
          (sinNombre.length ? " Ojo a " + sinNombre.length + " de ellos, que además no tienen otro nombre accesible." : "")
      ], nodesOf(titles.map(function (t) { return { locator: t.locator, detalle: t.texto }; }))));
    }
    // Acepta los dos juegos de nombres: la sonda real emite `descartableConEsc` y
    // `senalable` (sin eñe, que viaja mejor dentro del código inyectado).
    const noDescartable = function (h) { return h.descartable === false || h.descartableConEsc === false; };
    const noSenalable = function (h) { return h["señalable"] === false || h.senalable === false; };
    const rotos = (trace.hovers || []).filter(function (h) { return noDescartable(h) || noSenalable(h); });
    if (rotos.length) {
      out.push(F("1.4.13", "falla", "grave", [
        rotos.length + " contenido(s) emergente(s) incumplen: " + rotos.slice(0, 6).map(function (h) {
          const q = [];
          if (noDescartable(h)) q.push("no se descarta con Esc");
          if (noSenalable(h)) q.push("desaparece al llevar el puntero encima");
          return h.locator + " (" + q.join(" y ") + ")";
        }).join(", ")
      ], nodesOf(rotos)));
    }
    const sanos = (trace.hovers || []).length - rotos.length;
    if (!titles.length && !rotos.length) {
      if (sanos > 0) {
        out.push(F("1.4.13", "cumple", null, [sanos + " contenido(s) emergente(s) se descartan con Esc y se pueden señalar con el puntero."]));
      } else if (!trace.hoverProbado) {
        // No haber encontrado `title` no es haber probado el contenido emergente.
        // Un tooltip hecho con `:hover` en CSS —que no se cierra con Esc y
        // desaparece al mover el puntero— es una falla de libro de 1.4.13, y esto
        // lo daba por conforme.
        out.push(F("1.4.13", "revisar", null, [
          "No se han encontrado atributos <code>title</code>, y la sonda de puntero NO llegó a ejecutarse en esta pasada (la capa de adaptación no corrió, o falló). Sin ella no se ha comprobado ningún contenido emergente: compruébalo a mano o vuelve a ejecutar con la capa de viewport activa."
        ]));
      } else {
        const dis = trace.disparadores || 0;
        out.push(F("1.4.13", "cumple", null, [
          "Se ha pasado el puntero por " + dis + " disparador(es) de contenido emergente encontrados en el CSS y no ha aparecido ninguno problemático; tampoco hay atributos <code>title</code> usados como tooltip." +
          (trace.hojasBloqueadas ? " (" + trace.hojasBloqueadas + " hoja(s) de otro origen no se han podido leer: puede haber disparadores fuera de alcance.)" : "")
        ]));
      }
    }
    return out;
  }

  /** Agrega las cinco trazas en una sola lista de hallazgos. */
  function analyzeViewport(traces) {
    traces = traces || {};
    return [].concat(
      analyzeReflow(traces.reflow),
      analyzeResize(traces.resize),
      analyzeTextSpacing(traces.spacing),
      analyzeOrientation(traces.orientation),
      analyzeHoverContent(traces.hover)
    );
  }
  NS.EXENTOS_REFLUJO = EXENTOS_REFLUJO;
  NS.analyzeReflow = analyzeReflow;
  NS.analyzeResize = analyzeResize;
  NS.analyzeTextSpacing = analyzeTextSpacing;
  NS.analyzeOrientation = analyzeOrientation;
  NS.analyzeHoverContent = analyzeHoverContent;
  NS.analyzeViewport = analyzeViewport;
})(A11Y);

/* ── dynamic.js ── */
(function (NS) {
  const { WCAG22, enClause } = NS;
  /**
   * Prueba dinámica de widgets — análisis PURO de la traza capturada.
   *
   * Un driver (Playwright o la extensión) opera la página de verdad —tabula, abre,
   * expande, cambia de pestaña, envía formularios— y captura qué pasó. Estas
   * funciones interpretan esa traza y emiten veredictos. Son puras y testeables sin
   * navegador; el driver vive en dynamic-analyze.js.
   *
   * Principio: el driver distingue "he comprobado y está mal" de "no he podido
   * comprobarlo". Estas funciones NUNCA convierten lo segundo en una falla. Si el
   * clic no llegó a ocurrir, o si se agotó el presupuesto de tabulaciones, el
   * veredicto es `revisar`, no `falla`.
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
  function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "A") }; }
  function F(n, verdict, sev, evid, nodes) {
    const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "dinámico", en: enClause(n) };
    if (nodes && nodes.length) f.nodes = nodes;
    return f;
  }
  // Identidad estable de un control en la traza: el uid único del driver si lo hay,
  // y si no el locator legible (que PUEDE colisionar — por eso el driver manda uid).
  function key(x) { return (x && (x.uid || x.locator)) || null; }
  function nodesOf(list) {
    return (list || []).slice(0, 12).map(function (x) { return { locator: x.locator, name: x.name || "" }; });
  }

  /**
   * Operabilidad por teclado real: ¿la tabulación alcanza todos los controles?
   * @param {{ focusables:Array<{locator:string,uid?:string}>, reached:Array<{locator:string,uid?:string}>,
   *           trapped?:boolean, exhausted?:boolean, tabs?:number }} trace
   */
  function analyzeTabTrace(trace) {
    const out = [];
    trace = trace || {};
    const reached = new Set((trace.reached || []).map(key));
    const focusables = trace.focusables || [];
    const unreached = focusables.filter(function (f) { return !reached.has(key(f)); });
    const inter = trace.interactivos || { sueltos: [], enCompuesto: [] };
    const sueltos = inter.sueltos || [];
    const enCompuesto = inter.enCompuesto || [];

    if (trace.trapped) {
      out.push(F("2.1.2", "falla", "crítica", [
        "El foco queda atrapado con Tab: no se puede salir del componente solo con teclado." +
        (trace.atrapadoEn && trace.atrapadoEn.length
          ? " El recorrido cicla entre " + trace.atrapadoEn.length + " control(es) —" + trace.atrapadoEn.slice(0, 6).join(" → ") +
            "— y no vuelve a salir, con " + unreached.length + " control(es) del resto de la página sin alcanzar."
          : "")
      ], (trace.atrapadoEn || []).slice(0, 8).map(function (l) { return { locator: l, name: "" }; })));
    }

    /* 2.1.1 sobre los controles INTERACTIVOS que no son enfocables.
     *
     * Es el fallo de libro del criterio y no se estaba mirando: el driver enumeraba
     * lo que YA era enfocable, así que un `div role="button"` sin `tabindex` no
     * entraba en la lista, no había nada «sin alcanzar», y el análisis emitía 2.1.1
     * `cumple` con la frase «Todos los controles interactivos se alcanzan con Tab».
     * Cinco barreras reales invisibles, y la afirmación hecha sin haber mirado uno.
     *
     * Los de un widget compuesto con su parada de tabulación (tablist, listbox…) NO
     * son barrera: el patrón ARIA correcto es una sola parada y las flechas por
     * dentro. Pero esta prueba no recorre las flechas, así que tampoco puede firmar
     * que ese widget se opere con teclado: se dice, y el criterio no se cierra. */
    if (sueltos.length) {
      out.push(F("2.1.1", "falla", "grave", [
        sueltos.length + " control(es) con rol de widget no pueden recibir el foco: no son alcanzables con teclado de ninguna manera (sin `tabindex`, y sin un widget compuesto que gestione el foco por ellos). " +
        sueltos.slice(0, 6).map(function (x) { return x.locator + " (role=" + x.rol + ")"; }).join(", ") + (sueltos.length > 6 ? "…" : "")
      ], nodesOf(sueltos)));
    }

    if (!focusables.length && !sueltos.length && !enCompuesto.length) return out;

    // ¿Se ha medido la tabulación? Si la fase se cayó, lo que falta NO se ha comprobado.
    if (trace.medida === false) {
      out.push(F("2.1.1", "revisar", null, [
        "La prueba de tabulación no llegó a ejecutarse (la fase falló), así que de los " + focusables.length +
        " control(es) enfocables de la página no se sabe si se alcanzan: no es que no se alcancen. Mira los errores de la ejecución y repítela."
      ], nodesOf(focusables)));
      return out;
    }

    if (!unreached.length && !sueltos.length) {
      if (enCompuesto.length) {
        out.push(F("2.1.1", "cumple-parcial", null, [
          "Todos los controles enfocables se alcanzan con Tab (" + focusables.length + "). Además hay " + enCompuesto.length +
          " control(es) dentro de widgets compuestos (" + enCompuesto.slice(0, 3).map(function (x) { return x.compuesto; }).join(", ") +
          ") que por diseño no son tabulables y se operan con las flechas: el patrón es el correcto, pero esta prueba no recorre las flechas, así que esa parte queda por comprobar a mano."
        ], nodesOf(enCompuesto)));
        return out;
      }
      out.push(F("2.1.1", "cumple", null, ["Todos los controles enfocables se alcanzan con Tab (" + focusables.length + "), y no hay ningún control con rol de widget que no pueda recibir el foco."]));
      return out;
    }
    if (!unreached.length) return out;   // lo de `sueltos` ya se ha dicho arriba
    // No se alcanzaron todos. ¿Es una barrera o es que no terminamos de mirar?
    // Si la tabulación se cortó (trampa de foco o presupuesto agotado), lo que falta
    // NO está comprobado: pedir revisión en vez de declarar falla.
    if (trace.trapped || trace.exhausted) {
      out.push(F("2.1.1", "revisar", null, [
        "La tabulación se interrumpió " + (trace.trapped ? "por una trampa de foco" : "al agotar el presupuesto de " + (trace.tabs || "?") + " pulsaciones") +
        " con " + unreached.length + " control(es) sin alcanzar: no se puede afirmar que sean inalcanzables. Repite la prueba con un presupuesto mayor o revisa a mano."
      ], nodesOf(unreached)));
      return out;
    }
    out.push(F("2.1.1", "falla", "grave", [
      unreached.length + " controle(s) no se alcanzan tabulando: " +
      unreached.slice(0, 6).map(function (u) { return u.locator; }).join(", ") + (unreached.length > 6 ? "…" : "")
    ], nodesOf(unreached)));
    return out;
  }

  /**
   * Disclosure / expandible: al activar, ¿cambia aria-expanded y el contenido controlado?
   * @param {Array<{locator:string, name?:string, clicked?:boolean, expandedBefore:string,
   *                expandedAfter:string, targetShownBefore?:boolean, targetShownAfter?:boolean}>} events
   */
  function analyzeDisclosure(events) {
    const out = [];
    (events || []).forEach(function (e) {
      const who = e.locator + (e.name ? " «" + e.name + "»" : "");
      const nodes = [{ locator: e.locator, name: e.name || "" }];
      // Si la activación no llegó a ocurrir, no hay nada medido: no inventamos una falla.
      if (e.clicked === false) {
        out.push(F("4.1.2", "revisar", null, [
          who + ": no se pudo activar automáticamente (" + (e.reason || "el control no responde al clic sintético") +
          "): el cambio de estado queda sin comprobar."
        ], nodes));
        return;
      }
      if (e.expandedBefore === e.expandedAfter) {
        out.push(F("4.1.2", "falla", "grave", ["Al activar " + who + ", <code>aria-expanded</code> no cambia (" + e.expandedBefore + "): el estado no se expone tras la interacción."], nodes));
      } else if (e.targetShownBefore != null && e.targetShownAfter != null && e.targetShownBefore === e.targetShownAfter) {
        out.push(F("4.1.2", "revisar", null, [who + ": aria-expanded cambia (" + e.expandedBefore + "→" + e.expandedAfter + ") pero el contenido controlado no cambia de visibilidad."], nodes));
      } else {
        out.push(F("4.1.2", "cumple", null, [who + ": el estado y el contenido controlado cambian al activar (" + e.expandedBefore + "→" + e.expandedAfter + ")."], nodes));
      }
    });
    return out;
  }

  /**
   * Pestañas: al activar una pestaña, ¿se mueve aria-selected y se muestra su panel?
   * @param {Array<{locator:string, clicked?:boolean, selectedAfter:string, othersSelected:number, panelShown?:boolean}>} events
   */
  function analyzeTabs(events) {
    const out = [];
    (events || []).forEach(function (e) {
      const nodes = [{ locator: e.locator, name: e.name || "" }];
      if (e.clicked === false) {
        out.push(F("4.1.2", "revisar", null, [e.locator + ": no se pudo activar automáticamente (" + (e.reason || "sin respuesta al clic") + "): sin comprobar."], nodes));
      } else if (e.selectedAfter !== "true") {
        out.push(F("4.1.2", "falla", "grave", [e.locator + ": al activarla, aria-selected no pasa a true."], nodes));
      } else if (e.othersSelected > 0) {
        out.push(F("4.1.2", "revisar", null, [e.locator + ": hay " + e.othersSelected + " pestaña(s) más marcadas como seleccionadas a la vez."], nodes));
      } else if (e.panelShown === false) {
        out.push(F("1.3.1", "revisar", null, [e.locator + ": la pestaña se selecciona pero su tabpanel no se muestra."], nodes));
      } else {
        out.push(F("4.1.2", "cumple", null, [e.locator + ": selecciona y muestra su panel correctamente."], nodes));
      }
    });
    return out;
  }

  /**
   * Errores de formulario forzados: al enviar con datos inválidos, ¿se identifican
   * en texto y se anuncian?
   *
   * `trace.intercepted` indica que el envío se bloqueó antes de salir a la red (modo
   * seguro). No cambia el veredicto: la validación de cliente y el marcado ARIA se
   * producen igual; solo evita tocar el servidor ajeno.
   *
   * @param {{ submitted:boolean, intercepted?:boolean, hasAlert?:boolean,
   *           fields:Array<{locator:string, required:boolean, invalid:boolean,
   *                         describedbyText?:string, hasAlert?:boolean}> }} trace
   */
  function analyzeErrorState(trace) {
    const out = [];
    if (!trace || !trace.submitted) return out;
    const bad = (trace.fields || []).filter(function (f) { return f.required || f.invalid; });
    if (!bad.length) return out;
    /* 3.3.1 pide que el error se DESCRIBA EN TEXTO, no que esté asociado por ARIA.
     *
     * La técnica suficiente **G83** se satisface con texto de error visible junto al
     * campo, sin asociación programática (eso es 1.3.1 y 4.1.2, que son otros
     * criterios y tienen sus propias filas). Mirando solo `aria-describedby`, un
     * formulario que hace lo que manda G83 —desocultar «Error: el correo es
     * obligatorio» al lado del campo, más un `role="alert"` con el resumen— salía con
     * un `falla` **grave** de 3.3.1. Una barrera inventada sobre contenido conforme,
     * que es lo que destruye la credibilidad de un informe delante de un cliente.
     *
     * Así que el texto cuenta venga de donde venga: de `aria-describedby`, de
     * `aria-errormessage` o del entorno del campo (`errorCercaText`, que el driver
     * recoge). Si no hay texto en ninguna parte, entonces sí es 3.3.1; si hay texto
     * pero sin asociar, es 4.1.2 a revisar. */
    const textoDe = function (f) {
      return [f.describedbyText, f.errormessageText, f.errorCercaText]
        .map(function (t) { return String(t || "").trim(); }).filter(Boolean).join(" ");
    };
    const sinTexto = bad.filter(function (f) { return !textoDe(f); });
    const textoSinAsociar = bad.filter(function (f) {
      return textoDe(f) && !(f.describedbyText || f.errormessageText || "").trim();
    });
    const sinInvalid = bad.filter(function (f) { return !f.invalid; });
    const hayAlerta = (trace.fields || []).some(function (f) { return f.hasAlert; }) || trace.hasAlert;
    /* Y «se anuncian» hay que haberlo VISTO anunciar.
     *
     * `hasAlert` era la simple existencia de un `[role=alert]` o `[aria-live]` en
     * cualquier parte del documento, vacío o no, relacionado con el error o no. Con
     * eso se emitía `3.3.1 cumple` y la evidencia «los errores se identifican en
     * texto, exponen aria-invalid **y se anuncian**»: tres afirmaciones, y ninguna
     * comprobada. El driver compara ahora el contenido de las regiones live antes y
     * después del envío (`liveCambio`); mientras no conste ese cambio, el criterio no
     * se cierra como conforme. */
    const anuncioVisto = trace.liveCambio === true;

    if (sinTexto.length) out.push(F("3.3.1", "falla", "grave", [sinTexto.length + " campo(s) con error sin ninguna descripción en texto —ni asociada (aria-describedby/errormessage) ni visible junto al campo—: " + sinTexto.slice(0, 6).map(function (f) { return f.locator; }).join(", ") + "."], nodesOf(sinTexto)));
    if (textoSinAsociar.length) out.push(F("4.1.2", "revisar", null, [textoSinAsociar.length + " campo(s) tienen el texto del error al lado pero sin asociar por ARIA: cumple 3.3.1 (técnica G83) y deja 4.1.2 y 1.3.1 por comprobar. Elementos: " + textoSinAsociar.slice(0, 6).map(function (f) { return f.locator; }).join(", ") + "."], nodesOf(textoSinAsociar)));
    if (sinInvalid.length) out.push(F("4.1.2", "revisar", null, [sinInvalid.length + " campo(s) en error sin <code>aria-invalid=\"true\"</code>: el estado de error no se expone a la API."], nodesOf(sinInvalid)));
    if (!hayAlerta) out.push(F("4.1.3", "revisar", null, ["No se detecta un mensaje de estado (role=alert / aria-live) al enviar: revisa que el error se anuncie sin mover el foco."]));
    else if (!anuncioVisto) out.push(F("4.1.3", "revisar", null, ["Hay una región de estado (role=alert / aria-live) en la página, pero su contenido no ha cambiado al enviar: que exista el contenedor no quiere decir que el error se anuncie. Compruébalo con un lector."]));

    if (!sinTexto.length && !sinInvalid.length) {
      if (anuncioVisto && !textoSinAsociar.length) {
        out.push(F("3.3.1", "cumple", null, ["Los errores se identifican en texto asociado al campo, exponen <code>aria-invalid</code>, y el anuncio se ha visto producirse: el contenido de la región de estado cambió al enviar."]));
      } else {
        /* Se ha medido lo medible y falta juicio: ni falla ni conforme.
         *
         * Y se dice QUÉ se ha medido, que no es lo mismo que lo que pide el criterio.
         * Lo observado es que al enviar apareció texto nuevo junto al campo; que ese
         * texto describa el error —y no sea otra cosa que salió a la vez— lo juzga una
         * persona leyéndolo. Escribir «el error está descrito en texto» sería afirmar
         * el criterio a partir de un indicio. */
        out.push(F("3.3.1", "cumple-parcial", null, [
          (textoSinAsociar.length
            ? "Al enviar apareció texto nuevo junto a " + textoSinAsociar.length + " campo(s) en error, sin asociar por ARIA — que es lo que admite la técnica G83. Lee ese texto y comprueba que identifica el error: «" +
              textoDe(textoSinAsociar[0]).slice(0, 120) + "»."
            : "Cada campo en error tiene texto de error asociado por ARIA.") +
          (anuncioVisto ? "" : " Y no se ha podido comprobar que el error se ANUNCIE: la región de estado no cambió de contenido al enviar, o no se pudo observar.")
        ], nodesOf(textoSinAsociar.length ? textoSinAsociar : bad)));
      }
    }
    return out;
  }

  /**
   * 3.2.1 Al recibir el foco · 3.2.2 Al recibir entradas.
   *
   * Los dos criterios dicen lo mismo con dos disparadores distintos: enfocar un
   * control (3.2.1) o cambiar su valor (3.2.2) NO puede provocar por sí solo un
   * cambio de contexto —navegar a otra página, abrir una ventana, mover el foco a
   * otro sitio, sustituir el contenido— si no se ha avisado antes.
   *
   * Esto es medible con lo que la capa dinámica ya hace: tabula y pulsa. Lo único
   * que faltaba era mirar qué pasa DESPUÉS de enfocar y después de cambiar, y las
   * tres señales son observables: la URL, dónde está el foco, y una huella del
   * contenido visible.
   *
   * @param {Array<{locator:string, uid:string, disparador:"foco"|"entrada",
   *                navego:boolean, focoMovido:boolean, contenidoCambio:boolean}>} eventos
   */
  function analyzeContextChange(eventos, noSondados, censo) {
    const out = [];
    /* Lo que NO se ha sondado sale en la evidencia y, cuando no hay nada que
     * reprochar, también en el veredicto.
     *
     * El driver recorta la lista de candidatos con un tope (veinte por defecto) y
     * antes no se lo contaba a nadie: en una página de sesenta controles se sondaban
     * veinte y el criterio salía `pasa`, que `esConforme()` trata como conformidad.
     * Cuarenta controles sin tocar y 3.2.1 exportado como conforme en el IRA.
     *
     * `cumple-parcial` es la palabra exacta para esto —la parte medida está bien, el
     * resto no se ha mirado— y `esConforme()` ya la excluye. */
    const fuera = (censo && censo.total > censo.sondados) ? censo.total - censo.sondados : 0;
    const cola = (noSondados
      ? " " + noSondados + " control(es) no se pudieron sondar (la página se recargó o cambió durante la prueba): quedan sin comprobar."
      : "") + (fuera
      ? " Quedan " + fuera + " de " + censo.total + " control(es) sin sondar por el tope de la prueba (súbelo con `maxContexto`): de esos no se sabe nada."
      : "");
    const porCrit = { foco: "3.2.1", entrada: "3.2.2" };
    ["foco", "entrada"].forEach(function (disp) {
      const crit = porCrit[disp];
      const propios = (eventos || []).filter(function (e) { return e.disparador === disp; });
      if (!propios.length) return;

      const graves = propios.filter(function (e) { return e.navego; });
      const medios = propios.filter(function (e) { return !e.navego && (e.focoMovido || e.contenidoCambio); });
      const verbo = disp === "foco" ? "al recibir el foco" : "al cambiar su valor";

      if (graves.length) {
        out.push(F(crit, "falla", "grave", [
          graves.length + " control(es) provocan una NAVEGACIÓN " + verbo + ", sin que medie ninguna acción de la persona: " +
          graves.slice(0, 5).map(function (e) { return e.locator; }).join(", ") +
          ". Es el caso que " + crit + " prohíbe expresamente." + cola
        ], graves.slice(0, 8).map(function (e) { return { locator: e.locator, name: "", path: e.uid }; })));
      }
      if (medios.length) {
        out.push(F(crit, "revisar", null, [
          medios.length + " control(es) cambian algo " + verbo + " sin activarlos: " +
          medios.slice(0, 5).map(function (e) {
            const q = [];
            if (e.focoMovido) q.push("el foco salta a otro sitio");
            if (e.contenidoCambio) q.push("cambia el contenido visible");
            return e.locator + " (" + q.join(" y ") + ")";
          }).join(" · ") +
          ". " + crit + " lo permite si se ha avisado antes de que iba a pasar: comprueba si hay ese aviso."
        ], medios.slice(0, 8).map(function (e) { return { locator: e.locator, name: "", path: e.uid }; })));
      }
      if (!graves.length && !medios.length) {
        // Sin nada que reprochar, el veredicto depende de si se miró TODO.
        const completo = !fuera && !noSondados;
        out.push(F(crit, completo ? "pasa" : "cumple-parcial", null, [
          "Se han probado " + propios.length + " control(es) y ninguno provoca navegación, salto de foco ni sustitución de contenido " + verbo + "." + cola
        ]));
      }
    });
    return out;
  }
  NS.analyzeTabTrace = analyzeTabTrace;
  NS.analyzeDisclosure = analyzeDisclosure;
  NS.analyzeTabs = analyzeTabs;
  NS.analyzeErrorState = analyzeErrorState;
  NS.analyzeContextChange = analyzeContextChange;
})(A11Y);

/* ── axe-map.js ── */
(function (NS) {
  /**
   * Mapeo de resultados de axe-core a criterios WCAG.
   *
   * axe etiqueta cada regla con tags del tipo `wcag412`, `wcag143`, `wcag1410`…
   * de los que se deriva el número de criterio sin necesidad de una tabla manual.
   * Los tags de nivel (`wcag2a`, `wcag2aa`, `wcag21aa`…) y de categoría se ignoran.
   */

  // "wcag412" → "4.1.2" · "wcag1410" → "1.4.10" · "wcag2a" → null (nivel, no criterio)
  function scFromAxeTag(tag) {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (!m) return null;
    return m[1] + "." + m[2] + "." + m[3];
  }

  // Todos los criterios WCAG referenciados por los tags de una regla de axe.
  function scFromAxeTags(tags) {
    const out = [];
    (tags || []).forEach(function (t) {
      const sc = scFromAxeTag(t);
      if (sc && out.indexOf(sc) === -1) out.push(sc);
    });
    return out;
  }

  /**
   * Indexa las violaciones de axe por criterio WCAG.
   * Devuelve un Map: SC → { sc, rules: [{ id, impact, help, sc, nodes }] }.
   */
  function axeViolationsBySC(violations) {
    const bySC = new Map();
    (violations || []).forEach(function (v) {
      const scs = scFromAxeTags(v.tags);
      scs.forEach(function (sc) {
        if (!bySC.has(sc)) bySC.set(sc, { sc: sc, rules: [] });
        bySC.get(sc).rules.push({
          id: v.id,
          impact: v.impact || null,
          help: v.help || "",
          sc: sc,
          nodes: (v.nodes || []).length
        });
      });
    });
    return bySC;
  }
  NS.scFromAxeTag = scFromAxeTag;
  NS.scFromAxeTags = scFromAxeTags;
  NS.axeViolationsBySC = axeViolationsBySC;
})(A11Y);

/* ── cuaderno.js ── */
(function (NS) {
  const { WCAG22, enClause, buildPath, VERDICTS } = NS;
  /**
   * Cuaderno de juicio: los once criterios que el agente NO dictamina.
   *
   * Después de sacar del cajón de «juicio humano» todo lo que se podía medir,
   * quedan once criterios que exigen a una persona mirar y decidir: subtítulos en
   * directo, audiodescripción, secuencia significativa, características
   * sensoriales, imágenes de texto, destellos, propósito de los enlaces en
   * contexto, sugerencias ante errores, prevención de errores, entrada redundante
   * y autenticación accesible.
   *
   * El agente no los dictamina. Pero puede hacer dos cosas que ahorran la mayor
   * parte del trabajo, y ninguna de las dos es opinar:
   *
   *  1. **Decir cuándo NO vienen al caso.** En una página sin vídeo ni audio,
   *     1.2.4 y 1.2.5 no se cumplen ni se incumplen: no aplican, y el IRA tiene
   *     esa casilla. Eso es determinista y se decide solo. En un sitio normal, la
   *     mitad de estos once desaparecen antes de que nadie los mire.
   *
   *  2. **Montar el expediente de los que sí vienen al caso.** Qué elementos hay
   *     que mirar, con su ruta CSS para ir directo; qué se sabe ya de ellos; qué
   *     pregunta concreta hay que responder; y qué contaría como fallo. En un
   *     sitio grande, encontrar los enlaces «Leer más» y su contexto es lo que
   *     cuesta; decidir si el contexto basta lleva diez segundos.
   *
   * Y luego recoge la decisión: veredicto, MOTIVO y quién firma. Sin motivo no se
   * registra. Un IRA que dice «Correcto» sin decir por qué no es una auditoría, es
   * una casilla marcada — y el motivo es justo lo que hay que poder enseñar si
   * alguien pregunta.
   *
   * El agente no rellena el cuaderno por su cuenta: lo deja preparado y firmado
   * por quien decide. Esa es la diferencia entre asistir a un auditor y suplantarlo.
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = c; });

  /** Los once. Si el motor gana una capa que mida alguno, sale de aquí. */
  const CRITERIOS_DE_JUICIO = [
    "1.2.4", "1.2.5", "1.3.2", "1.3.3", "1.4.5", "2.3.1", "2.4.4", "3.3.3", "3.3.4", "3.3.7", "3.3.8"
  ];

  /* ── Utilidades de DOM, deliberadamente pequeñas ──────────────────────────── */

  function tag(el) { return el.tagName ? el.tagName.toLowerCase() : ""; }
  function oculto(el) {
    let p = el;
    while (p && p.nodeType === 1) {
      if (p.hasAttribute("hidden") || p.hasAttribute("inert")) return true;
      if (p.getAttribute("aria-hidden") === "true") return true;
      const st = (p.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
      if (/display:none|visibility:hidden/.test(st)) return true;
      if (tag(p) === "template") return true;
      p = p.parentElement;
    }
    return false;
  }
  function visibles(doc, sel) {
    return Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(function (el) { return !oculto(el); });
  }
  function loc(el) {
    const t = tag(el);
    if (el.id) return t + "#" + el.id;
    const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
    if (c) return t + "." + c;
    const ty = el.getAttribute("type");
    return (t === "input" && ty) ? t + "[type=" + ty + "]" : t;
  }
  function ref(el, detalle) {
    return { locator: loc(el), path: buildPath(el), detalle: detalle || "" };
  }
  function texto(el) { return String((el && el.textContent) || "").replace(/\s+/g, " ").trim(); }
  function nombreDe(el) {
    return (el.getAttribute("aria-label") ||
      (el.querySelector && el.querySelector("img[alt]") ? el.querySelector("img[alt]").getAttribute("alt") : "") ||
      texto(el) || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  }
  // Texto visible de la página, para las búsquedas de redacción.
  function textoVisible(doc) {
    const cuerpo = doc.querySelector("body") || doc;
    const trozos = [];
    visibles(doc, "p,li,td,th,h1,h2,h3,h4,h5,h6,label,legend,figcaption,dd,dt,summary,caption")
      .forEach(function (el) { const t = texto(el); if (t) trozos.push(t); });
    if (!trozos.length) trozos.push(texto(cuerpo));
    return trozos.join(" \n ");
  }

  /* ── Señales de aplicabilidad ─────────────────────────────────────────────── */

  // Reproductores embebidos. Igual que en la auditoría de página: si hay un
  // iframe de YouTube, hay medios, aunque el DOM no tenga <video>.
  const EMBEBIDOS = /youtube\.com|youtu\.be|vimeo\.com|dailymotion|ivoox|spotify\.com|soundcloud|twitch\.tv|kaltura|brightcove|jwplayer|wistia/i;

  function medios(doc) {
    const propios = visibles(doc, "video,audio").map(function (el) {
      const pistas = Array.prototype.slice.call(el.querySelectorAll("track")).map(function (t) {
        return (t.getAttribute("kind") || "subtitles").toLowerCase();
      });
      return {
        el: el, tag: tag(el), pistas: pistas,
        subtitulos: pistas.indexOf("captions") !== -1 || pistas.indexOf("subtitles") !== -1,
        descripciones: pistas.indexOf("descriptions") !== -1
      };
    });
    const externos = visibles(doc, "iframe[src],embed[src],object[data]").filter(function (el) {
      return EMBEBIDOS.test(el.getAttribute("src") || el.getAttribute("data") || "");
    });
    return { propios: propios, externos: externos };
  }

  /* 1.3.3 · Instrucciones que dependen de la forma, el color o la posición.
   *
   * Se busca en la REDACCIÓN, que es donde vive este criterio. No es adivinar:
   * «pulse el botón verde» o «vea la columna de la derecha» son exactamente los
   * casos que 1.3.3 persigue, y si no aparece ninguna construcción de estas en
   * toda la página, no hay nada que juzgar.
   *
   * Reconoce de menos, no de más: si una página usa una fórmula que no está aquí,
   * el criterio sale «no aplica» habiendo material. Por eso la ficha dice siempre
   * que solo se ha mirado el texto, y el «no aplica» de 1.3.3 lo deja escrito. */
  const SENSORIALES = [
    { re: /\b(el|la|los|las)\s+(bot[oó]n|enlace|icono|cuadro|recuadro|men[uú]|campo|casilla|pesta[ñn]a|secci[oó]n|columna|fila|caja)\s+(verde|roja?|azul|amarill[oa]|naranja|gris|negr[oa]|blanc[oa]|morad[oa]|violeta|rosa)\b/gi, que: "color" },
    { re: /\b(el|la)\s+(bot[oó]n|icono|forma|figura)\s+(redond[oa]|cuadrad[oa]|triangular|con forma de)\b/gi, que: "forma" },
    { re: /\b(a la (derecha|izquierda)|arriba a la (derecha|izquierda)|abajo a la (derecha|izquierda)|m[aá]s (arriba|abajo)|en la parte (superior|inferior)|(columna|men[uú]|barra) de la (derecha|izquierda)|el de (arriba|abajo)|el primero de la (derecha|izquierda))\b/gi, que: "posición" },
    { re: /\b(pulse|pulsa|haga clic en|haz clic en|seleccione|selecciona|vea|ve a)\s+(el|la)\s+\w+\s+de\s+(la derecha|la izquierda|arriba|abajo)\b/gi, que: "posición" }
  ];

  /* 2.4.4 · Enlaces cuyo nombre no dice a dónde van.
   *
   * Son los únicos que necesitan que alguien mire el contexto; un enlace que se
   * llama «Solicitud de subvención 2026» ya se explica solo. Lo caro en un sitio
   * grande es encontrarlos y traerse el párrafo de alrededor: eso lo hace esto. */
  const NOMBRES_VACIOS = /^(m[aá]s|leer m[aá]s|ver m[aá]s|m[aá]s informaci[oó]n|m[aá]s info|info|aqu[ií]|pulse aqu[ií]|pulsa aqu[ií]|haga clic aqu[ií]|haz clic aqu[ií]|clic aqu[ií]|ver|ver ficha|ver detalle|detalles|continuar|seguir leyendo|contin[uú]a|ir|ir a|acceder|entrar|abrir|descargar|enlace|link|\+|>|»|\.\.\.|…)$/i;

  function contextoDe(a) {
    // El contexto que un lector puede alcanzar: el párrafo, el ítem de lista o la
    // celda que contiene el enlace, y en su defecto el encabezado anterior.
    let p = a.parentElement;
    while (p && p.nodeType === 1) {
      const t = tag(p);
      if (t === "p" || t === "li" || t === "td" || t === "th" || t === "dd" || t === "figcaption") {
        const s = texto(p);
        if (s && s.length > texto(a).length) return { donde: "<" + t + ">", texto: s.slice(0, 200) };
      }
      if (t === "body") break;
      p = p.parentElement;
    }
    // El encabezado anterior vale como contexto, pero solo si está CERCA. Un <h1>
    // a doce hermanos de distancia no es el contexto del enlace: darlo por bueno
    // sería inventarle un contexto que nadie va a asociar con él.
    let h = a.previousElementSibling, saltos = 0;
    while (h && saltos++ < 6) {
      if (/^h[1-6]$/.test(tag(h))) return { donde: "<" + tag(h) + "> anterior", texto: texto(h).slice(0, 200) };
      h = h.previousElementSibling;
    }
    return null;
  }

  /* 3.3.7 · Entrada redundante: el mismo dato pedido dos veces.
   *
   * Se agrupa por propósito declarado (`autocomplete`), y si no lo hay, por
   * `name` y por etiqueta normalizada. WCAG 2.2 exceptúa expresamente la
   * confirmación (repetir la contraseña o el correo para verificarlos), así que
   * esos grupos se marcan como probable excepción en vez de callarlos. */
  function etiquetaDe(el, doc) {
    const id = el.getAttribute("id");
    if (id) {
      const lab = doc.querySelector('label[for="' + String(id).replace(/"/g, '\\"') + '"]');
      if (lab) return texto(lab);
    }
    let p = el.parentElement;
    while (p && p.nodeType === 1 && tag(p) !== "body") {
      if (tag(p) === "label") return texto(p);
      p = p.parentElement;
    }
    return (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim();
  }
  const CONFIRMACION = /(confirm|repet|repit|verific|otra vez|de nuevo|nuevamente)/i;
  /* Normaliza la etiqueta QUITANDO las palabras de confirmación.
   *
   * Sin esto, «Correo» y «Confirmar correo» caen en grupos distintos y el par más
   * típico del criterio —el campo y su confirmación— sale «no aplica». Y no es que
   * ese par falle: la norma lo exceptúa expresamente. Pero decirle al auditor
   * «aquí no hay nada» cuando hay un dato pedido dos veces es peor que enseñárselo
   * marcado como probable excepción; lo primero le oculta el caso, lo segundo le
   * ahorra buscarlo y le deja decidir. */
  function normEtq(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9ñ ]+/g, " ")
      .replace(/\b(confirmar?|confirmacion|repetir|repita|repite|verificar|verificacion|de nuevo|otra vez|nuevamente|el|la|su|tu)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  /* 3.3.4 · Acciones con consecuencias. Un formulario que compra, contrata,
   * borra o envía una solicitud legal es el ámbito del criterio; uno que filtra
   * una tabla, no. Se mira el método, la acción y las palabras de los botones. */
  const COMPROMETEDORAS = /\b(comprar|compra|pagar|pago|pedido|contratar|contrataci[oó]n|suscribir|suscripci[oó]n|donar|donaci[oó]n|transferir|transferencia|eliminar|borrar|dar de baja|cancelar|anular|firmar|firma|aceptar (y|las) |enviar solicitud|presentar solicitud|tramitar|solicitar|matricular|reservar|confirmar (pedido|reserva|compra))\b/i;

  /* 3.3.8 · Autenticación accesible. Parte del criterio SÍ es observable: que el
   * gestor de contraseñas pueda rellenar el campo es una de las excepciones que la
   * norma acepta, y bloquear el pegado o exigir un test cognitivo (un captcha de
   * los de transcribir) es justo lo que prohíbe. */
  const CAPTCHA = /captcha|recaptcha|hcaptcha|turnstile/i;

  /* ── Las once fichas ──────────────────────────────────────────────────────── */

  function ficha(n, extra) {
    const c = IX[n] || { n: n, t: n, lvl: "A" };
    return Object.assign({
      criterio: n, nombre: c.t, nivel: c.lvl, en: enClause(n) || null,
      aplica: true, veredicto: null, pregunta: "", queMirar: [], loQueYaSabemos: [], comoDecidir: [],
      // Material en bruto que la ficha usó para decidir. No es para leerlo: es
      // para que el cuaderno de la MUESTRA pueda cruzar páginas (ver
      // `cuadernoDeMuestra`), que es donde viven de verdad 3.3.7 y 3.3.4.
      datos: {},
      decision: null
    }, extra || {});
  }
  function noAplica(n, porque, datos) {
    return ficha(n, { aplica: false, veredicto: "no-aplica", pregunta: "", comoDecidir: [], loQueYaSabemos: [porque], datos: datos || {} });
  }

  const FICHAS = {
    "1.2.4": function (doc, ctx) {
      const m = ctx.medios;
      if (!m.propios.length && !m.externos.length) {
        return noAplica("1.2.4", "La página no tiene ningún <video>, <audio> ni reproductor embebido reconocido: no hay contenido en directo que subtitular.");
      }
      return ficha("1.2.4", {
        pregunta: "¿Alguno de estos medios es una emisión EN DIRECTO? Si lo es, ¿lleva subtítulos en directo?",
        queMirar: m.propios.map(function (x) { return ref(x.el, "<" + x.tag + ">, pistas: " + (x.pistas.join(", ") || "ninguna")); })
          .concat(m.externos.map(function (el) { return ref(el, "reproductor embebido: " + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 80)); })),
        loQueYaSabemos: [
          "Si es DIRECTO o grabado no se puede saber desde el marcado: un <video> y una emisión se escriben igual.",
          m.propios.filter(function (x) { return x.subtitulos; }).length + " de " + m.propios.length + " medio(s) propio(s) declaran pista de subtítulos."
        ],
        comoDecidir: [
          "Si ninguno es en directo → no aplica.",
          "Si alguno lo es y no lleva subtítulos sincronizados → falla.",
          "Si los lleva, comprueba que son subtítulos de verdad y no una transcripción posterior."
        ]
      });
    },

    "1.2.5": function (doc, ctx) {
      const videos = ctx.medios.propios.filter(function (x) { return x.tag === "video"; });
      if (!videos.length && !ctx.medios.externos.length) {
        return noAplica("1.2.5", "La página no tiene ningún vídeo ni reproductor embebido reconocido: no hay nada que audiodescribir.");
      }
      const sinDesc = videos.filter(function (x) { return !x.descripciones; });
      return ficha("1.2.5", {
        pregunta: "¿La información que estos vídeos transmiten SOLO por la imagen está también en el audio o en una audiodescripción?",
        queMirar: videos.map(function (x) { return ref(x.el, x.descripciones ? "declara <track kind=\"descriptions\">" : "sin pista de descripciones"); })
          .concat(ctx.medios.externos.map(function (el) {
            return ref(el, "reproductor embebido (" + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 80) + "): hay que abrirlo para saberlo");
          })),
        loQueYaSabemos: [
          sinDesc.length + " de " + videos.length + " vídeo(s) propio(s) no declaran pista de audiodescripción.",
          "Que no la declaren no basta para fallar: la audiodescripción puede estar integrada en el propio audio, y eso solo se sabe viéndolo."
        ],
        comoDecidir: [
          "Si el vídeo no transmite nada visualmente que no se oiga (una charla, por ejemplo) → cumple.",
          "Si hay información solo visual sin describir → falla.",
          "Si la descripción está integrada en el audio original, dilo en el motivo: no se ve en el marcado."
        ]
      });
    },

    "1.3.2": function (doc, ctx) {
      // Este se aplica siempre que haya contenido, y no hay atajo honesto: solo
      // comparando el orden del DOM con el orden visual se sabe. Lo que el agente
      // aporta es el orden del DOM ya extraído.
      const bloques = visibles(doc, "h1,h2,h3,h4,h5,h6,main,nav,aside,section,article,footer,header,form,table")
        .slice(0, 25);
      if (!bloques.length) {
        return noAplica("1.3.2", "La página no tiene bloques de contenido (encabezados, regiones, formularios ni tablas) cuyo orden pueda importar.");
      }
      return ficha("1.3.2", {
        pregunta: "Leyendo la página en el orden del código (el de abajo), ¿se entiende lo mismo que viéndola?",
        queMirar: bloques.map(function (el, i) {
          return ref(el, (i + 1) + ". <" + tag(el) + "> " + (texto(el).slice(0, 60) || "(sin texto propio)"));
        }),
        loQueYaSabemos: [
          "Este es el orden del DOM, que es el que reciben el lector de pantalla y la tabulación.",
          "El agente no ve el orden visual: CSS puede reordenar con `flex-direction`, `order`, `grid-area` o posicionamiento absoluto, y eso es precisamente lo que rompe este criterio.",
          "Una forma rápida de contrastarlo: desactiva las hojas de estilo y lee."
        ],
        comoDecidir: [
          "Si el orden del código cuenta la misma historia que el visual → cumple.",
          "Si algo depende del orden y el código lo cambia (un pie antes que su tabla, una columna lateral en medio de un artículo) → falla."
        ]
      });
    },

    "1.3.3": function (doc, ctx) {
      const t = ctx.texto;
      const hallazgos = [];
      SENSORIALES.forEach(function (s) {
        s.re.lastIndex = 0;
        let m;
        while ((m = s.re.exec(t)) && hallazgos.length < 20) {
          hallazgos.push({ que: s.que, frase: m[0].replace(/\s+/g, " ").trim() });
        }
      });
      if (!hallazgos.length) {
        return noAplica("1.3.3",
          "No se ha encontrado ninguna instrucción que apele a la forma, el color o la posición en el texto visible de la página. " +
          "Ojo: solo se ha mirado el TEXTO. Una instrucción dada en una imagen o en un vídeo no se ve desde aquí.");
      }
      const vistos = {};
      const unicos = hallazgos.filter(function (h) { const k = h.que + "|" + h.frase.toLowerCase(); if (vistos[k]) return false; vistos[k] = 1; return true; });
      return ficha("1.3.3", {
        pregunta: "Estas frases dan una instrucción apelando a la forma, el color o la posición. ¿Se entienden sin ver la pantalla?",
        queMirar: unicos.map(function (h) { return { locator: "(texto)", path: "", detalle: "[" + h.que + "] «" + h.frase + "»" }; }),
        loQueYaSabemos: [
          unicos.length + " construcción/es encontradas en el texto visible.",
          "Encontrarlas no es fallar: «el botón verde Guardar» está bien, porque además del color dice el nombre. Falla cuando el color, la forma o la posición son el ÚNICO dato."
        ],
        comoDecidir: [
          "Si la frase da también el nombre, la etiqueta o el texto del elemento → cumple.",
          "Si sin ver la pantalla no se sabe a qué se refiere → falla.",
          "Mira también las instrucciones que estén dentro de imágenes: el agente no las lee."
        ]
      });
    },

    "1.4.5": function (doc, ctx) {
      const imgs = visibles(doc, "img,svg,picture").filter(function (el) { return tag(el) !== "img" || el.getAttribute("alt") !== ""; });
      if (!imgs.length) {
        return noAplica("1.4.5", "La página no tiene imágenes visibles con contenido (las decorativas, con alt vacío, quedan fuera del criterio).");
      }
      // Candidatas: alt con pinta de frase, o nombre de archivo que suena a texto.
      const SOSPECHOSO = /(banner|cartel|titular|slogan|lema|texto|frase|cita|promo|oferta|infograf)/i;
      const cand = imgs.filter(function (el) {
        const alt = (el.getAttribute("alt") || el.getAttribute("aria-label") || "").trim();
        const src = el.getAttribute("src") || "";
        return alt.split(/\s+/).filter(Boolean).length >= 4 || SOSPECHOSO.test(src) || SOSPECHOSO.test(alt);
      });
      const esLogo = function (el) { return /logo|marca|isotipo|imagotipo/i.test((el.getAttribute("src") || "") + " " + (el.getAttribute("alt") || "")); };
      return ficha("1.4.5", {
        pregunta: "¿Alguna de estas imágenes es, en realidad, TEXTO convertido en imagen?",
        queMirar: (cand.length ? cand : imgs).slice(0, 25).map(function (el) {
          return ref(el, "<" + tag(el) + "> alt=«" + (el.getAttribute("alt") || "").slice(0, 60) + "»" + (esLogo(el) ? " · parece un logotipo (excepción del criterio)" : ""));
        }),
        loQueYaSabemos: [
          imgs.length + " imagen/es con contenido; " + cand.length + " con indicios de llevar texto (alt largo o nombre revelador).",
          "El agente no lee lo que hay DENTRO de la imagen: no hay OCR, y decir que lo hay sería mentir. Los indicios son el alt y el nombre del archivo.",
          "Los logotipos son una excepción expresa del criterio, igual que el texto que forma parte esencial de una imagen (una captura de pantalla, por ejemplo)."
        ],
        comoDecidir: [
          "Si la imagen presenta texto que podría haberse escrito con HTML y CSS → falla.",
          "Si es un logotipo, una captura o texto esencialmente gráfico → cumple.",
          "Amplía al 200 %: el texto en imagen se pixela, y es la forma más rápida de verlo."
        ]
      });
    },

    "2.3.1": function (doc, ctx) {
      const candidatos = visibles(doc, "video,canvas,object,embed")
        .concat(visibles(doc, "img").filter(function (el) { return /\.gif(\?|$)/i.test(el.getAttribute("src") || ""); }))
        .concat(ctx.medios.externos);
      const conAnimacion = /@keyframes|animation\s*:/i.test(ctx.estilos);
      if (!candidatos.length && !conAnimacion) {
        return noAplica("2.3.1", "La página no tiene vídeo, canvas, GIF ni animaciones CSS declaradas: no hay nada que pueda destellar.");
      }
      const unicos = [];
      const vistos = {};
      candidatos.forEach(function (el) { const k = buildPath(el); if (!vistos[k]) { vistos[k] = 1; unicos.push(el); } });
      return ficha("2.3.1", {
        pregunta: "¿Algo de esto destella más de tres veces por segundo?",
        queMirar: unicos.slice(0, 25).map(function (el) { return ref(el, "<" + tag(el) + "> " + (el.getAttribute("src") || el.getAttribute("data") || "").slice(0, 70)); })
          .concat(conAnimacion ? [{ locator: "(CSS)", path: "", detalle: "la hoja de estilos declara animaciones: revísalas también" }] : []),
        loQueYaSabemos: [
          "El agente ve QUÉ puede destellar, no si destella: eso son fotogramas, y hay que verlos.",
          "El umbral de la norma son tres destellos por segundo, más el umbral de rojo saturado."
        ],
        comoDecidir: [
          "Si nada destella, o lo hace tres veces por segundo o menos → cumple.",
          "Si algo supera el umbral → falla, y es de las barreras más graves: puede provocar una crisis.",
          "Para medirlo de verdad, el PEAT (Photosensitive Epilepsy Analysis Tool) es la herramienta al uso."
        ]
      });
    },

    "2.4.4": function (doc, ctx) {
      const enlaces = visibles(doc, "a[href]");
      if (!enlaces.length) {
        return noAplica("2.4.4", "La página no tiene enlaces visibles.");
      }
      const vagos = enlaces.filter(function (a) { return NOMBRES_VACIOS.test(nombreDe(a)); });
      if (!vagos.length) {
        return ficha("2.4.4", {
          veredicto: "cumple-parcial",
          pregunta: "¿El nombre de cada enlace dice a dónde lleva?",
          queMirar: [],
          loQueYaSabemos: [
            "Ninguno de los " + enlaces.length + " enlaces visibles se llama «Leer más», «Aquí», «Ver» ni nada equivalente: todos tienen nombre propio.",
            "Eso es lo comprobable. Que el nombre describa BIEN el destino sigue siendo juicio, pero sin nombres vacíos no hay que ir a buscar el contexto de ninguno."
          ],
          comoDecidir: ["Repasa por encima que los nombres correspondan a sus destinos; si alguno no, decídelo aquí."]
        });
      }
      return ficha("2.4.4", {
        pregunta: "Estos enlaces no dicen a dónde van por su nombre. ¿Basta el contexto que los rodea?",
        queMirar: vagos.slice(0, 30).map(function (a) {
          const ctxA = contextoDe(a);
          return ref(a, "«" + nombreDe(a).slice(0, 40) + "» → " + (a.getAttribute("href") || "").slice(0, 60) +
            (ctxA ? " · contexto (" + ctxA.donde + "): «" + ctxA.texto + "»" : " · SIN contexto alrededor"));
        }),
        loQueYaSabemos: [
          vagos.length + " de " + enlaces.length + " enlaces tienen nombre genérico.",
          "Al lado de cada uno va el párrafo, el ítem o la celda que lo contiene: es el contexto que un lector de pantalla puede alcanzar.",
          "Los que salen «SIN contexto alrededor» son los más probables de fallar: no hay de dónde deducir el destino."
        ],
        comoDecidir: [
          "Si el contexto de programación —el párrafo, el ítem, la celda, el encabezado de la sección— identifica el destino → cumple.",
          "Si hay que ver la página entera para saberlo, o ni así → falla.",
          "Varios «Leer más» seguidos con el mismo contexto son el caso clásico de fallo."
        ]
      });
    },

    "3.3.3": function (doc, ctx) {
      const conRestriccion = visibles(doc, "input,select,textarea").filter(function (el) {
        if ((el.getAttribute("type") || "").toLowerCase() === "hidden") return false;
        return el.hasAttribute("required") || el.hasAttribute("pattern") || el.hasAttribute("min") ||
          el.hasAttribute("max") || el.hasAttribute("minlength") || el.hasAttribute("maxlength") ||
          el.getAttribute("aria-required") === "true" ||
          /^(email|url|tel|number|date|time)$/i.test(el.getAttribute("type") || "");
      });
      if (!conRestriccion.length) {
        return noAplica("3.3.3", "La página no tiene ningún campo con restricciones (obligatorio, patrón, tipo, longitud o rango): no hay error que sugerir cómo corregir.");
      }
      return ficha("3.3.3", {
        pregunta: "Cuando uno de estos campos se rellena mal, ¿el mensaje dice CÓMO corregirlo, y no solo que está mal?",
        queMirar: conRestriccion.slice(0, 30).map(function (el) {
          const r = [];
          if (el.hasAttribute("required") || el.getAttribute("aria-required") === "true") r.push("obligatorio");
          if (el.hasAttribute("pattern")) r.push("patrón " + (el.getAttribute("pattern") || "").slice(0, 30));
          if (el.getAttribute("type")) r.push("tipo " + el.getAttribute("type"));
          ["min", "max", "minlength", "maxlength"].forEach(function (a) { if (el.hasAttribute(a)) r.push(a + "=" + el.getAttribute(a)); });
          return ref(el, "«" + (etiquetaDe(el, doc) || "(sin etiqueta)").slice(0, 40) + "» · " + r.join(", "));
        }),
        loQueYaSabemos: [
          conRestriccion.length + " campo(s) con restricciones, que son los que pueden producir un error.",
          "Que el error se anuncie —3.3.1— sí lo comprueba la capa dinámica. Este criterio va del CONTENIDO del mensaje, y eso hay que leerlo.",
          "El mensaje del navegador («Rellena este campo») cumple a duras penas; uno propio que diga el formato esperado cumple con holgura."
        ],
        comoDecidir: [
          "Envía el formulario con datos mal y lee lo que sale.",
          "Si el mensaje dice qué se espera («la fecha va en formato dd/mm/aaaa») → cumple.",
          "Si solo dice «error» o «campo no válido» sin más → falla.",
          "Excepción: si sugerir la corrección pusiera en riesgo la seguridad (un inicio de sesión) → cumple."
        ]
      });
    },

    "3.3.4": function (doc, ctx) {
      const forms = visibles(doc, "form");
      const conPost = forms.filter(function (f) { return /post/i.test(f.getAttribute("method") || ""); });
      const botones = visibles(doc, 'button,input[type=submit],a[href]').filter(function (el) {
        return COMPROMETEDORAS.test(nombreDe(el) || el.getAttribute("value") || "");
      });
      if (!forms.length && !botones.length) {
        return noAplica("3.3.4", "La página no tiene formularios ni acciones con consecuencias legales, económicas o sobre datos del usuario.");
      }
      if (!conPost.length && !botones.length) {
        return noAplica("3.3.4",
          "Los " + forms.length + " formulario(s) de la página no envían por POST ni llevan ninguna acción comprometedora (comprar, contratar, eliminar, firmar, tramitar…): " +
          "parecen de consulta o búsqueda, que quedan fuera del criterio.");
      }
      return ficha("3.3.4", {
        pregunta: "¿Estas acciones son legales, económicas o modifican/borran datos del usuario? Si lo son, ¿se pueden revertir, se comprueban o se confirman?",
        queMirar: conPost.map(function (f) { return ref(f, "<form method=post action=" + (f.getAttribute("action") || "(misma página)").slice(0, 50) + ">"); })
          .concat(botones.slice(0, 20).map(function (el) { return ref(el, "«" + (nombreDe(el) || el.getAttribute("value") || "").slice(0, 50) + "»"); })),
        loQueYaSabemos: [
          conPost.length + " formulario(s) que envían por POST y " + botones.length + " control(es) cuyo texto sugiere una acción con consecuencias.",
          "Que la acción sea realmente legal o económica no se ve en el marcado: se ve usándola o sabiendo de qué va el sitio."
        ],
        comoDecidir: [
          "Si ninguna acción es de las tres clases (legal, económica, o que modifique/borre datos del usuario) → no aplica.",
          "Si lo es, basta UNA de las tres salvaguardas: se puede deshacer, se revisa y corrige antes de enviar, o se pide confirmación explícita.",
          "Si no hay ninguna de las tres → falla."
        ]
      });
    },

    "3.3.7": function (doc, ctx) {
      const campos = visibles(doc, "input,select,textarea").filter(function (el) {
        const t = (el.getAttribute("type") || "").toLowerCase();
        return t !== "hidden" && t !== "submit" && t !== "button" && t !== "reset";
      });
      if (campos.length < 2) {
        return noAplica("3.3.7", "La página no tiene dos campos que pudieran pedir el mismo dato.");
      }
      // Los grupos se calculan y se GUARDAN siempre, aunque en esta página no se
      // repita ninguno: el cruce entre páginas de `cuadernoDeMuestra` los necesita
      // para ver el dato que se pide en el paso 1 y otra vez en el paso 3.
      const grupos = {};
      campos.forEach(function (el) {
        const ac = (el.getAttribute("autocomplete") || "").toLowerCase().trim();
        const nm = (el.getAttribute("name") || "").toLowerCase().trim();
        const etq = normEtq(etiquetaDe(el, doc));
        const clave = (ac && ac !== "off" && ac !== "on") ? "autocomplete:" + ac : (etq ? "etiqueta:" + etq : (nm ? "name:" + nm : null));
        if (!clave) return;
        (grupos[clave] = grupos[clave] || []).push({
          locator: loc(el), path: buildPath(el),
          etiqueta: (etiquetaDe(el, doc) || "").slice(0, 60),
          confirmacion: CONFIRMACION.test(etiquetaDe(el, doc) + " " + (el.getAttribute("name") || "") + " " + (el.getAttribute("id") || ""))
        });
      });
      const datos = { grupos: grupos, campos: campos.length };
      const repetidos = Object.keys(grupos).filter(function (k) { return grupos[k].length > 1; });
      if (!repetidos.length) {
        return noAplica("3.3.7",
          "Ninguno de los " + campos.length + " campos de la página pide el mismo dato que otro (comparando `autocomplete`, etiqueta y `name`). " +
          "Ojo: 3.3.7 habla del proceso entero, y el agente solo ve ESTA página; si el proceso tiene varios pasos, hay que mirarlo completo.",
          datos);
      }
      return ficha("3.3.7", {
        datos: datos,
        pregunta: "¿Estos campos piden dos veces el mismo dato dentro del mismo proceso, sin rellenarlo solo ni ofrecerlo para elegir?",
        queMirar: repetidos.slice(0, 15).reduce(function (acc, k) {
          const esConfirmacion = grupos[k].some(function (x) { return x.confirmacion; });
          grupos[k].forEach(function (x) {
            acc.push({
              locator: x.locator, path: x.path,
              detalle: "[" + k + "] «" + (x.etiqueta || "(sin etiqueta)") + "»" +
                (esConfirmacion ? " · parece una CONFIRMACIÓN, que la norma exceptúa" : "")
            });
          });
          return acc;
        }, []),
        loQueYaSabemos: [
          repetidos.length + " grupo(s) de campos que parecen pedir el mismo dato.",
          "WCAG 2.2 exceptúa expresamente la confirmación (repetir la contraseña o el correo para verificarlos) y los casos en que volver a pedirlo es esencial.",
          "El agente ve una página. Si el proceso tiene varios pasos, el dato repetido entre paso 1 y paso 3 no se ve desde aquí."
        ],
        comoDecidir: [
          "Si el segundo campo es de confirmación, o volver a pedirlo es esencial → cumple.",
          "Si el dato ya se pidió antes en el mismo proceso y no se rellena solo ni se ofrece para elegir → falla.",
          "Recorre el proceso entero, no solo esta página."
        ]
      });
    },

    "3.3.8": function (doc, ctx) {
      const passwords = visibles(doc, 'input[type=password]');
      const captcha = visibles(doc, "*").filter(function (el) {
        return CAPTCHA.test((el.getAttribute("class") || "") + " " + (el.getAttribute("id") || "") + " " + (el.getAttribute("src") || ""));
      });
      if (!passwords.length && !captcha.length) {
        return noAplica("3.3.8", "La página no tiene ningún campo de contraseña ni captcha: no hay proceso de autenticación que evaluar.");
      }
      const bloqueaPegado = visibles(doc, "input,textarea").filter(function (el) {
        return /return\s+false|preventDefault/i.test(el.getAttribute("onpaste") || "");
      });
      const sinAutocomplete = passwords.filter(function (el) {
        const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
        return !ac || ac === "off";
      });
      return ficha("3.3.8", {
        pregunta: "Para entrar, ¿hay que recordar o transcribir algo? ¿Se puede pegar la contraseña y rellenarla con el gestor?",
        queMirar: passwords.map(function (el) {
          const ac = el.getAttribute("autocomplete");
          return ref(el, "campo de contraseña · autocomplete=" + (ac || "(ninguno)") + (ac && ac !== "off" ? "" : " ← impide al gestor de contraseñas rellenarlo"));
        }).concat(captcha.slice(0, 5).map(function (el) { return ref(el, "captcha detectado por su clase, id o src"); }))
          .concat(bloqueaPegado.map(function (el) { return ref(el, "el campo bloquea el pegado con onpaste"); })),
        loQueYaSabemos: [
          sinAutocomplete.length + " de " + passwords.length + " campo(s) de contraseña sin `autocomplete` útil.",
          captcha.length ? captcha.length + " elemento(s) con pinta de captcha." : "No se ha detectado ningún captcha por marcado (uno cargado por script no se ve desde aquí).",
          bloqueaPegado.length ? bloqueaPegado.length + " campo(s) bloquean el pegado." : "Ningún campo bloquea el pegado con un `onpaste` en línea.",
          "Permitir al gestor de contraseñas y permitir pegar son dos de las excepciones que la norma acepta; bloquearlas es lo que la incumple."
        ],
        comoDecidir: [
          "Si el gestor de contraseñas puede rellenar y se puede pegar → normalmente cumple.",
          "Si hay que transcribir un código de una imagen, resolver un puzle o recordar algo sin alternativa → falla.",
          "Un captcha de «marca esta casilla» o basado en el dispositivo no es un test cognitivo: eso cumple."
        ]
      });
    }
  };

  /**
   * Monta el cuaderno para un documento.
   *
   * @param {Document} doc
   * @param {{ url?:string, css?:string }} [opts]  `css` son las hojas de estilo ya
   *   resueltas, si quien llama las tiene (la capa de render sí). Sin ellas, solo
   *   se mira el CSS en línea del documento, y la ficha que dependa de eso lo dice.
   */
  function cuadernoDeJuicio(doc, opts) {
    opts = opts || {};
    if (!doc || !doc.querySelectorAll) throw new Error("cuadernoDeJuicio necesita un Document");
    const estilosEnLinea = Array.prototype.slice.call(doc.querySelectorAll("style"))
      .map(function (s) { return s.textContent || ""; }).join("\n");
    const ctx = {
      medios: medios(doc),
      texto: textoVisible(doc),
      estilos: estilosEnLinea + "\n" + (opts.css || "")
    };

    const criterios = CRITERIOS_DE_JUICIO.map(function (n) { return FICHAS[n](doc, ctx); });
    return {
      url: opts.url || null,
      creado: new Date().toISOString(),
      criterios: criterios,
      resumen: resumenDe(criterios)
    };
  }

  function resumenDe(criterios) {
    const r = { total: criterios.length, noAplican: 0, pendientes: 0, decididos: 0, elementos: 0 };
    criterios.forEach(function (c) {
      if (c.decision) r.decididos++;
      else if (!c.aplica) r.noAplican++;
      else r.pendientes++;
      r.elementos += (c.queMirar || []).length;
    });
    return r;
  }

  /** Los que de verdad necesitan que alguien mire. */
  function pendientesDeJuicio(cuaderno) {
    return (cuaderno.criterios || []).filter(function (c) { return c.aplica && !c.decision; });
  }

  const ADMITIDOS = ["cumple", "falla", "no-aplica", "revisar"];

  /**
   * Registra la decisión del auditor sobre un criterio.
   *
   * Devuelve un cuaderno NUEVO; no toca el que recibe. Exige motivo y firma:
   *
   *  - Sin **motivo** no se registra. El motivo es el entregable: un IRA que dice
   *    «Correcto» sin decir por qué no se puede defender ante nadie.
   *  - Sin **auditor** tampoco. Una decisión de juicio la firma una persona, y en
   *    un informe con efectos legales eso importa.
   *  - El veredicto sale de un juego cerrado: `cumple`, `falla`, `no-aplica` o
   *    `revisar` (dejarlo pendiente a propósito, con su motivo). `pasa` y
   *    `cumple-parcial` son palabras de la máquina —significan «medido sobre
   *    render real»— y no le corresponden a una persona.
   *
   * @param {object} cuaderno
   * @param {{criterio:string, veredicto:string, motivo:string, auditor:string, fecha?:string, evidencia?:Array}} d
   */
  function registrarJuicio(cuaderno, d) {
    d = d || {};
    if (!cuaderno || !Array.isArray(cuaderno.criterios)) throw new Error("registrarJuicio necesita un cuaderno");
    const i = cuaderno.criterios.findIndex(function (c) { return c.criterio === d.criterio; });
    if (i === -1) throw new Error("El criterio " + d.criterio + " no está en el cuaderno (son: " + CRITERIOS_DE_JUICIO.join(", ") + ")");
    if (ADMITIDOS.indexOf(d.veredicto) === -1) {
      throw new Error("Veredicto no admitido para una decisión humana: «" + d.veredicto + "». Usa " + ADMITIDOS.join(", ") + ".");
    }
    const motivo = String(d.motivo || "").trim();
    if (motivo.length < 10) {
      throw new Error("Falta el motivo de la decisión sobre " + d.criterio + ". Sin motivo no se registra: el motivo es lo que hace defendible el informe.");
    }
    const auditor = String(d.auditor || "").trim();
    if (!auditor) throw new Error("Falta quién firma la decisión sobre " + d.criterio + ".");

    const decision = {
      veredicto: d.veredicto,
      motivo: motivo,
      auditor: auditor,
      fecha: d.fecha || new Date().toISOString(),
      evidencia: Array.isArray(d.evidencia) ? d.evidencia.slice(0, 20) : []
    };
    const criterios = cuaderno.criterios.slice();
    /* `aplica` lo decide la FIRMA, no la detección previa.
     *
     * El agente marca `aplica: false` cuando no ve el supuesto en el marcado —un
     * 1.2.5 sin `<video>`, por ejemplo—. Pero el auditor mira la página de verdad:
     * si firma un `falla` ahí, es que había un reproductor inyectado por JS que el
     * marcado no delataba. Dejar `aplica: false` debajo de esa firma hacía que
     * `cuadernoDeMuestra` descartara la ficha como «no viene al caso en ninguna
     * página» y el `falla` firmado saliera del informe convertido en «No aplica»:
     * la conformidad del sitio pasaba de «No conforme» a «Sin barreras».
     *
     * Así que la decisión manda en las dos direcciones: cualquier veredicto que no
     * sea `no-aplica` significa que el criterio SÍ viene al caso. */
    criterios[i] = Object.assign({}, criterios[i], {
      decision: decision,
      veredicto: d.veredicto,
      aplica: d.veredicto !== "no-aplica"
    });
    return Object.assign({}, cuaderno, { criterios: criterios, resumen: resumenDe(criterios) });
  }

  /**
   * Convierte el cuaderno en hallazgos, para que entre en el informe como todo lo
   * demás. Tres formas, y ninguna miente sobre su origen:
   *
   *  - decidido por una persona → su veredicto, con el motivo y la firma en la
   *    evidencia. `scope: "juicio"`.
   *  - no aplica (lo decidió el agente) → `no-aplica`, diciendo por qué.
   *  - pendiente → `humano`, con el expediente resumido: qué mirar y qué decidir.
   *    Nunca `cumple`: un criterio sin mirar no puede exportarse como conforme.
   */
  function findingsDelCuaderno(cuaderno) {
    return (cuaderno.criterios || []).map(function (c) {
      const base = { c: { n: c.criterio, t: c.nombre, lvl: c.nivel }, en: c.en, scope: "juicio", sev: null };
      if (c.decision) {
        const d = c.decision;
        const todos = (c.queMirar || []).map(function (m) { return { locator: m.locator, name: "", path: m.path, url: m.pagina || undefined }; });
        /* Un `falla` firmado se lleva TODOS los elementos, sin tope.
         *
         * En el IRA cada elemento afectado es una fila de «Barreras», así que el
         * tope de 8 no recortaba una lista de ejemplos: recortaba el recuento de
         * barreras. Veinte enlaces «Leer más» firmados como falla salían como ocho
         * y `num_barreras` mentía por doce. En los demás veredictos el tope sí es
         * razonable —ahí la lista es para orientar a quien lee, no para contar— y
         * se dice cuántos quedan fuera en vez de recortar en silencio. */
        const recorte = d.veredicto === "falla" ? todos : todos.slice(0, 8);
        const sobran = todos.length - recorte.length;
        return Object.assign({}, base, {
          verdict: d.veredicto,
          sev: d.veredicto === "falla" ? "grave" : null,
          evid: [
            "Decisión de " + d.auditor + " (" + String(d.fecha).slice(0, 10) + "): " + d.motivo
          ].concat(d.evidencia.length ? ["Evidencia aportada: " + d.evidencia.join(" · ")] : [])
            .concat(sobran ? ["Se listan " + recorte.length + " de " + todos.length + " elemento(s) del expediente; el resto está en el cuaderno."] : []),
          nodes: recorte
        });
      }
      if (!c.aplica) {
        return Object.assign({}, base, {
          verdict: "no-aplica",
          evid: [(c.loQueYaSabemos || []).join(" ") || "El criterio no viene al caso en esta página."]
        });
      }
      return Object.assign({}, base, {
        verdict: "humano",
        evid: [c.pregunta]
          .concat((c.loQueYaSabemos || []))
          .concat((c.queMirar || []).length ? ["Hay que mirar " + c.queMirar.length + " elemento(s); el expediente está en el cuaderno."] : [])
          .concat((c.comoDecidir || []).length ? ["Cómo decidirlo: " + c.comoDecidir.join(" ")] : []),
        nodes: (c.queMirar || []).slice(0, 8).map(function (m) { return { locator: m.locator, name: "", path: m.path }; })
      });
    });
  }

  /* ── El cuaderno de la MUESTRA ─────────────────────────────────────────────
   *
   * Por página el cuaderno se queda corto en dos criterios, y lo dice: 3.3.7 y
   * 3.3.4 hablan del PROCESO, no de la pantalla. El dato que se pide en el paso 1
   * y otra vez en el paso 3 no se ve mirando ninguno de los dos pasos por
   * separado; hay que poner las páginas una al lado de otra.
   *
   * Y hay una regla de seguridad que solo tiene sentido aquí: un criterio no
   * aplica al SITIO si no aplica en NINGUNA de las páginas de la muestra. Basta
   * que una tenga vídeo para que 1.2.5 vuelva a aplicar a la muestra entera. Al
   * revés —declarar «no aplica» porque no aplicaba en la primera página— sería
   * exactamente el fallo que este motor existe para no cometer.
   */

  function refPag(m, url) {
    return { locator: m.locator, path: m.path, detalle: m.detalle, pagina: url || null };
  }

  /**
   * La decisión del SITIO a partir de las decisiones por página.
   *
   * @param {Array<{url:string, f:object}>} firmadas  fichas con `decision`.
   * @param {Array<{url:string, f:object}>} aplican   fichas donde el criterio viene al caso.
   * @returns {object|null} una `decision` agregada, o `null` si el criterio sigue pendiente.
   */
  function decisionDeMuestra(firmadas, aplican) {
    if (!firmadas.length) return null;

    const junta = function (elegidas, nota) {
      const peor = elegidas.reduce(function (a, x) {
        return peorVeredicto(a, x.f.decision.veredicto);
      }, null);
      const fechas = elegidas.map(function (x) { return String(x.f.decision.fecha); }).sort();
      const autores = [];
      elegidas.forEach(function (x) {
        if (autores.indexOf(x.f.decision.auditor) === -1) autores.push(x.f.decision.auditor);
      });
      return {
        veredicto: peor,
        motivo: nota + " " + elegidas.map(function (x) {
          return x.url + ": «" + x.f.decision.motivo + "» (" + x.f.decision.auditor + ", " +
            String(x.f.decision.fecha).slice(0, 10) + ", " + x.f.decision.veredicto + ")";
        }).join(" · "),
        auditor: autores.join(", "),
        fecha: fechas[fechas.length - 1],
        evidencia: elegidas.reduce(function (a, x) { return a.concat(x.f.decision.evidencia || []); }, []).slice(0, 20),
        porPagina: elegidas.map(function (x) {
          return { pagina: x.url, veredicto: x.f.decision.veredicto, auditor: x.f.decision.auditor,
            fecha: x.f.decision.fecha, motivo: x.f.decision.motivo };
        })
      };
    };

    // 1) Un falla firmado en cualquier página es un falla del sitio.
    const fallan = firmadas.filter(function (x) { return x.f.decision.veredicto === "falla"; });
    if (fallan.length) {
      return junta(fallan, "Barrera confirmada a mano en " + fallan.length + " página(s) de la muestra —" +
        "basta una para que el sitio no sea conforme—:");
    }

    // 2) Todas las que aplican, firmadas: el sitio hereda la peor.
    const sinFirmar = aplican.filter(function (x) { return !x.f.decision; });
    if (!sinFirmar.length) {
      return junta(firmadas, "Decidido a mano en todas las páginas donde el criterio viene al caso:");
    }

    // 3) Queda trabajo: el criterio sigue pendiente. Las firmas se cuentan arriba,
    //    en `loQueYaSabemos`, pero no cierran el criterio del sitio.
    return null;
  }

  /* El orden de gravedad, solo para los cuatro veredictos que una persona firma.
   * No se importa de `verdicts.js` a propósito: este módulo lo empaqueta
   * `build-artifact.mjs` en la región ENGINE, que no arrastra dependencias. */
  const PEOR = { falla: 4, revisar: 3, cumple: 2, "no-aplica": 1 };
  /* Un veredicto desconocido cuenta como `revisar`: nunca como conforme (sería
   * exportar como correcto algo que nadie ha comprobado) y nunca por encima de un
   * `falla` (taparía una barrera confirmada con una palabra que no entendemos). */
  function peorVeredicto(a, b) {
    if (!a) return b;
    if (!b) return a;
    return (PEOR[b] || 3) > (PEOR[a] || 3) ? b : a;
  }

  /* Cruce de 3.3.7 entre páginas: la misma clave de dato en dos páginas
   * distintas es el caso que ninguna ficha por página puede ver. */
  function redundanciaEntrePaginas(cuadernos) {
    const porClave = {};
    cuadernos.forEach(function (cu) {
      const f = (cu.criterios || []).find(function (c) { return c.criterio === "3.3.7"; });
      const grupos = (f && f.datos && f.datos.grupos) || {};
      Object.keys(grupos).forEach(function (k) {
        porClave[k] = porClave[k] || { clave: k, paginas: {}, confirmacion: false };
        porClave[k].paginas[cu.url || "(sin url)"] = grupos[k];
        if (grupos[k].some(function (x) { return x.confirmacion; })) porClave[k].confirmacion = true;
      });
    });
    return Object.keys(porClave)
      .map(function (k) { return porClave[k]; })
      .filter(function (g) { return Object.keys(g.paginas).length > 1; });
  }

  /**
   * Junta los cuadernos de las páginas de una muestra en uno solo.
   *
   * @param {Array<object>} cuadernos  los que devuelve `cuadernoDeJuicio`, uno por página.
   * @param {{ sitio?:string, sinAnalizar?:Array<string> }} [opts]
   *   `sinAnalizar`: URLs de la muestra que NO se pudieron auditar. Cambia el
   *   resultado, no solo el texto: ver abajo.
   */
  function cuadernoDeMuestra(cuadernos, opts) {
    opts = opts || {};
    const lista = (cuadernos || []).filter(function (c) { return c && Array.isArray(c.criterios); });
    if (!lista.length) throw new Error("cuadernoDeMuestra necesita al menos un cuaderno de página");
    const urls = lista.map(function (c) { return c.url || "(sin url)"; });

    /* Páginas de la muestra que no se llegaron a auditar.
     *
     * Con huecos en la muestra, «no aplica en el sitio» deja de ser una conclusión
     * y pasa a ser una suposición: de las páginas que no cargaron no se sabe si
     * tenían vídeo, formularios o límites de tiempo. Y es exactamente el error que
     * este módulo dice existir para no cometer —declarar «no aplica» porque no
     * aplicaba en las páginas que sí se vieron—. Con tres páginas y dos caídas, el
     * cuaderno llegaba a poner nueve criterios como «No aplica» para el sitio
     * entero sobre la base de UNA página. Así que, si falta alguna, un «no aplica»
     * se queda en pendiente y lo dice. Lo que no cambia: un `falla` firmado sigue
     * siendo un `falla`, y lo que ya estaba pendiente sigue pendiente. */
    const huecos = (opts.sinAnalizar || []).filter(Boolean);
    const avisoHueco = huecos.length
      ? "ATENCIÓN: " + huecos.length + " página(s) de la muestra no se auditaron (" +
        huecos.slice(0, 4).join(", ") + (huecos.length > 4 ? ", …" : "") +
        "), así que no se puede afirmar que el criterio no venga al caso en el sitio: solo que no venía al caso en las que sí se vieron."
      : null;

    const criterios = CRITERIOS_DE_JUICIO.map(function (n) {
      const fichas = lista.map(function (c, i) {
        return { url: urls[i], f: (c.criterios || []).find(function (x) { return x.criterio === n; }) };
      }).filter(function (x) { return x.f; });

      const aplican = fichas.filter(function (x) { return x.f.aplica; });
      const firmadas = fichas.filter(function (x) { return x.f.decision; });
      const modelo = (aplican[0] || fichas[0]).f;

      /* Lo FIRMADO va primero, y por encima de la detección.
       *
       * `cuadernoDeMuestra` agregaba mirando solo `aplica` y `veredicto`, y no
       * tocaba `decision`. El resultado era que una decisión de auditor no
       * sobrevivía a la agregación: un `falla` firmado en una página salía del
       * informe del sitio como `humano` («pendiente de mirar»), y si además el
       * agente había marcado la ficha «no aplica», como «No aplica». Las dos cosas
       * borran trabajo hecho y firmado, y la segunda además absuelve al sitio de
       * una barrera que alguien había confirmado a mano.
       *
       * Reglas, en el orden en que se aplican:
       *  - un `falla` firmado en CUALQUIER página es un `falla` del sitio, sin más
       *    condiciones: es la regla de oro del motor;
       *  - si todas las páginas donde el criterio aplica están firmadas, el sitio
       *    hereda la PEOR de esas decisiones;
       *  - si queda alguna sin firmar, el criterio sigue pendiente —una firma en la
       *    página A no dice nada de la B— pero las decisiones ya tomadas se dicen,
       *    para que nadie repita el trabajo. */
      const decidido0 = decisionDeMuestra(firmadas, aplican);
      /* Con huecos en la muestra, un `no-aplica` —venga de la detección o de una
       * firma— tampoco cierra el criterio: quien firmó miró las páginas que
       * cargaron, no las que no. La firma no se pierde: se cuenta abajo, en lo que
       * ya sabemos, y el criterio sigue pendiente hasta que la muestra esté
       * completa. Un `falla`, un `cumple` o un `revisar` firmados sí se mantienen:
       * el primero porque una barrera confirmada basta, y los otros dos porque
       * hablan de contenido que alguien vio de verdad. */
      const decidido = (avisoHueco && decidido0 && decidido0.veredicto === "no-aplica") ? null : decidido0;

      if (!aplican.length && !firmadas.length) {
        const porque = "No viene al caso en ninguna de las " + fichas.length + " página(s) de la muestra que sí se auditaron. " +
          (modelo.loQueYaSabemos || []).join(" ");
        if (!avisoHueco) return noAplica(n, porque);
        // Muestra con huecos: no se cierra como «no aplica».
        return ficha(n, {
          aplica: true,
          veredicto: null,
          pregunta: modelo.pregunta || "¿Viene al caso este criterio en las páginas que no se pudieron auditar?",
          loQueYaSabemos: [avisoHueco, porque],
          comoDecidir: (modelo.comoDecidir && modelo.comoDecidir.length ? modelo.comoDecidir : []).concat([
            "Vuelve a lanzar la auditoría sobre las páginas que fallaron, o míralas a mano: hasta entonces este criterio no se puede cerrar."
          ])
        });
      }

      /* Una ficha firmada `no-aplica` por el auditor y ninguna que aplique: el
       * sitio no aplica, pero lo dice la FIRMA y no la detección. Se conserva la
       * decisión para que el motivo y el auditor salgan en el informe. */
      if (!aplican.length) {
        const porque = "No viene al caso en ninguna de las " + fichas.length + " página(s) de la muestra que sí se auditaron. " +
          (modelo.loQueYaSabemos || []).join(" ");
        if (decidido) {
          return Object.assign({}, noAplica(n, porque), { decision: decidido, veredicto: decidido.veredicto });
        }
        if (!avisoHueco) return noAplica(n, porque);
        return ficha(n, {
          aplica: true,
          veredicto: null,
          pregunta: modelo.pregunta || "¿Viene al caso este criterio en las páginas que no se pudieron auditar?",
          loQueYaSabemos: [avisoHueco, porque].concat(firmadas.length
            ? ["Ya decidido a mano en " + firmadas.map(function (x) { return x.url + " → " + x.f.decision.veredicto + " («" + x.f.decision.motivo + "», " + x.f.decision.auditor + ")"; }).join(" · ") + "."]
            : []),
          comoDecidir: [
            "Vuelve a lanzar la auditoría sobre las páginas que fallaron, o míralas a mano: hasta entonces este criterio no se puede cerrar."
          ]
        });
      }

      // Todo lo que hay que mirar, de todas las páginas, con su página al lado.
      const queMirar = [];
      aplican.forEach(function (x) {
        (x.f.queMirar || []).forEach(function (m) { queMirar.push(refPag(m, x.url)); });
      });

      const sabemos = [];
      const vistos = {};
      aplican.forEach(function (x) {
        (x.f.loQueYaSabemos || []).forEach(function (s) { if (!vistos[s]) { vistos[s] = 1; sabemos.push(s); } });
      });
      sabemos.unshift("Aplica en " + aplican.length + " de " + fichas.length + " página(s) de la muestra: " +
        aplican.slice(0, 6).map(function (x) { return x.url; }).join(", ") + (aplican.length > 6 ? "…" : "") + ".");
      if (aplican.length < fichas.length) {
        sabemos.push("En las otras " + (fichas.length - aplican.length) + " no viene al caso, pero el criterio es del sitio: basta una página para que haya que decidirlo.");
      }

      if (firmadas.length) {
        sabemos.push("Decidido a mano en " + firmadas.length + " de " + fichas.length + " página(s): " +
          firmadas.map(function (x) { return x.url + " → " + x.f.decision.veredicto; }).join(" · ") + "." +
          (decidido ? "" : " Falta por decidir en el resto: una firma en una página no cierra el criterio del sitio."));
      }
      if (avisoHueco) sabemos.unshift(avisoHueco);

      // El veredicto adelantado (2.4.4 sin enlaces vagos, por ejemplo) solo se
      // mantiene si TODAS las páginas donde aplica lo comparten.
      const veredictos = aplican.map(function (x) { return x.f.veredicto; });
      const comun = veredictos.every(function (v) { return v === veredictos[0]; }) ? veredictos[0] : null;

      return ficha(n, {
        decision: decidido,
        veredicto: decidido ? decidido.veredicto : comun,
        pregunta: modelo.pregunta,
        queMirar: queMirar,
        loQueYaSabemos: sabemos,
        comoDecidir: modelo.comoDecidir,
        datos: { paginas: aplican.length, total: fichas.length }
      });
    });

    // Y el cruce que solo existe aquí.
    const cruzados = redundanciaEntrePaginas(lista);
    if (cruzados.length) {
      const i = criterios.findIndex(function (c) { return c.criterio === "3.3.7"; });
      const f = criterios[i];
      const extra = [];
      cruzados.slice(0, 10).forEach(function (g) {
        Object.keys(g.paginas).forEach(function (u) {
          g.paginas[u].forEach(function (x) {
            extra.push({ locator: x.locator, path: x.path, pagina: u,
              detalle: "[entre páginas · " + g.clave + "] «" + (x.etiqueta || "(sin etiqueta)") + "»" +
                (g.confirmacion ? " · en alguna página parece una CONFIRMACIÓN" : "") });
          });
        });
      });
      // Si la ficha venía de «no aplica en ninguna página», esa frase ya no es
      // cierta y no puede quedarse: el criterio acaba de pasar a pendiente porque
      // la repetición está ENTRE páginas, que es precisamente lo que ninguna
      // página podía ver. Dejar la frase vieja debajo del estado nuevo sería
      // contarle al auditor dos cosas incompatibles.
      const previas = f.aplica ? (f.loQueYaSabemos || [])
        : ["Ninguna página de la muestra repite un dato dentro de sí misma: la repetición está ENTRE páginas."];
      criterios[i] = Object.assign({}, f, {
        aplica: true,
        veredicto: null,
        pregunta: f.pregunta || "¿Estos campos piden dos veces el mismo dato dentro del mismo proceso, sin rellenarlo solo ni ofrecerlo para elegir?",
        comoDecidir: f.comoDecidir && f.comoDecidir.length ? f.comoDecidir : [
          "Si el segundo campo es de confirmación, o volver a pedirlo es esencial → cumple.",
          "Si el dato ya se pidió antes en el mismo proceso y no se rellena solo ni se ofrece para elegir → falla.",
          "Comprueba primero que esas páginas son pasos del MISMO proceso: dos formularios sin relación pueden pedir el mismo dato sin incumplir nada."
        ],
        queMirar: (f.queMirar || []).concat(extra),
        loQueYaSabemos: previas.concat([
          cruzados.length + " dato(s) se piden en más de una página de la muestra: " +
          cruzados.slice(0, 6).map(function (g) { return g.clave; }).join(", ") + ". " +
          "Esto es lo que no se ve mirando una sola página, y es el caso típico de 3.3.7 en un trámite de varios pasos.",
          "El agente no sabe si esas páginas son pasos del mismo proceso: eso lo sabes tú."
        ])
      });
    }

    return {
      sitio: opts.sitio || null,
      paginas: urls,
      creado: new Date().toISOString(),
      criterios: criterios,
      resumen: resumenDe(criterios)
    };
  }

  /**
   * Mete el cuaderno en un informe ya hecho, sustituyendo lo genérico.
   *
   * Hace falta porque el motor ya emite algo para estos once: un `humano` con la
   * frase «requiere evaluación humana; ninguna máquina lo dictamina». Es verdad,
   * pero no ayuda. Y si los dos hallazgos conviven, el agregado se queda con el
   * peor —`humano` gana a `no-aplica`— y el trabajo del cuaderno se pierde: el
   * informe seguiría mandando al auditor a mirar el 1.2.5 de una página sin vídeo.
   *
   * Qué se sustituye y qué no:
   *  - se quitan los `humano` y `revisar` de esos once que vengan de otra capa,
   *    porque son exactamente los que el cuaderno viene a concretar;
   *  - **no se toca ningún `falla`**, venga de donde venga. Si axe o la capa
   *    dinámica encontraron una barrera real en 2.4.4, esa barrera se queda: el
   *    cuaderno añade juicio, no lo perdona.
   */
  function aplicaCuaderno(findings, cuaderno) {
    const mios = {};
    CRITERIOS_DE_JUICIO.forEach(function (n) { mios[n] = 1; });
    const conservados = (findings || []).filter(function (f) {
      if (!f || !f.c || !mios[f.c.n]) return true;
      if (f.verdict === "falla") return true;          // una barrera real no se borra
      if (f.scope === "juicio") return false;          // cuaderno viejo: se reemplaza
      return f.verdict !== "humano" && f.verdict !== "revisar";
    });
    return conservados.concat(findingsDelCuaderno(cuaderno));
  }

  /** El cuaderno en texto, para pegarlo en un correo o imprimirlo. */
  function cuadernoTexto(cuaderno) {
    const l = [];
    l.push("CUADERNO DE JUICIO" + (cuaderno.url ? " · " + cuaderno.url : "") +
      (cuaderno.paginas ? " · muestra de " + cuaderno.paginas.length + " página(s)" + (cuaderno.sitio ? " de " + cuaderno.sitio : "") : ""));
    const r = cuaderno.resumen;
    l.push(r.total + " criterios de evaluación humana: " + r.noAplican + " no aplican, " + r.pendientes + " pendientes, " + r.decididos + " decididos.");
    l.push("");
    (cuaderno.criterios || []).forEach(function (c) {
      const estado = c.decision ? c.decision.veredicto.toUpperCase() : (c.aplica ? "PENDIENTE" : "NO APLICA");
      l.push("── " + c.criterio + " " + c.nombre + " (" + c.nivel + ")  [" + estado + "]");
      if (c.decision) l.push("   " + c.decision.auditor + ", " + String(c.decision.fecha).slice(0, 10) + ": " + c.decision.motivo);
      if (c.pregunta) l.push("   ¿? " + c.pregunta);
      (c.loQueYaSabemos || []).forEach(function (s) { l.push("   · " + s); });
      (c.queMirar || []).slice(0, 12).forEach(function (m) {
        l.push("   → " + (m.pagina ? m.pagina + " · " : "") + m.locator + "  " + m.detalle);
      });
      if ((c.queMirar || []).length > 12) l.push("   → … y " + ((c.queMirar || []).length - 12) + " más");
      (c.comoDecidir || []).forEach(function (s) { l.push("   ✓ " + s); });
      l.push("");
    });
    return l.join("\n");
  }
  NS.CRITERIOS_DE_JUICIO = CRITERIOS_DE_JUICIO;
  NS.cuadernoDeJuicio = cuadernoDeJuicio;
  NS.pendientesDeJuicio = pendientesDeJuicio;
  NS.registrarJuicio = registrarJuicio;
  NS.findingsDelCuaderno = findingsDelCuaderno;
  NS.cuadernoDeMuestra = cuadernoDeMuestra;
  NS.aplicaCuaderno = aplicaCuaderno;
  NS.cuadernoTexto = cuadernoTexto;
})(A11Y);

/* ── oaw-letters.js ── */
(function (NS) {
  /**
   * Granularidad por letra del OAW: del criterio WCAG al subcriterio `9.X.Y.Z-L`.
   *
   * La plantilla del Informe de Hallazgos (R9.Web) no se conforma con la cláusula
   * EN `9.X.Y.Z`: dentro de un mismo criterio distingue casos con una letra. Un
   * `1.3.1` no es un `1.3.1` — es `-D` si el problema son listas, `-I` si son
   * tablas, `-Ñ` si son agrupaciones de controles, `-Q` si es la estructura de
   * regiones, y `-A` en el caso general. Esa asignación la venían haciendo a mano
   * las skills de informe; aquí la hace el motor, que es quien sabe qué comprobó.
   *
   * ── La diferencia con clasificar por el texto ──────────────────────────────
   * Lo evidente sería buscar palabras («tabla», «lista», «landmark») en la
   * redacción del hallazgo. Es lo que hacía el pipeline anterior y es frágil: el
   * subcriterio dependía de cómo estuviera redactada la frase, no de lo que se
   * comprobó. El motor tiene algo mucho mejor: sabe el TIPO de regla que saltó
   * (`types`) y sobre qué nodo (etiqueta, rol, si cuelga de un enlace). Eso son
   * hechos, no prosa.
   *
   * Así que el orden es: override del auditor → señal estructural → texto (solo
   * para hallazgos que no llevan tipo, como los de otras capas) → letra general.
   * Y cada asignación dice POR QUÉ vía se decidió, porque en un entregable con
   * efectos legales conviene poder auditar también el mapeo.
   *
   * ── Lo que NO hace ─────────────────────────────────────────────────────────
   * No inventa letras. Un criterio que no está en la tabla devuelve `null` con su
   * motivo, y el informe lo dice, en vez de colocar una `-A` por defecto que
   * pasaría por buena. Fuente de la tabla: plantilla OAW R9.Web v1.7.
   */

  /** Criterios que la plantilla OAW (v1.6 y v1.7) no recoge. */
  const NO_EN_PLANTILLA = ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"];

  /** Mapeo directo uno a uno. */
  const MAPA_DIRECTO = {
    "1.2.1": "9.1.2.1-A", "1.2.2": "9.1.2.2-A", "1.2.3": "9.1.2.3-A",
    "1.2.4": "9.1.2.4-A", // confirmado contra la plantilla R9.Web
    "1.2.5": "9.1.2.5-A",
    "1.3.2": "9.1.3.2-A", "1.3.3": "9.1.3.3-A", "1.3.4": "9.1.3.4-A", "1.3.5": "9.1.3.5-A",
    "1.4.1": "9.1.4.1-A", "1.4.2": "9.1.4.2-A", "1.4.3": "9.1.4.3-A", "1.4.4": "9.1.4.4-A",
    "1.4.5": "9.1.4.5-A", "1.4.10": "9.1.4.10-A", "1.4.11": "9.1.4.11-A", "1.4.12": "9.1.4.12-A",
    "1.4.13": "9.1.4.13-A",
    "2.1.1": "9.2.1.1-A", "2.1.2": "9.2.1.2-A", "2.1.4": "9.2.1.4-A",
    "2.2.1": "9.2.2.1-A", "2.2.2": "9.2.2.2-A", "2.3.1": "9.2.3.1-A",
    "2.4.1": "9.2.4.1-A", "2.4.2": "9.2.4.2-A", "2.4.3": "9.2.4.3-A",
    "2.4.4": "9.2.4.4-A", "2.4.5": "9.2.4.5-A", "2.4.6": "9.2.4.6-A", "2.4.7": "9.2.4.7-A",
    "2.5.1": "9.2.5.1-A", "2.5.2": "9.2.5.2-A", "2.5.3": "9.2.5.3-A", "2.5.4": "9.2.5.4-A",
    "3.1.1": "9.3.1.1-A", "3.1.2": "9.3.1.2-A",
    "3.2.1": "9.3.2.1-A", "3.2.2": "9.3.2.2-A", "3.2.3": "9.3.2.3-A", "3.2.4": "9.3.2.4-A",
    "3.3.1": "9.3.3.1-A", "3.3.2": "9.3.3.2-A", "3.3.3": "9.3.3.3-A", "3.3.4": "9.3.3.4-A",
    "4.1.1": "9.4.1.1-A", "4.1.3": "9.4.1.3-A"
  };

  /** Criterios con varias letras posibles: los resuelve `granular()`. */
  const GRANULARES = ["1.1.1", "1.3.1", "4.1.2"];

  /** Letras válidas de cada criterio granular, con su significado. */
  const LETRAS = {
    "1.1.1": {
      A: "alternativa textual ausente o incorrecta (caso general)",
      G: "imagen que actúa como enlace",
      K: "imagen decorativa sin marcar como tal"
    },
    "1.3.1": {
      A: "relación programática campo↔etiqueta, pares etiqueta/valor",
      D: "listas no marcadas semánticamente",
      I: "tablas de datos sin encabezados o sin título",
      "Ñ": "agrupaciones de controles sin fieldset/legend",
      Q: "estructura de regiones, navegación, encabezados"
    },
    "4.1.2": {
      A: "nombre y rol",
      B: "estados y propiedades"
    }
  };

  /* ── Señales estructurales ─────────────────────────────────────────────────
   *
   * La etiqueta sale del locator porque el motor lo construye siempre como
   * `tag`, `tag#id`, `tag.clase` o `tag[type=…]`; si el nodo trae `tag` propio,
   * ese manda. Nada de esto depende de cómo esté redactado el hallazgo.
   */
  function tagDe(node) {
    if (!node) return "";
    if (node.tag) return String(node.tag).toLowerCase();
    const m = /^([a-z][a-z0-9-]*)/i.exec(String(node.locator || ""));
    return m ? m[1].toLowerCase() : "";
  }

  const TABLA_TAGS = ["table", "th", "td", "tr", "caption", "thead", "tbody", "tfoot"];
  const TABLA_ROLES = ["table", "grid", "treegrid", "columnheader", "rowheader", "cell", "gridcell", "row", "rowgroup"];
  const LISTA_TAGS = ["ul", "ol", "dl", "li", "dt", "dd"];
  const LISTA_ROLES = ["list", "listitem", "definition", "term"];
  const REGION_TAGS = ["nav", "main", "header", "footer", "aside", "section", "h1", "h2", "h3", "h4", "h5", "h6"];
  const REGION_ROLES = ["navigation", "main", "banner", "contentinfo", "complementary", "region", "heading", "search", "article"];
  const GRUPO_TAGS = ["fieldset", "legend", "optgroup"];
  const GRUPO_ROLES = ["group", "radiogroup"];

  // Tipos de regla del motor que hablan de ESTADOS/propiedades ARIA, no de nombre
  // ni de rol. Es lo que separa 9.4.1.2-B de 9.4.1.2-A sin mirar la redacción.
  const TIPOS_ESTADO = ["aria-missing-state", "state-invalid", "aria-bad-value", "aria-unknown-attr"];

  function enLista(v, lista) { return lista.indexOf(v) !== -1; }

  /** Estructura → letra, o null si la estructura no lo decide. */
  function porEstructura(crit, node, types) {
    const tag = tagDe(node), role = String((node && node.role) || "").toLowerCase();
    types = types || [];

    if (crit === "1.1.1") {
      if (node && node.enEnlace) return { letra: "G", motivo: "la imagen cuelga de un enlace" };
      // Los hallazgos que vienen de axe traen un selector CSS con la ascendencia
      // («a[href] > img»), donde el dato está a la vista aunque no haya `enEnlace`.
      if (node && /(^|[\s>+~])a\b[^,]*[\s>+~](img|svg)\b/i.test(String(node.locator || ""))) {
        return { letra: "G", motivo: "el selector sitúa la imagen dentro de un enlace" };
      }
      return null; // A vs K es intención: no se decide por estructura
    }

    if (crit === "1.3.1") {
      if (enLista(tag, TABLA_TAGS) || enLista(role, TABLA_ROLES)) return { letra: "I", motivo: "el nodo es una tabla o parte de una tabla" };
      if (enLista(tag, LISTA_TAGS) || enLista(role, LISTA_ROLES) || enLista("list-no-items", types)) return { letra: "D", motivo: "el nodo es una lista o un elemento de lista" };
      if (enLista(tag, GRUPO_TAGS) || enLista(role, GRUPO_ROLES)) return { letra: "Ñ", motivo: "el nodo es una agrupación de controles" };
      if (enLista(tag, REGION_TAGS) || enLista(role, REGION_ROLES)) return { letra: "Q", motivo: "el nodo es una región, navegación o encabezado" };
      return null;
    }

    if (crit === "4.1.2") {
      for (let i = 0; i < types.length; i++) {
        if (enLista(types[i], TIPOS_ESTADO)) return { letra: "B", motivo: "la regla que saltó es de estados/propiedades (" + types[i] + ")" };
      }
      if (types.length) return { letra: "A", motivo: "la regla que saltó es de nombre o rol (" + types.join(", ") + ")" };
      return null;
    }

    return null;
  }

  /* ── Señales de texto (solo cuando no hay estructura que mirar) ───────────── */

  const CLAVES = {
    "1.1.1": [
      { letra: "K", palabras: ["decorativ", "ilustrativ", "aria-hidden", 'alt=""', "alt=''", "fondo", "background", "espaciador"] },
      { letra: "G", palabras: ["imagen enlaz", "logotipo enlaz", "imagen que enlaza", "dentro de un enlace"] }
    ],
    "1.3.1": [
      { letra: "I", palabras: ["tabla de dato", "caption", "<th>", "encabezado de tabla", "encabezados de columna", "tabla"] },
      { letra: "Ñ", palabras: ["fieldset", "legend", "agrupaci", "bloque de campo", "grupo de controles"] },
      { letra: "Q", palabras: ["landmark", "region", "<main", 'role="main', "menú", "navegaci", "miga", "breadcrumb", "encabezado", "jerarquía", "estructura"] },
      { letra: "D", palabras: ["<ul", "<ol", "<dl", "<li", "listado", "lista"] }
    ],
    "4.1.2": [
      { letra: "B", palabras: ["estado", "aria-expanded", "aria-selected", "aria-checked", "aria-pressed", "aria-disabled", "aria-current", "propiedad"] }
    ]
  };

  /**
   * Texto de la evidencia para buscar palabras clave.
   *
   * OJO: NO se despoja todo lo que parezca una etiqueta. Varias claves de la tabla
   * son literalmente nombres de etiqueta («<ul», «<li», «<th>», «<main»), y al
   * quitarlas antes de buscarlas no podían coincidir jamás: una evidencia que
   * decía «se maquetan con <div> en vez de <ul>» acababa en la letra -Q por la
   * palabra «menú», en vez de en la -D que le toca. Se quitan solo las etiquetas
   * de FORMATO que el propio motor usa como marcado.
   */
  const FORMATO = /<\/?(?:code|strong|b|em|i|span|br|small|abbr)(?:\s[^>]*)?>/gi;
  function textoDe(finding) {
    const ev = (finding.evid || []).join(" ");
    return String(ev + " " + (finding.detail || "")).replace(FORMATO, " ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").toLowerCase();
  }

  /**
   * Una etiqueta nombrada explícitamente pesa más que una palabra corriente.
   *
   * Con el orden de las reglas a secas, «los elementos del menú se maquetan con
   * <div> en vez de <ul>» casaba primero con «menú» (letra -Q) y nunca llegaba a
   * «<ul» (letra -D), que es la que describe el problema. Nombrar el marcado es
   * evidencia más fuerte que un sustantivo de la prosa.
   */
  function porTexto(crit, finding) {
    const reglas = CLAVES[crit];
    if (!reglas) return null;
    const t = textoDe(finding);
    let flojo = null;
    for (let i = 0; i < reglas.length; i++) {
      for (let j = 0; j < reglas[i].palabras.length; j++) {
        const kw = reglas[i].palabras[j];
        if (t.indexOf(kw) === -1) continue;
        const hit = { letra: reglas[i].letra, motivo: 'la redacción menciona «' + kw + "»" };
        if (kw.charAt(0) === "<") return hit;      // nombra el marcado: manda
        if (!flojo) flojo = hit;                    // se guarda por si no hay nada mejor
      }
    }
    return flojo;
  }

  /* ── API ───────────────────────────────────────────────────────────────────── */

  /** Cláusula EN sin letra a partir del criterio: 1.3.1 → 9.1.3.1 */
  function clausula(crit) { return "9." + crit; }

  /**
   * Subcriterio OAW de un hallazgo.
   *
   * @param {object} finding  hallazgo del agente ({ c:{n}, nodes, evid, types })
   * @param {object} [opts]   { overrides: { "<crit>": "9.1.3.1-Q", "<crit>|<locator>": "…" },
   *                            nodo: nodo concreto al que se refiere la fila }
   * @returns {{subcriterio: string|null, via: string, motivo: string}}
   */
  function letraOAW(finding, opts) {
    opts = opts || {};
    if (!finding || !finding.c || !finding.c.n) {
      return { subcriterio: null, via: "sin-criterio", motivo: "el hallazgo no identifica ningún criterio" };
    }
    const crit = finding.c.n;
    const node = opts.nodo || (finding.nodes && finding.nodes[0]) || null;

    // 1) Override del auditor: prioridad absoluta, como en el pipeline manual.
    const ov = opts.overrides || {};
    const claveNodo = node && node.locator ? crit + "|" + node.locator : null;
    if (claveNodo && ov[claveNodo]) return { subcriterio: ov[claveNodo], via: "override", motivo: "override del auditor para este elemento" };
    if (ov[crit]) return { subcriterio: ov[crit], via: "override", motivo: "override del auditor para el criterio" };

    if (NO_EN_PLANTILLA.indexOf(crit) !== -1) {
      return { subcriterio: null, via: "fuera-de-plantilla", motivo: "el criterio " + crit + " no figura en la plantilla OAW R9.Web: se informa por su cláusula EN, sin subcriterio" };
    }

    if (GRANULARES.indexOf(crit) !== -1) {
      const est = porEstructura(crit, node, finding.types);
      if (est) return { subcriterio: clausula(crit) + "-" + est.letra, via: "estructura", motivo: est.motivo };
      const txt = porTexto(crit, finding);
      if (txt) return { subcriterio: clausula(crit) + "-" + txt.letra, via: "texto", motivo: txt.motivo };
      return { subcriterio: clausula(crit) + "-A", via: "general", motivo: "ninguna señal distingue el caso: letra general del criterio" };
    }

    if (MAPA_DIRECTO[crit]) return { subcriterio: MAPA_DIRECTO[crit], via: "directo", motivo: "el criterio tiene un único subcriterio en la plantilla" };

    // Ni granular, ni directo, ni excluido: la tabla no lo cubre. Se dice, no se
    // rellena. Inventar una letra en un entregable con efectos legales es peor
    // que dejar la casilla marcada como pendiente.
    return { subcriterio: null, via: "sin-mapear", motivo: "el criterio " + crit + " no está en la tabla de subcriterios OAW: asígnalo a mano contra la plantilla" };
  }

  /** Resumen de cómo se asignaron los subcriterios de un lote (para el informe). */
  function resumenAsignacion(filas) {
    const via = {};
    (filas || []).forEach(function (f) {
      // Acepta tanto el resultado de `letraOAW` (`via`) como una fila ya exportada
      // (`oawVia`): si no, el resumen salía contando una clave «undefined».
      const k = f.via || f.oawVia || "desconocida";
      via[k] = (via[k] || 0) + 1;
    });
    return via;
  }
  NS.NO_EN_PLANTILLA = NO_EN_PLANTILLA;
  NS.MAPA_DIRECTO = MAPA_DIRECTO;
  NS.GRANULARES = GRANULARES;
  NS.LETRAS = LETRAS;
  NS.tagDe = tagDe;
  NS.letraOAW = letraOAW;
  NS.resumenAsignacion = resumenAsignacion;
})(A11Y);

/* ── report-oaw.js ── */
(function (NS) {
  const { enClause, cmpSC, WCAG22, worseOf, letraOAW, resumenAsignacion } = NS;
  /**
   * Puente a los entregables OAW / IRA (UNE-EN 301 549 v3.2.1, RD 1112/2018).
   *
   * Transforma los hallazgos del agente a la forma que consumen los informes de
   * auditoría: una hoja de "Barreras" (una fila por barrera, con su subcriterio
   * EN `9.X.Y.Z`) y una hoja de "Seguimiento" (resultado agregado por subcriterio,
   * estilo WCAG-EM). Emite CSV para Excel en español (BOM + `;` + CRLF) y JSON.
   *
   * El mapeo llega a la letra del OAW (`9.X.Y.Z-A/-B…`, ver `oaw-letters.js`),
   * resuelta por cada fila a partir de lo que el motor comprobó, con la vía de
   * asignación en su propia columna. El formato exacto de tus plantillas lo aplican
   * las skills de Informe de Hallazgos / IRA; esto les da la materia prima ya
   * normalizada. Los 6 criterios nuevos de WCAG 2.2 no están en la EN vigente:
   * se marcan `enEN:false` y se separan (el IRA solo cubre cláusulas EN).
   *
   * Política de fallo seguro: solo `cumple` y `pasa` se exportan como "Correcto".
   * `humano`, `revisar`, `cumple-parcial` y cualquier veredicto desconocido salen
   * como "No se puede comprobar" — un criterio no evaluado jamás se declara
   * conforme en un entregable con efectos legales.
   */

  const IX = {};
  WCAG22.forEach(function (c) { IX[c.n] = c; });

  /**
   * Quita el marcado de la evidencia, pero SOLO el que el motor pone como marcado.
   *
   * Varias capas escriben el nombre de una etiqueta como contenido: «La página no
   * tiene <title> en <head>», «No hay landmark <main>». Un `replace(/<[^>]*>/g)`
   * a secas se los comía y la evidencia llegaba al informe como «La página no
   * tiene  en  o está vacío».
   */
  const ETIQUETAS_DEL_MOTOR = /<\/?(?:code|strong|b|em|i|span|br|p|ul|ol|li|small|abbr)(?:\s[^>]*)?>/gi;
  function stripTags(s) {
    return String(s == null ? "" : s).replace(ETIQUETAS_DEL_MOTOR, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  }
  // Gravedad del agente → clasificación de la barrera.
  const GRAVEDAD = { "crítica": "Crítica", grave: "Grave", moderada: "Moderada", leve: "Leve" };

  /** Veredicto agregado → resultado OAW. */
  function resultadoOAW(worst) {
    if (worst == null) return "No evaluado";
    if (worst === "falla") return "Falla";
    if (worst === "no-aplica") return "No aplica";
    if (worst === "cumple" || worst === "pasa") return "Correcto";
    if (worst === "humano") return "No se puede comprobar (evaluación humana)";
    if (worst === "cumple-parcial") return "No se puede comprobar (presencia correcta; calidad pendiente)";
    // `revisar` y cualquier veredicto no reconocido
    return "No se puede comprobar (revisión manual)";
  }

  // Nº de instancias de barrera que representa un hallazgo (un nodo = una barrera).
  function instancias(f) {
    return (f.nodes && f.nodes.length) ? f.nodes.length : 1;
  }

  /**
   * Una fila de "Barreras" por cada ELEMENTO afectado (no por criterio): en un IRA
   * cada instancia es una fila. Un hallazgo con 7 nodos produce 7 filas.
   */
  function barreras(findings, ctx) {
    ctx = ctx || {};
    const rows = [];
    (findings || [])
      .filter(function (f) { return f.verdict === "falla"; })
      .forEach(function (f) {
        const n = f.c.n;
        const en = enClause(n);
        const evidencia = (f.evid || []).map(stripTags).join(" ");
        const base = {
          subcriterio: en || "",
          enEN: !!en,
          criterio: n,
          nombre: f.c.t,
          nivel: f.c.lvl,
          gravedad: GRAVEDAD[f.sev] || (f.sev || "Sin clasificar"),
          ambito: f.scope || f.origen || "componente",
          // El dato del hallazgo manda sobre el del contexto: `auditSite` sella
          // cada hallazgo con SU página, y los de coherencia con «(toda la
          // muestra)». Al revés, todas las filas salían con la misma URL.
          pagina: f.url || ctx.url || "",
          evidencia: evidencia
        };
        const nodes = (f.nodes && f.nodes.length) ? f.nodes : [null];
        nodes.forEach(function (nd) {
          // La letra se resuelve POR FILA, no por criterio: dos barreras del mismo
          // 1.3.1 pueden ser `-I` (una tabla) y `-D` (una lista).
          const oaw = letraOAW(f, { overrides: ctx.overrides, nodo: nd });
          rows.push(Object.assign({}, base, {
            // Y el NODO manda sobre el hallazgo, cuando sabe de qué página es. El
            // cuaderno de la muestra sella sus hallazgos como «(toda la muestra)»
            // —el criterio es del sitio— pero cada elemento del expediente viene de
            // una página concreta. Sin esto, un `falla` firmado sobre veinte
            // enlaces dejaba veinte filas con la Página sin resolver, que es justo
            // el dato que hace falta para ir a arreglarlo.
            pagina: (nd && nd.url) || base.pagina,
            elemento: nd ? (nd.locator + (nd.name ? " «" + nd.name + "»" : "")) : "",
            // El locator se lee; el selector IDENTIFICA. Dos <img> sin id ni clase
            // son las dos «img», y con eso no se puede ir a buscar el elemento.
            selector: (nd && (nd.path || nd.uid)) || "",
            subcriterioOAW: oaw.subcriterio || "",
            oawVia: oaw.via,
            oawMotivo: oaw.motivo
          }));
        });
      });
    return rows.sort(function (a, b) { return cmpSC(a.criterio, b.criterio); });
  }

  // Una fila de "Seguimiento" por subcriterio EN aplicable, con el resultado agregado.
  /**
   * @param {Array} findings
   * @param {{ todosLosCriterios?: boolean }} [opts] Con `todosLosCriterios` se
   *   emite además una fila «No evaluado» por cada criterio de los 55 que no
   *   aparece en ningún hallazgo. Sin ella, la diferencia entre «comprobado y
   *   correcto» y «nadie lo miró» se perdía justo en el entregable: los criterios
   *   ausentes no generaban fila, y la rama «No evaluado» era código muerto.
   */
  function seguimiento(findings, opts) {
    const by = {};
    (findings || []).forEach(function (f) {
      const n = f.c.n;
      // `worst: null` = aún no evaluado; el primer hallazgo lo fija.
      if (!by[n]) by[n] = { criterio: n, nombre: f.c.t, nivel: f.c.lvl, worst: null, n: 0 };
      by[n].worst = worseOf(by[n].worst, f.verdict);
      if (f.verdict === "falla") by[n].n += instancias(f);
    });
    if (opts && opts.todosLosCriterios) {
      WCAG22.forEach(function (c) {
        if (!by[c.n]) by[c.n] = { criterio: c.n, nombre: c.t, nivel: c.lvl, worst: null, n: 0 };
      });
    }
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return cmpSC(a.criterio, b.criterio); })
      .map(function (r) {
        const en = enClause(r.criterio);
        return {
          subcriterio: en || "",
          enEN: !!en,
          criterio: r.criterio,
          nombre: r.nombre,
          nivel: r.nivel,
          veredicto: r.worst,
          resultado: resultadoOAW(r.worst),
          num_barreras: r.n
        };
      });
  }

  /**
   * Celda CSV.
   *
   * Además del entrecomillado, neutraliza la INYECCIÓN DE FÓRMULAS: las evidencias
   * llevan texto tomado de sitios ajenos (nombres accesibles, contenidos), y Excel
   * o Calc ejecutan como fórmula cualquier celda que empiece por `=`, `+`, `-`, `@`
   * o un control. Se antepone un apóstrofo —convención de las hojas de cálculo—
   * salvo si la celda es un número legítimo.
   */
  function csvCell(s) {
    s = String(s == null ? "" : s);
    let peligrosa = false;
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) { s = "'" + s; peligrosa = true; }
    // Una celda neutralizada va SIEMPRE entrecomillada: así Excel y Calc la importan
    // como texto literal y el apóstrofo hace su trabajo.
    return (peligrosa || /[";\n\r]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(rows, columns) {
    const head = columns.map(function (c) { return c.label; });
    const lines = [head.map(csvCell).join(";")];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return csvCell(r[c.key]); }).join(";")); });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  const COLS_BARRERAS = [
    { key: "subcriterio", label: "Subcriterio EN (9.X.Y.Z)" },
    { key: "subcriterioOAW", label: "Subcriterio OAW (9.X.Y.Z-L)" },
    { key: "oawVia", label: "Asignado por" },
    { key: "enEN", label: "En la EN vigente" },
    { key: "criterio", label: "Criterio WCAG" },
    { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" }, { key: "gravedad", label: "Gravedad" },
    { key: "ambito", label: "Ámbito" }, { key: "pagina", label: "Página" }, { key: "elemento", label: "Elemento" },
    { key: "selector", label: "Selector" },
    { key: "evidencia", label: "Evidencia" }
  ];
  const COLS_SEGUIMIENTO = [
    { key: "subcriterio", label: "Subcriterio EN (9.X.Y.Z)" }, { key: "enEN", label: "En la EN vigente" },
    { key: "criterio", label: "Criterio WCAG" },
    { key: "nombre", label: "Nombre" }, { key: "nivel", label: "Nivel" }, { key: "resultado", label: "Resultado" },
    { key: "num_barreras", label: "Nº barreras" }
  ];

  /**
   * Exporta los hallazgos a la forma OAW/IRA.
   * @param {Array} findings  hallazgos del agente (unificados)
   * @param {{ url?:string, overrides?:object }} [ctx]  `overrides` fija el
   *   subcriterio OAW a mano: por criterio (`"1.3.1"`) o por elemento
   *   (`"1.3.1|nav.principal"`), y gana sobre cualquier asignación automática.
   */
  function oawExport(findings, ctx) {
    ctx = ctx || {};
    const b = barreras(findings, ctx);
    const s = seguimiento(findings, { todosLosCriterios: ctx.todosLosCriterios !== false });
    // Solo los EVALUADOS: desde que el Seguimiento emite fila para los 55
    // criterios, listar aquí los seis que no están en la EN vigente aunque nadie
    // los haya mirado convertía un dato útil («esto se ha evaluado y no cabe en el
    // IRA») en una constante.
    const fueraEN = s.filter(function (r) { return !r.enEN && r.veredicto != null; }).map(function (r) { return r.criterio; });
    // Las filas que se quedaron sin subcriterio OAW no se esconden: son justo las
    // que hay que mirar a mano contra la plantilla antes de entregar.
    const sinSubcriterio = b.filter(function (r) { return !r.subcriterioOAW; })
      .map(function (r) { return { criterio: r.criterio, elemento: r.elemento, motivo: r.oawMotivo }; });
    return {
      barreras: b,
      seguimiento: s,
      fueraDeEN: fueraEN, // criterios WCAG 2.2 aún no en la EN vigente
      oaw: { asignacion: resumenAsignacion(b), sinSubcriterio: sinSubcriterio },
      noEvaluados: s.filter(function (r) { return r.veredicto == null; }).map(function (r) { return r.criterio; }),
      csv: { barreras: toCsv(b, COLS_BARRERAS), seguimiento: toCsv(s, COLS_SEGUIMIENTO) }
    };
  }
  NS.resultadoOAW = resultadoOAW;
  NS.barreras = barreras;
  NS.seguimiento = seguimiento;
  NS.csvCell = csvCell;
  NS.toCsv = toCsv;
  NS.oawExport = oawExport;
})(A11Y);

/* ── sampling.js ── */
(function (NS) {
  /**
   * Selección de muestra representativa (WCAG-EM, paso 3).
   *
   * Hasta ahora las URLs las ponía la persona auditora. La metodología WCAG-EM pide
   * algo más concreto: una **muestra estructurada** (páginas comunes, una por
   * plantilla, cada tipo de contenido y tecnología, los procesos completos) más una
   * **muestra aleatoria** de al menos el 10 % de aquella, y —esto es lo que acaba
   * en el IRA— la justificación de por qué está cada página.
   *
   * Este módulo es puro: recibe candidatas ya clasificadas y devuelve la muestra
   * con su motivo. El rastreo, que es lo que toca la red, vive en crawl.js.
   *
   * Dos decisiones que lo hacen utilizable en un entregable:
   *
   *  - La parte aleatoria es **reproducible**: un generador con semilla, y la
   *    semilla viaja en el resultado. Dos ejecuciones con la misma semilla dan la
   *    misma muestra, que es lo que permite defender el informe y repetirlo.
   *  - Cada página seleccionada lleva su **motivo**. Una muestra sin justificación
   *    no vale para el IRA, por bien elegida que esté.
   */

  /* ── Generador reproducible ──────────────────────────────────────────────── */

  function semillaANumero(s) {
    let h = 2166136261 >>> 0;
    const t = String(s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  /** PRNG determinista (mulberry32): misma semilla, misma secuencia. */
  function rngDesde(semilla) {
    let a = semillaANumero(semilla);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Baraja reproducible (Fisher–Yates con el PRNG dado). No muta la entrada. */
  function barajar(lista, rnd) {
    const a = (lista || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ── Categorías de la muestra estructurada ───────────────────────────────── */

  /**
   * Páginas comunes que WCAG-EM pide incluir explícitamente. El orden importa:
   * es el de prioridad cuando hay que recortar la muestra.
   */
  const CATEGORIAS = [
    { id: "inicio", etiqueta: "Página de inicio", esencial: true },
    { id: "accesibilidad", etiqueta: "Declaración de accesibilidad", esencial: true },
    { id: "contacto", etiqueta: "Contacto", esencial: true },
    { id: "mapa-web", etiqueta: "Mapa web", esencial: false },
    { id: "ayuda", etiqueta: "Ayuda o preguntas frecuentes", esencial: false },
    { id: "legal", etiqueta: "Aviso legal o privacidad", esencial: false },
    { id: "busqueda", etiqueta: "Resultados de búsqueda", esencial: true },
    { id: "formulario", etiqueta: "Página con formulario", esencial: true },
    { id: "acceso", etiqueta: "Acceso o registro", esencial: true },
    { id: "proceso", etiqueta: "Paso de un proceso", esencial: true }
  ];
  const CAT_IX = {};
  CATEGORIAS.forEach(function (c) { CAT_IX[c.id] = c; });

  /** Tipos de contenido y tecnología que la muestra debe cubrir al menos una vez. */
  const CONTENIDOS = [
    { id: "video", etiqueta: "Vídeo" },
    { id: "audio", etiqueta: "Audio" },
    { id: "tabla", etiqueta: "Tabla de datos" },
    { id: "iframe", etiqueta: "Contenido embebido (iframe)" },
    { id: "canvas", etiqueta: "Gráfico o lienzo (canvas/SVG complejo)" },
    { id: "pdf", etiqueta: "Enlaces a documentos PDF" },
    { id: "mapa", etiqueta: "Mapa interactivo" },
    { id: "widget", etiqueta: "Widget dinámico (pestañas, acordeón, diálogo)" },
    { id: "carrusel", etiqueta: "Carrusel o contenido en movimiento" }
  ];
  const CONT_IX = {};
  CONTENIDOS.forEach(function (c) { CONT_IX[c.id] = c; });

  /* ── Clasificación por URL y por señales ─────────────────────────────────── */

  const URL_RE = [
    ["accesibilidad", /(accesibilidad|accessibility|declaraci[oó]n[-\s]de[-\s]accesibilidad)/i],
    ["mapa-web", /(mapa[-\s]?web|mapa[-\s]del[-\s]sitio|sitemap|[ií]ndice[-\s]del[-\s]sitio)/i],
    ["contacto", /(contacto|contactar|contact)/i],
    ["ayuda", /(ayuda|help|faq|preguntas[-\s]frecuentes|soporte|support)/i],
    ["legal", /(aviso[-\s]?legal|privacidad|privacy|cookies|t[eé]rminos|terminos|legal)/i],
    ["busqueda", /(buscar|busqueda|search|resultados)/i],
    ["acceso", /(login|acceso|iniciar[-\s]?sesi[oó]n|iniciar[-\s]?sesion|registro|signin|sign[-\s]?up|alta)/i]
  ];

  /**
   * Clasifica una candidata. `pagina` es lo que produce el rastreo:
   * `{ url, ruta, titulo, estructura, señales }`.
   */
  function clasificar(pagina) {
    const cats = [];
    const ruta = String(pagina.ruta || pagina.url || "");
    const titulo = String(pagina.titulo || "");
    const s = pagina["señales"] || pagina.senales || {};

    if (ruta === "/" || ruta === "" || s.esInicio) cats.push("inicio");
    URL_RE.forEach(function (par) {
      if (par[1].test(ruta) || par[1].test(titulo)) { if (cats.indexOf(par[0]) === -1) cats.push(par[0]); }
    });
    // Las señales del DOM mandan sobre la URL: un formulario de acceso es acceso
    // aunque la ruta no lo diga.
    if (s.tieneAcceso && cats.indexOf("acceso") === -1) cats.push("acceso");
    if (s.tieneBusqueda && cats.indexOf("busqueda") === -1 && /resultado|search|buscar/i.test(ruta + " " + titulo)) cats.push("busqueda");
    if (s.tieneFormulario && cats.indexOf("acceso") === -1 && cats.indexOf("formulario") === -1) cats.push("formulario");
    if (s.esProceso) cats.push("proceso");

    const contenidos = CONTENIDOS.map(function (c) { return c.id; }).filter(function (id) { return !!s[id]; });
    return { categorias: cats, contenidos: contenidos, plantilla: pagina.plantilla || null };
  }

  /* ── Selección ───────────────────────────────────────────────────────────── */

  function añadir(sel, vistos, pagina, motivo) {
    const y = vistos[pagina.url];
    if (y) { if (y.motivos.indexOf(motivo) === -1) y.motivos.push(motivo); return false; }
    const item = { url: pagina.url, titulo: pagina.titulo || "", plantilla: pagina.plantilla || null, motivos: [motivo] };
    vistos[pagina.url] = item;
    sel.push(item);
    return true;
  }

  /**
   * Construye la muestra.
   *
   * @param {Array} candidatas  páginas rastreadas, cada una con { url, ruta, titulo, plantilla, señales }
   * @param {{ max?:number, semilla?:string, porcentajeAleatorio?:number, minAleatorias?:number }} [opts]
   */
  function seleccionarMuestra(candidatas, opts) {
    opts = opts || {};
    const max = opts.max || 20;
    const semilla = opts.semilla != null ? String(opts.semilla) : "wcag-em";
    const pct = opts.porcentajeAleatorio != null ? opts.porcentajeAleatorio : 0.10;
    // ORDEN CANÓNICO por URL antes de nada. La semilla garantiza la misma
    // permutación, pero sobre la misma lista de entrada: si las candidatas llegan
    // en otro orden —otro rastreo, otra concurrencia, otra profundidad— la muestra
    // «reproducible» salía distinta con la misma semilla. Ahora la reproducibilidad
    // no depende de cómo llegaron las páginas.
    const todas = (candidatas || []).map(function (p) {
      return Object.assign({}, p, { clasif: clasificar(p) });
    }).sort(function (a, b) { return String(a.url).localeCompare(String(b.url)); });
    if (!todas.length) {
      return { muestra: [], estructurada: [], aleatoria: [], cobertura: { categorias: {}, contenidos: {}, plantillas: 0 }, semilla: semilla, candidatas: 0, avisos: ["No hay ninguna página candidata."] };
    }

    const rnd = rngDesde(semilla);
    const estructurada = [], vistos = {};
    const avisos = [];

    // 1) Páginas comunes, en el orden de prioridad de CATEGORIAS.
    CATEGORIAS.forEach(function (cat) {
      const cands = todas.filter(function (p) { return p.clasif.categorias.indexOf(cat.id) !== -1; });
      if (!cands.length) {
        if (cat.esencial) avisos.push("No se ha encontrado ninguna página de la categoría «" + cat.etiqueta + "»: compruébalo a mano antes de dar la muestra por buena.");
        return;
      }
      // La más corta: suele ser la canónica («/contacto» antes que «/es/x/contacto-2»).
      const elegida = cands.slice().sort(function (a, b) { return String(a.ruta || a.url).length - String(b.ruta || b.url).length; })[0];
      añadir(estructurada, vistos, elegida, cat.etiqueta);
    });

    // 2) Una por plantilla: es lo que garantiza cubrir todos los diseños del sitio.
    const porPlantilla = {};
    todas.forEach(function (p) {
      const k = p.plantilla || "(sin plantilla)";
      if (!porPlantilla[k]) porPlantilla[k] = [];
      porPlantilla[k].push(p);
    });
    const plantillas = Object.keys(porPlantilla);
    plantillas.forEach(function (k) {
      // Si ya hay una página de esta plantilla, no se añade otra — pero SÍ se anota
      // el motivo en la que está. Un motivo que no se registra es una justificación
      // que falta en el IRA.
      const yaCubierta = estructurada.filter(function (it) { return it.plantilla === k; })[0];
      if (yaCubierta) {
        const m = "Plantilla propia (" + porPlantilla[k].length + " página(s) la comparten)";
        if (yaCubierta.motivos.indexOf(m) === -1) yaCubierta.motivos.push(m);
        return;
      }
      // Del grupo, la de ruta más corta: la representante natural.
      const elegida = porPlantilla[k].slice().sort(function (a, b) { return String(a.ruta || a.url).length - String(b.ruta || b.url).length; })[0];
      añadir(estructurada, vistos, elegida, "Plantilla propia (" + porPlantilla[k].length + " página(s) la comparten)");
    });

    // 3) Tipos de contenido y tecnología.
    CONTENIDOS.forEach(function (c) {
      const motivo = "Tipo de contenido: " + c.etiqueta;
      const yaCubierto = estructurada.filter(function (it) {
        const p = todas.find(function (x) { return x.url === it.url; });
        return p && p.clasif.contenidos.indexOf(c.id) !== -1;
      })[0];
      if (yaCubierto) {
        if (yaCubierto.motivos.indexOf(motivo) === -1) yaCubierto.motivos.push(motivo);
        return;
      }
      const cands = todas.filter(function (p) { return p.clasif.contenidos.indexOf(c.id) !== -1; });
      if (!cands.length) return;
      añadir(estructurada, vistos, cands[0], motivo);
    });

    // 4) Muestra aleatoria: al menos el 10 % de la estructurada, de lo que sobra.
    const resto = todas.filter(function (p) { return !vistos[p.url]; });
    const nAleatorias = Math.max(opts.minAleatorias != null ? opts.minAleatorias : 1, Math.ceil(estructurada.length * pct));
    const aleatoria = [];
    // `resto` ya viene del orden canónico de `todas`: barajar sobre una copia.
    barajar(resto.slice(), rnd).slice(0, Math.min(nAleatorias, resto.length)).forEach(function (p) {
      añadir(aleatoria, vistos, p, "Muestra aleatoria (semilla «" + semilla + "»)");
    });
    if (!resto.length && estructurada.length <= max) {
      avisos.push("No hay muestra aleatoria porque la estructurada ya cubre TODAS las páginas rastreadas (" + todas.length + "): la auditoría abarca el sitio completo, no una muestra.");
    } else if (!resto.length) {
      avisos.push("No hay páginas fuera de la muestra estructurada para la parte aleatoria, y además la estructurada no cabe entera en el máximo: la muestra no cubre el sitio completo.");
    } else if (resto.length < nAleatorias) {
      avisos.push("La muestra aleatoria queda en " + resto.length + " página(s) de las " + nAleatorias + " que pedía el 10 %: el rastreo no encontró más fuera de la muestra estructurada.");
    }

    let muestra = estructurada.concat(aleatoria);
    let estructuradaEnMuestra = estructurada;
    if (muestra.length > max) {
      // Recortar NUNCA por la aleatoria: WCAG-EM exige su presencia. Se recorta la
      // estructurada por el final, que es donde están las plantillas repetidas.
      const sobran = muestra.length - max;
      estructuradaEnMuestra = estructurada.slice(0, Math.max(0, estructurada.length - sobran));
      const fuera = estructurada.slice(estructuradaEnMuestra.length);
      avisos.push("La muestra (" + muestra.length + ") supera el máximo de " + max + ": se recortan " + sobran +
        " página(s) de la parte estructurada" + (fuera.length ? " (" + fuera.slice(0, 5).map(function (p) { return p.url; }).join(", ") + (fuera.length > 5 ? ", …" : "") + ")" : "") +
        ". Esas páginas NO se han auditado. Súbelo con `max` si la auditoría lo exige.");
      muestra = estructuradaEnMuestra.concat(aleatoria);
    }

    // Cobertura: qué queda dentro y qué no, para documentarlo en el informe.
    const enMuestra = {};
    muestra.forEach(function (it) { enMuestra[it.url] = 1; });
    const cobCat = {}, cobCont = {};
    CATEGORIAS.forEach(function (c) {
      cobCat[c.id] = todas.some(function (p) { return enMuestra[p.url] && p.clasif.categorias.indexOf(c.id) !== -1; });
    });
    CONTENIDOS.forEach(function (c) {
      cobCont[c.id] = todas.some(function (p) { return enMuestra[p.url] && p.clasif.contenidos.indexOf(c.id) !== -1; });
    });

    return {
      muestra: muestra,
      // La estructurada QUE ESTÁ EN LA MUESTRA, no la candidata. Antes se exponía
      // la lista entera y `justificarMuestra` sumaba 8+1 para una muestra de 6: el
      // texto que va al IRA describía una muestra que no era la auditada.
      estructurada: estructuradaEnMuestra,
      estructuradaCandidata: estructurada,
      recortadas: estructurada.slice(estructuradaEnMuestra.length),
      aleatoria: aleatoria,
      candidatas: todas.length,
      semilla: semilla,
      cobertura: {
        categorias: cobCat,
        contenidos: cobCont,
        plantillas: plantillas.length,
        plantillasCubiertas: new Set(muestra.map(function (m) { return m.plantilla; })).size
      },
      avisos: avisos
    };
  }

  /** Justificación de la muestra, en prosa, para pegar en el IRA. */
  function justificarMuestra(sel) {
    if (!sel || !sel.muestra.length) return "No se ha podido construir una muestra.";
    const lineas = [];
    lineas.push("Muestra de " + sel.muestra.length + " páginas sobre " + sel.candidatas + " candidatas rastreadas, siguiendo WCAG-EM: " +
      sel.estructurada.length + " de muestra estructurada y " + sel.aleatoria.length + " de muestra aleatoria (semilla «" + sel.semilla + "», reproducible).");
    lineas.push("Se han identificado " + sel.cobertura.plantillas + " plantillas distintas, de las que la muestra cubre " + sel.cobertura.plantillasCubiertas + ".");
    const sinCat = CATEGORIAS.filter(function (c) { return !sel.cobertura.categorias[c.id]; });
    if (sinCat.length) lineas.push("Sin representación en la muestra: " + sinCat.map(function (c) { return c.etiqueta.toLowerCase(); }).join(", ") + ".");
    const conCont = CONTENIDOS.filter(function (c) { return sel.cobertura.contenidos[c.id]; });
    if (conCont.length) lineas.push("Tipos de contenido cubiertos: " + conCont.map(function (c) { return c.etiqueta.toLowerCase(); }).join(", ") + ".");
    (sel.avisos || []).forEach(function (a) { lineas.push(a); });
    return lineas.join(" ");
  }
  NS.rngDesde = rngDesde;
  NS.barajar = barajar;
  NS.CATEGORIAS = CATEGORIAS;
  NS.CONTENIDOS = CONTENIDOS;
  NS.clasificar = clasificar;
  NS.seleccionarMuestra = seleccionarMuestra;
  NS.justificarMuestra = justificarMuestra;
})(A11Y);

/* ── pixel-contrast.js ── */
(function (NS) {
  const { contrastRatio, apcaContrast, apcaMin, parseColor } = NS;
  /**
   * Contraste del texto sobre degradados e imágenes, midiendo píxeles.
   *
   * Es el último hueco de 1.4.3. Cuando el fondo es un degradado o una imagen no
   * existe un «color de fondo» que consultar, así que el agente lo marcaba
   * `revisar` — honrado, pero es de los «revisar» que más trabajo manual generan en
   * una auditoría real, porque los hero con foto están en todas partes.
   *
   * ── Cómo se aíslan las letras ──────────────────────────────────────────────
   * El primer intento fue capturar con el texto y sin él, y quedarse con los
   * píxeles que cambian. Tiene un fallo de fondo: el caso que MÁS importa —texto
   * blanco sobre un fondo casi blanco, que es justo el que no se lee— es aquel en
   * el que la diferencia entre las dos capturas es mínima. El método se quedaba
   * ciego precisamente donde hacía falta.
   *
   * Así que el texto se repinta con dos colores conocidos y opuestos:
   *
   *   1. Captura con el texto en magenta puro.
   *   2. Captura con el texto en verde puro.
   *   3. Captura con el texto transparente.
   *
   * La diferencia entre (1) y (2) no depende del color real del texto ni del fondo:
   * es siempre máxima donde hay letra. Del canal rojo sale la COBERTURA exacta de
   * cada píxel (α = (magenta − verde) / 255), y con ella se descartan los bordes
   * antialiasados quedándose solo con α ≈ 1. La captura (3) da el fondo real bajo
   * esas mismas posiciones, y el color del texto lo da `getComputedStyle`.
   *
   * Dos cuidados que evitan mentir con números:
   *
   *   - **Los bordes antialiasados no cuentan.** Un píxel de borde es una mezcla
   *     parcial de texto y fondo; medirlo da contrastes falsos, casi siempre peores
   *     que los reales. Con la cobertura exacta se excluyen sin margen de duda.
   *   - **Si no se puede aislar el texto, se dice.** Con `background-clip: text` o
   *     con texto pintado en un canvas, repintar el color no cambia nada: la máscara
   *     sale vacía y el veredicto sigue siendo `revisar`, no un aprobado por falta
   *     de datos.
   */

  /** Los dos colores de sonda. Opuestos en los tres canales y saturados. */
  const SONDA_A = { r: 255, g: 0, b: 255 };   // magenta
  const SONDA_B = { r: 0, g: 255, b: 0 };     // verde
  /** Cobertura mínima para considerar un píxel «núcleo de glifo» y no borde. */
  const MIN_COBERTURA = 0.9;
  /** Por debajo de esto no hay muestra suficiente para dictaminar. */
  const MIN_PIXELES = 24;

  /**
   * Cobertura de texto por píxel, a partir de las dos capturas de sonda.
   * Devuelve un Float32Array con α ∈ [0,1].
   */
  function coberturaGlifos(sondaA, sondaB) {
    const A = sondaA.data, B = sondaB.data;
    const n = A.length / 4;
    const alfa = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      // Canal rojo: magenta=255, verde=0 → la diferencia ES la cobertura.
      // Se corrobora con el verde (magenta=0, verde=255) para no fiarlo todo a uno.
      const aR = (A[p] - B[p]) / 255;
      const aG = (B[p + 1] - A[p + 1]) / 255;
      const v = (aR + aG) / 2;
      alfa[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return alfa;
  }

  /**
   * Compara las tres capturas y dictamina.
   *
   * @param {{ sondaA, sondaB, fondo }} capturas  las tres imágenes ya decodificadas
   * @param {{r,g,b,a?}} fg                       color real del texto (getComputedStyle)
   * @param {{ grande?:boolean, size?:number, weight?:number, minCobertura?:number, minPixeles?:number }} [opts]
   */
  function analizarPixeles(capturas, fg, opts) {
    opts = opts || {};
    const minCob = opts.minCobertura != null ? opts.minCobertura : MIN_COBERTURA;
    const minPx = opts.minPixeles != null ? opts.minPixeles : MIN_PIXELES;
    const c = capturas || {};
    if (!c.sondaA || !c.sondaB || !c.fondo) return { determinado: false, motivo: "faltan capturas" };

    const dims = [c.sondaA, c.sondaB, c.fondo].map(function (i) { return i.width + "x" + i.height; });
    if (dims[0] !== dims[1] || dims[0] !== dims[2]) {
      return { determinado: false, motivo: "las capturas no coinciden en tamaño (" + dims.join(", ") + "): el layout cambió al repintar el texto" };
    }

    const alfa = coberturaGlifos(c.sondaA, c.sondaB);
    const F = c.fondo.data;
    const cuentas = new Map();
    let nucleo = 0, conAlgo = 0;
    for (let i = 0; i < alfa.length; i++) {
      if (alfa[i] > 0.05) conAlgo++;
      if (alfa[i] < minCob) continue;
      nucleo++;
      const p = i * 4;
      const clave = (F[p] << 16) | (F[p + 1] << 8) | F[p + 2];
      cuentas.set(clave, (cuentas.get(clave) || 0) + 1);
    }

    if (!conAlgo) {
      return { determinado: false, motivo: "repintar el texto no cambió ni un píxel: puede estar pintado con background-clip:text, en un canvas o como imagen" };
    }
    if (nucleo < minPx) {
      return { determinado: false, motivo: "solo " + nucleo + " píxel(es) de texto con cobertura completa (mínimo " + minPx + "): texto muy fino o demasiado antialiasado" };
    }

    // El color del texto tiene que ser conocido. Si `getComputedStyle` dice
    // `transparent`, lo está pintando otra cosa —`background-clip: text`, un
    // `-webkit-text-fill-color` con degradado— y su color real no es consultable:
    // medir contra el negro por omisión daría un veredicto inventado.
    const alfaTexto = (fg && fg.a != null) ? fg.a : 1;
    if (alfaTexto <= 0) {
      return { determinado: false, motivo: "el color del texto es <code>transparent</code>: lo pinta background-clip o -webkit-text-fill-color, y su color real no es consultable" };
    }

    const grande = !!opts.grande;
    const min = grande ? 3 : 4.5;
    const lcMin = apcaMin(opts.size || 16, opts.weight || 400);

    let peor = Infinity, peorBg = null, mejor = 0, suma = 0, fallan = 0;
    cuentas.forEach(function (n, clave) {
      const bg = { r: (clave >> 16) & 255, g: (clave >> 8) & 255, b: clave & 255 };
      // Texto translúcido: el color efectivo es la composición sobre ESE fondo, y
      // cambia con cada píxel. Componerlo aquí es más exacto que hacerlo una vez.
      const frente = alfaTexto < 1
        ? { r: fg.r * alfaTexto + bg.r * (1 - alfaTexto), g: fg.g * alfaTexto + bg.g * (1 - alfaTexto), b: fg.b * alfaTexto + bg.b * (1 - alfaTexto) }
        : fg;
      const ratio = contrastRatio(frente, bg);
      if (ratio < peor) { peor = ratio; peorBg = bg; }
      if (ratio > mejor) mejor = ratio;
      suma += ratio * n;
      if (ratio < min) fallan += n;
    });
    const medio = suma / nucleo;
    const pctFallan = fallan / nucleo;

    /* El criterio es por texto, no «de media»: si una parte del texto no llega, el
     * texto no cumple.
     *
     * La tolerancia del 2 % se justificaba por «el ruido de remuestreo y compresión»,
     * y se aplicaba a píxeles con cobertura ≥ 0.9 — el NÚCLEO del glifo, ya filtrado
     * de antialiasing—, donde ese ruido no existe. Sobre un degradado ese 2 % son
     * letras enteras: medido, mil píxeles de núcleo con diez ilegibles a 1.00:1 salían
     * «pasa · todo el texto llega al mínimo» con el propio detalle imprimiendo «1.00:1
     * en el peor punto». Una contradicción en la misma línea de evidencia.
     *
     * Sin tolerancia sobre el núcleo, y con una banda de duda estrecha para el caso
     * real que la justificaba: un puñado de píxeles sueltos en el borde del glifo que
     * el filtro de cobertura no acabó de limpiar. Ahí se pide revisión, no se absuelve:
     * `revisar` no es conforme y el criterio no sale del informe. */
    const pixelesQueFallan = fallan;
    const verdict = pctFallan === 0
      ? "pasa"
      : (pixelesQueFallan <= 3 && pctFallan < 0.005) ? "revisar" : "falla";
    const frentePeor = alfaTexto < 1
      ? { r: fg.r * alfaTexto + peorBg.r * (1 - alfaTexto), g: fg.g * alfaTexto + peorBg.g * (1 - alfaTexto), b: fg.b * alfaTexto + peorBg.b * (1 - alfaTexto) }
      : fg;
    const lc = Math.round(Math.abs(apcaContrast(frentePeor, peorBg)));

    return {
      determinado: true,
      verdict: verdict,
      peor: peor, mejor: mejor, medio: medio,
      peorFondo: peorBg,
      pixeles: nucleo,
      fondosDistintos: cuentas.size,
      porcentajeQueFalla: pctFallan,
      pixelesQueFallan: pixelesQueFallan,
      minExigido: min,
      lcPeor: lc, lcMin: lcMin, grande: grande
    };
  }

  /** Texto de evidencia, en el formato del resto de mediciones. */
  function detallePixeles(r, fgStr) {
    if (!r.determinado) return "fondo con imagen o degradado: " + r.motivo;
    const pc = Math.round(r.porcentajeQueFalla * 100);
    const rango = r.peor.toFixed(2) + ":1 en el peor punto" + (r.fondosDistintos > 1 ? " y " + r.mejor.toFixed(2) + ":1 en el mejor" : "");
    const fondo = "rgb(" + r.peorFondo.r + " " + r.peorFondo.g + " " + r.peorFondo.b + ")";
    return "medido sobre los píxeles del fondo real (" + r.pixeles + " px de texto, " + r.fondosDistintos + " tono(s) de fondo): " +
      rango + " (mín " + r.minExigido + ":1) · APCA Lc " + r.lcPeor + " — " + fgStr + " sobre " + fondo +
      /* Y la frase no puede contradecir al número que lleva al lado.
       *
       * «todo el texto llega al mínimo» se escribía con la tolerancia del 2 % puesta,
       * así que aparecía junto a «1.00:1 en el peor punto». Ahora solo se dice cuando
       * de verdad no falla ni un píxel, y el caso dudoso se nombra por lo que es. */
      (r.verdict === "pasa"
        ? " · todo el texto llega al mínimo"
        : r.verdict === "revisar"
          ? " · " + r.pixelesQueFallan + " píxel(es) sueltos por debajo del mínimo (" + (pc < 1 ? "<1" : pc) +
            " %): puede ser el borde del glifo sin limpiar del todo, míralo a ojo"
          : " · el " + (pc < 1 ? "<1" : pc) + " % del texto no llega al mínimo");
  }
  NS.SONDA_A = SONDA_A;
  NS.SONDA_B = SONDA_B;
  NS.MIN_COBERTURA = MIN_COBERTURA;
  NS.MIN_PIXELES = MIN_PIXELES;
  NS.coberturaGlifos = coberturaGlifos;
  NS.analizarPixeles = analizarPixeles;
  NS.detallePixeles = detallePixeles;
})(A11Y);
