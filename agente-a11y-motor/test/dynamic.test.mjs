import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeContextChange } from "../src/dynamic.js";
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs, analyzeErrorState } from "../src/index.js";

const has = (arr, n, v) => arr.some((f) => f.c.n === n && f.verdict === v);

test("tab-trace: controles no alcanzados → falla 2.1.1", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "button#a" }, { locator: "div.b" }], reached: [{ locator: "button#a" }] });
  assert.ok(has(r, "2.1.1", "falla"));
});

test("tab-trace: todos alcanzados → cumple 2.1.1", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "button#a" }], reached: [{ locator: "button#a" }] });
  assert.ok(has(r, "2.1.1", "cumple"));
});

test("tab-trace: trampa de foco → falla 2.1.2", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "a#x" }], reached: [{ locator: "a#x" }], trapped: true });
  assert.ok(has(r, "2.1.2", "falla"));
});

test("disclosure: aria-expanded no cambia → falla 4.1.2", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "false" }]);
  assert.ok(has(r, "4.1.2", "falla"));
});

test("disclosure: cambia estado pero no el contenido → revisar", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "true", targetShownBefore: false, targetShownAfter: false }]);
  assert.ok(has(r, "4.1.2", "revisar"));
});

test("disclosure: funciona → cumple", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "true", targetShownBefore: false, targetShownAfter: true }]);
  assert.ok(has(r, "4.1.2", "cumple"));
});

test("tabs: aria-selected no pasa a true → falla", () => {
  const r = analyzeTabs([{ locator: "button#t1", selectedAfter: "false", othersSelected: 0 }]);
  assert.ok(has(r, "4.1.2", "falla"));
});

test("errores: campo requerido en error sin texto → falla 3.3.1", () => {
  const r = analyzeErrorState({ submitted: true, fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "" }], hasAlert: false });
  assert.ok(has(r, "3.3.1", "falla"));
  assert.ok(has(r, "4.1.3", "revisar"));
});

test("errores: bien identificados y anunciados → cumple 3.3.1", () => {
  const r = analyzeErrorState({ submitted: true, fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "Introduce un correo válido", hasAlert: true }], hasAlert: true });
  assert.ok(has(r, "3.3.1", "cumple"));
});

test("errores: sin envío → sin hallazgos", () => {
  assert.equal(analyzeErrorState({ submitted: false, fields: [] }).length, 0);
});

/* ── 3.2.1 / 3.2.2: cambio de contexto sin que nadie lo pida ─────────────── */

const ctx = (e) => analyzeContextChange(e).map((f) => f.c.n + "/" + f.verdict);

test("navegar al recibir el foco falla 3.2.1", () => {
  // Los dos criterios dicen lo mismo con disparadores distintos, y los dos
  // estaban enteros en «evaluación humana». Son medibles: la URL, dónde queda el
  // foco y una huella del contenido visible son tres señales observables.
  const out = analyzeContextChange([{ locator: "select#pais", uid: "u1", disparador: "foco", navego: true }]);
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["3.2.1/falla"]);
  assert.match(out[0].evid[0], /prohíbe expresamente/);
});

test("navegar al cambiar el valor falla 3.2.2", () => {
  assert.deepEqual(ctx([{ locator: "select#pais", uid: "u1", disparador: "entrada", navego: true }]), ["3.2.2/falla"]);
});

test("mover el foco o cambiar el contenido queda a revisar, no a falla", () => {
  // El criterio lo PERMITE si se ha avisado antes, y ese aviso no se ve desde
  // aquí: convertirlo en falla sería inventar una barrera.
  const out = analyzeContextChange([{ locator: "input#a", uid: "u", disparador: "foco", navego: false, focoMovido: true }]);
  assert.equal(out[0].verdict, "revisar");
  assert.match(out[0].evid[0], /si se ha avisado antes/);
  assert.match(out[0].evid[0], /el foco salta a otro sitio/);
});

test("sin incidencias, el criterio PASA diciendo cuántos controles se probaron", () => {
  const out = analyzeContextChange([
    { locator: "a#x", uid: "u1", disparador: "foco", navego: false, focoMovido: false, contenidoCambio: false },
    { locator: "button#y", uid: "u2", disparador: "foco", navego: false, focoMovido: false, contenidoCambio: false }
  ]);
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["3.2.1/pasa"]);
  assert.match(out[0].evid[0], /2 control\(es\)/);
});

test("los controles que no se pudieron sondar se declaran", () => {
  const out = analyzeContextChange([{ locator: "a#x", uid: "u1", disparador: "foco", navego: false }], 7);
  assert.match(out[0].evid[0], /7 control\(es\) no se pudieron sondar/);
  assert.match(out[0].evid[0], /quedan sin comprobar/);
});

test("sin eventos de un disparador, ese criterio no se pronuncia", () => {
  assert.deepEqual(ctx([{ locator: "a", uid: "u", disparador: "foco", navego: false }]), ["3.2.1/pasa"]);
});
