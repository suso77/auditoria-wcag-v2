import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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

test("2.4.11 también habla cuando NADA tapa el foco (v0.37.0)", { skip }, async () => {
  /* El criterio solo se pronunciaba al encontrar algo que tapaba, así que una
   * página sin barras fijas salía «No evaluado» en la hoja de seguimiento —
   * indistinguible de un criterio que nadie ha mirado. Y es una afirmación
   * determinable: se ha recorrido cada control enfocable contra cada elemento
   * superpuesto, en las dos direcciones de tabulación. */
  const limpia = `<style>body{background:#fff;color:#111;font:16px/1.6 system-ui;margin:0}
    a:focus{outline:3px solid #000}</style><main><h1>Limpia</h1>
    <p><a href="/a">Uno</a> <a href="/b">Dos</a> <a href="/c">Tres</a></p></main>`;
  const m = (await analyzeRendered({ html: limpia }, { launchOptions })).measurements
    .filter((x) => x.crit === "2.4.11");
  assert.equal(m.length, 1, JSON.stringify(m.map((x) => x.verdict + " " + x.detail.slice(0, 60))));
  assert.equal(m[0].verdict, "pasa");
  assert.match(m[0].detail, /3 controles enfocables/);

  // Sin ningún control enfocable no se declara conforme: no hay nada medido.
  const vacia = "<main><h1>Solo texto</h1><p>Un párrafo y nada más.</p></main>";
  const mv = (await analyzeRendered({ html: vacia }, { launchOptions })).measurements
    .filter((x) => x.crit === "2.4.11");
  assert.equal(mv.length, 1);
  assert.equal(mv[0].verdict, "revisar");
  assert.match(mv[0].detail, /ning[uú]n control enfocable/);
});

/* ── Regresión: la cuarta tanda — lo que la medición no miraba ni declaraba ─── */

test("regresión: 2.4.3 compara la tabulación con el orden VISUAL", { skip }, async () => {
  /* El único criterio de decisión era la existencia de un `tabindex` positivo: sin
   * él, `pasa` y la evidencia «sigue el orden del DOM». Pero 2.4.3 exige que el
   * orden de foco preserve el significado, y el orden del DOM y el visual se separan
   * con `flex-direction: row-reverse`. Medido: la fila se tabula de derecha a
   * izquierda respecto a lo que se ve, y salía «pasa» — con el detalle «a → a → a →
   * a», que además no permite comprobar nada. */
  const invertida = await analyzeRendered({
    html: '<style>.fila{display:flex;flex-direction:row-reverse;gap:1em}</style>' +
      '<main><h1>O</h1><div class="fila"><a href="/1">Uno</a><a href="/2">Dos</a><a href="/3">Tres</a></div></main>'
  }, { launchOptions });
  const m = invertida.measurements.find((x) => x.crit === "2.4.3");
  assert.equal(m.verdict, "revisar", "orden visual invertido y salió «" + m.verdict + "»: " + m.detail);
  assert.match(m.detail, /no sigue el orden visual/);
  assert.match(m.detail, /salto\(s\) hacia atrás dentro de la misma línea visual/);
  assert.match(m.detail, /«Uno»/, "y cada control se identifica con su texto, no como «a → a → a»");

  // Control: la misma fila en orden normal no puede salir a revisar.
  const normal = await analyzeRendered({
    html: '<style>.fila{display:flex;gap:1em}</style>' +
      '<main><h1>O</h1><div class="fila"><a href="/1">Uno</a><a href="/2">Dos</a><a href="/3">Tres</a></div></main>'
  }, { launchOptions });
  const n = normal.measurements.find((x) => x.crit === "2.4.3");
  assert.equal(n.verdict, "pasa", "el orden normal no puede salir señalado: " + n.detail);
  assert.match(n.detail, /sigue el orden visual/);
});

test("el shadow DOM ABIERTO se mide, y su ruta cruza la frontera", { skip }, async () => {
  /* Todos los barridos usaban `doc.querySelectorAll`, que se detiene en la frontera de
   * un shadow root: en un sitio hecho con componentes web eso puede ser la página
   * entera sin medir. Ahora se entra, y la ruta lo dice con ` >> ` para que se sepa que
   * ese selector no lo resuelve un `document.querySelector` de una pieza. */
  const shadowJS = [
    "class Tarjeta extends HTMLElement {",
    "  connectedCallback() {",
    "    const s = this.attachShadow({ mode: 'open' });",
    "    s.innerHTML = '<style>p{color:#e8e8e8;background:#fff}button{width:12px;height:12px}</style>'",
    "      + '<p>Texto del shadow, ilegible</p><button id=\"mini\"></button>';",
    "  }",
    "}",
    "customElements.define('mi-tarjeta', Tarjeta);",
    "class Cerrada extends HTMLElement {",
    "  connectedCallback() { this.attachShadow({ mode: 'closed' }).innerHTML = '<p>oculto</p>'; }",
    "}",
    "customElements.define('mi-cerrada', Cerrada);"
  ].join("\n");
  const html = "<main><h1>C</h1><p>Texto normal.</p><mi-tarjeta></mi-tarjeta><mi-cerrada></mi-cerrada></main>" +
    "<script>" + shadowJS + "</script>";
  const out = await analyzeRendered({ html }, { launchOptions });

  // El contraste de dentro se mide, y sale como la barrera que es.
  const contraste = out.measurements.find((m) => m.crit === "1.4.3" && /mi-tarjeta/.test(m.node));
  assert.ok(contraste, "el párrafo del shadow tiene que medirse: " +
    JSON.stringify(out.measurements.filter((m) => m.crit === "1.4.3").map((m) => m.node)));
  assert.equal(contraste.verdict, "falla");
  assert.match(contraste.path, / >> /, "y la ruta cruza la frontera: " + contraste.path);
  assert.match(contraste.node, /^mi-tarjeta >> p$/, "el locator dice en qué componente vive: " + contraste.node);

  // El tamaño del objetivo también, y el botón NO puede salir como no enfocable:
  // `document.activeElement` se queda en el host, y compararlo con él daba un 2.1.1
  // «no recibe foco con Tab» sobre botones perfectamente enfocables.
  assert.ok(out.measurements.some((m) => m.crit === "2.5.8" && /mi-tarjeta/.test(m.node)),
    "2.5.8 dentro del shadow");
  const foco = out.measurements.find((m) => m.crit === "2.1.1" && /mi-tarjeta/.test(m.node));
  assert.ok(foco, "2.1.1 dentro del shadow");
  assert.equal(foco.verdict, "pasa", "un <button> del shadow SÍ recibe el foco: " + foco.detail);

  // Y lo que de verdad no se puede mirar se declara: el shadow root cerrado.
  const etiquetas = out.coberturas.map((c) => c.label);
  assert.ok(etiquetas.some((l) => /Shadow DOM cerrado/.test(l)), JSON.stringify(etiquetas));
  assert.ok(!etiquetas.some((l) => /Shadow DOM sin medir/.test(l)), "el abierto ya no se declara: se mide");

  // Una página sin componentes no lleva ninguna de las dos notas.
  const limpia = await analyzeRendered({ html: "<main><h1>C</h1><p>Texto normal.</p></main>" }, { launchOptions });
  assert.ok(!limpia.coberturas.some((c) => /Shadow DOM|Marco/.test(c.label)),
    JSON.stringify(limpia.coberturas.map((c) => c.label)));
});

test("el contenido de un iframe se mide, sellado con su marco", { skip }, async () => {
  /* `page.evaluate` corre en el marco principal y nada más, así que el contenido de un
   * `<iframe>` no se medía: ni contraste, ni tamaño de objetivos, ni foco. En un sitio
   * que mete el pago, el reproductor o el mapa en un marco, eso es la parte que más
   * falta hace comprobar. */
  const dentro = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>D</title>' +
    "<style>body{background:#fff}p{color:#eeeeee}button{width:10px;height:10px}</style></head>" +
    "<body><p>Texto del marco, ilegible</p><button>·</button></body></html>";
  const fuera = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title>' +
    "<style>body{background:#fff;color:#111}</style></head><body><main><h1>M</h1>" +
    '<p>Texto normal.</p><iframe src="/dentro" title="Formulario" width="320" height="160"></iframe>' +
    "</main></body></html>";
  const srv = createServer((q, s) => {
    s.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    s.end(q.url.startsWith("/dentro") ? dentro : fuera);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  try {
    const out = await analyzeRendered({ url: "http://127.0.0.1:" + srv.address().port + "/" }, { launchOptions });
    assert.ok(out.medicionMarcos.length, "tiene que medirse algo dentro del marco");
    const c = out.medicionMarcos.find((m) => m.crit === "1.4.3" && m.verdict === "falla");
    assert.ok(c, "el párrafo ilegible del marco: " + JSON.stringify(out.medicionMarcos.map((m) => m.crit + "/" + m.verdict)));
    assert.match(c.node, /^marco http/, "sellado con el marco de donde viene: " + c.node);
    assert.match(c.marco, /\/dentro$/);
    // Y llega a los hallazgos, que es lo que acaba en el informe.
    assert.ok(out.findings.some((f) => f.c.n === "1.4.3" && f.verdict === "falla" &&
      (f.nodes || []).some((n) => /marco http/.test(n.locator || ""))), "la barrera del marco tiene que llegar al informe");
  } finally { srv.close(); }
});

test("regresión: el cupo del contraste se gasta en lo que se mide, y la nota no miente", { skip }, async () => {
  /* El bucle recorría los primeros `limit` elementos y se saltaba los invisibles —que
   * habían gastado cupo igual—. Con seis párrafos `display:none` delante, un cupo de
   * seis se agotaba sin medir ni uno, y la nota imprimía el CUPO como si fuera lo
   * medido: «se midió el contraste de 6 de 18» con cero mediciones detrás. */
  const ocultos = Array.from({ length: 6 }, (_, i) => '<p style="display:none">o' + i + "</p>").join("");
  const malos = Array.from({ length: 6 }, (_, i) => '<p style="color:#eee">Texto ilegible ' + i + "</p>").join("");
  const out = await analyzeRendered({ html: "<main><h1>C</h1>" + ocultos + malos + "</main>" },
    { launchOptions, measureLimit: 6 });

  const medidas = out.measurements.filter((x) => x.crit === "1.4.3");
  assert.ok(medidas.length >= 6, "el cupo tiene que gastarse en los visibles: " + medidas.length);
  assert.ok(medidas.some((x) => x.verdict === "falla"), "y los ilegibles salen como barrera: " +
    JSON.stringify(medidas.map((x) => x.verdict)));

  const nota = out.coberturas.find((c) => /Cobertura del contraste/.test(c.label));
  if (nota) {
    const dicho = Number(String(nota.node).split("/")[0]);
    assert.ok(dicho > 0, "la nota no puede decir que midió cero cuando midió: " + nota.node);
    assert.match(nota.detail, /se descartaron|quedan/, nota.detail);
  }
});

test("2.4.3 distingue una maquetación en columnas de un salto de verdad", { skip }, async () => {
  /* Contar cualquier salto del foco hacia arriba como sospechoso dejaría el criterio a
   * revisar en media web: en dos columnas, terminar la primera y volver arriba para
   * empezar la segunda es el orden de lectura correcto. Lo que distingue los dos casos
   * es si los dos controles comparten espacio HORIZONTAL: si no, son columnas
   * distintas; si sí, el foco sube por donde ya había bajado. */
  const enlaces = (n, pre) => Array.from({ length: n }, (_, i) =>
    '<p><a href="/' + pre + i + '">' + pre + " " + i + "</a></p>").join("");

  // A) Dos columnas: orden de lectura normal, no puede salir señalado.
  const columnas = await analyzeRendered({
    html: "<style>.cols{display:flex;gap:2em}.cols>div{width:300px}</style>" +
      '<main><h1>O</h1><div class="cols"><div>' + enlaces(6, "izq") + "</div><div>" + enlaces(6, "der") + "</div></div></main>"
  }, { launchOptions });
  const a = columnas.measurements.find((m) => m.crit === "2.4.3");
  assert.equal(a.verdict, "pasa", "dos columnas no son un fallo de orden: " + a.detail);
  assert.match(a.detail, /de una columna a la siguiente/, "y se dice que se ha visto el cambio de columna");

  // B) Un enlace del final del DOM colocado arriba, en la MISMA columna: eso sí.
  const salto = await analyzeRendered({
    html: "<style>.col{width:300px;position:relative;padding-top:2em}.arriba{position:absolute;top:0;left:0}</style>" +
      '<main><h1>O</h1><div class="col">' + enlaces(8, "n") +
      '<a href="/arriba" class="arriba">Sube del todo</a></div></main>'
  }, { launchOptions });
  const b = salto.measurements.find((m) => m.crit === "2.4.3");
  assert.equal(b.verdict, "revisar", "el foco sube media pantalla por donde ya bajó: " + b.detail);
  assert.match(b.detail, /hacia ARRIBA dentro de la misma columna/);
  assert.match(b.detail, /sube \d+ px/, "y se dice cuánto, que es lo que permite juzgarlo");

  // C) Tres píxeles de desalineación entre etiqueta y campo: es ruido, no un salto.
  const ruido = await analyzeRendered({
    html: "<style>.sube{position:relative;top:-3px}</style>" +
      '<main><h1>O</h1><p><label for="a">A</label> <input id="a" class="sube"></p>' +
      '<p><label for="b">B</label> <input id="b"></p></main>'
  }, { launchOptions });
  const c = ruido.measurements.find((m) => m.crit === "2.4.3");
  assert.equal(c.verdict, "pasa", "tres píxeles no son un salto de orden: " + c.detail);
});

test("regresión: 2.4.3 compara TODA la secuencia, no los 25 primeros controles", { skip }, async () => {
  /* El `slice(0, 25)` estaba antes de comparar en vez de antes de imprimir.
   * Medido en Chromium: 30 controles con la fila invertida en los dos últimos
   * daban `pasa` —que `esConforme()` da por conformidad— con la frase «la
   * tabulación sigue el orden visual de la página» y sin una sola nota; la
   * misma inversión en los dos primeros daba `revisar`. En cualquier sitio real
   * con más de 25 elementos enfocables, 2.4.3 se podía exportar como conforme
   * con la inversión fuera del recorte. */
  let botones = "";
  for (let i = 1; i <= 28; i++) botones += "<p><button type=\"button\">Botón " + i + "</button></p>";
  const alFinal = await analyzeRendered({
    html: '<style>.fila{display:flex;flex-direction:row-reverse;gap:1em}</style><main><h1>O</h1>' + botones +
      '<div class="fila"><button type="button">Primero del código</button><button type="button">Segundo del código</button></div></main>'
  }, { launchOptions });
  const m = alFinal.measurements.find((x) => x.crit === "2.4.3");
  assert.equal(m.verdict, "revisar", "la inversión está en los controles 29 y 30: " + m.detail);
  assert.match(m.detail, /salto\(s\) hacia atrás dentro de la misma línea visual/);
  // Y la evidencia sigue siendo legible, diciendo cuántos hay en total.
  assert.match(m.detail, /30 controles en total/, m.detail);

  // Control: los mismos 30 en orden correcto siguen pasando, sin inventar nada.
  const bien = await analyzeRendered({
    html: "<main><h1>O</h1>" + botones + '<p><button type="button">Botón 29</button></p><p><button type="button">Botón 30</button></p></main>'
  }, { launchOptions });
  const b = bien.measurements.find((x) => x.crit === "2.4.3");
  assert.equal(b.verdict, "pasa", b.detail);
});

/* ── 1.4.3 y la decoración que el autor declara (v0.65.0) ────────────────────
 *
 * Salió de mirar en vivo, con la extensión del navegador, el elemento que el
 * agente acusaba cuatro veces en un sitio real:
 *
 *   span.text-slate-400 · texto «/» · 6×18 px · 11 px negrita
 *   aria-hidden="true" · 2,63:1
 *
 * Es la barra separadora de unas migas de pan, marcada por el autor como oculta
 * al árbol de accesibilidad. 1.4.3 exime la decoración pura, y una barra de
 * separación no transmite nada: quitarla no pierde información. Cuatro de las
 * acusaciones del banco del sitio limpio eran esto.
 */
const MIGAS = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Migas</title><style>
 body{font:16px system-ui;background:#fff;margin:0}
 .sep{color:#90a1b9;font-size:11px;font-weight:700}
 .flojo{color:#90a1b9;font-size:11px}
 nav ol{display:flex;gap:6px;list-style:none;padding:0}
</style></head><body>
<nav aria-label="Migas"><ol>
  <li><a href="/">Inicio</a></li>
  <li><span class="sep" aria-hidden="true">/</span></li>
  <li><a href="/contacto">Contacto</a></li>
</ol></nav>
<p><span class="flojo" aria-hidden="true">Texto con palabras y aria-hidden</span></p>
<p><span class="sep">/</span></p>
<p><span class="flojo">Texto flojo con palabras de verdad, que sí es una barrera</span></p>
</body></html>`;

test("1.4.3 real: el separador decorativo del autor no se cuenta como barrera", { skip }, async () => {
  const out = await analyzeRendered({ html: MIGAS }, { viewport: false, axe: false });
  const f = (out.findings || []).filter((x) => x.c.n === "1.4.3");
  const de = (sel, v) => f.find((x) => (x.nodes || []).some((n) => n.locator === sel) && x.verdict === v);

  // Las DOS señales juntas —aria-hidden y texto sin letras ni cifras— es el
  // separador de libro: no se acusa, pero se dice por qué no.
  const sep = de("span.sep", "no-aplica");
  assert.ok(sep, "el separador tenía que salir no-aplica: " +
    JSON.stringify(f.map((x) => [x.verdict, (x.nodes || []).map((n) => n.locator)])));
  assert.match(sep.evid[0], /texto «\/» sin letras ni cifras y con aria-hidden/);
  assert.match(sep.evid[0], /2\.63:1/, "la medida se sigue dando: " + sep.evid[0]);
  assert.match(sep.evid[0], /hay dos problemas/, "y se dice qué pasa si sí transmite algo");

  // Con UNA sola señal, el agente no decide: lo deja en `revisar` con la señal escrita.
  assert.ok(f.some((x) => x.verdict === "revisar" && /aria-hidden="true", y la excepción/.test(x.evid[0] || "")),
    "aria-hidden con palabras tenía que quedar en revisar");
  assert.ok(f.some((x) => x.verdict === "revisar" && /sin letras ni cifras, y la excepción/.test(x.evid[0] || "")),
    "«/» sin aria-hidden tenía que quedar en revisar");

  // LO QUE NO PASA: el texto flojo con palabras de verdad sigue siendo una falla.
  const real = de("span.flojo", "falla");
  assert.ok(real, "la barrera de verdad tiene que seguir saliendo: " +
    JSON.stringify(f.map((x) => [x.verdict, (x.nodes || []).map((n) => n.locator)])));
  assert.doesNotMatch(real.evid[0], /NO se cuenta|No lo declaro/);
});

/* ── No acusar lo que no se pinta en el estado medido (v0.66.0) ──────────────
 *
 * Medido en vivo con la extensión del navegador sobre un sitio real:
 * `button.md:hidden` —el botón del menú móvil— lleva
 * `aria-controls="mobile-menu"` apuntando a un id que no existe, y el motor
 * firmaba `1.3.1 falla`. Pero a 1470 px ese botón está en `display:none`, y el
 * árbol de accesibilidad del navegador NO LO CONTIENE: lo leí y no está. Ningún
 * lector llega a él en ese estado.
 *
 * Y no es un falso positivo sin más: a ancho de móvil sí se pinta, y entonces es
 * el control del menú. Así que la respuesta no es callar ni acusar, es decir en
 * qué estado se midió.
 */
test("1.3.1 real: un aria-controls roto en un elemento display:none baja a revisar", { skip }, async () => {
  const html = '<style>.oculto{display:none}</style>' +
    '<header><button class="oculto" aria-controls="mobile-menu" aria-expanded="false" aria-label="Abrir menú">≡</button></header>' +
    '<main><h1>T</h1><p>contenido</p></main>';
  const out = await analyzeRendered({ html }, { viewport: false, axe: false });
  const f = (out.findings || []).filter((x) => x.c.n === "1.3.1")[0];
  assert.ok(f, "tenía que haber un hallazgo de 1.3.1");
  assert.equal(f.verdict, "revisar", JSON.stringify(f.evid));
  // El defecto del marcado se sigue diciendo: no se borra, se encuadra.
  // (La evidencia lleva etiquetas HTML: `aria-controls` va dentro de <code>.)
  const plano = f.evid.join(" ").replace(/<[^>]+>/g, "");
  /* La redacción la cambió v0.71.0: el `aria-controls` de un widget CERRADO ya no
   * se firma como barrera, se dan las dos lecturas. Lo que este test fija es que
   * LAS DOS notas estén — la del widget cerrado y la de que el elemento no se
   * pinta —, porque son hechos distintos y los dos hacen falta. */
  assert.match(plano, /aria-controls.*no existen en este estado/);
  assert.match(plano, /CERRADO/);
  assert.match(plano, /NO SE PINTA \(display:none\)/);
  assert.match(plano, /tampoco se descarta/);
  assert.match(plano, /otro ancho de ventana/);
});

test("1.3.1 real: si el elemento SÍ se pinta, NO se añade la nota del estado", { skip }, async () => {
  /* ESTE TEST CAMBIÓ DE EXPECTATIVA EN v0.75.0, y conviene decir por qué en vez
   * de dejar una aserción volteada sin explicación.
   *
   * Lo escribió v0.66.0 para que la rebaja por «elemento no pintado» no se
   * comiera una barrera de un elemento que SÍ se ve, y para eso exigía `falla`.
   * Pero el marcado que usa —un botón con `aria-controls` a un id inexistente y
   * `aria-expanded="false"`— es exactamente el que v0.71.0 dejó en `revisar`
   * después de adjudicar las 26 acusaciones del banco contra el marcado real de
   * jesusaccesible.com: SIETE de ellas eran este idioma, el del widget colapsado
   * que crea su panel al abrirse, y el nombre de ese botón llega perfectamente a
   * la API. Así que `revisar` es la respuesta medida, no una relajación.
   *
   * Lo que este test sigue guardando, que es lo que v0.66.0 quería guardar: a un
   * elemento que se pinta NO se le añade la nota del estado. Esa parte no se
   * toca, y el test de debajo —nodo oculto y nodo visible a la vez— sigue
   * exigiendo que una barrera real no se rebaje por el oculto. */
  const html = '<header><button id="service-trigger" aria-controls="service-listbox" aria-expanded="false">Servicio</button></header>' +
    '<main><h1>T</h1><p>contenido</p></main>';
  const out = await analyzeRendered({ html }, { viewport: false, axe: false });
  const f = (out.findings || []).filter((x) => x.c.n === "1.3.1")[0];
  assert.equal(f.verdict, "revisar", JSON.stringify(f && f.evid));
  assert.doesNotMatch(f.evid.join(" "), /NO SE PINTA/);
  // Y la razón de que esté en `revisar` es la del widget cerrado, no otra.
  assert.match(f.evid.join(" ").replace(/<[^>]+>/g, ""), /CERRADO/);
});

test("1.3.1 real: con un nodo oculto y otro visible, la barrera se mantiene", { skip }, async () => {
  /* Si uno solo de los elementos se ve, la barrera es de ese: bajar el hallazgo
   * entero por el oculto taparía una barrera real. */
  const html = '<style>.oculto{display:none}</style><header>' +
    '<button class="oculto" aria-controls="mobile-menu" aria-label="Abrir menú">≡</button>' +
    '<button id="service-trigger" aria-controls="service-listbox">Servicio</button></header>' +
    '<main><h1>T</h1><p>contenido</p></main>';
  const out = await analyzeRendered({ html }, { viewport: false, axe: false });
  const f = (out.findings || []).filter((x) => x.c.n === "1.3.1")[0];
  assert.equal(f.verdict, "falla", JSON.stringify(f && f.evid));
});
