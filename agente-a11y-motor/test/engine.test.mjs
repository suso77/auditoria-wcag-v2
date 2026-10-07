import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, analyze, announcement } from "./helpers.mjs";

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
