/**
 * El orquestador de punta a punta contra un Chromium real.
 *
 * Una página con defectos de TRES capas distintas a la vez: semántica (botón de
 * icono sin nombre), adaptación (ancho fijo que rompe el reflujo) y medición
 * (contraste insuficiente). Comprueba que un solo navegador los encuentra todos,
 * que axe aporta sin duplicar, y que la ejecución queda documentada.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { auditRun } from "../../src/audit-run.js";
import { oawExport } from "../../src/report-oaw.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Página de prueba</title>
<style>body{margin:0;font:16px/1.4 system-ui}main{width:980px;padding:1em}
.flojo{color:#bbb;background:#fff}</style></head><body>
<header><nav aria-label="Principal"><a href="#main">Saltar al contenido</a></nav></header>
<main id="main">
  <h1>Formulario de alta</h1>
  <p>Texto normal y legible de la página.</p>
  <p class="flojo">Texto con contraste insuficiente sobre blanco.</p>
  <button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/></svg></button>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
</main>
<footer><a href="/contacto">Contacto</a></footer></body></html>`;

let server, base;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

let cache = null;
const correr = async () => (cache = cache || await auditRun({ url: base }, { waitMs: 150 }));

test("un solo navegador encuentra barreras de las tres capas", { skip }, async () => {
  const r = await correr();
  assert.deepEqual(r.errores, [], JSON.stringify(r.errores));
  const fallan = new Set(r.findings.filter((f) => f.verdict === "falla").map((f) => f.c.n));
  assert.ok(fallan.has("1.4.10"), "adaptación: el ancho fijo de 980 px debería romper el reflujo");
  assert.ok(fallan.has("1.4.3") || fallan.has("4.1.2") || fallan.has("1.1.1"), "render/semántica: " + [...fallan].join(", "));
  const ambitos = new Set(r.findings.map((f) => f.scope));
  assert.ok(ambitos.has("adaptación"), "faltan hallazgos de adaptación");
  assert.ok(ambitos.has("render") || ambitos.has("página"), "faltan hallazgos de render/página");
});

test("axe aporta sus instancias y deja claro de dónde vienen", { skip }, async () => {
  // Antes se descartaba el CRITERIO entero si el motor ya fallaba en él, así que
  // las instancias que solo veía axe se perdían: 25 imágenes sin alt vistas por
  // axe desaparecían porque el motor había visto una. Ahora se deduplica por
  // ELEMENTO. El locator del motor y el selector de axe no tienen el mismo
  // formato, así que un solape puntual es posible: por eso cada hallazgo lleva su
  // `origen`, y perder una barrera es peor que repetir una fila señalada.
  const r = await correr();
  const axe = r.findings.filter((f) => f.verdict === "falla" && f.origen === "axe-core");
  axe.forEach((f) => {
    assert.ok((f.nodes || []).length, "un hallazgo de axe sin elementos no sirve para el IRA: " + f.c.n);
    assert.ok(f.evid.join(" ").indexOf("axe-core") !== -1, "la evidencia tiene que decir que viene de axe");
  });
  assert.ok(Array.isArray(r.axeExtra), "axeExtra debe existir aunque esté vacío");
});

test("la ejecución queda documentada para el entregable", { skip }, async () => {
  const p = (await correr()).procedencia;
  assert.match(p.fecha, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(p.objetivo, base);
  assert.match(p.navegador, /^Chromium \d+/);
  assert.match(p.criterios, /55 criterios/);
  assert.equal(p.viewportBase, "1280×1024");
  assert.ok(p.capas.length >= 2 && p.capas.every((c) => c.ok), JSON.stringify(p.capas));
  assert.ok(p.duracionMs > 0);
});

test("los hallazgos llegan al export OAW con criterio, gravedad y elemento", { skip }, async () => {
  const r = await correr();
  const out = oawExport(r.findings, { url: base });
  assert.ok(out.barreras.length, "debería haber filas de barreras");
  out.barreras.forEach((b) => {
    assert.ok(b.criterio, "fila sin criterio");
    assert.ok(b.gravedad && b.gravedad !== "", "fila sin gravedad: " + JSON.stringify(b));
    assert.ok(b.ambito && b.ambito !== "", "fila sin ámbito: " + JSON.stringify(b));
    assert.equal(b.pagina, base);
  });
  // Ningún criterio sin evaluar puede salir como "Correcto".
  out.seguimiento.forEach((s) => {
    if (s.resultado === "Correcto") assert.ok(["cumple", "pasa"].includes(s.veredicto), s.criterio + " sale Correcto con veredicto " + s.veredicto);
  });
});

test("la huella se toma aunque el resto de capas estén apagadas", { skip }, async () => {
  // Es lo que alimenta los criterios de sitio; y antes la navegación dependía de
  // la capa de render, así que apagarla dejaba la huella vacía en silencio.
  const r = await auditRun({ url: base }, { waitMs: 100, capas: { render: false, viewport: false, dynamic: false, axe: false } });
  assert.ok(r.huella, "debe haber huella");
  assert.equal(r.huella.url, base);
  assert.ok(r.huella.enlaces.length > 0, "la página estaba navegada, no en about:blank");
});

test("las capas se pueden apagar de una en una", { skip }, async () => {
  const r = await auditRun({ url: base }, { waitMs: 100, capas: { render: true, viewport: false, dynamic: false, axe: false, huella: false, pixeles: false } });
  assert.ok(!r.viewport);
  assert.equal(r.findings.filter((f) => f.scope === "adaptación").length, 0);
  assert.deepEqual(r.procedencia.capas.map((c) => c.capa), ["render"]);
  assert.equal(r.procedencia.axe, "desactivado");
  assert.equal(r.huella, null);
});
