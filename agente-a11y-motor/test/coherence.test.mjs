import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import {
  normalizarHref, normalizarNombre, ordenRelativo, fingerprintPage,
  analyzeNavConsistency, analyzeIdConsistency, analyzeHelpConsistency, analyzeMultipleWays, analyzeCoherence,
  FINGERPRINT_BODY
} from "../src/coherence.js";

const v = (fs) => fs.map((f) => f.c.n + "/" + f.verdict);
const huella = (html, url) => fingerprintPage(new DOMParser().parseFromString(html, "text/html"), url);

/* ── Normalización: es la identidad de «misma función» ── */

test("el mismo destino escrito de formas distintas es el mismo destino", () => {
  const base = "https://ejemplo.es/seccion/pagina";
  const esperado = "ejemplo.es/contacto";
  ["/contacto", "/contacto/", "https://ejemplo.es/contacto", "/contacto#formulario", "../../contacto"]
    .forEach((h) => assert.equal(normalizarHref(h, base), esperado, h));
});

test("un ancla interna no identifica una página", () => {
  assert.equal(normalizarHref("#main", "https://ejemplo.es/"), null);
  assert.equal(normalizarHref("#", "https://ejemplo.es/"), null);
  assert.equal(normalizarHref("", "https://ejemplo.es/"), null);
});

test("la query sí distingue páginas; el fragmento no", () => {
  const b = "https://ejemplo.es/";
  assert.notEqual(normalizarHref("/buscar?q=a", b), normalizarHref("/buscar?q=b", b));
  assert.equal(normalizarHref("/p#uno", b), normalizarHref("/p#dos", b));
});

test("mailto y tel se conservan como destinos", () => {
  assert.equal(normalizarHref("mailto:Info@Ejemplo.es"), "mailto:info@ejemplo.es");
  assert.equal(normalizarHref("tel:+34 900 123 456"), "tel:+34900123456");
});

test("el nombre se compara sin acentos ni puntuación", () => {
  assert.equal(normalizarNombre("  ¿Qué hacemos?  "), "que hacemos");
  assert.equal(normalizarNombre("Contáctanos"), normalizarNombre("CONTACTANOS"));
});

/* ── Orden relativo ── */

test("ordenRelativo solo compara lo que las dos secuencias comparten", () => {
  assert.equal(ordenRelativo(["a", "b", "c"], ["a", "x", "b", "y", "c"]), null, "intercalar elementos nuevos no altera el orden");
  assert.equal(ordenRelativo(["a", "b", "c"], ["a", "c"]), null, "faltar un elemento tampoco");
  assert.deepEqual(ordenRelativo(["a", "b", "c"], ["c", "b", "a"]), { antes: "a", despues: "b" });
});

/* ── 3.2.3 Navegación coherente ── */

const NOMBRES = { "/a": "Inicio", "/b": "Servicios", "/c": "Contacto", "/nuevo": "Blog" };
const nav = (items, url) => ({ url, navs: [{ items: items.map((h) => ({ href: h, name: NOMBRES[h] || h })) }], enlaces: [], ayuda: [], vias: {} });

test("mismo orden de navegación en toda la muestra → cumple 3.2.3, y lo enseña", () => {
  const out = analyzeNavConsistency([nav(["/a", "/b", "/c"], "/1"), nav(["/a", "/b", "/c"], "/2")]);
  assert.deepEqual(v(out), ["3.2.3/cumple"]);
  assert.match(out[0].evid[0], /«Inicio» → «Servicios» → «Contacto»/);
});

test("añadir un enlace nuevo en medio NO es incoherencia", () => {
  const out = analyzeNavConsistency([nav(["/a", "/b", "/c"], "/1"), nav(["/a", "/nuevo", "/b", "/c"], "/2")]);
  assert.deepEqual(v(out), ["3.2.3/cumple"]);
});

test("invertir dos enlaces sí es incoherencia → falla 3.2.3", () => {
  const out = analyzeNavConsistency([nav(["/a", "/b", "/c"], "/1"), nav(["/c", "/b", "/a"], "/2")]);
  assert.deepEqual(v(out), ["3.2.3/falla"]);
  assert.match(out[0].evid[0], /\/2/);
  assert.match(out[0].evid[0], /aparece antes que/);
  // La evidencia usa el nombre del enlace, no el destino normalizado.
  assert.match(out[0].evid[0], /«Servicios» aparece antes que «Inicio»/, out[0].evid[0]);
});

test("con una sola página no se puede comparar → revisar, no cumple", () => {
  assert.deepEqual(v(analyzeNavConsistency([nav(["/a", "/b"], "/1")])), ["3.2.3/revisar"]);
  assert.deepEqual(v(analyzeNavConsistency([])), ["3.2.3/revisar"]);
});

/* ── 3.2.4 Identificación coherente ── */

const pag = (enlaces, url) => ({ url, navs: [], enlaces: enlaces.map(([href, name], i) => ({ href, name, locator: "a", orden: i })), ayuda: [], vias: {} });

test("el mismo destino con el mismo nombre → cumple 3.2.4", () => {
  const out = analyzeIdConsistency([pag([["/contacto", "Contacto"]], "/1"), pag([["/contacto", "contacto"]], "/2")]);
  assert.deepEqual(v(out), ["3.2.4/cumple"]);
});

test("el mismo destino con nombres contradictorios → falla 3.2.4", () => {
  const out = analyzeIdConsistency([pag([["/buscar", "Buscar"]], "/1"), pag([["/buscar", "Localizador"]], "/2")]);
  assert.deepEqual(v(out), ["3.2.4/falla"]);
  assert.match(out[0].evid[0], /Buscar/);
  assert.match(out[0].evid[0], /Localizador/);
});

test("una variante que contiene a la otra es matiz, no contradicción → revisar", () => {
  const out = analyzeIdConsistency([pag([["/", "Inicio"]], "/1"), pag([["/", "Ir a Inicio"]], "/2")]);
  assert.deepEqual(v(out), ["3.2.4/revisar"]);
  assert.match(out[0].evid[0], /variantes/);
});

test("sin destinos repetidos no se puede comprobar", () => {
  assert.deepEqual(v(analyzeIdConsistency([])), ["3.2.4/revisar"]);
});

/* ── 3.2.6 Ayuda coherente ── */

const ay = (pares, url) => ({ url, navs: [], enlaces: [], ayuda: pares.map(([tipo, region]) => ({ tipo, region: region || "pie" })), vias: {} });

test("regresión: no detectar ayuda NO es haber comprobado que no la hay → revisar", () => {
  // Antes salía «cumple: el criterio solo aplica cuando hay ayuda». Pero la
  // detección son unos patrones sobre los enlaces visibles: un «Atención al
  // cliente», un <button>Asistencia</button> o un chat en un ancla interna se le
  // escapan, y entonces el informe declaraba conforme algo que nadie miró.
  const out = analyzeHelpConsistency([ay([], "/1"), ay([], "/2")]);
  assert.deepEqual(v(out), ["3.2.6/revisar"]);
  assert.match(out[0].evid[0], /patrones conocidos/);
  assert.match(out[0].evid[0], /a mano/);
});

test("la ayuda siempre en el mismo sitio → cumple-parcial (que sea suficiente lo juzga una persona)", () => {
  const out = analyzeHelpConsistency([ay([["ayuda", "pie"], ["contacto", "pie"]], "/1"), ay([["ayuda", "pie"], ["contacto", "pie"]], "/2")]);
  assert.deepEqual(v(out), ["3.2.6/cumple-parcial"]);
  assert.match(out[0].evid[0], /ayuda → pie/);
});

test("el mismo mecanismo que se muda de la cabecera al pie → falla 3.2.6", () => {
  const out = analyzeHelpConsistency([ay([["ayuda", "cabecera"]], "/1"), ay([["ayuda", "pie"]], "/2")]);
  assert.deepEqual(v(out), ["3.2.6/falla"]);
  assert.match(out[0].evid[0], /cambia de sitio/);
});

test("regresión: dos mecanismos en regiones distintas NO son incoherencia por su orden", () => {
  // «Contacto» en el menú y «Ayuda» en el pie cambian de orden relativo en cuanto
  // una página añade un enlace contextual, sin que nada se haya movido de sitio.
  const a = ay([["contacto", "navegación"], ["ayuda", "pie"]], "/1");
  const b = ay([["ayuda", "pie"], ["contacto", "navegación"]], "/2");
  assert.deepEqual(v(analyzeHelpConsistency([a, b])), ["3.2.6/cumple-parcial"]);
});

test("pero dentro de la MISMA región el orden sí cuenta", () => {
  const a = ay([["ayuda", "pie"], ["contacto", "pie"]], "/1");
  const b = ay([["contacto", "pie"], ["ayuda", "pie"]], "/2");
  assert.deepEqual(v(analyzeHelpConsistency([a, b])), ["3.2.6/falla"]);
  assert.match(analyzeHelpConsistency([a, b])[0].evid[0], /cambia de orden/);
});

test("páginas sin ayuda se avisan, no se penalizan", () => {
  const out = analyzeHelpConsistency([ay([["ayuda", "pie"]], "/1"), ay([["ayuda", "pie"]], "/2"), ay([], "/3")]);
  assert.deepEqual(v(out), ["3.2.6/cumple-parcial"]);
  assert.match(out[0].evid[1], /no ofrecen ninguno/);
});

/* ── 2.4.5 Múltiples vías ── */

const via = (vias) => ({ url: "/x", navs: [], enlaces: [], ayuda: [], vias });

test("dos o más vías → cumple 2.4.5", () => {
  assert.deepEqual(v(analyzeMultipleWays([via({ buscador: true, navegacion: true })])), ["2.4.5/cumple"]);
});

test("se suman las vías de toda la muestra, no de una página", () => {
  const out = analyzeMultipleWays([via({ buscador: true }), via({ mapaWeb: true })]);
  assert.deepEqual(v(out), ["2.4.5/cumple"]);
});

test("una sola vía → revisar, con la excepción del paso de un proceso", () => {
  const out = analyzeMultipleWays([via({ navegacion: true }), via({ navegacion: true })]);
  assert.deepEqual(v(out), ["2.4.5/revisar"]);
  assert.match(out[0].evid[0], /paso de un proceso/);
});

test("ninguna vía → falla 2.4.5", () => {
  assert.deepEqual(v(analyzeMultipleWays([via({}), via({})])), ["2.4.5/falla"]);
});

test("regresión: 2.4.5 no se falla desde UNA sola página", () => {
  // Es un criterio de sitio. Que en una página no haya mapa web no dice nada:
  // puede estar en el pie de otra. Fallarlo con una muestra de una página era
  // inventar una barrera de sitio a partir de una sola observación.
  const out = analyzeMultipleWays([via({})]);
  assert.deepEqual(v(out), ["2.4.5/revisar"]);
  assert.match(out[0].evid[0], /criterio de SITIO/);
  // En cambio encontrar DOS vías en una página sí demuestra que el sitio las tiene.
  assert.deepEqual(v(analyzeMultipleWays([via({ buscador: true, navegacion: true })])), ["2.4.5/cumple"]);
});

/* ── Huella sobre HTML real ── */

const PAGINA = `<html lang="es"><body>
<header><nav aria-label="Principal">
  <a href="/">Inicio</a><a href="/servicios">Servicios</a><a href="/contacto">Contacto</a>
</nav>
<form role="search"><input type="search" aria-label="Buscar"></form></header>
<nav hidden aria-label="Móvil"><a href="/contacto">Contacto</a><a href="/">Inicio</a></nav>
<main><h1>T</h1><a href="#main">ancla</a><a href="/ayuda">Ayuda</a></main>
<footer><a href="/mapa-web">Mapa web</a><a href="tel:+34900111222">900 111 222</a></footer>
</body></html>`;

test("la huella recoge navegación, ayuda y vías", () => {
  const h = huella(PAGINA, "https://ejemplo.es/");
  assert.equal(h.navs.length, 1, "el nav con hidden no debe contarse");
  assert.deepEqual(h.navs[0].items.map((i) => i.href), ["ejemplo.es/", "ejemplo.es/servicios", "ejemplo.es/contacto"]);
  assert.equal(h.vias.buscador, true);
  assert.equal(h.vias.mapaWeb, true);
  assert.equal(h.vias.navegacion, true);
  assert.deepEqual(h.ayuda.map((a) => a.tipo), ["contacto", "ayuda", "teléfono"]);
  /* «Contacto» vive en un <nav> DENTRO del <header>, y la región que cuenta es la
   * más externa: la cabecera. Antes se devolvía la primera que se encontraba
   * subiendo —«navegación»—, y eso hacía que 3.2.6 emitiera un `falla` diciendo que
   * el mecanismo «cambia de sitio entre páginas» cuando la única diferencia era que
   * una página envolvía esos enlaces en un <nav> y la otra no. La ubicación
   * relativa, que es de lo que habla el criterio, no cambia por el envoltorio. */
  assert.deepEqual(h.ayuda.map((a) => a.region), ["cabecera", "contenido", "pie"], "cada mecanismo sabe en qué parte de la página vive");
});

test("regresión: el ancla interna no entra en la huella", () => {
  const h = huella(PAGINA, "https://ejemplo.es/");
  assert.ok(!h.enlaces.some((e) => String(e.href).includes("#")), JSON.stringify(h.enlaces.map((e) => e.href)));
});

test("regresión: un menú duplicado oculto no duplica la secuencia de navegación", () => {
  // El nav móvil lleva los mismos destinos en orden inverso. Si se colara,
  // 3.2.3 se inventaría un cambio de orden dentro de la MISMA página.
  const h = huella(PAGINA, "https://ejemplo.es/");
  const out = analyzeNavConsistency([h, huella(PAGINA, "https://ejemplo.es/otra")]);
  assert.deepEqual(v(out), ["3.2.3/cumple"]);
});

test("analyzeCoherence cubre los cuatro criterios y los marca como ámbito de sitio", () => {
  const out = analyzeCoherence([huella(PAGINA, "https://ejemplo.es/"), huella(PAGINA, "https://ejemplo.es/dos")]);
  assert.deepEqual([...new Set(out.map((f) => f.c.n))].sort(), ["2.4.5", "3.2.3", "3.2.4", "3.2.6"]);
  assert.ok(out.every((f) => f.scope === "sitio" && f.origen === "coherencia"));
  assert.ok(out.every((f) => f.evid && f.evid.length), "todo hallazgo lleva evidencia");
});

test("sin huellas no se inventa nada", () => {
  assert.deepEqual(analyzeCoherence([]), []);
  assert.deepEqual(analyzeCoherence(null), []);
});

test("el código inyectable compila y devuelve la huella", () => {
  assert.doesNotThrow(() => new Function("url", FINGERPRINT_BODY));
  assert.ok(FINGERPRINT_BODY.includes("return fingerprintPage(document, url, window)"));
  assert.ok(!/\bexport\b/.test(FINGERPRINT_BODY), "no puede quedar un export en el código inyectado");
});

/* ── Regresiones de la revisión profunda ─────────────────────────────────── */

test("regresión: 3.2.4 no declara coherentes destinos que nunca se compararon", () => {
  // Dos páginas sin un solo destino en común. Antes se contaban TODOS los
  // destinos y se afirmaba que «los 4 destinos comunes» se identifican igual:
  // no había ninguno común, y el criterio salía conforme sin comparar nada.
  const out = analyzeIdConsistency([
    huella('<html><body><a href="/a1">Uno</a><a href="/a2">Dos</a></body></html>', "http://s/a"),
    huella('<html><body><a href="/b1">Tres</a><a href="/b2">Cuatro</a></body></html>', "http://s/b")
  ]);
  assert.deepEqual(v(out), ["3.2.4/revisar"]);
  assert.match(out[0].evid[0], /NO se ha comprobado/);
});

test("regresión: dos anclas de la misma página no son el mismo destino con dos nombres", () => {
  // `/faq#envios` y `/faq#pagos` colapsaban en «/faq» al normalizar el href, y
  // como «Envíos» y «Pagos» no se parecen, salía una falla de 3.2.4 — con UNA
  // sola página, siendo 3.2.4 un criterio de conjunto de páginas.
  const out = analyzeIdConsistency([
    huella('<html><body><a href="/faq#envios">Envíos</a><a href="/faq#pagos">Pagos</a></body></html>', "http://s/")
  ]);
  assert.deepEqual(v(out), ["3.2.4/revisar"], JSON.stringify(out.map((o) => o.evid)));
});

test("3.2.4 sigue detectando la incoherencia de verdad", () => {
  const out = analyzeIdConsistency([
    huella('<html><body><a href="/contacto">Contacto</a></body></html>', "http://s/1"),
    huella('<html><body><a href="/contacto">Escríbenos</a></body></html>', "http://s/2")
  ]);
  assert.deepEqual(v(out), ["3.2.4/falla"]);
});

test("regresión: un buscador oculto no cuenta como vía de localización", () => {
  const h = huella('<html><body><div style="display:none"><input type="search"></div>' +
    '<nav><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></nav></body></html>', "http://s/");
  assert.equal(h.vias.buscador, false, "el buscador está en un contenedor display:none");
  assert.equal(h.vias.navegacion, true);
});

test("ocultoEl de coherence respeta `inert`, igual que el de page-audit", () => {
  assert.equal(huella('<html><body><div inert><input type="search"></div></body></html>', "http://s/").vias.buscador, false);
});

/* ── Regresión: cuatro fallos de los criterios de sitio ─────────────────────
 *
 * Los cuatro salieron de la segunda ronda de revisión del motor, y los cuatro se
 * reprodujeron ejecutando código antes de tocar nada. Dos absolvían y dos
 * inventaban barreras; las dos cosas hacen daño, y la segunda además delante de un
 * cliente.
 */

test("regresión: 3.2.3 compara TODOS los pares, no cada página contra la primera", () => {
  // «Blog» va antes de «Servicios» en una página y después en otra, y ninguna de
  // las dos cosas se ve desde la primera, que no tiene Blog. Comparando solo contra
  // `conNav[0]`, la inversión pasaba desapercibida y el criterio salía `cumple`
  // afirmando «mantiene el mismo orden relativo en las 3 páginas».
  const nav = (items) => "<header><nav>" +
    items.map(([t, h]) => '<a href="' + h + '">' + t + "</a>").join("") + "</nav></header><main><h1>H</h1></main>";
  const out = analyzeNavConsistency([
    huella(nav([["Inicio", "/"], ["Servicios", "/servicios"]]), "http://s/"),
    huella(nav([["Inicio", "/"], ["Servicios", "/servicios"], ["Blog", "/blog"]]), "http://s/servicios"),
    huella(nav([["Inicio", "/"], ["Blog", "/blog"], ["Servicios", "/servicios"]]), "http://s/blog")
  ]);
  assert.deepEqual(v(out), ["3.2.3/falla"]);
  const e = out[0].evid.join(" ");
  assert.match(e, /«Blog» aparece antes que «Servicios»/);
  assert.match(e, /http:\/\/s\/servicios/, "y dice contra qué página se compara, que no es la primera");
});

test("regresión: un <nav> dentro del pie sigue siendo el pie (3.2.6)", () => {
  // La misma ubicación visual con y sin envoltorio. `regionDe` devolvía la primera
  // región que encontraba subiendo, así que una daba «pie» y la otra «navegación», y
  // 3.2.6 emitía un `falla` diciendo que el mecanismo «cambia de sitio».
  const out = analyzeHelpConsistency([
    huella('<main><h1>H</h1></main><footer><a href="/contacto">Contacto</a></footer>', "http://s/a"),
    huella('<main><h1>H</h1></main><footer><nav><a href="/contacto">Contacto</a></nav></footer>', "http://s/b")
  ]);
  assert.ok(!out.some((f) => f.verdict === "falla"), JSON.stringify(v(out)));
  // Y un cambio de verdad —del pie a la cabecera— sí falla.
  const deVerdad = analyzeHelpConsistency([
    huella('<main><h1>H</h1></main><footer><a href="/contacto">Contacto</a></footer>', "http://s/a"),
    huella('<header><a href="/contacto">Contacto</a></header><main><h1>H</h1></main>', "http://s/b")
  ]);
  assert.ok(deVerdad.some((f) => f.c.n === "3.2.6" && f.verdict === "falla"), JSON.stringify(v(deVerdad)));
});

test("regresión: «Compartir por correo» no es un mecanismo de ayuda", () => {
  // `tipoAyuda` probaba el esquema contra el href crudo, así que un enlace de
  // compartir dentro de un artículo se registraba como ayuda «correo»; y como solo
  // se guardaba la primera aparición de cada tipo, en la ficha ganaba la del
  // contenido y en la portada la del pie → «cambia de sitio», con las dos páginas
  // teniendo la misma dirección de contacto en el mismo pie.
  const pie = '<footer><a href="mailto:info@s.es">Escríbenos</a></footer>';
  const out = analyzeHelpConsistency([
    huella("<main><h1>H</h1></main>" + pie, "http://s/"),
    huella('<main><h1>H</h1><a href="mailto:?subject=mira%20esto">Compartir por correo</a></main>' + pie, "http://s/blog/uno")
  ]);
  assert.ok(!out.some((f) => f.verdict === "falla"), JSON.stringify(v(out)));
  // El correo de contacto del pie sí cuenta: el arreglo no ciega el criterio.
  const h = huella("<main><h1>H</h1></main>" + pie, "http://s/");
  assert.deepEqual(h.ayuda.map((a) => a.tipo), ["correo"]);
  assert.equal(h.ayuda[0].region, "pie");
  // Y un mailto: en medio del contenido, sin nada que diga que es ayuda, no cuenta.
  const suelto = huella('<main><h1>H</h1><a href="mailto:autor@s.es">autor@s.es</a></main>', "http://s/x");
  assert.deepEqual(suelto.ayuda.map((a) => a.tipo), []);
});

test("regresión: la ruta distingue mayúsculas; el host, no (3.2.4)", () => {
  // En HTTP `/Servicios` y `/servicios` son dos páginas, y cada una puede llamarse
  // como quiera. Minusculizándolo todo se fundían en un destino con dos nombres y
  // 3.2.4 emitía un `falla`.
  assert.equal(normalizarHref("/Servicios", "http://S.ES/"), "s.es/Servicios");
  assert.equal(normalizarHref("/servicios", "http://s.es/"), "s.es/servicios");
  const nav = (t, h) => '<header><nav><a href="' + h + '">' + t + '</a><a href="/">Inicio</a></nav></header><main><h1>H</h1></main>';
  const out = analyzeIdConsistency([
    huella(nav("Servicios", "/Servicios"), "http://s/a"),
    huella(nav("Área privada", "/servicios"), "http://s/b")
  ]);
  assert.ok(!out.some((f) => f.verdict === "falla"), JSON.stringify(v(out)));
  // El mismo destino con dos nombres distintos sigue siendo falla.
  const mismo = analyzeIdConsistency([
    huella(nav("Servicios", "/servicios"), "http://s/a"),
    huella(nav("Área privada", "/servicios"), "http://s/b")
  ]);
  assert.ok(mismo.some((f) => f.c.n === "3.2.4" && f.verdict === "falla"), JSON.stringify(v(mismo)));
});
