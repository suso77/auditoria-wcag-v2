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

/* ── 2.5.3: por qué de este criterio habla el motor y no axe ─────────────────
 *
 * Esto no es un test de axe: es la prueba que sostiene una decisión. La regla
 * `label-content-name-mismatch` cubre 2.5.3, lleva la etiqueta `wcag21a` y está
 * dentro del filtro del agente, pero no corre porque axe desactiva las reglas
 * experimentales. Antes de habilitarla se midió lo que acusa, y lo que acusa
 * incluye un falso positivo. Como las barreras que solo ve axe ENTRAN al
 * informe, habilitarla metería ese falso positivo en un entregable legal.
 */
const OCHO_CASOS = '<button type="button" aria-label="Submit form">Enviar</button>' +
  '<a href="/producto" aria-label="Read more">Leer más</a>' +
  '<input type="submit" value="Guardar" aria-label="Save changes">' +
  '<button type="button" aria-label="Enviar el formulario de contacto">Enviar</button>' +
  '<button type="button" aria-label="Buscar"><i class="material-icons">search</i></button>' +
  '<button type="button" aria-label="Cerrar">x</button>' +
  '<a href="/servicio" aria-label="Mas informacion sobre el servicio">Más información</a>' +
  '<button type="button">Enviar</button>';

test("axe real: con la configuración del agente, axe no dice nada de 2.5.3", { skip }, async () => {
  const violations = await runAxeWithPlaywright(OCHO_CASOS);
  assert.ok(!violations.some((v) => v.id === "label-content-name-mismatch"),
    "la regla es experimental y tiene que seguir fuera: " + violations.map((v) => v.id).join(", "));
  // Y el criterio no se queda sin fuente: de él habla el motor.
  const out = await crossCheck(OCHO_CASOS, { runAxe: runAxeWithPlaywright });
  const f = out.engine.findings.find((x) => x.c.n === "2.5.3");
  assert.equal(f.verdict, "falla", "el motor sí denuncia el desajuste: " + JSON.stringify(f.evid).slice(0, 160));
});

test("axe real: y si se habilitara, metería un falso positivo y se le escaparía una barrera", { skip }, async () => {
  /* Medido con axe 4.13 sobre los ocho casos, habilitando la regla a mano. Si
   * alguna versión de axe arregla las dos cosas, este test se pondrá en rojo y
   * entonces habrá que volver a plantearse la decisión — que es justo para lo
   * que está. */
  const { chromium } = await import("playwright");
  const { createRequire } = await import("module");
  const { launchOptions } = await import("../../src/playwright-launch.js");
  const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  const browser = await chromium.launch(launchOptions());
  let nodos = [];
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + OCHO_CASOS + "</body></html>", { waitUntil: "load" });
    await page.addScriptTag({ path: axePath });
    nodos = await page.evaluate(() => window.axe.run(document.body, {
      resultTypes: ["violations"],
      runOnly: { type: "rule", values: ["label-content-name-mismatch"] }
    }).then((r) => (r.violations[0] ? r.violations[0].nodes.map((n) => n.html) : [])));
  } finally { await browser.close(); }

  const hay = (re) => nodos.some((h) => re.test(h));
  // El falso positivo: el icono de fuente. Se ve una lupa, no la palabra.
  assert.ok(hay(/material-icons/), "axe sigue acusando el icono de fuente (falso positivo): " + nodos.join(" | "));
  // Y la barrera que se le escapa: el botón de un <input>, cuyo texto es su `value`.
  assert.ok(!hay(/type="submit"/), "axe sigue sin ver el input submit: " + nodos.join(" | "));
  // Lo que sí ve y está bien visto.
  assert.ok(hay(/Submit form/) && hay(/Read more/), nodos.join(" | "));
  // La «x» del botón de cerrar no la acusa, y el motor tampoco: ahí coinciden.
  assert.ok(!hay(/aria-label="Cerrar"/), nodos.join(" | "));
});

test("axe real: el motor no se inventa un 2.5.3 donde el nombre sí contiene lo que se ve", { skip }, async () => {
  const bien = '<button aria-label="Enviar el formulario">Enviar</button>' +
    '<button type="button" aria-label="Buscar"><i class="material-icons">search</i></button>';
  const out = await crossCheck(bien, { runAxe: runAxeWithPlaywright });
  const f = out.engine.findings.find((x) => x.c.n === "2.5.3");
  assert.notEqual(f.verdict, "falla", "ni el nombre que añade ni el icono de fuente son barrera: " + JSON.stringify(f.evid).slice(0, 160));
  assert.ok(!out.axeViolations.some((x) => x.id === "label-content-name-mismatch"));
});
