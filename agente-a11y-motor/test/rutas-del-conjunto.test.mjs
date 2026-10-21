import { test } from "node:test";
import assert from "node:assert/strict";
import { measurementFindings } from "../src/render-analyze.js";

/**
 * Hay mediciones que no hablan de UN elemento, sino de todos los controles de la
 * página: 2.4.11 cuando nada tapa el foco, el orden de foco de 2.4.3. Esas
 * emiten `rutas` —la secuencia recorrida— en vez de `path`, y el comentario que
 * las emite dice, literalmente, que dejar la casilla del selector vacía en el
 * informe «sería peor que decir qué se recorrió».
 *
 * Estaba vacía. Dos veces, y una tapaba a la otra:
 *
 *   · el barrido guardaba los enfocables sin el elemento, así que `rutaM(f.el)`
 *     recibía `undefined`, no devolvía nada y el `.filter(Boolean)` lo borraba:
 *     `rutas` salía siempre `[]`;
 *   · y este mapeo solo leía `m.path`, de modo que ni aun llena habría llegado.
 *
 * Medido antes del arreglo, sobre una página sin nada fijo: el hallazgo conforme
 * de 2.4.11 llegaba al informe con `path: ""`. Un veredicto conforme sin decir
 * sobre qué, que es justo lo que la regla de oro de este proyecto no admite.
 */

test("una medición del CONJUNTO lleva sus rutas al informe, no una casilla vacía", () => {
  const f = measurementFindings([{
    crit: "2.4.11", label: "Foco no oscurecido", node: "(documento)", verdict: "pasa",
    rutas: ["main > a:nth-of-type(1)", "main > a:nth-of-type(2)", "main > button"],
    detail: "se han recorrido los 3 controles enfocables de la página y nada los tapa."
  }])[0];
  assert.equal(f.nodes.length, 3);
  assert.deepEqual(f.nodes.map((n) => n.path),
    ["main > a:nth-of-type(1)", "main > a:nth-of-type(2)", "main > button"]);
  // El primero conserva el locator legible: la columna «Elemento» del IRA lo usa.
  assert.equal(f.nodes[0].locator, "(documento)");
  assert.ok(f.nodes.every((n) => n.path), "ninguna casilla de selector vacía");
});

test("una medición de UN elemento sigue llevando un solo nodo", () => {
  const f = measurementFindings([{
    crit: "2.4.7", label: "Foco visible", node: "button.cta", path: "main > button.cta",
    verdict: "falla", detail: "al enfocar el indicador NO se ve"
  }])[0];
  assert.equal(f.nodes.length, 1);
  assert.equal(f.nodes[0].locator, "button.cta");
  assert.equal(f.nodes[0].path, "main > button.cta");
});

test("sin rutas y sin path la casilla queda vacía, y eso es lo que hay", () => {
  /* No se inventa un selector: si la medición no sabe señalar, el informe dice
   * el locator y nada más. Lo que no puede pasar es que SÍ se sepa y no se diga. */
  const f = measurementFindings([{
    crit: "4.1.2", node: "div", verdict: "revisar", detail: "sin ruta"
  }])[0];
  assert.equal(f.nodes.length, 1);
  assert.equal(f.nodes[0].path, "");
});

test("`rutas` vacío no borra el nodo del elemento", () => {
  // Un `rutas: []` es «no he sabido construir ninguna», no «no hay elemento».
  const f = measurementFindings([{
    crit: "2.4.11", node: "(documento)", verdict: "pasa", rutas: [], detail: "x"
  }])[0];
  assert.equal(f.nodes.length, 1);
  assert.equal(f.nodes[0].locator, "(documento)");
});
