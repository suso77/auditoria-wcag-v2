import { test } from "node:test";
import assert from "node:assert/strict";
import "../helpers.mjs"; // inyecta el DOMParser en el motor
import { crossCheck, runAxeWithPlaywright } from "../../src/index.js";

// Sonda: ¿hay un Chromium lanzable? Si no, saltamos en vez de fallar.
const sonda = await (await import("../../src/playwright-launch.js")).chromiumDisponible();
const browserOK = sonda.ok, why = sonda.motivo;
const skip = browserOK ? false : "sin navegador (npx playwright install chromium): " + why;

test("axe real: el botón de icono sin nombre → violación button-name que coincide con el motor (4.1.2)", { skip }, async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>';
  const out = await crossCheck(html, { runAxe: runAxeWithPlaywright });
  // axe ve la violación de nombre…
  assert.ok(out.axeViolations.some((v) => v.id === "button-name"), "axe debería reportar button-name");
  // …y el motor y axe coinciden en 4.1.2
  assert.ok(out.reconciliation.agreements.some((a) => a.sc === "4.1.2"), "motor y axe deberían coincidir en 4.1.2");
});

test("axe real: un botón correcto no genera violaciones de nombre", { skip }, async () => {
  const violations = await runAxeWithPlaywright('<button type="button">Guardar cambios</button>');
  assert.ok(!violations.some((v) => v.id === "button-name"), "un botón con texto no debería fallar button-name");
});
