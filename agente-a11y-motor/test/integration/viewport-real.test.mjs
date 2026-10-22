/**
 * Adaptación del contenido contra un Chromium real.
 *
 * Cada caso es una página servida por HTTP con UN defecto conocido (o sin él), y
 * se comprueba que el agente lo encuentra sin inventarse los demás. Es la prueba
 * de que 1.4.4 / 1.4.10 / 1.4.12 / 1.3.4 / 1.4.13 han dejado de ser un «revisar»
 * a ciegas y son una medición.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { viewportAnalyze } from "../../src/viewport-analyze.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const BASE = (cuerpo, estilo) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Caso</title>
<style>body{margin:0;font:16px/1.4 system-ui}${estilo || ""}</style></head><body>${cuerpo}</body></html>`;

const TEXTO = "Los criterios de conformidad de las Pautas de Accesibilidad para el Contenido Web exigen que el contenido siga disponible cuando la persona usuaria cambia el espaciado del texto o amplía la página.";

const CASOS = {
  // Página sana: se adapta, no recorta y no usa title como tooltip.
  "/sano": BASE(`<main><h1>Título</h1><p>${TEXTO}</p><p>${TEXTO}</p></main>`,
    "main{max-width:60em;padding:1em}"),
  // Ancho fijo en píxeles: obliga a desplazarse en horizontal a 320 px.
  "/reflujo": BASE(`<main><h1>Título</h1><p>${TEXTO}</p></main>`,
    "main{width:980px;padding:1em}"),
  // Caja de alto fijo con overflow:hidden dimensionada para que el texto QUEPA
  // con el espaciado de serie y se salga al aplicar el de 1.4.12. Es la transición
  // lo que se mide, no el estado final.
  "/espaciado": BASE(`<main><div class="card"><p>Texto que cabe justo en dos líneas con el interlineado de serie.</p></div></main>`,
    "main{padding:1em}.card{height:48px;overflow:hidden;width:420px}.card p{margin:0;line-height:1.2}"),
  // Caja que YA viene recortada antes de tocar nada.
  "/recorte-previo": BASE(`<main><div class="card"><p>${TEXTO}</p></div></main>`,
    "main{padding:1em}.card{height:32px;overflow:hidden;width:300px}"),
  /* DOS tarjetas IDÉNTICAS. El `locator` de las dos es `div.card`, así que sin un
     selector canónico las dos filas del informe son indistinguibles — y eso es
     justo lo que pasaba: el 12 % de las barreras de una auditoría real salía con
     la columna «Selector» vacía, toda de esta capa. */
  "/dos-tarjetas": BASE(`<main><div class="card"><p>Texto que cabe justo en dos líneas con el interlineado de serie.</p></div><div class="card"><p>Texto que cabe justo en dos líneas con el interlineado de serie.</p></div></main>`,
    "main{padding:1em}.card{height:48px;overflow:hidden;width:420px}.card p{margin:0;line-height:1.2}"),
  // Solo tabla ancha: candidata a la excepción de uso esencial.
  "/tabla": BASE(`<main><table><tr>${"<td>columna larga de datos</td>".repeat(8)}</tr></table></main>`,
    "main{padding:1em}table{border-collapse:collapse}td{white-space:nowrap;padding:4px}"),
  /* EL IDIOMA DE OCULTACIÓN VISUAL, con un recorte de verdad al lado.
     Salió del primer banco contra un sitio del que se esperaba conformidad: de las
     46 acusaciones, ONCE eran de 1.4.10 contra `span.sr-only`, `caption.sr-only` y
     `a.skip-link` — el agente denunciaba los propios recursos de accesibilidad del
     sitio por «recortar 179 px con overflow:hidden», que es literalmente lo que
     hace el idioma. La cuarta parte del informe.
     La tarjeta de abajo recorta texto VISIBLE y tiene que seguir saliendo: el
     descuento no puede valer para tapar una pérdida real. */
  "/sr-only": BASE(
    `<a class="skip-link" href="#main">Saltar al contenido principal</a>
     <main id="main"><h1>Página</h1><p>Texto que cabe de sobra.</p>
     <a href="#" aria-label="LinkedIn">LinkedIn<span class="sr-only">(se abre en nueva pestaña)</span></a>
     <table><caption class="sr-only">Inventario de cookies utilizadas en este sitio web</caption><tbody><tr><td>a</td></tr></tbody></table>
     <div class="tarjeta"><p>${TEXTO}</p></div></main>`,
    ".sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0}" +
    ".skip-link{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}" +
    ".skip-link:focus{left:0;top:0;width:auto;height:auto}" +
    ".tarjeta{height:40px;overflow:hidden;width:260px}"),
  // El mismo idioma escrito con clip-path, que es la forma moderna.
  "/sr-only-clippath": BASE(
    `<main><h1>P</h1><p>Texto normal.</p><span class="vh">${TEXTO}</span></main>`,
    ".vh{position:absolute;clip-path:inset(50%);height:1px;width:1px;overflow:hidden;white-space:nowrap}"),
  // title usado como tooltip.
  "/title": BASE(`<main><h1>T</h1><p><a href="#x" title="Información adicional que solo se ve al pasar el ratón">Enlace</a></p></main>`),
  /* Desbordamiento ESCONDIDO: no hay barra, `scrollWidth` del documento no crece,
     y sin embargo hay texto que no se puede leer de ninguna manera a 320 px. */
  "/recorte-oculto": BASE(`<main><h1>R</h1><div class="caja"><div class="linea">Importe total de la operación: 1.234,56 EUR antes de impuestos</div></div></main>`,
    ".caja{overflow:hidden;max-width:100%}.caja .linea{width:900px;white-space:nowrap}"),
  /* Tamaños en px y alto fijo: `html{font-size:200%}` no toca nada, pero con el
     texto duplicado de verdad la tarjeta esconde más de cien píxeles. */
  "/zoom-px": BASE(`<main><h1>Z</h1><div class="tarjeta"><p>Primera línea de la tarjeta</p><p>Segunda línea de la tarjeta</p></div></main>`,
    ".tarjeta{height:44px;overflow:hidden}.tarjeta p{font-size:14px;line-height:20px;margin:0}"),
  // La misma tarjeta sin alto fijo: aguanta el 200 % y no puede salir en rojo.
  "/zoom-flexible": BASE(`<main><h1>Z</h1><div class="tarjeta"><p>Primera línea</p><p>Segunda línea</p></div></main>`,
    ".tarjeta p{font-size:14px;line-height:1.5;margin:0}"),
  /* Bloqueo de orientación desde un script EXTERNO y por referencia indirecta: las
     dos formas que la búsqueda en el texto de los scripts en línea no veía. */
  "/orientacion-externa": BASE(`<main><h1>T</h1><p>${TEXTO}</p></main>`).replace("</body>",
    '<script src="/orientacion.js"></script></body>'),
  "/orientacion-indirecta": BASE(`<main><h1>T</h1><p>${TEXTO}</p></main>`).replace("</body>",
    "<script>var o = screen.orientation; try{ o.lock('portrait'); }catch(e){}</script></body>"),
  // Bloqueo de orientación por JavaScript.
  "/orientacion": BASE(`<main><h1>T</h1><p>${TEXTO}</p></main>`) .replace("</body>",
    "<script>try{screen.orientation.lock('portrait')}catch(e){}</script></body>"),
  // 2.2.1: un cierre de sesión a los 15 minutos, que es como se pone un límite de
  // tiempo de verdad — no con <meta http-equiv="refresh">.
  "/temporizador": BASE(`<main><h1>Área privada</h1><p>${TEXTO}</p></main>`) .replace("</body>",
    "<script>function cerrarSesion(){ location.href='/salir'; } setTimeout(cerrarSesion, 900000); setTimeout(function(){}, 400);</script></body>"),
  "/sin-temporizador": BASE(`<main><h1>T</h1><p>${TEXTO}</p></main>`) .replace("</body>",
    "<script>setTimeout(function(){}, 300);</script></body>")
};

let server, base;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, res) => {
    const ruta = req.url.replace(/\?.*$/, "");
    if (ruta === "/orientacion.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end("try{ screen.orientation.lock('portrait'); }catch(e){}");
    }
    const c = CASOS[ruta];
    res.writeHead(c ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(c || "no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

const ver = async (ruta) => {
  const r = await viewportAnalyze({ url: base + ruta }, { waitMs: 150 });
  assert.deepEqual(r.errores, [], "errores en " + ruta + ": " + JSON.stringify(r.errores));
  const m = {};
  r.findings.forEach((f) => { m[f.c.n] = f; });
  return m;
};

test("página que se adapta bien → cumple los cinco criterios", { skip }, async () => {
  const m = await ver("/sano");
  ["1.4.10", "1.4.4", "1.4.12", "1.3.4", "1.4.13"].forEach((n) => {
    assert.ok(m[n], "falta " + n);
    assert.equal(m[n].verdict, "cumple", n + ": " + (m[n].evid || []).join(" "));
  });
  // Y el 1.4.13 ya no es un «cumple» de fe: dice cuántos disparadores recorrió.
  assert.match(m["1.4.13"].evid[0], /disparador\(es\)/);
});

test("ancho fijo de 980 px → falla 1.4.10 con el elemento señalado", { skip }, async () => {
  const m = await ver("/reflujo");
  assert.equal(m["1.4.10"].verdict, "falla");
  assert.match(m["1.4.10"].evid[0], /desplazamiento horizontal/);
  assert.ok(m["1.4.10"].nodes.length, "debe señalar el elemento que desborda");
  assert.match(m["1.4.10"].nodes[0].locator, /main/);
});

test("caja de alto fijo con overflow:hidden → falla 1.4.12 (recorte medido)", { skip }, async () => {
  const m = await ver("/espaciado");
  assert.equal(m["1.4.12"].verdict, "falla", JSON.stringify(m["1.4.12"].evid));
  assert.match(m["1.4.12"].evid[0], /se recortan/);
  assert.match(m["1.4.12"].nodes[0].locator, /card/);
});

test("solo una tabla ancha → 1.4.10 revisar por posible uso esencial, no falla", { skip }, async () => {
  const m = await ver("/tabla");
  assert.equal(m["1.4.10"].verdict, "revisar", JSON.stringify(m["1.4.10"].evid));
  assert.match(m["1.4.10"].evid[0], /uso esencial/);
});

test("contenido ya recortado antes del cambio → revisar, y lo dice explícitamente", { skip }, async () => {
  const m = await ver("/recorte-previo");
  assert.equal(m["1.4.12"].verdict, "revisar", JSON.stringify(m["1.4.12"].evid));
  assert.match(m["1.4.12"].evid[0], /YA ven[ií]an con contenido recortado/);
  assert.match(m["1.4.12"].nodes[0].locator, /card/);
});

test("regresión: el atributo title está exento de 1.4.13 y no es una falla", { skip }, async () => {
  /* El texto normativo del criterio termina con: «Exception: The visual presentation
   * of the additional content is controlled by the user agent and is not modified by
   * the author». El tooltip nativo es exactamente eso, así que emitir `falla` por un
   * `title` es acusar de algo que la propia excepción excluye — y se emitía en
   * cualquier página con un `<abbr title>`. La información no se pierde: se dice que
   * hay que comprobar si esa información está SOLO ahí, y a qué criterio pertenece
   * entonces el problema. */
  const m = await ver("/title");
  assert.equal(m["1.4.13"].verdict, "revisar");
  assert.match(m["1.4.13"].evid[0], /title/);
  assert.match(m["1.4.13"].evid[0], /EXCEPCIÓN de 1\.4\.13 lo excluye/);
  assert.match(m["1.4.13"].evid.join(" "), /1\.1\.1, 2\.5\.3 o 4\.1\.2/);
});

test("screen.orientation.lock() → falla 1.3.4", { skip }, async () => {
  const m = await ver("/orientacion");
  assert.equal(m["1.3.4"].verdict, "falla");
});

/* ── La sonda de puntero de 1.4.13, en un navegador de verdad ────────────── */

/* Emergente que TAPA lo que hay debajo y no responde a Esc: la falla completa.
 *
 * El globo pega con el disparador (`top:100%`), así que el puntero llega hasta él —la
 * condición de «señalable» se cumple— y hay un párrafo justo debajo al que tapa, así
 * que la condición de «descartable» SÍ se exige. Antes este montaje tenía el globo a
 * `top:2.5em` con un hueco de 18 px por medio, y con el viaje del puntero de verdad
 * resultó que lo que incumplía era otra cosa: el puntero no llegaba. */
const TOOLTIP_MALO = `<style>.tip{position:relative}.tip .b{display:none;position:absolute;top:100%;left:0;
  background:#000;color:#fff;padding:8px;width:220px}.tip:hover .b{display:block}</style>
<p>Precio: <span class="tip">1.200 €<span class="b">IVA no incluido. No se cierra con Esc.</span></span></p>
<p id="tapado">Condiciones de envío y plazos de entrega, que es lo que el globo tapa al desplegarse.</p>`;

/* El mismo globo, pero con un HUECO entre el disparador y él: al cruzarlo el puntero
 * no está sobre ninguno de los dos, el `:hover` se cae y el globo desaparece antes de
 * que la mano llegue. Es el fallo clásico de «hoverable», y la aritmética de
 * rectángulos lo absolvía porque el globo es descendiente del disparador. */
const TOOLTIP_HUECO = `<style>.tip{position:relative}.tip .b{display:none;position:absolute;top:2.5em;left:0;
  background:#000;color:#fff;padding:8px;width:220px}.tip:hover .b{display:block}</style>
<p>Precio: <span class="tip">1.200 €<span class="b">IVA no incluido.</span></span></p>`;

/* Y el que la excepción del criterio exime: no responde a Esc, pero no tapa nada. */
const TOOLTIP_SIN_TAPAR = `<style>.tip{position:relative}.tip .b{display:none;position:absolute;top:100%;left:0;
  background:#eee;padding:8px;width:220px}.tip:hover .b{display:block}</style>
<p>Precio: <span class="tip">1.200 €<span class="b">IVA no incluido.</span></span></p>`;

const TOOLTIP_BUENO = `<style>.tip2{position:relative}.tip2 .b{display:none;position:absolute;top:100%;left:0;
  background:#222;color:#fff;padding:8px;width:220px}.tip2:hover .b{display:block}
  .tip2.cerrado .b{display:none !important}</style>
<p>Envío: <span class="tip2" id="t2">gratis<span class="b">A partir de 50 €.</span></span></p>
<script>document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('t2').classList.add('cerrado')})</script>`;

const unoCatorceTrece = async (html) => {
  const r = await viewportAnalyze({ html }, {});
  return { f: r.findings.find((x) => x.c.n === "1.4.13"), t: r.trazas.hover };
};

test("1.4.13 real: un tooltip CSS que tapa contenido y no se cierra con Esc es una falla", { skip }, async () => {
  // Este es el caso que antes salía «cumple»: sin `title` y con `hovers` fijado
  // a [], el análisis lo leía como «no hay contenido emergente».
  const { f, t } = await unoCatorceTrece(TOOLTIP_MALO);
  assert.equal(f.verdict, "falla", JSON.stringify(t));
  assert.match(f.evid[0], /no se descarta con Esc y tapa contenido/);
  assert.equal(t.disparadores, 1, "la regla `.tip:hover .b` tiene que encontrarse en el CSSOM");
  assert.equal(t.hovers[0].aparece > 0, true, "al pasar el puntero tiene que aparecer contenido");
  assert.equal(t.hovers[0].senalable, true, "pega con el disparador: el puntero llega");
  assert.equal(t.hovers[0].tapa, true, "y tapa el párrafo de debajo");
  assert.ok((f.nodes || [])[0] && f.nodes[0].path, "la barrera tiene que llevar selector: " + JSON.stringify(f.nodes));
});

test("1.4.13 real: un globo separado del disparador no se puede señalar, y eso se mide viajando", { skip }, async () => {
  /* La comprobación era aritmética de rectángulos, con un atajo que daba por
   * alcanzable todo lo que fuera descendiente del disparador. Un globo colocado 18 px
   * por debajo ES descendiente y NO es alcanzable: al cruzar el hueco el `:hover` se
   * cae. Ahora se mueve el ratón en pasos intermedios, como una mano, y se mira si al
   * llegar sigue ahí. */
  const { f, t } = await unoCatorceTrece(TOOLTIP_HUECO);
  assert.equal(t.hovers[0].senalable, false, JSON.stringify(t.hovers[0]));
  assert.equal(f.verdict, "falla");
  assert.match(f.evid[0], /desaparece al llevar el puntero encima/);
});

test("1.4.13 real: un emergente que no responde a Esc pero no tapa nada está eximido", { skip }, async () => {
  // La excepción es del propio criterio: «does not obscure or replace other content».
  const { f, t } = await unoCatorceTrece(TOOLTIP_SIN_TAPAR);
  assert.equal(t.hovers[0].tapa, false, JSON.stringify(t.hovers[0]));
  assert.equal(f.verdict, "cumple-parcial", JSON.stringify(t));
  assert.match(f.evid[0], /NO tapan ningún contenido/);
});

test("1.4.13 real: un emergente que sí se descarta con Esc cumple", { skip }, async () => {
  /* Y aquí se ve por qué el viaje del puntero va ANTES del Esc: el manejador de este
   * montaje deja el globo cerrado con una clase, así que después del Esc ya no se
   * puede reabrir. Con el orden anterior, «¿se deja señalar?» quedaba sin comprobar
   * justo en el emergente que se porta bien con el teclado. */
  const { f, t } = await unoCatorceTrece(TOOLTIP_BUENO);
  assert.equal(t.hovers[0].senalable, true, JSON.stringify(t.hovers[0]));
  assert.equal(t.hovers[0].descartableConEsc, true, JSON.stringify(t.hovers[0]));
  assert.equal(f.verdict, "cumple", JSON.stringify(t));
});

test("1.4.13 real: sin emergentes, el cumple dice cuántos disparadores se recorrieron", { skip }, async () => {
  const { f, t } = await unoCatorceTrece("<p>Solo texto, sin nada emergente.</p>");
  assert.equal(f.verdict, "cumple");
  assert.equal(t.disparadores, 0);
  assert.match(f.evid[0], /0 disparador/);
});


/* ── Regresión: dos «cumple» sobre mediciones que no medían nada ─────────────
 *
 * Los dos se reprodujeron contra Chromium antes de tocar nada, y son de la misma
 * familia: el criterio se dictaminaba por una señal que no es la que el criterio
 * pide.
 */

test("regresión: 1.4.10 no pasa con contenido RECORTADO e inalcanzable a 320 px", { skip }, async () => {
  /* Se dictaminaba solo por `scrollWidth > clientWidth`. Con el desbordamiento
   * escondido en `overflow:hidden` no hay barra, `scrollWidth` no crece, y salía
   * «cumple» con 580 px de texto ocultos y sin forma de llegar a ellos. El criterio
   * no habla de barras: exige que no haya pérdida de información. */
  const out = await viewportAnalyze({ url: base + "/recorte-oculto" }, {});
  const f = out.findings.find((x) => x.c.n === "1.4.10");
  assert.equal(f.verdict, "falla", "texto inalcanzable y salió «" + f.verdict + "»: " + f.evid[0]);
  assert.equal(f.sev, "grave");
  assert.match(f.evid[0], /se RECORTAN/);
  assert.match(f.evid[0], /div\.caja/, "y se dice qué contenedor lo esconde");
  assert.match(f.evid[0], /px ocultos/);
  // La página sana no puede contagiarse del arreglo.
  const sano = await viewportAnalyze({ url: base + "/sano" }, {});
  assert.equal(sano.findings.find((x) => x.c.n === "1.4.10").verdict, "cumple");
});

test("regresión: 1.4.4 no pasa cuando el 200 % no llegó a aplicarse", { skip }, async () => {
  /* `html{font-size:200%}` no toca nada cuando los tamaños están en `px`, que es lo
   * normal, y no se comprobaba: el criterio salía «cumple · con el texto al 200 % no
   * se recorta ni se solapa ningún bloque» sobre un efecto nulo. */
  const out = await viewportAnalyze({ url: base + "/zoom-px" }, {});
  const f = out.findings.find((x) => x.c.n === "1.4.4");
  assert.equal(f.verdict, "falla", "con el texto al doble se recorta y salió «" + f.verdict + "»: " + f.evid[0]);
  const ef = out.trazas.resize.efecto;
  assert.ok(ef, "la fase tiene que informar del efecto real del 200 %");
  assert.equal(ef.crecioConLaRaiz, 0, "los tamaños en px no responden al font-size de la raíz");
  assert.ok(ef.escalados > 0, "así que se escala el tamaño computado elemento a elemento");
});

test("regresión: una página que aguanta el 200 % de verdad sigue cumpliendo", { skip }, async () => {
  // Control: el arreglo no puede convertir en falla cualquier página.
  const out = await viewportAnalyze({ url: base + "/zoom-flexible" }, {});
  const f = out.findings.find((x) => x.c.n === "1.4.4");
  assert.ok(f.verdict === "cumple" || f.verdict === "revisar",
    "sin alto fijo no hay recorte, así que no puede salir falla: " + f.verdict + " · " + f.evid[0]);
});

test("regresión: el bloqueo de orientación se OBSERVA, no se busca en el texto", { skip }, async () => {
  /* La detección leía solo `script:not([src])` con una expresión literal, así que no
   * veía nada de lo habitual: la llamada en un bundle externo, una referencia
   * intermedia (`var o = screen.orientation; o.lock(…)`), un módulo, un minificador
   * que renombre. Y con eso se emitía `cumple` afirmando «y no hay bloqueo de
   * orientación»: una afirmación sobre un JavaScript que nadie había leído.
   *
   * Envolviendo la API antes de que cargue la página, da igual dónde esté escrita la
   * llamada ni cómo. Los tres casos tienen que fallar, y la página limpia no. */
  for (const ruta of ["/orientacion", "/orientacion-externa", "/orientacion-indirecta"]) {
    const out = await viewportAnalyze({ url: base + ruta }, {});
    const f = out.findings.find((x) => x.c.n === "1.3.4");
    assert.equal(f.verdict, "falla", ruta + " → " + f.verdict + ": " + f.evid[0]);
    assert.ok(out.trazas.orientation.bloqueoJS, ruta + ": la llamada tiene que quedar observada");
    assert.ok((out.trazas.orientation.llamadas || []).length, ruta + ": y anotada, para poder citarla");
  }
  const limpio = await viewportAnalyze({ url: base + "/sano" }, {});
  const l = limpio.findings.find((x) => x.c.n === "1.3.4");
  assert.notEqual(l.verdict, "falla", "una página sin bloqueo no puede salir señalada: " + l.evid[0]);
  assert.equal(limpio.trazas.orientation.bloqueoJS, false);
});


/* ── 2.2.1: el temporizador que sí se usa en la vida real ────────────────── */

test("2.2.1 real: un setTimeout de 15 min se anota al programarse, con su origen", { skip }, async () => {
  /* El único caso que se miraba era `<meta http-equiv="refresh">`, y en un sitio real
   * eso no aparece: 2.2.1 no emitía nada. Envolviendo `setTimeout` antes de que la
   * página cargue, da igual que la llamada esté en un bundle o minificada. */
  const m = await ver("/temporizador");
  const f = m["2.2.1"];
  assert.ok(f, "2.2.1 tiene que dictaminarse: " + Object.keys(m).join(", "));
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /setTimeout de 15 min/);
  // Y el origen tiene que apuntar a la PÁGINA, no a la propia envoltura: la primera
  // versión devolvía su propio marco («at deDonde (<anonymous>:40:29)») siempre.
  assert.match(f.evid[0], /desde at http:\/\//, f.evid[0]);
});

test("2.2.1 real: con solo temporizadores cortos no se acusa, pero se dice qué queda fuera", { skip }, async () => {
  const m = await ver("/sin-temporizador");
  const f = m["2.2.1"];
  assert.equal(f.verdict, "cumple-parcial");
  assert.match(f.evid[1], /DESPUÉS del momento de mirar/);
});

/**
 * EL SELECTOR, Y LA EVIDENCIA DE CADA FILA.
 *
 * Dos cosas que se vieron midiendo una auditoría real de diez páginas, y que no
 * eran del criterio sino del informe:
 *
 * 1. De 522 filas, 62 —el 12 %— salían con la columna «Selector» VACÍA, todas de
 *    esta capa (1.4.4, 1.4.10, 1.4.12). La ruta canónica estaba calculada
 *    (`__caja` guarda `uid:__uid(el)`) y se usaba solo para emparejar el antes
 *    con el después: no salía del fichero. Sin selector no hay captura —la guía
 *    resalta el elemento por selector— ni cotejo entre pasadas.
 *
 * 2. Las N filas de un hallazgo llevaban todas el MISMO párrafo: la lista
 *    completa de los bloques afectados, repetida fila a fila. Quien lee una fila
 *    no sabe cuál de los quince es el suyo.
 */
test("adaptación: dos tarjetas iguales salen con selectores DISTINTOS", { skip }, async () => {
  const m = await ver("/dos-tarjetas");
  const f = m["1.4.12"];
  assert.equal(f.verdict, "falla", JSON.stringify(f.evid));
  const rutas = (f.nodes || []).map((n) => n.path).filter(Boolean);
  assert.ok(rutas.length >= 2, "las dos tarjetas tienen que traer ruta: " + JSON.stringify(f.nodes));
  assert.equal(new Set(rutas).size, rutas.length, "y rutas distintas, no la misma dos veces: " + JSON.stringify(rutas));
  rutas.forEach((r) => assert.match(r, /^html > body >/, "la ruta es canónica, no un locator: " + r));
  /* Y resuelven: cada una selecciona UN elemento y el que le toca. */
  assert.match(rutas[0], /div:nth-of-type\(1\)/);
  assert.match(rutas[1], /div:nth-of-type\(2\)/);
});

test("adaptación: cada fila trae la evidencia de SU elemento, no la lista entera", { skip }, async () => {
  const m = await ver("/dos-tarjetas");
  const nodes = m["1.4.12"].nodes || [];
  assert.ok(nodes.length >= 2);
  nodes.forEach((n) => {
    assert.ok(n.evid && n.evid.length, "cada nodo con su evidencia: " + JSON.stringify(n));
    const t = n.evid.join(" ");
    assert.match(t, /recorta contenido al aplicar|se solapa|ya venía/);
    assert.doesNotMatch(t, /bloque\(s\) de texto se recortan/, "el recuento es del hallazgo, no de la fila");
  });
});

test("adaptación: 1.4.10 también trae ruta en lo que recorta", { skip }, async () => {
  const m = await ver("/recorte-oculto");
  const f = m["1.4.10"];
  assert.equal(f.verdict, "falla", JSON.stringify(f.evid));
  assert.ok((f.nodes || []).length, "tiene que señalar el contenedor");
  f.nodes.forEach((n) => {
    assert.match(String(n.path || ""), /^html > body >/, "con su ruta: " + JSON.stringify(n));
    assert.ok(n.evid && n.evid.length && /px/.test(n.evid[0]), "y con su propia frase: " + JSON.stringify(n.evid));
  });
});

/* ── El idioma de ocultación visual no es contenido recortado (v0.63.0) ──── */

test("1.4.10 real: .sr-only y el enlace de salto NO son contenido recortado", { skip }, async () => {
  /* Las once falsas acusaciones del primer banco contra un sitio conforme. El
   * idioma —caja de 1×1 con overflow:hidden, clip a cero, fuera de pantalla—
   * existe para que lo lean los lectores y no se vea: no hay información visible
   * que pueda perderse al reflujo. */
  const out = await viewportAnalyze({ url: base + "/sr-only" }, {});
  const f = (out.findings || []).filter((x) => x.c.n === "1.4.10");
  const nombrados = f.flatMap((x) => (x.nodes || []).map((n) => n.locator || "")).join(" ");
  assert.doesNotMatch(nombrados, /sr-only|skip-link/, JSON.stringify(f.map((x) => [x.verdict, (x.evid || [])[0]])));
  // Y tampoco en 1.4.4 / 1.4.12, donde salían como «ya venían recortados».
  const otros = (out.findings || []).filter((x) => ["1.4.4", "1.4.12"].indexOf(x.c.n) !== -1);
  const nombrados2 = otros.flatMap((x) => (x.nodes || []).map((n) => n.locator || "")).join(" ");
  assert.doesNotMatch(nombrados2, /sr-only|skip-link/, nombrados2);
  // LO QUE NO PASA: la tarjeta que recorta texto VISIBLE sigue saliendo.
  assert.match(nombrados2, /tarjeta/, "el descuento no puede tapar una pérdida real: " + nombrados2);
});

test("1.4.10 real: el mismo idioma con clip-path tampoco se acusa", { skip }, async () => {
  const out = await viewportAnalyze({ url: base + "/sr-only-clippath" }, {});
  const todos = (out.findings || [])
    .filter((x) => ["1.4.10", "1.4.4", "1.4.12"].indexOf(x.c.n) !== -1)
    .flatMap((x) => (x.nodes || []).map((n) => n.locator || "")).join(" ");
  assert.doesNotMatch(todos, /\.vh/, todos);
});

/* ── 1.4.10: el texto que no cabe y no tiene dónde cortar (v0.79.0) ─────── */

/**
 * UNA BARRERA GRAVE SIN ELEMENTO AL QUE IR.
 *
 * La detección del culpable exigía que el RECTÁNGULO del elemento sobresaliera
 * de la ventana, y la causa más común de 1.4.10 en sitios reales no lo hace: un
 * correo, una URL o una línea de código sin puntos de corte dentro de un `<p>`.
 * El `<p>` mide lo que su contenedor —su rect no sobresale— y el texto se sale
 * igual, arrastrando el documento.
 *
 * Medido antes del arreglo, y determinista: una URL de 70 caracteres en un `<p>`
 * a 320 px da «1.4.10 falla, 279 px de exceso» con la lista de culpables VACÍA,
 * así que el informe decía «No se ha podido señalar el elemento concreto». En una
 * auditoría real de 12 páginas era una de las 6 filas sin selector, Grave y en la
 * adaptación: una fila que nadie puede arreglar.
 *
 * El texto se mide con `Range` sobre los nodos de texto propios, que da el borde
 * real: 599 px con la ventana en 320, o sea los mismos 279 px del exceso.
 */
const CON_TEXTO = (cuerpo, estilo) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Texto</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px system-ui}main{padding:0 16px}${estilo || ""}</style>
</head><body><main>${cuerpo}</main></body></html>`;
const URL_LARGA = "https://ejemplo.com/una/ruta/absurdamente/larga/que/no/cabe/nunca/jamas";

const una1410 = async (html) => {
  const out = await viewportAnalyze({ html }, { launchOptions: sonda.launchOptions || {} });
  return (out.findings || []).filter((f) => f.c.n === "1.4.10")[0];
};

test("1.4.10 real: una URL sin cortes señala el elemento que la contiene", { skip }, async () => {
  const f = await una1410(CON_TEXTO('<p id="u">' + URL_LARGA + "</p>"));
  assert.equal(f.verdict, "falla");
  assert.ok(f.nodes && f.nodes.length, "una barrera Grave sin elemento no es reportable");
  assert.equal(f.nodes[0].locator, "p#u");
  const ev = f.evid.join(" ");
  assert.doesNotMatch(ev, /No se ha podido señalar el elemento concreto/);
  assert.match(ev, /su texto no cabe y no tiene dónde cortar/);
  assert.match(ev, /overflow-wrap/, "y dice cómo se arregla");
});

test("1.4.10 real: con overflow-wrap puesto, la misma URL ya no desborda", { skip }, async () => {
  // El consejo que da el agente tiene que ser el que arregla. Si esto sale
  // `falla`, el consejo está mal y la fila manda a quien la lea a un sitio
  // equivocado.
  const f = await una1410(CON_TEXTO('<p id="u">' + URL_LARGA + "</p>", "#u{overflow-wrap:anywhere}"));
  assert.equal(f.verdict, "cumple", JSON.stringify(f.evid));
});

test("1.4.10 real: un texto largo dentro de overflow-x:auto NO se acusa", { skip }, async () => {
  /* LA CAUTELA. Un texto que su contenedor desplaza no arrastra el documento, y
   * acusarlo sería inventar la barrera. Este error ya se cometió una vez en este
   * proyecto, con una miga de pan en `overflow-x:auto`. */
  const f = await una1410(CON_TEXTO('<div id="caja"><p id="u">' + URL_LARGA + "</p></div>", "#caja{overflow-x:auto}"));
  assert.notEqual(f.verdict, "falla", JSON.stringify(f.evid));
});

test("1.4.10 real: el texto oculto a la vista no cuenta", { skip }, async () => {
  const f = await una1410(CON_TEXTO('<p id="u" class="sr">' + URL_LARGA + '</p><p>normal</p>',
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}"));
  assert.equal(f.verdict, "cumple", JSON.stringify(f.evid));
});

test("1.4.10 real: una tabla ancha sigue siendo EXENTA, no una falla", { skip }, async () => {
  /* Esto se rompió al arreglar lo de arriba y hay que dejarlo guardado: los `td`
   * de una tabla que desborda salían acusados como «texto que no cabe» —son
   * consecuencia de que la tabla desborde— y como `td` no está en la lista de
   * exentos, una tabla que WCAG puede eximir pasaba de `revisar` a `falla`. Un
   * falso positivo introducido al arreglar un falso negativo. */
  const f = await una1410(CON_TEXTO(
    '<table id="t"><tr><td>una celda</td><td>otra celda</td><td>y otra celda mas</td><td>y una cuarta</td></tr></table>',
    "table{border-collapse:collapse}td{padding:12px;white-space:nowrap;border:1px solid #000}"));
  assert.equal(f.verdict, "revisar", JSON.stringify(f.evid));
  assert.match(f.evid.join(" "), /uso esencial/);
  assert.deepEqual((f.nodes || []).map((n) => n.locator), ["table#t"], "solo la tabla, no sus celdas");
});
