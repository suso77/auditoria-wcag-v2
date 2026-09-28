import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, over, contrastRatio, apcaContrast, apcaMin, MEASURE_SRC } from "../src/index.js";

test("parseColor: comas, espacios, porcentajes y alfa", () => {
  assert.deepEqual(parseColor("rgb(0, 0, 0)"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("rgb(255 255 255)"), { r: 255, g: 255, b: 255, a: 1 });
  const a = parseColor("rgba(0,0,0,0.4)");
  assert.equal(a.a, 0.4);
  const s = parseColor("rgb(0 0 0 / 0.5)");
  assert.equal(s.a, 0.5);
});

test("over: composición alfa (negro 0.4 sobre blanco = 153)", () => {
  const c = over({ r: 0, g: 0, b: 0, a: 0.4 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(Math.round(c.r), 153);
});

test("contrastRatio: negro/blanco = 21", () => {
  assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), 21);
});

test("contraste compuesto: blanco sobre negro-0.4-sobre-blanco falla 4.5", () => {
  const bg = over({ r: 0, g: 0, b: 0, a: 0.4 }, { r: 255, g: 255, b: 255, a: 1 });
  const ratio = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  assert.ok(ratio < 4.5, "debería quedar por debajo del mínimo (≈2.85)");
});

test("apcaContrast: negro sobre blanco ≈ Lc 106", () => {
  const lc = Math.abs(apcaContrast({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }));
  assert.ok(lc > 100 && lc < 112);
});

test("apcaMin: umbral por tamaño/peso", () => {
  assert.equal(apcaMin(24, 400), 60);
  assert.equal(apcaMin(16, 400), 75);
  assert.equal(apcaMin(12, 400), 90);
});

test("MEASURE_SRC: es código inyectable que expone window.__a11yMeasure", () => {
  assert.match(MEASURE_SRC, /window\.__a11yMeasure/);
  assert.match(MEASURE_SRC, /function runChecksReal/);
});
