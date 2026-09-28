import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs } from "../src/dynamic.js";

const v = (fs) => fs.map((f) => f.c.n + "/" + f.verdict);

/* ── Identidad de los controles ── */

test("regresión: tres controles con el mismo locator NO se confunden entre sí", () => {
  // Antes se comparaba por `locator`: alcanzar uno marcaba los tres como alcanzados
  // (falso «cumple»), o al revés según el orden. Ahora manda el uid.
  const focusables = [
    { locator: "button.btn", uid: "b>button:nth-of-type(1)" },
    { locator: "button.btn", uid: "b>button:nth-of-type(2)" },
    { locator: "button.btn", uid: "b>button:nth-of-type(3)" }
  ];
  const todos = analyzeTabTrace({ focusables, reached: focusables });
  assert.deepEqual(v(todos), ["2.1.1/cumple"]);

  const uno = analyzeTabTrace({ focusables, reached: [focusables[0]] });
  assert.deepEqual(v(uno), ["2.1.1/falla"]);
  assert.match(uno[0].evid[0], /^2 controle/);
});

/* ── No convertir «no lo he comprobado» en «falla» ── */

test("regresión: con el presupuesto de tabulaciones agotado, 2.1.1 es revisar, no falla", () => {
  const focusables = Array.from({ length: 80 }, (_, i) => ({ locator: "a", uid: "u" + i }));
  const out = analyzeTabTrace({ focusables, reached: focusables.slice(0, 50), exhausted: true, tabs: 50 });
  assert.deepEqual(v(out), ["2.1.1/revisar"]);
  assert.match(out[0].evid[0], /presupuesto/);
});

test("regresión: con trampa de foco, lo no alcanzado queda a revisar (la trampa sí falla)", () => {
  const focusables = [{ locator: "a", uid: "1" }, { locator: "b", uid: "2" }, { locator: "c", uid: "3" }];
  const out = analyzeTabTrace({ focusables, reached: [focusables[0]], trapped: true });
  assert.deepEqual(v(out), ["2.1.2/falla", "2.1.1/revisar"]);
});

test("sin trampa ni tope, lo inalcanzable sigue siendo una barrera", () => {
  const focusables = [{ locator: "a", uid: "1" }, { locator: "b", uid: "2" }];
  const out = analyzeTabTrace({ focusables, reached: [focusables[0]] });
  assert.deepEqual(v(out), ["2.1.1/falla"]);
  assert.equal(out[0].sev, "grave");
  assert.equal(out[0].nodes.length, 1);
});

test("regresión: un clic que no llegó a ocurrir no fabrica un 4.1.2 falla", () => {
  const sinClic = analyzeDisclosure([{ locator: "button.acc", clicked: false, reason: "intercepta otro elemento", expandedBefore: "false", expandedAfter: "false" }]);
  assert.deepEqual(v(sinClic), ["4.1.2/revisar"]);
  const conClic = analyzeDisclosure([{ locator: "button.acc", clicked: true, expandedBefore: "false", expandedAfter: "false" }]);
  assert.deepEqual(v(conClic), ["4.1.2/falla"]);
});

test("regresión: una pestaña que no se pudo activar queda a revisar", () => {
  assert.deepEqual(v(analyzeTabs([{ locator: "[role=tab]", clicked: false, selectedAfter: "false", othersSelected: 0 }])), ["4.1.2/revisar"]);
  assert.deepEqual(v(analyzeTabs([{ locator: "[role=tab]", clicked: true, selectedAfter: "false", othersSelected: 0 }])), ["4.1.2/falla"]);
});

test("los hallazgos dinámicos llevan nodes (columna Elemento del IRA)", () => {
  const out = analyzeDisclosure([{ locator: "button#x", name: "Más", clicked: true, expandedBefore: "false", expandedAfter: "false" }]);
  assert.deepEqual(out[0].nodes, [{ locator: "button#x", name: "Más" }]);
});
