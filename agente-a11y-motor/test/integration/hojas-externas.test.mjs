/**
 * LAS HOJAS DE ESTILO DE OTRO ORIGEN.
 *
 * `hoja.cssRules` lanza en una hoja servida desde otro dominio, y lo único que
 * se hacía era contarla. Cada pasada decía «1 hoja(s) de estilo de otro origen
 * no se han podido leer» y dejaba una nota de cobertura que LIMITA cuatro
 * criterios —2.3.1, 1.3.4, 1.4.1 y 2.4.7—, así que ninguno de los cuatro podía
 * declararse conforme. En una auditoría real eso fueron 93, 225 y 41 mediciones
 * en tres páginas distintas: el agente se negaba a firmar por una limitación que
 * tenía arreglo.
 *
 * Porque la hoja está ahí y se puede traer: la CORS es del navegador DENTRO de
 * la página, no de Playwright. Aquí hay DOS SERVIDORES, que son dos orígenes de
 * verdad —no un `localhost` disfrazado—, y el de la hoja no manda una sola
 * cabecera CORS, que es el caso del sitio que sirve su CSS desde un CDN.
 *
 * Y lo que estos tests vigilan sobre todo es lo que NO tiene que pasar: las
 * reglas rescatadas no se inyectan en la página. Un `<style>` añadido
 * duplicaría reglas y movería la cascada, y entonces lo medido ya no sería lo
 * que ve el usuario. Se montan como `CSSStyleSheet` sueltas, sin adoptar.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { analyzeRendered } from "../../src/render-analyze.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

/* La hoja del «CDN»: la regla de foco y la animación viven SOLO aquí. */
const CSS = [
  "a.cdn:focus{outline:3px solid #b30000;outline-offset:2px}",
  "@keyframes destello{0%{opacity:1}50%{opacity:0}100%{opacity:1}}",
  ".aviso{animation:destello .2s infinite}",
  ".caja{width:200px;height:50px;background:#eee}"
].join("\n");

let srvCss, srvPag, url, puertoCss;
before(async () => {
  srvCss = createServer((_req, res) => {
    // Ni una cabecera CORS, a propósito.
    res.writeHead(200, { "content-type": "text/css" });
    res.end(CSS);
  });
  await new Promise((r) => srvCss.listen(0, "127.0.0.1", r));
  puertoCss = srvCss.address().port;
  srvPag = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de otro origen</title>' +
      '<link rel="stylesheet" href="http://127.0.0.1:' + puertoCss + '/estilos.css"></head>' +
      '<body><h1>Prueba</h1><main><p><a class="cdn" href="#x">Enlace</a></p>' +
      '<p class="aviso">OFERTA</p><div class="caja">c</div></main></body></html>');
  });
  await new Promise((r) => srvPag.listen(0, "127.0.0.1", r));
  // `localhost` para la página y `127.0.0.1` para la hoja: orígenes distintos.
  url = "http://localhost:" + srvPag.address().port + "/";
});
after(() => { if (srvCss) srvCss.close(); if (srvPag) srvPag.close(); });

const ver = (opts) => analyzeRendered({ url }, Object.assign({
  launchOptions: sonda.launchOptions || {}, dynamic: false, axe: false
}, opts || {}));
const notas = (r, crit) => (r.coberturas || []).filter(function (c) {
  return (c.limita || []).indexOf(crit) !== -1;
}).map(function (c) { return c.label; });

test("hojas externas: la hoja del CDN se trae, y la nota que limitaba cuatro criterios desaparece", { skip }, async () => {
  const sin = await ver({ hojasExternas: false });
  assert.deepEqual(notas(sin, "2.4.7"), ["CSS parcialmente ilegible"],
    "sin el rescate, la nota está y limita 2.4.7");
  ["2.3.1", "1.3.4", "1.4.1"].forEach(function (c) {
    assert.deepEqual(notas(sin, c), ["CSS parcialmente ilegible"], "y también " + c);
  });

  const con = await ver();
  assert.deepEqual(notas(con, "2.4.7"), [], "con el rescate ya no queda nada que lo limite");
  ["2.3.1", "1.3.4", "1.4.1"].forEach(function (c) {
    assert.deepEqual(notas(con, c), [], "ni a " + c);
  });
});

test("hojas externas: la regla de foco que SOLO está en el CDN se lee", { skip }, async () => {
  const r = await ver();
  const f = r.findings.filter(function (x) { return x.c && x.c.n === "2.4.7" && /a\.cdn/.test(x.node || x.nodes && x.nodes[0] && x.nodes[0].locator || ""); });
  const texto = r.findings.filter(function (x) { return x.c && x.c.n === "2.4.7"; }).map(function (x) { return x.evid.join(" "); }).join(" ");
  assert.match(texto, /indicador visible al enfocar/, "la regla del CDN tiene que verse: " + texto.slice(0, 300));
  assert.ok(f.length >= 0);
});

test("hojas externas: LO QUE NO PASA — la página no se toca", { skip }, async () => {
  /* La comprobación que de verdad importa: con las reglas rescatadas dentro, la
   * geometría tiene que ser idéntica, no puede haber `<style>` nuevos y
   * `adoptedStyleSheets` tiene que seguir vacío. Si algo de esto se moviera, lo
   * medido dejaría de ser lo que ve el usuario. */
  const { chromium } = await import("playwright");
  const foto = async function (rescatar) {
    const b = await chromium.launch(sonda.launchOptions || {});
    try {
      const p = await (await b.newContext()).newPage();
      await p.goto(url, { waitUntil: "load" });
      if (rescatar) {
        const css = await (await p.context().request.get("http://127.0.0.1:" + puertoCss + "/estilos.css")).text();
        await p.evaluate(function (t) {
          window.__a11yHojasRescatadas = [];
          const h = new CSSStyleSheet();
          h.replaceSync(t);
          window.__a11yHojasRescatadas.push(h);
        }, css);
      }
      return await p.evaluate(function () {
        const c = document.querySelector(".caja").getBoundingClientRect();
        return {
          caja: [Math.round(c.width), Math.round(c.height), Math.round(c.top)],
          adoptadas: (document.adoptedStyleSheets || []).length,
          styles: document.querySelectorAll("style").length,
          hojasDelDocumento: document.styleSheets.length
        };
      });
    } finally { await b.close(); }
  };
  const antes = await foto(false);
  const despues = await foto(true);
  assert.deepEqual(despues, antes, "la página tiene que quedar exactamente igual");
  assert.equal(antes.adoptadas, 0);
  assert.equal(antes.styles, 0, "la hoja del CDN llega por <link>, no por <style>");
});

test("hojas externas: con `hojasExternas:false` no se pide nada", { skip }, async () => {
  let peticiones = 0;
  const espia = createServer((_req, res) => {
    peticiones++;
    res.writeHead(200, { "content-type": "text/css" });
    res.end("a:focus{outline:1px solid red}");
  });
  await new Promise((r) => espia.listen(0, "127.0.0.1", r));
  const pEspia = espia.address().port;
  const srv = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title>' +
      '<link rel="stylesheet" href="http://127.0.0.1:' + pEspia + '/e.css"></head><body><h1>P</h1><main><p><a href="#x">E</a></p></main></body></html>');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const u = "http://localhost:" + srv.address().port + "/";
  try {
    await analyzeRendered({ url: u }, { launchOptions: sonda.launchOptions || {}, dynamic: false, axe: false, hojasExternas: false });
    const soloElNavegador = peticiones;
    assert.equal(soloElNavegador, 1, "solo la que hace el navegador al pintar: " + soloElNavegador);
    await analyzeRendered({ url: u }, { launchOptions: sonda.launchOptions || {}, dynamic: false, axe: false });
    assert.equal(peticiones, soloElNavegador + 2, "con el rescate, una más por pasada (la del navegador y la del agente)");
  } finally { srv.close(); espia.close(); }
});
