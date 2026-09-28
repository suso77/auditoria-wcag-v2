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

test("página con título e idioma → 2.4.2 cumple-parcial (lo descriptivo lo juzga una persona) y 3.1.1 cumple", () => {
  const v = verdicts('<html lang="es"><head><title>Inicio</title></head><body><main><h1>Hola</h1></main></body></html>');
  assert.ok(v["2.4.2"].includes("cumple-parcial"));
  assert.ok(v["3.1.1"].includes("cumple"));
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
  const v = verdicts('<html lang="ES-es"><head><title>t</title></head><body><main><h1>x</h1></main></body></html>');
  assert.ok(v["3.1.1"].includes("cumple"));
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

test("autoplay silenciado no dispara 1.4.2", () => {
  assert.deepEqual(soloDe(BASE + '<video src="v.mp4" autoplay muted></video></main></body></html>', /1\.4\.2/), []);
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
  assert.deepEqual(soloDe(BASE + "<p>" + ES + '</p><p lang="en">' + EN + "</p></main></body></html>", /3\.1\.2/), []);
});

test("un texto corto no basta para afirmar nada sobre el idioma", () => {
  assert.deepEqual(soloDe(BASE + "<p>" + ES + "</p><p>The quick brown fox.</p></main></body></html>", /3\.1\.2/), []);
});

test("una página entera en su idioma no genera falsos de 3.1.2", () => {
  assert.deepEqual(soloDe(BASE + "<p>" + ES + "</p><p>" + ES + "</p></main></body></html>", /3\.1\.2/), []);
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
