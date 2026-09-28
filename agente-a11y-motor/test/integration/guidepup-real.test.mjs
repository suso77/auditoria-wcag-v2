import { test } from "node:test";
import assert from "node:assert/strict";
import "../helpers.mjs"; // inyecta el DOMParser en el motor
import { bridge, captureWithGuidepup } from "../../src/index.js";

// Arrancar VoiceOver es intrusivo (toma el control del equipo), así que esta
// prueba solo corre con opt-in explícito en macOS:
//   A11Y_REAL_VO=1 npm run test:integracion
// Requisitos previos: macOS con VoiceOver y permisos concedidos (npx @guidepup/setup).
const enabled = process.platform === "darwin" && process.env.A11Y_REAL_VO === "1";
const skip = enabled ? false : "opt-in requerido: A11Y_REAL_VO=1 en macOS con VoiceOver (npx @guidepup/setup)";

test("VoiceOver real: el botón de icono sin nombre se confirma como barrera 4.1.2", { skip }, async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button><button>Enviar</button>';
  const out = await bridge(html, { capture: (h) => captureWithGuidepup(h, { steps: 8 }) });
  // El icono sin nombre debería quedar confirmado como barrera real…
  assert.ok(out.results.some((r) => r.verdict === "barrera-confirmada"), "el icono sin nombre debería confirmarse");
  // …y el botón con texto, confirmado.
  assert.ok(out.results.some((r) => r.verdict === "confirmado"), "el botón con texto debería confirmarse");
});
