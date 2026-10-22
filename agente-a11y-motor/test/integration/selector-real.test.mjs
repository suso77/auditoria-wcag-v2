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

/**
 * LA CAPA DE PÁGINA TAMBIÉN, que es la que más criterios cubre y la que no tenía
 * ni rutas. Emitía nodos con `locator` y sin `path` en sus 29 sitios: medido
 * sobre una auditoría real de 12 páginas, 6 de 140 filas sin selector, 4 de
 * ellas suyas. Y al ponérselas salió el defecto de debajo: `buildPath`
 * prefijaba siempre `html > body`, así que el `<title>`, el meta de viewport y
 * el de refresco salían con rutas que seleccionan 0 elementos.
 *
 * Aquí se comprueba lo único que vale: que cada ruta SELECCIONE, en un navegador
 * de verdad, un único elemento, y que sea el que dice ser.
 */
test("selector real: cada ruta de la capa de PÁGINA selecciona un único elemento", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const { auditPageHtml } = await import("../../src/index.js");
    const CON_CABEZA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title>
<meta http-equiv="refresh" content="30"><meta name="viewport" content="width=device-width,user-scalable=no">
</head><body>
<a href="#main">Saltar al contenido principal</a>
<header><nav><ul><li><a href="/">Inicio</a></li></ul></nav></header>
<header><p>segundo banner</p></header>
<main id="main-content"><h1>T</h1><h4>salto</h4><h2></h2>
  <p>Texto con <strong id="f1">una palabra fuerte</strong>.</p>
  <video src="/v.mp4"></video><audio src="/a.mp3" autoplay></audio>
</main>
<main id="main">segundo main</main>
<footer>uno</footer><footer>dos</footer></body></html>`;
    const p = await b.newPage();
    await p.setContent(CON_CABEZA, { waitUntil: "load" });
    const fs = auditPageHtml(CON_CABEZA, DOMParser);
    const nodos = [];
    fs.forEach(function (f) { (f.nodes || []).forEach(function (nd) { if (nd.path) nodos.push({ nd: nd, crit: f.c.n }); }); });
    assert.ok(nodos.length >= 8, "la capa de página debería producir varios nodos con ruta, hay " + nodos.length);

    const res = await resolver(p, nodos.map(function (x) { return x.nd.path; }));
    const malos = [];
    res.forEach(function (r, i) {
      const x = nodos[i];
      if (r.n !== 1) malos.push(x.crit + " · " + x.nd.locator + " → «" + r.ruta + "» selecciona " + r.n);
      else {
        // Y que sea el elemento que dice ser: el locator lleva la etiqueta delante.
        const etiqueta = String(x.nd.locator).split(/[#.[\s]/)[0];
        if (etiqueta && /^[a-z]+$/.test(etiqueta) && r.tag !== etiqueta) {
          malos.push(x.crit + " · dice «" + x.nd.locator + "» y la ruta cae en <" + r.tag + ">");
        }
      }
    });
    assert.deepEqual(malos, [], malos.join("  |  "));
    // Y al menos una ruta del <head>, que es el caso que estaba roto.
    assert.ok(res.some(function (r) { return /^html > head/.test(r.ruta); }),
      "el fixture tiene meta de refresco y viewport: alguna ruta tiene que ser del <head>");
    await p.close();
  } finally { await b.close(); }
});

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
    /* El hallazgo apunta al elemento que TAPA, no al tapado, y nombra a los
     * afectados dentro. Antes apuntaba al control y se repetía por cada uno: con
     * esta misma barra en una página alta salían 17 filas, y en un sitio real 165
     * en 8 páginas, todas de la misma causa. El veredicto no ha cambiado —la
     * barrera es real—; lo que ha cambiado es que se cuenta una vez. */
    assert.match(f[0].node, /^div/, "el hallazgo señala la barra: " + f[0].node);
    assert.match(f[0].detail, /tapa POR COMPLETO/);
    assert.match(f[0].detail, /button/, "y nombra al control afectado: " + f[0].detail);
    assert.match(f[0].detail, /scroll-padding-top/, "y dice cómo se arregla: " + f[0].detail);
    assert.ok(f[0].path, "la barrera tiene que llevar su selector");
  } finally { await b.close(); }
});

test("2.4.11 real: sin nada fijo por encima, no se inventa el criterio", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, '<!doctype html><html lang="es"><body><p>t</p><button>Enviar</button></body></html>');
    /* Lo que defiende este test es que no se INVENTE una barrera, no que el
       criterio se calle: desde v0.37.0 emite la afirmación positiva —se ha
       recorrido cada control y nada lo tapa—, porque un criterio en blanco se
       lee en la hoja de seguimiento igual que uno conforme. */
    const f = m.filter((x) => x.crit === "2.4.11");
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].verdict, "pasa");
    assert.doesNotMatch(f[0].detail, /tapa POR COMPLETO|queda(n)? tapado/);
  } finally { await b.close(); }
});

test("2.4.11 real: un control DENTRO de la barra fija no se acusa a sí mismo", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const m = await medir(b, `<!doctype html><html lang="es"><body>
      <div style="position:fixed;top:0;left:0;right:0;height:60px;background:#222">
        <button>Cerrar aviso</button></div><p>contenido</p></body></html>`);
    // Igual que arriba: lo que no puede pasar es que la barra se acuse de taparse
    // a sí misma. Que el criterio se pronuncie a favor sí tiene que pasar.
    const f = m.filter((x) => x.crit === "2.4.11");
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].verdict, "pasa");
    assert.doesNotMatch(f[0].detail, /tapa POR COMPLETO|queda(n)? tapado/);
  } finally { await b.close(); }
});

/* ── 2.4.11: una causa, un hallazgo, y las dos direcciones de tabulación ──── */

/**
 * Página alta con muchos controles y UN elemento fijo, que es el montaje con el
 * que se vio el problema de verdad: la barra de cookies de un sitio real
 * (`fixed`, al pie, 150 px, `rgba(255,255,255,.95)`) producía 165 filas de
 * 2.4.11 en 8 páginas, todas de la misma causa. Las barreras eran ciertas; el
 * recuento, inútil.
 */
const ALTA = (extra) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Alta</title><style>
 body { margin:0; font:16px system-ui; color:#111; background:#fff; }
 #barra { position: fixed; inset: auto 0 0; height: 150px; background: rgba(255,255,255,.95); z-index: 99; }
 a { display:block; margin: 60px 20px; color:#0a3; }
 ${extra || ""}
</style></head><body>
<div id="barra">Usamos cookies.</div>
${Array.from({ length: 24 }, (_, i) => `<a href="/p${i}" id="e${i}">Enlace ${i}</a>`).join("")}
</body></html>`;

/**
 * LA CUENTA DEL AGENTE TIENE QUE SER LA DEL TECLADO, y esto la mide pulsando.
 *
 * Las dos aserciones que había aquí pedían `n >= 10`, y el 10 venía de un modelo
 * equivocado: el bloque anterior sacaba el control de la ventana y lo traía con
 * `scrollIntoView({block:"nearest"})`, apoyado en que «nearest es lo que hace el
 * navegador al tabular». No lo es. Chromium no desplaza si el control ya se ve, y
 * si no se ve lo CENTRA. Medido sobre esta misma página de 24 enlaces, con
 * pulsaciones de Tab y Mayús+Tab de verdad contra el modelo que había:
 *
 *     barra fija al pie ......  teclado  5  ·  modelo «nearest» 17
 *     cabecera pegajosa ......  teclado  4  ·  modelo «nearest» 17
 *
 * Así que lo que aquí se guardaba era el número inflado. La INTENCIÓN de las dos
 * sigue en pie y es la que importa —que el recuento se diga, y que la dirección
 * de subida cuente (midiendo solo hacia abajo se acusaba UN control)—, pero no se
 * guarda con un umbral a dedo: se guarda contra el teclado. Si un cambio futuro
 * vuelve a inflar la cuenta o deja de ver la subida, esto se pone rojo.
 */
async function tapadosConTeclado(b, html, flotSel) {
  const vistos = new Set();
  for (const arriba of [false, true]) {
    /* La MISMA ventana que `medir`, sin viewport explícito. Con 1280×1024 aquí y
     * el 1280×720 de ahí la cuenta no puede coincidir: cuántos controles tapa un
     * elemento fijo depende del alto de la ventana. Costó un rojo que parecía del
     * agente y era de este helper. */
    const p = await b.newPage();
    await p.setContent(html, { waitUntil: "load" });
    if (arriba) await p.evaluate(() => { const l = document.querySelectorAll("a[href]"); l[l.length - 1].focus(); });
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press(arriba ? "Shift+Tab" : "Tab");
      await p.waitForTimeout(20);
      const r = await p.evaluate((sel) => {
        const el = document.activeElement;
        if (!el || el.tagName !== "A") return null;
        const fl = document.querySelector(sel);
        if (!fl) return null;
        const f = fl.getBoundingClientRect(), c = el.getBoundingClientRect();
        if (!(c.width > 0 && c.height > 0)) return null;
        const s = Math.max(0, Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top));
        return { id: el.id, frac: c.height ? s / c.height : 0 };
      }, flotSel);
      if (r && r.frac >= 0.999) vistos.add(r.id);
    }
    await p.close();
  }
  return vistos.size;
}

test("2.4.11 real: una barra fija es UN hallazgo y la cuenta es la del teclado", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const html = ALTA();
    const m = await medir(b, html);
    const f = m.filter((x) => x.crit === "2.4.11");
    assert.equal(f.length, 1, "una causa, una fila; salieron " + f.length);
    assert.equal(f[0].verdict, "falla");
    assert.equal(f[0].node, "div#barra");
    // El recuento está en la evidencia: es lo que mide la gravedad.
    const n = Number(/: (\d+) control/.exec(f[0].detail)[1]);
    const real = await tapadosConTeclado(b, html, "#barra");
    assert.ok(real > 0, "el montaje tiene que tapar de verdad al tabular; el teclado dijo " + real);
    assert.equal(n, real, "el agente dice " + n + " y el teclado " + real);
    assert.match(f[0].detail, /Es UNA causa, no \d+ barreras distintas/);
    assert.match(f[0].detail, /scroll-padding-bottom` mayor que los 150 px/);
  } finally { await b.close(); }
});

test("2.4.11 real: una cabecera pegajosa tapa el foco al subir con Mayús+Tab", { skip }, async () => {
  /* Bajando no se tapa NADA en este montaje: el navegador centra el control al
   * traerlo. Lo que tapa es subir, porque entonces el control entra por arriba,
   * que es donde está la cabecera. Si la pasada de subida se perdiera, la cuenta
   * caería a cero y esto se pondría rojo. */
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const html = ALTA("#barra { inset: 0 0 auto; height: 120px; }");
    const m = await medir(b, html);
    const f = m.filter((x) => x.crit === "2.4.11");
    assert.equal(f.length, 1, JSON.stringify(f));
    assert.equal(f[0].verdict, "falla");
    const n = Number(/: (\d+) control/.exec(f[0].detail)[1]);
    const real = await tapadosConTeclado(b, html, "#barra");
    assert.ok(real > 0, "la cabecera tiene que tapar al subir; el teclado dijo " + real);
    assert.equal(n, real, "el agente dice " + n + " y el teclado " + real);
    assert.match(f[0].detail, /scroll-padding-top/, "y el hueco se reserva por arriba");
  } finally { await b.close(); }
});

test("2.4.11 real: el modelo «nearest» que había inflaba la cuenta (regresión v0.76.0)", { skip }, async () => {
  /* Esta es la medición que motivó el cambio, puesta como guardia para que no
   * vuelva. El modelo anterior dejaba todos los controles en `top=0` —una
   * posición que el navegador no produce— y de ahí salía el recuento. Aquí se
   * reconstruye ese modelo a mano y se comprueba que acusa a MÁS de los que
   * acusa el teclado: si alguien volviera a él, la diferencia reaparecería. */
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const html = ALTA("#barra { inset: 0 0 auto; height: 120px; }");
    const real = await tapadosConTeclado(b, html, "#barra");
    const p = await b.newPage();   // la misma ventana que `medir` y que el teclado
    await p.setContent(html, { waitUntil: "load" });
    const nearest = await p.evaluate(() => {
      const flot = () => document.querySelector("#barra").getBoundingClientRect();
      let n = 0;
      document.querySelectorAll("a[href]").forEach(function (el) {
        const r0 = el.getBoundingClientRect(), absTop = r0.top + window.scrollY, alto = r0.height;
        let peor = 0;
        [true, false].forEach(function (abajo) {
          window.scrollTo(0, abajo ? Math.max(0, absTop - window.innerHeight - 1) : absTop + alto + 1);
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          const c = el.getBoundingClientRect(), f = flot();
          const s = Math.max(0, Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top));
          const fr = c.height ? s / c.height : 0;
          if (fr > peor) peor = fr;
        });
        if (peor >= 0.999) n++;
      });
      return n;
    });
    await p.close();
    assert.ok(nearest > real, "el modelo «nearest» acusaba a " + nearest + " y el teclado a " + real + ": si esto deja de cumplirse, revisa la premisa, no el test");
  } finally { await b.close(); }
});

test("2.4.11 real: si el sitio reserva el hueco, no se le acusa de lo que no es", { skip }, async () => {
  /* Quien pone `scroll-padding-bottom` ha hecho los deberes, y el agente no puede
   * cobrárselo igual. No se simula: se saca el control de la ventana y se deja que
   * el navegador lo traiga, que es quien aplica el `scroll-padding`. */
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  try {
    const sin = await medir(b, ALTA());
    const con = await medir(b, ALTA("html { scroll-padding-bottom: 170px; }"));
    const nDe = (m) => {
      const f = m.filter((x) => x.crit === "2.4.11");
      return f.length ? Number(/: (\d+) control/.exec(f[0].detail)[1]) : 0;
    };
    assert.ok(nDe(con) < nDe(sin) / 3, "con hueco reservado " + nDe(con) + ", sin él " + nDe(sin));
    /* Queda el último enlace, y es verdad: al final del documento no hay sitio
     * donde seguir desplazando, así que ni con hueco reservado se aparta de la
     * barra. Eso se dice con el arreglo que toca, no repitiendo el de siempre. */
    const f = con.filter((x) => x.crit === "2.4.11");
    if (f.length) assert.match(f[0].detail, /El hueco ya está reservado/);
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
