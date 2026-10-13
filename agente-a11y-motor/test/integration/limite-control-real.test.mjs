/**
 * 1.4.11, el límite del control, contra un Chromium real.
 *
 * Por qué hace falta un navegador y no basta la suite pura: el fallo vivía en
 * cómo se LEE el estilo. `boundaryContrastOf` solo miraba `background-color`, y
 * un control delimitado por su borde no tiene nada que medir ahí. En la suite
 * pura el `getComputedStyle` es de mentira: devuelve lo que el test le pone, así
 * que la abreviatura `border: 2px solid #f0f0f0` solo se desglosa por lados
 * —`borderTopWidth`, `borderTopStyle`, `borderTopColor`…— si el test se acuerda
 * de desglosarla. Aquí la desglosa el navegador, que es quien manda, y los
 * colores llegan en el formato que él decide. Esto es lo que prueba que el
 * arreglo funciona sobre una página de verdad.
 *
 * Cada caso lleva la respuesta correcta sabida de antemano.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { MEASURE_BODY } from "../../src/measure.browser.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Límite del control</title><style>
  body { margin:0; padding:24px; background:#fff; color:#111; font:16px/1.5 system-ui, sans-serif; }
  .ctrl { display:inline-block; padding:8px 14px; margin:6px; }
  /* El «ghost button»: relleno igual que la página y borde casi invisible.
     Relleno 1:1 contra el fondo, borde a 1.14:1. El caso que no emitía nada. */
  #fantasma { background:#fff; border:2px solid #f0f0f0; }
  /* El mismo patrón, bien hecho: el borde separa de sobra. */
  #solido   { background:#fff; border:2px solid #333; }
  /* El relleno separa y el borde es flojo: manda el relleno. */
  #relleno  { background:#111; color:#fff; border:1px solid #fafafa; }
  /* Ancho declarado pero estilo «none»: el navegador calcula ancho 0, y aunque
     no lo hiciera, un borde «none» no se pinta. */
  #fingido  { background:#fff; border-width:4px; border-style:none; border-color:#000; }
  /* Ni relleno ni borde, con texto: 1.4.11 no le exige límite. */
  #texto    { background:transparent; border:0; }
  /* Ni relleno ni borde ni texto: lo único que lo identificaría es una forma. */
  #mudo     { background:transparent; border:0; width:120px; height:24px; }
  /* Borde solo por un lado: también es un límite, y hay que decir por dónde. */
  #unlado   { background:#fff; border:0; border-bottom:3px solid #767676; }
</style></head><body>
<main>
  <h1>Contraste no textual</h1>
  <div class="ctrl" id="fantasma" role="button" tabindex="0">Borde casi invisible</div>
  <div class="ctrl" id="solido"   role="button" tabindex="0">Borde con contraste</div>
  <div class="ctrl" id="relleno"  role="button" tabindex="0">Relleno oscuro</div>
  <div class="ctrl" id="fingido"  role="button" tabindex="0">Borde fingido</div>
  <div class="ctrl" id="texto"    role="button" tabindex="0">Solo texto</div>
  <div class="ctrl" id="mudo"     role="slider" tabindex="0" aria-label="Volumen"></div>
  <div class="ctrl" id="unlado"   role="textbox" tabindex="0">Campo con subrayado</div>
  <button class="ctrl" id="nativo">Botón nativo</button>
</main>
</body></html>`;

let server, browser, res;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.goto("http://127.0.0.1:" + server.address().port + "/", { waitUntil: "load" });
  const todo = await page.evaluate(new Function("lim", MEASURE_BODY), 400);
  res = todo.filter((r) => r.crit === "1.4.11");
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const uno = (id) => res.find((r) => String(r.node || "").indexOf("#" + id) !== -1);

test("regresión: el «ghost button» ya no se queda en silencio — se mide su BORDE", { skip }, () => {
  const f = uno("fantasma");
  assert.ok(f, "1.4.11 no dijo NADA del control delimitado por su borde: " + JSON.stringify(res.map((r) => r.node)));
  assert.equal(f.verdict, "revisar", f.detail);
  assert.match(f.detail, /por su borde 2 px/, f.detail);
  // #f0f0f0 sobre #fff son 1.14:1 — calculado a mano con la fórmula de WCAG.
  assert.match(f.detail, /1\.1[0-9]:1/, f.detail);
  assert.match(f.detail, /No sale como falla/, "y la ficha dice por qué no es una barrera");
});

test("un borde que contrasta sale como cumple-parcial, NUNCA como pasa", { skip }, () => {
  // 1.4.11 cubre además los objetos gráficos y los ESTADOS del control, que
  // esto no mide: firmar `pasa` sería declarar conforme lo que no se ha visto.
  const f = uno("solido");
  assert.ok(f, "sin hallazgo");
  assert.equal(f.verdict, "cumple-parcial", f.detail);
  assert.match(f.detail, /1[0-9]\.[0-9]+:1/, "#333 sobre #fff son 12.63:1 — " + f.detail);
  assert.match(f.detail, /sin medir los iconos/);
});

test("manda lo que más distingue el control: el relleno oscuro tapa al borde flojo", { skip }, () => {
  const f = uno("relleno");
  assert.ok(f, "sin hallazgo");
  assert.match(f.detail, /por su relleno/, f.detail);
  assert.equal(f.verdict, "cumple-parcial", f.detail);
});

test("un borde con ancho pero estilo `none` no cuenta como límite", { skip }, () => {
  const f = uno("fingido");
  assert.ok(f, "sin hallazgo");
  assert.match(f.detail, /ni borde visible/, f.detail);
});

test("sin límite y con texto: 1.4.11 no le exige borde, y se dice así", { skip }, () => {
  const f = uno("texto");
  assert.ok(f, "sin hallazgo");
  assert.equal(f.verdict, "cumple-parcial", f.detail);
  assert.match(f.detail, /se identifica por su propio texto/);
});

test("sin límite y sin texto: eso sí hay que mirarlo a mano", { skip }, () => {
  const f = uno("mudo");
  assert.ok(f, "sin hallazgo");
  assert.equal(f.verdict, "revisar", f.detail);
  assert.match(f.detail, /tampoco lleva texto/);
});

test("un borde de un solo lado también es un límite, y la ficha dice por dónde", { skip }, () => {
  const f = uno("unlado");
  assert.ok(f, "sin hallazgo");
  assert.match(f.detail, /por su borde 3 px/, f.detail);
  // #767676 sobre #fff son 4.54:1 — pasa de 3:1.
  assert.equal(f.verdict, "cumple-parcial", f.detail);
});

test("de un control NATIVO no se dice nada: su límite lo pinta el navegador", { skip }, () => {
  assert.equal(uno("nativo"), undefined, "no hay que medir el borde de UA de un <button>");
});
