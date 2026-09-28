/**
 * NVDA en español: el mismo puente, otro vocabulario.
 *
 * En España el lector dominante es NVDA, y NVDA no dice lo que dice VoiceOver.
 * Donde VoiceOver anuncia «imagen», NVDA dice «gráfico»; donde dice «enlace»,
 * NVDA dice «vínculo»; y NVDA acompaña cada elemento de su estado y su posición
 * («casilla no marcada», «1 de 7», «nivel 2», «contraído»), que no son el nombre
 * del control.
 *
 * Eso último es lo que de verdad importa aquí. Si el estado no se recorta, un
 * botón de icono SIN nombre accesible —un 4.1.2 real— se queda con «no marcada»
 * o con «1 de 7» de residuo, y el puente concluye que «el lector sí pronuncia un
 * nombre»: una barrera de verdad absuelta por una palabra de estado.
 *
 * Las frases de abajo están construidas siguiendo el patrón documentado de NVDA
 * en español (nombre + rol + estado + posición). NO son transcripciones reales:
 * las reales las produce la ejecución en CI sobre Windows y quedan como fixture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs"; // inyecta el DOMParser en el motor
import { spokenHasRole, stripReaderNoise, esRuidoDeEscritorio, normalize } from "../src/reader-lexicon.js";
import { compareAnnouncement, bridge } from "../src/guidepup-bridge.js";

test("reconoce los roles con las palabras de NVDA, no solo con las de VoiceOver", () => {
  assert.ok(spokenHasRole("Ayuda vínculo", "link"), "NVDA dice «vínculo» donde VoiceOver dice «enlace»");
  assert.ok(spokenHasRole("Logotipo gráfico", "img"), "NVDA dice «gráfico» donde VoiceOver dice «imagen»");
  assert.ok(spokenHasRole("Nombre edición", "textbox"), "NVDA dice «edición» para un campo de texto");
  assert.ok(spokenHasRole("Sexo botón de opción no marcado", "radio"), "NVDA dice «botón de opción»");
  assert.ok(spokenHasRole("Navegación punto de referencia", "navigation"), "NVDA anuncia los landmarks así");
  // Y sigue reconociendo las de VoiceOver: el léxico es de los dos.
  assert.ok(spokenHasRole("Ayuda, enlace", "link"));
  assert.ok(spokenHasRole("Logotipo, imagen", "img"));
});

test("recorta el estado y la posición de NVDA, que no son el nombre", () => {
  const limpio = (s) => normalize(stripReaderNoise(s, "nvda"));
  assert.equal(limpio("Acepto casilla no marcada"), "acepto casilla");
  assert.equal(limpio("Opciones botón contraído"), "opciones boton");
  assert.equal(limpio("Inicio vínculo visitado"), "inicio vinculo");
  assert.equal(limpio("Ayuda vínculo 3 de 7"), "ayuda vinculo");
  assert.equal(limpio("Resultados encabezado nivel 2"), "resultados encabezado");
  assert.equal(limpio("Total fila 3 columna 1"), "total");
  assert.equal(limpio("Menú botón tiene menú emergente"), "menu boton");
  assert.equal(limpio("Enviar botón clicable"), "enviar boton");
});

test("lo que recorta es el estado, no el contenido", () => {
  // «Nivel» dentro de un nombre de verdad no se toca si no lleva número.
  assert.match(stripReaderNoise("Nivel educativo cuadro combinado", "nvda"), /Nivel educativo/);
  assert.match(stripReaderNoise("Marcado CE vínculo", "nvda"), /CE/);
});

test("un icono sin nombre que NVDA lee «botón no marcado» sigue siendo barrera", () => {
  // Este es el caso que motiva el recorte: sin él, «no marcado» pasa por nombre.
  const r = compareAnnouncement({ name: "", role: "button" }, "botón no marcado", "nvda");
  assert.equal(r.verdict, "barrera-confirmada", r.note);
});

test("una casilla sin nombre que NVDA lee «casilla no marcada 1 de 3» sigue siendo barrera", () => {
  const r = compareAnnouncement({ name: "", role: "checkbox" }, "casilla no marcada 1 de 3", "nvda");
  assert.equal(r.verdict, "barrera-confirmada", r.note);
});

test("y un control que SÍ tiene nombre se confirma con el vocabulario de NVDA", () => {
  const r = compareAnnouncement({ name: "Buscar en el sitio", role: "button" }, "Buscar en el sitio botón", "nvda");
  assert.equal(r.verdict, "confirmado");
});

test("el escritorio de Windows tampoco cuenta como evidencia", () => {
  assert.equal(esRuidoDeEscritorio("Barra de tareas Inicio botón", "nvda"), true);
  assert.equal(esRuidoDeEscritorio("NVDA iniciado", "nvda"), true);
  assert.equal(esRuidoDeEscritorio("Símbolo del sistema", "nvda"), true);
  assert.equal(esRuidoDeEscritorio("Enviar formulario botón", "nvda"), false);
  // Sin decir el lector se comprueban los dos sistemas: recortar de más aquí
  // solo produce «sin-captura», que es pedir otra pasada, no absolver nada.
  assert.equal(esRuidoDeEscritorio("Barra de tareas Inicio botón"), true);
  assert.equal(esRuidoDeEscritorio("Finder ventana"), true);
});

test("una frase de la barra de tareas no puede quedarse con el nombre de un control", () => {
  const r = compareAnnouncement({ name: "", role: "button" }, "Barra de tareas Inicio botón", "nvda");
  assert.equal(r.verdict, "sin-captura", r.note);
});

test("bridge con lector nvda: recorre un componente y dictamina con su vocabulario", async () => {
  const html = '<button>Enviar formulario</button><button aria-label="Cerrar"></button>' +
    '<a href="/ayuda">Ayuda</a><img src="x.png" alt=""><button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>';
  const capture = async () => [
    { spoken: "Enviar formulario botón" },
    { spoken: "Cerrar botón" },
    { spoken: "Ayuda vínculo 3 de 7" },
    { spoken: "botón clicable" }
  ];
  const out = await bridge(html, { capture, lector: "nvda" });
  assert.equal(out.lector, "nvda");
  const porLoc = {};
  out.results.forEach((r) => { porLoc[r.locator] = r.verdict; });
  assert.equal(out.summary.confirmado, 3, JSON.stringify(porLoc));
  assert.equal(out.summary["barrera-confirmada"], 1, "el icono sin nombre es barrera: " + JSON.stringify(porLoc));
});
