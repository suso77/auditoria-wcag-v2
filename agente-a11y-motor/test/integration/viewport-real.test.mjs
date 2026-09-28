/**
 * Adaptación del contenido contra un Chromium real.
 *
 * Cada caso es una página servida por HTTP con UN defecto conocido (o sin él), y
 * se comprueba que el agente lo encuentra sin inventarse los demás. Es la prueba
 * de que 1.4.4 / 1.4.10 / 1.4.12 / 1.3.4 / 1.4.13 han dejado de ser un «revisar»
 * a ciegas y son una medición.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { viewportAnalyze } from "../../src/viewport-analyze.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const BASE = (cuerpo, estilo) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Caso</title>
<style>body{margin:0;font:16px/1.4 system-ui}${estilo || ""}</style></head><body>${cuerpo}</body></html>`;

const TEXTO = "Los criterios de conformidad de las Pautas de Accesibilidad para el Contenido Web exigen que el contenido siga disponible cuando la persona usuaria cambia el espaciado del texto o amplía la página.";

const CASOS = {
  // Página sana: se adapta, no recorta y no usa title como tooltip.
  "/sano": BASE(`<main><h1>Título</h1><p>${TEXTO}</p><p>${TEXTO}</p></main>`,
    "main{max-width:60em;padding:1em}"),
  // Ancho fijo en píxeles: obliga a desplazarse en horizontal a 320 px.
  "/reflujo": BASE(`<main><h1>Título</h1><p>${TEXTO}</p></main>`,
    "main{width:980px;padding:1em}"),
  // Caja de alto fijo con overflow:hidden dimensionada para que el texto QUEPA
  // con el espaciado de serie y se salga al aplicar el de 1.4.12. Es la transición
  // lo que se mide, no el estado final.
  "/espaciado": BASE(`<main><div class="card"><p>Texto que cabe justo en dos líneas con el interlineado de serie.</p></div></main>`,
    "main{padding:1em}.card{height:48px;overflow:hidden;width:420px}.card p{margin:0;line-height:1.2}"),
  // Caja que YA viene recortada antes de tocar nada.
  "/recorte-previo": BASE(`<main><div class="card"><p>${TEXTO}</p></div></main>`,
    "main{padding:1em}.card{height:32px;overflow:hidden;width:300px}"),
  // Solo tabla ancha: candidata a la excepción de uso esencial.
  "/tabla": BASE(`<main><table><tr>${"<td>columna larga de datos</td>".repeat(8)}</tr></table></main>`,
    "main{padding:1em}table{border-collapse:collapse}td{white-space:nowrap;padding:4px}"),
  // title usado como tooltip.
  "/title": BASE(`<main><h1>T</h1><p><a href="#x" title="Información adicional que solo se ve al pasar el ratón">Enlace</a></p></main>`),
  // Bloqueo de orientación por JavaScript.
  "/orientacion": BASE(`<main><h1>T</h1><p>${TEXTO}</p></main>`) .replace("</body>",
    "<script>try{screen.orientation.lock('portrait')}catch(e){}</script></body>")
};

let server, base;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, res) => {
    const c = CASOS[req.url.replace(/\?.*$/, "")];
    res.writeHead(c ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(c || "no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

const ver = async (ruta) => {
  const r = await viewportAnalyze({ url: base + ruta }, { waitMs: 150 });
  assert.deepEqual(r.errores, [], "errores en " + ruta + ": " + JSON.stringify(r.errores));
  const m = {};
  r.findings.forEach((f) => { m[f.c.n] = f; });
  return m;
};

test("página que se adapta bien → cumple los cinco criterios", { skip }, async () => {
  const m = await ver("/sano");
  ["1.4.10", "1.4.4", "1.4.12", "1.3.4", "1.4.13"].forEach((n) => {
    assert.ok(m[n], "falta " + n);
    assert.equal(m[n].verdict, "cumple", n + ": " + (m[n].evid || []).join(" "));
  });
  // Y el 1.4.13 ya no es un «cumple» de fe: dice cuántos disparadores recorrió.
  assert.match(m["1.4.13"].evid[0], /disparador\(es\)/);
});

test("ancho fijo de 980 px → falla 1.4.10 con el elemento señalado", { skip }, async () => {
  const m = await ver("/reflujo");
  assert.equal(m["1.4.10"].verdict, "falla");
  assert.match(m["1.4.10"].evid[0], /desplazamiento horizontal/);
  assert.ok(m["1.4.10"].nodes.length, "debe señalar el elemento que desborda");
  assert.match(m["1.4.10"].nodes[0].locator, /main/);
});

test("caja de alto fijo con overflow:hidden → falla 1.4.12 (recorte medido)", { skip }, async () => {
  const m = await ver("/espaciado");
  assert.equal(m["1.4.12"].verdict, "falla", JSON.stringify(m["1.4.12"].evid));
  assert.match(m["1.4.12"].evid[0], /se recortan/);
  assert.match(m["1.4.12"].nodes[0].locator, /card/);
});

test("solo una tabla ancha → 1.4.10 revisar por posible uso esencial, no falla", { skip }, async () => {
  const m = await ver("/tabla");
  assert.equal(m["1.4.10"].verdict, "revisar", JSON.stringify(m["1.4.10"].evid));
  assert.match(m["1.4.10"].evid[0], /uso esencial/);
});

test("contenido ya recortado antes del cambio → revisar, y lo dice explícitamente", { skip }, async () => {
  const m = await ver("/recorte-previo");
  assert.equal(m["1.4.12"].verdict, "revisar", JSON.stringify(m["1.4.12"].evid));
  assert.match(m["1.4.12"].evid[0], /YA ven[ií]an con contenido recortado/);
  assert.match(m["1.4.12"].nodes[0].locator, /card/);
});

test("atributo title como tooltip → falla 1.4.13", { skip }, async () => {
  const m = await ver("/title");
  assert.equal(m["1.4.13"].verdict, "falla");
  assert.match(m["1.4.13"].evid[0], /title/);
});

test("screen.orientation.lock() → falla 1.3.4", { skip }, async () => {
  const m = await ver("/orientacion");
  assert.equal(m["1.3.4"].verdict, "falla");
});

/* ── La sonda de puntero de 1.4.13, en un navegador de verdad ────────────── */

const TOOLTIP_MALO = `<style>.tip{position:relative}.tip .b{display:none;position:absolute;top:2.5em;left:0;
  background:#000;color:#fff;padding:8px;width:220px}.tip:hover .b{display:block}</style>
<p>Precio: <span class="tip">1.200 €<span class="b">IVA no incluido. No se cierra con Esc.</span></span></p>`;

const TOOLTIP_BUENO = `<style>.tip2{position:relative}.tip2 .b{display:none;position:absolute;top:100%;left:0;
  background:#222;color:#fff;padding:8px;width:220px}.tip2:hover .b{display:block}
  .tip2.cerrado .b{display:none !important}</style>
<p>Envío: <span class="tip2" id="t2">gratis<span class="b">A partir de 50 €.</span></span></p>
<script>document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('t2').classList.add('cerrado')})</script>`;

const unoCatorceTrece = async (html) => {
  const r = await viewportAnalyze({ html }, {});
  return { f: r.findings.find((x) => x.c.n === "1.4.13"), t: r.trazas.hover };
};

test("1.4.13 real: un tooltip CSS que no se cierra con Esc es una falla", { skip }, async () => {
  // Este es el caso que antes salía «cumple»: sin `title` y con `hovers` fijado
  // a [], el análisis lo leía como «no hay contenido emergente».
  const { f, t } = await unoCatorceTrece(TOOLTIP_MALO);
  assert.equal(f.verdict, "falla", JSON.stringify(t));
  assert.match(f.evid[0], /no se descarta con Esc/);
  assert.equal(t.disparadores, 1, "la regla `.tip:hover .b` tiene que encontrarse en el CSSOM");
  assert.equal(t.hovers[0].aparece > 0, true, "al pasar el puntero tiene que aparecer contenido");
});

test("1.4.13 real: un emergente que sí se descarta con Esc cumple", { skip }, async () => {
  const { f, t } = await unoCatorceTrece(TOOLTIP_BUENO);
  assert.equal(f.verdict, "cumple", JSON.stringify(t));
  assert.equal(t.hovers[0].descartableConEsc, true);
  assert.equal(t.hovers[0].senalable, true);
});

test("1.4.13 real: sin emergentes, el cumple dice cuántos disparadores se recorrieron", { skip }, async () => {
  const { f, t } = await unoCatorceTrece("<p>Solo texto, sin nada emergente.</p>");
  assert.equal(f.verdict, "cumple");
  assert.equal(t.disparadores, 0);
  assert.match(f.evid[0], /0 disparador/);
});
