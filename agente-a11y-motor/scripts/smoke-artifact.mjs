#!/usr/bin/env node
/**
 * Humo del artifact: carga web/agente-a11y.html en un Chromium real y recorre el
 * flujo completo —pegar componente → Analizar → Verificar en el navegador—
 * comprobando que no hay errores de página y que la medición responde.
 *
 *   npm run smoke            (usa PW_CHROMIUM si está definida)
 *
 * Existe porque el artifact se GENERA: el motor y la capa de medición se inyectan
 * desde src/. `npm test` cubre la librería, pero solo esto prueba que el HTML
 * resultante sigue vivo y que las dos regiones generadas encajan con la UI.
 */
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { launchOptions } from "../src/playwright-launch.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASO = '<button style="color:#ccc;background:#fff">Contraste malo</button>'
  + '<button style="color:#000;background:#fff"><span style="color:#000">Bien</span></button>'
  + '<button disabled>Deshabilitado</button>'
  + '<div role="tablist"><button role="tab" tabindex="-1">Pestaña</button></div>'
  + '<div role="button" style="background:#fff">Falso botón</div>';

// La CSP del iframe de verificación bloquea scripts a propósito: ese mensaje no
// es un fallo del artifact, es la caja fuerte funcionando.
const RUIDO = /Blocked script execution|sandboxed/i;

const { chromium } = await import("playwright");
const html = await readFile(join(ROOT, "web", "agente-a11y.html"), "utf8");

/* Sin navegador, el humo NO pasa: se queja y se va con error.
 *
 * Tener `playwright` instalado no significa tener un Chromium descargado. Antes,
 * en una máquina sin él, esto reventaba con el volcado de pila de Playwright, y
 * un volcado de pila en el paso de «humo del artifact» se lee como que el
 * artifact está roto cuando lo que falta es el navegador.
 *
 * Y no se salta en silencio, que sería lo cómodo: el humo es la única prueba de
 * que el HTML generado sigue vivo, y un `npm run smoke` en verde sin haber
 * abierto nada es exactamente la clase de conformidad sin comprobar que este
 * motor existe para no firmar. */
let browser;
try {
  browser = await chromium.launch(launchOptions());
} catch (e) {
  console.error("✗ El humo no se ha podido ejecutar: no hay un Chromium que lanzar.");
  console.error("  " + String((e && e.message) || e).split("\n")[0]);
  console.error("  Instálalo con `npx playwright install chromium`, o apunta PW_CHROMIUM a uno ya descargado.");
  console.error("  No se marca como correcto: sin navegador, nadie ha comprobado el artifact.");
  process.exit(2);
}
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !RUIDO.test(m.text())) errs.push("console: " + m.text()); });

await page.setContent("<!doctype html><html lang=es><head><meta charset=utf-8></head><body>" + html + "</body></html>", { waitUntil: "load" });
await page.waitForTimeout(500);

await page.evaluate((c) => { const s = document.getElementById("src"); s.value = c; s.dispatchEvent(new Event("input", { bubbles: true })); }, CASO);
await page.click("#run");
await page.waitForTimeout(900);

const vb = await page.$("[data-verify]");
if (!vb) { console.error("✗ no aparece el botón «Verificar en el navegador» tras analizar"); process.exit(1); }
await vb.click();
await page.waitForTimeout(2500);
const panel = await page.evaluate(() => { const el = document.querySelector("#verify-panel"); return el ? el.innerText : ""; });
await browser.close();

const esperado = [
  [/deshabilitado: no debe recibir el foco/, "un control deshabilitado no debe fallar 2.1.1"],
  [/roving tabindex/, "un hijo de widget compuesto no debe fallar 2.1.1"],
  [/no recibe foco con Tab/, "un div sin tabindex sí debe fallar 2.1.1"],
  [/1\.4\.3[\s\S]*?rgb\(204 204 204\)/, "debe medir el contraste malo"],
  [/APCA Lc/, "debe informar de APCA"]
];
const fallos = esperado.filter(([re]) => !re.test(panel)).map(([, msg]) => msg);
if (errs.length) { console.error("✗ errores en la página:\n  " + errs.join("\n  ")); process.exit(1); }
if (fallos.length) { console.error("✗ la verificación no dice lo que debería:\n  - " + fallos.join("\n  - ") + "\n--- panel ---\n" + panel); process.exit(1); }
console.log("✓ Humo del artifact: carga sin errores, analiza y verifica (" + panel.split("\n").filter(Boolean).length + " líneas de medición).");
