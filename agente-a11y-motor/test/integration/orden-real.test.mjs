/**
 * 1.3.2 Secuencia significativa contra un Chromium real.
 *
 * Aquí el que resuelve `order`, `row-reverse` y la rejilla es el motor de
 * estilos del navegador, que es quien manda: la suite pura prueba la lógica con
 * cajas puestas a mano, y lo que esto comprueba es que sobre una página de
 * verdad el orden medido es el que se ve.
 *
 * El caso de partida: tres pasos de una receta reordenados con `order` —en el
 * código 1, 2, 3; en pantalla 3, 2, 1—. Quien lo oye con un lector de pantalla
 * recibe las instrucciones en el orden contrario al que lee quien mira. Medido
 * antes de esto, el agente daba 1.3.2 `humano` con una pregunta genérica y sin
 * un solo dato, porque el cuaderno de juicio decía —y era falso— que «el agente
 * no ve el orden visual».
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { MEASURE_BODY } from "../../src/measure.browser.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Secuencia</title><style>
  body { margin:0; padding:24px; font:16px/1.5 system-ui, sans-serif; }
  /* Lo que SÍ reordena: el CSS lo declara y se ve al revés. */
  #pasos { display:flex; flex-direction:column; }
  #pasos .p1 { order:3 } #pasos .p2 { order:2 } #pasos .p3 { order:1 }
  #fila { display:flex; flex-direction:row-reverse; gap:12px }
  #envuelta { display:flex; flex-wrap:wrap-reverse; width:220px; gap:8px }
  #envuelta div { width:100px }
  /* Lo que NO: una rejilla de tres columnas, en su orden, y una fila normal. */
  #rejilla { display:grid; grid-template-columns:repeat(3,1fr); gap:12px }
  #normal  { display:flex; gap:12px }
  .caja { border:1px solid #333; padding:8px }
</style></head><body>
<main>
  <div id="pasos">
    <p class="p1">Paso 1 precalentar</p>
    <p class="p2">Paso 2 mezclar</p>
    <p class="p3">Paso 3 hornear</p>
  </div>
  <div id="fila"><div class="caja">Fila uno</div><div class="caja">Fila dos</div><div class="caja">Fila tres</div></div>
  <div id="envuelta"><div class="caja">Env uno</div><div class="caja">Env dos</div><div class="caja">Env tres</div></div>
  <div id="rejilla"><div class="caja">Rej uno</div><div class="caja">Rej dos</div><div class="caja">Rej tres</div></div>
  <div id="normal"><div class="caja">Nor uno</div><div class="caja">Nor dos</div></div>
</main>
</body></html>`;

let server, browser, res;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto("http://127.0.0.1:" + server.address().port + "/", { waitUntil: "load" });
  const todo = await page.evaluate(new Function("lim", MEASURE_BODY), 400);
  res = todo.filter((x) => x.crit === "1.3.2");
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const de = (id) => res.find((r) => String(r.node || "").indexOf("#" + id) !== -1);

test("1.3.2 real: los tres pasos reordenados con `order` salen con los dos órdenes", { skip }, () => {
  const f = de("pasos");
  assert.ok(f, "1.3.2 no dijo nada del contenedor reordenado: " + JSON.stringify(res.map((r) => r.node)));
  assert.equal(f.verdict, "revisar", f.detail);
  assert.match(f.detail, /`order`/, f.detail);
  const partes = f.detail.split("Orden visual");
  assert.match(partes[0], /Paso 1[\s\S]*Paso 2[\s\S]*Paso 3/, "el orden del código: " + partes[0]);
  assert.match(partes[1], /Paso 3[\s\S]*Paso 2[\s\S]*Paso 1/, "y el visual, al revés: " + partes[1]);
});

test("1.3.2 real: `row-reverse` y `wrap-reverse` también se ven", { skip }, () => {
  const fila = de("fila");
  assert.ok(fila, "falta la fila invertida");
  assert.match(fila.detail, /row-reverse/, fila.detail);
  const env = de("envuelta");
  assert.ok(env, "falta la envuelta al revés: " + JSON.stringify(res.map((r) => r.node)));
  assert.match(env.detail, /wrap-reverse/, env.detail);
});

test("1.3.2 real: una rejilla en su orden y una fila normal NO se acusan", { skip }, () => {
  assert.equal(de("rejilla"), undefined, "tres columnas en su orden no son una reordenación");
  assert.equal(de("normal"), undefined, "una fila normal tampoco");
});

test("1.3.2 real: la evidencia no lleva corchetes angulares (viaja a informes HTML)", { skip }, () => {
  res.forEach((f) => assert.ok(!/<[a-z]/i.test(f.detail), "marcado suelto en la evidencia: " + f.detail));
});
