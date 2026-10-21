import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTabTrace } from "../src/dynamic.js";

/**
 * 2.1.2 es el único criterio del agente con gravedad CRÍTICA que se emite desde
 * una sola función, y salía mal de dos maneras distintas a la vez. Las dos se
 * vieron adjudicando una fila de un informe real:
 *
 *     criterio 2.1.2 · Crítica · «El foco queda atrapado con Tab: no se puede
 *     salir del componente solo con teclado.» · elemento: "" · selector: ""
 *
 * Una barrera crítica sin un elemento al que ir no es reportable, y la frase
 * afirmaba una trampa sin nombrar el componente. El dato estaba en el propio
 * bucle que la detecta y se tiraba.
 */

const uno = (t) => analyzeTabTrace(t).filter((f) => f.c.n === "2.1.2")[0];
const ev = (f) => (f.evid || []).join(" ");
const ctr = (n) => Array.from({ length: n }, (_, i) => ({ locator: "a#c" + i, uid: "c" + i }));

test("2.1.2: la trampa en UN control dice en cuál, y no habla de ciclos", () => {
  /* La rama degenerada —Tab vuelve una y otra vez al mismo control— no rellenaba
   * `atrapadoEn`, así que la fila salía sin elemento y la evidencia perdía su
   * segunda frase. Y cuando sí la decía, la decía mal: «cicla entre 1 control». */
  const f = uno({ focusables: ctr(6), reached: ctr(2), trapped: true, mismoControl: true, atrapadoEn: ["button#abrir"], tabs: 60 });
  assert.equal(f.verdict, "falla");
  assert.equal(f.sev, "crítica");
  assert.equal(f.nodes.length, 1);
  assert.equal(f.nodes[0].locator, "button#abrir");
  assert.match(ev(f), /atrapado con Tab en «button#abrir»/);
  assert.match(ev(f), /una y otra vez al mismo control/);
  assert.doesNotMatch(ev(f), /cicla entre/, "no es un ciclo entre varios: es uno solo");
  assert.match(ev(f), /4 control\(es\) del resto de la página sin alcanzar/);
});

test("2.1.2: la trampa CÍCLICA sigue contándose como antes", () => {
  const f = uno({ focusables: ctr(9), reached: ctr(3), trapped: true, atrapadoEn: ["button#cerrar", "button#aceptar"], tabs: 60 });
  assert.equal(f.verdict, "falla");
  assert.match(ev(f), /cicla entre 2 control\(es\) —button#cerrar → button#aceptar—/);
  assert.equal(f.nodes.length, 2);
});

test("2.1.2: una trampa sin a quién señalar no inventa un nodo", () => {
  /* Si por lo que sea no hay elemento, el veredicto sigue siendo `falla` —se ha
   * medido— pero el hallazgo no lleva `nodes`, y de ahí sale la casilla vacía
   * del informe. Esta es la forma que tenía la fila real de `/contacto`: el
   * arreglo es que la rama degenerada ya no llegue nunca aquí, no maquillar
   * esto. */
  const f = uno({ focusables: ctr(4), reached: ctr(1), trapped: true, atrapadoEn: [], tabs: 60 });
  assert.equal(f.verdict, "falla");
  assert.equal(f.nodes, undefined, "sin nodos reales no se pone un nodo inventado");
  assert.doesNotMatch(ev(f), /cicla entre/);
});

/* ── Los marcos: el punto ciego, declarado ───────────────────────────────── */

test("2.1.2: el veredicto conforme NO cubre el interior de un marco, y lo dice", () => {
  /* Esta es la afirmación peligrosa: «el foco sale de todos ellos, no hay
   * trampa». De los controles de dentro de un `<iframe>` no se ha salido ni se
   * ha entrado, porque desde el documento padre no se ven. Firmarlo entero
   * sería declarar comprobado lo que nadie ha mirado. */
  const t = { focusables: ctr(5), reached: ctr(5), trapped: false, exhausted: false, tabs: 60, medida: true };
  const sin = uno(t);
  const con = uno(Object.assign({}, t, { marcos: ["iframe#mapa"] }));
  assert.equal(sin.verdict, "cumple-parcial");
  assert.doesNotMatch(ev(sin), /marco/);
  assert.equal(con.verdict, "cumple-parcial");
  assert.match(ev(con), /no cubre el interior de 1 marco\(s\)/i);
  assert.match(ev(con), /iframe#mapa/);
});

test("2.1.2: si el recorrido se agota habiendo pasado por un marco, se dice dónde mirar", () => {
  const f = uno({ focusables: ctr(40), reached: ctr(9), trapped: false, exhausted: true, tabs: 60, marcos: ["iframe#captcha"] });
  assert.equal(f.verdict, "revisar");
  assert.match(ev(f), /iframe#captcha/);
  assert.match(ev(f), /una trampa dentro del marco y un marco con muchos controles se parecen desde fuera/);
});

test("2.1.2: una trampa real que además atravesó un marco menciona las dos cosas", () => {
  const f = uno({ focusables: ctr(8), reached: ctr(4), trapped: true, mismoControl: true,
    atrapadoEn: ["button#x"], marcos: ["iframe#video"], tabs: 60 });
  assert.equal(f.verdict, "falla");
  assert.match(ev(f), /atrapado con Tab en «button#x»/);
  assert.match(ev(f), /pasó por 1 marco\(s\) \(iframe#video\)/);
});
