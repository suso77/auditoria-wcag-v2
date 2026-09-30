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
