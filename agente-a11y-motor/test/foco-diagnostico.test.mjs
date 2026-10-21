import { test } from "node:test";
import assert from "node:assert/strict";
import { porQueEseColor } from "../src/measure.browser.js";

/* ── Por qué el contorno tiene ese color ──────────────────────────────────────
 *
 * «El contorno es del mismo color que el fondo» es cierto y no sirve: no dice si
 * el autor eligió mal el color o si la regla que debía fijarlo no llega al CSS.
 * Son dos arreglos distintos, y el segundo arregla seis botones a la vez.
 *
 * Los valores de estos tests NO son inventados: salen de medir los controles
 * acusados en jesusaccesible.com, con `getComputedStyle` en reposo y con el foco
 * puesto. Dos botones del mismo sitio, uno donde la regla aplica y otro donde no.
 *
 * Y de paso corrigen una afirmación falsa del informe: decía «al enfocar cambia
 * el estilo pero el indicador NO se ve», y en esos botones el contorno era
 * idéntico en reposo y con foco. Cambiaba otra cosa del snapshot —llevan
 * `transition-all`— pero el indicador no. */

// Medido: «Auditoría» de la cabecera. La regla SÍ aplica.
const AUDITORIA = {
  base: { outlineStyle: "solid", outlineWidth: 3, outlineColor: "rgb(255, 255, 255)", color: "rgb(255, 255, 255)" },
  foc:  { outlineStyle: "solid", outlineWidth: 4, outlineColor: "rgb(15, 23, 42)",   color: "rgb(255, 255, 255)" }
};
// Medido: «SOLICITAR DIAGNÓSTICO». La regla NO aplica.
const DIAGNOSTICO = {
  base: { outlineStyle: "solid", outlineWidth: 3, outlineColor: "rgb(255, 255, 255)", color: "rgb(255, 255, 255)" },
  foc:  { outlineStyle: "solid", outlineWidth: 3, outlineColor: "rgb(255, 255, 255)", color: "rgb(255, 255, 255)" }
};

test("foco: cuando la regla SÍ aplica, no se diagnostica nada", () => {
  /* Este es el guardia contra pasarse de listo: «Auditoría» tiene el mismo color
   * blanco en reposo que «SOLICITAR DIAGNÓSTICO», y aun así no debe llevar
   * diagnóstico, porque al enfocar su contorno cambia a rgb(15,23,42). */
  assert.equal(porQueEseColor(AUDITORIA.base, AUDITORIA.foc), "");
});

test("foco: un contorno idéntico en reposo y con foco delata que la regla no aplica", () => {
  const d = porQueEseColor(DIAGNOSTICO.base, DIAGNOSTICO.foc);
  assert.match(d, /IDÉNTICO en reposo y con el foco puesto/);
  assert.match(d, /3px solid rgb\(255, 255, 255\)/);
  assert.match(d, /NO está aplicando/);
});

test("foco: un contorno del color del elemento es currentColor sin resolver", () => {
  const d = porQueEseColor(DIAGNOSTICO.base, DIAGNOSTICO.foc);
  assert.match(d, /`currentColor` sin resolver/);
  assert.match(d, /hoja compilada/, "lo accionable es mirar el CSS compilado, no el marcado");
});

test("foco: las dos señales son independientes", () => {
  // Cambia al enfocar, pero el color sigue siendo el del elemento: solo una señal.
  const soloCurrent = porQueEseColor(
    { outlineStyle: "solid", outlineWidth: 2, outlineColor: "rgb(0, 0, 0)", color: "rgb(255, 255, 255)" },
    { outlineStyle: "solid", outlineWidth: 4, outlineColor: "rgb(255, 255, 255)", color: "rgb(255, 255, 255)" });
  assert.ok(!/IDÉNTICO/.test(soloCurrent), soloCurrent);
  assert.match(soloCurrent, /currentColor/);
  // Idéntico, pero el color NO es el del elemento: también solo una.
  const soloIgual = porQueEseColor(
    { outlineStyle: "solid", outlineWidth: 3, outlineColor: "rgb(200, 200, 200)", color: "rgb(0, 0, 0)" },
    { outlineStyle: "solid", outlineWidth: 3, outlineColor: "rgb(200, 200, 200)", color: "rgb(0, 0, 0)" });
  assert.match(soloIgual, /IDÉNTICO/);
  assert.ok(!/currentColor/.test(soloIgual), soloIgual);
});

test("foco: sin datos no se diagnostica, y no revienta", () => {
  /* Fail-safe: el diagnóstico es un AÑADIDO a una acusación que ya se sostiene
   * sola. Si falta el estado de reposo no se puede comparar, y lo que no se puede
   * medir no se afirma. */
  assert.equal(porQueEseColor(null, null), "");
  assert.equal(porQueEseColor(null, DIAGNOSTICO.foc).includes("IDÉNTICO"), false);
  // Con `foc` pero sin `base`, la señal de currentColor sí se puede dar.
  assert.match(porQueEseColor(null, DIAGNOSTICO.foc), /currentColor/);
});
