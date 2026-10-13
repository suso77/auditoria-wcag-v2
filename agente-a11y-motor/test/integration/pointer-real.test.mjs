/**
 * Los cuatro criterios de puntero contra un Chromium real.
 *
 * El censo sale del registro de oyentes del propio navegador
 * (`getEventListeners` del protocolo de depuración), no de leer los scripts.
 * Esta prueba es la que comprueba que ese dato llega de verdad: el analizador
 * puro ya tiene los suyos, pero un analizador perfecto alimentado con un censo
 * vacío no dice nada útil, y eso es justo lo que no se puede ver sin navegador.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { censoDeOyentes, analizaPuntero } from "../../src/pointer.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Puntero</title></head><body>
<h1>Casos de puntero</h1>
<div id="mapa">Mapa con gestos</div>
<button id="malo">Se activa al pulsar</button>
<button id="bueno">Se activa al soltar</button>
<button id="normal">Botón corriente</button>
<div id="arrastrable" draggable="true">Arrastrable</div>
<div id="conPuntero">Arrastrar con puntero</div>
<p id="enLinea" onmousedown="nada()">Manejador en línea</p>
<script>
 function nada(){}
 var m = document.getElementById('mapa');
 m.addEventListener('touchstart', nada); m.addEventListener('touchmove', nada);
 document.getElementById('malo').addEventListener('mousedown', nada);
 var b = document.getElementById('bueno');
 b.addEventListener('mousedown', nada); b.addEventListener('mouseup', nada);
 document.getElementById('normal').addEventListener('click', nada);
 var s = document.getElementById('conPuntero');
 s.addEventListener('pointerdown', nada); s.addEventListener('pointermove', nada); s.addEventListener('pointerup', nada);
 window.addEventListener('devicemotion', nada);
</script></body></html>`;

const LIMPIA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Limpia</title></head><body>
<h1>Sin nada de puntero</h1><p>Solo texto.</p><a href="/x">Un enlace</a><button>Un botón</button></body></html>`;

let server, base, browser, page;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => {
    r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    r.end(req.url.indexOf("limpia") !== -1 ? LIMPIA : PAGINA);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  page = await browser.newPage();
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const de = (fs, n) => fs.find((f) => f.c.n === n);

test("el censo sale del navegador y trae los oyentes de verdad", { skip }, async () => {
  await page.goto(base, { waitUntil: "load" });
  const censo = await censoDeOyentes(page);
  assert.equal(censo.disponible, true, censo.motivo || "");
  assert.ok(censo.examinados >= 8, "tiene que recorrer el documento entero: " + censo.examinados);
  const porLoc = {};
  censo.nodos.forEach((n) => { porLoc[n.loc] = n.tipos; });
  assert.deepEqual(porLoc["div#mapa"].sort(), ["touchmove", "touchstart"]);
  assert.deepEqual(porLoc["button#bueno"].sort(), ["mousedown", "mouseup"]);
  // Los manejadores EN LÍNEA también están: si no, 2.5.2 se perdería un
  // `onmousedown` escrito en el atributo, que es de lo más común que hay.
  assert.deepEqual(porLoc["p#enLinea"], ["mousedown"]);
  // Y el movimiento del dispositivo, que vive en window.
  assert.ok(censo.globales.some((g) => g.que === "window" && g.tipos.includes("devicemotion")));
});

test("sobre esa página, los cuatro criterios traen expediente", { skip }, async () => {
  await page.goto(base, { waitUntil: "load" });
  const out = analizaPuntero(await censoDeOyentes(page));

  assert.equal(de(out, "2.5.1").verdict, "humano");
  assert.match(de(out, "2.5.1").evid[0], /div#mapa/);

  assert.equal(de(out, "2.5.2").verdict, "humano");
  const e252 = de(out, "2.5.2").evid[0];
  assert.match(e252, /button#malo/);
  assert.match(e252, /p#enLinea/);
  assert.ok(!/button#bueno/.test(e252), "el que escucha la subida no se acusa");
  assert.ok(!/button#normal/.test(e252), "un botón con `click` tampoco");

  assert.equal(de(out, "2.5.4").verdict, "humano");
  assert.match(de(out, "2.5.4").evid[0], /devicemotion/);

  assert.equal(de(out, "2.5.7").verdict, "humano");
  assert.match(de(out, "2.5.7").evid[0], /div#arrastrable|div#conPuntero/);
});

test("sobre una página sin nada de puntero, ninguno se cierra pero todos hablan", { skip }, async () => {
  await page.goto(base + "limpia", { waitUntil: "load" });
  const censo = await censoDeOyentes(page);
  const out = analizaPuntero(censo);
  assert.equal(out.length, 4);
  out.forEach((f) => {
    assert.equal(f.verdict, "cumple-parcial", f.c.n + " no puede cerrarse: " + f.evid.join(" "));
    assert.match(f.evid.join(" "), /recorrido los \d+ elemento/);
  });
});

test("integrado: los cuatro llegan al informe de la página", { skip }, async () => {
  const { auditRun } = await import("../../src/audit-run.js");
  const r = await auditRun({ url: base }, { waitMs: 100, capas: { viewport: false, pixeles: false, axe: false } });
  ["2.5.1", "2.5.2", "2.5.4", "2.5.7"].forEach((n) => {
    const f = r.findings.filter((x) => x.c.n === n && x.origen === "puntero");
    assert.equal(f.length, 1, n + " tiene que llegar al informe una vez");
    assert.equal(f[0].verdict, "humano", n + ": " + f[0].evid.join(" "));
  });
  // Y el relleno del motor se ha retirado, que para eso habló la capa.
  ["2.5.1", "2.5.2", "2.5.4", "2.5.7"].forEach((n) => {
    assert.ok(!r.findings.some((x) => x.c.n === n && x.origen === "motor-sin-capa"), n + " conserva el relleno");
  });
});
