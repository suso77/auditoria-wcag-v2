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

/* ── «No aplica» es tan afirmación como «cumple» ──
 *
 * Medido: una página con un `<video>` dentro de un shadow root cerrado daba
 * 1.2.5 «no aplica · La página no tiene ningún vídeo ni marco embebido de
 * ninguna clase» tres líneas debajo de la nota que decía que había un shadow
 * root cerrado sin explorar. El agente se contradecía en el mismo informe, y la
 * plantilla del IRA se queda con el «No aplica», que cierra el criterio.
 */

test("una nota que oculta contenido invalida los «no aplica» de la página", () => {
  const f = (n, v) => ({ c: { n }, verdict: v, evid: ["x"] });
  const base = [f("1.2.5", "no-aplica"), f("1.4.3", "cumple"), f("2.4.1", "falla"), f("1.2.2", "pasa")];
  const r = aplicaCoberturas(base, [{ label: "Shadow DOM cerrado", detail: "uno", ocultaContenido: true, limita: ["1.4.3"] }]);
  const v = {};
  r.findings.forEach((x) => { v[x.c.n] = x.verdict; });
  assert.equal(v["1.2.5"], "revisar", "«no aplica» sobre contenido que no se vio no se puede sostener");
  assert.equal(v["1.4.3"], "revisar", "y lo atado por `limita` sigue bajando");
  assert.equal(v["2.4.1"], "falla", "una barrera encontrada sigue siendo una barrera");
  assert.equal(v["1.2.2"], "pasa", "lo que la nota no ata no se toca: atar de más entierra barreras");
  assert.ok(r.findings.find((x) => x.c.n === "1.2.5").evid.join(" ").includes("no se ha visto"));
});

test("sin nota que oculte contenido, un «no aplica» se queda como está", () => {
  const base = [{ c: { n: "1.2.5" }, verdict: "no-aplica", evid: ["no hay vídeo"] }];
  // Los marcos NO ocultan contenido a estos efectos: cada marco se mide en su
  // propia pasada y el cuaderno ya los cuenta como reproductores posibles.
  const r = aplicaCoberturas(base, [{ label: "Marcos", detail: "hay un iframe" }]);
  assert.equal(r.findings[0].verdict, "no-aplica");
  assert.deepEqual(r.atados, []);
});
