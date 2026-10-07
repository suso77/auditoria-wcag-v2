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

/* ── Qué notas de cobertura ATAN veredictos y cuáles no (v0.37.0) ───────────
 *
 * La distinción que importa: se aprieta un criterio cuando algo NO se ha
 * podido mirar, nunca cuando algo simplemente existe. Las notas se declaran en
 * el código inyectado al navegador, así que esto se comprueba sobre su fuente —
 * es lo único que se puede leer sin un navegador delante, y basta para que un
 * `limita` no vuelva a aparecer donde no toca.
 */
test("la nota de MARCOS es informativa: tener un iframe no tumba la medición", () => {
  // Llevó `limita` durante una tarde y un A/B lo retiró: el orquestador entra
  // en cada marco con Playwright —también en los de otro origen— y los mide, así
  // que un solo reproductor incrustado bajaba cinco criterios de `pasa` a
  // `revisar` con el marco medido entero. Eso es ruido, y el ruido tapa barreras.
  const i = MEASURE_SRC.indexOf('label: "Marcos: se auditan aparte"');
  assert.ok(i > 0, "la nota de marcos sigue emitiéndose");
  // Dentro del objeto de esa nota no puede haber `limita`.
  const obj = MEASURE_SRC.slice(i, MEASURE_SRC.indexOf("});", i));
  assert.doesNotMatch(obj, /limita\s*:/, "la nota de marcos NO debe atar criterios");
});

test("las notas de lo que NO se ha podido medir sí atan criterios", () => {
  ["Medido detrás de un velo", "Shadow DOM cerrado", "Cobertura del contraste",
    "Cobertura de los controles", "Foco visible sin foco del sistema"].forEach(function (etq) {
    const i = MEASURE_SRC.indexOf('label: "' + etq + '"');
    assert.ok(i > 0, "sigue emitiéndose: " + etq);
    const obj = MEASURE_SRC.slice(i, MEASURE_SRC.indexOf("});", i));
    assert.match(obj, /limita\s*:/, etq + " debe declarar qué criterios limita");
  });
});

test("el velo opaco y el translúcido no atan lo mismo", () => {
  /* Un velo al 30 % deja medir la GEOMETRÍA —tamaños de objetivo, foco, orden de
   * tabulación— y solo pone en duda el color. Atando los ocho criterios igual que
   * uno opaco, una capa translúcida tumbaba mediciones correctas: eso es ruido, y
   * el ruido entierra barreras igual que el silencio. */
  const i = MEASURE_SRC.indexOf('label: "Medido detrás de un velo"');
  const obj = MEASURE_SRC.slice(i, MEASURE_SRC.indexOf("detail:", i));
  assert.match(obj, /limita\s*:\s*opaco\s*\?/, "la lista tiene que depender de la opacidad: " + obj.slice(0, 120));
  // La lista corta (translúcida) solo lleva criterios de COLOR.
  const corta = obj.slice(obj.lastIndexOf(":") + 1);
  assert.match(corta, /1\.4\.3/);
  assert.doesNotMatch(corta, /2\.5\.8|2\.4\.3|2\.1\.1/, "la geometría medida tras un velo translúcido sigue valiendo");
});
