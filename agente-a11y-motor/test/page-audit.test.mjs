import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { auditPageHtml } from "../src/index.js";

function verdicts(html) {
  const doc = new DOMParser().parseFromString("", "text/html"); // no-op para asegurar carga
  void doc;
  const out = auditPageHtml(html, DOMParser);
  const map = {};
  out.forEach((f) => { map[f.c.n] = map[f.c.n] || []; map[f.c.n].push(f.verdict); });
  return map;
}

const PARRAFO_ES = "<p>El centro de visitantes abre todos los d\u00edas de la semana desde las nueve de la ma\u00f1ana hasta las siete de la tarde, y la entrada al museo es gratuita para los ni\u00f1os menores de doce a\u00f1os.</p>";
const PARRAFO_EN = "<p>The visitor centre opens every day of the week from nine in the morning until seven in the evening, and the entrance to the museum is free for children under the age of twelve.</p>";

test("página con título e idioma → 2.4.2 cumple-parcial (lo descriptivo lo juzga una persona) y 3.1.1 cumple", () => {
  const v = verdicts('<html lang="es"><head><title>Inicio</title></head><body><main><h1>Hola</h1>' + PARRAFO_ES + '</main></body></html>');
  assert.ok(v["2.4.2"].includes("cumple-parcial"));
  assert.ok(v["3.1.1"].includes("cumple"));
});

test("un lang bien escrito sobre texto de OTRO idioma no es conformidad", () => {
  // 3.1.1 no pide un atributo bien formado: pide que el idioma por omisión se
  // pueda determinar. Una página en inglés con lang="es" se lee con voz
  // española, y el motor la declaraba «cumple».
  const v = verdicts('<html lang="es"><head><title>Home</title></head><body><main><h1>Welcome</h1>' + PARRAFO_EN + '</main></body></html>');
  assert.ok(v["3.1.1"].includes("revisar"), JSON.stringify(v["3.1.1"]));
  assert.ok(!v["3.1.1"].includes("cumple"));
});

test("sin texto que comparar, el lang bien formado es cumple-parcial, no cumple", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>Hola</h1></main></body></html>');
  assert.ok(v["3.1.1"].includes("cumple-parcial"), JSON.stringify(v["3.1.1"]));
  assert.ok(!v["3.1.1"].includes("cumple"));
});

test("sin <title> → falla 2.4.2", () => {
  const v = verdicts('<html lang="es"><head></head><body><main><h1>x</h1></main></body></html>');
  assert.ok(v["2.4.2"].includes("falla"));
});

test("sin lang → falla 3.1.1", () => {
  const v = verdicts('<html><head><title>t</title></head><body><main><h1>x</h1></main></body></html>');
  assert.ok(v["3.1.1"].includes("falla"));
});

test("dos <main> → falla 1.3.1", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main>a</main><main>b</main></body></html>');
  assert.ok(v["1.3.1"].includes("falla"));
});

test("salto de nivel de encabezado (h1→h3) → revisar 1.3.1", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>A</h1><h3>B</h3></main></body></html>');
  assert.ok((v["1.3.1"] || []).includes("revisar"));
});

test("enlace de salto → 2.4.1 cumple-parcial", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><a href="#main">Saltar</a><main id="main"><h1>x</h1></main></body></html>');
  assert.ok(v["2.4.1"].includes("cumple-parcial"));
});

test("ids duplicados usados en label → falla 1.3.1", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>x</h1><label for="d">A</label><input id="d"><input id="d"></main></body></html>');
  assert.ok(v["1.3.1"].includes("falla"));
});

/* ── Regresiones de la revisión exhaustiva nº 2 ── */

test("regresión: <svg><title> NO satisface 2.4.2", () => {
  const v = verdicts('<html lang="es"><head></head><body><main><h1>x</h1><svg><title>Icono de menú</title></svg></main></body></html>');
  assert.ok(v["2.4.2"].includes("falla"), "el title de un svg es texto alternativo del gráfico, no el título de la página");
});

test("regresión: varios <title> con el primero vacío → vale el que tiene texto", () => {
  const v = verdicts('<html lang="es"><head><title></title><title>Inicio real</title></head><body><main><h1>x</h1></main></body></html>');
  assert.ok(!v["2.4.2"].includes("falla"));
});

test("regresión: <header role=\"banner\"> cuenta UNA vez, no dos", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><header role="banner">c</header><main><h1>x</h1></main><footer role="contentinfo">p</footer></body></html>');
  assert.ok(!(v["1.3.1"] || []).includes("revisar"), "no debe avisar de landmarks banner/contentinfo duplicados");
});

test("regresión: lang en mayúsculas es BCP-47 válido", () => {
  // Lo que este test defiende es que `ES-es` NO es una etiqueta inválida; con
  // texto español delante, el veredicto es conformidad.
  const v = verdicts('<html lang="ES-es"><head><title>t</title></head><body><main><h1>x</h1>' + PARRAFO_ES + '</main></body></html>');
  assert.ok(v["3.1.1"].includes("cumple"), JSON.stringify(v["3.1.1"]));
  assert.ok(!v["3.1.1"].includes("falla"));
});

test("regresión: encabezados ocultos no cuentan para el salto de jerarquía", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>A</h1><h2 hidden>oculto</h2><h2 aria-hidden="true">tampoco</h2><h2>B</h2></main></body></html>');
  assert.ok(!(v["1.3.1"] || []).includes("revisar"));
});

test("regresión: landmarks ocultos no inflan la cuenta", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><header>uno</header><header style="display:none">dos</header><main><h1>x</h1></main></body></html>');
  assert.ok(!(v["1.3.1"] || []).includes("revisar"));
});

test("regresión: href=\"#\" no es un enlace de salto", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><a href="#">Menú</a><main><h1>x</h1></main></body></html>');
  assert.ok(!v["2.4.1"].includes("cumple-parcial"));
});

test("regresión: enlace de salto a un id inexistente no cuenta", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><a href="#no-existe">Saltar</a><main id="main"><h1>x</h1></main></body></html>');
  assert.ok(!v["2.4.1"].includes("cumple-parcial"));
});

test("nuevo: referencia IDREF colgante → falla 4.1.2", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>x</h1><input aria-describedby="ayuda-que-no-existe"></main></body></html>');
  assert.ok((v["4.1.2"] || []).includes("falla"));
});

test("nuevo: aria-errormessage duplicado también se detecta", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>x</h1><input aria-errormessage="e"><p id="e">a</p><p id="e">b</p></main></body></html>');
  assert.ok(v["1.3.1"].includes("falla"));
});

test("nuevo: encabezado vacío → falla 2.4.6", () => {
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>A</h1><h2></h2></main></body></html>');
  assert.ok((v["2.4.6"] || []).includes("falla"));
});

/* ── 1.2.x y 1.4.2: el inventario de medios sí es automatizable ─────────── */

const soloDe = (html, re) => auditPageHtml(html, DOMParser).filter((f) => re.test(f.c.n));
const BASE = '<html lang="es"><head><title>T</title></head><body><main>';

test("un vídeo sin ninguna pista de subtítulos falla 1.2.2", () => {
  // Los cinco criterios de 1.2 estaban enteros en «evaluación humana», y la
  // mitad del trabajo no lo es: que no haya pista se ve en el marcado, igual que
  // se ve que una imagen no tiene alt. La CALIDAD sigue siendo juicio.
  const f = soloDe(BASE + '<video src="v.mp4" controls></video></main></body></html>', /1\.2\.2/)[0];
  assert.equal(f.verdict, "falla");
  assert.match(f.evid[0], /ninguna pista de subtítulos/);
  assert.equal(f.nodes.length, 1);
});

test("con pista declarada, 1.2.2 baja a cumple-parcial y dice qué falta mirar", () => {
  const f = soloDe(BASE + '<video src="v.mp4"><track kind="captions" src="s.vtt"></video></main></body></html>', /1\.2\.2/)[0];
  assert.equal(f.verdict, "cumple-parcial");
  assert.match(f.evid[0], /sincronizados/);
});

test("un medio incrustado de terceros se lista para abrirlo, no se dictamina", () => {
  const f = soloDe(BASE + '<iframe src="https://www.youtube.com/embed/abc" title="Charla"></iframe></main></body></html>', /1\.2\.2/)[0];
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /no se ve desde aquí/);
});

test("autoplay con sonido y sin controles falla 1.4.2", () => {
  const f = soloDe(BASE + '<audio src="a.mp3" autoplay></audio></main></body></html>', /1\.4\.2/)[0];
  assert.equal(f.verdict, "falla");
  assert.match(f.evid[0], /3 segundos/);
});

test("autoplay silenciado no dispara una FALLA de 1.4.2, pero sí se dice", () => {
  /* Antes esto no emitía nada, y el silencio era el problema: 1.4.2 fue el último
   * «No evaluado» de los 55 subcriterios en una auditoría real. Un `autoplay muted`
   * no incumple —no hay audio que controlar— y eso es un resultado medido, no una
   * fila en blanco. */
  const f = soloDe(BASE + '<video src="v.mp4" autoplay muted></video></main></body></html>', /1\.4\.2/);
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"], JSON.stringify(f));
  assert.ok(!f.some((x) => x.verdict === "falla"), "silenciado no es una falla");
  assert.match(f[0].evid[0], /están silenciados/);
});

test("sin medios, ninguno de los criterios de 1.2 se inventa", () => {
  assert.deepEqual(soloDe(BASE + "<p>Solo texto.</p></main></body></html>", /1\.2\.|1\.4\.2/), []);
});

/* ── 3.1.2 Idioma de las partes ─────────────────────────────────────────── */

const ES = "Esto es un párrafo normal en español con bastantes palabras para que el detector tenga material suficiente y pueda decidir con garantías.";
const EN = "The quick brown fox jumps over the lazy dog and the rest of this sentence is here to give the detector enough words to be sure about the language.";

test("un bloque en otro idioma sin lang queda a revisar", () => {
  const f = soloDe(BASE + "<p>" + ES + "</p><p>" + EN + "</p></main></body></html>", /3\.1\.2/)[0];
  assert.equal(f.verdict, "revisar", "es `revisar`, no `falla`: la detección puede equivocarse");
  assert.match(f.evid[0], /confírmalo/);
});

test("si el bloque declara su idioma, no se señala", () => {
  // Lo que este test defiende es que NO se señale, no que el criterio se calle:
  // desde v0.37.0 emite su `cumple-parcial` diciendo qué ha revisado y qué no
  // alcanza a ver la detección. Un criterio en blanco se lee como conforme.
  const f = soloDe(BASE + "<p>" + ES + '</p><p lang="en">' + EN + "</p></main></body></html>", /3\.1\.2/);
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"]);
  assert.ok(!f.some((x) => /parecen estar en un idioma distinto/.test(x.evid.join(" "))));
});

test("un texto corto no basta para afirmar nada sobre el idioma", () => {
  const f = soloDe(BASE + "<p>" + ES + "</p><p>The quick brown fox.</p></main></body></html>", /3\.1\.2/);
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"]);
  // Y el propio veredicto avisa de ese límite, que es lo que lo hace honesto.
  assert.match(f[0].evid.join(" "), /25 palabras/);
});

test("una página entera en su idioma no genera falsos de 3.1.2", () => {
  const f = soloDe(BASE + "<p>" + ES + "</p><p>" + ES + "</p></main></body></html>", /3\.1\.2/);
  assert.deepEqual(f.map((x) => x.verdict), ["cumple-parcial"]);
  assert.ok(!f.some((x) => x.verdict === "revisar"));
});

/* ── Criterios de interacción: lo que sí se ve en el marcado ─────────────── */

test("meta refresh falla 2.2.1: nadie puede ajustarlo", () => {
  // Es el fallo determinable del criterio: recarga o redirige sola, sin aviso y
  // sin forma de pararla. WCAG solo lo admite por encima de las 20 horas.
  const f = soloDe('<html lang="es"><head><title>T</title><meta http-equiv="refresh" content="30;url=/otra"></head><body><main>x</main></body></html>', /2\.2\.1/)[0];
  assert.equal(f.verdict, "falla");
  assert.match(f.evid[0], /redirige sola/);
});

test("un refresh por encima de 20 horas no se acusa", () => {
  assert.deepEqual(soloDe('<html lang="es"><head><title>T</title><meta http-equiv="refresh" content="90000"></head><body><main>x</main></body></html>', /2\.2\.1/), []);
});

test("2.1.4: una tecla suelta sin modificador queda a revisar", () => {
  const f = soloDe('<html lang="es"><head><title>T</title></head><body><main><div onkeydown="if(e.key===&quot;s&quot;)buscar()">x</div></main></body></html>', /2\.1\.4/)[0];
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /sin exigir Ctrl/);
  assert.match(f.evid[0], /bundle externo no se detectan/, "tiene que declarar su propio alcance");
});

test("2.1.4: con modificador no se acusa", () => {
  assert.deepEqual(soloDe('<html lang="es"><head><title>T</title></head><body><main><div onkeydown="if(e.ctrlKey&&e.key===&quot;s&quot;)g()">x</div></main></body></html>', /2\.1\.4/), []);
});

test("los criterios de puntero señalan dónde mirar, sin dictaminar", () => {
  const arr = soloDe('<html lang="es"><head><title>T</title></head><body><main><div draggable="true" ondragstart="x()">Mover</div></main></body></html>', /2\.5\.7/)[0];
  assert.equal(arr.verdict, "revisar");
  assert.match(arr.evid[0], /no dictamina este criterio/);

  const down = soloDe('<html lang="es"><head><title>T</title></head><body><main><button onmousedown="borrar()">Borrar</button></main></body></html>', /2\.5\.2/)[0];
  assert.equal(down.verdict, "revisar");
  assert.match(down.evid[0], /en la soltada/);
});

test("una página sin nada de esto no genera ninguno de los seis", () => {
  assert.deepEqual(soloDe('<html lang="es"><head><title>T</title></head><body><main><p>Solo texto.</p></main></body></html>', /2\.2\.1|2\.1\.4|2\.5\./), []);
});

/* ── 2.4.1: qué es un enlace de salto y qué no ───────────────────────────── */

const unoDe = (html, crit) => {
  const out = auditPageHtml(html, DOMParser).filter((f) => f.c.n === crit);
  return out.length === 1 ? out[0] : out;
};
const pag = (body) => '<html lang="es"><head><title>t</title></head><body>' + body + "</body></html>";

test("2.4.1: el enlace de salto al contenido principal es cumple-parcial y dice cuánto ahorra", () => {
  const f = unoDe(pag('<a href="#main">Saltar al contenido</a><nav><a href="/a">A</a><a href="/b">B</a></nav><main id="main"><h1>T</h1><p>x</p></main>'), "2.4.1");
  assert.equal(f.verdict, "cumple-parcial");
  assert.match(f.evid[0], /se ahorra 2 control/, f.evid[0]);
});

test("2.4.1: un ancla de acordeón al principio NO es un enlace de salto", () => {
  /* Estructuralmente es idéntica a un enlace de salto: primer control enfocable, y
   * su destino está detrás del menú. Lo comprobé y pasaba por enlace de salto, con
   * lo que el criterio salía casi cumplido por un control que despliega un panel.
   * Por el nombre no se puede distinguir sin atarse a un idioma, así que se
   * distingue por el destino: solo cuenta si apunta al landmark `main`. */
  const f = unoDe(pag('<nav><a href="#panel">Desplegar</a><a href="/a">A</a><a href="/b">B</a></nav><h2 id="panel">Panel</h2><p>x</p>'), "2.4.1");
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /su destino no es el landmark/, f.evid[0]);
});

test("2.4.1: un «volver arriba» del pie no cuenta como mecanismo de salto", () => {
  const f = unoDe(pag('<nav id="arriba"><a href="/a">A</a><a href="/b">B</a></nav><h1>T</h1><p>x</p><footer><a href="#arriba">Volver arriba</a></footer>'), "2.4.1");
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /ninguna está entre los primeros controles enfocables/, f.evid[0]);
});

test("2.4.1: la evidencia distingue los landmarks de los encabezados y cuenta las tabulaciones", () => {
  /* Medido en un sitio real: cero `main`, cero `nav`, cero anclas internas y catorce
   * encabezados — y la evidencia decía «hay landmarks/encabezados», juntando las dos
   * cosas, con lo que el informe afirmaba un landmark que la página no tiene. Y el
   * número que de verdad decide este criterio a mano —cuánto hay que tabular para
   * llegar al contenido— no se daba. */
  const f = unoDe(pag('<div><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></div><h2>Destinos</h2><p>x</p><h2>Rutas</h2>'), "2.4.1");
  assert.equal(f.verdict, "revisar");
  const todo = f.evid.join(" ");
  assert.ok(!/landmark main/.test(todo), "no puede nombrar un landmark que no existe: " + todo);
  assert.match(todo, /2 encabezado\(s\)/);
  assert.match(todo, /tabular por 3 control\(es\) para llegar al primer encabezado/);
  assert.match(todo, /sin lector de pantalla no tiene con qué saltar/, "y la advertencia que decide el criterio");
});

test("2.4.1: el orden del documento no depende de compareDocumentPosition", () => {
  /* En linkedom no está implementado: devolvía `undefined`, la máscara de bits daba
   * 0 y TODO quedaba «antes de todo» — el enlace de salto bueno se rechazaba y la
   * cuenta de controles previos salía 0 siempre, un dato falso en la evidencia. El
   * motor corre en linkedom y en el navegador, así que el índice es propio. */
  const doc = new DOMParser().parseFromString(pag("<p>x</p>"), "text/html");
  const p = doc.querySelector("p");
  assert.ok(typeof p.compareDocumentPosition !== "function" || p.compareDocumentPosition(doc.body) !== undefined,
    "si linkedom llega a implementarlo, este test deja de hacer falta; mientras no lo haga, el índice propio es obligatorio");
  const f = unoDe(pag('<a href="#main">Saltar</a><nav><a href="/a">A</a></nav><main id="main"><h1>T</h1></main>'), "2.4.1");
  assert.equal(f.verdict, "cumple-parcial", "con compareDocumentPosition roto esto salía `revisar`");
});

/* ── El inventario de medios: una sola lista de reproductores ─────────────── */

/**
 * El guard que faltaba, y que explica por qué 1.2.1, 1.2.2 y 1.2.3 salieron en blanco
 * en una auditoría real de un sitio chino.
 *
 * Había DOS listas de reproductores: la de `cuaderno.js` —que decide 1.2.4 y 1.2.5— y
 * otra en `page-audit.js` con nueve dominios occidentales y ninguna plataforma china.
 * Cuando se arregló el inventario para reconocer Youku, Bilibili, iQiyi y compañía, el
 * arreglo entró en el cuaderno y no aquí, así que el mismo sitio tenía sus
 * reproductores reconocidos para dos criterios y no para los otros tres. El fallo no
 * era la lista corta: era tener dos listas.
 */
test("medios: los reproductores chinos se reconocen también en el ámbito de página", () => {
  const PLATAFORMAS = [
    ["https://player.bilibili.com/player.html?aid=1", "Bilibili"],
    ["https://player.youku.com/embed/XYZ", "Youku"],
    ["https://open.iqiyi.com/developer/player_js/x.html", "iQiyi"],
    ["https://v.qq.com/txp/iframe/player.html?vid=x", "Tencent Video"],
    ["https://www.youtube.com/embed/x", "YouTube"]
  ];
  PLATAFORMAS.forEach(function (par) {
    const html = '<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' +
      '<iframe src="' + par[0] + '" title="Vídeo"></iframe></main></body></html>';
    const f = auditPageHtml(html, DOMParser).filter((x) => x.c.n === "1.2.2");
    assert.equal(f.length, 1, par[1] + " tiene que reconocerse como reproductor: " + JSON.stringify(f));
    assert.match(f[0].evid[0], /incrustados de terceros/, par[1] + ": " + f[0].evid[0]);
  });
});

test("medios: un marco que no se reconoce no deja los criterios en blanco", () => {
  /* El cuaderno ya trataba los marcos dudosos así para 1.2.4 y 1.2.5; aquí no, y el
   * efecto era que en una página cuyo único medio es un marco desconocido, 1.2.1,
   * 1.2.2 y 1.2.3 no emitían nada. Una fila en blanco no es «no aplica». */
  const html = '<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' +
    '<iframe src="https://widget.ejemplo.cn/x" title="Widget"></iframe></main></body></html>';
  const f = auditPageHtml(html, DOMParser).filter((x) => x.c.n === "1.2.2");
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /no se reconocen ni como reproductor/);
  assert.match(f[0].evid[0], /1\.2\.1, 1\.2\.2 y 1\.2\.3 aplican/);
});

test("medios: un mapa o un captcha NO cuentan como medio dudoso", () => {
  const html = '<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' +
    '<iframe src="https://www.google.com/maps/embed?pb=1" title="Mapa"></iframe>' +
    '<iframe src="https://www.google.com/recaptcha/api2/anchor" title="captcha"></iframe></main></body></html>';
  const f = auditPageHtml(html, DOMParser).filter((x) => ["1.2.1", "1.2.2", "1.2.3", "1.4.2"].includes(x.c.n));
  assert.deepEqual(f, [], "un mapa no es un medio: " + JSON.stringify(f.map((x) => x.c.n + "/" + x.evid[0])));
});

test("medios: 1.2.3 distingue el vídeo sin nada del que tiene transcripción al lado", () => {
  /* La evidencia decía «ni se detecta una alternativa» y no se detectaba nada: 1.2.3
   * se satisface con una alternativa en texto, que no vive dentro del `<video>` sino
   * al lado. Y el léxico va en los mismos idiomas que el de la ayuda, por el mismo
   * motivo: con «transcript» y «transcripción» a secas, un sitio chino no tiene
   * ninguna. */
  const con = '<figure><video src="/v.mp4"></video><a href="/t.html">Transcripción del vídeo</a></figure>';
  const chino = '<figure><video src="/v.mp4"></video><a href="/t.html">文字稿</a></figure>';
  const sin = '<figure><video src="/v.mp4"></video><a href="/otra.html">Siguiente vídeo</a></figure>';
  const uno = (body) => {
    const html = '<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' + body + "</main></body></html>";
    return auditPageHtml(html, DOMParser).find((x) => x.c.n === "1.2.3");
  };
  assert.match(uno(con).evid.join(" "), /alternativa anunciada al lado/);
  assert.match(uno(chino).evid.join(" "), /文字稿/, "el léxico tiene que cubrir el chino");
  assert.match(uno(sin).evid[0], /NO se encuentra junto a ellos nada/);
});

test("1.4.2: era el último «No evaluado» de los 55, y ya no lo es", () => {
  /* Solo hablaba al encontrar un medio con `autoplay`, así que en un sitio sin
   * `<video>` ni `<audio>` en el DOM —el caso medido: 26 vídeos ofrecidos como
   * enlaces a un reproductor externo— la fila quedaba vacía, y era la única de los 55
   * subcriterios que seguía sin veredicto en la quinta pasada. El criterio sí se
   * puede acotar: lo que prohíbe es el audio que arranca SOLO al cargar. */
  const uno = (body) => {
    const html = '<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' + body + "</main></body></html>";
    return auditPageHtml(html, DOMParser).filter((f) => f.c.n === "1.4.2");
  };
  const enlaces = uno('<a class="swipebox-video" href="https://x.vod2.myqcloud.com/vod-player/a/tcplayer/console/vod-player.html?autoplay=1">Vídeo</a>');
  assert.equal(enlaces.length, 1, "una página con medios enlazados tiene que dictaminar 1.4.2");
  assert.equal(enlaces[0].verdict, "cumple-parcial");
  assert.match(enlaces[0].evid[0], /se abren al pulsarlos, lo que no es automático/);
  assert.match(enlaces[0].evid[1], /`autoplay` en la URL/, "y avisa de lo que sí hay que abrir a mirar");

  const conMedio = uno('<video src="/v.mp4" controls></video>');
  assert.equal(conMedio[0].verdict, "cumple-parcial");
  assert.match(conMedio[0].evid[0], /ninguno declara `autoplay`/);
  assert.match(conMedio[0].evid[1], /play\(\)` diferido/, "y lo que queda fuera de la medición");

  // Y lo que sí es una falla sigue siéndolo.
  const malo = uno('<audio src="/a.mp3" autoplay></audio>');
  assert.equal(malo[0].verdict, "falla");
});

/* ── 3.1.2 habla siempre, también cuando no encuentra nada (v0.37.0) ───────── */
test("3.1.2 no se queda en blanco en una página de un solo idioma", () => {
  // Solo hablaba al encontrar un bloque sospechoso, así que una página
  // homogénea salía «No evaluado» en la hoja de seguimiento — que se lee igual
  // que «nadie lo miró».
  const v = verdicts('<html lang="es"><head><title>t</title></head><body><main><h1>x</h1>' + PARRAFO_ES + '</main></body></html>');
  assert.deepEqual(v["3.1.2"], ["cumple-parcial"]);

  // Con un bloque en otro idioma sin marcar, sigue siendo `revisar`.
  const mezcla = verdicts('<html lang="es"><head><title>t</title></head><body><main>' + PARRAFO_ES + PARRAFO_EN + '</main></body></html>');
  assert.ok(mezcla["3.1.2"].includes("revisar"));

  // Y marcado con su propio lang, deja de ser sospechoso.
  const marcado = verdicts('<html lang="es"><head><title>t</title></head><body><main>' + PARRAFO_ES + PARRAFO_EN.replace("<p>", '<p lang="en">') + '</main></body></html>');
  assert.deepEqual(marcado["3.1.2"], ["cumple-parcial"]);
});

test("sin lang en <html>, 3.1.2 tampoco se declara conforme", () => {
  const v = verdicts('<html><head><title>t</title></head><body><main>' + PARRAFO_ES + '</main></body></html>');
  assert.deepEqual(v["3.1.2"], ["revisar"]);
});

/* ── El perfil de idioma cubre las lenguas cooficiales (v0.38.0) ───────────── */
const PARRAFO_CA = "<p>El centre de visitants obre tots els dies de la setmana des de les nou del matí fins a les set de la tarda, i l'entrada al museu és gratuïta per als nens menors de dotze anys. Aquesta visita també es pot reservar amb molt de temps.</p>";
const PARRAFO_EU = "<p>Bisitarien zentroa asteko egun guztietan dago zabalik goizeko bederatzietatik arratsaldeko zazpiak arte, eta museoko sarrera doakoa da hamabi urtetik beherako haurrentzat. Bisita gidatuak ere badaude eta horiek guztiak eskatu daitezke.</p>";
const pagLang = (lang, cuerpo) => '<html lang="' + lang + '"><head><title>t</title></head><body><main>' + cuerpo + "</main></body></html>";

test("el euskera se reconoce: declarado bien confirma, declarado mal se acusa", () => {
  // Antes el perfil solo distinguía es/en/fr/pt/gl, así que una web pública en
  // euskera no tenía con qué compararse.
  assert.deepEqual(verdicts(pagLang("eu", PARRAFO_EU))["3.1.1"], ["cumple"]);
  assert.deepEqual(verdicts(pagLang("es", PARRAFO_EU))["3.1.1"], ["revisar"]);
  assert.deepEqual(verdicts(pagLang("eu", PARRAFO_ES))["3.1.1"], ["revisar"]);
});

test("con catalán y castellano el perfil NO decide, y lo dice en vez de firmar", () => {
  /* Comparten «el», «la», «de», «un», «no»: empatan. Declarar conformidad ahí
   * sería declarar sobre una medición que no discrimina, y daría por buena una
   * página catalana etiquetada como `lang="es"` — un caso real en una web
   * bilingüe. Así que ninguna de las dos direcciones se firma. */
  const ca = verdicts(pagLang("ca", PARRAFO_CA))["3.1.1"];
  assert.deepEqual(ca, ["cumple-parcial"]);
  assert.deepEqual(verdicts(pagLang("es", PARRAFO_CA))["3.1.1"], ["cumple-parcial"]);
  // Y el veredicto nombra el empate concreto, que es lo que hay que ir a mirar.
  const f = auditPageHtml(pagLang("ca", PARRAFO_CA), DOMParser).find((x) => x.c.n === "3.1.1");
  assert.match(f.evid[0], /empatan/);
  assert.match(f.evid[0], /confirma a ojo/);
});

test("un idioma que el perfil no cubre se declara como tal, no se acusa", () => {
  // Con `lang="de"` sobre texto alemán, lo honesto es decir que el motor no
  // distingue ese idioma — no señalar el que más se le parezca.
  const aleman = "<p>Das Besucherzentrum ist an allen Tagen der Woche von neun Uhr morgens bis sieben Uhr abends geöffnet, und der Eintritt in das Museum ist für Kinder unter zwölf Jahren frei.</p>";
  const f = auditPageHtml(pagLang("de", aleman), DOMParser).find((x) => x.c.n === "3.1.1");
  assert.equal(f.verdict, "cumple-parcial");
  assert.match(f.evid[0], /no cubre «de»/);
});
