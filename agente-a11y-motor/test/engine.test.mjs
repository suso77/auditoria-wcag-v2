import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, analyze, announcement } from "./helpers.mjs";
import { etiquetaEnNombre, textoDeEtiqueta, normalizaEtiqueta, accionDeContexto } from "../src/engine.js";
import { DOMParser } from "linkedom";

/** El primer elemento de un fragmento, para probar las funciones puras. */
const unEl = (html) => new DOMParser().parseFromString("<html><body>" + html + "</body></html>", "text/html").body.firstElementChild;

test("fragmento sin elemento analizable → null (lo gestiona la capa de UI)", () => {
  assert.equal(understand("<span>hola</span>"), null);
  assert.equal(understand("   "), null);
});

test("el modelo expone el árbol de accesibilidad completo", () => {
  const m = understand("<button>Enviar</button>");
  assert.ok(m.primary, "hay un nodo primario");
  assert.ok(Array.isArray(m.all) && m.all.length >= 1);
  assert.ok(Array.isArray(m.criteria) && m.criteria.length > 0);
  const n = m.primary;
  assert.ok(n.role && typeof n.role === "string");
  assert.ok(n.name && typeof n.name.name === "string");
  assert.ok(Array.isArray(n.states));
  assert.ok(typeof n.locator === "string" && n.locator.length > 0);
});

test("detección de patrón compuesto (pestañas)", () => {
  const m = understand(
    '<div class="tabs"><div role="tablist" aria-label="Cuenta">' +
    '<button role="tab" aria-selected="true" aria-controls="p1">Perfil</button>' +
    '<button role="tab" aria-selected="false" aria-controls="p2">Ajustes</button>' +
    '</div><div id="p1" role="tabpanel">A</div><div id="p2" role="tabpanel" hidden>B</div></div>'
  );
  assert.ok(m.all.length > 1, "un compuesto modela varios nodos");
  assert.ok(m.pattern, "se reconoce un patrón");
});

test("el anuncio del lector incluye nombre y rol", () => {
  const m = understand('<button>Guardar</button>');
  const say = announcement(m.primary);
  assert.ok(typeof say === "string" && say.length > 0);
  assert.match(say, /Guardar/);
});

test("analyze es determinista (misma entrada → mismo veredicto)", () => {
  const html = '<input type="email" placeholder="Tu correo" class="form-control">';
  const a1 = analyze(understand(html));
  const a2 = analyze(understand(html));
  assert.deepEqual(a1.summary, a2.summary);
});

/* ── Regresión: el resumen no puede contar como conforme lo que no lo es ────
 *
 * El resumen tenía cuatro cubos —falla, revisar, humano, cumple— y un `else` que
 * mandaba a `cumple` todo lo demás. `cumple-parcial` caía ahí, y significa lo
 * contrario: «la presencia está medida, la calidad la juzga una persona». Así que
 * el CLI imprimía «5 cumplen» en una página cuyos textos alternativos nadie había
 * leído: la regla de oro del motor —un criterio sin comprobar no se exporta como
 * conforme— incumplida en la línea que más se lee del informe.
 */
test("regresión: `cumple-parcial` no se cuenta como `cumple` en el resumen", () => {
  const a = analyze(understand(
    '<main><h1>Catálogo de productos</h1><img src="a.png" alt="Portada del catálogo 2026">' +
    '<p>Texto con <a href="/x">un enlace al detalle</a>.</p></main>'
  ));
  const parciales = a.findings.filter((f) => f.verdict === "cumple-parcial");
  assert.ok(parciales.length >= 1, "el escenario tiene que producir algún cumple-parcial");
  assert.equal(a.summary.cumple, a.findings.filter((f) => f.verdict === "cumple").length,
    "`cumple` cuenta solo los que cumplen");
  assert.equal(a.summary["cumple-parcial"], parciales.length, "y `cumple-parcial` tiene su propio cubo");
  // 1.1.1 con alt presente es el caso de libro: presencia medida, texto sin leer.
  assert.ok(parciales.some((f) => f.c.n === "1.1.1"));
});

test("el resumen cuadra: cada hallazgo cae en un cubo y solo en uno", () => {
  ["<main><h1>H</h1><p>Texto.</p></main>",
   '<main><h1>H</h1><img src="a.png"><button></button></main>',
   '<form><label for="n">Nombre</label><input id="n" autocomplete="name"></form>'
  ].forEach((html) => {
    const s = analyze(understand(html)).summary;
    const cubos = ["falla", "revisar", "humano", "cumple-parcial", "pasa", "cumple", "no-aplica", "otros"];
    const suma = cubos.reduce((a, k) => a + s[k], 0);
    assert.equal(suma, analyze(understand(html)).findings.length,
      "la suma de los cubos es el número de hallazgos: ni se pierde ni se cuenta dos veces");
    assert.equal(s.otros, 0, "ningún veredicto del motor se queda sin cubo propio");
  });
});

test("la gravedad de una barrera no ensucia el resumen cuando viene vacía", () => {
  // `summary[f.sev]++` con `sev` nulo creaba una clave «null» con NaN dentro.
  const s = analyze(understand('<main><h1>H</h1><img src="a.png"></main>')).summary;
  Object.keys(s).forEach((k) => {
    assert.ok(Number.isFinite(s[k]), "el cubo «" + k + "» tiene que ser un número, y es " + s[k]);
  });
  assert.equal(s.null, undefined);
  assert.equal(s.undefined, undefined);
});

/** Veredicto por criterio de un fragmento, para los tests de honestidad. */
function veredictos(html) {
  const m = understand(html);
  if (!m) return {};
  const out = {};
  analyze(m).findings.forEach(function (f) { out[f.c.n] = f.verdict; });
  return out;
}

/* ── Honestidad del motor (v0.37.0) ──────────────────────────────────────────
 * Cuatro casos que el motor declaraba CONFORMES y no lo son.
 */
test("un div con onclick y tabindex, sin rol, no cumple 2.1.1 por recibir el foco", () => {
  // Recibir el foco no es ser operable: Enter y Espacio solo activan solos los
  // elementos nativos. Esta comprobación estaba atada a los roles ARIA, así que
  // el caso más común de la web se escapaba y 2.1.1 salía «cumple».
  const v = veredictos('<div tabindex="0" onclick="abrir()">Abrir</div>');
  assert.equal(v["2.1.1"], "revisar");
  // Con rol declarado ya se comprobaba, y sigue comprobándose.
  assert.equal(veredictos('<div tabindex="0" role="button" onclick="abrir()">Abrir</div>')["2.1.1"], "revisar");
  // Sin tabindex es peor: no se alcanza siquiera. Eso ya era `falla`.
  assert.equal(veredictos('<div onclick="abrir()">Abrir</div>')["2.1.1"], "falla");
  // Y un botón nativo con onclick no tiene ningún problema de 2.1.1.
  assert.equal(veredictos("<button onclick=\"abrir()\">Abrir</button>")["2.1.1"], "cumple");
});

test("una tabla de datos sin ninguna celda de encabezado falla 1.3.1", () => {
  const sin = veredictos("<table><tr><td>Mes</td><td>Ventas</td></tr><tr><td>Enero</td><td>120</td></tr></table>");
  assert.equal(sin["1.3.1"], "falla");
  // Con encabezados —de columna o de fila— y caption, el criterio se pronuncia
  // a favor. Antes no se pronunciaba en absoluto, que en un informe se lee igual.
  const con = veredictos('<table><caption>Ventas</caption><tr><th scope="col">Mes</th><th scope="col">Ventas</th></tr><tr><td>Enero</td><td>120</td></tr></table>');
  assert.equal(con["1.3.1"], "cumple");
  const porFila = veredictos('<table><tr><th scope="row">Enero</th><td>120</td></tr><tr><th scope="row">Febrero</th><td>98</td></tr></table>');
  assert.equal(porFila["1.3.1"], "cumple");
  // Una tabla de una sola fila puede ser cualquier cosa: sospecha, no barrera.
  assert.equal(veredictos("<table><tr><td>Uno</td><td>Dos</td></tr></table>")["1.3.1"], "revisar");
});

test("role=presentation se hereda a los descendientes estructurales (ARIA 1.2)", () => {
  // La tabla de maquetación marcada como manda la especificación daba una FALLA
  // grave de 1.3.1 por «row huérfano»: el motor quitaba el rol de la tabla y
  // dejaba los `tr` con rol `row` sin tabla donde vivir.
  const t = veredictos('<table role="presentation"><tr><td>Izq</td><td>Der</td></tr><tr><td>a</td><td>b</td></tr></table>');
  assert.notEqual(t["1.3.1"], "falla", JSON.stringify(t));
  const conTbody = veredictos('<table role="none"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>');
  assert.notEqual(conTbody["1.3.1"], "falla");
});

test("un rol declarado sin su estado requerido falla 4.1.2 — y solo los que ARIA exige", () => {
  // La tabla de estados requeridos tenía la familia de aria-checked y poco más.
  assert.equal(veredictos('<div role="slider" tabindex="0" aria-label="Volumen"></div>')["4.1.2"], "falla");
  assert.equal(veredictos('<div role="slider" tabindex="0" aria-label="Volumen" aria-valuenow="5"></div>')["4.1.2"], "cumple");
  // `combobox` exige DOS cosas: con un solo campo de texto se comprobaba una.
  assert.equal(veredictos('<div role="combobox" tabindex="0" aria-label="País" aria-expanded="false"></div>')["4.1.2"], "falla");
  // Y lo que ARIA 1.2 NO exige no se exige: spinbutton, tab y progressbar.
  assert.equal(veredictos('<div role="spinbutton" tabindex="0" aria-label="Cantidad"></div>')["4.1.2"], "cumple");
  assert.equal(veredictos('<div role="progressbar" aria-label="Carga"></div>')["4.1.2"] || "cumple", "cumple");
  // `treeitem` lo lleva entre los requeridos pero se puede omitir en un árbol
  // de selección única: sospecha, no barrera.
  assert.equal(veredictos('<div role="tree" aria-label="T"><div role="treeitem">Uno</div></div>')["4.1.2"], "revisar");
  // Un <h2 role="heading"> no necesita aria-level: lo da la etiqueta.
  assert.notEqual(veredictos('<h2 role="heading">Título</h2>')["4.1.2"], "falla");
});

/* ── 2.5.3 Etiqueta en el nombre: de «nunca una barrera» a medido ────────────
 *
 * Medido antes de escribir la regla: 2.5.3 salía `cumple-parcial` SIEMPRE,
 * también en el caso de libro, y axe con la configuración del agente tampoco
 * decía nada —su regla es experimental y las experimentales vienen
 * desactivadas—. Es decir: ninguna capa podía denunciar este criterio.
 */

test("2.5.3: el nombre que no contiene el texto visible es una barrera (F96)", () => {
  // Quien maneja el equipo hablando dice «pulsa Enviar», que es lo que ve.
  assert.equal(veredictos('<button aria-label="Submit form">Enviar</button>')["2.5.3"], "falla");
  assert.equal(veredictos('<a href="/x" aria-label="Read more">Leer más</a>')["2.5.3"], "falla");
  // El texto del botón de un <input> es su `value`.
  assert.equal(veredictos('<input type="submit" value="Enviar" aria-label="Submit">')["2.5.3"], "falla");
  // Dos caracteres ya son una palabra: «OK» frente a «Aceptar» es el fallo.
  assert.equal(veredictos('<button aria-label="Aceptar">OK</button>')["2.5.3"], "falla");
});

test("2.5.3: contener basta — ni el orden ni lo que se añade son barrera", () => {
  const sinBarrera = (h) => assert.notEqual(veredictos(h)["2.5.3"], "falla", h);
  sinBarrera('<button aria-label="Enviar el formulario de contacto">Enviar</button>');
  sinBarrera('<button aria-label="formulario Enviar">Enviar</button>');
  sinBarrera('<button aria-label="enviar">Enviar</button>');        // mayúsculas no cuentan
  sinBarrera('<button aria-label="Buscar">🔍 Buscar</button>');      // el emoji tampoco
});

test("2.5.3: los tres falsos positivos que acecharían, descartados", () => {
  const vale = (h) => assert.equal(veredictos(h)["2.5.3"], "cumple-parcial", h);
  // 1. El icono de fuente con ligadura: se ve una lupa, no la palabra «search».
  vale('<button aria-label="Buscar"><i class="material-icons">search</i></button>');
  // 2. La «x» del botón de cerrar: un carácter suelto es un icono escrito con el
  //    teclado, no una etiqueta. Mismo corte que la regla de axe, comprobado.
  vale('<button type="button" aria-label="Cerrar">x</button>');
  vale('<button type="button" aria-label="Cerrar">×</button>');
  // 3. Un párrafo entero no es la etiqueta de nada.
  vale('<a href="/x" aria-label="Ficha del producto">Este es el resumen completo del artículo, ' +
    'con muchas palabras, que ocupa la tarjeta entera y no es la etiqueta de ningún control</a>');
  // Y si el nombre sale del propio contenido, no puede haber desajuste.
  vale("<button>Enviar</button>");
  // Ni se mira el `alt` de una imagen, que no se lee con los ojos.
  vale('<a href="/" aria-label="Inicio"><img src="logo.png" alt="Acme"></a>');
});

test("2.5.3: si solo bailan las tildes, es sospecha y no barrera", () => {
  // Puede que el reconocedor de voz lo case y puede que no: eso se prueba, no se
  // dictamina. Lo que no se puede es callarlo.
  const v = veredictos('<a href="/x" aria-label="Mas informacion sobre el servicio">Más información</a>');
  assert.equal(v["2.5.3"], "revisar");
});

test("2.5.3: la comparación, por partes", () => {
  assert.equal(etiquetaEnNombre("Enviar", "Submit form").ok, false);
  assert.equal(etiquetaEnNombre("Enviar", "Enviar el formulario").ok, true);
  assert.equal(etiquetaEnNombre("Más información", "Mas informacion y algo mas").soloAcentos, true);
  // Sin texto visible, sin nombre o con un solo carácter: no hay nada que juzgar.
  assert.equal(etiquetaEnNombre("", "Cerrar"), null);
  assert.equal(etiquetaEnNombre("Enviar", ""), null);
  assert.equal(etiquetaEnNombre("x", "Cerrar"), null);
  // El texto visible deja fuera iconos, `alt` y lo oculto.
  assert.equal(textoDeEtiqueta(unEl('<button aria-label="B"><i class="fa fa-search">search</i>Buscar</button>'), "button"), "Buscar");
  assert.equal(textoDeEtiqueta(unEl('<button aria-label="B"><span aria-hidden="true">oculto</span>Ver</button>'), "button"), "Ver");
  assert.equal(normalizaEtiqueta("  ¡Enviar, YA!  "), "enviar ya");
});

/* ── 3.2.1 y 3.2.2: el cambio de contexto escrito en el atributo ─────────────
 *
 * De estos dos se encarga la capa dinámica, que enfoca y cambia valores sobre
 * la página viva. Pero viene APAGADA por defecto y en la extensión y el artifact
 * no existe: medido ahí, `<select onchange="location.href=this.value">` —el
 * fallo F37 de libro— salía como «requiere evaluación humana». Lo que está
 * escrito en el marcado no hace falta sondearlo.
 */

test("3.2.2: cambiar el valor y que eso navegue o envíe es el fallo F37", () => {
  const sel = (h) => veredictos('<form><label for="s">X</label>' + h + "</form>")["3.2.2"];
  assert.equal(sel('<select id="s" onchange="location.href=this.value"><option value="/a">A</option></select>'), "falla");
  assert.equal(sel('<select id="s" onchange="this.form.submit()"><option>es</option></select>'), "falla");
  assert.equal(sel('<select id="s" onchange="window.open(this.value)"><option>/a</option></select>'), "falla");
  assert.equal(sel('<input type="radio" id="s" name="x" onchange="this.form.submit()">'), "falla");
});

test("3.2.1: enfocar no puede llevarse la página ni el foco (F52, F55)", () => {
  const uno = (h) => veredictos('<form><label for="t">X</label>' + h + "</form>")["3.2.1"];
  assert.equal(uno('<input id="t" onfocus="window.open(\'/cal\')">'), "falla");
  assert.equal(uno('<input id="t" onfocus="this.blur()">'), "falla");
  assert.equal(uno('<input id="t" onfocus="document.getElementById(\'otro\').focus()">'), "falla");
  assert.equal(uno('<input id="t" onfocus="location=\'/x\'">'), "falla");
  // Un diálogo del navegador también se lleva el foco, pero puede ser legítimo:
  // sospecha, no barrera.
  assert.equal(uno('<input id="t" onfocus="alert(\'ojo\')">'), "revisar");
});

test("3.2.1 y 3.2.2: lo que el marcado NO sabe, no se dictamina", () => {
  // Un nombre de función no dice qué hace la función: eso lo prueba la capa
  // dinámica sobre la página viva. Acusar aquí sería inventarse la barrera.
  const v = veredictos('<form><label for="s">Color</label><select id="s" onchange="pinta(this.value)"><option>rojo</option></select></form>');
  assert.equal(v["3.2.2"], "humano");
  assert.equal(veredictos('<form><label for="t">X</label><input id="t" onfocus="valida(this)"></form>')["3.2.1"], "humano");
  // `this.focus()` y `this.select()` no mueven el foco a ninguna parte.
  assert.equal(veredictos('<form><label for="t">X</label><input id="t" onfocus="this.select()"></form>')["3.2.1"], "humano");
  assert.equal(veredictos('<form><label for="t">X</label><input id="t" onfocus="this.focus()"></form>')["3.2.1"], "humano");
  // Y un select normal, con su botón, no es nada.
  assert.equal(veredictos('<form><label for="s">P</label><select id="s"><option>A</option></select><button type="submit">Ir</button></form>')["3.2.2"], "humano");
});

test("3.2.2 es el AJUSTE de un componente, no escribir en un campo de texto", () => {
  // 3.2.2 habla de cambiar el ajuste de un componente —una lista, una casilla,
  // un deslizador—. Un `oninput` en un campo de texto que busca mientras
  // escribes no es eso, y meterlo aquí sería ruido en cada buscador con
  // autocompletado.
  const h = '<form><label for="q">Buscar</label><input id="q" type="search" oninput="this.form.submit()"></form>';
  assert.equal(veredictos(h)["3.2.2"], "humano");
  // Pero una casilla sí tiene ajuste.
  assert.equal(veredictos('<form><label for="c">C</label><input type="checkbox" id="c" oninput="this.form.submit()"></form>')["3.2.2"], "falla");
});

test("3.2.x: la lectura del manejador, por partes", () => {
  assert.equal(accionDeContexto("location.href='/x'").duro, true);
  assert.equal(accionDeContexto("window.open('/x')").duro, true);
  assert.equal(accionDeContexto("this.form.submit()").duro, true);
  assert.equal(accionDeContexto("alert('x')").duro, false);
  assert.equal(accionDeContexto("this.focus()"), null);
  assert.equal(accionDeContexto("pinta(this.value)"), null);
  assert.equal(accionDeContexto(""), null);
  assert.equal(accionDeContexto(null), null);
  // Un `submit` que es el NOMBRE de algo, no la llamada, no cuenta.
  assert.equal(accionDeContexto("marca('submit')"), null);
});
