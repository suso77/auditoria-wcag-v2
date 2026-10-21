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

/* ── 2.1.4: la sonda mide también sus propias condiciones (v0.60.0) ──────── */

/**
 * Estos dos fixtures son los que midieron el defecto antes de arreglarlo, y lo que
 * dieron con v0.59.0, tres pasadas cada uno, sin una sola variación:
 *
 *   CRECE_SOLA  → `revisar` acusando a 3 y 4 teclas de ser atajos de página,
 *                 cuando el fixture no tiene NI UN manejador de teclado;
 *   ATAJO_TRAMPA→ `cumple-parcial`, absolviendo un atajo de página que sí existe.
 *
 * Son los dos extremos del mismo agujero: la sonda no medía las condiciones de su
 * propia medida. Con el testigo emparejado y el foco comprobado, el primero deja de
 * acusar y el segundo deja de absolver, y los dos casos que ya estaban bien
 * —atajo real en página quieta, y página quieta sin atajo— no se mueven.
 */
const CRECE_SOLA = `<main><h1>Portada</h1><ul id="l"><li>fila</li></ul></main>
<script>var n=1,l=document.getElementById('l');
 setInterval(function(){ n++;
   if(n%4===0){ l.innerHTML='<li>fila</li>'; }
   else { var i=document.createElement('li'); i.textContent='fila nueva numero '+n+' con bastante texto'; l.appendChild(i); }
 },300);</script>`;

const ATAJO_TRAMPA = `<main><h1>Con atajo</h1>
<div role="dialog"><input id="x" autofocus><button>Aceptar</button></div><p id="p">nada</p></main>
<script>var x=document.getElementById('x');
 x.addEventListener('blur', function(){ setTimeout(function(){ x.focus(); }, 0); });
 document.addEventListener('keydown', function(e){
   var t=e.target||{}, n=(t.tagName||'').toUpperCase();
   if(n==='INPUT'||n==='TEXTAREA'||n==='SELECT'||t.isContentEditable) return;
   if(e.key==='/' && !e.ctrlKey && !e.altKey && !e.metaKey){ document.getElementById('p').textContent='BUSCADOR ABIERTO '.repeat(12); }
 });</script>`;

test("dinámico real: una página que crece sola NO hace que se acuse a sus teclas", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CRECE_SOLA }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f", "j"] });
  const t = out.trace.teclas;
  // El testigo tiene que haber visto el movimiento propio de la página.
  assert.deepEqual(t.ruido, ["pintura"], JSON.stringify(t));
  assert.equal(t.activas, 0, "ninguna tecla puede salir como atajo: el fixture no escucha el teclado");
  assert.ok(t.descartadas > 0, JSON.stringify(t));
  const f = out.findings.filter((x) => x.c.n === "2.1.4");
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /NO se ha podido comprobar/);
  assert.match(f[0].evid[1], /inventarse un atajo/);
});

test("dinámico real: un atajo de página detrás de una trampa de foco NO se absuelve", { skip }, async () => {
  const out = await dynamicAnalyze({ html: ATAJO_TRAMPA }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f", "j"] });
  const t = out.trace.teclas;
  assert.equal(t.fueraDelCuerpo, 4, JSON.stringify(t));
  assert.equal(t.limpias, 0);
  const f = out.findings.filter((x) => x.c.n === "2.1.4");
  assert.equal(f[0].verdict, "revisar", JSON.stringify(f[0] && f[0].evid));
  assert.match(f[0].evid[1], /«input#x»/);
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

/* ── 3.2.1: los dos cambios de contexto que la sonda no veía ─────────────────
 *
 * Medido antes del arreglo, sobre una página con los cuatro casos escritos en
 * los atributos: la capa decía «se han probado 9 control(es) y ninguno provoca
 * navegación, salto de foco ni sustitución de contenido» —`pasa`— sobre una
 * página que falla 3.2.1 dos veces. Dos motivos: abrir una ventana no cambia la
 * URL de esta página, y el foco perdido deja `activeElement` en `<body>`, que
 * la huella leía como «sin foco». Y uno más, el gordo: en cuanto el cortafuegos
 * aborta una navegación el documento pierde el foco, y sin foco de documento
 * Chromium NO despacha los eventos de foco — el `onfocus` ni se ejecuta.
 */
const soloCrit = (out, n) => out.findings.filter((f) => f.c.n === n);

test("dinámico real: onfocus que abre una ventana → falla 3.2.1 (F52), y sin colgárselo a otro", { skip }, async () => {
  const html = '<input id="fecha" onfocus="window.open(\'/cal\')"><input id="codigo" onfocus="this.blur()"><input id="sano">';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  const falla = soloCrit(out, "3.2.1").find((f) => f.verdict === "falla");
  assert.ok(falla, "3.2.1 debería fallar: " + JSON.stringify(soloCrit(out, "3.2.1").map((f) => [f.verdict, f.evid[0].slice(0, 80)])));
  const txt = falla.evid.join(" ");
  assert.match(txt, /ABRE UNA VENTANA/, txt);
  assert.match(txt, /SUELTA/, "el que hace this.blur() es el fallo F55: " + txt);
  // La atribución tiene que ser exacta: el que suelta el foco NO abre ventanas.
  // El evento `popup` del driver se las colgaba al control siguiente, porque el
  // `onfocus` se vuelve a disparar cada vez que el documento recupera el foco.
  const porControl = txt.split("·").find((t) => /codigo/.test(t)) || "";
  assert.ok(!/ABRE UNA VENTANA/.test(porControl), "input#codigo no abre ninguna ventana: " + porControl);
  assert.ok(!/sano/.test(txt), "el control sano no puede salir acusado: " + txt);
});

test("dinámico real: una página sin cambios de contexto no inventa ninguno", { skip }, async () => {
  const html = '<input id="a"><select id="b"><option>1</option><option>2</option></select><input type="checkbox" id="c"><button id="d">Enviar</button>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  ["3.2.1", "3.2.2"].forEach((n) => {
    const fs = soloCrit(out, n);
    assert.ok(fs.length, n + " tiene que pronunciarse");
    assert.ok(!fs.some((f) => f.verdict === "falla" || f.verdict === "revisar"),
      n + " no debería acusar nada: " + JSON.stringify(fs.map((f) => [f.verdict, f.evid[0].slice(0, 100)])));
  });
});

/**
 * «94 DE 93 CONTROL(ES) ALCANZADOS.»
 *
 * Eso salía en la pasada de un sitio real, y leído así parece una cuenta mal
 * hecha. No lo es: el censo de enfocables se toma ANTES de tabular, y el
 * recorrido alcanza lo que haya en ese momento, así que un control que se
 * vuelve enfocable durante el camino se alcanza sin estar censado.
 *
 * La página de aquí es de respuesta sabida: un botón que al RECIBIR EL FOCO
 * añade tres enlaces. Censados 2, alcanzados 5. El número no se toca —es
 * verdad—, se explica; y además dice algo que interesa, que la página cambia
 * al tabularla.
 */
const MENU_QUE_APARECE = `
<button id="b">Menú</button>
<div id="m"></div>
<a href="#fin">Final</a>
<script>
document.getElementById("b").addEventListener("focus", function () {
  if (document.getElementById("m").children.length) return;
  for (var i = 1; i <= 3; i++) {
    var a = document.createElement("a");
    a.href = "#x" + i; a.textContent = "Opción " + i;
    document.getElementById("m").appendChild(a);
  }
});
</script>`;

test("2.1.2 real: si aparecen controles al tabular, se dice — no «5 de 2»", { skip }, async () => {
  const out = await dynamicAnalyze({ html: MENU_QUE_APARECE }, { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.find((x) => x.c.n === "2.1.2");
  assert.ok(f, "2.1.2 tiene que pronunciarse");
  const t = f.evid.join(" ");
  assert.match(t, /más de los 2 que estaban censados/, "se explica, en vez de dar un «de» imposible");
  assert.match(t, /enfocable durante el recorrido/);
  assert.doesNotMatch(t, /5 de 2/, "eso era lo que parecía un error de cuenta");
});

test("2.1.2 real: sin controles que aparezcan, la frase sigue siendo la de siempre", { skip }, async () => {
  const out = await dynamicAnalyze({ html: '<button>Uno</button><a href="#x">Dos</a>' },
    { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.find((x) => x.c.n === "2.1.2");
  assert.ok(f);
  assert.match(f.evid.join(" "), /de 2 control\(es\) alcanzados/);
});

/**
 * LA MISMA PÁGINA, DOS VEREDICTOS OPUESTOS.
 *
 * Esto no salió de leer código: salió de comparar dos pasadas seguidas del
 * mismo sitio. Una página de monumentos dio, con la misma ventana de 8 s:
 *
 *   pasada 8:  cumple-parcial — «observada 8,0 s: ningún elemento cambia por su cuenta»
 *   pasada 9:  falla grave    — «3 elemento(s) cambian solos: div.swiper-slide
 *                               (20 cambios entre el segundo 2,4 y el 7,7) …»
 *
 * El carrusel es el mismo. Lo que cambió es CUÁNDO ARRANCÓ: Swiper espera a que
 * carguen las imágenes, así que con la red más lenta no empieza dentro de la
 * ventana. El veredicto de un criterio de nivel A dependía del tiempo de carga,
 * y la dirección del error era la peligrosa: `cumple-parcial` sobre una página
 * cuyo carrusel sí gira solo.
 *
 * No se puede arreglar observando más tiempo —siempre habrá un carrusel más
 * lento—, pero sí se puede dejar de absolver: si la página TRAE un carrusel y no
 * se le ha visto moverse, eso no es «no se mueve», es «no arrancó mientras
 * mirábamos».
 */
const CARRUSEL_TARDIO = `
<style>.swiper{overflow:hidden}.swiper-slide{display:none}.swiper-slide.activa{display:block}</style>
<div class="swiper"><div class="swiper-wrapper">
 <div class="swiper-slide activa">Uno</div><div class="swiper-slide">Dos</div>
</div></div>
<script>
setTimeout(function () {
  var i = 0, s = document.querySelectorAll(".swiper-slide");
  setInterval(function () { s[i].classList.remove("activa"); i = (i + 1) % s.length; s[i].classList.add("activa"); }, 900);
}, 9000);
</script>`;

test("2.2.2 real: un carrusel que no arranca en la ventana NO se absuelve", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CARRUSEL_TARDIO },
    { launchOptions, movimientoMs: 3000, teclas: false });
  const f = out.findings.find((x) => x.c.n === "2.2.2");
  assert.ok(f, "2.2.2 tiene que pronunciarse");
  assert.equal(f.verdict, "revisar", "no `cumple-parcial`: " + f.evid.join(" | "));
  const t = f.evid.join(" ");
  assert.match(t, /trae un carrusel/, t.slice(0, 200));
  assert.match(t, /\.swiper/, "y dice qué encontró: " + t.slice(0, 200));
  assert.match(t, /no arranca dentro de la ventana/, "explicando por qué no basta no haberlo visto");
});

test("2.2.2 real: una página quieta SIN carrusel sigue en cumple-parcial", { skip }, async () => {
  /* El arreglo no puede convertir toda página quieta en un «revisar»: lo que lo
   * dispara es que haya un carrusel declarado y no se le haya visto nada. */
  const out = await dynamicAnalyze({ html: "<p>Quieta.</p><button>Botón</button>" },
    { launchOptions, movimientoMs: 3000, teclas: false });
  const f = out.findings.find((x) => x.c.n === "2.2.2");
  assert.ok(f);
  assert.equal(f.verdict, "cumple-parcial", f.evid.join(" | "));
  assert.match(f.evid.join(" "), /no hay ningún carrusel declarado/);
});

/* ── 2.1.2: un marco no es una trampa (regresión v0.77.0) ────────────────── */

/**
 * EL FALSO POSITIVO MÁS CARO QUE HA TENIDO ESTE AGENTE: una barrera CRÍTICA
 * inventada, y sin elemento al que ir.
 *
 * Desde el documento padre, mientras el foco recorre los controles de DENTRO de
 * un `<iframe>`, `document.activeElement` sigue siendo el iframe. El caminante
 * de tabulación leía cuatro veces el mismo elemento y declaraba trampa de foco:
 *
 *     2.1.2 · Crítica · «El foco queda atrapado con Tab: no se puede salir del
 *     componente solo con teclado.» · elemento: "" · selector: ""
 *
 * Medido: con 6 controles dentro del marco el caminante para en la tabulación
 * nº 6 diciendo TRAMPA, y pulsando Tab se sale del marco y se llega a los tres
 * controles de después sin problema. Con 3 controles dentro NO disparaba —hacen
 * falta cuatro lecturas iguales seguidas—, así que el defecto dependía de cuántos
 * controles tuviera el embed: un mapa, un captcha o un reproductor bastan.
 *
 * Este test usa 6 a propósito: con menos no reproduce nada.
 */
const CON_MARCO = (dentro) => '<a href="/a" id="p1">antes uno</a><a href="/b" id="p2">antes dos</a>' +
  '<iframe id="mapa" title="Mapa" width="300" height="120" srcdoc="' +
  Array.from({ length: dentro }, (_, i) => '<button>dentro ' + i + '</button>').join(" ") +
  '"></iframe><a href="/c" id="p3">después uno</a><a href="/d" id="p4">después dos</a><button id="p5">enviar</button>';

test("2.1.2 real: un iframe con 6 controles dentro NO es una trampa de foco", { skip }, async () => {
  const out = await dynamicAnalyze({ html: CON_MARCO(6) }, { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.1.2");
  assert.equal(f.length, 1, JSON.stringify(f.map((x) => x.verdict)));
  assert.notEqual(f[0].verdict, "falla", "barrera CRÍTICA inventada: " + (f[0].evid || []).join(" "));
  assert.notEqual(f[0].sev, "crítica");
  // Y el punto ciego se declara: no se ha mirado dentro del marco.
  assert.match((f[0].evid || []).join(" "), /marco/i, "el interior del marco no se ha visto y hay que decirlo");
});

test("2.1.2 real: con pocos controles dentro tampoco, y sigue declarando el marco", { skip }, async () => {
  // El caso que antes pasaba por casualidad, para que no se arregle solo uno.
  const out = await dynamicAnalyze({ html: CON_MARCO(2) }, { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.1.2")[0];
  assert.notEqual(f.verdict, "falla");
  assert.match((f.evid || []).join(" "), /marco/i);
});

/**
 * Y LAS TRAMPAS DE VERDAD, QUE NO TENÍAN NINGUNA PRUEBA DE INTEGRACIÓN.
 *
 * Eso se vio al escribir la de arriba: la detección de `trapped` nunca se había
 * comprobado de punta a punta contra una trampa real en un navegador, solo con
 * trazas de mentira en la suite pura. Arreglar un falso positivo sin esta red
 * es arreglar a ciegas.
 *
 * La trampa tiene que ser SINCRÓNICA para reproducirse: un `onblur` que
 * redevuelve el foco con `setTimeout` llega tarde —el caminante ya ha leído el
 * control siguiente— y la página sale limpia. La trampa real del mundo es un
 * `keydown` que intercepta Tab con `preventDefault`, que es lo que hace el
 * guardián de foco de cualquier modal.
 */
test("2.1.2 real: la trampa en UN control se ve y dice en cuál", { skip }, async () => {
  const html = '<a href="/a">uno</a>' +
    '<button id="pega" onkeydown="if(event.key===\'Tab\'){event.preventDefault();this.focus();}">pegajoso</button>' +
    '<a href="/b">dos</a><a href="/c">tres</a><a href="/d">cuatro</a>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.1.2")[0];
  assert.equal(f.verdict, "falla", JSON.stringify(f));
  assert.equal(f.sev, "crítica");
  assert.ok(f.nodes && f.nodes.length, "una barrera crítica sin elemento no es reportable");
  assert.equal(f.nodes[0].locator, "button#pega");
  assert.match((f.evid || []).join(" "), /atrapado con Tab en «button#pega»/);
});

test("2.1.2 real: el ciclo de un modal nombra SOLO los controles que ciclan", { skip }, async () => {
  /* La lista salía de `reached.slice(-vuelta)`, los últimos alcanzados, no los
   * que se repiten: con dos enlaces delante del modal decía «cicla entre 4
   * control(es) —a → a → button#m1 → button#m2—». La barrera era cierta y la
   * evidencia mandaba al sitio equivocado, con dos locators «a» que no
   * distinguen nada. */
  const html = '<a href="/a">fuera uno</a><a href="/b">fuera dos</a>' +
    '<div id="modal">' +
    '<button id="m1" onkeydown="if(event.key===\'Tab\'){event.preventDefault();document.getElementById(\'m2\').focus();}">Cerrar</button>' +
    '<button id="m2" onkeydown="if(event.key===\'Tab\'){event.preventDefault();document.getElementById(\'m1\').focus();}">Aceptar</button>' +
    '</div><a href="/c">fuera tres</a><a href="/d">fuera cuatro</a>';
  const out = await dynamicAnalyze({ html }, { launchOptions, movimientoMs: 0, teclas: false });
  const f = out.findings.filter((x) => x.c.n === "2.1.2")[0];
  assert.equal(f.verdict, "falla", JSON.stringify(f));
  assert.deepEqual((f.nodes || []).map((n) => n.locator), ["button#m1", "button#m2"]);
  assert.match((f.evid || []).join(" "), /cicla entre 2 control\(es\) —button#m1 → button#m2—/);
  assert.doesNotMatch((f.evid || []).join(" "), /→ a →/, "los enlaces de fuera no son parte del ciclo");
});

/* ── 2.1.4: una página que se mueve UNA VEZ no convierte una tecla en atajo ── */

/**
 * ESTE ES EL DEFECTO QUE LA PRUEBA DE «crece sola» LLEVABA CAZANDO, y que en el
 * contenedor no se veía.
 *
 * `ruido` se acumula de los testigos vistos hasta ese momento, así que un cambio
 * de un solo disparo que caiga dentro de la ventana con tecla no lo ha visto
 * ningún testigo y se le atribuye a la tecla. En el Mac del autor, «crece sola»
 * fallaba 6 de 6 pasadas con el código de v0.76.0 y 5 de 6 con el de v0.77.0; en
 * el contenedor pasaba 6 de 6. O sea que dependía de dónde cayera la ventana, es
 * decir de la velocidad de la máquina — y un falso positivo que depende de la
 * máquina es el peor de todos, porque no sale en los tests de quien lo escribió.
 *
 * Esta página lo reproduce EN CUALQUIER MÁQUINA sin depender de la suerte: muta
 * UNA SOLA VEZ a los 450 ms, que es después del primer testigo (0-260 ms) y
 * dentro de la primera ventana con tecla. Medido antes del arreglo: «la tecla "/"
 * cambia qué se ve (+6 elemento(s) visibles)», ruido [], activas 1, en una página
 * sin un solo manejador de teclado. A los 400 y a los 600 ms, igual.
 */
const MUTA_UNA_VEZ = (ms) => `<main><h1>Portada</h1><ul id="l"><li>fila</li></ul></main>
<script>setTimeout(function(){
  var l=document.getElementById('l');
  for (var i=0;i<6;i++){ var e=document.createElement('li'); e.textContent='fila nueva '+i+' con bastante texto para que cuente'; l.appendChild(e); }
},${ms});</script>`;

for (const ms of [400, 450, 600]) {
  test("2.1.4 real: una mutación única a los " + ms + " ms NO convierte una tecla en atajo", { skip }, async () => {
    const out = await dynamicAnalyze({ html: MUTA_UNA_VEZ(ms) }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f", "j"] });
    const t = out.trace.teclas;
    const f = out.findings.filter((x) => x.c.n === "2.1.4")[0];
    assert.equal(t.activas, 0, "la página no escucha el teclado: " + JSON.stringify(t) + " / " + (f ? f.evid.join(" ") : ""));
    // Y no se absuelve: hubo un cambio y no se sabe de quién.
    assert.notEqual(f.verdict, "cumple", "nunca `cumple`");
    assert.match(f.verdict, /revisar|cumple-parcial/);
  });
}

test("2.1.4 real: un atajo REPETIBLE que reescribe texto sigue acusándose", { skip }, async () => {
  /* Y el arreglo no puede comprarse perdiendo detección. Este caso se perdió en
   * el primer intento: «texto» era una LONGITUD en la huella, así que reescribir
   * un párrafo con un texto de largo parecido no se detectaba la segunda vez y la
   * confirmación por repetición lo degradaba a «dudosa». Ahora la huella lleva
   * también un hash del contenido. */
  const html = `<main><h1>Portada</h1><p id="p">nada</p></main>
    <script>var k=0;document.addEventListener('keydown',function(e){
      if(e.key==='/'&&!e.ctrlKey&&!e.altKey&&!e.metaKey){ k++; document.getElementById('p').textContent='BUSCADOR ABIERTO numero '+k; }
    });</script>`;
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f", "j"] });
  const t = out.trace.teclas;
  assert.equal(t.activas, 1, JSON.stringify(t));
  assert.equal(t.dudosas, 0, "es repetible: no puede quedar en duda");
  const f = out.findings.filter((x) => x.c.n === "2.1.4")[0];
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid.join(" "), /«\/»/);
});

test("2.1.4 real: un atajo de UN SOLO USO no se acusa pero tampoco se absuelve", { skip }, async () => {
  /* El modal que se abre y se queda abierto: al segundo intento ya no cambia
   * nada. No hay prueba para acusar, y no haberla no es una absolución. */
  const html = `<main><h1>Portada</h1><div id="m" hidden>modal con bastante texto dentro para que cuente como cambio</div></main>
    <script>document.addEventListener('keydown',function(e){ if(e.key==='s'){ document.getElementById('m').hidden=false; } });</script>`;
  const out = await dynamicAnalyze({ html }, { launchOptions, forms: "off", movimientoMs: 0, teclas: ["/", "s", "f", "j"] });
  const t = out.trace.teclas;
  const f = out.findings.filter((x) => x.c.n === "2.1.4")[0];
  assert.equal(t.activas, 0);
  assert.equal(t.dudosas, 1, JSON.stringify(t));
  assert.equal(f.verdict, "revisar", "no se absuelve lo que no se ha podido descartar");
  assert.match(f.evid.join(" "), /no se repitió/);
});
