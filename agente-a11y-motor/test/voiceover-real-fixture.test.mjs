import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compareAnnouncement, bridge, sesionUtil, clasificaFrases, segmentaFrase } from "../src/guidepup-bridge.js";
import { stripReaderNoise, spokenHasRole, esRuidoDeEscritorio } from "../src/reader-lexicon.js";
import "./helpers.mjs"; // inyecta el DOMParser

/**
 * El léxico del lector, contra frases REALES de VoiceOver.
 *
 * Hasta ahora la comparación se probaba con frases escritas por nosotros, que es
 * exactamente como se cuelan los supuestos. Este fixture son capturas de verdad
 * de una sesión de VoiceOver en español sobre WebKit
 * (`voiceover-verificacion-real/transcripts/`), copiadas tal cual.
 *
 * Lo que enseñan y no habríamos adivinado:
 *
 *  - VoiceOver en español dice el rol en INGLÉS delante del nombre: «link Saltar
 *    al contenido», no «Saltar al contenido, enlace».
 *  - Detrás va un párrafo de ayuda («Estás en un elemento de tipo…, Para hacer
 *    clic…, pulsa Control-Opción-Espacio») que hay que recortar antes de buscar
 *    el nombre.
 *  - Y lo más peligroso: `lastSpokenPhrase()` arrastra el ESCRITORIO entero
 *    cuando el navegador pierde el primer plano — el Finder, el Terminal, otra
 *    ventana de Chrome.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(aqui, "fixtures", "voiceover-es-real.json"), "utf8"));

const CON_AYUDA = FIXTURE.spokenPhraseLog[0];   // «link Saltar al contenido. Estás en…»
const LIMPIA = FIXTURE.spokenPhraseLog[1];      // «link Saltar al contenido»
const ESCRITORIO = FIXTURE.spokenPhraseLog[2];  // Finder + Terminal + Chrome + Ajustes

test("el fixture es el que creemos (si cambia, los tests de abajo no dicen nada)", () => {
  assert.equal(FIXTURE.navegador, "webkit");
  assert.equal(FIXTURE.spokenPhraseLog.length, 3);
  assert.match(CON_AYUDA, /^link Saltar al contenido\./);
  assert.match(ESCRITORIO, /no tiene ventanas/);
});

test("el rol en inglés delante del nombre se reconoce igual", () => {
  // «link Saltar al contenido» — un lector en español diciendo el rol en inglés.
  assert.equal(spokenHasRole(LIMPIA, "link"), true);
  assert.equal(spokenHasRole(LIMPIA, "button"), false);
});

test("el párrafo de ayuda de VoiceOver se recorta entero", () => {
  assert.equal(stripReaderNoise(CON_AYUDA), "link Saltar al contenido.");
  assert.ok(!/Control-Opci[oó]n/.test(stripReaderNoise(CON_AYUDA)), "no debería quedar ni un atajo de teclado");
});

test("un enlace bien nombrado se confirma sobre la frase real", () => {
  const r = compareAnnouncement({ name: "Saltar al contenido", role: "link" }, CON_AYUDA);
  assert.equal(r.verdict, "confirmado");
  assert.equal(r.nameFound, true);
  assert.equal(r.roleFound, true);
});

test("si el motor predijo OTRO nombre, la frase real lo desmiente", () => {
  const r = compareAnnouncement({ name: "Ir al menú", role: "link" }, CON_AYUDA);
  assert.equal(r.verdict, "divergente");
});

/* ── El ruido del escritorio, que es lo que absolvía barreras reales ─────── */

test("una frase del escritorio se reconoce como tal", () => {
  assert.equal(esRuidoDeEscritorio(ESCRITORIO), true);
  assert.equal(esRuidoDeEscritorio(CON_AYUDA), false, "esta SÍ es de la página");
  assert.equal(esRuidoDeEscritorio(LIMPIA), false);
  assert.equal(esRuidoDeEscritorio(""), false, "vacío no es ruido: es que no se capturó nada");
});

test("regresión: el ruido del escritorio NO absuelve un 4.1.2 real", () => {
  // El motor predice un control sin nombre accesible. Si la captura trae el
  // escritorio, las palabras del Finder y del Terminal sobreviven al recorte y
  // la comparación las tomaba por el nombre del control: «el lector sí pronuncia
  // un nombre», y la barrera quedaba absuelta por ruido.
  const r = compareAnnouncement({ name: "", role: "button" }, ESCRITORIO);
  assert.equal(r.verdict, "sin-captura", r.note);
  assert.match(r.note, /escritorio/);
  assert.match(r.note, /primer plano/, "y dice cómo repetirlo bien");
});

test("una captura vacía tampoco es una divergencia: es que no hay evidencia", () => {
  const r = compareAnnouncement({ name: "Enviar", role: "button" }, "");
  assert.equal(r.verdict, "sin-captura");
  assert.match(r.note, /ni a favor ni en contra/);
});

/* ── El puente entero sobre la transcripción real ────────────────────────── */

test("el puente, alimentado con la transcripción real, confirma el enlace", async () => {
  const html = '<a href="#contenido" class="skip-link">Saltar al contenido</a>';
  const out = await bridge(html, {
    capture: async () => FIXTURE.spokenPhraseLog.map((s, i) => ({ step: i, spoken: s }))
  });
  const enlace = out.results[0];
  assert.equal(enlace.verdict, "confirmado", JSON.stringify(enlace));
});

test("el puente no le pone a un control el nombre de una ventana del Finder", () => {
  // Solo hay ruido de escritorio en la captura: el nodo tiene que quedarse sin
  // emparejar, no emparejado con la ventana del Terminal.
  return bridge('<button></button>', { capture: async () => [{ step: 0, spoken: ESCRITORIO }] })
    .then((out) => {
      const r = out.results[0];
      assert.ok(r.verdict === "no-encontrado" || r.verdict === "sin-captura",
        "debería quedarse sin evidencia, y salió «" + r.verdict + "»: " + r.note);
      assert.ok(!/finder|terminal|chrome/i.test(r.note || ""), "y desde luego sin inventarle un nombre");
    });
});

test("el recuento del puente cuenta también las capturas inservibles", async () => {
  const out = await bridge('<button></button><a href="/x">Inicio</a>', {
    capture: async () => [{ step: 0, spoken: ESCRITORIO }]
  });
  assert.ok("sin-captura" in out.summary, "el resumen tiene que contemplar «sin-captura»");
  const total = Object.values(out.summary).reduce((a, b) => a + b, 0);
  assert.equal(total, out.results.length, "ningún veredicto se queda fuera del recuento");
});

/* ── El resumen de la SESIÓN ──
 *
 * Faltaba, y se notó el día que la prueba con VoiceOver real se ejecutó por
 * primera vez: 103 segundos y un fallo que decía «el icono sin nombre debería
 * confirmarse», el mismo mensaje tanto si el lector habló y dijo otra cosa
 * —defecto del léxico— como si no llegó a leer la página —el entorno—. Son
 * conclusiones opuestas y el rojo no las distinguía.
 */

/* La página de la que salió este fixture: el componente de prueba del
 * verificador. El fixture es de abril y se guardó antes de que el puente anotara
 * el HTML servido, así que el test lo aporta — no es una captura inventada, es
 * decirle a la función de qué página eran esas frases. */
const PAGINA_DEL_FIXTURE = '<button><svg></svg></button><button>Enviar formulario</button>' +
  '<a href="#contenido">Saltar al contenido</a>' +
  '<main id="contenido"><h1>Verificación con lector real</h1><p>Fin del recorrido.</p></main>';

test("una sesión que solo capturó el escritorio se declara NULA, no divergente", () => {
  const s = sesionUtil([ESCRITORIO], "voiceover", PAGINA_DEL_FIXTURE, []);
  assert.equal(s.ok, false);
  assert.equal(s.dePagina, 0);
  assert.match(s.motivo, /NO dice nada sobre el componente/);
});

test("una sesión con frases de la página es útil, aunque arrastre ruido", () => {
  const s = sesionUtil(FIXTURE.spokenPhraseLog, "voiceover", PAGINA_DEL_FIXTURE, []);
  assert.equal(s.ok, true, s.motivo);
  assert.ok(s.dePagina >= 2, "las dos de «Saltar al contenido» son de la página: " + s.motivo);
  assert.ok(s.ruido >= 1, "y el pegote del escritorio se descarta: " + s.motivo);
});

test("sin una sola frase, o con todas vacías, la sesión tampoco verifica nada", () => {
  assert.equal(sesionUtil([], "voiceover", PAGINA_DEL_FIXTURE, []).ok, false);
  assert.match(sesionUtil([], "voiceover", PAGINA_DEL_FIXTURE, []).motivo, /ni un enunciado/);
  assert.equal(sesionUtil(["", "   "], "voiceover", PAGINA_DEL_FIXTURE, []).ok, false);
});

test("sesionUtil acepta las dos formas en que viajan las frases", () => {
  // `verifyWithScreenReader` devuelve [{step, spoken}]; los fixtures, cadenas.
  const comoObjetos = FIXTURE.spokenPhraseLog.map((spoken, step) => ({ step, spoken }));
  assert.deepEqual(sesionUtil(comoObjetos, "voiceover", PAGINA_DEL_FIXTURE, []),
    sesionUtil(FIXTURE.spokenPhraseLog, "voiceover", PAGINA_DEL_FIXTURE, []));
});

test("sin el HTML servido, la sesión no finge haber comparado con la página", () => {
  /* Las transcripciones antiguas no lo llevan. La prueba fuerte no se puede
   * hacer, y hacer como si se hubiera hecho es el defecto que este proyecto
   * persigue: se dice que no hay con qué comparar. */
  const s = sesionUtil(FIXTURE.spokenPhraseLog, "voiceover", "", []);
  assert.equal(s.ok, false);
  assert.match(s.motivo, /No se guardó el HTML servido/);
  assert.match(s.motivo, /queda sin decidir/);
});

test("y el puente lo publica junto al resumen de nodos", async () => {
  const out = await bridge('<button>Enviar formulario</button>', {
    lector: "voiceover",
    // Capturado EN VIVO sobre macOS 26.5.1: VoiceOver en español dice el nombre
    // primero y el rol detrás, al revés que el «link Saltar al contenido» de
    // abril, que lo decía delante y en inglés. Las dos formas se resuelven.
    capture: () => [{ step: 0, spoken: "Enviar formulario, botón" }]
  });
  assert.equal(out.sesion.ok, true);
  assert.equal(out.summary.confirmado, 1, JSON.stringify(out.results));
});

/* ── La sesión que leyó OTRA VENTANA (v0.68.0) ───────────────────────────────
 *
 * Fixture nuevo: `voiceover-es-otra-ventana.json`, enunciados tal cual los dijo
 * VoiceOver en una sesión real de este Mac. Lo que enseña es el defecto:
 *
 *   · la sesión capturó la ventana de la aplicación desde la que se lanzó la
 *     prueba —«Nueva pestaña botón», «Detener respuesta botón»—;
 *   · el puente la bendecía como página porque `esRuidoDeEscritorio` devolvía
 *     `false` a todo lo que dijera «dentro del contenido web», y una app de
 *     Electron lo dice;
 *   · y el informe firmó `divergente` ×3: tres acusaciones sobre la página
 *     hechas con frases que no eran de la página.
 *
 * Releída con el arreglo, la misma captura da 2 `confirmado` y 2
 * `no-encontrado`, que es lo que de verdad se puede decir.
 */
const OTRA = JSON.parse(readFileSync(join(aqui, "fixtures", "voiceover-es-otra-ventana.json"), "utf8"));

test("otra ventana: los enunciados ajenos NO cuentan como página", () => {
  const cl = clasificaFrases(
    OTRA.dePagina.concat(OTRA.deOtraVentana).map((spoken, step) => ({ step, spoken })),
    OTRA.html, [], "voiceover");
  const clase = (t) => (cl.find((x) => x.texto === t) || {}).clase;
  // De la página, por compartir parejas de palabras con lo servido.
  assert.equal(clase("nivel de encabezamiento 1 Verificación con lector real"), "pagina");
  /* «Fin del recorrido» se queda en `sinDatos` y está bien: con UNA sola palabra
   * distintiva no se puede afirmar de qué ventana viene —otra podría decir
   * «recorrido» igual—, y la señal fuerte son las parejas de palabras. Lo que no
   * puede pasar es que se clasifique como ajena, porque entonces se perdería. */
  assert.notEqual(clase("Fin del recorrido"), "ajena");
  // De otra ventana: ni el cromo del navegador ni la app de al lado.
  assert.equal(clase("Volver a cargar esta página botón."), "ajena");
  assert.equal(clase("Visión general de pestañas botón. botón."), "ajena");
  assert.equal(clase("Bienvenido a macOS"), "ajena");
  assert.equal(clase("Detener respuesta botón principal"), "ajena");
});

test("otra ventana: «contenido web» ya no basta para pasar por página", () => {
  /* La línea exacta que abrió la puerta: `if (/dentro del contenido web/i)
   * return false`. Una app de Electron también es contenido web. */
  const frase = "Agente de accesibilidad con IA dentro del contenido web. Detener respuesta botón";
  const cl = clasificaFrases([{ step: 0, spoken: frase }], OTRA.html, [], "voiceover");
  assert.ok(cl.every((x) => x.clase !== "pagina"), JSON.stringify(cl.map((x) => [x.clase, x.texto])));
});

test("otra ventana: ningún veredicto se apoya en una frase ajena", async () => {
  /* El arreglo que de verdad importa: al emparejar solo se usan los enunciados
   * de la página, así que una frase de otra ventana no puede firmar nada. */
  const out = await bridge(OTRA.html, {
    lector: "voiceover",
    capture: async () => OTRA.dePagina.concat(OTRA.deOtraVentana).map((spoken, step) => ({ step, spoken }))
  });
  assert.equal(out.summary.divergente, 0,
    "ninguna divergencia puede salir de esta captura: " +
    JSON.stringify(out.results.map((r) => [r.verdict, r.spoken])));
  // Y lo que sí leyó de la página se confirma.
  assert.ok(out.results.some((r) => r.locator === "h1" && r.verdict === "confirmado"),
    JSON.stringify(out.results.map((r) => [r.locator, r.verdict])));
  // La sesión vale, pero avisa de que casi todo lo oído era de otra ventana.
  assert.equal(out.sesion.ok, true, out.sesion.motivo);
  assert.match(out.sesion.aviso || "", /OTRA VENTANA/);
});

test("otra ventana: un enunciado sin dato no puede CONTRADECIR una predicción", () => {
  /* «Nueva pestaña botón» es el botón de nueva pestaña del navegador. Contra el
   * botón de icono del componente firmaba `divergente`, que es una acusación. */
  const r = compareAnnouncement({ name: "", role: "button" }, "Nueva pestaña botón", "voiceover");
  // La comparación cruda sigue diciendo lo suyo; lo que cambia es que el puente
  // no la deja pasar como divergencia cuando la frase no es de la página.
  assert.ok(["divergente", "parcial", "confirmado"].includes(r.verdict), r.verdict);
});

test("otra ventana: VoiceOver dice «encabezamiento», y eso es el rol", () => {
  /* No estaba en el léxico: con la transcripción real delante, el `h1` salía
   * `parcial` por «no se reconoce el rol» teniendo el rol dicho con todas las
   * letras. El léxico se alimenta de lo que los lectores dicen. */
  assert.equal(spokenHasRole("nivel de encabezamiento 1 Verificación con lector real", "heading"), true);
});
