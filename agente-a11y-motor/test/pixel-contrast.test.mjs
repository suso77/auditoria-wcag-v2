import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarPixeles, detallePixeles, coberturaGlifos, SONDA_A, SONDA_B, MIN_COBERTURA, MIN_PIXELES } from "../src/pixel-contrast.js";

/**
 * Construye las TRES capturas: `fondo(x,y)` pinta el fondo, `esGlifo(x,y)` dice
 * dónde hay letra y `cobertura(x,y)` cuánta (para simular el antialiasing).
 * Las dos primeras llevan el texto repintado con las sondas; la tercera, el fondo
 * desnudo. Ojo: el color REAL del texto no interviene en las capturas — ese es
 * justo el punto del método.
 */
function capturas(w, h, fondo, esGlifo, cobertura) {
  const mezcla = (sonda) => {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bg = fondo(x, y);
      const cob = esGlifo(x, y) ? (cobertura ? cobertura(x, y) : 1) : 0;
      d[i] = Math.round((sonda ? sonda.r : bg.r) * cob + bg.r * (1 - cob));
      d[i + 1] = Math.round((sonda ? sonda.g : bg.g) * cob + bg.g * (1 - cob));
      d[i + 2] = Math.round((sonda ? sonda.b : bg.b) * cob + bg.b * (1 - cob));
      d[i + 3] = 255;
    }
    return { width: w, height: h, data: d };
  };
  return { sondaA: mezcla(SONDA_A), sondaB: mezcla(SONDA_B), fondo: mezcla(null) };
}
const img = (w, h, data) => ({ width: w, height: h, data });
const NEGRO = { r: 0, g: 0, b: 0 }, BLANCO = { r: 255, g: 255, b: 255 };
const filas = (n) => (x, y) => y % 4 < 2;   // bandas horizontales de glifo

/* ── Caso claro: texto negro sobre foto clara ── */

test("texto negro sobre un fondo claro → pasa, y dice sobre qué lo midió", () => {
  const r = analizarPixeles(capturas(40, 20, () => ({ r: 240, g: 240, b: 235 }), filas()), NEGRO);
  assert.equal(r.determinado, true);
  assert.equal(r.verdict, "pasa");
  assert.ok(r.peor > 15, "negro sobre casi blanco: " + r.peor);
  assert.equal(r.porcentajeQueFalla, 0);
  assert.ok(r.pixeles >= MIN_PIXELES);
});

test("texto blanco sobre una foto clara → falla", () => {
  const r = analizarPixeles(capturas(40, 20, () => ({ r: 235, g: 235, b: 230 }), filas()), BLANCO);
  assert.equal(r.verdict, "falla");
  assert.ok(r.peor < 1.2, String(r.peor));
  assert.equal(r.porcentajeQueFalla, 1);
});

/* ── El caso que de verdad importa: el degradado ── */

test("sobre un degradado manda el PEOR punto, no la media", () => {
  // El fondo va de negro a blanco: el texto blanco se lee en la mitad oscura y
  // desaparece en la clara. Un promedio lo daría por bueno; el criterio no.
  const r = analizarPixeles(capturas(64, 16, (x) => { const v = Math.round((x / 63) * 255); return { r: v, g: v, b: v }; }, filas()), BLANCO);
  assert.equal(r.determinado, true);
  assert.equal(r.verdict, "falla");
  assert.ok(r.mejor > 15, "en la zona negra el blanco contrasta de sobra: " + r.mejor);
  assert.ok(r.peor < 1.2, "en la zona blanca no se ve: " + r.peor);
  assert.ok(r.porcentajeQueFalla > 0.3 && r.porcentajeQueFalla < 0.9, "una parte falla: " + r.porcentajeQueFalla);
  assert.ok(r.fondosDistintos > 10, "debe haber visto muchos tonos: " + r.fondosDistintos);
});

test("un degradado sobre el que TODO el texto llega al mínimo → pasa", () => {
  const r = analizarPixeles(capturas(64, 16, (x) => { const v = 200 + Math.round((x / 63) * 55); return { r: v, g: v, b: v }; }, filas()), NEGRO);
  assert.equal(r.verdict, "pasa");
  assert.ok(r.fondosDistintos > 10);
});

test("una franja pequeña que falla basta para suspender", () => {
  // 95 % del fondo es oscuro, pero una banda clara deja el texto blanco invisible.
  const r = analizarPixeles(capturas(80, 16, (x) => (x > 75 ? { r: 250, g: 250, b: 250 } : { r: 20, g: 20, b: 20 }), filas()), BLANCO);
  assert.equal(r.verdict, "falla");
  assert.ok(r.porcentajeQueFalla > 0.02 && r.porcentajeQueFalla < 0.15, String(r.porcentajeQueFalla));
  assert.ok(r.medio > 10, "la media engañaría: " + r.medio);
});

/* ── Antialiasing: el error clásico de medir píxeles ── */

test("regresión: los bordes antialiasados NO se miden", () => {
  // Fondo blanco, texto negro. Los bordes son grises intermedios: medirlos daría
  // «fondos» grises que no existen y contrastes peores que los reales.
  const cobertura = (x, y) => (y % 4 === 0 ? 0.25 : 1);  // una de cada cuatro filas es borde
  const r = analizarPixeles(capturas(40, 20, () => BLANCO, (x, y) => y % 4 < 2, cobertura), NEGRO);
  assert.equal(r.determinado, true);
  assert.equal(r.fondosDistintos, 1, "solo debe ver el blanco real, no los grises del borde");
  assert.ok(r.peor > 20, String(r.peor));
});

/* ── Cuando no se puede medir, se dice ── */

test("si ocultar el texto no cambia nada → sigue sin determinarse", () => {
  // background-clip:text, texto en canvas o texto que es una imagen.
  const data = new Uint8Array(40 * 20 * 4).fill(200);
  const igual = () => img(40, 20, data.slice());
  const r = analizarPixeles({ sondaA: igual(), sondaB: igual(), fondo: igual() }, NEGRO);
  assert.equal(r.determinado, false);
  assert.match(r.motivo, /background-clip:text|canvas/);
});

test("muy pocos píxeles de texto → no se dictamina con esa muestra", () => {
  const r = analizarPixeles(capturas(6, 4, () => BLANCO, (x, y) => x === 0 && y === 0), NEGRO);
  assert.equal(r.determinado, false);
  assert.match(r.motivo, /píxel\(es\) de texto/);
});

test("si el layout cambió al ocultar el texto, no se compara", () => {
  const r = analizarPixeles({ sondaA: img(10, 10, new Uint8Array(400)), sondaB: img(10, 9, new Uint8Array(360)), fondo: img(10, 10, new Uint8Array(400)) }, NEGRO);
  assert.equal(r.determinado, false);
  assert.match(r.motivo, /no coinciden en tamaño/);
});

test("sin capturas no se inventa un veredicto", () => {
  assert.equal(analizarPixeles(null, NEGRO).determinado, false);
  assert.equal(analizarPixeles({ sondaA: img(2, 2, new Uint8Array(16)) }, NEGRO).determinado, false);
});

/* ── Umbral de texto grande ── */

test("el texto grande usa el mínimo de 3:1", () => {
  const c = capturas(40, 20, () => ({ r: 130, g: 130, b: 130 }), filas());
  assert.equal(analizarPixeles(c, BLANCO, { grande: true }).minExigido, 3);
  assert.equal(analizarPixeles(c, BLANCO, { grande: false }).minExigido, 4.5);
  // Blanco sobre gris medio ronda 3.5:1 — pasa como texto grande y falla como normal.
  assert.equal(analizarPixeles(c, BLANCO, { grande: true }).verdict, "pasa");
  assert.equal(analizarPixeles(c, BLANCO, { grande: false }).verdict, "falla");
});

/* ── Evidencia legible ── */

test("la evidencia dice qué se midió, sobre cuántos píxeles y dónde falla", () => {
  const d = detallePixeles(analizarPixeles(capturas(64, 16, (x) => { const v = Math.round((x / 63) * 255); return { r: v, g: v, b: v }; }, filas()), BLANCO), "rgb(255 255 255)");
  assert.match(d, /medido sobre los píxeles del fondo real/);
  assert.match(d, /px de texto/);
  assert.match(d, /tono\(s\) de fondo/);
  assert.match(d, /en el peor punto/);
  assert.match(d, /% del texto no llega al mínimo/);
});

test("cuando no se determina, la evidencia lo explica en vez de callarlo", () => {
  const d = detallePixeles({ determinado: false, motivo: "texto en canvas" }, "rgb(0 0 0)");
  assert.match(d, /fondo con imagen o degradado: texto en canvas/);
});

test("la cobertura mínima es configurable y tiene un valor por defecto sensato", () => {
  assert.ok(MIN_COBERTURA > 0.7 && MIN_COBERTURA <= 1);
  const c = capturas(40, 20, () => BLANCO, filas());
  assert.equal(analizarPixeles(c, NEGRO, { minCobertura: 1.5 }).determinado, false, "una exigencia imposible no debe inventar datos");
});

test("la cobertura se calcula exacta a partir de las dos sondas", () => {
  const c = capturas(10, 4, () => ({ r: 90, g: 120, b: 30 }), (x, y) => y === 1, (x) => x / 9);
  const alfa = coberturaGlifos(c.sondaA, c.sondaB);
  for (let x = 0; x < 10; x++) {
    assert.ok(Math.abs(alfa[1 * 10 + x] - x / 9) < 0.01, "α en x=" + x + ": " + alfa[1 * 10 + x]);
    assert.equal(alfa[0 * 10 + x], 0, "fuera del glifo α debe ser 0");
  }
});

test("regresión: el método funciona aunque el texto sea del MISMO color que el fondo", () => {
  // Este es el caso que hundía el enfoque anterior (capturar con texto y sin él):
  // la diferencia era cero justo donde el texto es ilegible. Con las sondas, la
  // máscara no depende del color real del texto.
  const casiBlanco = { r: 252, g: 252, b: 250 };
  const r = analizarPixeles(capturas(40, 20, () => casiBlanco, filas()), BLANCO);
  assert.equal(r.determinado, true, "debe poder dictaminarlo: " + r.motivo);
  assert.equal(r.verdict, "falla");
  assert.ok(r.peor < 1.1, "texto blanco sobre casi blanco: " + r.peor);
});

test("regresión: texto translúcido se compone sobre CADA fondo, no una vez", () => {
  // Un texto con alpha 0.5 sobre un degradado tiene un color efectivo distinto en
  // cada punto. Componerlo una sola vez daría un número que no corresponde a nada.
  const grad = (x) => { const v = Math.round((x / 39) * 255); return { r: v, g: v, b: v }; };
  const r = analizarPixeles(capturas(40, 20, grad, filas()), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.equal(r.determinado, true);
  assert.ok(r.mejor > r.peor, "debe ver variación: " + r.peor + " → " + r.mejor);
  assert.ok(r.peor >= 1, "un contraste nunca baja de 1:1: " + r.peor);
});

test("regresión: color transparent → no se dictamina (lo pinta otra cosa)", () => {
  const r = analizarPixeles(capturas(40, 20, () => BLANCO, filas()), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(r.determinado, false);
  assert.match(r.motivo, /transparent/);
});

/* ── Regresión: la tolerancia del 2 % absolvía texto ilegible ────────────────
 *
 * La tolerancia se justificaba por «el ruido de remuestreo y compresión», y se
 * aplicaba a píxeles con cobertura ≥ 0.9 — el NÚCLEO del glifo, ya filtrado de
 * antialiasing—, donde ese ruido no existe. Sobre un degradado ese 2 % son letras
 * enteras. Y la evidencia llegaba a decir «todo el texto llega al mínimo» junto a
 * «1.00:1 en el peor punto»: una contradicción en la misma línea.
 */
function nucleoPlano(total, ilegibles) {
  // `total` píxeles de cobertura 1; los `ilegibles` primeros, sobre fondo blanco
  // (con texto blanco → 1.00:1); el resto sobre un gris oscuro legible.
  const mk = () => ({ width: total, height: 1, data: new Uint8Array(total * 4) });
  const A = mk(), B = mk(), F = mk();
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    A.data[p] = 255; A.data[p + 1] = 0; A.data[p + 2] = 255; A.data[p + 3] = 255;
    B.data[p] = 0; B.data[p + 1] = 255; B.data[p + 2] = 0; B.data[p + 3] = 255;
    const v = i < ilegibles ? 255 : 40;
    F.data[p] = v; F.data[p + 1] = v; F.data[p + 2] = v; F.data[p + 3] = 255;
  }
  return { sondaA: A, sondaB: B, fondo: F };
}
const TXT_BLANCO = { r: 255, g: 255, b: 255, a: 1 };

test("regresión: el 1 % del texto ilegible ya no sale como «pasa»", () => {
  const r = analizarPixeles(nucleoPlano(1000, 10), TXT_BLANCO, {});
  assert.equal(r.verdict, "falla", "diez píxeles de núcleo a 1.00:1 no son ruido de compresión");
  assert.ok(r.peor < 1.05);
  // Y el 2 % justo, que era el borde exacto de la tolerancia.
  assert.equal(analizarPixeles(nucleoPlano(1000, 20), TXT_BLANCO, {}).verdict, "falla");
});

test("regresión: la evidencia no puede decir «todo el texto llega» con 1.00:1 al lado", () => {
  [0, 1, 3, 4, 10, 20].forEach((malos) => {
    const r = analizarPixeles(nucleoPlano(1000, malos), TXT_BLANCO, {});
    const d = detallePixeles(r, "rgb(255 255 255)");
    if (/todo el texto llega al mínimo/.test(d)) {
      assert.ok(r.peor >= r.minExigido,
        "con «todo el texto llega al mínimo» el peor punto tiene que llegar, y es " + r.peor.toFixed(2) + ":1");
    }
  });
});

test("un puñado de píxeles sueltos pide revisión, y no absuelve", () => {
  // El caso real que justificaba la tolerancia: dos o tres píxeles del borde del
  // glifo que el filtro de cobertura no acabó de limpiar. `revisar` no es conforme.
  const r = analizarPixeles(nucleoPlano(1000, 3), TXT_BLANCO, {});
  assert.equal(r.verdict, "revisar");
  assert.equal(r.pixelesQueFallan, 3);
  assert.match(detallePixeles(r, "rgb(255 255 255)"), /píxel\(es\) sueltos por debajo del mínimo/);
  assert.ok(!/todo el texto llega/.test(detallePixeles(r, "rgb(255 255 255)")));
});

test("sin ni un píxel por debajo, sigue siendo «pasa»", () => {
  const r = analizarPixeles(nucleoPlano(1000, 0), TXT_BLANCO, {});
  assert.equal(r.verdict, "pasa");
  assert.match(detallePixeles(r, "rgb(255 255 255)"), /todo el texto llega al mínimo/);
});
