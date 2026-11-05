/**
 * El cuaderno de juicio dentro de la orquestación, contra Chromium real.
 *
 * Hasta ahora el cuaderno se montaba aparte y había que meterlo en el informe a
 * mano. Esto comprueba que `auditRun` lo trae solo, que sustituye de verdad el
 * «requiere evaluación humana» genérico del motor, y que `auditSite` monta el de
 * la MUESTRA — que es donde aparece lo que ninguna página ve por separado.
 *
 * El servidor es real porque el cuaderno necesita dos cosas que solo existen
 * ahí: el DOM después de ejecutar los scripts y las reglas de las hojas de
 * estilo EXTERNAS. 2.3.1 se decide con eso; montado sobre el HTML servido, se
 * quedaría corto sin decirlo. Aquí la animación está en una hoja aparte
 * justamente para comprobarlo.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { auditRun, auditSite } from "../../src/audit-run.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

/* Paso 1: pide correo y teléfono. Sin vídeo, sin animaciones, sin contraseña. */
const PASO1 = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Paso 1</title></head><body>
<main><h1>Solicitud · paso 1</h1>
<form method="post" action="/paso-2">
  <label for="e">Correo</label><input id="e" autocomplete="email" required>
  <label for="t">Teléfono</label><input id="t" autocomplete="tel">
  <button>Siguiente</button>
</form></main></body></html>`;

/* Paso 2: vuelve a pedir el correo, tiene vídeo, y la animación vive en una
 * hoja de estilos EXTERNA (no en un <style> en línea). */
const PASO2 = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Paso 2</title>
<link rel="stylesheet" href="/estilos.css"></head><body>
<main><h1>Solicitud · paso 2</h1>
<video src="/v.mp4" controls></video>
<div class="parpadea">Aviso</div>
<form method="post" action="/enviar">
  <label for="e2">Correo</label><input id="e2" autocomplete="email" required>
  <label for="d">Dirección</label><input id="d" autocomplete="street-address">
  <button>Presentar solicitud</button>
</form></main></body></html>`;

const CSS = "@keyframes parp{from{opacity:.2}to{opacity:1}}.parpadea{animation:parp .4s infinite}";

let server, base;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, res) => {
    if (req.url === "/estilos.css") { res.writeHead(200, { "content-type": "text/css" }); return res.end(CSS); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url.indexOf("paso-2") !== -1 ? PASO2 : PASO1);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

test("auditRun trae el cuaderno de la página sin que nadie se lo pida", { skip }, async () => {
  const r = await auditRun({ url: base + "/paso-1" }, { waitMs: 100 });
  assert.ok(r.cuaderno, "el resultado tiene que llevar su cuaderno");
  assert.equal(r.cuaderno.criterios.length, 11);
  assert.ok(r.cuaderno.resumen.noAplican >= 3, JSON.stringify(r.cuaderno.resumen));
});

test("y sustituye el «evaluación humana» genérico del motor por «no aplica»", { skip }, async () => {
  const r = await auditRun({ url: base + "/paso-1" }, { waitMs: 100 });
  const de125 = r.findings.filter((f) => f.c.n === "1.2.5");
  assert.equal(de125.length, 1, "no puede haber dos hallazgos del mismo criterio: " + JSON.stringify(de125.map((f) => f.verdict)));
  assert.equal(de125[0].verdict, "no-aplica");
  assert.equal(de125[0].scope, "juicio");
  assert.match(de125[0].evid.join(" "), /no tiene ning[uú]n v[ií]deo/);
});

test("2.3.1 ve la animación aunque esté en una hoja de estilos externa", { skip }, async () => {
  // Es la razón de montar el cuaderno dentro de la capa de render: el CSS
  // resuelto solo existe ahí. Sobre el HTML servido, esto saldría «no aplica».
  const r = await auditRun({ url: base + "/paso-2" }, { waitMs: 150 });
  const f = r.cuaderno.criterios.find((c) => c.criterio === "2.3.1");
  assert.equal(f.aplica, true, JSON.stringify(f.loQueYaSabemos));
  assert.match(JSON.stringify(f.queMirar), /CSS|video/i);
});

test("auditSite monta el cuaderno de la MUESTRA y encuentra el 3.3.7 entre páginas", { skip }, async () => {
  const r = await auditSite([{ url: base + "/paso-1" }, { url: base + "/paso-2" }], { waitMs: 100 });
  assert.ok(r.cuaderno, "auditSite tiene que devolver el cuaderno de la muestra");
  assert.deepEqual(r.cuaderno.paginas, [base + "/paso-1", base + "/paso-2"]);

  // Ninguna de las dos páginas repite un dato dentro de sí misma…
  r.paginas.forEach((p) => {
    assert.equal(p.cuaderno.criterios.find((c) => c.criterio === "3.3.7").aplica, false, p.url);
  });
  // …pero las dos piden el correo.
  const f = r.cuaderno.criterios.find((c) => c.criterio === "3.3.7");
  assert.equal(f.aplica, true, "el cruce entre páginas tiene que levantarlo");
  assert.match(f.loQueYaSabemos.join(" "), /autocomplete:email/);
});

test("un criterio que aplica en una sola página aplica al sitio", { skip }, async () => {
  const r = await auditSite([{ url: base + "/paso-1" }, { url: base + "/paso-2" }], { waitMs: 100 });
  const f = r.cuaderno.criterios.find((c) => c.criterio === "1.2.5");
  assert.equal(f.aplica, true, "solo el paso 2 tiene vídeo, y basta con eso");
  assert.equal(f.queMirar[0].pagina, base + "/paso-2");
});

test("el informe de la muestra lleva el cuaderno UNA vez, no uno por página", { skip }, async () => {
  const r = await auditSite([{ url: base + "/paso-1" }, { url: base + "/paso-2" }], { waitMs: 100 });
  const juicio = r.findings.filter((f) => f.scope === "juicio");
  assert.equal(juicio.length, 11, "once criterios, once filas: " + juicio.length);
  assert.ok(juicio.every((f) => f.url === "(toda la muestra)"), "y todas del sitio, no de una página");
  // El rollup por criterio tiene que verlo: un criterio de juicio no puede
  // quedarse sin evaluar en el resumen de conformidad.
  const enRollup = r.rollup.criterios.filter((c) => /^(1\.2\.4|1\.2\.5|3\.3\.7)$/.test(c.n));
  assert.equal(enRollup.length, 3, JSON.stringify(r.rollup.criterios.map((c) => c.n)));
});

test("y no se pierde ninguna barrera real por el camino", { skip }, async () => {
  /* ESTA PRUEBA AFIRMABA «no aplica» SOLO LO EMITE EL CUADERNO, y v0.87.0 dejó
   * eso obsoleto a propósito: el inventario de medios emite `no-aplica` de
   * 1.2.1, 1.2.2, 1.2.3 y 1.4.2 cuando la página no tiene un solo medio, que es
   * justo lo que un auditor escribe en un sitio sin vídeo ni audio.
   *
   * Pero la invariante de fondo —cada criterio lo decide UNA capa— sí se rompió,
   * y es la que esta prueba cazó: el inventario emitía además 1.2.4 y 1.2.5, que
   * son del cuaderno, y salían DOS hallazgos del mismo criterio en la misma
   * página. Así que lo que se afirma ahora es eso, que es más fuerte y es lo que
   * de verdad hay que defender. */
  const r = await auditSite([{ url: base + "/paso-1" }, { url: base + "/paso-2" }], { waitMs: 100 });
  const sinVeredicto = r.findings.filter((f) => !f.verdict);
  assert.deepEqual(sinVeredicto, [], "todo hallazgo tiene que llevar veredicto");

  // 1. NINGÚN criterio con dos hallazgos de la misma página: dos capas
  //    dictaminando lo mismo es una fila duplicada en una hoja con efectos
  //    legales, y la puerta a que digan cosas distintas sin que nadie lo note.
  const porPagYCrit = {};
  r.paginas.forEach(function (p) {
    (p.findings || []).forEach(function (f) {
      if (!f || !f.c || f.scope === "juicio") return;   // el de juicio es del sitio, una vez
      const k = p.url + "\u0000" + f.c.n;
      (porPagYCrit[k] = porPagYCrit[k] || []).push(f);
    });
  });
  const dobles = Object.keys(porPagYCrit)
    .filter(function (k) { return porPagYCrit[k].length > 1 && porPagYCrit[k].every(function (f) { return f.verdict === "no-aplica"; }); })
    .map(function (k) { return k.split("\u0000")[1]; });
  assert.deepEqual(dobles, [], "criterios con «no aplica» duplicado en la misma página: " + dobles.join(", "));

  // 2. El «no aplica» sale solo de quien tiene derecho a emitirlo, y se
  //    comprueba por DATO —ámbito y número de criterio—, no por la prosa.
  const DEL_INVENTARIO = ["1.2.1", "1.2.2", "1.2.3", "1.4.2"];
  const noAplica = r.findings.filter((f) => f.verdict === "no-aplica");
  assert.ok(noAplica.length >= 1);
  const intrusos = noAplica.filter(function (f) {
    if (f.scope === "juicio") return false;                       // el cuaderno
    return DEL_INVENTARIO.indexOf(f.c.n) === -1;                  // el inventario de medios
  }).map(function (f) { return f.c.n + "/" + (f.scope || "—"); });
  assert.deepEqual(intrusos, [], "«no aplica» de una capa que no debe emitirlo: " + intrusos.join(", "));

  // 3. Y la mitad que v0.87.0 ganó no se pierde: en una página sin medios, los
  //    cuatro del inventario tienen que estar dichos, no en blanco.
  const paso1 = r.paginas.find(function (p) { return /paso-1$/.test(p.url); });
  DEL_INVENTARIO.forEach(function (n) {
    const f = (paso1.findings || []).find(function (x) { return x.c.n === n && x.verdict === "no-aplica"; });
    assert.ok(f, n + " tiene que salir «no aplica» en una página sin medios, no en blanco");
  });
});
