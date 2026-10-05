import { test } from "node:test";
import assert from "node:assert/strict";
import { dynamicAnalyze } from "../../src/index.js";

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try { const { chromium } = await import("playwright"); const b = await chromium.launch(launchOptions); await b.close(); }
catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador: " + why;

test("dinámico real: disclosure roto (aria-expanded no cambia) → falla 4.1.2", { skip }, async () => {
  // Botón que NO actualiza aria-expanded al pulsar.
  const html = '<button aria-expanded="false" aria-controls="p">Opciones</button><div id="p" hidden>contenido</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  assert.ok(out.findings.some((f) => f.c.n === "4.1.2" && f.verdict === "falla"));
});

test("dinámico real: disclosure correcto → 4.1.2 cumple", { skip }, async () => {
  const html = '<button id="b" aria-expanded="false" aria-controls="p" onclick="var p=document.getElementById(\'p\');var e=this.getAttribute(\'aria-expanded\')===\'true\';this.setAttribute(\'aria-expanded\',String(!e));p.hidden=e;">Opciones</button><div id="p" hidden>contenido</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  assert.ok(out.findings.some((f) => f.c.n === "4.1.2" && f.verdict === "cumple"));
});

test("dinámico real: control div+onclick no se alcanza tabulando → falla 2.1.1", { skip }, async () => {
  const html = '<button>Real</button><div role="button" onclick="x()">Falso</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  // el div[role=button] sin tabindex no entra en el orden de Tab
  assert.ok(out.findings.some((f) => f.c.n === "2.1.1"));
});

/* ── 2.2.2: el carrusel que mueve JavaScript ─────────────────────────────── */

/**
 * El hueco que dejó ver una auditoría real: la medición sobre el render lee
 * `animationName` y `animationIterationCount`, así que ve los carruseles hechos con
 * `@keyframes` y no ve los que mueve JavaScript, que son la mayoría. En ese sitio el
 * carrusel de la portada pasó sin que nadie lo cazara y en su lugar se acusó a un
 * icono con `fadeInDown`, lo único que el CSS declaraba.
 *
 * El carrusel de aquí es el de siempre: `setInterval` que quita una clase y la pone
 * en la siguiente diapositiva. No declara ninguna animación.
 */
const CARRUSEL = (conPausa) => `
<style>.slide{display:none}.slide.activa{display:block}</style>
<div id="carrusel">
  <div class="slide activa">Uno</div><div class="slide">Dos</div><div class="slide">Tres</div>
  ${conPausa ? '<button id="pausa" aria-label="Pausar el carrusel">Pausar</button>' : ""}
</div>
<main><h1>T</h1><p>contenido</p></main>
<script>
 var i=0, s=document.querySelectorAll('.slide');
 var t=setInterval(function(){ s[i].classList.remove('activa'); i=(i+1)%s.length; s[i].classList.add('activa'); }, 1200);
 ${conPausa ? "document.getElementById('pausa').onclick=function(){ clearInterval(t); };" : ""}
</script>`;

test("dinámico real: un carrusel de JavaScript sin pausa → falla 2.2.2", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CARRUSEL(false) }, { launchOptions, forms: "off", movimientoMs: 7000, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.2.2");
  assert.equal(f.length, 1, JSON.stringify(f.map((x) => x.verdict)));
  assert.equal(f[0].verdict, "falla");
  assert.match(f[0].evid.join(" "), /SIN tocar nada/);
  assert.match(f[0].evid.join(" "), /ningún control de pausa/);
  assert.ok(out.trace.movimiento && out.trace.movimiento.movidos >= 1, JSON.stringify(out.trace.movimiento));
});

test("dinámico real: el mismo carrusel con un botón de pausa queda a revisar", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CARRUSEL(true) }, { launchOptions, forms: "off", movimientoMs: 7000, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.2.2");
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid.join(" "), /button#pausa/);
});

test("dinámico real: una página quieta no inventa movimiento", { skip }, async () => {
  // Con un `lazy-load` al entrar, que es lo que distingue el filtro: varios
  // cambios repartidos en el tiempo, no una ráfaga al cargar.
  const html = '<main><h1>T</h1><p id="p">x</p><button>Enviar</button></main>' +
    "<script>setTimeout(function(){ document.getElementById('p').className='cargado'; }, 300);</script>";
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 7000, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.2.2");
  // Ni falla ni revisar: el `lazy-load` de la entrada no es movimiento automático.
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"], JSON.stringify(f.map((x) => x.verdict + ": " + x.evid)));
  assert.equal(out.trace.movimiento.movidos, 0);
});

/* ── 2.1.4: las teclas se pulsan de verdad ───────────────────────────────── */

const CON_ATAJO = `<main><h1>T</h1><p>contenido</p>
<div id="busc" hidden><label for="q">Buscar</label><input id="q"></div></main>
<script>document.addEventListener('keydown',function(e){
  if(e.key==='s' && !e.ctrlKey && !e.metaKey && !e.altKey){
    var d=document.getElementById('busc'); d.hidden=false; document.getElementById('q').focus(); } });</script>`;

const CON_MODIFICADOR = `<main><h1>T</h1><p>contenido</p><div id="busc" hidden><input id="q"></div></main>
<script>document.addEventListener('keydown',function(e){
  if(e.key==='s' && e.ctrlKey){ document.getElementById('busc').hidden=false; } });</script>`;

test("dinámico real: un atajo de un carácter con addEventListener se detecta pulsándolo", { skip }, async () => {
  /* El detector del ámbito de página solo ve `onkeydown="…"` en el marcado, así que
   * este atajo —escrito como lo escribe todo el mundo— era invisible y 2.1.4 salía sin
   * evaluar. */
  const out = await dynamicAnalyze({ html: CON_ATAJO }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f"] });
  const f = out.findings.filter((x) => x.c.n === "2.1.4");
  assert.equal(f.length, 1, JSON.stringify(out.trace.teclas));
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /«s»/);
  assert.match(f[0].evid[0], /mueve el foco a «input#q»/);
  assert.equal(out.trace.teclas.activas, 1);
});

test("dinámico real: un atajo que exige Ctrl no se acusa", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CON_MODIFICADOR }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f"] });
  const f = out.findings.filter((x) => x.c.n === "2.1.4");
  assert.equal(f[0].verdict, "cumple-parcial", JSON.stringify(f[0] && f[0].evid));
  assert.equal(out.trace.teclas.activas, 0);
});

test("dinámico real: con `teclas: false` la fase no corre y no se dice nada de 2.1.4", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CON_ATAJO }, { launchOptions, forms: "off", movimientoMs: 0, teclas: false });
  assert.deepEqual(out.findings.filter((x) => x.c.n === "2.1.4"), []);
  assert.equal(out.trace.teclas, null);
});

test("dinámico real: una página quieta DICE que se la observó, con los segundos", { skip }, async () => {
  /* El caso que faltaba por decir: sin este hallazgo, «observada 8 s y nada se mueve»
   * y «no se observó» quedaban idénticos en el informe. */
  const html = '<main><h1>T</h1><p>Un párrafo quieto.</p><button>Enviar</button></main>';
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 6000, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.2.2");
  assert.equal(f.length, 1, JSON.stringify(out.trace.movimiento));
  assert.equal(f[0].verdict, "cumple-parcial");
  assert.match(f[0].evid[0], /Observada la página 6\.\d s SIN tocar nada/);
});

/* ── 4.1.3 fuera del formulario, en un navegador de verdad ──────────────── */

const ESTADO = (extra, script) => `<main><h1>T</h1>
<button id="b" aria-expanded="false" aria-controls="p">Filtros</button>
<div id="p" hidden><p>Contenido del panel de filtros, que es contenido y no un mensaje de estado.</p></div>
${extra || ""}</main>
<script>document.getElementById('b').onclick=function(){ var p=document.getElementById('p');
 var e=this.getAttribute('aria-expanded')==='true'; this.setAttribute('aria-expanded',String(!e)); p.hidden=e;
 ${script || ""} };</script>`;

test("dinámico real: un acordeón que solo abre su panel NO es un mensaje de estado", { skip }, async () => {
  /* La trampa de esta medición: lo que un `[aria-expanded]` revela dentro de su
   * propio panel es contenido por definición, y acusarlo convertiría cualquier
   * acordeón correcto en una barrera de 4.1.3. Se descuenta por `aria-controls`. */
  const out = await dynamicAnalyze({ html: ESTADO("", "") }, { launchOptions, forms: "off", movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "4.1.3");
  // Ni falla ni revisar: se pulsó y no apareció nada fuera del panel. Y se dice, que
  // no es lo mismo que callarse.
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"], JSON.stringify(f.map((x) => x.evid)));
  assert.equal(out.trace.mensajesDeEstado, 0);
  assert.equal(out.trace.expandibles, 1);
});

test("dinámico real: «3 resultados encontrados» fuera de una región live → revisar 4.1.3", { skip }, async () => {
  const html = ESTADO('<p id="res"></p>', "document.getElementById('res').textContent='3 resultados encontrados';");
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "4.1.3");
  assert.equal(f.length, 1, JSON.stringify(out.trace.mensajesDeEstado));
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /3 resultados encontrados/);
});

test("dinámico real: el mismo texto dentro de un role=status se cuenta como anunciado", { skip }, async () => {
  const html = ESTADO('<p id="res" role="status"></p>', "document.getElementById('res').textContent='3 resultados encontrados';");
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "4.1.3");
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "cumple-parcial", JSON.stringify(f[0].evid));
  assert.match(f[0].evid[0], /ninguno queda sin anunciar/);
});
