import { test } from "node:test";
import assert from "node:assert/strict";
import { seleccionarMuestra } from "../src/sampling.js";
import { axeFindingsNuevos } from "../src/audit-run.js";

const viol = (id, sc, impact, targets) => ({
  id, impact, help: "Ayuda de " + id, tags: ["wcag2a", "wcag" + sc.replace(/\./g, "")],
  nodes: (targets || ["div"]).map((t) => ({ target: [t] }))
});

test("axe aporta al informe lo que el motor NO ha visto", () => {
  const out = axeFindingsNuevos([viol("image-alt", "111", "critical", ["img.logo"])], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].c.n, "1.1.1");
  assert.equal(out[0].verdict, "falla");
  assert.equal(out[0].sev, "crítica");
  assert.equal(out[0].origen, "axe-core");
  assert.deepEqual(out[0].nodes, [{ locator: "img.logo", name: "image-alt" }]);
  assert.match(out[0].evid[0], /axe-core «image-alt»/);
});

test("regresión: no duplica el mismo ELEMENTO que el motor ya reporta", () => {
  // Antes axe se ejecutaba y sus hallazgos NO llegaban a findings; luego llegaban
  // pero se descartaba el CRITERIO entero si el motor ya fallaba en él, así que
  // veinticinco imágenes sin alt vistas por axe se perdían porque el motor había
  // visto una. Lo que se repite es el elemento, no el criterio.
  const v = viol("image-alt", "111", "critical");
  const mismo = axeFindingsNuevos([v], { "1.1.1": (v.nodes || []).map((n) => n.target.join(" ")) });
  assert.deepEqual(mismo, [], "el mismo elemento no se duplica");
  const otro = axeFindingsNuevos([v], { "1.1.1": ["img.otra-cosa"] });
  assert.equal(otro.length, 1, "un elemento que el motor no vio SÍ tiene que entrar");
  assert.match(otro[0].evid.join(" "), /ya los había detectado el motor|axe-core/);
});

test("regresión: axe no trunca las instancias a 10", () => {
  // `num_barreras` del Seguimiento sale de `nodes.length`: truncar aquí hacía que
  // la hoja de Seguimiento mintiera de forma coherente, y por tanto indetectable.
  const muchos = { id: "image-alt", impact: "critical", tags: ["wcag2a", "wcag111"], help: "h",
    nodes: Array.from({ length: 25 }, (_, i) => ({ target: ["img.foto-" + i] })) };
  assert.equal(axeFindingsNuevos([muchos], {})[0].nodes.length, 25);
});

test("la gravedad de axe se traduce a la del agente, quedándose con la peor", () => {
  assert.equal(axeFindingsNuevos([viol("x", "111", "serious")], [])[0].sev, "grave");
  assert.equal(axeFindingsNuevos([viol("x", "111", "minor")], [])[0].sev, "leve", "minor no escala");
  // Varias reglas en el mismo criterio: manda la más grave, no la última leída.
  assert.equal(axeFindingsNuevos([viol("a", "111", "minor"), viol("b", "111", "critical"), viol("c", "111", "moderate")], [])[0].sev, "crítica");
});

test("los hallazgos de axe llevan cláusula EN y nivel, como el resto", () => {
  const f = axeFindingsNuevos([viol("image-alt", "111", "critical")], [])[0];
  assert.equal(f.en, "9.1.1.1");
  assert.equal(f.c.lvl, "A");
  assert.equal(f.c.t, "Contenido no textual");
});

test("una violación sin criterio WCAG mapeable no inventa un criterio", () => {
  const sinTag = { id: "region", impact: "moderate", tags: ["best-practice"], nodes: [{ target: ["body"] }] };
  assert.deepEqual(axeFindingsNuevos([sinTag], []), []);
});

test("sin violaciones no hay hallazgos", () => {
  assert.deepEqual(axeFindingsNuevos([], []), []);
  assert.deepEqual(axeFindingsNuevos(null, null), []);
});

/* ── Resistencia y reconciliación ────────────────────────────────────────── */

test("regresión: la muestra se ordena antes de elegir, así la semilla basta", () => {
  // La semilla garantiza la misma permutación, pero sobre la misma lista de
  // entrada: si las candidatas llegaban en otro orden —otro rastreo, otra
  // concurrencia— la muestra «reproducible» salía distinta con la misma semilla.
  const c = [];
  for (let i = 0; i < 20; i++) c.push({ url: "https://x.es/p" + i, ruta: "/p" + i, plantilla: "art" + (i % 5) });
  const urls = (sel) => sel.muestra.map((p) => p.url).join(",");
  const A = seleccionarMuestra(c, { semilla: "S", max: 8 });
  const B = seleccionarMuestra(c.slice().reverse(), { semilla: "S", max: 8 });
  assert.equal(urls(A), urls(B), "el orden de entrada no puede cambiar la muestra");
  assert.notEqual(urls(A), urls(seleccionarMuestra(c, { semilla: "T", max: 8 })), "otra semilla sí");
});
