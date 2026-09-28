import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs"; // inyecta el DOMParser en el motor
import {
  compareAnnouncement, verifyWithScreenReader, bridge,
  normalize, spokenHasRole, stripReaderNoise
} from "../src/index.js";

test("normalize: minúsculas sin acentos", () => {
  assert.equal(normalize("Botón  ENVIAR"), "boton enviar");
});

test("spokenHasRole: reconoce el rol en ES y EN", () => {
  assert.ok(spokenHasRole("Cerrar, botón", "button"));
  assert.ok(spokenHasRole("link Saltar al contenido", "link"));
  assert.ok(spokenHasRole("Correo, área de texto", "textbox"));
  assert.ok(!spokenHasRole("Cerrar, botón", "link"));
});

test("stripReaderNoise: recorta ayudas y estado de VoiceOver", () => {
  const s = "link Saltar al contenido. Estás en un elemento de tipo link, dentro del contenido web. Para hacer clic en este enlace, pulsa Control-Opción-Espacio.";
  const c = stripReaderNoise(s);
  assert.ok(/Saltar al contenido/.test(c));
  assert.ok(!/Estás en un elemento/.test(c));
});

test("compareAnnouncement: nombre + rol presentes → confirmado", () => {
  const r = compareAnnouncement({ name: "Cerrar", role: "button" }, "Cerrar, botón");
  assert.equal(r.verdict, "confirmado");
  assert.equal(r.nameFound, true);
  assert.equal(r.roleFound, true);
});

test("compareAnnouncement: frase real de VoiceOver (enlace)", () => {
  const spoken = "link Saltar al contenido. Estás en un elemento de tipo link, dentro del contenido web.";
  const r = compareAnnouncement({ name: "Saltar al contenido", role: "link" }, spoken);
  assert.equal(r.verdict, "confirmado");
});

test("compareAnnouncement: control sin nombre y el lector solo dice el rol → barrera confirmada", () => {
  const r = compareAnnouncement({ name: "", role: "button" }, "botón");
  assert.equal(r.verdict, "barrera-confirmada");
});

test("compareAnnouncement: motor previó sin nombre pero el lector sí nombra → divergente", () => {
  const r = compareAnnouncement({ name: "", role: "button" }, "Cerrar, botón");
  assert.equal(r.verdict, "divergente");
});

test("compareAnnouncement: el lector dice otro nombre → divergente", () => {
  const r = compareAnnouncement({ name: "Guardar", role: "button" }, "Enviar, botón");
  assert.equal(r.verdict, "divergente");
});

test("compareAnnouncement: nombre sí, rol no reconocible → parcial", () => {
  const r = compareAnnouncement({ name: "Perfil", role: "tab" }, "Perfil");
  assert.equal(r.verdict, "parcial");
});

// Lector simulado con el API de @guidepup/guidepup (next / lastSpokenPhrase)
function mockVO(phrases) {
  let i = -1;
  return {
    next: async () => { i++; },
    lastSpokenPhrase: async () => (i < phrases.length ? phrases[i] : "")
  };
}

test("verifyWithScreenReader: recorre y captura frases únicas", async () => {
  const vo = mockVO(["Enviar, botón", "Enviar, botón", "Cerrar, botón", ""]);
  const out = await verifyWithScreenReader({ voiceOver: vo, steps: 4, sleepMs: 0 });
  assert.equal(out.length, 2); // deduplica la repetida y descarta la vacía
  assert.match(out[0].spoken, /Enviar/);
  assert.match(out[1].spoken, /Cerrar/);
});

test("bridge: alinea nodos previstos con las frases reales y dictamina", async () => {
  const html = '<button>Enviar formulario</button><button aria-label="Cerrar"></button>';
  const capture = async () => [
    { spoken: "Enviar formulario, botón" },
    { spoken: "Cerrar, botón" }
  ];
  const out = await bridge(html, { capture });
  assert.equal(out.results.length, 2);
  assert.ok(out.results.every((r) => r.verdict === "confirmado"));
  assert.equal(out.summary.confirmado, 2);
});

test("bridge: un icono sin nombre que el lector solo lee como «botón» → barrera confirmada", async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>';
  const capture = async () => [{ spoken: "botón" }];
  const out = await bridge(html, { capture });
  assert.ok(out.results.some((r) => r.verdict === "barrera-confirmada"));
});

test("bridge: exige un capture", async () => {
  await assert.rejects(() => bridge("<button>x</button>", {}), /capture/);
});

test("un nodo que el lector no visitó dice CUÁL es", async () => {
  // El veredicto `no-encontrado` salía sin `locator`, y en el informe aparecía
  // como «no-encontrado undefined»: sabías que algo no se verificó, pero no
  // qué. Visto en una ejecución real de NVDA en CI, con los cuatro nodos así.
  const html = '<button aria-label="Cerrar"></button><a href="/x">Inicio</a>';
  const out = await bridge(html, { capture: async () => [] });
  assert.equal(out.results.length, 2);
  assert.ok(out.results.every((r) => r.verdict === "no-encontrado"));
  assert.deepEqual(out.results.map((r) => r.locator).filter(Boolean).length, 2,
    "los dos tienen que llevar su locator: " + JSON.stringify(out.results.map((r) => r.locator)));
});
