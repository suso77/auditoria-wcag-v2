import { test } from "node:test";
import assert from "node:assert/strict";
import { seguimiento, barreras, csvCell, resultadoOAW, oawExport } from "../src/report-oaw.js";
import { rollupSample } from "../src/sample-audit.js";

const f = (n, verdict, extra) => Object.assign({ c: { n, t: "x", lvl: "A" }, verdict, evid: ["e"] }, extra || {});

/* ── El fallo de entregable legal: declarar conforme lo no evaluado ── */

test("regresión: `humano` NUNCA se exporta como Correcto", () => {
  const r = seguimiento([f("1.4.1", "humano")])[0];
  assert.equal(r.veredicto, "humano");
  assert.ok(/No se puede comprobar/.test(r.resultado), r.resultado);
});

test("regresión: `cumple-parcial` NUNCA se exporta como Correcto a secas", () => {
  const r = seguimiento([f("2.4.2", "cumple-parcial")])[0];
  assert.ok(/No se puede comprobar/.test(r.resultado), r.resultado);
});

test("regresión: un veredicto desconocido cae del lado seguro", () => {
  const r = seguimiento([f("1.1.1", "veredicto-nuevo-sin-mapear")])[0];
  assert.ok(/No se puede comprobar/.test(r.resultado), r.resultado);
});

test("`pasa` (medido en render real) sí es Correcto", () => {
  assert.equal(seguimiento([f("2.5.8", "pasa")])[0].resultado, "Correcto");
  assert.equal(resultadoOAW("cumple"), "Correcto");
  assert.equal(resultadoOAW(null), "No evaluado");
});

test("regresión: el rollup no declara «sin barreras» con criterios sin evaluar", () => {
  const r = rollupSample([{ url: "/", findings: [f("1.4.1", "humano"), f("1.1.1", "cumple")] }]);
  assert.equal(r.resumen.revisar, 1);
  assert.equal(r.conformidad, "Requiere revisión manual");
});

test("el rollup sigue detectando el caso limpio", () => {
  const r = rollupSample([{ url: "/", findings: [f("1.1.1", "cumple"), f("2.5.8", "pasa")] }]);
  assert.equal(r.conformidad, "Sin barreras deterministas en la muestra");
  assert.equal(r.resumen.conformes, 2);
});

/* ── Inyección de fórmulas: la evidencia viene de sitios ajenos ── */

test("regresión: una celda que empieza por = no se entrega como fórmula", () => {
  assert.equal(csvCell("=cmd|' /c calc'!A0").slice(0, 2), '"\'');
  ["=SUM(A1)", "+1+1", "-2+3", "@SUM(1)", "\tx"].forEach((s) => {
    assert.ok(csvCell(s).indexOf("'") !== -1, "sin neutralizar: " + s);
  });
});

test("un número negativo legítimo NO se mutila", () => {
  assert.equal(csvCell("-3"), "-3");
  assert.equal(csvCell("-3,5"), "-3,5");
  assert.equal(csvCell("texto normal"), "texto normal");
});

/* ── Columnas completas del IRA ── */

test("regresión: gravedad, elemento y ámbito no salen en blanco", () => {
  const b = barreras([f("1.4.3", "falla", { sev: "grave", scope: "render", nodes: [{ locator: "button.cta" }] })])[0];
  assert.equal(b.gravedad, "Grave");
  assert.equal(b.elemento, "button.cta");
  assert.equal(b.ambito, "render");
});

test("regresión: una fila de barrera por ELEMENTO afectado, no por criterio", () => {
  const rows = barreras([f("1.1.1", "falla", { sev: "grave", nodes: [{ locator: "img.a" }, { locator: "img.b" }, { locator: "img.c" }] })]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.elemento), ["img.a", "img.b", "img.c"]);
  assert.equal(seguimiento([f("1.1.1", "falla", { nodes: [{ locator: "a" }, { locator: "b" }, { locator: "c" }] })])[0].num_barreras, 3);
});

test("enEN viaja también en el CSV", () => {
  const out = oawExport([f("2.4.11", "falla", { sev: "grave" })]);
  assert.ok(out.csv.seguimiento.includes("En la EN vigente"));
  assert.deepEqual(out.fueraDeEN, ["2.4.11"]);
});

/* ── Regresiones de la revisión profunda ─────────────────────────────────── */

test("regresión: los criterios que nadie miró salen como «No evaluado», no ausentes", () => {
  // Antes un criterio sin ningún hallazgo no generaba fila, así que en el
  // Seguimiento la diferencia entre «comprobado y correcto» y «nadie lo miró»
  // desaparecía. La rama «No evaluado» de resultadoOAW era código muerto.
  const out = oawExport([f("1.4.3", "pasa")]);
  assert.equal(out.seguimiento.length, 55, "una fila por criterio");
  const noEval = out.seguimiento.find((r) => r.criterio === "2.4.7");
  assert.equal(noEval.veredicto, null);
  assert.equal(noEval.resultado, "No evaluado");
  assert.equal(noEval.num_barreras, 0);
  assert.ok(out.noEvaluados.length >= 50);
  assert.ok(out.noEvaluados.indexOf("1.4.3") === -1, "el que sí se evaluó no está en la lista");
});

test("«No evaluado» nunca cuenta como conforme", () => {
  const out = oawExport([f("1.4.3", "pasa")]);
  out.seguimiento.filter((r) => r.veredicto == null)
    .forEach((r) => assert.notEqual(r.resultado, "Correcto", r.criterio + " no puede salir Correcto sin evaluar"));
});
