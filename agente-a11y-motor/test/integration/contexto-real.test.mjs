/**
 * 3.2.1 / 3.2.2 (cambio de contexto) y 2.2.2 (movimiento que no para) sobre
 * navegador y servidor REALES.
 *
 * Son los dos criterios de esta tanda que no se pueden verificar con un DOM
 * simulado: uno depende de que enfocar o cambiar un control provoque de verdad
 * una navegación, y el otro de que el motor de estilos resuelva la animación.
 *
 * El servidor es de verdad a propósito. Con `setContent` la página vive en
 * `about:blank`, y una navegación desde ahí no se comporta igual que la de un
 * sitio servido por HTTP — que es lo que el auditor va a auditar. Además deja
 * comprobar, de paso, que el cortafuegos no permitió que la navegación llegara
 * al servidor.
 *
 * Requiere Chromium. Se salta sola si no hay:  npm run test:integracion
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dynamicAnalyze } from "../../src/dynamic-analyze.js";
import { analyzeRendered } from "../../src/index.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

/* La sonda ARRANCA el navegador, no se conforma con que el paquete importe.
 * Tener `playwright` instalado no significa tener un Chromium descargado: en
 * una máquina sin `npx playwright install` el import funciona y el lanzamiento
 * falla, y entonces la batería no se salta — se cae con fallos rojos que no
 * dicen nada de la accesibilidad de nada. Es la misma sonda que usan las demás. */
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const sonda = await chromiumDisponible(launchOptions);
const disponible = sonda.ok;
const skip = disponible ? false : "sin navegador (npx playwright install chromium): " + sonda.motivo;

/* Página con un `<select>` de los de siempre: el de «ir a» que navega al
 * cambiar de opción. Es el ejemplo canónico de fallo de 3.2.2. Los otros dos
 * controles son inocentes, y están para que el test note un falso positivo. */
const NAVEGA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ir a</title></head><body>
<main>
  <h1>Cambio de contexto</h1>
  <label for="ir">Ir a la sección</label>
  <select id="ir" onchange="location.href='/seccion/'+this.value">
    <option value="a">Sección A</option>
    <option value="b">Sección B</option>
  </select>
  <label for="n">Nombre</label><input id="n" name="n" value="Suso">
  <button type="button" id="ok">Guardar</button>
</main></body></html>`;

/* Un `focus` que roba el foco. No navega, así que el veredicto correcto es
 * `revisar`: 3.2.1 lo permite si se avisó antes, y eso no se ve desde aquí. */
const ROBA_FOCO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Foco</title></head><body>
<main>
  <h1>Foco que salta</h1>
  <label for="c">Acepto</label>
  <input type="checkbox" id="c" onfocus="document.getElementById('otro').focus()">
  <button type="button" id="otro">Otro sitio</button>
</main></body></html>`;

/* Nada raro: tres controles que se comportan. Sirve para el caso `pasa`. */
const LIMPIA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Limpia</title></head><body>
<main>
  <h1>Sin sorpresas</h1>
  <label for="a">Texto</label><input id="a" value="hola">
  <label for="s">Talla</label><select id="s"><option>S</option><option>M</option></select>
  <button type="button">Aceptar</button>
</main></body></html>`;

const PAGINAS = { "/navega": NAVEGA, "/roba-foco": ROBA_FOCO, "/limpia": LIMPIA };

let server, base, recibido;
before(async () => {
  if (!disponible) return;
  recibido = [];
  server = createServer((req, res) => {
    recibido.push(req.method + " " + req.url);
    const cuerpo = PAGINAS[req.url.replace(/\?.*$/, "")] || LIMPIA;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(cuerpo);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

test("3.2.2 real: un select que navega al cambiar de opción → falla", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/navega" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(f, "debería dictaminar 3.2.2");
  assert.equal(f.verdict, "falla");
  assert.match(f.evid.join(" "), /NAVEGACI/);
  assert.ok(f.nodes.some((n) => /select/.test(n.locator)), "la barrera tiene que señalar al select: " + JSON.stringify(f.nodes));

  // La navegación NO salió a la red: el cortafuegos la abortó en el navegador.
  assert.ok(!recibido.some((l) => l.includes("/seccion/")), "la navegación llegó al servidor: " + JSON.stringify(recibido));
});

test("3.2.2 real: ni el input ni el botón se cuelan como falso positivo", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/navega" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2" && x.verdict === "falla");
  const locs = f.nodes.map((n) => n.locator).join(" ");
  assert.ok(!/button|input#n/.test(locs), "acusa a controles inocentes: " + locs);
});

test("3.2.1 real: un control que roba el foco al recibirlo → revisar", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/roba-foco" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.1");
  assert.ok(f, "debería dictaminar 3.2.1");
  assert.equal(f.verdict, "revisar", JSON.stringify(f && f.evid));
  assert.match(f.evid.join(" "), /el foco salta a otro sitio/);
});

test("3.2.1/3.2.2 real: página sin sorpresas → pasa, diciendo cuántos controles se probaron", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/limpia" }, { launchOptions, forms: "safe" });
  ["3.2.1", "3.2.2"].forEach((n) => {
    const f = out.findings.find((x) => x.c.n === n);
    assert.ok(f, "falta " + n);
    assert.equal(f.verdict, "pasa", n + ": " + JSON.stringify(f.evid));
    assert.match(f.evid.join(" "), /Se han probado \d+ control/);
  });
});

test("2.2.2 real: animación infinita → revisar; <marquee> → falla", { skip }, async () => {
  const html = '<style>@keyframes giro{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.gira{animation:giro 2s linear infinite;width:40px;height:40px;background:#333}</style>' +
    '<div class="gira"></div><marquee>Oferta del día</marquee>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const m = out.measurements.filter((x) => x.crit === "2.2.2");
  assert.ok(m.length >= 2, "debería medir las dos: " + JSON.stringify(m));

  const anim = m.find((x) => /animaci/.test(x.detail));
  assert.ok(anim, "falta la animación CSS");
  assert.equal(anim.verdict, "revisar");
  assert.match(anim.detail, /infinita/);

  const marq = m.find((x) => /marquee/.test(x.detail));
  assert.ok(marq, "falta el marquee");
  assert.equal(marq.verdict, "falla");
  assert.ok(marq.path, "la barrera tiene que llevar su ruta CSS");
});

test("2.2.2 real: una transición corta no es una barrera", { skip }, async () => {
  const html = '<style>@keyframes ent{from{opacity:0}to{opacity:1}}' +
    '.ent{animation:ent 0.3s ease-out 1;width:40px;height:40px;background:#333}</style>' +
    '<div class="ent"></div>';
  const out = await analyzeRendered({ html }, { launchOptions });
  assert.deepEqual(out.measurements.filter((x) => x.crit === "2.2.2"), []);
});

test("2.2.2 real: una animación pausada no se reporta", { skip }, async () => {
  const html = '<style>@keyframes giro{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.gira{animation:giro 2s linear infinite;animation-play-state:paused;width:40px;height:40px;background:#333}</style>' +
    '<div class="gira"></div>';
  const out = await analyzeRendered({ html }, { launchOptions });
  assert.deepEqual(out.measurements.filter((x) => x.crit === "2.2.2"), []);
});
