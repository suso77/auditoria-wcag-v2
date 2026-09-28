// Regresión de precisión: cada caso proviene de un hallazgo de la auditoría.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, analyze, spokenHasRole, reconcile } from "./helpers.mjs";

function fallas(html) {
  const m = understand(html);
  if (!m) return [];
  return analyze(m).findings.filter((f) => f.verdict === "falla").map((f) => f.c.n + "/" + f.sev);
}
function obsTypes(html) {
  const m = understand(html);
  if (!m) return [];
  return m.all.flatMap((n) => (n.observations || []).map((o) => o.type));
}
function roles(html) {
  const m = understand(html);
  return m ? m.all.map((n) => n.tag + ":" + n.role) : [];
}

test("F1: un control deshabilitado no falla 2.1.1", () => {
  assert.ok(!fallas("<button disabled>Guardar</button>").some((x) => x.startsWith("2.1.1")));
});

test("F2: una imagen con nombre por aria-label no falla 1.1.1", () => {
  assert.ok(!fallas('<img src="v.png" aria-label="Gráfico Q3">').some((x) => x.startsWith("1.1.1")));
});

test("F2: una imagen sin alternativa textual sí falla 1.1.1", () => {
  assert.ok(fallas('<img src="v.png">').some((x) => x.startsWith("1.1.1")));
});

test("F5: control interactivo con tabindex=-1 falla 2.1.1 como crítica", () => {
  assert.ok(fallas('<div role="button" tabindex="-1" onclick="x()">Guardar</div>').includes("2.1.1/crítica"));
});

test("F5b: un item gestionado (roving) con tabindex=-1 NO falla 2.1.1", () => {
  const types = obsTypes('<div role="menu"><div role="menuitem" tabindex="-1">Abrir</div></div>');
  assert.ok(!types.includes("not-focusable"));
});

test("C1: role=none no poda el subárbol (menuitem sobrevive)", () => {
  const rs = roles('<ul role="menubar"><li role="none"><a role="menuitem" href="#">Archivo</a></li></ul>');
  assert.ok(rs.some((r) => r.endsWith(":menuitem")));
});

test("M5: role=tab no exige aria-selected", () => {
  assert.ok(!obsTypes('<div role="tablist"><div role="tab" tabindex="0">P1</div></div>').includes("aria-missing-state"));
});

test("M6: input checkbox con role=switch no exige aria-checked", () => {
  assert.ok(!obsTypes('<input type="checkbox" role="switch" checked>').includes("aria-missing-state"));
});

test("M8: role=generic/paragraph/code son válidos (sin role-invalid)", () => {
  for (const r of ["generic", "paragraph", "code", "blockquote", "strong"]) {
    assert.ok(!obsTypes('<div role="' + r + '">x</div>').includes("role-invalid"), r + " debería ser válido");
  }
});

test("role: <select size=4> es listbox; <select> es combobox", () => {
  assert.equal(understand('<select size="4"><option>A</option></select>').primary.role, "listbox");
  assert.equal(understand("<select><option>A</option></select>").primary.role, "combobox");
});

test("role+nombre: input[type=image] es button y toma el nombre del alt", () => {
  const m = understand('<input type="image" src="s.png" alt="Buscar">');
  assert.equal(m.primary.role, "button");
  assert.equal(m.primary.name.name, "Buscar");
});

test("area[href] es link enfocable con nombre desde alt", () => {
  const m = understand('<map><area href="#z" alt="Zona activa"></map>');
  const area = m.all.find((n) => n.tag === "area");
  assert.ok(area);
  assert.equal(area.role, "link");
  assert.equal(area.name.name, "Zona activa");
});

test("accname: el contenido oculto no se cuenta en name-from-content", () => {
  const m = understand('<button>Guardar <span style="display:none">borrador</span></button>');
  assert.equal(m.primary.name.name, "Guardar");
});

test("accname: aria-labelledby SÍ incluye el objetivo oculto (spec)", () => {
  const m = understand('<button aria-labelledby="t">x</button><span id="t" hidden>Guardar todo</span>');
  const btn = m.all.find((n) => n.role === "button");
  assert.equal(btn.name.name, "Guardar todo");
});

test("scoping: <header> dentro de <article> no es banner", () => {
  const rs = roles("<article><header>T</header><p>x</p></article>");
  assert.ok(!rs.some((r) => r.endsWith(":banner")));
});

test("F3: un campo de entrada sin etiqueta falla 3.3.2", () => {
  assert.ok(fallas('<input type="text">').some((x) => x.startsWith("3.3.2")));
});

test("A3: un elemento enfocable con aria-hidden se marca como barrera oculta", () => {
  const m = understand('<div><a href="#">Inicio</a><button aria-hidden="true" tabindex="0">Comprar</button></div>');
  assert.ok(m.observations.some((o) => o.type === "hidden-focusable"));
});

// --- Lexicon / cruce ---
test("lexicon: spokenHasRole no confunde 'tab' con 'tabla'", () => {
  assert.ok(!spokenHasRole("Datos, tabla, fila 1", "tab"));
  assert.ok(spokenHasRole("Perfil, pestaña", "tab"));
});

test("reconcile: una regla multi-criterio no aparece a la vez en acuerdo y solo-axe", () => {
  const engineFallas = [{ c: { n: "4.1.2", t: "Nombre" }, sev: "crítica", verdict: "falla" }];
  const axe = [{ id: "link-name", impact: "serious", help: "", tags: ["wcag412", "wcag244"], nodes: [{}] }];
  const rec = reconcile(engineFallas, axe);
  assert.equal(rec.summary.acuerdo, 1);
  assert.equal(rec.summary.soloAxe, 0); // 2.4.4 no se cuenta: es la misma regla ya reconciliada
});
