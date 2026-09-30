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
