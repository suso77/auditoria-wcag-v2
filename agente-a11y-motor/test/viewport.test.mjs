import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeReflow, analyzeResize, analyzeTextSpacing, analyzeOrientation, analyzeHoverContent, analyzeViewport, analyzeTimeLimits, EXENTOS_REFLUJO } from "../src/viewport.js";

const v = (fs) => fs.map((f) => f.c.n + "/" + f.verdict);

/* ── 1.4.10 Reflujo ── */

test("sin desplazamiento horizontal a 320 px → cumple 1.4.10", () => {
  assert.deepEqual(v(analyzeReflow({ w: 320, h: 256, scrollWidth: 320, clientWidth: 320 })), ["1.4.10/cumple"]);
});

test("una tolerancia de 2 px no dispara la falla (redondeos de layout)", () => {
  assert.deepEqual(v(analyzeReflow({ w: 320, h: 256, scrollWidth: 322, clientWidth: 320 })), ["1.4.10/cumple"]);
});

test("desbordamiento real → falla 1.4.10 grave, con los elementos señalados", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 980, clientWidth: 320, offenders: [{ locator: "div.grid", tag: "div", detalle: "660 px fuera" }] });
  assert.deepEqual(v(out), ["1.4.10/falla"]);
  assert.equal(out[0].sev, "grave");
  assert.match(out[0].evid[0], /660 px de exceso/);
  assert.deepEqual(out[0].nodes, [{ locator: "div.grid", name: "660 px fuera" }]);
});

test("si TODO lo que desborda puede acogerse a la excepción de uso esencial → revisar, no falla", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 900, clientWidth: 320, offenders: [{ locator: "table.datos", tag: "table" }, { locator: "div.mapa", tag: "div", role: "img" }] });
  assert.deepEqual(v(out), ["1.4.10/revisar"]);
  assert.match(out[0].evid[0], /uso esencial/);
});

test("una sola excepción no salva al resto", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 900, clientWidth: 320, offenders: [{ locator: "table.datos", tag: "table" }, { locator: "nav.menu", tag: "nav" }] });
  assert.deepEqual(v(out), ["1.4.10/falla"]);
});

test("la lista de exentos es la que dice WCAG por uso esencial", () => {
  ["table", "img", "iframe", "pre"].forEach((t) => assert.ok(EXENTOS_REFLUJO.includes(t)));
  assert.ok(!EXENTOS_REFLUJO.includes("div"));
});

/* ── 1.4.4 y 1.4.12: el mismo patrón de recorte ── */

test("sin recortes al aplicar el cambio → cumple", () => {
  assert.deepEqual(v(analyzeResize({ aplicado: true, revisados: 42, recortados: [], solapados: [] })), ["1.4.4/cumple"]);
  assert.deepEqual(v(analyzeTextSpacing({ aplicado: true, revisados: 42, recortados: [], solapados: [] })), ["1.4.12/cumple"]);
});

test("texto recortado tras el cambio → falla grave", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 42, recortados: [{ locator: "div.card", detalle: "31 px de alto ocultos" }], solapados: [] });
  assert.deepEqual(v(out), ["1.4.12/falla"]);
  assert.equal(out[0].sev, "grave");
  assert.match(out[0].evid[0], /sin barra de desplazamiento/);
});

test("solo solapes (sin recorte) → revisar, no falla", () => {
  const out = analyzeResize({ aplicado: true, revisados: 10, recortados: [], solapados: [{ locator: "p.pie" }] });
  assert.deepEqual(v(out), ["1.4.4/revisar"]);
});

test("si el cambio NO se pudo aplicar, el veredicto es revisar y lo dice", () => {
  const out = analyzeTextSpacing({ aplicado: false, motivo: "CSP bloqueó el <style>" });
  assert.deepEqual(v(out), ["1.4.12/revisar"]);
  assert.match(out[0].evid[0], /CSP bloqueó/);
});

/* ── 1.3.4 Orientación ── */

test("screen.orientation.lock() → falla 1.3.4", () => {
  const out = analyzeOrientation({ bloqueoJS: true });
  assert.deepEqual(v(out), ["1.3.4/falla"]);
});

test("media query de orientación que oculta contenido → revisar", () => {
  assert.deepEqual(v(analyzeOrientation({ mediaBloqueante: ["(orientation: landscape)"] })), ["1.3.4/revisar"]);
});

test("mismo contenido en vertical y horizontal → cumple", () => {
  assert.deepEqual(v(analyzeOrientation({ textoVertical: 5000, textoHorizontal: 5100 })), ["1.3.4/cumple"]);
});

test("pérdida grande de texto al girar → revisar", () => {
  const out = analyzeOrientation({ textoVertical: 1000, textoHorizontal: 5000 });
  assert.deepEqual(v(out), ["1.3.4/revisar"]);
  assert.match(out[0].evid[0], /80 %/);
});

/* ── 1.4.13 Contenido al recibir foco o puntero ── */

test("regresión: el atributo title está EXENTO de 1.4.13, y no es una falla", () => {
  /* El texto normativo del criterio termina con: «Exception: The visual presentation
   * of the additional content is controlled by the user agent and is not modified by
   * the author». El tooltip nativo es exactamente eso, así que fallar 1.4.13 por un
   * `title` es acusar de algo que la propia excepción excluye — y se emitía `falla`
   * moderada en cualquier página con un `<abbr title>`.
   *
   * La información no se pierde: `title` sigue siendo mala idea porque no se alcanza
   * con teclado ni con el dedo, pero eso aterriza en 1.1.1, 2.5.3 o 4.1.2. Se dice,
   * y se dice dónde. */
  const out = analyzeHoverContent({ titles: [{ locator: "a.ayuda", texto: "Más información sobre el trámite" }] });
  assert.deepEqual(v(out), ["1.4.13/revisar"]);
  assert.match(out[0].evid[0], /EXCEPCIÓN de 1\.4\.13 lo excluye/);
  assert.match(out[0].evid.join(" "), /1\.1\.1, 2\.5\.3 o 4\.1\.2/, "y se dice a qué criterio pertenece el problema de verdad");
  assert.equal(out[0].sev, null, "sin gravedad: no es una barrera de este criterio");
});

test("y un title sin otro nombre accesible se señala aparte", () => {
  const out = analyzeHoverContent({ titles: [{ locator: "button", texto: "Cerrar el aviso", tieneNombre: false }] });
  assert.match(out[0].evid.join(" "), /no tienen otro nombre accesible/);
});

test("un emergente de verdad —CSS del autor— sí falla 1.4.13", () => {
  // El arreglo del `title` no puede cegar el criterio donde de verdad aplica.
  const out = analyzeHoverContent({
    titles: [], hoverProbado: true, disparadores: 1,
    hovers: [{ locator: "div.tooltip", descartable: false, "señalable": true }]
  });
  assert.ok(out.some((f) => f.c.n === "1.4.13" && f.verdict === "falla"), JSON.stringify(v(out)));
});

test("un title vacío no cuenta", () => {
  // Con la sonda de puntero ejecutada (`hoverProbado`), un title vacío deja el
  // criterio conforme; sin ejecutar, queda a revisar — que es el otro test.
  assert.deepEqual(v(analyzeHoverContent({ titles: [{ locator: "a", texto: "   " }], hovers: [], hoverProbado: true, disparadores: 0 })), ["1.4.13/cumple"]);
});

test("emergente que no se descarta con Esc → falla grave", () => {
  const out = analyzeHoverContent({ hovers: [{ locator: "div.tooltip", descartable: false, señalable: true }] });
  assert.deepEqual(v(out), ["1.4.13/falla"]);
  assert.equal(out[0].sev, "grave");
});

test("emergentes correctos → cumple", () => {
  assert.deepEqual(v(analyzeHoverContent({ hovers: [{ locator: "div.tip", descartable: true, señalable: true }] })), ["1.4.13/cumple"]);
});

/* ── Agregado ── */

test("analyzeViewport cubre los cinco criterios de una vez", () => {
  const out = analyzeViewport({
    reflow: { w: 320, h: 256, scrollWidth: 320, clientWidth: 320 },
    resize: { aplicado: true, revisados: 5, recortados: [], solapados: [] },
    spacing: { aplicado: true, revisados: 5, recortados: [], solapados: [] },
    orientation: { textoVertical: 100, textoHorizontal: 100 },
    hover: { titles: [], hovers: [] }
  });
  assert.deepEqual(out.map((f) => f.c.n).sort(), ["1.3.4", "1.4.10", "1.4.12", "1.4.13", "1.4.4"]);
  assert.ok(out.every((f) => f.scope === "adaptación" && f.en), "todos llevan ámbito y cláusula EN");
});

test("trazas ausentes no inventan veredictos", () => {
  assert.deepEqual(analyzeViewport({}), []);
});

test("recorte PREVIO al cambio → revisar, no falla, y se distingue del causado por el cambio", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 9, recortados: [], solapados: [], previos: [{ locator: "div.card", detalle: "102 px de alto ocultos" }] });
  assert.deepEqual(v(out), ["1.4.12/revisar"]);
  assert.match(out[0].evid[0], /YA venían/);
  assert.match(out[0].evid[0], /No lo provoca/);
  assert.equal(out[0].nodes[0].locator, "div.card");
});

test("si el cambio SÍ empeora algo, manda el recorte nuevo", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 9, recortados: [{ locator: "div.nueva" }], solapados: [], previos: [{ locator: "div.vieja" }] });
  assert.deepEqual(v(out), ["1.4.12/falla"]);
  assert.match(out[0].evid[0], /div\.nueva/);
});

/* ── Regresiones de la revisión profunda ─────────────────────────────────── */

test("regresión: 1.4.13 no se declara conforme si la sonda no llegó a correr", () => {
  // Cuando `hovers` viene vacío sin haber probado nada —la capa no corrió, o
  // falló—, leerlo como «se probó y no había emergentes» daba «cumple» sobre
  // tooltips CSS reales que no se cierran con Esc.
  const out = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: false });
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["1.4.13/revisar"]);
  assert.match(out[0].evid[0], /sonda de puntero NO llegó a ejecutarse/);
});

test("regresión: si el tope de bloques recortó, el criterio no puede salir conforme", () => {
  // La misma tarjeta que se recorta daba «falla» sola y «cumple» detrás de 400
  // párrafos, porque el barrido corta en 300 elementos y no lo decía.
  const trace = { aplicado: true, revisados: 300, recortados: [], solapados: [], previos: [],
    cobertura: { total: 412, medidos: 300, truncado: true } };
  const out = analyzeTextSpacing(trace);
  assert.equal(out[0].verdict, "revisar", out[0].evid[0]);
  assert.match(out[0].evid[0], /412/);
  assert.match(out[0].evid[0], /NO se ha comprobado/);
});

test("sin truncar, el veredicto sigue siendo cumple", () => {
  const trace = { aplicado: true, revisados: 12, recortados: [], solapados: [], previos: [],
    cobertura: { total: 12, medidos: 12, truncado: false } };
  assert.equal(analyzeTextSpacing(trace)[0].verdict, "cumple");
});

test("la sonda de puntero distingue los tres desenlaces", () => {
  // Probado y limpio → cumple, diciendo cuántos disparadores se recorrieron.
  const ok = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: true, disparadores: 3 });
  assert.equal(ok[0].verdict, "cumple");
  assert.match(ok[0].evid[0], /3 disparador/);

  // Probado y roto → falla, con el motivo concreto.
  const malo = analyzeHoverContent({ titles: [], hoverProbado: true,
    hovers: [{ locator: "span.tip", aparece: 1, descartableConEsc: false, senalable: true }] });
  assert.equal(malo[0].verdict, "falla");
  assert.match(malo[0].evid[0], /no se descarta con Esc/);

  // Probado y sano → cumple.
  const sano = analyzeHoverContent({ titles: [], hoverProbado: true,
    hovers: [{ locator: "span.tip", aparece: 1, descartableConEsc: true, senalable: true }] });
  assert.equal(sano[0].verdict, "cumple");
});

test("las hojas de otro origen ilegibles se declaran en el cumple", () => {
  const out = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: true, disparadores: 2, hojasBloqueadas: 3 });
  assert.equal(out[0].verdict, "cumple");
  assert.match(out[0].evid[0], /3 hoja\(s\) de otro origen/);
});

/* ── 1.4.13: la excepción del criterio, y la barrera que se puede localizar ── */

const hover = (hs) => analyzeHoverContent({ hovers: hs, hoverProbado: true, disparadores: hs.length });
const emergente = (loc, extra) => Object.assign({ locator: loc, uid: "html > body > " + loc, descartableConEsc: false, senalable: true, tapa: true }, extra || {});

test("1.4.13: un emergente que no responde a Esc pero NO tapa nada está eximido por el propio criterio", () => {
  /* El requisito de «descartable» lleva su excepción escrita: «except when the
   * additional content ... does not obscure or replace other content». Un emergente
   * hecho con `:hover` en CSS no responde a Esc por definición, así que sin esta
   * condición TODOS salían como falla grave — incluido el tooltip que aparece en un
   * hueco reservado y no tapa nada. Medido contra un sitio real: 47 filas de 1.4.13,
   * y el informe hecho a mano no señalaba ninguna. */
  const f = hover([emergente("div.campo", { tapa: false })]);
  assert.deepEqual(v(f), ["1.4.13/cumple-parcial"]);
  assert.match(f[0].evid[0], /NO tapan ningún contenido/);
  assert.match(f[0].evid[0], /does not obscure or replace other content/);
});

test("1.4.13: si tapa contenido, el mismo emergente sin Esc es falla grave", () => {
  const f = hover([emergente("li.menu", { tapa: true })]);
  assert.deepEqual(v(f), ["1.4.13/falla"]);
  assert.equal(f[0].sev, "grave");
  assert.match(f[0].evid[0], /tapa contenido que había debajo/);
});

test("1.4.13: si no se pudo medir si tapa, se cuenta como que tapa (a prueba de fallos)", () => {
  const h = emergente("div.x");
  delete h.tapa;
  const f = hover([h]);
  assert.deepEqual(v(f), ["1.4.13/falla"]);
  assert.match(f[0].evid[0], /no se pudo comprobar que no lo tape/);
});

test("1.4.13: «desaparece al llevar el puntero encima» es falla aunque no tape nada", () => {
  const f = hover([emergente("div.lejos", { tapa: false, descartableConEsc: true, senalable: false })]);
  assert.deepEqual(v(f), ["1.4.13/falla"]);
  assert.match(f[0].evid[0], /desaparece al llevar el puntero encima/);
});

test("1.4.13: lo que no se pudo señalar por no haber podido viajar no se firma como conforme", () => {
  const f = hover([emergente("div.y", { descartableConEsc: true, senalable: null })]);
  assert.deepEqual(v(f), ["1.4.13/cumple-parcial"]);
  assert.match(f[0].evid[0], /no se pudieron comprobar las dos condiciones/);
  assert.match(f[0].evid[0], /sin comprobar, no aprobado/);
});

test("1.4.13: la barrera lleva selector, no solo un locator que no distingue", () => {
  /* Las barreras de esta capa salían al CSV con la columna «Selector» vacía y un
   * locator repetido: cinco filas diciendo `li.float-left` y nada con que ir a
   * buscarlas. El `uid` de la sonda ya era un selector canónico; solo no viajaba. */
  const f = hover([emergente("li.float-left"), emergente("li.float-left")]);
  assert.equal(f[0].nodes.length, 2);
  f[0].nodes.forEach(function (n) { assert.ok(n.path && n.path.indexOf("body") !== -1, JSON.stringify(n)); });
});

/* ── 2.2.1: los temporizadores largos, anotados al programarse ───────────── */

test("2.2.1: un setTimeout de 15 minutos se dice, con su retardo y de dónde sale", () => {
  /* Lo único que se miraba era `<meta http-equiv="refresh">`, que es el fallo de
   * libro y hoy casi nadie usa: medido contra un sitio real, 2.2.1 no emitió nada. El
   * límite de tiempo de verdad lo pone JavaScript, y eso no está en el marcado. */
  const f = analyzeTimeLimits({ total: 4, largos: [{ api: "setTimeout", ms: 900000, origen: "at https://s/app.js:12:3" }] });
  assert.equal(f.length, 1);
  assert.equal(f[0].c.n, "2.2.1");
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /setTimeout de 15 min/);
  assert.match(f[0].evid[0], /app\.js:12:3/);
  // Y no se afirma que sea un límite de tiempo: eso lo decide quien audita.
  assert.match(f[0].evid[1], /Si es un sondeo, una baliza o una caché, el criterio no dice nada/);
  assert.equal(f[0].nodes[0].locator, "setTimeout(15 min)");
});

test("2.2.1: sin temporizadores largos es cumple-parcial, y dice qué queda fuera", () => {
  const f = analyzeTimeLimits({ total: 7, largos: [] });
  assert.equal(f[0].verdict, "cumple-parcial");
  assert.match(f[0].evid[0], /7 temporizador\(es\) en total/);
  assert.match(f[0].evid[1], /DESPUÉS del momento de mirar/);
  assert.match(f[0].evid[1], /refresh/, "y recuerda que el meta refresh se comprueba aparte");
});

test("2.2.1: si la API no se pudo envolver, no se dice nada", () => {
  assert.deepEqual(analyzeTimeLimits(null), []);
  assert.deepEqual(analyzeTimeLimits({}), []);
});

test("2.2.1: un temporizador que sale de Google Tag Manager se marca como descartable", () => {
  /* Medido contra el sitio real: el único temporizador largo de las diez páginas es un
   * `setInterval` de 24 h programado por `gtm.js`. La fila es correcta —se programó—
   * pero sin anotar la procedencia obliga a ir a mirar un bundle de terceros para
   * descartarla. Anotarlo no la esconde. */
  const f = analyzeTimeLimits({ total: 9, largos: [{ api: "setInterval", ms: 86400000, origen: "at pd (https://www.googletagmanager.com/gtm.js?id=GTM-X:171:304)" }] });
  assert.equal(f[0].verdict, "revisar", "sigue saliendo: no se esconde");
  assert.match(f[0].evid.join(" "), /Todos salen de etiquetas de analítica/);
  assert.match(f[0].evid.join(" "), /lo normal es que esto se descarte/);
});

test("2.2.1: un temporizador del propio sitio NO se marca como descartable", () => {
  const f = analyzeTimeLimits({ total: 3, largos: [{ api: "setTimeout", ms: 900000, origen: "at cerrarSesion (https://mi-sitio.es/app.js:12:3)" }] });
  assert.ok(!/etiquetas de analítica/.test(f[0].evid.join(" ")), f[0].evid.join(" "));
  assert.match(f[0].evid.join(" "), /cerrar la sesión/);
});

/* ── 1.3.4 no declara conformidad sobre un CSS que no ha leído (v0.37.0) ───── */
test("una hoja de estilo ilegible impide declarar 1.3.4 conforme", () => {
  const base = { textoVertical: 1000, textoHorizontal: 1010 };
  const limpio = analyzeOrientation(Object.assign({ hojasIlegibles: 0 }, base));
  assert.equal(limpio[0].verdict, "cumple");

  // El rastreo busca `@media (orientation:…)` recorriendo document.styleSheets,
  // y una hoja de otro origen lanza al tocar cssRules. Se descartaba en
  // silencio, y el criterio afirmaba «y no hay bloqueo de orientación» sobre un
  // CSS que nunca se había podido leer.
  const ciego = analyzeOrientation(Object.assign({ hojasIlegibles: 2 }, base));
  assert.equal(ciego[0].verdict, "revisar");
  assert.match(ciego[0].evid[0], /2 hoja\(s\) de estilo de otro origen/);
});

test("sin poder comparar las dos orientaciones, 1.3.4 no se queda en blanco", () => {
  // Antes no se emitía nada, y un criterio ausente se lee en el informe igual
  // que uno conforme.
  const r = analyzeOrientation({ textoVertical: 0, textoHorizontal: 0, hojasIlegibles: 0 });
  assert.equal(r.length, 1);
  assert.equal(r[0].verdict, "revisar");
  assert.match(r[0].evid[0], /no se puede afirmar/);
});

test("1.3.4: una llamada a lock() manda sobre todo lo demás", () => {
  const r = analyzeOrientation({ bloqueoJS: true, hojasIlegibles: 3 });
  assert.equal(r[0].verdict, "falla");
  assert.equal(r[0].sev, "grave");
});

test("encontrar la llamada ESCRITA no es haberla visto ocurrir (1.3.4)", () => {
  // `bloqueoJS` significa que la API envuelta registró la llamada. La extensión
  // pasaba ahí el resultado de buscar el texto en los scripts en línea, así que
  // una coincidencia textual salía como falla grave — y el propio bundle lleva
  // la cadena dentro de sus mensajes de evidencia, con lo que el agente se
  // acusaba a sí mismo: comprobado inyectándolo en cuatro páginas limpias.
  const visto = analyzeOrientation({ bloqueoJS: true });
  assert.equal(visto[0].verdict, "falla");

  const soloEscrito = analyzeOrientation({ bloqueoJS: false, enScriptEnLinea: true });
  assert.equal(soloEscrito[0].verdict, "revisar");
  assert.match(soloEscrito[0].evid[0], /NO se ha visto ejecutarse/);

  // Y la pista no tapa a la observación: si se vio ocurrir, manda la falla.
  assert.equal(analyzeOrientation({ bloqueoJS: true, enScriptEnLinea: true })[0].verdict, "falla");
});
