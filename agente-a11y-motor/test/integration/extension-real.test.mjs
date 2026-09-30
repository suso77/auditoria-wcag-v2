/**
 * La extensión, contra un Chromium real.
 *
 * Lo que hay que demostrar aquí no es que «funciona»: es que el bundle generado
 * dictamina EXACTAMENTE igual que la librería. Si divergen, la extensión se
 * convierte en una segunda implementación que hay que mantener a mano — que es
 * justo lo que el build existe para evitar.
 *
 * Por eso cada caso corre el mismo fixture por los dos caminos y compara.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { understand, analyze, setDOMParser } from "../../src/engine.js";
import { auditPageHtml } from "../../src/page-audit.js";
import { analyzeCoherence } from "../../src/coherence.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;
const { DOMParser } = await import("linkedom");
setDOMParser(DOMParser);

const MOTOR = await readFile(new URL("../../extension/motor.js", import.meta.url), "utf8");
const ANALIZAR = await readFile(new URL("../../extension/analizar.js", import.meta.url), "utf8");

const COMPONENTES = [
  '<button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/></svg></button>',
  '<div class="btn" onclick="enviar()">Enviar formulario</div>',
  '<input type="email" placeholder="Tu correo">',
  '<a href="/informe.pdf">Leer más</a>',
  '<div role="tablist" aria-label="Cuenta"><button role="tab" aria-selected="true" aria-controls="p1">Perfil</button></div>',
  '<ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul>',
  '<button type="button" aria-label="Cerrar diálogo"><svg aria-hidden="true"><path d="M6 6l12 12"/></svg></button>',
  '<img src="foto.jpg">',
  '<label for="n">Nombre</label><input id="n" aria-describedby="no-existe">'
];

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba de extensión</title>
<style>body{margin:0;font:16px/1.5 system-ui}.flojo{color:#bbb;background:#fff}
.caja{height:40px;overflow:hidden;width:380px}.caja p{margin:0;line-height:1.15}
.hero{background:linear-gradient(90deg,#000,#fff);color:#fff;padding:14px;width:380px;font:700 24px/1.3 system-ui}</style>
</head><body>
<header><nav aria-label="Principal"><a href="/">Inicio</a><a href="/servicios">Servicios</a><a href="/contacto">Contacto</a></nav>
<form role="search"><label for="q">Buscar</label><input id="q" type="search"></form></header>
<main><h1>Prueba</h1>
<p>Texto normal y legible.</p>
<p class="flojo">Texto con contraste insuficiente.</p>
<div class="caja"><p>Frase que cabe justo con el interlineado de serie.</p></div>
<div class="hero">Titular sobre degradado</div>
<button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/></svg></button>
<a href="/ayuda" title="Ayuda emergente">Ayuda</a>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
</main>
<footer><a href="/ayuda">Ayuda</a><a href="/mapa-web">Mapa web</a></footer></body></html>`;

let server, base, browser, page;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto(base, { waitUntil: "load" });
  await page.addScriptTag({ content: MOTOR });
  await page.addScriptTag({ content: ANALIZAR });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

/* ── Lo esencial: el bundle y la librería dicen lo mismo ── */

test("el bundle carga y expone el núcleo completo", { skip }, async () => {
  const r = await page.evaluate(() => ({
    n: Object.keys(window.A11Y).length,
    tipos: ["understand", "analyze", "auditPageDoc", "runChecksReal", "fingerprintPage", "analizarPixeles", "oawExport", "analyzeCoherence"]
      .map((k) => typeof window.A11Y[k]),
    agente: typeof window.__a11yAgente
  }));
  assert.ok(r.n > 80, "exportaciones: " + r.n);
  assert.deepEqual(r.tipos, new Array(8).fill("function"));
  assert.equal(r.agente, "object");
});

test("REGRESIÓN: el bundle dictamina idéntico a la librería en cada componente", { skip }, async () => {
  for (const html of COMPONENTES) {
    const enNavegador = await page.evaluate((h) => {
      const m = window.A11Y.understand(h);
      if (!m) return null;
      const a = window.A11Y.analyze(m);
      return a.findings.map((f) => f.c.n + "/" + f.verdict + "/" + (f.sev || "-"));
    }, html);
    const m = understand(html);
    const enNode = m ? analyze(m).findings.map((f) => f.c.n + "/" + f.verdict + "/" + (f.sev || "-")) : null;
    assert.deepEqual(enNavegador, enNode, "divergen en: " + html);
  }
});

test("REGRESIÓN: la auditoría de página coincide con la librería", { skip }, async () => {
  const enNavegador = await page.evaluate(() =>
    window.A11Y.auditPageDoc(document).map((f) => f.c.n + "/" + f.verdict));
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  const enNode = auditPageHtml(html, DOMParser).map((f) => f.c.n + "/" + f.verdict);
  assert.deepEqual(enNavegador, enNode);
});

test("REGRESIÓN: cada módulo conserva su ámbito (nada se pisa al aplanar)", { skip }, async () => {
  // Varios módulos definen por su cuenta F, crit, loc, IX, tagOf, ocultoEl. Si el
  // aplanado los hubiera fundido en un ámbito, los `scope` saldrían cruzados.
  const ambitos = await page.evaluate(() => {
    const pagina = window.A11Y.auditPageDoc(document).map((f) => f.scope);
    const viewport = window.A11Y.analyzeTextSpacing({ aplicado: true, revisados: 1, recortados: [], solapados: [] }).map((f) => f.scope);
    const sitio = window.A11Y.analyzeMultipleWays([{ url: "/", vias: { buscador: true, navegacion: true } }]).map((f) => f.scope);
    const dinamico = window.A11Y.analyzeTabTrace({ focusables: [{ locator: "a", uid: "1" }], reached: [{ locator: "a", uid: "1" }] }).map((f) => f.scope);
    return { pagina, viewport, sitio, dinamico };
  });
  assert.ok(ambitos.pagina.every((s) => s === "página"), JSON.stringify(ambitos.pagina));
  assert.deepEqual(ambitos.viewport, ["adaptación"]);
  assert.deepEqual(ambitos.sitio, ["sitio"]);
  assert.deepEqual(ambitos.dinamico, ["dinámico"]);
});

test("REGRESIÓN: la coherencia entre páginas coincide con la librería", { skip }, async () => {
  const huella = await page.evaluate(() => window.A11Y.fingerprintPage(document, location.href, window));
  const otra = Object.assign({}, huella, { url: huella.url + "otra" });
  const enNavegador = await page.evaluate((hs) =>
    window.A11Y.analyzeCoherence(hs).map((f) => f.c.n + "/" + f.verdict), [huella, otra]);
  const enNode = analyzeCoherence([huella, otra]).map((f) => f.c.n + "/" + f.verdict);
  assert.deepEqual(enNavegador, enNode);
});

/* ── El análisis de la extensión, de punta a punta ── */

test("el análisis completo encuentra barreras de varias capas", { skip }, async () => {
  const r = await page.evaluate(() => window.__a11yAgente.analizar({ limite: 400 }));
  assert.ok(r.findings.length > 20, "hallazgos: " + r.findings.length);
  const fallan = new Set(r.findings.filter((f) => f.verdict === "falla").map((f) => f.c.n));
  assert.ok(fallan.has("4.1.2") || fallan.has("1.1.1"), "semántica: " + [...fallan]);
  assert.ok(fallan.has("1.4.3"), "medición de contraste: " + [...fallan]);
  assert.ok(fallan.has("1.4.12"), "adaptación (espaciado): " + [...fallan]);
  /* 1.4.13 ya no es `falla` por un `title`: la excepción del criterio excluye el
   * tooltip nativo, que lo pinta el agente de usuario. Lo que se comprueba aquí es
   * que la capa de emergentes CORRIÓ y dijo algo sobre el `title` de la página, no
   * que acuse al criterio equivocado. La barrera de otra capa que prueba que el
   * análisis es completo la da 1.3.4, que sí falla en esta página. */
  /* Ojo: en la lista puede haber DOS hallazgos de 1.4.13 —el genérico del motor
   * («lo mide la capa de adaptación») y el de la capa que de verdad lo midió—, así
   * que hay que coger el segundo por su evidencia, no el primero que aparezca. */
  const hovers = r.findings.filter((f) => f.c.n === "1.4.13");
  assert.ok(hovers.length, "la capa de contenido emergente tiene que haber corrido");
  const hover = hovers.find((f) => /title/.test(f.evid.join(" ")));
  assert.ok(hover, "tiene que haber un hallazgo de 1.4.13 que hable del `title`: " +
    JSON.stringify(hovers.map((f) => f.verdict + ": " + f.evid[0].slice(0, 60))));
  assert.equal(hover.verdict, "revisar", "el `title` está exento de 1.4.13 y salió «" + hover.verdict + "»");
  assert.ok(!hovers.some((f) => f.verdict === "falla"), "y ninguno puede ser falla por el `title`");
  assert.ok(fallan.has("1.3.4"), "adaptación (orientación): " + [...fallan]);
  assert.equal(r.url, base);
  assert.ok(r.huella && r.huella.navs.length, "debe traer la huella para los criterios de sitio");
});

test("dice honradamente lo que NO puede comprobar", { skip }, async () => {
  const r = await page.evaluate(() => window.__a11yAgente.analizar({}));
  assert.ok(r.avisos.some((a) => /1\.4\.10 Reflujo no se comprueba/.test(a)), JSON.stringify(r.avisos));
  assert.ok(!r.findings.some((f) => f.c.n === "1.4.10" && f.verdict !== "humano" && f.verdict !== "revisar"),
    "no debe emitir un veredicto de reflujo que no ha medido");
  assert.match(r.procedencia.agente, /extensión/);
  assert.ok(r.procedencia.viewport.includes("×"));
});

test("las sondas de píxeles se pintan y se restauran sin dejar rastro", { skip }, async () => {
  const antes = await page.evaluate(() => getComputedStyle(document.querySelector(".hero")).color);
  const n = await page.evaluate(() => {
    window.__a11yAgente.prepararPixeles(12);
    return window.__a11yAgente.pintarSondas("rgb(255,0,255)");
  });
  assert.ok(n >= 1, "debe encontrar textos sobre degradado");
  const durante = await page.evaluate(() => getComputedStyle(document.querySelector(".hero")).color);
  assert.equal(durante, "rgb(255, 0, 255)", "la sonda debe llegar a pintar");
  await page.evaluate(() => window.__a11yAgente.restaurarSondas());
  const despues = await page.evaluate(() => ({
    color: getComputedStyle(document.querySelector(".hero")).color,
    inline: document.querySelector(".hero").getAttribute("style")
  }));
  assert.equal(despues.color, antes, "el color original debe volver");
  assert.ok(!despues.inline, "no debe quedar estilo en línea: " + despues.inline);
});

test("solo se preparan los elementos visibles, y los de fuera se cuentan", { skip }, async () => {
  const r = await page.evaluate(() => {
    window.scrollTo(0, 0);
    return window.__a11yAgente.prepararPixeles(12);
  });
  assert.ok(r.candidatos.every((c) => c.rect.w > 0 && c.rect.h > 0));
  assert.ok(Array.isArray(r.fueraDeVista));
  assert.ok(r.dpr >= 1);
});

test("inyectar dos veces no duplica el estado", { skip }, async () => {
  const v1 = await page.evaluate(() => window.__a11yAgente.version);
  await page.addScriptTag({ content: ANALIZAR });
  const v2 = await page.evaluate(() => window.__a11yAgente.version);
  assert.equal(v1, v2);
  // Y sigue funcionando tras la reinyección.
  assert.ok((await page.evaluate(() => window.__a11yAgente.analizar({}).findings.length)) > 10);
});
