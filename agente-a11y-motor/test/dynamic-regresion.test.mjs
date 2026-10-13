import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs } from "../src/dynamic.js";

const v = (fs) => fs.map((f) => f.c.n + "/" + f.verdict);
/* 2.1.2 dejó de hablar solo cuando encuentra la trampa: ahora también dice que
   recorrió la página y no la hay. Estos tests defienden lo que dice 2.1.1, así
   que buscan su hallazgo por criterio en vez de por posición en la lista. */
const de = (fs, n) => fs.find((f) => f.c.n === n);

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
  assert.equal(de(todos, "2.1.1").verdict, "cumple");

  const uno = analyzeTabTrace({ focusables, reached: [focusables[0]] });
  assert.equal(de(uno, "2.1.1").verdict, "falla");
  assert.match(de(uno, "2.1.1").evid[0], /^2 controle/);
});

/* ── No convertir «no lo he comprobado» en «falla» ── */

test("regresión: con el presupuesto de tabulaciones agotado, 2.1.1 es revisar, no falla", () => {
  const focusables = Array.from({ length: 80 }, (_, i) => ({ locator: "a", uid: "u" + i }));
  const out = analyzeTabTrace({ focusables, reached: focusables.slice(0, 50), exhausted: true, tabs: 50 });
  assert.equal(de(out, "2.1.1").verdict, "revisar");
  assert.match(de(out, "2.1.1").evid[0], /presupuesto/);
  // Y 2.1.2 tampoco se absuelve con el recorrido cortado: no verla no es no haberla.
  assert.equal(de(out, "2.1.2").verdict, "revisar");
});

test("regresión: con trampa de foco, lo no alcanzado queda a revisar (la trampa sí falla)", () => {
  const focusables = [{ locator: "a", uid: "1" }, { locator: "b", uid: "2" }, { locator: "c", uid: "3" }];
  const out = analyzeTabTrace({ focusables, reached: [focusables[0]], trapped: true });
  assert.deepEqual(v(out), ["2.1.2/falla", "2.1.1/revisar"]);
  assert.equal(de(out, "2.1.2").sev, "crítica");
});

test("sin trampa ni tope, lo inalcanzable sigue siendo una barrera", () => {
  const focusables = [{ locator: "a", uid: "1" }, { locator: "b", uid: "2" }];
  const out = analyzeTabTrace({ focusables, reached: [focusables[0]] });
  assert.equal(de(out, "2.1.1").verdict, "falla");
  assert.equal(de(out, "2.1.1").sev, "grave");
  assert.equal(de(out, "2.1.1").nodes.length, 1);
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

test("2.1.2 habla también cuando recorre la página entera y NO hay trampa", () => {
  // Antes solo emitía algo si encontraba la trampa. Si el recorrido daba la
  // vuelta sin atascarse, el criterio desaparecía del informe y lo rescataba el
  // barrido como «la capa se ejecutó y no dijo nada». Medido sobre el sitio de
  // prueba con la capa dinámica encendida: 2.1.2 salía `revisar` en las 19
  // páginas, incluidas las que se recorren enteras sin un solo problema.
  const focusables = [{ locator: "a", uid: "1" }, { locator: "b", uid: "2" }];
  const limpio = analyzeTabTrace({ focusables, reached: focusables, trapped: false, exhausted: false, tabs: 4 });
  assert.equal(de(limpio, "2.1.2").verdict, "cumple-parcial");
  assert.match(de(limpio, "2.1.2").evid[0], /no hay trampa en el recorrido de tabulación/);
  // `cumple-parcial` y no `cumple`: esta prueba pulsa Tab, y dentro de un widget
  // compuesto se navega con flechas, que es donde Tab no ve la trampa.
  assert.match(de(limpio, "2.1.2").evid.join(" "), /FLECHAS/);

  // Sin un solo control enfocable no hay foco que atrapar.
  const vacia = analyzeTabTrace({ focusables: [], reached: [], trapped: false, exhausted: false, tabs: 0 });
  assert.equal(de(vacia, "2.1.2").verdict, "no-aplica");
});
