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

  const summary = { falla: 0, revisar: 0, humano: 0, cumple: 0, "crítica": 0, "grave": 0, "moderada": 0, "leve": 0 };
  findings.forEach(function (f) {
    if (f.verdict === "falla") { summary.falla++; summary[f.sev]++; }
    else if (f.verdict === "revisar") summary.revisar++;
    else if (f.verdict === "humano") summary.humano++;
    else summary.cumple++;
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
