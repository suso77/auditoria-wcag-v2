import { test } from "node:test";
import assert from "node:assert/strict";
import { tapadoAhora, oscurecimientoAlTabular } from "../src/measure.browser.js";

/**
 * 2.4.11: lo que tapa el foco se MIDE donde el navegador deja el control, no
 * donde a la medición le venga bien dejarlo.
 *
 * El bloque anterior sacaba cada control de la ventana y lo traía con
 * `scrollIntoView({block:"nearest"})`, apoyado en una premisa escrita en el
 * propio comentario: «nearest es lo que hace el navegador al tabular». Se midió
 * con pulsaciones de teclado de verdad y es falsa — Chromium no desplaza si el
 * control ya se ve, y si no se ve lo centra. Sobre una página de 40 enlaces con
 * cabecera pegajosa de 96 px: Tab bajando 0 tapados, Mayús+Tab subiendo 9, el
 * modelo «nearest» 34, todos en `top=0`. Veinticinco acusaciones inventadas.
 *
 * La comprobación contra el teclado vive en `test/integration/selector-real.test.mjs`,
 * que es donde hay navegador. Aquí se guardan las tres cautelas que cada una
 * costó una regresión y que un cambio de modelo podría llevarse por delante sin
 * que ningún número lo delate.
 */

/** Dobles mínimos: lo único que `tapadoAhora` mira es geometría y pintado. */
const rect = (t, l, b, r) => ({ top: t, left: l, bottom: b, right: r, width: r - l, height: b - t });
const elem = (rc, hijos) => {
  const e = { getBoundingClientRect: () => rc, contains: null };
  e.contains = (x) => x === e || (hijos || []).indexOf(x) >= 0;
  return e;
};
const ventana = { innerWidth: 1280, innerHeight: 800 };
const flot = (el, rc, extra) => Object.assign({ el: el, rect: rc, velo: false, opaco: 1, position: "fixed", loc: "div#barra" }, extra || {});

test("2.4.11: una barra opaca que cubre el control entero lo tapa", () => {
  const control = elem(rect(10, 0, 40, 200));
  const barra = elem(rect(0, 0, 120, 1280));
  const doc = { elementFromPoint: () => barra };
  const r = tapadoAhora(doc, ventana, control, [flot(barra, rect(0, 0, 120, 1280))]);
  assert.equal(r.peor && r.peor.el, barra);
  assert.ok(r.frac >= 0.999, "cubierto del todo, salió " + r.frac);
});

test("2.4.11: un control DENTRO del flotante no se acusa a sí mismo", () => {
  /* Los enlaces de la propia cabecera están, por definición, dentro de su
   * rectángulo: sin esta cautela cada página saldría con todos los enlaces de
   * navegación acusados. Comprobado aparte en un navegador: dos de dos. */
  const control = elem(rect(10, 0, 40, 200));
  const barra = elem(rect(0, 0, 120, 1280), [control]);
  const doc = { elementFromPoint: () => barra };
  const r = tapadoAhora(doc, ventana, control, [flot(barra, rect(0, 0, 120, 1280))]);
  assert.equal(r.peor, null);
  assert.equal(r.frac, 0);
});

test("2.4.11: lo que se pinta DETRÁS no tapa, aunque su rectángulo cruce", () => {
  /* Una marca de agua `fixed; inset:0; z-index:-1` cruza su rectángulo con
   * cualquier control y no oculta nada: tres barreras graves inventadas en una
   * página correcta. Quien manda es `elementFromPoint`, no la aritmética. */
  const control = elem(rect(300, 0, 330, 200));
  const marca = elem(rect(0, 0, 800, 1280));
  const doc = { elementFromPoint: () => control };   // encima se pinta el propio enlace
  const r = tapadoAhora(doc, ventana, control, [flot(marca, rect(0, 0, 800, 1280))]);
  assert.equal(r.peor, null, "la marca de agua no tapa");
});

test("2.4.11: un velo a pantalla completa no acusa control por control", () => {
  const control = elem(rect(300, 0, 330, 200));
  const velo = elem(rect(0, 0, 800, 1280));
  const doc = { elementFromPoint: () => velo };
  const r = tapadoAhora(doc, ventana, control, [flot(velo, rect(0, 0, 800, 1280), { velo: true })]);
  assert.equal(r.peor, null, "el velo se dice una vez y aparte, no por cada control");
});

test("2.4.11: lo translúcido atenúa, no oculta", () => {
  // 2.4.11 pide que el control no quede oculto DEL TODO. Un velo al 45 % deja
  // ver el foco a través: decirlo sí, acusarlo no.
  const control = elem(rect(10, 0, 40, 200));
  const barra = elem(rect(0, 0, 120, 1280));
  const doc = { elementFromPoint: () => barra };
  const r = tapadoAhora(doc, ventana, control, [flot(barra, rect(0, 0, 120, 1280), { opaco: 0.45 })]);
  assert.equal(r.peor, null, "no es ocultación");
  assert.equal(r.atenua && r.atenua.el, barra);
  assert.ok(r.fracAt > 0.9);
});

/* ── El recorrido ────────────────────────────────────────────────────────── */

/** Un control de mentira que apunta cuándo se le enfocó. */
function control(id, orden, ti, rc) {
  const e = {
    id: id, ti: ti == null ? 0 : ti,
    // Por defecto lejos de la barra: el que tiene que quedar tapado lo pide.
    getBoundingClientRect: () => rc || rect(300, 0, 330, 200),
    contains: (x) => x === e,
    focus: () => { orden.push(id); }
  };
  return e;
}

test("2.4.11: sin flotantes no se recorre nada", () => {
  const orden = [];
  const f = [{ el: control("a", orden), loc: "a", ti: 0 }];
  let anotados = 0;
  const n = oscurecimientoAlTabular({}, { scrollX: 0, scrollY: 0, scrollTo: () => {} }, f, [], () => { anotados++; });
  assert.equal(n, 0);
  assert.equal(anotados, 0);
  assert.deepEqual(orden, [], "si nada flota, no hay por qué mover el foco de la página");
});

test("2.4.11: se recorre el orden de TABULACIÓN, no el del documento", () => {
  /* Dónde queda un control al recibir el foco depende de dónde estaba la página
   * al llegar a él, así que el orden importa: un `tabindex` positivo va antes
   * que todo lo demás por mucho que esté al final del marcado. */
  const orden = [];
  const barra = elem(rect(0, 0, 120, 1280));
  const doc = { elementFromPoint: () => barra, documentElement: { scrollHeight: 4000 }, activeElement: null };
  const win = { scrollX: 0, scrollY: 0, innerWidth: 1280, innerHeight: 800, scrollTo: () => {} };
  const focusables = [
    { el: control("primero-en-el-marcado", orden), loc: "a#uno", ti: 0 },
    { el: control("segundo-en-el-marcado", orden), loc: "a#dos", ti: 0 },
    { el: control("con-tabindex-3", orden, 3), loc: "a#tres", ti: 3 },
    { el: control("con-tabindex-1", orden, 1), loc: "a#cuatro", ti: 1 }
  ];
  oscurecimientoAlTabular(doc, win, focusables, [flot(barra, rect(0, 0, 120, 1280))], () => {});
  // Dos pasadas: bajando y subiendo. La de bajada es la primera mitad.
  const bajando = orden.slice(0, 4);
  assert.deepEqual(bajando, ["con-tabindex-1", "con-tabindex-3", "primero-en-el-marcado", "segundo-en-el-marcado"],
    "los tabindex positivos van primero y en orden ascendente");
  const subiendo = orden.slice(4);
  assert.deepEqual(subiendo, bajando.slice().reverse(), "y la segunda pasada es la de Mayús+Tab");
});

test("2.4.11: lo peor de las dos direcciones es UN hallazgo del mismo control", () => {
  const orden = [];
  const barra = elem(rect(0, 0, 120, 1280));
  const doc = { elementFromPoint: () => barra, documentElement: { scrollHeight: 4000 }, activeElement: null };
  const win = { scrollX: 0, scrollY: 0, innerWidth: 1280, innerHeight: 800, scrollTo: () => {} };
  const anotados = [];
  const n = oscurecimientoAlTabular(doc, win,
    [{ el: control("x", orden, 0, rect(10, 0, 40, 200)), loc: "a#x", ti: 0 }],
    [flot(barra, rect(0, 0, 120, 1280))],
    (f, tipo, loc, t) => { anotados.push({ tipo: tipo, loc: loc, t: t }); });
  assert.equal(n, 1, "se enfoca dos veces y se anota una");
  assert.equal(anotados.length, 1);
  assert.equal(anotados[0].tipo, "tapa");
  assert.equal(anotados[0].loc, "a#x");
});

test("2.4.11: el suelo se devuelve donde estaba", () => {
  /* Lo que se mide después mide sobre la misma página: si el recorrido la deja
   * desplazada, lo siguiente mide otra cosa. */
  const orden = [];
  const barra = elem(rect(0, 0, 120, 1280));
  const movimientos = [];
  const doc = { elementFromPoint: () => barra, documentElement: { scrollHeight: 4000 }, activeElement: null };
  const win = { scrollX: 17, scrollY: 940, innerWidth: 1280, innerHeight: 800,
    scrollTo: (x, y) => { movimientos.push([x, y]); } };
  oscurecimientoAlTabular(doc, win, [{ el: control("x", orden), loc: "a#x", ti: 0 }],
    [flot(barra, rect(0, 0, 120, 1280))], () => {});
  assert.deepEqual(movimientos[movimientos.length - 1], [17, 940]);
});
