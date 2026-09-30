import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupSample, auditSample } from "../src/index.js";

const F = (n, lvl, verdict) => ({ c: { n, lvl, t: n }, verdict });

test("rollup: un criterio falla en el sitio si falla en alguna página", () => {
  const pages = [
    { url: "/a", findings: [F("1.4.3", "AA", "cumple"), F("4.1.2", "A", "falla")] },
    { url: "/b", findings: [F("1.4.3", "AA", "falla")] }
  ];
  const r = rollupSample(pages);
  assert.equal(r.paginas, 2);
  assert.equal(r.conformidad, "No conforme");
  const c143 = r.criterios.find((c) => c.n === "1.4.3");
  assert.equal(c143.worst, "falla");
  assert.deepEqual(c143.enPaginas.falla, ["/b"]);
});

test("rollup: solo revisar → requiere revisión manual", () => {
  const r = rollupSample([{ url: "/a", findings: [F("2.4.1", "A", "revisar")] }]);
  assert.equal(r.conformidad, "Requiere revisión manual");
});

test("rollup: todo cumple → sin barreras en la muestra", () => {
  const r = rollupSample([{ url: "/a", findings: [F("2.4.2", "A", "cumple")] }]);
  assert.equal(r.conformidad, "Sin barreras deterministas en la muestra");
});

test("auditSample: recorre la muestra con el analizador inyectado", async () => {
  const analyze = async (t) => ({ url: t.url, findings: [F("4.1.2", "A", t.url === "/x" ? "falla" : "cumple")] });
  const out = await auditSample([{ url: "/x" }, { url: "/y" }], { analyze });
  assert.equal(out.pages.length, 2);
  assert.equal(out.rollup.resumen.fallan, 1);
});

test("auditSample: exige analyze", async () => {
  await assert.rejects(() => auditSample([{ url: "/a" }], {}), /analyze/);
});

/* ── Regresión: el guardia de «muestra incompleta» no se puede apagar solo ──
 *
 * `rollupSample` deducía «esta página no se analizó» de «no trae hallazgos». Es
 * un indicio razonable, y se apagaba en cuanto alguien añadía hallazgos de SITIO
 * a cada página —la coherencia entre páginas, el cuaderno de la muestra—, porque
 * entonces ninguna lista quedaba vacía. Eso es exactamente lo que hace
 * `auditSite`: con dos de tres páginas caídas, el rollup decía «3 de 3
 * analizadas» y la conformidad salía «Requiere revisión manual» en lugar de
 * «Incompleta». La página muerta pasaba por auditada.
 */
test("regresión: una página caída no pasa por analizada porque lleve hallazgos de sitio", () => {
  const deSitio = { c: { n: "3.2.3", t: "Navegación coherente", lvl: "AA" }, verdict: "humano", evid: ["x"] };
  const pages = [
    { url: "https://ej.test/a", analizada: true,  findings: [{ c: { n: "1.1.1", t: "Contenido no textual", lvl: "A" }, verdict: "cumple", evid: ["x"] }, deSitio] },
    { url: "https://ej.test/b", analizada: false, error: "net::ERR_CONNECTION_REFUSED", findings: [deSitio] },
    { url: "https://ej.test/c", analizada: false, error: "Timeout 30000ms exceeded", findings: [deSitio] }
  ];
  const r = rollupSample(pages);
  assert.equal(r.paginasAnalizadas, 1, "una de tres, no tres de tres");
  assert.equal(r.sinAnalizar.length, 2);
  assert.match(r.conformidad, /^Incompleta: 2 de 3/);
  assert.match(r.sinAnalizar[0].error, /CONNECTION_REFUSED/, "y se dice qué falló, no «no se obtuvo ningún hallazgo»");
});

test("`analizada: true` manda sobre el indicio de «sin hallazgos»", () => {
  // Una página de verdad analizada en la que el motor no encontró nada que decir
  // es rarísima, pero si el analizador lo afirma, se le cree.
  const r = rollupSample([{ url: "https://ej.test/a", analizada: true, findings: [] }]);
  assert.equal(r.sinAnalizar.length, 0);
  assert.equal(r.paginasAnalizadas, 1);
});

test("sin el campo `analizada`, sigue valiendo el indicio de siempre", () => {
  const r = rollupSample([{ url: "https://ej.test/a", findings: [] }]);
  assert.equal(r.sinAnalizar.length, 1);
  assert.match(r.sinAnalizar[0].error, /no se obtuvo ningún hallazgo/);
});
