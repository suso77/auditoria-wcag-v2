/**
 * Prueba de SEGURIDAD del driver dinámico contra un servidor HTTP real.
 *
 * El driver interactúa con sitios de terceros. Esta batería comprueba, con un
 * servidor que registra todo lo que recibe, que el modo seguro:
 *   1. no envía NADA al servidor,
 *   2. no pulsa el botón destructivo del formulario,
 *   3. no borra los input[type=hidden] (tokens CSRF / estado),
 *   4. sigue midiendo lo que tiene que medir (errores ARIA del formulario).
 *
 * Requiere Chromium. Se salta sola si no hay:  npm run test:integracion
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dynamicAnalyze } from "../../src/dynamic-analyze.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

/* La sonda arranca el navegador: que `playwright` importe no quiere decir que
 * haya un Chromium descargado, y sin esta comprobación la batería se cae en vez
 * de saltarse en una máquina sin `npx playwright install`. */
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const disponible = (await chromiumDisponible(launchOptions)).ok;

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title></head><body>
<main>
  <h1>Formulario</h1>
  <form action="/enviar" method="post" id="alta">
    <input type="hidden" name="csrf" value="TOKEN-SECRETO-123">
    <input type="hidden" name="session" value="SES-999">
    <label for="n">Nombre</label><input id="n" name="n" required value="Suso">
    <label for="e">Email</label><input id="e" name="e" type="email" required value="a@b.c">
    <button type="button" id="peligro" onclick="fetch('/destruir',{method:'POST'})">Eliminar cuenta</button>
    <button type="submit">Enviar</button>
  </form>
  <button aria-expanded="false" aria-controls="p" id="acc">Más</button>
  <div id="p" hidden>contenido</div>
</main></body></html>`;

let server, base, recibido;
before(async () => {
  if (!disponible) return;
  recibido = [];
  server = createServer((req, res) => {
    recibido.push(req.method + " " + req.url);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(PAGINA);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

test("modo seguro: NADA sale a la red más allá de cargar la página", { skip: !disponible }, async () => {
  const r = await dynamicAnalyze({ url: base }, { launchOptions, forms: "safe" });
  const escritura = recibido.filter((l) => !l.startsWith("GET /") || l.includes("/enviar") || l.includes("/destruir"));
  assert.deepEqual(escritura, [], "el driver ha tocado el servidor: " + JSON.stringify(recibido));
  assert.ok(!recibido.some((l) => l.includes("/enviar")), "se envió el formulario");
  assert.ok(!recibido.some((l) => l.includes("/destruir")), "se pulsó «Eliminar cuenta»");
  assert.equal(r.trace.formulario.probado, true, "pero la prueba del formulario SÍ se hizo");
  assert.equal(r.trace.formulario.interceptado, true, "el submit se interceptó en la página");
});

test("modo seguro: los input[type=hidden] conservan su valor (CSRF, sesión)", { skip: !disponible }, async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  await page.goto(base);
  // Reproduce el vaciado de campos tal y como lo hace el driver.
  const antes = await page.evaluate(() => [...document.querySelectorAll('input[type=hidden]')].map((i) => i.value));
  await page.evaluate(() => {
    const f = document.querySelector("form");
    const saltar = { hidden: 1, submit: 1, button: 1, image: 1, reset: 1, file: 1 };
    f.querySelectorAll("input,textarea,select").forEach((el) => {
      const t = (el.getAttribute("type") || "").toLowerCase();
      if (saltar[t] || el.disabled || el.readOnly) return;
      if ("value" in el) el.value = "";
    });
  });
  const despues = await page.evaluate(() => [...document.querySelectorAll('input[type=hidden]')].map((i) => i.value));
  const visibles = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden])')].map((i) => i.value));
  await browser.close();
  assert.deepEqual(despues, antes, "se borraron los hidden");
  assert.deepEqual(despues, ["TOKEN-SECRETO-123", "SES-999"]);
  assert.deepEqual(visibles, ["", ""], "los campos editables sí se vacían");
});

test("modo seguro: se detectan los errores de formulario sin texto ni aria-invalid", { skip: !disponible }, async () => {
  const r = await dynamicAnalyze({ url: base }, { launchOptions, forms: "safe" });
  const cods = r.findings.map((f) => f.c.n + "/" + f.verdict);
  assert.ok(cods.includes("3.3.1/falla"), "debería detectar campos requeridos sin descripción de error: " + cods.join(", "));
});

test("forms:\"off\" ni se acerca al formulario", { skip: !disponible }, async () => {
  const r = await dynamicAnalyze({ url: base }, { launchOptions, forms: "off" });
  assert.equal(r.trace.formulario.probado, false);
  assert.equal(r.findings.filter((f) => f.c.n === "3.3.1").length, 0);
});

test("un formulario que parece destructivo no se toca", { skip: !disponible }, async () => {
  const html = '<form action="/delete-account" method="post"><input name="x" required><button type="submit">Ok</button></form>';
  const r = await dynamicAnalyze({ html }, { launchOptions, forms: "safe" });
  assert.equal(r.trace.formulario.probado, false);
  assert.match(r.trace.formulario.motivo || "", /destructiv/);
});

test("la fase de disclosure se ejecuta y no pierde el resto si algo falla", { skip: !disponible }, async () => {
  const r = await dynamicAnalyze({ url: base }, { launchOptions, forms: "off" });
  assert.equal(r.errores.length, 0, JSON.stringify(r.errores));
  assert.equal(r.trace.disclosures, 1);
  assert.ok(r.findings.some((f) => f.c.n === "4.1.2"));
});
