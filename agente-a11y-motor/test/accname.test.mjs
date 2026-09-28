import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, nodeByRole } from "./helpers.mjs";

test("aria-label prevalece sobre el contenido", () => {
  const m = understand('<button aria-label="Cerrar">x</button>');
  assert.equal(m.primary.name.name, "Cerrar");
});

test("aria-labelledby se resuelve por id", () => {
  const m = understand('<button aria-labelledby="t">x</button><span id="t">Guardar cambios</span>');
  const btn = nodeByRole(m, "button");
  assert.ok(btn);
  assert.equal(btn.name.name, "Guardar cambios");
});

test("el contenido nombra a un botón", () => {
  const m = understand("<button>Enviar formulario</button>");
  assert.equal(m.primary.name.name, "Enviar formulario");
});

test("<label for> nombra a su control", () => {
  const m = understand('<label for="e">Correo electrónico</label><input id="e" type="email">');
  const input = nodeByRole(m, "textbox");
  assert.ok(input, "debería existir un textbox");
  assert.equal(input.name.name, "Correo electrónico");
});

test("el texto alternativo nombra a la imagen", () => {
  const m = understand('<img src="x.png" alt="Logotipo de la empresa">');
  const img = nodeByRole(m, "img");
  assert.ok(img);
  assert.equal(img.name.name, "Logotipo de la empresa");
});

test("botón de icono sin nombre → nombre vacío", () => {
  const m = understand('<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>');
  assert.equal(m.primary.name.name, "");
});
