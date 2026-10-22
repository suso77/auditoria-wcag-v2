import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { auditPageHtml } from "../src/index.js";

/**
 * TODO NODO QUE LLEGA AL INFORME TIENE QUE PODER SEÑALARSE.
 *
 * La guía de capturas resalta el elemento POR SELECTOR, y el cotejo entre dos
 * pasadas sigue las barreras por selector. Una fila sin él no puede llevar
 * evidencia visual ni seguirse: en un informe de cliente es una barrera que
 * existe y a la que nadie puede ir.
 *
 * `page-audit.js` emitía nodos con `locator` y SIN `path` en los 29 sitios donde
 * nombra elementos, y es la capa que más criterios cubre. Medido sobre una
 * auditoría real de 12 páginas: 6 de 140 filas sin selector, 4 de ellas de aquí
 * —«Hay 2 landmarks main», con el elemento identificado como `main#main-content`,
 * que es un selector CSS válido tal cual—. El locator es legible pero no
 * identifica: dos `<main>` sin id se llaman igual.
 *
 * Esto es la guardia MECÁNICA que lo habría cazado: barre los emisores y exige
 * ruta en todos, con una lista explícita y corta de los que no tienen elemento
 * al que apuntar. Una guardia así vale más que revisar 29 sitios a mano, porque
 * el sitio 30 lo escribirá alguien que no leyó este comentario.
 */

/** Locators que legítimamente NO tienen elemento en el documento. */
const SIN_ELEMENTO = [
  "script (en línea)",   // un manejador dentro de un <script>: no es el script lo que falla
  "(texto)", "(CSS)", "(documento)", "(ninguno)"
];
const esSinElemento = (loc) => SIN_ELEMENTO.indexOf(String(loc)) !== -1;

/** Una página que dispara muchos emisores a la vez. */
const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title>
<meta http-equiv="refresh" content="30">
</head><body>
<a href="#main">Saltar al contenido principal</a>
<header><nav><ul><li><a href="/">Inicio</a></li></ul></nav></header>
<header><p>un segundo banner</p></header>
<main id="main-content"><h1>Título</h1>
  <h4>salto de nivel</h4>
  <h2></h2>
  <p lang="en">This paragraph is in English without any language marking around it, long enough to be profiled.</p>
  <video src="/v.mp4"></video>
  <audio src="/a.mp3" autoplay></audio>
  <iframe src="https://www.youtube.com/embed/x" title="vídeo"></iframe>
  <a href="https://example.com/pelicula.mp4">descargar vídeo</a>
  <div onkeydown="if(event.key==='s'){buscar()}">atajo</div>
  <p>Texto con <strong id="f1">una palabra fuerte</strong> y <em id="f2">otra en cursiva</em>.</p>
</main>
<main id="main">un segundo main</main>
<footer>pie uno</footer><footer>pie dos</footer>
</body></html>`;

test("ningún nodo de page-audit llega al informe sin ruta", () => {
  const fs = auditPageHtml(PAGINA, DOMParser);
  const sinRuta = [];
  let conNodos = 0, nodos = 0;
  fs.forEach(function (f) {
    if (!f.nodes || !f.nodes.length) return;
    conNodos++;
    f.nodes.forEach(function (n) {
      nodos++;
      if (esSinElemento(n.locator)) return;
      if (!n.path) sinRuta.push(f.c.n + " · " + n.locator);
    });
  });
  assert.ok(conNodos >= 6, "la página tiene que disparar varios emisores con nodos, disparó " + conNodos);
  assert.ok(nodos >= 10, "y varios nodos, salieron " + nodos);
  assert.deepEqual(sinRuta, [], "nodos sin selector: " + sinRuta.join(" | "));
});

test("la ruta de page-audit tiene la misma forma que la del motor", () => {
  /* Si las dos capas construyen rutas distintas, el cotejo entre capas se rompe:
   * la misma barrera vista por el motor y por esta capa saldría como dos. Por eso
   * esta capa usa `buildPath` del motor y no un constructor propio. */
  const fs = auditPageHtml(PAGINA, DOMParser);
  const rutas = [];
  fs.forEach(function (f) { (f.nodes || []).forEach(function (n) { if (n.path) rutas.push(n.path); }); });
  assert.ok(rutas.length >= 10, "salieron " + rutas.length + " rutas");
  rutas.forEach(function (r) {
    assert.match(r, /^(html > (body|head)|body)/, "la ruta tiene que empezar en el documento: " + r);
    assert.doesNotMatch(r, /undefined|\[object/, "ruta mal construida: " + r);
    /* Y NUNCA «html > body > head». `buildPath` prefijaba siempre `html > body`,
     * así que todo lo del `<head>` —el `<title>`, el meta de viewport, el de
     * refresco— salía con una ruta que selecciona 0 elementos. Son 2.4.2, 1.4.4,
     * 1.4.10 y 2.2.1: criterios por los que se sanciona, señalando a ningún
     * sitio. Esta es la forma exacta que delataba el defecto. */
    assert.doesNotMatch(r, /body > head(?![a-z])/, "el <head> no está dentro del <body>: " + r);
  });
});

test("los dos <main> duplicados se distinguen por su ruta", () => {
  // Era el caso real: dos filas de «Hay 2 landmarks main» y ninguna señalable.
  const f = auditPageHtml(PAGINA, DOMParser).filter(function (x) {
    return x.c.n === "1.3.1" && /landmarks main/.test((x.evid || []).join(" "));
  })[0];
  assert.ok(f, "la página tiene dos <main>: 1.3.1 tiene que acusarlo");
  assert.equal(f.nodes.length, 2);
  assert.ok(f.nodes[0].path && f.nodes[1].path);
  assert.notEqual(f.nodes[0].path, f.nodes[1].path, "dos elementos distintos, dos rutas distintas");
});

test("un locator sin elemento NO se inventa una ruta", () => {
  /* La dirección importa: inventar un selector que no selecciona es peor que no
   * ponerlo, porque la guía de capturas resaltaría otra cosa. */
  const fs = auditPageHtml(PAGINA, DOMParser);
  fs.forEach(function (f) {
    (f.nodes || []).forEach(function (n) {
      if (esSinElemento(n.locator)) assert.equal(n.path, "", "«" + n.locator + "» no tiene elemento: su ruta debe quedar vacía, no inventada");
    });
  });
});
