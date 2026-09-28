import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, analyze, announcement } from "./helpers.mjs";

test("fragmento sin elemento analizable → null (lo gestiona la capa de UI)", () => {
  assert.equal(understand("<span>hola</span>"), null);
  assert.equal(understand("   "), null);
});

test("el modelo expone el árbol de accesibilidad completo", () => {
  const m = understand("<button>Enviar</button>");
  assert.ok(m.primary, "hay un nodo primario");
  assert.ok(Array.isArray(m.all) && m.all.length >= 1);
  assert.ok(Array.isArray(m.criteria) && m.criteria.length > 0);
  const n = m.primary;
  assert.ok(n.role && typeof n.role === "string");
  assert.ok(n.name && typeof n.name.name === "string");
  assert.ok(Array.isArray(n.states));
  assert.ok(typeof n.locator === "string" && n.locator.length > 0);
});

test("detección de patrón compuesto (pestañas)", () => {
  const m = understand(
    '<div class="tabs"><div role="tablist" aria-label="Cuenta">' +
    '<button role="tab" aria-selected="true" aria-controls="p1">Perfil</button>' +
    '<button role="tab" aria-selected="false" aria-controls="p2">Ajustes</button>' +
    '</div><div id="p1" role="tabpanel">A</div><div id="p2" role="tabpanel" hidden>B</div></div>'
  );
  assert.ok(m.all.length > 1, "un compuesto modela varios nodos");
  assert.ok(m.pattern, "se reconoce un patrón");
});

test("el anuncio del lector incluye nombre y rol", () => {
  const m = understand('<button>Guardar</button>');
  const say = announcement(m.primary);
  assert.ok(typeof say === "string" && say.length > 0);
  assert.match(say, /Guardar/);
});

test("analyze es determinista (misma entrada → mismo veredicto)", () => {
  const html = '<input type="email" placeholder="Tu correo" class="form-control">';
  const a1 = analyze(understand(html));
  const a2 = analyze(understand(html));
  assert.deepEqual(a1.summary, a2.summary);
});
