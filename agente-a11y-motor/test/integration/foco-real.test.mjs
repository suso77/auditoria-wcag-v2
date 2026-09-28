import { test } from "node:test";
import assert from "node:assert/strict";
import { MEASURE_BODY, MEASURE_FNS } from "../../src/measure.browser.js";

/**
 * 2.4.7 con y sin el foco del sistema, en un Chromium de verdad.
 *
 * El caso que la suite pura no puede ver apareció auditando un sitio real desde
 * un panel de navegador: si el documento NO tiene el foco del sistema, `:focus`
 * no se aplica por mucho que `el.focus()` mueva `activeElement`, y la
 * comparación de estilos antes/después sale idéntica en TODOS los controles. En
 * la extensión pasaría siempre, porque el popup se queda con el foco.
 *
 * Aviso sobre el montaje: en Chromium headless NO se puede dejar una página sin
 * foco del sistema. Playwright emula el foco en todas las pestañas a propósito
 * (`Emulation.setFocusEmulationEnabled`), y desactivarlo y traer otra pestaña al
 * frente tampoco lo quita: se comprobó, `document.hasFocus()` sigue dando true.
 * Así que el único punto simulado aquí es `document.hasFocus`. Todo lo demás —
 * el CSSOM, el anidado de CSS, el escape de Tailwind en el nombre de clase, el
 * `matches`, el `getComputedStyle`— es del navegador, que es justo lo que un DOM
 * de mentira no puede comprobar.
 */

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  await b.close();
} catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador (npx playwright install chromium): " + why;

/**
 * Página de prueba con tres trampas reales dentro:
 *
 *  - `*:focus { outline: none }` — el borrador de indicadores más extendido que
 *    hay. Sirve además para apagar el anillo del navegador, que si no taparía
 *    todo lo demás.
 *  - `.focus\:bg-destacado:focus` — clase de Tailwind con los dos puntos dentro
 *    del NOMBRE, escapados. Y pinta el foco con `background-color`, que la
 *    medición de estilos no compara: sin la vía estática esto es invisible.
 *  - CSS anidado — en Chrome moderno una CSSStyleRule también tiene `cssRules`,
 *    y un recorrido ingenuo se saltaría en silencio todas las reglas normales.
 */
const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Foco</title>
<style>
  *:focus { outline: none; }
  .focus\\:bg-destacado:focus { background-color: #ffe08a; }
  .tarjeta { color: #222; }
  .tarjeta { & .interna { color: #333; } }
  .sin-nada { color: #222; }
</style></head><body>
<a href="#main" class="focus:bg-destacado">Saltar al contenido</a>
<button class="sin-nada">Enviar</button>
<main id="main"><p>Contenido</p></main>
</body></html>`;

const sinFoco = () => { document.hasFocus = () => false; };
const de = (res, crit) => res.filter((r) => r.crit === crit);
const por = (res, crit, frag) => de(res, crit).find((r) => r.node.indexOf(frag) !== -1);

async function abrir(b, stub) {
  const p = await b.newPage();
  await p.setContent(HTML);
  // Después del setContent, no antes: `setContent` abre un documento NUEVO y se
  // llevaría por delante la propiedad puesta con addInitScript.
  if (stub) await p.evaluate(sinFoco);
  return p;
}

test("foco real: el CSSOM del navegador se recorre entero (anidado y clases escapadas)", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b, false);
    const leer = new Function("sel", MEASURE_FNS + "\nreturn reglasDeFoco(document.querySelector(sel), document);");

    const enlace = await p.evaluate(leer, "a");
    assert.equal(enlace.conIndicador, 1, "la clase escapada de Tailwind tiene que coincidir: " + JSON.stringify(enlace));
    assert.match(enlace.ejemplos[0], /bg-destacado/);
    // `*:focus` también alcanza al enlace, pero `outline: none` no pinta nada.
    assert.equal(enlace.encontradas, 2, "encuentra las dos reglas; solo una pinta");

    const boton = await p.evaluate(leer, "button");
    assert.equal(boton.encontradas, 1, "solo le alcanza `*:focus`");
    assert.equal(boton.conIndicador, 0, "`outline: none` NO es un indicador de foco");
    assert.equal(boton.hojasBloqueadas, 0);
  } finally { await b.close(); }
});

test("foco real: con el documento enfocado manda la medición del render", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b, false);
    assert.equal(await p.evaluate(() => document.hasFocus()), true);

    const res = await p.evaluate(new Function("lim", MEASURE_BODY), 400);
    assert.equal(de(res, "__meta").filter((r) => /foco del sistema/i.test(r.label)).length, 0,
      "con foco no hay limitación que declarar");
    // El fondo amarillo del enlace no está entre las propiedades que compara la
    // medición, así que sobre el render no se ve cambio: queda a revisar. Es el
    // veredicto honesto, y el motivo de que exista la vía estática.
    assert.equal(por(res, "2.4.7", "a.").verdict, "revisar");
    assert.equal(por(res, "2.4.7", "button").verdict, "revisar");
  } finally { await b.close(); }
});

test("foco real: sin foco del sistema, 2.4.7 cae al CSS en vez de acusar a todos", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b, true);
    assert.equal(await p.evaluate(() => document.hasFocus()), false);

    // 2.1.1 no se ve afectado: `activeElement` se mueve igual.
    assert.ok(await p.evaluate(() => { const a = document.querySelector("a"); a.focus(); return document.activeElement === a; }));

    const res = await p.evaluate(new Function("lim", MEASURE_BODY), 400);
    assert.ok(de(res, "2.1.1").every((r) => r.verdict === "pasa"), "2.1.1 se sigue midiendo: " + JSON.stringify(de(res, "2.1.1")));

    const enlace = por(res, "2.4.7", "a.");
    assert.equal(enlace.verdict, "cumple-parcial", enlace.detail);
    assert.match(enlace.detail, /no tiene el foco del sistema/);
    assert.match(enlace.detail, /bg-destacado/, "cita la regla que encontró: " + enlace.detail);

    const boton = por(res, "2.4.7", "button");
    assert.equal(boton.verdict, "revisar", boton.detail);
    assert.match(boton.detail, /tampoco se ha encontrado ninguna regla/);

    const meta = de(res, "__meta").filter((r) => /foco del sistema/i.test(r.label));
    assert.equal(meta.length, 1, "la limitación tiene que constar en la cobertura");
    assert.match(meta[0].detail, /1 control\(es\) con regla de foco con indicador/);
    assert.match(meta[0].detail, /vuelve a analizar/);
  } finally { await b.close(); }
});
