/**
 * Contraste por píxeles contra un Chromium real.
 *
 * Cada caso es un texto sobre un fondo que `getComputedStyle` no sabe medir
 * —degradado, imagen, translucidez sobre foto— y del que sí se sabe la respuesta
 * correcta. Es la prueba de que 1.4.3 sobre degradados ha dejado de ser un
 * «revisar» y es una medición.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromiumDisponible, launchOptions } from "../../src/playwright-launch.js";
import { resolverContrastePorPixeles } from "../../src/pixel-contrast.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

// Una imagen de 2×1: mitad negra, mitad blanca, estirada como fondo.
const IMG_MITADES = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="1" height="1" fill="#000"/><rect x="1" width="1" height="1" fill="#fff"/></svg>'
).toString("base64");

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contraste</title><style>
  body { margin:0; font:700 28px/1.6 system-ui, sans-serif; }
  .caja { width: 420px; padding: 16px; }
  /* Texto blanco sobre un degradado que va de negro a blanco: legible en una
     mitad, invisible en la otra. El caso de libro de los hero con foto. */
  #degradado { background: linear-gradient(90deg, #000 0%, #fff 100%); color: #fff; }
  /* Texto negro sobre un degradado siempre claro: llega en todo el recorrido. */
  #bueno { background: linear-gradient(90deg, #e8e8e8 0%, #ffffff 100%); color: #111; }
  /* Texto blanco sobre imagen mitad negra mitad blanca. */
  #imagen { background-image: url("${IMG_MITADES}"); background-size: 100% 100%; color: #fff; }
  /* Texto casi del color del fondo: el caso que el método antiguo no veía. */
  #invisible { background: linear-gradient(90deg, #fbfbfb, #ffffff); color: #fdfdfd; }
  /* Texto pintado con background-clip: repintar el color no lo cambia. */
  #recortado { background-image: linear-gradient(90deg, #f00, #00f); -webkit-background-clip: text;
               background-clip: text; color: transparent; }
  /* Un hijo con SU PROPIO color dentro de un texto medible: sus letras no son
     del padre y no pueden entrar en la medición del padre. */
  #conhijo { background: linear-gradient(90deg, #0b2b4a, #113f6d); color: #fff; }
  #conhijo .malo { color: #0a2340; }
  /* Texto blanco sobre fondo claro con sombra apilada: la tecnica de halo.
     Sin la sombra no se lee; con ella, si. Las dos lecturas no coinciden. */
  #halo { background: linear-gradient(90deg, #dfe8f0, #e9f0f6); color: #fff;
          text-shadow: 0 0 2px #000, 0 0 2px #000, 0 0 2px #000, 0 0 2px #000; }
</style></head><body>
<div class="caja" id="degradado">Texto sobre degradado</div>
<div class="caja" id="bueno">Texto legible siempre</div>
<div class="caja" id="imagen">Texto sobre imagen</div>
<div class="caja" id="invisible">Texto casi invisible</div>
<div class="caja" id="recortado">Texto recortado</div>
<div class="caja" id="conhijo">Texto del padre con <span class="malo">un hijo oscuro</span> dentro</div>
<div class="caja" id="halo">Texto con halo de sombra</div>
</body></html>`;

let server, base, browser, page, res;
before(async () => {
  if (!sonda.ok) return;
  server = createServer((req, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(PAGINA); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
  const { chromium } = await import("playwright");
  browser = await chromium.launch(launchOptions());
  page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto(base, { waitUntil: "load" });
  res = await resolverContrastePorPixeles(page, { max: 14 });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

const de = (id) => res.find((r) => r.uid.includes("nth-of-type") && r.node.includes(id)) ||
  res.find((r) => (r.detail + r.node).includes(id));
const porTexto = (t) => res.find((r) => r.node.includes(t));
/** Por id, que es lo que usa `locator` cuando el elemento lo tiene. */
const uno = (id) => res.find((r) => (r.locator || "") === "div#" + id);

test("detecta los textos cuyo fondo no se puede medir con getComputedStyle", { skip }, async () => {
  assert.ok(res.length >= 4, "debería encontrar los bloques con degradado/imagen: " + res.length);
  assert.ok(res.every((r) => r.crit === "1.4.3" && r.origen === "píxeles"));
});

test("texto blanco sobre un degradado que acaba en blanco → falla, midiendo el peor punto", { skip }, async () => {
  const r = porTexto("Texto sobre degradado");
  assert.ok(r, JSON.stringify(res.map((x) => x.node)));
  assert.equal(r.verdict, "falla", r.detail);
  assert.equal(r.pixeles.determinado, true);
  // La medición es bajo los GLIFOS, no de la caja entera: el peor punto es el
  // fondo más claro que llega a tocar una letra, no el extremo del degradado.
  assert.ok(r.pixeles.peor < 4.5, "en la zona clara el blanco no llega: " + r.pixeles.peor);
  assert.ok(r.pixeles.mejor > 15, "en la zona negra sí: " + r.pixeles.mejor);
  assert.ok(r.pixeles.fondosDistintos > 20, "un degradado real tiene muchos tonos: " + r.pixeles.fondosDistintos);
  assert.match(r.detail, /medido sobre los píxeles del fondo real/);
});

test("texto oscuro sobre un degradado siempre claro → pasa", { skip }, async () => {
  const r = porTexto("Texto legible siempre");
  assert.ok(r, "no se localizó");
  assert.equal(r.verdict, "pasa", r.detail);
  assert.ok(r.pixeles.peor > 4.5, String(r.pixeles.peor));
  assert.match(r.detail, /todo el texto llega al mínimo/);
});

test("texto blanco sobre una imagen mitad clara → falla", { skip }, async () => {
  const r = porTexto("Texto sobre imagen");
  assert.ok(r, "no se localizó");
  assert.equal(r.verdict, "falla", r.detail);
  assert.ok(r.pixeles.porcentajeQueFalla > 0.02, "parte del texto cae sobre la mitad clara: " + r.pixeles.porcentajeQueFalla);
  assert.ok(r.pixeles.peor < 4.5, String(r.pixeles.peor));
});

test("regresión: texto casi del color del fondo → se detecta (el método antiguo era ciego aquí)", { skip }, async () => {
  const r = porTexto("Texto casi invisible");
  assert.ok(r, "no se localizó");
  assert.equal(r.pixeles.determinado, true, "debe poder dictaminarlo: " + r.detail);
  assert.equal(r.verdict, "falla", r.detail);
  assert.ok(r.pixeles.peor < 1.2, String(r.pixeles.peor));
});

test("regresión: con background-clip:text no se inventa un veredicto", { skip }, async () => {
  // Aquí getComputedStyle dice color: transparent. Medir contra el negro por
  // omisión daba «falla» sobre un color que no es el que se pinta.
  const r = porTexto("Texto recortado");
  assert.ok(r, "debería entrar como candidato: " + JSON.stringify(res.map((x) => x.node)));
  assert.equal(r.verdict, "revisar", r.detail);
  assert.equal(r.pixeles.determinado, false);
  assert.match(r.detail, /transparent|background-clip|canvas/);
});

test("la página queda como estaba: los estilos se restauran siempre", { skip }, async () => {
  const estado = await page.evaluate(() => {
    const ids = ["degradado", "bueno", "imagen", "invisible", "recortado"];
    return ids.map((id) => {
      const el = document.getElementById(id);
      return { id, color: getComputedStyle(el).color, inline: el.getAttribute("style") || "", marca: el.hasAttribute("data-a11y-prev") };
    });
  });
  assert.ok(estado.every((e) => !e.marca), "quedaron marcas de trabajo: " + JSON.stringify(estado));
  assert.ok(estado.every((e) => !/a11y|magenta|rgb\(255,0,255\)/i.test(e.inline)), JSON.stringify(estado));
  assert.equal(estado.find((e) => e.id === "degradado").color, "rgb(255, 255, 255)", "el color original debe volver");
  assert.equal(estado.find((e) => e.id === "bueno").color, "rgb(17, 17, 17)");
});

test("integrado: lo resuelto por píxeles sustituye al «no medible», no lo duplica", { skip }, async () => {
  const { auditRun } = await import("../../src/audit-run.js");
  const r = await auditRun({ url: base }, { waitMs: 100, capas: { render: true, viewport: false, dynamic: false, axe: false, pixeles: true } });
  const de143 = r.findings.filter((f) => f.c.n === "1.4.3");
  const genericos = de143.filter((f) => /imagen o degradado: no medible autom/.test(f.evid.join(" ")));
  assert.deepEqual(genericos.map((f) => f.evid.join(" ")), [], "el «no medible» genérico debe desaparecer: los píxeles ya trataron esos elementos");
  assert.ok(de143.some((f) => f.origen === "píxeles" && f.verdict === "falla"), "el degradado debe salir como barrera");
  // Lo que no se pudo resolver sigue pendiente, pero con una explicación útil.
  const pendientes = de143.filter((f) => f.origen === "píxeles" && f.verdict === "revisar");
  // `text-shadow` entra en la lista porque es otra razón legítima para quedar
  // pendiente: la lectura con la sombra detrás y la lectura sin ella no
  // coinciden, y eso es cosa de la persona auditora, no del agente.
  pendientes.forEach((f) => assert.match(f.evid.join(" "), /transparent|canvas|cobertura completa|capturar|text-shadow/, f.evid.join(" ")));
  assert.ok(r.procedencia.capas.some((c) => c.capa === "píxeles" && c.ok));
});

test("integrado: la capa de píxeles se puede apagar", { skip }, async () => {
  const { auditRun } = await import("../../src/audit-run.js");
  const r = await auditRun({ url: base }, { waitMs: 100, capas: { render: true, viewport: false, dynamic: false, axe: false, pixeles: false } });
  assert.equal(r.pixeles, null);
  assert.ok(r.findings.some((f) => /imagen o degradado: no medible/.test(f.evid.join(" "))), "sin la capa, vuelve el «no medible» honrado");
});

/* ── Los dos defectos medidos en la revisión de v0.41.0 ── */

test("regresión: las letras de un hijo con su propio color no entran en la medición del padre", { skip }, () => {
  // `color` se hereda, así que al sondar el padre las letras del hijo cambiaban
  // de magenta a verde con él y entraban en la máscara: medido, un párrafo de
  // 622 px de texto pasaba a 1072 px al meterle un enlace, y esos 457 px se
  // juzgaban con el color del PADRE. Salía «todo el texto llega al mínimo» con
  // el hijo fallando a 1.19:1 dentro de la misma caja.
  const padre = uno("conhijo");
  const hijo = res.find((r) => /span/.test(r.locator || ""));
  assert.ok(padre, "el padre tiene que medirse");
  assert.ok(hijo, "y el hijo, por separado: " + res.map((r) => r.locator).join(", "));
  assert.equal(padre.verdict, "pasa", padre.detail);
  assert.equal(hijo.verdict, "falla", hijo.detail);
  // Y la prueba de que el hijo quedó fuera: el padre no mide más píxeles que
  // los suyos. El hijo aporta los suyos a su propia fila.
  assert.ok(padre.pixeles.pixeles > 0 && hijo.pixeles.pixeles > 0);
  assert.ok(padre.pixeles.peor >= 4.5, "el peor punto del padre es el del padre: " + padre.pixeles.peor);
});

test("regresión: una sombra de halo no se borra en silencio, se mide y se dice", { skip }, () => {
  // Borrarla y medir daba 1.19:1 — idéntico al mismo texto sin sombra — así que
  // el informe no distinguía un texto ilegible de uno que la sombra hace legible.
  // Las dos lecturas se miden; si no coinciden, `revisar` con los dos números.
  const r = uno("halo");
  assert.ok(r, "el texto con halo tiene que medirse");
  assert.equal(r.verdict, "revisar", r.detail);
  assert.ok(r.pixelesConSombra && r.pixelesConSombra.determinado, "hace falta la segunda lectura");
  assert.ok(r.pixelesConSombra.peor > r.pixeles.peor * 2, "con la sombra detrás el contraste es otro: " +
    r.pixeles.peor + " → " + r.pixelesConSombra.peor);
  assert.match(r.detail, /text-shadow/);
  assert.match(r.detail, /decide a ojo/);
});

test("la página del cliente no se queda pintada ni clavada", { skip }, async () => {
  // Los descendientes se clavan con !important para sacarlos de la máscara: si
  // alguno se quedara así, contaminaría todas las medidas posteriores.
  const sucios = await page.evaluate(() => ({
    marcados: document.querySelectorAll("[data-a11y-prev]").length,
    clavados: Array.prototype.filter.call(document.querySelectorAll("[style]"), (el) =>
      el.style.getPropertyPriority("color") === "important" ||
      el.style.getPropertyPriority("-webkit-text-fill-color") === "important").length
  }));
  assert.equal(sucios.marcados, 0, "quedan elementos marcados");
  assert.equal(sucios.clavados, 0, "quedan colores clavados con !important");
});
