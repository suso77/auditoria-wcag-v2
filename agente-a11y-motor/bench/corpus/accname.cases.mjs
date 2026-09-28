/**
 * Corpus de nombre accesible (accname) transcrito de los Web Platform Tests.
 * Fuente: https://github.com/web-platform-tests/wpt/tree/master/accname/name
 * (comp_name_from_content.html, comp_labelledby.html, comp_label.html).
 *
 * Cada caso: { group, name, html, sel?, expected, cite, skip? }.
 * `skip` marca casos fuera del alcance de un motor sin CSS/layout (no cuentan
 * contra la precisión; se informan como limitaciones conocidas).
 * El objetivo del test lleva class="ex"; los elementos referenciados llevan id.
 */
const NBSP = " ";
const SRC = "WPT accname/name";

export const ACCNAME_CASES = [
  // ── aria-label válido (muestra representativa de roles/elementos) ──
  { group: "aria-label", name: "button element", html: '<button aria-label="label" class="ex">x</button>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "link element", html: '<a href="" aria-label="label" class="ex">x</a>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "input type text", html: '<input type="text" aria-label="label" class="ex">', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "input type checkbox", html: '<input type="checkbox" aria-label="label" class="ex">', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "textarea element", html: '<textarea aria-label="label" class="ex">x</textarea>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "div role=button", html: '<div role="button" aria-label="label" class="ex">x</div>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "div role=checkbox", html: '<div role="checkbox" aria-label="label" class="ex">x</div>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "h1 element", html: '<h1 aria-label="label" class="ex">x</h1>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "img element", html: '<img alt="" aria-label="label" class="ex">', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "svg element", html: '<svg aria-label="label" class="ex"><circle cx="5" cy="5" r="4"></circle></svg>', expected: "label", cite: SRC + "/comp_label" },
  { group: "aria-label", name: "nav element", html: '<nav aria-label="label" class="ex">x</nav>', expected: "label", cite: SRC + "/comp_label" },

  // ── espacios en blanco / nbsp / vacío ──
  { group: "espacios", name: "trailing whitespace en aria-label", html: '<textarea aria-label="label  " class="ex">x</textarea>', expected: "label", cite: SRC + "/comp_label" },
  { group: "espacios", name: "leading whitespace en aria-label", html: '<a href="#" aria-label="     label" class="ex">x</a>', expected: "label", cite: SRC + "/comp_label" },
  { group: "espacios", name: "braille blank (U+2800) NO es espacio", html: '<button aria-label="' + "⠀" + '" class="ex">my button</button>', expected: "⠀", cite: SRC + "/comp_label" },
  { group: "espacios", name: "carriage return + texto en aria-label", html: '<div role="alert" aria-label="\nalert message" class="ex">x</div>', expected: "alert message", cite: SRC + "/comp_label" },
  { group: "espacios", name: "trailing nbsp preservado", html: '<nav aria-label="label' + NBSP + '" class="ex">x</nav>', expected: "label" + NBSP, cite: SRC + "/comp_label" },
  { group: "espacios", name: "leading nbsp preservado", html: '<button aria-label="' + NBSP + 'label" class="ex">my button</button>', expected: NBSP + "label", cite: SRC + "/comp_label" },
  { group: "espacios", name: "aria-label vacío no se usa", html: '<button aria-label="" class="ex">my button</button>', expected: "my button", cite: SRC + "/comp_label" },
  { group: "espacios", name: "aria-label solo espacios no se usa (cae a título)", html: '<textarea aria-label="  " title="title" class="ex">textarea contents</textarea>', expected: "title", cite: SRC + "/comp_label" },
  { group: "espacios", name: "aria-label solo salto de línea no se usa", html: '<button aria-label="\n" class="ex">my button</button>', expected: "my button", cite: SRC + "/comp_label" },
  { group: "espacios", name: "aria-label solo espacios no se usa (cae a contenido)", html: '<button aria-label="      " class="ex">my button</button>', expected: "my button", cite: SRC + "/comp_label" },

  // ── precedencia ──
  { group: "precedencia", name: "aria-labelledby supera aria-label", html: '<a href="#" aria-labelledby="span7" aria-label="foo" class="ex">x</a><span id="span7">label</span>', expected: "label", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "labelledby oculto (display:none) supera aria-label", html: '<button aria-labelledby="span1" aria-label="foo" class="ex"><span id="span1" style="display:none;"><span id="span2" style="display:none;">label</span></span>x</button>', expected: "label", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "img aria-label supera alt", html: '<img alt="alt" aria-label="foo" class="ex">', expected: "foo", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "svg aria-label supera title", html: '<svg aria-label="foo" class="ex"><circle cx="5" cy="5" r="4"><title>circle</title></circle></svg>', expected: "foo", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "input label-for superado por aria-label", html: '<label for="input1">label</label><input type="text" id="input1" aria-label="foo" class="ex">', expected: "foo", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "button aria-label supera contenido", html: '<button aria-label="label" class="ex">x</button>', expected: "label", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "button aria-label supera title", html: '<button aria-label="label" title="foo" class="ex">x</button>', expected: "label", cite: SRC + "/comp_label" },
  { group: "precedencia", name: "labelledby con varios idrefs y espacios", html: '<nav aria-labelledby="s1 s2 s3 s4" class="ex"><span id="s1">verify</span><span id="s2">spaces</span><span>FAIL IF INCLUDED</span><span id="s3">between</span><span id="s4">foreach</span></nav>', expected: "verify spaces between foreach", cite: SRC + "/comp_labelledby" },
  { group: "precedencia", name: "labelledby a sí mismo + heading", html: '<div role="group" aria-label="self label" id="g2" aria-labelledby="g2 h2" class="ex"><h2 id="h2">+ first heading</h2><p>text</p></div>', expected: "self label + first heading", cite: SRC + "/comp_labelledby" },
  { group: "precedencia", name: "group labelledby heading externo", html: '<div role="group" aria-labelledby="h" class="ex"><h2 id="h">first heading</h2><p>text</p></div>', expected: "first heading", cite: SRC + "/comp_labelledby" },

  // ── nombre desde contenido ──
  { group: "contenido", name: "button name from content", html: '<button class="ex">label</button>', expected: "label", cite: SRC + "/comp_name_from_content" },
  { group: "contenido", name: "heading name from content", html: '<h3 class="ex">label</h3>', expected: "label", cite: SRC + "/comp_name_from_content" },
  { group: "contenido", name: "link name from content", html: '<a href="#" class="ex">label</a>', expected: "label", cite: SRC + "/comp_name_from_content" },
  { group: "contenido", name: "div role=button name from content", html: '<div tabindex="0" role="button" class="ex">label</div>', expected: "label", cite: SRC + "/comp_name_from_content" },
  { group: "contenido", name: "name from content por cada hijo", html: '<button class="ex"><span>one</span> <span>two</span> <span>three</span></button>', expected: "one two three", cite: SRC + "/comp_name_from_content" },
  { group: "contenido", name: "name from content incluyendo imagen", html: '<button class="ex"><span>one</span> <img alt="two" src="data:,"> <span>three</span></button>', expected: "one two three", cite: SRC + "/comp_name_from_content" },

  // ── nativo (label / legend / caption / value / alt) ──
  { group: "nativo", name: "label for asocia el control", html: '<label for="e">Correo electrónico</label><input id="e" type="email" class="ex">', expected: "Correo electrónico", cite: "HTML-AAM" },
  { group: "nativo", name: "label envolvente", html: '<label class="ex-wrap"><span class="ex-inner"></span>Nombre <input type="text" class="ex"></label>', sel: ".ex", expected: "Nombre", cite: "HTML-AAM" },
  { group: "nativo", name: "fieldset legend", html: '<fieldset class="ex"><legend>Datos personales</legend><input></fieldset>', expected: "Datos personales", cite: "HTML-AAM" },
  { group: "nativo", name: "table caption", html: '<table class="ex"><caption>Ventas 2026</caption><tr><td>x</td></tr></table>', expected: "Ventas 2026", cite: "HTML-AAM" },
  { group: "nativo", name: "figure figcaption", html: '<figure class="ex"><img src="a.png" alt=""><figcaption>Diagrama</figcaption></figure>', expected: "Diagrama", cite: "HTML-AAM" },
  { group: "nativo", name: "input type=submit por defecto", html: '<input type="submit" class="ex">', expected: "Enviar", cite: "HTML-AAM" },
  { group: "nativo", name: "input type=button value", html: '<input type="button" value="Aceptar" class="ex">', expected: "Aceptar", cite: "HTML-AAM" },
  { group: "nativo", name: "img alt", html: '<img src="l.png" alt="Logotipo" class="ex">', expected: "Logotipo", cite: "HTML-AAM" },

  // ── fuera de alcance (limitaciones conocidas de un motor sin CSS/layout) ──
  { group: "contenido", name: "content con ::before (contador CSS)", html: '<button class="ex">label</button>', expected: "before label", cite: SRC + "/comp_name_from_content", skip: "contenido generado por CSS ::before (requiere motor con CSS)" },
  { group: "espacios", name: "text-transform:uppercase", html: '<h1 class="ex" style="text-transform:uppercase;">Call us</h1>', expected: "CALL US", cite: SRC + "/comp_name_from_content", skip: "text-transform requiere layout/CSS aplicado" },
  { group: "precedencia", name: "visibility:hidden anidado en target visible cae a aria-label", html: '<button aria-labelledby="span5" aria-label="foo" class="ex"><span id="span5"><span id="span6" style="visibility:hidden;">label</span></span>x</button>', expected: "foo", cite: SRC + "/comp_label", skip: "matiz visibility:hidden en descendiente de target labelledby visible (requiere distinguir target-oculto de descendiente-oculto)" }
];
