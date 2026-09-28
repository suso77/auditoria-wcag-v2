import { test } from "node:test";
import assert from "node:assert/strict";
import {
  understand, analyze, applicableCriteria, severityByCrit,
  enClause, WCAG22, WCAG_TOTAL, EN_EXCLUDED
} from "./helpers.mjs";

test("la base WCAG 2.2 tiene 55 criterios A+AA bien formados", () => {
  assert.equal(WCAG_TOTAL, 55);
  assert.equal(WCAG22.length, 55);
  for (const c of WCAG22) {
    assert.ok(["A", "AA"].includes(c.lvl), `${c.n} nivel inesperado: ${c.lvl}`);
    assert.ok(["Perceptible", "Operable", "Comprensible", "Robusto"].includes(c.pr), `${c.n} principio inesperado`);
    assert.ok(typeof c.t === "string" && c.t.length > 0, `${c.n} sin título`);
    assert.ok(c.scope && c.det, `${c.n} sin ámbito/determinabilidad`);
  }
});

test("cláusula EN 301 549: mapeo y exclusiones de WCAG 2.2", () => {
  assert.equal(enClause("4.1.2"), "9.4.1.2");
  assert.equal(enClause("1.1.1"), "9.1.1.1");
  assert.equal(EN_EXCLUDED.size, 6);
  // Los seis criterios nuevos de 2.2 aún no están en la EN vigente → sin cláusula
  for (const n of ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"]) {
    assert.equal(enClause(n), null, `${n} no debería tener cláusula EN`);
  }
});

test("severidad por criterio", () => {
  assert.equal(severityByCrit("4.1.2"), "crítica");
  assert.equal(severityByCrit("2.1.1"), "crítica");
  assert.equal(severityByCrit("9.9.9", "A"), "grave");   // desconocido nivel A
  assert.equal(severityByCrit("9.9.9", "AA"), "moderada"); // desconocido nivel AA
});

test("applicableCriteria devuelve los criterios aplicables a un nodo", () => {
  // El predicado de aplicabilidad opera sobre los hechos de un NODO (no el modelo global).
  const m = understand("<button>Enviar</button>");
  const crits = applicableCriteria(m.primary);
  assert.ok(Array.isArray(crits) && crits.length > 0);
  for (const c of crits) {
    assert.ok(c.n && c.lvl, "cada criterio aplicable lleva número y nivel");
  }
  // 4.1.2 (nombre, rol, valor) aplica a cualquier control interactivo
  assert.ok(crits.some((c) => c.n === "4.1.2"));
});

test("botón bien construido → sin barreras", () => {
  const a = analyze(understand('<button type="button" aria-label="Cerrar"><svg aria-hidden="true"><path d="M6 6l12 12"/></svg></button>'));
  assert.equal(a.summary.falla, 0);
});

test("botón de icono sin nombre → barrera 4.1.2 crítica", () => {
  const a = analyze(understand('<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>'));
  assert.ok(a.summary.falla >= 1);
  const f = a.findings.find((x) => x.verdict === "falla" && x.c.n === "4.1.2");
  assert.ok(f, "debería fallar 4.1.2 (nombre accesible)");
  assert.equal(f.sev, "crítica");
});

test('«botón» con div+onclick → barreras (rol genérico / teclado)', () => {
  const a = analyze(understand('<div class="btn" onclick="x()">Enviar</div>'));
  assert.ok(a.summary.falla >= 1);
});

test("cada barrera lleva evidencia y criterio", () => {
  const a = analyze(understand('<a href="/informe.pdf">Leer más</a>'));
  for (const f of a.findings.filter((x) => x.verdict === "falla")) {
    assert.ok(f.c && f.c.n, "la barrera referencia un criterio");
    assert.ok(Array.isArray(f.evid) && f.evid.length > 0, "la barrera aporta evidencia");
  }
});

/* ── 1.3.5: la comprobación que la evidencia afirmaba y no existía ───────── */

test("1.3.5 comprueba el token de autocomplete de verdad", () => {
  // El texto decía «la parte automatizable se cumple» y NADA miraba
  // `autocomplete` (cero apariciones en el código fuera de la descripción). La
  // presencia y la validez del token sí son automatizables.
  const v = (h) => analyze(understand(h)).findings.find((f) => f.c.n === "1.3.5");
  assert.equal(v('<input type="email" name="correo">').verdict, "revisar");
  assert.match(v('<input type="email" name="correo">').evid[0], /sin atributo/);
  assert.equal(v('<input type="email" autocomplete="off">').verdict, "revisar");
  assert.equal(v('<input autocomplete="correo-electronico">').verdict, "revisar");
  assert.match(v('<input autocomplete="correo-electronico">').evid[0], /no es un token/);
});

test("1.3.5 acepta los tokens válidos y sus modificadores", () => {
  const v = (h) => analyze(understand(h)).findings.find((f) => f.c.n === "1.3.5");
  ['<input autocomplete="email">', '<input autocomplete="shipping postal-code">',
   '<input autocomplete="section-envio billing street-address">', '<input autocomplete="one-time-code">']
    .forEach((h) => assert.equal(v(h).verdict, "cumple-parcial", h));
});

test("1.3.5 no exige autocomplete donde no aplica", () => {
  const v = (h) => analyze(understand(h)).findings.find((f) => f.c.n === "1.3.5");
  ['<input type="checkbox" name="ok">', '<input type="submit" value="Enviar">',
   '<input type="file" name="f">', '<input type="range" name="r">']
    .forEach((h) => assert.equal(v(h).verdict, "cumple-parcial", h));
});

test("la evidencia de 1.3.5 ya no afirma lo que no comprobaba", () => {
  const f = analyze(understand('<input autocomplete="email">')).findings.find((x) => x.c.n === "1.3.5");
  assert.match(f.evid[0], /token de `autocomplete` válido/);
  assert.ok(f.evid[0].indexOf("La parte automatizable se cumple") === -1);
});
