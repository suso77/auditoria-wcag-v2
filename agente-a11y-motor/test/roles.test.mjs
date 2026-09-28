import { test } from "node:test";
import assert from "node:assert/strict";
import { elementFrom, implicitRole, understand } from "./helpers.mjs";

test("implicitRole: mapeo nativo HTML-AAM", () => {
  assert.equal(implicitRole(elementFrom("<button></button>")), "button");
  assert.equal(implicitRole(elementFrom('<a href="/x">ir</a>')), "link");
  assert.equal(implicitRole(elementFrom('<input type="checkbox">')), "checkbox");
  assert.equal(implicitRole(elementFrom('<input type="text">')), "textbox");
  assert.equal(implicitRole(elementFrom("<h2>t</h2>")), "heading");
  assert.equal(implicitRole(elementFrom("<nav></nav>")), "navigation");
  assert.equal(implicitRole(elementFrom("<ul></ul>")), "list");
});

test("implicitRole: <a> sin href no es link", () => {
  assert.notEqual(implicitRole(elementFrom("<a>sin destino</a>")), "link");
});

test("rol explícito prevalece sobre el nativo", () => {
  const m = understand('<div role="button" tabindex="0">Ir</div>');
  assert.equal(m.primary.role, "button");
});

test("un role inválido queda registrado como observación 4.1.2", () => {
  const m = understand('<button role="foo">Enviar</button>');
  const obs = m.all.flatMap((n) => n.observations || []);
  const invalid = obs.find((o) => o.type === "role-invalid");
  assert.ok(invalid, "debería detectar el rol inválido");
  assert.equal(invalid.crit, "4.1.2");
});
