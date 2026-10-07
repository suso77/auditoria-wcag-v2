import { test } from "node:test";
import assert from "node:assert/strict";
import { rank, worseOf, worstOf, esConforme, esIndeterminado, aplicaCoberturas, VERDICTS } from "../src/verdicts.js";

test("el orden de gravedad cubre TODO el vocabulario", () => {
  const rangos = VERDICTS.map(rank);
  assert.deepEqual(rangos, [...rangos].sort((a, b) => b - a), "de peor a mejor sin empates mal puestos");
  assert.equal(new Set(rangos).size, VERDICTS.length, "sin rangos repetidos");
});

test("un veredicto DESCONOCIDO nunca vale como conforme", () => {
  assert.ok(rank("inventado") > rank("cumple"));
  assert.ok(rank("inventado") > rank("cumple-parcial"));
  assert.equal(worseOf("cumple", "inventado"), "inventado");
  assert.equal(esConforme("inventado"), false);
});

test("humano y cumple-parcial pesan más que cumple", () => {
  assert.equal(worseOf("cumple", "humano"), "humano");
  assert.equal(worseOf("pasa", "cumple-parcial"), "cumple-parcial");
  assert.equal(worstOf(["cumple", "pasa", "humano", "cumple"]), "humano");
});

test("falla domina siempre; lista vacía → null (nada evaluado)", () => {
  assert.equal(worstOf(["cumple", "revisar", "falla", "humano"]), "falla");
  assert.equal(worstOf([]), null);
});

test("esConforme solo acepta cumple y pasa", () => {
  assert.deepEqual(VERDICTS.filter(esConforme), ["pasa", "cumple"]);
  assert.deepEqual(VERDICTS.filter(esIndeterminado), ["revisar", "humano", "cumple-parcial"]);
});

/* ── Las notas de cobertura atan los veredictos (v0.37.0) ────────────────────
 *
 * Una nota `__meta` decía «se midieron 20 de 500 controles» y viajaba a la
 * prosa del final del informe sin tocar ningún veredicto, así que 2.4.3 salía
 * «pasa» sobre una medición del 4 %. Lo que sigue fija la política.
 */
test("una nota de cobertura baja a revisar los criterios que limita", () => {
  const f = (n, v) => ({ c: { n }, verdict: v, evid: ["lo medido"] });
  const findings = [f("2.4.7", "pasa"), f("2.5.8", "cumple"), f("1.4.3", "pasa")];
  const notas = [{ crit: "__meta", label: "Cobertura de los controles", detail: "se midieron 20 de 500", limita: ["2.4.7", "2.5.8"] }];
  const r = aplicaCoberturas(findings, notas);
  const v = {};
  r.findings.forEach((x) => { v[x.c.n] = x.verdict; });
  assert.equal(v["2.4.7"], "revisar");
  assert.equal(v["2.5.8"], "revisar");
  assert.equal(v["1.4.3"], "pasa", "no limitado por esta nota: se queda como estaba");
  assert.equal(r.atados.length, 2);
  // Y el motivo viaja DENTRO de la evidencia, no solo en un aviso aparte.
  assert.match(r.findings.find((x) => x.c.n === "2.4.7").evid.join(" "), /INCOMPLETA/);
});

test("una nota de cobertura nunca absuelve una barrera ni toca un no-aplica", () => {
  const f = (n, v) => ({ c: { n }, verdict: v, evid: [] });
  const findings = [f("1.4.3", "falla"), f("1.4.11", "no-aplica"), f("2.4.7", "revisar"), f("1.2.3", "humano")];
  const notas = [{ crit: "__meta", label: "Medido detrás de un velo", detail: "velo opaco", limita: ["1.4.3", "1.4.11", "2.4.7", "1.2.3"] }];
  const r = aplicaCoberturas(findings, notas);
  const v = {};
  r.findings.forEach((x) => { v[x.c.n] = x.verdict; });
  assert.equal(v["1.4.3"], "falla", "una barrera medida sigue siendo una barrera");
  assert.equal(v["1.4.11"], "no-aplica", "no-aplica habla de lo que HAY, no de lo que se midió");
  assert.equal(v["2.4.7"], "revisar");
  assert.equal(v["1.2.3"], "humano");
  assert.equal(r.atados.length, 0);
});

test("sin notas, o con notas sin `limita`, no se cambia nada", () => {
  const findings = [{ c: { n: "2.4.7" }, verdict: "pasa", evid: [] }];
  assert.equal(aplicaCoberturas(findings, []).findings[0].verdict, "pasa");
  assert.equal(aplicaCoberturas(findings, null).findings[0].verdict, "pasa");
  assert.equal(aplicaCoberturas(findings, [{ crit: "__meta", label: "x", detail: "y" }]).findings[0].verdict, "pasa");
});
