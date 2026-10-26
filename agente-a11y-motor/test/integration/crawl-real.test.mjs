import { test } from "node:test";
import assert from "node:assert/strict";

/* ── Una sola captura no basta en un sitio que pinta en el cliente ────────────
 *
 * Medido en la pasada `ja4` de jesusaccesible.com: el rastreo iba con
 * `waitUntil: "load"` y SIN espera añadida, mientras la auditoría va con
 * `load` + 400 ms. `/contacto` —cuatro campos y un botón de envío— salió con
 * `tieneFormulario: false`, la cobertura quedó con `formulario: false`, y la
 * justificación de la muestra que va al IRA decía «No se ha encontrado ninguna
 * página de la categoría "Página con formulario": compruébalo a mano» con la
 * página del formulario DENTRO de la muestra. Una afirmación falsa en el
 * documento que sostiene la auditoría.
 *
 * Las huellas lo delataban: cuatro páginas con la MISMA huella —el armazón
 * compartido— y una sin header ni footer. Dos momentos de pintado distintos en
 * la misma pasada no son marcado estable.
 *
 * Estos tests necesitan navegador: se saltan donde no lo hay, y eso se dice. */

/* LA RUTA DEL IMPORT ERA «../src/» DESDE «test/integration/», o sea
 * «test/src/», que no existe. El `catch` lo convertía en «sin Chromium» y estas
 * dos pruebas NUNCA se ejecutaron: salían saltadas en cada pasada y eso se leía
 * como «aquí no hay navegador». Un salto silencioso es peor que un rojo, porque
 * el rojo se mira. Y se encontró justo cuando hacían falta: el defecto que
 * arregla esta versión —una página que no carga descuadra la muestra entera— es
 * exactamente lo que estas pruebas deberían haber estado vigilando.
 *
 * Ahora el motivo del salto se DICE, y si no es la falta de navegador se ve. */
let porQueNo = "";
const hayNavegador = await (async () => {
  try { const m = await import("../../src/playwright-launch.js"); const s = await m.chromiumDisponible(); porQueNo = s.motivo || ""; return s.ok; }
  catch (e) { porQueNo = "no se pudo cargar playwright-launch.js: " + ((e && e.message) || e); return false; }
})();

test("rastreo: una página que pinta su formulario después de «load» se lee bien", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../../src/crawl.js");
  const HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contacto</title></head>' +
    '<body><div id="root"></div><script>' +
    'document.getElementById("root").innerHTML=' +
    '"<header><nav><a href=\\"/\\">JFA</a></nav></header><main id=\\"m\\"></main><footer>pie</footer>";' +
    'window.addEventListener("load",function(){setTimeout(function(){' +
    'document.getElementById("m").innerHTML="<h1>Contacto</h1><form><label for=\\"n\\">Nombre</label>' +
    '<input id=\\"n\\" required><button type=\\"submit\\">Enviar</button></form>";},250);});' +
    '<\/script></body></html>';
  const srv = createServer((_q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(HTML); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const url = "http://127.0.0.1:" + srv.address().port + "/contacto";
  try {
    // Sin reposo: es lo que hacía el muestreo, y lee el armazón.
    const crudo = await crawlSite(url, { max: 1, asentarMs: 0 });
    assert.equal(crudo.candidatas[0]["señales"].tieneFormulario, false,
      "con asentarMs=0 se lee la página antes de pintarse: esto documenta el defecto, no lo aprueba");
    assert.deepEqual(crudo.reposadas, [], "sin reposo no hay segunda lectura que comparar");

    // Con la doble lectura, que es ahora el comportamiento por omisión.
    const bien = await crawlSite(url, { max: 1 });
    assert.equal(bien.candidatas[0]["señales"].tieneFormulario, true, "la segunda lectura sí ve el formulario");
    assert.deepEqual(bien.candidatas[0].asentado, ["tieneFormulario"], "y se anota QUÉ cambió");
    assert.equal(bien.reposadas.length, 1);
    // Y se dice arriba, porque de estas señales salen las categorías del IRA.
    const aviso = (bien.avisos || []).find((a) => /PINTA EN EL CLIENTE/.test(a));
    assert.ok(aviso, "un sitio donde hay que reposar es un dato que el informe tiene que dar");
    assert.match(aviso, /hueco de LECTURA del agente y no del sitio/);
  } finally { srv.close(); }
});

test("rastreo: si la página ya está estable a «load», la segunda lectura no anota nada", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* El coste de la doble lectura es una evaluación más. Lo que NO puede hacer es
   * marcar como «pinta en el cliente» un sitio estático, porque ese aviso cambia
   * cómo se leen las categorías de la muestra. */
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../../src/crawl.js");
  const HTML = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Quieta</title></head>' +
    '<body><header><nav><a href="/">Inicio</a></nav></header><main><h1>Quieta</h1>' +
    '<form><label for="a">A</label><input id="a"></form></main><footer>pie</footer></body></html>';
  const srv = createServer((_q, s) => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(HTML); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const r = await crawlSite("http://127.0.0.1:" + srv.address().port + "/", { max: 1 });
    assert.equal(r.candidatas[0]["señales"].tieneFormulario, true);
    assert.equal(r.candidatas[0].asentado, null, "no cambió nada: no hay nada que anotar");
    assert.deepEqual(r.reposadas, []);
    assert.ok(!(r.avisos || []).some((a) => /PINTA EN EL CLIENTE/.test(a)));
  } finally { srv.close(); }
});

/* ── Una página que no carga descuadra la muestra entera (v0.80.0) ───────── */

/**
 * DOS MUESTREOS SEGUIDOS DEL MISMO SITIO DABAN MUESTRAS DISTINTAS.
 *
 * Medido en el sitio del autor, dos pasadas a dos minutos una de otra con la
 * misma semilla: la primera rastreó 123 páginas y la segunda 124. La diferencia
 * era UN único error —«page.goto: Timeout 20000ms exceeded» en una página— y de
 * ahí se desmoronó todo: una plantilla distinta (9 contra 8), una página
 * estructurada menos, otro recorte y, al final, otras dos páginas aleatorias.
 *
 * Importa porque la muestra y su justificación van DENTRO del IRA, y la
 * cabecera del ejemplo promete que «con la misma semilla sale la misma muestra,
 * que es lo que permite defender el informe». Con una página fuera del censo esa
 * promesa no se sostiene.
 *
 * Y el error estaba en el JSON pero NO en los avisos, así que la justificación
 * seguía diciendo «reproducible» con el censo incompleto. Es la regla de oro del
 * proyecto aplicada al rastreo: el silencio sobre una página que no cargó se lee
 * como «el sitio no tiene esa página».
 */
const sitioConUnaLenta = async (fallos) => {
  const { createServer } = await import("node:http");
  const PAGS = ["/", "/a", "/b", "/lenta", "/c", "/d", "/e", "/f"];
  const nav = PAGS.map((p) => '<li><a href="' + p + '">' + p + "</a></li>").join("");
  let vistas = 0;
  const srv = createServer((req, res) => {
    const p = (req.url || "/").split("?")[0];
    if (p === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\n"); }
    if (PAGS.indexOf(p) === -1) { res.writeHead(404); return res.end("no"); }
    // La página lenta NO responde las primeras `fallos` veces: el goto agota el plazo.
    if (p === "/lenta") { vistas++; if (vistas <= fallos) return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + p + "</title></head><body>" +
      '<header class="cab"><nav class="nav"><ul>' + nav + "</ul></nav></header>" +
      '<main class="pri"><div class="hero">h</div><div class="cu"><h1>' + p + "</h1><p>t</p></div></main>" +
      '<footer class="pie">pie</footer></body></html>');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: "http://127.0.0.1:" + srv.address().port + "/", vistas: () => vistas };
};

test("rastreo: una página que falla UNA vez se reintenta y NO se pierde del censo", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url, vistas } = await sitioConUnaLenta(1);
  try {
    const r = await crawlSite(url, { max: 20, pausaMs: 0, timeout: 1200 });
    assert.equal(vistas(), 2, "tiene que haber un SEGUNDO intento; hubo " + vistas());
    assert.equal(r.candidatas.length, 8, "las 8 páginas en el censo, no 7: " + r.candidatas.map((c) => c.ruta).join(" "));
    assert.equal((r.errores || []).length, 0, JSON.stringify(r.errores));
    assert.deepEqual(r.reintentadas, ["/lenta"]);
    // Y se dice: un sitio que necesita reintentos explica por qué dos pasadas difieren.
    assert.ok((r.avisos || []).some((a) => /SEGUNDO intento/.test(a) && /\/lenta/.test(a)), JSON.stringify(r.avisos));
  } finally { srv.close(); }
});

test("rastreo: una página que falla SIEMPRE se dice en los avisos, con el matiz de la muestra", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url, vistas } = await sitioConUnaLenta(99);
  try {
    const r = await crawlSite(url, { max: 20, pausaMs: 0, timeout: 1200 });
    assert.equal(vistas(), 2, "también se reintenta cuando va a fallar: " + vistas());
    assert.equal(r.candidatas.length, 7, "la página que no carga no entra en el censo");
    assert.equal((r.errores || []).length, 1);
    assert.equal(r.errores[0].intentos, 2, "el error tiene que decir que se intentó dos veces");
    const av = (r.avisos || []).filter((a) => /NO SE PUDIERON LEER/.test(a))[0];
    assert.ok(av, "un censo incompleto NO puede quedarse callado: " + JSON.stringify(r.avisos));
    assert.match(av, /\/lenta/);
    assert.match(av, /la muestra NO es la que/, "y tiene que decir qué le hace a la muestra");
    assert.match(av, /reproducibilidad por semilla vale para ESTE censo/);
  } finally { srv.close(); }
});

test("rastreo: sin errores no se inventa ningún aviso de censo incompleto", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  // La dirección contraria: un aviso que sale siempre deja de leerse.
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioConUnaLenta(0);
  try {
    const r = await crawlSite(url, { max: 20, pausaMs: 0, timeout: 1200 });
    assert.equal(r.candidatas.length, 8);
    assert.deepEqual(r.reintentadas, []);
    assert.ok(!(r.avisos || []).some((a) => /NO SE PUDIERON LEER|SEGUNDO intento/.test(a)), JSON.stringify(r.avisos));
  } finally { srv.close(); }
});

/* ── La huella tiene que ser la MISMA en dos pasadas (v0.81.0) ───────────── */

/**
 * CINCO MUESTREOS SEGUIDOS DEL MISMO SITIO, CENSO ESTABLE, Y LA MUESTRA CAMBIÓ
 * EN CUATRO.
 *
 * Medido en el sitio del autor con 124 candidatas y 0 errores en las cinco
 * pasadas: las plantillas detectadas salieron 9 / 8 / 9 / 8 / 9, y la muestra
 * final —la que va al IRA— cambió en 4 de 5. Las huellas guardadas dijeron
 * exactamente qué pasaba. `/blog/wcag-3-1-5`, la misma página:
 *
 *   header>navigation>nav>main>contentinfo>nav>nav>nav
 *   header>navigation>nav>main>main>aside>navigation>contentinfo>nav>nav>nav
 *
 * Un segundo `main`, un `aside` y un `navigation` que aparecen tarde. El
 * rastreo releía UNA vez a los 500 ms y se quedaba con esa lectura, así que
 * según el momento pillaba la página completa o a medias.
 *
 * Y la primera versión del arreglo tampoco bastaba: aceptaba la estabilidad en
 * cuanto dos lecturas seguidas coincidían, y eso se le escapa a una página
 * quieta a los 500 ms que cambia a los 900. De ahí el suelo.
 *
 * Esta página reproduce el caso sin depender de la suerte: pinta su armazón al
 * instante y añade un segundo `<main>` y un `<aside>` a los 900 ms.
 */
const sitioQuePintaTarde = async (ms) => {
  const { createServer } = await import("node:http");
  const RUTAS = ["/", "/tardia", "/b"];
  const nav = RUTAS.map((p) => '<li><a href="' + p + '">' + p + "</a></li>").join("");
  const srv = createServer((req, res) => {
    const p = (req.url || "/").split("?")[0];
    if (p === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *"); }
    if (RUTAS.indexOf(p) === -1) { res.writeHead(404); return res.end("no"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + p + "</title></head><body>" +
      '<div id="r"></div><script>' +
      "document.getElementById('r').innerHTML = '<header class=\"cab\"><nav class=\"nav\"><ul>" + nav +
      "</ul></nav></header><main class=\"pri\"><div class=\"cu\">x</div></main><footer class=\"pie\">p</footer>';" +
      (p === "/tardia" ? "setTimeout(function(){" +
        "var m=document.createElement('main'); m.className='dos'; m.textContent='segundo main';" +
        "var a=document.createElement('aside'); a.className='lado'; a.textContent='lado';" +
        "document.body.appendChild(m); document.body.appendChild(a);}, " + ms + ");" : "") +
      "</script></body></html>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: "http://127.0.0.1:" + srv.address().port + "/" };
};

const huellaDe = (r, ruta) => {
  const c = r.candidatas.filter((x) => x.ruta === ruta)[0];
  return c ? String(c.plantilla || "") : null;
};

test("rastreo: la huella de una página que pinta tarde es la MISMA en tres pasadas", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQuePintaTarde(900);
  try {
    const hs = [];
    for (let i = 0; i < 3; i++) {
      const r = await crawlSite(url, { max: 10, pausaMs: 0 });
      hs.push(huellaDe(r, "/tardia"));
    }
    assert.equal(new Set(hs).size, 1, "la huella cambia entre pasadas: " + JSON.stringify(hs));
    // Y es la COMPLETA: con el segundo main y el aside, que es lo que la página
    // tiene de verdad. Quedarse con la lectura temprana sería estable y falso.
    assert.match(hs[0], /main>footer>main>aside/, "la huella tiene que ser la de la página acabada: " + hs[0]);
  } finally { srv.close(); }
});

test("rastreo: si el techo no da tiempo, se DICE que no se estabilizó", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* La otra mitad: no hay espera finita que garantice que una página ha
   * terminado, así que lo que no se puede es callarlo. Quedarse con la última
   * lectura y no decir nada es lo que hacía que dos pasadas no coincidieran sin
   * que nadie se enterara. */
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQuePintaTarde(900);
  try {
    const r = await crawlSite(url, { max: 10, pausaMs: 0, asentarTechoMs: 600 });
    const c = r.candidatas.filter((x) => x.ruta === "/tardia")[0];
    assert.ok(c.sinAsentar, "tiene que quedar marcada: " + JSON.stringify(c.sinAsentar));
    assert.ok(c.sinAsentar.lecturas >= 1 && c.sinAsentar.ms > 0);
    const av = (r.avisos || []).filter((a) => /NO SE ESTABILIZARON/.test(a))[0];
    assert.ok(av, "y dicha en los avisos: " + JSON.stringify(r.avisos));
    assert.match(av, /\/tardia/);
    assert.match(av, /su plantilla —y con ella la muestra— puede cambiar/);
  } finally { srv.close(); }
});

test("rastreo: una página estable no se marca como inquieta ni alarga el aviso", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  // La dirección contraria: si todo se asienta, ni marca ni aviso. Un aviso que
  // sale siempre deja de leerse.
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQuePintaTarde(0);
  try {
    const r = await crawlSite(url, { max: 10, pausaMs: 0 });
    assert.ok(r.candidatas.every((c) => !c.sinAsentar), "ninguna debería quedar sin asentar");
    assert.ok(!(r.avisos || []).some((a) => /NO SE ESTABILIZARON/.test(a)), JSON.stringify(r.avisos));
  } finally { srv.close(); }
});

test("muestreo: las páginas que no se asentaron van en el JSON, no solo en la prosa", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* El aviso lo lee una persona; el JSON lo lee el cotejo entre dos pasadas. Si
   * la huella de una página baila, lo primero que hay que poder preguntar es si
   * llegó a asentarse, y para eso el dato tiene que estar en `muestra.json`
   * —como ya están los errores de carga y los reintentos—. Dejarlo solo en el
   * texto es la misma media verdad que tenía el error de carga antes. */
  const { muestrearSitio } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQuePintaTarde(900);
  try {
    const s = await muestrearSitio(url, { max: 10, pausaMs: 0, asentarTechoMs: 600, "tamañoMuestra": 5 });
    const inq = (s.rastreo || {}).inquietas;
    assert.ok(Array.isArray(inq), "`rastreo.inquietas` tiene que existir siempre, aunque esté vacío");
    const t = inq.filter((x) => x.ruta === "/tardia")[0];
    assert.ok(t, "la página que no se asentó tiene que estar nombrada: " + JSON.stringify(inq));
    assert.ok(t.lecturas >= 1 && t.ms > 0, JSON.stringify(t));
    // Y la huella de cada página sigue estando, que es lo que permite el diff.
    assert.ok((s.rastreo.huellas || []).some((h) => h.ruta === "/tardia" && h.huella));
  } finally { srv.close(); }
});

/* ── UN CENSO CORTO SIN UN SOLO ERROR (v0.81.0) ──────────────────────────────
 *
 * Medido en el sitio del autor, cinco pasadas seguidas: la primera dio 117
 * candidatas y las otras cuatro 124, con CERO errores de carga en las cinco. El
 * mensaje de v0.80.0 atribuía el censo corto a los timeouts y eso era
 * incompleto: basta leer la portada antes de que pinte sus enlaces para que
 * falten páginas, sin que falle nada. Y un censo corto que nadie declara es el
 * silencio que este proyecto persigue, porque el informe diría «reproducible»
 * sobre un sitio al que le faltan páginas. */
const sitioConEnlacesTardios = async (retrasoMs) => {
  const { createServer } = await import("node:http");
  const srv = createServer((q, s) => {
    const ruta = (q.url || "/").split("?")[0];
    s.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (ruta !== "/") {
      s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + ruta + '</title></head>' +
        '<body><header><nav><a href="/">inicio</a></nav></header><main><h1>' + ruta + '</h1></main>' +
        '<footer>pie</footer></body></html>');
      return;
    }
    // La portada pinta DOS de sus enlaces de entrada y los otros cuatro tarde.
    s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>inicio</title></head>' +
      '<body><header><nav id="n"><a href="/a">a</a><a href="/b">b</a></nav></header>' +
      '<main><h1>inicio</h1></main><footer>pie</footer>' +
      (retrasoMs ? '<script>setTimeout(function(){document.getElementById("n").insertAdjacentHTML("beforeend",' +
        '"<a href=\\"/c\\">c</a><a href=\\"/d\\">d</a><a href=\\"/e\\">e</a><a href=\\"/f\\">f</a>");},' +
        retrasoMs + ')<\/script>' : '') +
      '</body></html>');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: "http://127.0.0.1:" + srv.address().port + "/" };
};

test("rastreo: los enlaces que pintan tarde entran en el censo, y se dice", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioConEnlacesTardios(700);
  try {
    // Como lo leía v0.79.0: una sola captura a «load» y el censo se queda corto.
    const corto = await crawlSite(url, { max: 20, pausaMs: 0, asentarMs: 0 });
    assert.equal(corto.candidatas.length, 3, "documenta el defecto: portada + 2 enlaces tempranos");

    // Con la convergencia: las seis páginas más la portada.
    const r = await crawlSite(url, { max: 20, pausaMs: 0 });
    assert.equal(r.candidatas.length, 7, "el censo completo: " + r.candidatas.map((c) => c.ruta).join(" "));
    const portada = r.candidatas.filter((c) => c.ruta === "/")[0];
    assert.ok((portada.asentado || []).indexOf("enlaces") !== -1,
      "y queda anotado que lo que llegó tarde fueron los ENLACES: " + JSON.stringify(portada.asentado));
    // Y el aviso tiene que hablar del CENSO, no solo de las señales: es lo que
    // decide si la muestra se puede defender como la del sitio entero.
    const av = (r.avisos || []).filter((a) => /PINTA EN EL CLIENTE/.test(a))[0];
    assert.ok(av, JSON.stringify(r.avisos));
    assert.match(av, /OJO AL CENSO/);
    assert.match(av, /117 candidatas/, "con el dato que lo midió, para que no se lea como una cautela genérica");
  } finally { srv.close(); }
});

test("rastreo: si nada llegó tarde, no se habla del censo", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  // La dirección contraria: la cautela del censo solo sale cuando los enlaces
  // fueron los que cambiaron. Un aviso que sale siempre deja de leerse.
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioConEnlacesTardios(0);
  try {
    const r = await crawlSite(url, { max: 20, pausaMs: 0 });
    assert.equal(r.candidatas.length, 3);
    assert.ok(!(r.avisos || []).some((a) => /OJO AL CENSO/.test(a)), JSON.stringify(r.avisos));
  } finally { srv.close(); }
});

/* ── EL SUELO DE ESPERA NO SE ADIVINA: SE MIDE (v0.81.0) ─────────────────────
 *
 * El suelo fijo de 1 s lo elegí yo y el sitio del autor lo desmintió. Medido
 * aquí con una página que muta a los 1400 ms, los tres comportamientos sobre
 * trece páginas:
 *
 *   v0.79.0, una relectura        574 ms/pág   lee div.min-h-screen  ← temprana
 *   suelo fijo 1000, sin calibrar 1078 ms/pág  lee div.min-h-screen  ← temprana
 *   calibrado                     2443 ms/pág  lee div.bg-white|nav:12  suelo 2019
 *
 * O sea: el suelo fijo costaba el 85 % más y leía exactamente igual de mal. Lo
 * que arregla el caso es MEDIR en el sitio cuándo deja de cambiar. */
const sitioQueHidrataTarde = async (retrasoMs, paginas) => {
  const { createServer } = await import("node:http");
  const n = paginas || 3;
  const enlaces = Array.from({ length: n }, (_, i) => '<a href="/p' + i + '">p' + i + '</a>').join("");
  const srv = createServer((q, s) => {
    s.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title></head><body>' +
      '<header><nav>' + enlaces + '</nav></header><main class="grow"><div class="min-h-screen"><h1>h</h1></div></main>' +
      '<footer>pie</footer>' +
      (retrasoMs ? '<script>setTimeout(function(){document.querySelector("main div").className="bg-white";},' +
        retrasoMs + ')<\/script>' : '') +
      '</body></html>');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: "http://127.0.0.1:" + srv.address().port + "/" };
};

test("rastreo: con el suelo por omisión, una página que se hidrata tarde se lee TARDE", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQueHidrataTarde(1400);
  try {
    // Sin calibrar, el suelo de 1000 ms no llega: esto documenta el defecto.
    const corto = await crawlSite(url, { max: 5, pausaMs: 0, calibrarAsentado: false });
    assert.match(String(corto.candidatas[0].plantilla), /div\.min-h-screen/,
      "con suelo fijo se lee antes de hidratarse: " + corto.candidatas[0].plantilla);

    // Calibrando, el suelo sale de la medición y la lectura es la de la página hecha.
    const r = await crawlSite(url, { max: 5, pausaMs: 0 });
    r.candidatas.forEach(function (c) {
      assert.match(String(c.plantilla), /div\.bg-white/, c.ruta + " se leyó temprana: " + c.plantilla);
    });
    assert.ok(r.calibracion, "la calibración tiene que viajar en el resultado");
    assert.ok(r.calibracion.suelo > 1400, "el suelo medido tiene que cubrir la mutación: " + r.calibracion.suelo);
    assert.ok(r.calibracion.medidas.length >= 1 && r.calibracion.medidas[0].ultimoCambio >= 1000,
      JSON.stringify(r.calibracion.medidas));
    // Y SE DICE, con el número: un suelo que el agente se pone solo es un dato
    // del informe, porque explica con qué margen se leyó el sitio.
    const av = (r.avisos || []).filter((a) => /SE ASIENTA TARDE/.test(a))[0];
    assert.ok(av, JSON.stringify(r.avisos));
    assert.match(av, /El suelo de espera se ha puesto en \d+ ms/);
  } finally { srv.close(); }
});

test("rastreo: un sitio quieto no calibra nada hacia arriba ni inventa aviso", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  // La dirección contraria, que es la que protege el coste: si el sitio no se
  // mueve después de «load», el suelo se queda donde estaba y no sale aviso.
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQueHidrataTarde(0);
  try {
    const r = await crawlSite(url, { max: 5, pausaMs: 0 });
    assert.equal(r.calibracion.suelo, 1000, "el suelo no debe subir sin motivo: " + r.calibracion.suelo);
    assert.ok(!(r.avisos || []).some((a) => /SE ASIENTA TARDE|SUELO DE ESPERA SUBIÓ/.test(a)), JSON.stringify(r.avisos));
    assert.ok(r.candidatas.every((c) => !c.sinAsentar));
  } finally { srv.close(); }
});

test("rastreo: si el suelo sube a mitad del rastreo, se dice qué páginas se leyeron con menos", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* La honestidad del arreglo: la calibración mira una página de cada N, así que
   * puede descubrir en la página 11 que el sitio se asienta más tarde. Las diez
   * anteriores se leyeron con menos margen y su huella puede ser la temprana. Si
   * eso se calla, el informe presume de una lectura que esas páginas no tuvieron. */
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../../src/crawl.js");
  const enlaces = Array.from({ length: 6 }, (_, i) => '<a href="/p' + i + '">p' + i + '</a>').join("");
  const srv = createServer((q, s) => {
    const r = (q.url || "/").split("?")[0];
    const tarde = r === "/p2";           // solo una página se hidrata tarde
    s.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>p</title></head><body>' +
      '<header><nav>' + enlaces + '</nav></header><main class="grow"><div class="min-h-screen"><h1>h</h1></div></main>' +
      '<footer>pie</footer>' +
      (tarde ? '<script>setTimeout(function(){document.querySelector("main div").className="bg-white";},1400)<\/script>' : '') +
      '</body></html>');
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + srv.address().port + "/";
  try {
    // Calibrando cada página: la que se hidrata tarde sube el suelo, y las
    // leídas antes de ella quedan señaladas.
    const r = await crawlSite(url, { max: 8, pausaMs: 0, calibrarCada: 1 });
    assert.ok(r.calibracion.suelo > 1400, "el suelo tiene que haber subido: " + r.calibracion.suelo);
    const av = (r.avisos || []).filter((a) => /SUELO DE ESPERA SUBIÓ/.test(a))[0];
    assert.ok(av, JSON.stringify(r.avisos));
    assert.match(av, /vuelve a rastrear/);
    assert.match(av, new RegExp("asentarSueloMs: " + r.calibracion.suelo));
    const conMenos = r.candidatas.filter((c) => c.sueloUsado < r.calibracion.suelo);
    assert.ok(conMenos.length >= 1, "alguna se leyó con el suelo viejo: " +
      JSON.stringify(r.candidatas.map((c) => [c.ruta, c.sueloUsado])));
  } finally { srv.close(); }
});

test("rastreo: la primera página de cada plantilla se observa larga, aunque no le toque calibrar", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* EL HUECO QUE DEJABA CALIBRAR UNA DE CADA DIEZ, encontrado en el banco y no
   * razonado: portada quieta, página interior que se hidrata a 1400 ms. La
   * portada calibraba 1000 ms y la interior se leía temprana sin que nada lo
   * dijera —dos plantillas donde hay una, y el enlace que la interior pinta
   * tarde fuera del censo—. Mirar una de cada diez no cubre una plantilla que
   * tiene una sola página, y las plantillas son justo lo que agrupa la muestra.
   *
   * Aquí `calibrarCada` es enorme a propósito: lo único que puede salvar el caso
   * es la observación por huella nueva. */
  const { createServer } = await import("node:http");
  const { crawlSite } = await import("../../src/crawl.js");
  const srv = createServer((q, s) => {
    const r = (q.url || "/").split("?")[0];
    s.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (r === "/") {
      s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>inicio</title></head><body>' +
        '<header><nav><a href="/">inicio</a><a href="/ficha">ficha</a></nav></header>' +
        '<main class="grow"><div class="portada"><h1>inicio</h1></div></main><footer>pie</footer></body></html>');
    } else {
      s.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>ficha</title></head><body>' +
        '<header><nav id="n"><a href="/">inicio</a></nav></header>' +
        '<main class="grow"><div class="min-h-screen"><h1>ficha</h1></div></main><footer>pie</footer>' +
        '<script>setTimeout(function(){document.querySelector("main div").className="ficha";' +
        'document.getElementById("n").insertAdjacentHTML("beforeend","<a href=\\"/extra\\">extra</a>");},1400)<\/script>' +
        '</body></html>');
    }
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + srv.address().port + "/";
  try {
    const r = await crawlSite(url, { max: 8, pausaMs: 0, calibrarCada: 1000 });
    const ficha = r.candidatas.filter((c) => c.ruta === "/ficha")[0];
    assert.ok(ficha, "la ficha tiene que estar en el censo");
    assert.match(String(ficha.plantilla), /div\.ficha/,
      "la ficha se leyó antes de hidratarse: " + ficha.plantilla);
    assert.ok(ficha.calibrada, "y tiene que haberse observado larga por ser huella nueva");
    // Y lo que pintó tarde eran enlaces: /extra tiene que estar en el censo.
    assert.ok(r.candidatas.some((c) => c.ruta === "/extra"),
      "el enlace que la ficha pinta tarde tiene que entrar en el censo: " +
      r.candidatas.map((c) => c.ruta).join(" "));
    assert.ok(r.calibracion.suelo > 1400, "el suelo sube con lo medido: " + r.calibracion.suelo);
  } finally { srv.close(); }
});

test("rastreo: el suelo calibrado es el MISMO en dos pasadas", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  /* Medido: la calibración daba 2018 ms en una pasada y 2020 en la siguiente, y
   * un suelo que baila hace que dos pasadas no sean comparables —por el reloj,
   * no por el sitio—. Va redondeado a 250 ms, y esto lo vigila. */
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioQueHidrataTarde(1400);
  try {
    const a = await crawlSite(url, { max: 4, pausaMs: 0 });
    const b = await crawlSite(url, { max: 4, pausaMs: 0 });
    assert.equal(a.calibracion.suelo, b.calibracion.suelo,
      "el suelo tiene que salir igual: " + a.calibracion.suelo + " vs " + b.calibracion.suelo);
    assert.equal(a.calibracion.suelo % 250, 0, "y redondeado a 250 ms: " + a.calibracion.suelo);
  } finally { srv.close(); }
});

/* ── UNA PASADA CUATRO VECES MÁS LENTA SE VEÍA IGUAL QUE OTRA (v0.82.0) ──────
 *
 * Medido en el sitio del autor, dos pasadas seguidas con el MISMO suelo y el
 * MISMO censo: 1390 s y 341 s, con cero errores las dos y una sola página
 * reintentada en la lenta. En el JSON no había un solo tiempo, así que las dos
 * pasadas eran indistinguibles y «el sitio iba cuatro veces más lento» no se
 * podía ni preguntar. Importa porque un sitio lento está a un timeout de perder
 * una página del censo, y con ella se mueve la muestra. */
const sitioConUnaLentisima = async (retardoMs) => {
  const { createServer } = await import("node:http");
  const enlaces = Array.from({ length: 6 }, (_, i) => '<a href="/p' + i + '">p' + i + '</a>').join("");
  const srv = createServer((q, s) => {
    const r = (q.url || "/").split("?")[0];
    const cuerpo = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + r + '</title></head>' +
      '<body><header><nav>' + enlaces + '</nav></header><main><h1>' + r + '</h1></main><footer>pie</footer></body></html>';
    const responder = () => { s.writeHead(200, { "content-type": "text/html; charset=utf-8" }); s.end(cuerpo); };
    if (r === "/p3" && retardoMs) setTimeout(responder, retardoMs); else responder();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { srv, url: "http://127.0.0.1:" + srv.address().port + "/" };
};

test("rastreo: el tiempo de cada página viaja en el JSON, y una lentísima se dice", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioConUnaLentisima(6000);
  try {
    const r = await crawlSite(url, { max: 10, pausaMs: 0, timeout: 15000 });
    assert.ok(r.ritmo, "`ritmo` tiene que existir: sin tiempos, dos pasadas distintas se ven iguales");
    assert.ok(r.ritmo.mediana > 0 && r.ritmo.max >= 6000, JSON.stringify(r.ritmo));
    assert.equal(r.ritmo.lentas[0].ruta, "/p3", "la más lenta tiene que nombrarse: " + JSON.stringify(r.ritmo.lentas));
    r.candidatas.forEach(function (c) { assert.ok(c.ms > 0, c.ruta + " sin tiempo"); });
    const av = (r.avisos || []).filter((a) => /NO RESPONDIÓ A RITMO CONSTANTE/.test(a))[0];
    assert.ok(av, JSON.stringify(r.avisos));
    assert.match(av, /\/p3/);
    assert.match(av, /se cae del censo/, "y tiene que decir qué le hace a la muestra, no solo que fue lento");
  } finally { srv.close(); }
});

test("rastreo: un sitio de ritmo parejo no se acusa de lento", { skip: !hayNavegador && ("sin navegador: " + porQueNo) }, async () => {
  // La dirección contraria. El umbral es una relación contra la mediana del
  // propio sitio, no un tiempo absoluto: un sitio uniformemente lento es asunto
  // del sitio, y un aviso que sale siempre deja de leerse.
  const { crawlSite } = await import("../../src/crawl.js");
  const { srv, url } = await sitioConUnaLentisima(0);
  try {
    const r = await crawlSite(url, { max: 10, pausaMs: 0 });
    assert.ok(r.ritmo, "los tiempos se guardan igual, aviso o no");
    assert.ok(!(r.avisos || []).some((a) => /NO RESPONDIÓ A RITMO CONSTANTE/.test(a)), JSON.stringify(r.avisos));
  } finally { srv.close(); }
});
