import { test } from "node:test";
import assert from "node:assert/strict";
import { analizaPuntero } from "../src/pointer.js";

/**
 * Los cuatro criterios de puntero salían los cuatro como «requiere evaluación
 * humana» en todas las páginas: medido sobre el sitio de prueba, `humano` ×15
 * cada uno, sin una línea de expediente. Es verdad —ninguno se cierra sin
 * juicio— pero no es todo lo que se puede decir: lo que una persona necesita
 * para juzgarlos es saber QUÉ de la página se opera con gestos, arrastrando o
 * al pulsar, y eso sale del registro de oyentes del propio navegador.
 */

const de = (fs, n) => fs.find((f) => f.c.n === n);
const censo = (nodos, globales, examinados) => ({
  disponible: true, nodos: nodos || [], globales: globales || [],
  examinados: examinados == null ? 50 : examinados
});

test("sin censo no se dice NADA: inventar un veredicto sin medir es lo contrario de medir", () => {
  assert.deepEqual(analizaPuntero({ disponible: false, motivo: "sin CDP" }), []);
  assert.deepEqual(analizaPuntero(null), []);
  assert.deepEqual(analizaPuntero({}), []);
});

test("los cuatro criterios se pronuncian siempre que hay censo", () => {
  const out = analizaPuntero(censo([]));
  assert.deepEqual(out.map((f) => f.c.n).sort(), ["2.5.1", "2.5.2", "2.5.4", "2.5.7"]);
  // Ninguno se cierra: `cumple-parcial` es presencia medida, calidad por juzgar.
  out.forEach((f) => assert.equal(f.verdict, "cumple-parcial", f.c.n));
  out.forEach((f) => assert.match(f.evid.join(" "), /no ve dentro de los marcos/, f.c.n + " tiene que decir qué no alcanza"));
});

test("2.5.1 reconoce el gesto de trayectoria y no lo confunde con una pulsación", () => {
  const conGesto = analizaPuntero(censo([{ loc: "div#mapa", tipos: ["touchstart", "touchmove"] }]));
  assert.equal(de(conGesto, "2.5.1").verdict, "humano");
  assert.match(de(conGesto, "2.5.1").evid[0], /TRAYECTORIA/);
  assert.match(de(conGesto, "2.5.1").evid[1], /NO es incumplir/, "encontrar el gesto no es la barrera");
  assert.equal(de(conGesto, "2.5.1").nodes.length, 1);

  // Un botón normal no es un gesto.
  const sinGesto = analizaPuntero(censo([{ loc: "button", tipos: ["click"] }]));
  assert.equal(de(sinGesto, "2.5.1").verdict, "cumple-parcial");
});

test("2.5.2 señala lo que actúa en la BAJADA y deja fuera lo que escucha también la subida", () => {
  const malo = analizaPuntero(censo([{ loc: "button#malo", tipos: ["mousedown"] }]));
  assert.equal(de(malo, "2.5.2").verdict, "humano");
  assert.match(de(malo, "2.5.2").evid[1], /candidato, no barrera/);

  const bueno = analizaPuntero(censo([{ loc: "button#bueno", tipos: ["mousedown", "mouseup"] }]));
  assert.equal(de(bueno, "2.5.2").verdict, "cumple-parcial");
  // Y con `click`, que es lo que usa casi todo el mundo, tampoco se acusa.
  assert.equal(de(analizaPuntero(censo([{ loc: "b", tipos: ["pointerdown", "click"] }])), "2.5.2").verdict, "cumple-parcial");
});

test("2.5.4 mira el movimiento del dispositivo, en window y en los elementos", () => {
  const conMov = analizaPuntero(censo([], [{ que: "window", tipos: ["devicemotion"] }]));
  assert.equal(de(conMov, "2.5.4").verdict, "humano");
  assert.match(de(conMov, "2.5.4").evid[0], /devicemotion/);
  assert.equal(de(analizaPuntero(censo([], [{ que: "window", tipos: ["resize"] }])), "2.5.4").verdict, "cumple-parcial");
});

test("2.5.7 reconoce las tres formas de arrastrar", () => {
  const porAtributo = analizaPuntero(censo([{ loc: "div#s", tipos: [], draggable: true }]));
  assert.equal(de(porAtributo, "2.5.7").verdict, "humano");
  const porEvento = analizaPuntero(censo([{ loc: "div#s", tipos: ["dragstart"] }]));
  assert.equal(de(porEvento, "2.5.7").verdict, "humano");
  const porPuntero = analizaPuntero(censo([{ loc: "div#s", tipos: ["pointerdown", "pointermove", "pointerup"] }]));
  assert.equal(de(porPuntero, "2.5.7").verdict, "humano");
  // Un `pointerdown` suelto no es un arrastre.
  assert.equal(de(analizaPuntero(censo([{ loc: "d", tipos: ["pointerdown", "pointerup"] }])), "2.5.7").verdict, "cumple-parcial");
});

test("regresión: el recuento dice cuántos elementos se MIRARON, no cuántos tenían oyente", () => {
  // La primera versión contaba los que tienen oyente, así que en una página
  // limpia salía «se han revisado los oyentes de 0 elementos» — que se lee como
  // que no se miró nada, justo lo contrario de lo que había pasado.
  const limpia = analizaPuntero(censo([], [], 143));
  assert.match(de(limpia, "2.5.1").evid[0], /recorrido los 143 elemento/);
  assert.ok(!/de 0 elemento/.test(de(limpia, "2.5.1").evid[0]));
});

test("si el censo se cortó en el tope, se dice en las cuatro fichas", () => {
  const out = analizaPuntero({ disponible: true, nodos: [], globales: [], examinados: 1500, truncado: true });
  out.forEach((f) => assert.match(f.evid.join(" "), /se cortó en el tope/, f.c.n));
});

test("los hallazgos llevan criterio, ámbito y origen, como el resto del motor", () => {
  const out = analizaPuntero(censo([{ loc: "div", tipos: ["touchstart", "touchmove"] }]));
  out.forEach((f) => {
    assert.ok(f.c && f.c.n && f.c.t && f.c.lvl, "ficha incompleta: " + JSON.stringify(f.c));
    assert.equal(f.scope, "medición");
    assert.equal(f.origen, "puntero");
    assert.ok(Array.isArray(f.evid) && f.evid.length);
  });
});
