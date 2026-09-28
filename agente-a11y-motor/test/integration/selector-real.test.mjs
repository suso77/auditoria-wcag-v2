import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { setDOMParser, understand, analyze } from "../../src/index.js";
import { MEASURE_BODY } from "../../src/measure.browser.js";

setDOMParser(DOMParser);

/**
 * Los selectores que salen en el informe tienen que SELECCIONAR.
 *
 * El locator legible («img», «button») no identifica: dos elementos sin id ni
 * clase lo comparten, y en la columna «Elemento» del IRA salían filas idénticas
 * que no sirven para ir a buscar la barrera. Ahora cada nodo lleva además una
 * ruta CSS. Este test la pega en un navegador de verdad y comprueba que cada una
 * devuelve UNO y solo un elemento, y que es el que dice ser.
 *
 * En Node no se puede comprobar: linkedom no implementa `:nth-of-type` igual que
 * un navegador, y precisamente lo que se quiere verificar es que la ruta vale en
 * el navegador del auditor.
 */

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  await b.close();
} catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador (npx playwright install chromium): " + why;

// Página con colisiones a propósito: elementos repetidos sin id ni clase, y
// anidamiento suficiente para que la ruta tenga varios tramos.
const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Rutas</title></head><body>
<header><nav><ul>
  <li><a href="/">Inicio</a></li>
  <li><a href="/servicios">Servicios</a></li>
  <li><a href="/contacto"><img src="sobre.png"></a></li>
</ul></nav></header>
<main>
  <h1>Página de prueba</h1>
  <p style="color:#bbb">Un párrafo gris claro.</p>
  <p style="color:#111">Otro párrafo.</p>
  <img src="uno.png"><img src="dos.png"><img src="tres.png">
  <table><tr><td>a</td><td>b</td></tr></table>
  <button></button><button>Enviar</button>
  <div role="button" tabindex="0">Falso botón</div>
</main>
<footer><p>Pie</p></footer>
<svg aria-hidden="true" width="0" height="0"><defs>
  <linearGradient id="g1"><stop offset="0"/></linearGradient>
  <linearGradient id="g2"><stop offset="1"/></linearGradient>
</defs></svg>
<mi-componente><span>Elemento personalizado</span></mi-componente>
</body></html>`;

// Misma construcción que `buildPath` del motor y `rutaM` de la medición: se
// ejecuta dentro de la página sobre TODOS sus elementos, no solo los de un
// hallazgo, que es donde aparecen los casos raros.
const RUTA_FUENTE = `function (el) {
  var parts = [], n = el;
  while (n && n.nodeType === 1) {
    var t = n.tagName.toLowerCase();
    if (t === "html" || t === "body") break;
    var p = n.parentElement;
    if (!p) { parts.unshift(t); break; }
    var i = 1, sib = p.firstElementChild;
    while (sib && sib !== n) { if (sib.tagName === n.tagName) i++; sib = sib.nextElementSibling; }
    parts.unshift(t + ":nth-of-type(" + i + ")");
    n = p;
  }
  return parts.length ? "html > body > " + parts.join(" > ") : "body";
}`;

async function abrir(b) {
  const p = await b.newPage();
  await p.setContent(HTML, { waitUntil: "load" });
  return p;
}

/** Comprueba en la página que la ruta selecciona un único elemento. */
async function resolver(page, rutas) {
  return page.evaluate(function (lista) {
    return lista.map(function (r) {
      let n = -1, tag = null;
      try {
        const e = document.querySelectorAll(r);
        n = e.length;
        tag = e.length ? e[0].tagName.toLowerCase() : null;
      } catch (err) { n = -2; }
      return { ruta: r, n: n, tag: tag };
    });
  }, rutas);
}

test("selector real: cada ruta del motor selecciona un único elemento", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b);
    const html = await p.evaluate(function () { return document.documentElement.outerHTML; });
    const out = analyze(understand(html));

    const nodos = [];
    out.findings.forEach(function (f) { (f.nodes || []).forEach(function (nd) { if (nd.path) nodos.push(nd); }); });
    assert.ok(nodos.length >= 4, "la página debería producir varios nodos con ruta, hay " + nodos.length);

    const res = await resolver(p, nodos.map(function (nd) { return nd.path; }));
    res.forEach(function (r, i) {
      assert.notEqual(r.n, -2, "ruta inválida como selector CSS: " + r.ruta);
      assert.equal(r.n, 1, "la ruta debería seleccionar exactamente 1 elemento, selecciona " + r.n + ": " + r.ruta);
      const esperado = (nodos[i].locator.match(/^[a-z0-9-]+/i) || [])[0];
      if (esperado) assert.equal(r.tag, esperado, "la ruta lleva a otro elemento distinto del nombrado: " + r.ruta);
    });

    // Y el punto de todo esto: las rutas no se repiten entre nodos distintos.
    const unicas = new Set(nodos.map(function (nd) { return nd.path; }));
    assert.equal(unicas.size, nodos.length, "dos nodos distintos comparten ruta");
  } finally { await b.close(); }
});

test("selector real: cada ruta de la medición selecciona un único elemento", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b);
    const med = await p.evaluate(new Function("lim", MEASURE_BODY), 400);

    const conRuta = med.filter(function (m) { return m.crit !== "__meta" && m.path; });
    assert.ok(conRuta.length >= 5, "la medición debería emitir rutas, hay " + conRuta.length);
    // Ninguna medición de UN elemento se queda sin ruta: si alguna inserción
    // olvida sellarla, aquí se ve, y no en un informe con la casilla vacía. Los
    // hallazgos de conjunto (el orden de foco) llevan la secuencia en `rutas`.
    const sinRuta = med.filter(function (m) { return m.crit !== "__meta" && !m.path && !m.rutas; });
    assert.deepEqual(sinRuta, [], "mediciones sin ruta: " + JSON.stringify(sinRuta.slice(0, 3)));

    const orden = med.find(function (m) { return m.crit === "2.4.3"; });
    assert.ok(orden && orden.rutas && orden.rutas.length, "el orden de foco debería traer su secuencia de rutas");
    const resOrden = await resolver(p, orden.rutas);
    resOrden.forEach(function (r) { assert.equal(r.n, 1, "paso del orden de foco sin resolver: " + r.ruta); });
    assert.equal(new Set(orden.rutas).size, orden.rutas.length, "la secuencia de foco repite rutas");

    const res = await resolver(p, conRuta.map(function (m) { return m.path; }));
    res.forEach(function (r) {
      assert.notEqual(r.n, -2, "ruta inválida como selector CSS: " + r.ruta);
      assert.equal(r.n, 1, "selecciona " + r.n + " elementos: " + r.ruta);
    });
  } finally { await b.close(); }
});

test("selector real: los tres <img> repetidos se distinguen entre sí", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b);
    const html = await p.evaluate(function () { return document.documentElement.outerHTML; });
    const out = analyze(understand(html));
    const uno = out.findings.find(function (f) { return f.c.n === "1.1.1" && f.verdict === "falla"; });
    assert.ok(uno, "las imágenes sin alternativa deberían fallar 1.1.1");
    // Tres sueltas en <main>; la del enlace la absorbe el propio enlace.
    assert.ok(uno.nodes.length >= 3, "una barrera por imagen, hay " + uno.nodes.length);

    const res = await resolver(p, uno.nodes.map(function (nd) { return nd.path; }));
    res.forEach(function (r) { assert.equal(r.n, 1, r.ruta + " → " + r.n); assert.equal(r.tag, "img"); });
    assert.equal(new Set(res.map(function (r) { return r.ruta; })).size, res.length);
  } finally { await b.close(); }
});

test("selector real: SVG en camelCase y elementos personalizados también resuelven", { skip }, async () => {
  // La ruta baja la etiqueta a minúsculas, y en SVG las hay en camelCase
  // (`linearGradient`). En un documento HTML el selector de tipo casa sin
  // distinguir mayúsculas, así que funciona — pero eso es conocimiento frágil:
  // mejor tenerlo fijado por un test que descubrirlo en un informe.
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const p = await abrir(b);
    const malos = await p.evaluate(function (fuente) {
      const buildPath = new Function("return " + fuente)();
      const out = [];
      Array.prototype.forEach.call(document.querySelectorAll("body *"), function (el) {
        const ruta = buildPath(el);
        let n = -2;
        try { const s = document.querySelectorAll(ruta); n = (s.length === 1 && s[0] === el) ? 1 : s.length; } catch (e) { n = -2; }
        if (n !== 1) out.push({ tag: el.tagName, ruta: ruta, n: n });
      });
      return out;
    }, RUTA_FUENTE);
    assert.deepEqual(malos, [], "elementos cuya ruta no los selecciona: " + JSON.stringify(malos));
  } finally { await b.close(); }
});

/* ── Criterios que han salido del cajón de «juicio humano» ──────────────── */

const medir = async (b, html) => {
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: "load" });
  const m = await p.evaluate(new Function("lim", MEASURE_BODY), 400);
  await p.close();
  return m;
};

test("2.4.11 real: una barra fija que tapa el control enfocado es una falla", { skip }, async () => {
  // El criterio nuevo de WCAG 2.2 que más se incumple sin querer: con el ratón
  // nunca pasa, tabulando sí. Se mide con la sonda de foco que ya existía.
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, `<!doctype html><html lang="es"><body>
      <div style="position:fixed;top:0;left:0;right:0;height:80px;background:#222;z-index:9">Aviso de cookies</div>
      <button style="position:absolute;top:10px;left:10px">Aceptar todo</button></body></html>`);
    const f = m.filter((x) => x.crit === "2.4.11");
    assert.equal(f.length, 1, JSON.stringify(m.filter((x) => x.crit === "2.4.11")));
    assert.equal(f[0].verdict, "falla");
    assert.match(f[0].detail, /COMPLETAMENTE tapado/);
    assert.ok(f[0].path, "la barrera tiene que llevar su selector");
  } finally { await b.close(); }
});

test("2.4.11 real: sin nada fijo por encima, no se inventa el criterio", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, '<!doctype html><html lang="es"><body><p>t</p><button>Enviar</button></body></html>');
    assert.deepEqual(m.filter((x) => x.crit === "2.4.11"), []);
  } finally { await b.close(); }
});

test("2.4.11 real: un control DENTRO de la barra fija no se acusa a sí mismo", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, `<!doctype html><html lang="es"><body>
      <div style="position:fixed;top:0;left:0;right:0;height:60px;background:#222">
        <button>Cerrar aviso</button></div><p>contenido</p></body></html>`);
    assert.deepEqual(m.filter((x) => x.crit === "2.4.11"), []);
  } finally { await b.close(); }
});

test("1.4.1 real: el enlace solo-color se detecta en un navegador de verdad", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, `<!doctype html><html lang="es"><head><style>a{color:#06c;text-decoration:none}</style></head>
      <body><p>Lee nuestra <a href="/p">política de privacidad</a> antes de continuar con el registro.</p></body></html>`);
    const f = m.filter((x) => x.crit === "1.4.1");
    assert.equal(f[0].verdict, "falla", JSON.stringify(f));
    assert.match(f[0].detail, /política de privacidad/);
  } finally { await b.close(); }
});
