import { test } from "node:test";
import assert from "node:assert/strict";
import { rngDesde, barajar, clasificar, seleccionarMuestra, justificarMuestra, CATEGORIAS, CONTENIDOS } from "../src/sampling.js";
import { parseRobots, NO_VISITAR, noVisitarPorTexto } from "../src/crawl.js";

const pag = (ruta, extra) => Object.assign({ url: "https://s.es" + ruta, ruta, titulo: "", plantilla: "T", "señales": {} }, extra || {});
const motivos = (sel, ruta) => (sel.muestra.find((m) => m.url.endsWith(ruta)) || {}).motivos;

/* ── Reproducibilidad: sin esto la muestra no es defendible ── */

test("la misma semilla da exactamente la misma secuencia", () => {
  const a = Array.from({ length: 8 }, rngDesde("jesusaccesible.com"));
  const b = Array.from({ length: 8 }, rngDesde("jesusaccesible.com"));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Array.from({ length: 8 }, rngDesde("otra")));
  assert.ok(a.every((x) => x >= 0 && x < 1));
});

test("barajar es reproducible y no muta la entrada", () => {
  const orig = ["a", "b", "c", "d", "e", "f"];
  const copia = orig.slice();
  const x = barajar(orig, rngDesde("s"));
  assert.deepEqual(orig, copia, "no debe mutar");
  assert.deepEqual(x.slice().sort(), copia.slice().sort(), "no debe perder ni duplicar");
  assert.deepEqual(x, barajar(orig, rngDesde("s")));
});

test("regresión: dos muestras con la misma semilla son idénticas", () => {
  const cands = Array.from({ length: 30 }, (_, i) => pag("/p" + i, { plantilla: "T" }));
  const a = seleccionarMuestra(cands, { semilla: "x" });
  const b = seleccionarMuestra(cands, { semilla: "x" });
  assert.deepEqual(a.muestra.map((m) => m.url), b.muestra.map((m) => m.url));
  assert.equal(a.semilla, "x");
});

/* ── Clasificación ── */

test("las páginas comunes se reconocen por ruta o por título", () => {
  assert.ok(clasificar(pag("/")).categorias.includes("inicio"));
  assert.ok(clasificar(pag("/declaracion-de-accesibilidad")).categorias.includes("accesibilidad"));
  assert.ok(clasificar(pag("/es/contacto")).categorias.includes("contacto"));
  assert.ok(clasificar(pag("/x", { titulo: "Mapa web" })).categorias.includes("mapa-web"));
});

test("las señales del DOM mandan sobre la URL", () => {
  // Un formulario con contraseña es acceso aunque la ruta no lo diga.
  const c = clasificar(pag("/area-privada", { "señales": { tieneAcceso: true, tieneFormulario: true } }));
  assert.ok(c.categorias.includes("acceso"));
  assert.ok(!c.categorias.includes("formulario"), "no se duplica acceso como formulario genérico");
});

test("los tipos de contenido salen de las señales", () => {
  const c = clasificar(pag("/media", { "señales": { video: true, tabla: true, pdf: true } }));
  assert.deepEqual(c.contenidos.sort(), ["pdf", "tabla", "video"]);
});

/* ── Selección estructurada ── */

test("incluye una página por cada categoría común presente", () => {
  const sel = seleccionarMuestra([
    pag("/"), pag("/contacto"), pag("/accesibilidad"), pag("/mapa-web"), pag("/ayuda")
  ]);
  ["inicio", "contacto", "accesibilidad", "mapa-web", "ayuda"].forEach((id) => {
    assert.equal(sel.cobertura.categorias[id], true, "falta " + id);
  });
});

test("de varias candidatas de una categoría elige la ruta canónica (la más corta)", () => {
  const sel = seleccionarMuestra([pag("/"), pag("/es/seccion/contacto-comercial"), pag("/contacto")]);
  assert.ok(motivos(sel, "/contacto"), "debe elegir /contacto");
  assert.ok(motivos(sel, "/contacto").includes("Contacto"));
});

test("avisa de las categorías esenciales que NO existen en el sitio", () => {
  const sel = seleccionarMuestra([pag("/")]);
  assert.ok(sel.avisos.some((a) => /Declaración de accesibilidad/.test(a)), sel.avisos.join(" | "));
  assert.equal(sel.cobertura.categorias.accesibilidad, false);
});

test("incluye una página por plantilla distinta", () => {
  const sel = seleccionarMuestra([
    pag("/", { plantilla: "home" }),
    pag("/a", { plantilla: "listado" }), pag("/b", { plantilla: "listado" }),
    pag("/c", { plantilla: "ficha" })
  ], { semilla: "s" });
  assert.equal(sel.cobertura.plantillasCubiertas, 3);
  assert.match(motivos(sel, "/a").join(" "), /Plantilla propia \(2 página/);
});

test("cubre cada tipo de contenido al menos una vez", () => {
  const sel = seleccionarMuestra([
    pag("/", { plantilla: "T" }),
    pag("/v", { plantilla: "T", "señales": { video: true } }),
    pag("/t", { plantilla: "T", "señales": { tabla: true } })
  ]);
  assert.equal(sel.cobertura.contenidos.video, true);
  assert.equal(sel.cobertura.contenidos.tabla, true);
  assert.match(motivos(sel, "/v").join(" "), /Tipo de contenido: Vídeo/);
});

test("una página que ya está por otro motivo no se duplica: acumula motivos", () => {
  const sel = seleccionarMuestra([pag("/", { plantilla: "home", "señales": { video: true } })]);
  const urls = sel.muestra.map((m) => m.url);
  assert.equal(new Set(urls).size, urls.length, "sin duplicados");
  const m = motivos(sel, "/");
  assert.ok(m.length >= 3, JSON.stringify(m));
  assert.ok(m.includes("Página de inicio"));
  assert.ok(m.some((x) => /Plantilla propia/.test(x)));
  assert.ok(m.includes("Tipo de contenido: Vídeo"));
});

/* ── Muestra aleatoria ── */

test("la muestra aleatoria es al menos el 10 % de la estructurada", () => {
  const cands = [pag("/"), pag("/contacto"), pag("/accesibilidad")].concat(
    Array.from({ length: 40 }, (_, i) => pag("/n" + i, { plantilla: "T" }))
  );
  const sel = seleccionarMuestra(cands, { semilla: "s", max: 50 });
  assert.ok(sel.aleatoria.length >= Math.ceil(sel.estructurada.length * 0.10), sel.aleatoria.length + " vs " + sel.estructurada.length);
  assert.ok(sel.aleatoria.every((a) => /Muestra aleatoria/.test(a.motivos[0])));
});

test("la parte aleatoria sale de lo que NO está ya en la estructurada", () => {
  const cands = [pag("/"), pag("/contacto")].concat(Array.from({ length: 10 }, (_, i) => pag("/n" + i, { plantilla: "T" })));
  const sel = seleccionarMuestra(cands, { semilla: "s" });
  const est = new Set(sel.estructurada.map((m) => m.url));
  assert.ok(sel.aleatoria.every((a) => !est.has(a.url)));
});

test("regresión: al recortar por el máximo NUNCA se pierde la muestra aleatoria", () => {
  // WCAG-EM la exige; recortar por ahí dejaría la muestra fuera de metodología.
  // 12 plantillas distintas (12 estructuradas) y 20 páginas más que las comparten.
  const cands = Array.from({ length: 12 }, (_, i) => pag("/t" + i, { plantilla: "T" + i }))
    .concat(Array.from({ length: 20 }, (_, i) => pag("/n" + i, { plantilla: "T0" })));
  const sel = seleccionarMuestra(cands, { semilla: "s", max: 6 });
  assert.equal(sel.muestra.length, 6);
  assert.ok(sel.aleatoria.length >= 1, "debe quedar muestra aleatoria");
  assert.ok(sel.aleatoria.every((a) => sel.muestra.some((m) => m.url === a.url)), "la aleatoria debe sobrevivir al recorte");
  assert.ok(sel.avisos.some((a) => /supera el máximo/.test(a)));
});

test("si la estructurada ya cubre todo el sitio, se dice que no es una muestra", () => {
  const cands = Array.from({ length: 5 }, (_, i) => pag("/p" + i, { plantilla: "T" + i }));
  const sel = seleccionarMuestra(cands, { semilla: "s", max: 50 });
  assert.equal(sel.aleatoria.length, 0);
  assert.match(sel.avisos.join(" | "), /abarca el sitio completo, no una muestra/);
});

test("sin candidatas no se inventa una muestra", () => {
  const sel = seleccionarMuestra([]);
  assert.deepEqual(sel.muestra, []);
  assert.ok(sel.avisos.length);
});

/* ── Justificación para el IRA ── */

test("la justificación dice tamaño, reparto, semilla y qué falta", () => {
  const sel = seleccionarMuestra([pag("/"), pag("/contacto"), pag("/a", { plantilla: "otra" })], { semilla: "mi-sitio" });
  const j = justificarMuestra(sel);
  assert.match(j, /WCAG-EM/);
  assert.match(j, /semilla «mi-sitio», reproducible/);
  assert.match(j, /plantillas distintas/);
  assert.match(j, /Sin representación en la muestra/);
});

/* ── robots.txt ── */

test("robots.txt: Disallow bloquea y Allow más específico desbloquea", () => {
  const r = parseRobots("User-agent: *\nDisallow: /privado/\nAllow: /privado/publico\n");
  assert.equal(r.permite("/"), true);
  assert.equal(r.permite("/privado/x"), false);
  assert.equal(r.permite("/privado/publico/y"), true);
});

test("robots.txt: las reglas de otro agente no nos afectan", () => {
  const r = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n");
  assert.equal(r.permite("/cualquiera"), true);
  assert.equal(r.permite("/admin/panel"), false);
});

test("robots.txt: comodines y fin de cadena", () => {
  const r = parseRobots("User-agent: *\nDisallow: /*.json$\nDisallow: /tmp*/x\n");
  assert.equal(r.permite("/datos.json"), false);
  assert.equal(r.permite("/datos.json?a=1"), true, "el $ exige fin exacto");
  assert.equal(r.permite("/tmp123/x"), false);
});

test("robots.txt vacío o ausente permite todo", () => {
  assert.equal(parseRobots("").permite("/x"), true);
  assert.equal(parseRobots("User-agent: *\nDisallow:\n").permite("/x"), true, "Disallow vacío permite todo");
});

test("las rutas destructivas no se visitan jamás", () => {
  ["/logout", "/cerrar-sesion", "/cuenta/eliminar", "/p?action=delete", "/darse-de-baja", "/es/sign-out"]
    .forEach((r) => assert.ok(NO_VISITAR.test(r), "debería bloquearse: " + r));
});

test("regresión: la regla de rutas no se come páginas legítimas", () => {
  // Bloquear de más deja agujeros en la muestra sin que nadie se entere.
  ["/contacto", "/servicios", "/blog/como-salir-de-dudas", "/borradores", "/deleteria-del-arte",
   "/actualidad/eliminatorias", "/productos/removedor"]
    .forEach((r) => assert.ok(!NO_VISITAR.test(r), "NO debería bloquearse: " + r));
});

test("en el TEXTO del enlace sí valen las palabras inequívocas", () => {
  ["Salir", "Cerrar sesión", "Eliminar", "Darse de baja", "  Desconectar  "]
    .forEach((t) => assert.ok(noVisitarPorTexto(t), "debería bloquearse: " + t));
  ["Servicios", "Cómo salirse con la suya", "Borradores guardados"]
    .forEach((t) => assert.ok(!noVisitarPorTexto(t), "NO debería bloquearse: " + t));
});

test("regresión: una palabra suelta solo bloquea si ES el nombre del enlace", () => {
  // «Salir» es inequívoco; «Cómo salir de dudas» es un artículo. Bloqueando por
  // contención se dejaba un agujero en la muestra sin que nadie se enterara.
  assert.ok(noVisitarPorTexto("Salir"));
  assert.ok(!noVisitarPorTexto("Cómo salir de dudas"));
  assert.ok(!noVisitarPorTexto("Eliminar el ruido de tu web"));
  // Las frases sí se buscan dentro: no aparecen por azar.
  assert.ok(noVisitarPorTexto("Pulsa aquí para cerrar sesión"));
});
