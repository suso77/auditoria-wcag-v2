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
