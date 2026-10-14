/**
 * 1.4.3 sobre el texto que pinta el CSS, contra un Chromium real.
 *
 * Esto NO se puede probar con un DOM simulado: el texto generado no existe en
 * el documento, lo pinta el motor de estilos, y solo él sabe qué dice
 * `content`, de qué color y de qué tamaño. Por eso el agujero duró tanto:
 * `textTargets` recoge elementos con NODOS de texto propios, y un
 * pseudoelemento no es un nodo de texto.
 *
 * Medido antes del arreglo, sobre esta misma página: 1.4.3 salía `pasa` seis
 * veces con un «(abre en ventana nueva)» a 1.04:1 —invisible— pintado con
 * `::after`. Es decir, el criterio exportable como CONFORME con un texto que no
 * se ve. Y no es un caso de laboratorio: el aviso de enlace externo, el
 * asterisco de obligatorio y las etiquetas «Nuevo» se pintan así todos los días.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { MEASURE_BODY } from "../../src/measure.browser.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

// Una imagen de 1×1 para el `content: url(...)`: lo que lleva dentro no es texto.
const PIX = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c00"/></svg>').toString("base64");

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Texto generado</title><style>
  body { margin:0; padding:24px; background:#fff; color:#111; font:16px/1.6 system-ui, sans-serif; }
  /* Texto de verdad e invisible: #fafafa sobre blanco, 1.04:1. */
  a.externo::after { content:" (abre en ventana nueva)"; color:#fafafa; font-size:14px }
  /* Texto de verdad y legible: no debe acusarse. */
  span.badge::before { content:"Nuevo "; color:#0a5c2e; font-weight:700 }
  /* En el límite: 3.95:1 en texto pequeño — ni pasa ni es invisible. */
  span.flojo::after  { content:" (beta)"; color:#808080 }
  /* Lo que NO es texto que leer: un icono de fuente y una imagen. */
  i.icono::before    { content:"\\e900"; color:#fbfbfb }
  i.imagen::before   { content:url("${PIX}") }
  /* Y un separador sin letras: tampoco. */
  li.miga + li.miga::before { content:" › "; color:#fcfcfc }
  /* Pseudoelemento con SU PROPIO fondo: la medida es contra ese fondo. */
  span.chip::before  { content:"Oferta "; color:#fff; background:#0b4c8c }
</style></head><body>
<main>
  <h1>Contraste del texto generado</h1>
  <p>Un párrafo normal, bien contrastado.</p>
  <p><a class="externo" href="https://example.org">Ir al registro</a></p>
  <p><span class="badge">curso de otoño</span></p>
  <p><span class="flojo">versión nueva</span></p>
  <p><i class="icono"></i> <i class="imagen"></i> iconos</p>
  <ul><li class="miga">Inicio</li><li class="miga">Cursos</li></ul>
  <p><span class="chip">de otoño</span></p>
</main>
</body></html>`;

let server, browser, res;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto("http://127.0.0.1:" + server.address().port + "/", { waitUntil: "load" });
  const todo = await page.evaluate(new Function("lim", MEASURE_BODY), 400);
  res = todo.filter((x) => x.crit === "1.4.3" && /::/.test(String(x.node || "")));
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const de = (sel) => res.find((r) => String(r.node || "").indexOf(sel) !== -1);

test("1.4.3 real: el «(abre en ventana nueva)» invisible es una barrera", { skip }, () => {
  const f = de("a.externo::after");
  assert.ok(f, "no se midió el texto generado: " + JSON.stringify(res.map((r) => r.node)));
  assert.equal(f.verdict, "falla", f.detail);
  assert.match(f.detail, /1\.0[0-9]:1/, "#fafafa sobre blanco son 1.04:1 — " + f.detail);
  assert.match(f.detail, /abre en ventana nueva/, "la ficha dice QUÉ texto es: " + f.detail);
  assert.ok(f.path, "y lleva ruta para poder ir a verlo");
});

test("1.4.3 real: el texto generado legible pasa, y el del límite queda a revisar", { skip }, () => {
  const bueno = de("span.badge::before");
  assert.ok(bueno, "falta el badge");
  assert.equal(bueno.verdict, "pasa", bueno.detail);
  const flojo = de("span.flojo::after");
  assert.ok(flojo, "falta el flojo");
  assert.equal(flojo.verdict, "revisar", "3.95:1 en texto pequeño no pasa, pero tampoco es invisible: " + flojo.detail);
  assert.match(flojo.detail, /3\.9[0-9]:1/, flojo.detail);
});

test("1.4.3 real: un icono de fuente, una imagen y un separador NO son texto", { skip }, () => {
  assert.equal(de("i.icono::before"), undefined, "un glifo de uso privado se ve como un dibujo");
  assert.equal(de("i.imagen::before"), undefined, "`content: url(...)` es una imagen; medir el nombre del fichero sería inventarse una barrera");
  assert.equal(de("li.miga::before"), undefined, "un separador sin letras tampoco es texto que leer");
});

test("1.4.3 real: si el pseudoelemento pinta su propio fondo, se mide contra ese", { skip }, () => {
  const f = de("span.chip::before");
  assert.ok(f, "falta el chip");
  assert.equal(f.verdict, "pasa", "blanco sobre #0b4c8c pasa de sobra: " + f.detail);
  assert.match(f.detail, /sobre rgb\(11 76 140\)/, "medido contra el fondo del propio pseudoelemento: " + f.detail);
});

/**
 * EL TOPE DE 600 ELEMENTOS, Y LA BARRERA QUE ESCONDÍA.
 *
 * En la auditoría real de un sitio, esta cuenta salía en cada pasada: «se
 * revisó el texto generado por CSS de 600 elemento(s) y quedaron 290 sin mirar
 * por el tope», y con ella 1.4.3 no se podía declarar conforme en 155
 * mediciones. El tope era una precaución sin medir.
 *
 * Medido, con dos pasadas por tamaño:
 *
 *      elementos   con tope   sin tope   hallazgos con / sin
 *            896    6–9 ms     9–11 ms        12 / 18
 *          5 006    5–6 ms    14–18 ms        12 / 30
 *         20 006   6–11 ms    15–20 ms        12 / 30
 *
 * Y el peor caso de verdad —no muchos elementos, sino muchos ACIERTOS, que es
 * donde cada uno paga el fondo y la cuenta de contraste— son 479 ms con 20 000
 * elementos y 400 hallazgos: medio segundo por página, una vez por página.
 *
 * La página de aquí es la prueba de que el tope escondía barreras: 700 bloques
 * sin nada y, DESPUÉS, un texto generado invisible. Con el tope en 600 ese
 * texto caía fuera y el criterio no lo veía.
 */
const RELLENO = (n) => Array.from({ length: n }, (_, i) => '<div class="relleno">Bloque ' + i + "</div>").join("");
const TRAS_EL_TOPE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Tras el tope</title><style>
  body { margin:0; padding:8px; background:#fff; color:#111; font:16px/1.4 system-ui, sans-serif; }
  .relleno { padding:1px; }
  /* #fafafa sobre blanco: 1.04:1, invisible. Y va al final, detrás de 700 bloques. */
  .aviso::after { content:" (abre en ventana nueva)"; color:#fafafa; }
</style></head><body>
  ${RELLENO(700)}
  <p><a class="aviso" href="https://ejemplo.test/">Memoria anual</a></p>
</body></html>`;

test("1.4.3 real: el texto generado DETRÁS del elemento 600 ya no se queda sin mirar", { skip }, async () => {
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions(sonda.launchOptions));
  try {
    const p = await b.newPage();
    await p.setContent(TRAS_EL_TOPE, { waitUntil: "load" });
    const res = await p.evaluate(new Function("lim", MEASURE_BODY), 400);

    const generados = res.filter((r) => r.crit === "1.4.3" && /texto generado/.test(r.detail || ""));
    const invisible = generados.find((r) => /abre en ventana nueva/.test(r.detail));
    assert.ok(invisible, "el texto invisible del final tiene que medirse: " +
      JSON.stringify(generados.map((g) => g.node)));
    assert.equal(invisible.verdict, "falla", invisible.detail);
    assert.match(invisible.detail, /1\.0\d:1/, "con su ratio medido: " + invisible.detail);

    /* Y la nota de cobertura ya no aparece: no queda nada sin mirar. */
    const nota = res.find((r) => r.crit === "__meta" && /texto generado/i.test(r.label || ""));
    assert.equal(nota, undefined, "no debería quedar nota de cobertura: " + (nota && nota.detail));
  } finally { await b.close(); }
});

test("1.4.3 real: si el informe llena su cupo, la nota lo dice con el número", { skip }, async () => {
  /* Con el cupo a 3 y cuatro textos generados que fallan, uno se queda fuera —y
   * eso tiene que decirse, que es la regla de oro: lo que no se ha mirado no
   * puede leerse como que está bien. */
  const cuatro = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cupo</title><style>
    body{margin:0;background:#fff;color:#111;font:16px system-ui}
    .a::after{content:" uno";color:#fafafa}
    .b::after{content:" dos";color:#fafafa}
    .c::after{content:" tres";color:#fafafa}
    .d::after{content:" cuatro";color:#fafafa}
  </style></head><body><p class="a">A</p><p class="b">B</p><p class="c">C</p><p class="d">D</p></body></html>`;
  const { chromium } = await import("playwright");
  const b = await chromium.launch(launchOptions(sonda.launchOptions));
  try {
    const p = await b.newPage();
    await p.setContent(cuatro, { waitUntil: "load" });
    const res = await p.evaluate(new Function("lim", MEASURE_BODY), 3);
    const nota = res.find((r) => r.crit === "__meta" && /texto generado/i.test(r.label || ""));
    assert.ok(nota, "con el cupo lleno tiene que haber nota");
    assert.match(nota.detail, /cupo de 3 fichas/, nota.detail);
    assert.match(nota.detail, /Sube `measureLimit`/, nota.detail);
    assert.deepEqual(nota.limita, ["1.4.3"], "y tiene que seguir limitando 1.4.3");
  } finally { await b.close(); }
});
