import { test } from "node:test";
import assert from "node:assert/strict";

/* ── Una sola captura no basta en un sitio que pinta en el cliente ────────────
 *
 * Medido en la pasada `ja4` de jesusaccesible.com: el rastreo iba con
 * `waitUntil: "load"` y SIN espera añadida, mientras la auditoría va con
 * `load` + 400 ms. `/contacto` —cuatro campos y un botón de envío— salió con
 * `tieneFormulario: false`, la cobertura quedó con `formulario: false`, y la
 * justificación de la muestra que va al IRA decía «No se ha encontrado ninguna
 * página de la categoría "Página con formulario": compruébalo a mano» con la
 * página del formulario DENTRO de la muestra. Una afirmación falsa en el
 * documento que sostiene la auditoría.
 *
 * Las huellas lo delataban: cuatro páginas con la MISMA huella —el armazón
 * compartido— y una sin header ni footer. Dos momentos de pintado distintos en
 * la misma pasada no son marcado estable.
 *
 * Estos tests necesitan navegador: se saltan donde no lo hay, y eso se dice. */

const hayNavegador = await (async () => {
  try { const m = await import("../src/playwright-launch.js"); return (await m.chromiumDisponible()).ok; }
  catch (e) { return false; }
})();

test("rastreo: una página que pinta su formulario después de «load» se lee bien", { skip: !hayNavegador && "sin Chromium" }, async () => {
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../src/crawl.js");
  const HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contacto</title></head>' +
    '<body><div id="root"></div><script>' +
    'document.getElementById("root").innerHTML=' +
    '"<header><nav><a href=\\"/\\">JFA</a></nav></header><main id=\\"m\\"></main><footer>pie</footer>";' +
    'window.addEventListener("load",function(){setTimeout(function(){' +
    'document.getElementById("m").innerHTML="<h1>Contacto</h1><form><label for=\\"n\\">Nombre</label>' +
    '<input id=\\"n\\" required><button type=\\"submit\\">Enviar</button></form>";},250);});' +
    '<\/script></body></html>';
  const srv = createServer((_q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(HTML); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const url = "http://127.0.0.1:" + srv.address().port + "/contacto";
  try {
    // Sin reposo: es lo que hacía el muestreo, y lee el armazón.
    const crudo = await crawlSite(url, { max: 1, asentarMs: 0 });
    assert.equal(crudo.candidatas[0]["señales"].tieneFormulario, false,
      "con asentarMs=0 se lee la página antes de pintarse: esto documenta el defecto, no lo aprueba");
    assert.deepEqual(crudo.reposadas, [], "sin reposo no hay segunda lectura que comparar");

    // Con la doble lectura, que es ahora el comportamiento por omisión.
    const bien = await crawlSite(url, { max: 1 });
    assert.equal(bien.candidatas[0]["señales"].tieneFormulario, true, "la segunda lectura sí ve el formulario");
    assert.deepEqual(bien.candidatas[0].asentado, ["tieneFormulario"], "y se anota QUÉ cambió");
    assert.equal(bien.reposadas.length, 1);
    // Y se dice arriba, porque de estas señales salen las categorías del IRA.
    const aviso = (bien.avisos || []).find((a) => /PINTA EN EL CLIENTE/.test(a));
    assert.ok(aviso, "un sitio donde hay que reposar es un dato que el informe tiene que dar");
    assert.match(aviso, /hueco de LECTURA del agente y no del sitio/);
  } finally { srv.close(); }
});

test("rastreo: si la página ya está estable a «load», la segunda lectura no anota nada", { skip: !hayNavegador && "sin Chromium" }, async () => {
  /* El coste de la doble lectura es una evaluación más. Lo que NO puede hacer es
   * marcar como «pinta en el cliente» un sitio estático, porque ese aviso cambia
   * cómo se leen las categorías de la muestra. */
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../src/crawl.js");
  const HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Quieta</title></head>' +
    '<body><header><nav><a href="/">Inicio</a></nav></header><main><h1>Quieta</h1>' +
    '<form><label for="a">A</label><input id="a"></form></main><footer>pie</footer></body></html>';
  const srv = createServer((_q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(HTML); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const r = await crawlSite("http://127.0.0.1:" + srv.address().port + "/", { max: 1 });
    assert.equal(r.candidatas[0]["señales"].tieneFormulario, true);
    assert.equal(r.candidatas[0].asentado, null, "no cambió nada: no hay nada que anotar");
    assert.deepEqual(r.reposadas, []);
    assert.ok(!(r.avisos || []).some((a) => /PINTA EN EL CLIENTE/.test(a)));
  } finally { srv.close(); }
});
