/**
 * Rastreo y muestreo WCAG-EM contra un sitio real servido por HTTP.
 *
 * El servidor registra CADA petición que recibe, así que se puede comprobar lo
 * que de verdad importa de un rastreador que visita un sitio ajeno: que no entra
 * donde robots.txt lo prohíbe, que no pulsa nada destructivo, que no se sale del
 * dominio y que no descarga binarios.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { crawlSite, muestrearSitio } from "../../src/crawl.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

const sonda = await chromiumDisponible();
const skip = sonda.ok ? false : "sin navegador: " + sonda.motivo;

const P = (titulo, cuerpo, plantilla) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title></head><body>
<header><nav aria-label="Principal">
  <a href="/">Inicio</a><a href="/servicios">Servicios</a><a href="/contacto">Contacto</a>
  <a href="/accesibilidad">Accesibilidad</a><a href="/buscar?q=x">Buscar</a><a href="/acceso">Acceso</a>
  <a href="/privado/panel">Panel</a><a href="/logout">Cerrar sesión</a>
  <a href="https://externo.example/otra">Sitio externo</a><a href="/informe.pdf">Informe PDF</a>
</nav></header>
<main class="${plantilla || "generica"}"><h1>${titulo}</h1>${cuerpo}</main>
<footer><a href="/ayuda">Ayuda</a><a href="/mapa-web">Mapa web</a></footer></body></html>`;

const SITIO = {
  "/robots.txt": { tipo: "text/plain", cuerpo: "User-agent: *\nDisallow: /privado/\n" },
  "/": { cuerpo: P("Inicio", "<p>Bienvenida.</p>", "home") },
  "/servicios": { cuerpo: P("Servicios", "<ul><li><a href='/servicios/uno'>Uno</a></li><li><a href='/servicios/dos'>Dos</a></li></ul>", "listado") },
  "/servicios/uno": { cuerpo: P("Servicio uno", "<p>Detalle.</p><table><tr><th>A</th></tr><tr><td>1</td></tr></table>", "ficha") },
  "/servicios/dos": { cuerpo: P("Servicio dos", "<p>Detalle.</p><video controls></video>", "ficha") },
  "/contacto": { cuerpo: P("Contacto", "<form><label for='n'>Nombre</label><input id='n'><button>Enviar</button></form>", "form") },
  "/accesibilidad": { cuerpo: P("Declaración de accesibilidad", "<p>Conformidad parcial.</p>", "texto") },
  "/ayuda": { cuerpo: P("Ayuda y preguntas frecuentes", "<details><summary>Duda</summary><p>R</p></details>", "texto") },
  "/mapa-web": { cuerpo: P("Mapa web", "<ul><li><a href='/servicios'>Servicios</a></li></ul>", "texto") },
  "/acceso": { cuerpo: P("Acceso", "<form><label for='u'>Usuario</label><input id='u'><label for='p'>Clave</label><input id='p' type='password'><button>Entrar</button></form>", "form") },
  "/buscar": { cuerpo: P("Resultados de búsqueda", "<form role='search'><label for='q'>Buscar</label><input id='q' type='search'></form><p>3 resultados</p>", "listado") },
  "/privado/panel": { cuerpo: P("Panel privado", "<p>No deberías estar aquí.</p>", "panel") },
  "/logout": { cuerpo: P("Sesión cerrada", "<p>Adiós.</p>", "texto") },
  "/informe.pdf": { tipo: "application/pdf", cuerpo: "%PDF-1.4 falso" }
};

let server, base, recibido;
before(async () => {
  if (!sonda.ok) return;
  recibido = [];
  server = createServer((req, res) => {
    const ruta = req.url.replace(/\?.*$/, "");
    recibido.push(ruta);
    const p = SITIO[ruta];
    res.writeHead(p ? 200 : 404, { "content-type": (p && p.tipo) || "text/html; charset=utf-8" });
    res.end(p ? p.cuerpo : "no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port + "/";
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

test("rastrea el sitio y reconoce las páginas comunes", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  assert.deepEqual(r.errores, [], JSON.stringify(r.errores));
  const rutas = r.candidatas.map((c) => c.ruta).sort();
  assert.ok(rutas.includes("/"), rutas.join(" "));
  assert.ok(rutas.includes("/contacto"));
  assert.ok(rutas.includes("/accesibilidad"));
  assert.ok(rutas.includes("/servicios/uno"), "debe bajar de nivel");
});

test("SEGURIDAD: no entra donde robots.txt lo prohíbe", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  assert.ok(!r.candidatas.some((c) => c.ruta.startsWith("/privado")), "entró en /privado");
  assert.ok(!recibido.includes("/privado/panel"), "el servidor recibió la petición prohibida");
  assert.ok(r.saltadas.robots >= 1, JSON.stringify(r.saltadas));
  assert.ok(r.avisos.some((a) => /robots\.txt aplicado/.test(a)));
});

test("SEGURIDAD: no pulsa «cerrar sesión» ni nada destructivo", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  assert.ok(!recibido.includes("/logout"), "el rastreador cerró la sesión");
  assert.ok(!r.candidatas.some((c) => /logout/.test(c.ruta)));
  assert.ok(r.saltadas.destructiva >= 1);
});

test("SEGURIDAD: no sale del dominio ni descarga binarios", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  assert.ok(!r.candidatas.some((c) => /externo\.example/.test(c.url)));
  assert.ok(!recibido.includes("/informe.pdf"), "descargó el PDF");
  assert.ok(r.saltadas.externa >= 1 && r.saltadas.noHtml >= 1, JSON.stringify(r.saltadas));
});

test("robots: \"ignorar\" exige decisión explícita y lo deja dicho", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30, robots: "ignorar" });
  assert.ok(r.candidatas.some((c) => c.ruta.startsWith("/privado")), "con robots ignorado sí debe entrar");
  assert.equal(r.procedencia.robots, "ignorado");
  assert.ok(r.avisos.some((a) => /IGNORADO/.test(a)));
});

test("las plantillas distintas se distinguen y las iguales se agrupan", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  const porRuta = {};
  r.candidatas.forEach((c) => { porRuta[c.ruta] = c.plantilla; });
  assert.equal(porRuta["/servicios/uno"], porRuta["/servicios/dos"], "dos fichas comparten plantilla");
  assert.notEqual(porRuta["/"], porRuta["/contacto"], "inicio y formulario no");
});

test("las señales de contenido se detectan sobre el render real", { skip }, async () => {
  const r = await crawlSite(base, { pausaMs: 0, max: 30 });
  const de = (ruta) => r.candidatas.find((c) => c.ruta === ruta)["señales"];
  assert.equal(de("/servicios/dos").video, true);
  assert.equal(de("/servicios/uno").tabla, true);
  assert.equal(de("/acceso").tieneAcceso, true);
  assert.equal(de("/buscar?q=x") ? de("/buscar?q=x").tieneBusqueda : de("/buscar").tieneBusqueda, true);
  assert.equal(de("/ayuda").widget, true, "el <details> es un widget dinámico");
  assert.equal(de("/").pdf, true, "el enlace al PDF se anota como señal, aunque no se descargue");
});

test("muestrearSitio entrega la muestra con su motivo y su justificación", { skip }, async () => {
  const sel = await muestrearSitio(base, { pausaMs: 0, max: 30, semilla: "prueba", tamañoMuestra: 12 });
  assert.ok(sel.muestra.length >= 5, JSON.stringify(sel.muestra.map((m) => m.url)));
  assert.ok(sel.muestra.every((m) => m.motivos.length), "toda página debe llevar motivo");
  assert.equal(sel.cobertura.categorias.inicio, true);
  assert.equal(sel.cobertura.categorias.accesibilidad, true);
  assert.equal(sel.cobertura.categorias.contacto, true);
  assert.equal(sel.cobertura.contenidos.video, true);
  assert.match(sel.justificacion, /WCAG-EM/);
  assert.match(sel.justificacion, /semilla «prueba», reproducible/);
  assert.equal(sel.procedencia.robots, "respetado");
});

test("dos muestreos con la misma semilla dan la misma muestra", { skip }, async () => {
  const a = await muestrearSitio(base, { pausaMs: 0, max: 30, semilla: "igual" });
  const b = await muestrearSitio(base, { pausaMs: 0, max: 30, semilla: "igual" });
  assert.deepEqual(a.muestra.map((m) => m.url).sort(), b.muestra.map((m) => m.url).sort());
});
