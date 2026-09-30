import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRendered } from "../../src/index.js";

// Sonda de navegador. Permite PW_CHROMIUM para apuntar a un Chromium concreto (CI/nube).
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions);
  await b.close();
} catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador (npx playwright install chromium): " + why;

test("render real: mide contraste con estilos reales y detecta el fallo compuesto", { skip }, async () => {
  // Texto blanco sobre un fondo translúcido negro sobre blanco: el contraste REAL falla.
  const html = '<button style="background:rgba(0,0,0,0.4);color:#fff;font-size:14px">Guardar cambios</button>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const c = out.measurements.find((m) => m.crit === "1.4.3");
  assert.ok(c, "debería medir 1.4.3");
  assert.equal(c.verdict, "falla");
  // 2.1.1 sobre un botón nativo pasa (foco real)
  assert.ok(out.measurements.some((m) => m.crit === "2.1.1" && m.verdict === "pasa"));
});

test("render real: fondo con degradado → contraste 'revisar' (no medible)", { skip }, async () => {
  const html = '<a href="#" style="background:linear-gradient(#111,#222);color:#eee">Menú del sitio</a>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const c = out.measurements.find((m) => m.crit === "1.4.3");
  assert.ok(c && c.verdict === "revisar");
});

/* ── Regresión: dos formas de declarar conforme lo que no lo es ─────────────
 *
 * Las dos salieron de la segunda ronda de revisión del motor y las dos se
 * reprodujeron contra Chromium antes de tocar nada. Las dos exportaban como
 * conforme una barrera total, que es el único error que este motor no se puede
 * permitir.
 */

test("regresión: un indicador de foco INVISIBLE no pasa 2.4.7", { skip }, async () => {
  /* La comparación del antes y el después era una CADENA, y cualquier diferencia
   * textual contaba como indicador visible. Cinco indicadores literalmente
   * invisibles salían los cinco «pasa · cambio visible al enfocar». Los cuatro
   * últimos botones son el control: indicadores de verdad, uno por canal, que no
   * pueden salir en rojo. */
  const html = `<style>
    body{background:#fff;color:#111} button{background:#eee;border:1px solid #888}
    button:focus{outline:none}
    #a:focus{ outline: 2px solid transparent }
    #b:focus{ outline: 3px solid rgba(0,0,0,0) }
    #c:focus{ box-shadow: 0 0 0 3px rgba(0,0,0,0) }
    #d:focus{ border-color: #fff }
    #e:focus{ outline: 1px solid #fff }
    #f:focus{ outline: 2px solid #0b5ed7 }
    #g:focus{ box-shadow: 0 0 0 3px #0b5ed7 }
    #h:focus{ border-color: #0b5ed7 }
    #i:focus{ background: #0b5ed7; color: #fff }
  </style><main><h1>Foco</h1><p>
    <button id="a">A</button> <button id="b">B</button> <button id="c">C</button>
    <button id="d">D</button> <button id="e">E</button> <button id="f">F</button>
    <button id="g">G</button> <button id="h">H</button> <button id="i">I</button>
  </p></main>`;
  const out = await analyzeRendered({ html }, { launchOptions });
  const v = {};
  out.measurements.filter((m) => m.crit === "2.4.7").forEach((m) => { v[m.node] = m; });

  ["a", "b", "c", "d", "e"].forEach((id) => {
    const m = v["button#" + id];
    assert.ok(m, "falta la medición de 2.4.7 para #" + id);
    assert.equal(m.verdict, "falla", "#" + id + " no tiene indicador visible y salió «" + m.verdict + "»: " + m.detail);
    assert.match(m.detail, /NO se ve/);
  });
  ["f", "g", "h", "i"].forEach((id) => {
    const m = v["button#" + id];
    assert.equal(m.verdict, "pasa", "#" + id + " SÍ tiene indicador y no puede salir en rojo: " + m.detail);
  });
  // Y la barrera llega al informe con su gravedad, no solo a la lista de medidas.
  const f = out.findings.find((x) => x.c.n === "2.4.7" && x.verdict === "falla");
  assert.ok(f, "el 2.4.7 medido tiene que llegar a los hallazgos");
  assert.equal(f.sev, "grave");
});

test("regresión: 1.4.3 no se mide contra un fondo que no es el que se pinta", { skip }, async () => {
  /* `bgBehind` sube por la ASCENDENCIA del DOM, que no es el orden de pintado. El
   * rótulo se dibuja ENCIMA de la foto sin ser descendiente suyo, así que se medía
   * contra el blanco del body: «pasa · ratio 17.40:1 … sobre rgb(255 255 255)»
   * cuando el contraste real es 1.06:1. Texto invisible declarado conforme. */
  const html = `<style>
    body{background:#fff;color:#111}
    .cartel{position:relative;height:300px}
    .foto{position:absolute;inset:0;background:#141418}
    .rotulo{position:absolute;top:120px;left:20px;color:#1a1a1a;font-size:20px}
  </style><main><h1>Cartel</h1>
  <div class="cartel"><div class="foto"></div><div class="rotulo">Reclamo sobre la foto</div></div></main>`;
  const out = await analyzeRendered({ html }, { launchOptions });
  const m = out.measurements.find((x) => x.crit === "1.4.3" && /rotulo/.test(x.node));
  assert.ok(m, "el rótulo tiene que medirse");
  assert.notEqual(m.verdict, "pasa", "no puede declararse conforme contra un fondo que no es el suyo: " + m.detail);
  assert.equal(m.verdict, "revisar");
  assert.match(m.detail, /lo que se pinta detrás no es lo que dice el marcado/);
  assert.match(m.detail, /div\.foto/, "y se dice QUÉ lo tapa, para poder ir a mirarlo");

  // Control: un texto cuyo fondo sí es el de sus antepasados se sigue midiendo.
  const normal = await analyzeRendered({
    html: '<main style="background:#fff"><p style="color:#767676;font-size:16px">Texto gris sobre blanco</p></main>'
  }, { launchOptions });
  const n = normal.measurements.find((x) => x.crit === "1.4.3" && /p/.test(x.node));
  assert.ok(n && n.verdict !== "revisar", "el arreglo no puede dejar de medir lo medible: " + JSON.stringify(n));
});

/* ── Regresión: tres fallos más de la capa que corre en el navegador ─────────── */

test("regresión: una fase caída no hace desaparecer criterios del informe", { skip }, async () => {
  /* Había tres `catch` vacíos seguidos y una salida sin campo de errores. Si la fase
   * del cuaderno reventaba —basta un script que envuelva `document.styleSheets` para
   * que lance, el patrón de los scripts de consentimiento y anti-bot—, `cuaderno`
   * quedaba en `null`, `aplicaCuaderno` no corría y OCHO criterios desaparecían de
   * `findings`: ni hallazgo, ni `revisar`, ni nota. En un IRA, un criterio que no está
   * es un criterio del que nadie sabe que no se comprobó. */
  const cuerpo = '<main><h1>Página</h1><p>Texto con <a href="/x">un enlace al detalle</a>.</p>' +
    '<form><label for="n">Nombre</label><input id="n" autocomplete="name"></form></main>';
  const sabotaje = '<script>Object.defineProperty(document,"styleSheets",{get:function(){throw new Error("bloqueado");}});</script>';

  const sano = await analyzeRendered({ html: cuerpo }, { launchOptions, pageScope: true });
  const roto = await analyzeRendered({ html: cuerpo + sabotaje }, { launchOptions, pageScope: true });

  const crits = (o) => new Set(o.findings.map((f) => f.c.n));
  const A = crits(sano), B = crits(roto);
  const perdidos = [...A].filter((c) => !B.has(c));
  assert.deepEqual(perdidos, [], "ningún criterio puede desaparecer en silencio: " + JSON.stringify(perdidos));

  // Y lo que falló se dice, por dos vías: el error y la nota de cobertura.
  assert.ok(Array.isArray(roto.errores), "la salida tiene que traer `errores`, como viewportAnalyze");
  assert.ok(roto.errores.some((e) => e.capa === "cuaderno"), JSON.stringify(roto.errores));
  assert.ok(roto.coberturas.some((c) => /CSS no legible/.test(c.label)),
    "y una nota de cobertura: " + JSON.stringify(roto.coberturas.map((c) => c.label)));
  assert.match(roto.coberturas.find((c) => /CSS no legible/.test(c.label)).detail, /2\.3\.1/,
    "diciendo qué criterio se queda corto por esto");
});

test("regresión: un enlace conforme a G183 no es una barrera de 1.4.1", { skip }, async () => {
  /* G183 es técnica SUFICIENTE: 3:1 con el texto de alrededor más una señal visual
   * adicional al foco o al puntero. Solo se miraba el estado en reposo, así que un
   * enlace que hace exactamente eso salía `falla` grave. */
  const html = `<style>
    body{background:#fff;color:#111;font:16px/1.6 system-ui}
    p.g183 a{color:#0b5ed7;text-decoration:none}
    p.g183 a:hover, p.g183 a:focus{text-decoration:underline solid 2px}
    p.igual{color:#222} p.igual a{color:#222;text-decoration:none}
  </style><main><h1>Color</h1>
  <p class="g183">Texto normal con <a href="/a">un enlace conforme a G183</a> dentro.</p>
  <p class="igual">Texto con <a href="/b">un enlace del mismo color</a> dentro.</p></main>`;
  const out = await analyzeRendered({ html }, { launchOptions });
  const m141 = out.measurements.filter((x) => x.crit === "1.4.1");
  assert.ok(!m141.some((x) => /G183/.test(x.node) || /conforme a G183/.test(x.detail)),
    "el enlace de G183 no puede salir señalado: " + JSON.stringify(m141.map((x) => x.detail.slice(0, 60))));
  assert.equal(m141.length, 1, "solo el del mismo color: " + JSON.stringify(m141.map((x) => x.detail.slice(0, 50))));
  /* Y la evidencia deja de afirmar una comparación que no hacía: decía «sin ningún
   * distintivo SALVO EL COLOR» también cuando el enlace es del mismo color que el
   * texto —medido, 1.00:1—, donde el color no distingue nada y el caso es peor. */
  assert.match(m141[0].detail, /sin NINGÚN distintivo/);
  assert.match(m141[0].detail, /1\.00:1|mismo color/);
});

test("regresión: 2.4.11 no acusa a lo que se pinta DETRÁS, y sí ve lo que tapa", { skip }, async () => {
  /* `elementosFlotantes` recogía el `z-index` y no lo leía nunca, así que una marca
   * de agua `fixed; inset:0; z-index:-1` —que se pinta detrás de todo— cruzaba su
   * rectángulo con cualquier control y producía un `falla` grave por cada uno. Y la
   * barrera de verdad no se emitía: el foco se ponía con `preventScroll`, así que el
   * rect de los controles de más abajo no era el que tienen al tabular hasta ellos. */
  const html = `<style>
    body{background:#fff;color:#111;font:16px/1.6 system-ui;margin:0}
    .marca{position:fixed;inset:0;z-index:-1;background:#fafafa}
    .barra{position:sticky;top:0;background:#fff}
    .relleno{height:2000px}
    .cookies{position:fixed;left:0;right:0;bottom:0;height:140px;background:#222;color:#fff}
  </style><main>
  <div class="marca"></div><h1>Foco</h1>
  <div class="barra"><a href="/c">Enlace de la barra</a></div>
  <div class="relleno"></div>
  <p><a href="/ultimo">Enlace último del documento</a></p>
  </main><div class="cookies">Usamos cookies</div>`;
  const out = await analyzeRendered({ html }, { launchOptions });
  const m = out.measurements.filter((x) => x.crit === "2.4.11");
  assert.ok(!m.some((x) => /div\.marca/.test(x.detail)),
    "nada que se pinte detrás puede tapar: " + JSON.stringify(m.map((x) => x.detail.slice(0, 70))));
  assert.ok(m.some((x) => x.verdict === "falla" && /div\.cookies/.test(x.detail)),
    "y la barra de cookies sí tapa el último enlace al tabular hasta él: " + JSON.stringify(m.map((x) => x.verdict + " " + x.detail.slice(0, 60))));
});
