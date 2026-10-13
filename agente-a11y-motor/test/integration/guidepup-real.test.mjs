import { test } from "node:test";
import assert from "node:assert/strict";
import "../helpers.mjs"; // inyecta el DOMParser en el motor
import { bridge, captureWithGuidepup } from "../../src/index.js";

// Arrancar VoiceOver es intrusivo (toma el control del equipo), así que esta
// prueba solo corre con opt-in explícito en macOS:
//   A11Y_REAL_VO=1 npm run test:integracion
// Requisitos previos: macOS con VoiceOver y permisos concedidos
// (`npx @guidepup/setup setup` — el subcomando importa: sin él la CLI solo
// imprime su ayuda y no configura nada).
const enabled = process.platform === "darwin" && process.env.A11Y_REAL_VO === "1";
const skip = enabled ? false : "opt-in requerido: A11Y_REAL_VO=1 en macOS con VoiceOver (npx @guidepup/setup setup)";

/**
 * Resumen legible de la sesión, para que un fallo se pueda diagnosticar SIN
 * repetirla.
 *
 * Esto nació de la primera ejecución real de esta prueba, que tardó 103 s y
 * falló con «el icono sin nombre debería confirmarse». Ese mensaje es el mismo
 * tanto si VoiceOver habló y dijo otra cosa —un defecto del léxico— como si no
 * llegó a hablar de la página —el entorno—, que son dos conclusiones opuestas.
 * Después se midió el puente contra transcripciones REALES de VoiceOver en
 * español y la comparación era correcta, así que el fallo estaba en la captura
 * y la prueba no lo decía. Cien segundos de sesión sin una frase en el informe
 * es la misma falta que el agente persigue en los sitios que audita: callar lo
 * que no se ha podido comprobar.
 */
function resumen(out) {
  const porVeredicto = {};
  (out.results || []).forEach(function (r) { porVeredicto[r.verdict] = (porVeredicto[r.verdict] || 0) + 1; });
  const frases = (out.spokenPhrases || []).map(function (f, i) {
    return "    [" + i + "] «" + String(f).replace(/\s+/g, " ").slice(0, 160) + "»";
  });
  const filas = (out.results || []).map(function (r) {
    return "    " + String(r.verdict).padEnd(20) + (r.locator || "?") +
      "  previsto: «" + ((r.predicted && r.predicted.name) || "(sin nombre)") + "» / " +
      ((r.predicted && r.predicted.role) || "?") +
      "  oído: «" + String(r.cleaned || r.spoken || "").replace(/\s+/g, " ").slice(0, 90) + "»";
  });
  return "\n  veredictos: " + JSON.stringify(porVeredicto) +
    "\n  nodos:\n" + (filas.join("\n") || "    (ninguno)") +
    "\n  frases capturadas (" + (out.spokenPhrases || []).length + "):\n" + (frases.join("\n") || "    (ninguna)");
}

test("VoiceOver real: el botón de icono sin nombre se confirma como barrera 4.1.2", { skip }, async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button><button>Enviar</button>';
  const out = await bridge(html, { capture: (h) => captureWithGuidepup(h, { steps: 8 }) });
  const info = resumen(out);

  /* PRIMERO: ¿hubo sesión siquiera?
   *
   * Sin esto, una sesión en la que VoiceOver no llegó a leer la página —porque
   * Safari perdió el primer plano, porque faltan los permisos de AppleScript, o
   * porque el sistema movió dónde vive ese ajuste— fallaba con el mismo mensaje
   * que una divergencia real del léxico. Son dos conclusiones opuestas y el rojo
   * no las distinguía. `sin-captura` y `no-encontrado` significan AUSENCIA de
   * evidencia; no son un veredicto sobre el componente. */
  assert.ok(out.sesion && out.sesion.ok,
    "LA SESIÓN NO VERIFICÓ NADA: " + ((out.sesion && out.sesion.motivo) || "sin resumen de sesión") + " " +
    "Casi siempre es que el navegador perdió el primer plano, o que VoiceOver no se deja controlar por " +
    "AppleScript (`npx @guidepup/setup setup`, y en macOS 15+ el ajuste vive en un contenedor distinto). " +
    "Repítelo dejando Safari delante y sin tocar el equipo." + info);

  // Ahora sí, sobre evidencia que existe: el icono sin nombre debería quedar
  // confirmado como barrera real…
  assert.ok(out.results.some((r) => r.verdict === "barrera-confirmada"),
    "el icono sin nombre debería confirmarse como barrera" + info);
  // …y el botón con texto, confirmado.
  assert.ok(out.results.some((r) => r.verdict === "confirmado"),
    "el botón con texto debería confirmarse" + info);
});
