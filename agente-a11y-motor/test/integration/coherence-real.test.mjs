/**
 * Coherencia entre páginas contra un sitio real de varias páginas.
 *
 * El servidor sirve un mini-sitio donde CADA defecto está en una página
 * concreta: una invierte la navegación, otra renombra un destino, otra mueve la
 * ayuda. Comprueba que `auditSite` los encuentra comparando, y que un sitio
 * coherente no dispara ninguno.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { auditSite } from "../../src/audit-run.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

// Un menú móvil duplicado y oculto por CSS: está en TODAS las páginas, y si el
// agente no lo descartara inventaría incoherencias en todas.
const MOVIL = '<nav class="movil" aria-label="Menú móvil"><a href="/contacto">Contacto</a><a href="/servicios">Servicios</a><a href="/">Inicio</a></nav>';
const CSS = "<style>body{font:16px system-ui}.movil{display:none}</style>";

const pagina = (titulo, nav, extra) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${titulo}</title>${CSS}</head><body>
<header><nav aria-label="Principal">${nav}</nav>
<form role="search"><label for="q">Buscar</label><input id="q" type="search"></form></header>
${MOVIL}
<main><h1>${titulo}</h1><p>Contenido de la página.</p>${extra || ""}</main>
<footer><a href="/ayuda">Ayuda</a><a href="/contacto">Contacto</a><a href="/mapa-web">Mapa web</a></footer>
</body></html>`;

const NAV_OK = '<a href="/">Inicio</a><a href="/servicios">Servicios</a><a href="/contacto">Contacto</a>';
const NAV_INVERTIDO = '<a href="/contacto">Contacto</a><a href="/servicios">Servicios</a><a href="/">Inicio</a>';
const NAV_RENOMBRADO = '<a href="/">Inicio</a><a href="/servicios">Prestaciones</a><a href="/contacto">Contacto</a>';

const SITIO = {
  "/": pagina("Inicio", NAV_OK),
  "/servicios": pagina("Servicios", NAV_OK),
  "/contacto": pagina("Contacto", NAV_OK),
  "/invertida": pagina("Invertida", NAV_INVERTIDO),
  "/renombrada": pagina("Renombrada", NAV_RENOMBRADO),
  // La ayuda se muda del pie a la cabecera: mismo mecanismo, otro sitio.
  "/ayuda-movida": `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ayuda movida</title>${CSS}</head><body>
<header><nav aria-label="Principal">${NAV_OK}</nav><a href="/ayuda">Ayuda</a></header>
<main><h1>Ayuda movida</h1><p>Contenido.</p></main>
<footer><a href="/mapa-web">Mapa web</a></footer></body></html>`,
  // Un sitio sin ninguna vía de localización.
  "/aislada": `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Aislada</title>${CSS}</head><body><main><h1>Aislada</h1><p>Sin navegación.</p></main></body></html>`,
  "/aislada2": `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Aislada 2</title>${CSS}</head><body><main><h1>Aislada 2</h1><p>Tampoco.</p></main></body></html>`
};

let server, base;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, res) => {
    const c = SITIO[req.url.replace(/\?.*$/, "")];
    res.writeHead(c ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    res.end(c || "no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

const CAPAS = { render: false, viewport: false, dynamic: false, axe: false };
const sitio = async (rutas) => {
  const r = await auditSite(rutas.map((p) => ({ url: base + p })), { waitMs: 100, capas: CAPAS });
  assert.deepEqual(r.errores, [], JSON.stringify(r.errores));
  const m = {};
  r.coherencia.forEach((f) => { (m[f.c.n] = m[f.c.n] || []).push(f); });
  return { r, m };
};

test("un sitio coherente no dispara ninguno de los cuatro criterios", { skip }, async () => {
  const { m } = await sitio(["/", "/servicios", "/contacto"]);
  assert.equal(m["3.2.3"][0].verdict, "cumple", JSON.stringify(m["3.2.3"][0].evid));
  assert.equal(m["3.2.4"][0].verdict, "cumple", JSON.stringify(m["3.2.4"][0].evid));
  assert.equal(m["2.4.5"][0].verdict, "cumple");
  assert.equal(m["3.2.6"][0].verdict, "cumple-parcial");
});

test("regresión: el menú móvil oculto no inventa incoherencias", { skip }, async () => {
  // Está en las tres páginas con los destinos EN ORDEN INVERSO. Si se colara en
  // la huella, 3.2.3 fallaría en un sitio que es perfectamente coherente.
  const { r, m } = await sitio(["/", "/servicios"]);
  assert.equal(m["3.2.3"][0].verdict, "cumple");
  assert.equal(r.paginas[0].huella.navs.length, 1, "solo debe verse el nav visible");
});

test("una página con la navegación invertida → falla 3.2.3, señalando cuál", { skip }, async () => {
  const { m } = await sitio(["/", "/servicios", "/invertida"]);
  assert.equal(m["3.2.3"][0].verdict, "falla");
  assert.match(m["3.2.3"][0].evid[0], /invertida/);
});

test("un destino renombrado → falla 3.2.4 con los dos nombres", { skip }, async () => {
  const { m } = await sitio(["/", "/renombrada"]);
  const f = m["3.2.4"].find((x) => x.verdict === "falla");
  assert.ok(f, JSON.stringify(m["3.2.4"].map((x) => x.verdict)));
  assert.match(f.evid[0], /Servicios/);
  assert.match(f.evid[0], /Prestaciones/);
});

test("la ayuda que se muda del pie a la cabecera → falla 3.2.6", { skip }, async () => {
  const { m } = await sitio(["/", "/ayuda-movida"]);
  assert.equal(m["3.2.6"][0].verdict, "falla", JSON.stringify(m["3.2.6"][0].evid));
  assert.match(m["3.2.6"][0].evid[0], /cambia de sitio/);
});

test("regresión: un sitio con la ayuda siempre en el pie no dispara 3.2.6", { skip }, async () => {
  const { m } = await sitio(["/", "/servicios", "/contacto"]);
  assert.equal(m["3.2.6"][0].verdict, "cumple-parcial", JSON.stringify(m["3.2.6"][0].evid));
});

test("sin buscador ni navegación ni mapa → falla 2.4.5", { skip }, async () => {
  // Dos páginas: 2.4.5 es un criterio de SITIO y desde una sola no se falla
  // (el mapa web puede estar en el pie de otra).
  const { m } = await sitio(["/aislada", "/aislada2"]);
  assert.equal(m["2.4.5"][0].verdict, "falla", JSON.stringify(m["2.4.5"][0].evid));
});

test("2.4.5 con una sola página queda a revisar, no falla", { skip }, async () => {
  const { m } = await sitio(["/aislada"]);
  assert.equal(m["2.4.5"][0].verdict, "revisar");
  assert.match(m["2.4.5"][0].evid[0], /criterio de SITIO/);
});

test("los hallazgos de sitio llegan al rollup y llevan su ámbito", { skip }, async () => {
  const { r } = await sitio(["/", "/invertida"]);
  const enRollup = r.rollup.criterios.find((c) => c.n === "3.2.3");
  assert.ok(enRollup, "3.2.3 debe estar en el rollup del sitio");
  assert.equal(enRollup.worst, "falla");
  assert.ok(r.coherencia.every((f) => f.scope === "sitio"));
  assert.ok(r.findings.some((f) => f.url === "(toda la muestra)"));
  assert.equal(r.procedencia.paginas, 2);
});
