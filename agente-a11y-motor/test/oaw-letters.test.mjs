import { test } from "node:test";
import assert from "node:assert/strict";
import { WCAG22 } from "../src/engine.js";
import { letraOAW, MAPA_DIRECTO, GRANULARES, NO_EN_PLANTILLA, LETRAS, tagDe, resumenAsignacion } from "../src/oaw-letters.js";
import { understand, analyze, oawExport } from "./helpers.mjs";

const f = (crit, node, types, evid) => ({
  c: { n: crit, t: "x", lvl: "A" },
  verdict: "falla",
  nodes: node ? [node] : [],
  types: types || [],
  evid: evid || []
});

/* ── Lo que decide la estructura, no la redacción ────────────────────────── */

test("1.3.1 sobre una tabla → -I, y lo dice por la estructura", () => {
  const r = letraOAW(f("1.3.1", { locator: "table.resultados", role: "table" }));
  assert.equal(r.subcriterio, "9.1.3.1-I");
  assert.equal(r.via, "estructura");
  assert.match(r.motivo, /tabla/);
});

test("1.3.1 sobre una lista → -D; sobre un fieldset → -Ñ; sobre nav → -Q", () => {
  assert.equal(letraOAW(f("1.3.1", { locator: "ul.menu", role: "list" })).subcriterio, "9.1.3.1-D");
  assert.equal(letraOAW(f("1.3.1", { locator: "fieldset.datos", role: "group" })).subcriterio, "9.1.3.1-Ñ");
  assert.equal(letraOAW(f("1.3.1", { locator: "nav.principal", role: "navigation" })).subcriterio, "9.1.3.1-Q");
  assert.equal(letraOAW(f("1.3.1", { locator: "h2.titulo", role: "heading" })).subcriterio, "9.1.3.1-Q");
});

test("1.3.1 sin señal de estructura cae a -A, y lo admite", () => {
  const r = letraOAW(f("1.3.1", { locator: "input.correo", role: "textbox" }));
  assert.equal(r.subcriterio, "9.1.3.1-A");
  assert.equal(r.via, "general");
});

test("regresión: la estructura MANDA sobre lo que diga la redacción", () => {
  // La evidencia habla de «lista» pero el nodo es una tabla. Clasificando por
  // texto —como hacía el pipeline manual— esto salía -D: el subcriterio dependía
  // de cómo estuviera redactada la frase, no de lo que se comprobó.
  const r = letraOAW(f("1.3.1", { locator: "table.precios", role: "table" }, [],
    ["La <strong>lista</strong> de precios no tiene encabezados"]));
  assert.equal(r.subcriterio, "9.1.3.1-I");
  assert.equal(r.via, "estructura");
});

test("4.1.2 separa nombre/rol de estados por el TIPO de regla que saltó", () => {
  assert.equal(letraOAW(f("4.1.2", { locator: "a" }, ["name-missing"])).subcriterio, "9.4.1.2-A");
  assert.equal(letraOAW(f("4.1.2", { locator: "div.acordeon" }, ["aria-missing-state"])).subcriterio, "9.4.1.2-B");
  assert.equal(letraOAW(f("4.1.2", { locator: "div.tab" }, ["state-invalid"])).subcriterio, "9.4.1.2-B");
  // Un hallazgo con varios tipos donde uno es de estado: manda el de estado.
  assert.equal(letraOAW(f("4.1.2", { locator: "div" }, ["name-missing", "aria-bad-value"])).subcriterio, "9.4.1.2-B");
});

test("1.1.1: una imagen dentro de un enlace es -G", () => {
  const r = letraOAW(f("1.1.1", { locator: "img.logo", role: "img", tag: "img", enEnlace: true }, ["img-no-alt"]));
  assert.equal(r.subcriterio, "9.1.1.1-G");
  assert.equal(r.via, "estructura");
});

test("1.1.1: decorativa solo se deduce del texto, porque es intención y no estructura", () => {
  const r = letraOAW(f("1.1.1", { locator: "img.deco", tag: "img", enEnlace: false }, ["img-no-alt"],
    ["Imagen puramente decorativa sin alt vacío"]));
  assert.equal(r.subcriterio, "9.1.1.1-K");
  assert.equal(r.via, "texto");
  // Y sin ninguna pista, la letra general.
  assert.equal(letraOAW(f("1.1.1", { locator: "img", tag: "img" }, ["img-no-alt"], ["Sin alternativa"])).subcriterio, "9.1.1.1-A");
});

/* ── Lo que no se rellena ─────────────────────────────────────────────────── */

test("un criterio fuera de la plantilla OAW no recibe letra inventada", () => {
  NO_EN_PLANTILLA.forEach((c) => {
    const r = letraOAW(f(c, { locator: "button" }));
    assert.equal(r.subcriterio, null, c + " no debería recibir subcriterio");
    assert.equal(r.via, "fuera-de-plantilla");
  });
});

test("un criterio que la tabla no cubre se declara sin mapear, no se rellena con -A", () => {
  // 1.2.4 ya está confirmado contra la plantilla, así que el hueco se prueba con
  // un criterio inexistente: lo que se comprueba es la POLÍTICA, no el hueco.
  const r = letraOAW(f("9.9.9", { locator: "div" }));
  assert.equal(r.subcriterio, null);
  assert.equal(r.via, "sin-mapear");
  assert.match(r.motivo, /a mano/);
});

test("1.2.4 (subtítulos en directo) ya tiene su subcriterio confirmado", () => {
  assert.equal(letraOAW(f("1.2.4", { locator: "video" })).subcriterio, "9.1.2.4-A");
});

test("guarda: todo criterio del motor está mapeado, es granular o está excluido a propósito", () => {
  // Si algún día se añade un criterio al motor sin tocar la tabla, este test lo
  // caza aquí y no en un entregable ya firmado.
  const huerfanos = WCAG22.map((c) => c.n).filter((n) =>
    !MAPA_DIRECTO[n] && GRANULARES.indexOf(n) === -1 && NO_EN_PLANTILLA.indexOf(n) === -1);
  assert.deepEqual(huerfanos, [],
    "criterios sin subcriterio OAW conocido: " + JSON.stringify(huerfanos) +
    " — si es uno nuevo, añádelo a la tabla contra la plantilla, no de memoria");
});

test("las letras que se emiten son solo las que la plantilla reconoce", () => {
  Object.keys(LETRAS).forEach((crit) => {
    const validas = Object.keys(LETRAS[crit]);
    // Cualquier combinación de señales tiene que caer dentro del juego de letras.
    const casos = [
      f(crit, { locator: "table", role: "table" }, ["aria-missing-state"], ["tabla decorativa fieldset landmark lista"]),
      f(crit, { locator: "div" }, [], []),
      f(crit, { locator: "img", tag: "img", enEnlace: true }, ["img-no-alt"], [])
    ];
    casos.forEach((c) => {
      const r = letraOAW(c);
      if (!r.subcriterio) return;
      const letra = r.subcriterio.split("-").pop();
      assert.ok(validas.indexOf(letra) !== -1, crit + " emitió la letra «" + letra + "», que no está en la plantilla");
    });
  });
});

/* ── Override del auditor ─────────────────────────────────────────────────── */

test("el override del auditor gana a cualquier señal, y por elemento gana al del criterio", () => {
  const h = f("1.3.1", { locator: "nav.principal", role: "navigation" });
  assert.equal(letraOAW(h).subcriterio, "9.1.3.1-Q");
  assert.equal(letraOAW(h, { overrides: { "1.3.1": "9.1.3.1-A" } }).subcriterio, "9.1.3.1-A");
  const r = letraOAW(h, { overrides: { "1.3.1": "9.1.3.1-A", "1.3.1|nav.principal": "9.1.3.1-Ñ" } });
  assert.equal(r.subcriterio, "9.1.3.1-Ñ");
  assert.equal(r.via, "override");
});

/* ── Integración con la exportación ───────────────────────────────────────── */

test("tagDe saca la etiqueta del locator en todas sus formas", () => {
  assert.equal(tagDe({ locator: "table#precios" }), "table");
  assert.equal(tagDe({ locator: "ul.menu" }), "ul");
  assert.equal(tagDe({ locator: "input[type=text]" }), "input");
  assert.equal(tagDe({ locator: "nav" }), "nav");
  assert.equal(tagDe({ locator: "div.x", tag: "SECTION" }), "section", "el tag propio manda sobre el locator");
  assert.equal(tagDe(null), "");
});

test("el CSV de barreras lleva su columna de subcriterio OAW", () => {
  const out = oawExport([f("2.4.7", { locator: "a.enlace", name: "Inicio" })], { url: "https://x.test/" });
  assert.equal(out.barreras[0].subcriterioOAW, "9.2.4.7-A");
  assert.equal(out.barreras[0].oawVia, "directo");
  assert.match(out.csv.barreras.split("\r\n")[0], /Subcriterio OAW/);
});

test("cada fila resuelve su propia letra: dos barreras del mismo 1.3.1 pueden diferir", () => {
  const h = {
    c: { n: "1.3.1", t: "Información y relaciones", lvl: "A" }, verdict: "falla", types: [], evid: ["x"],
    nodes: [{ locator: "table.datos", role: "table" }, { locator: "ul.pasos", role: "list" }]
  };
  const out = oawExport([h]);
  assert.equal(out.barreras.length, 2);
  assert.deepEqual(out.barreras.map((r) => r.subcriterioOAW).sort(), ["9.1.3.1-D", "9.1.3.1-I"]);
});

test("las filas sin subcriterio se listan aparte en vez de pasar desapercibidas", () => {
  const out = oawExport([f("2.5.8", { locator: "button.mini" }), f("2.4.7", { locator: "a" })]);
  assert.equal(out.oaw.sinSubcriterio.length, 1);
  assert.equal(out.oaw.sinSubcriterio[0].criterio, "2.5.8");
  assert.equal(out.oaw.asignacion["directo"], 1);
  assert.equal(out.oaw.asignacion["fuera-de-plantilla"], 1);
});

test("resumenAsignacion cuenta por vía", () => {
  assert.deepEqual(resumenAsignacion([{ via: "directo" }, { via: "directo" }, { via: "estructura" }]),
    { directo: 2, estructura: 1 });
});

/* ── Sobre hallazgos REALES del motor, no fabricados a mano ──────────────── */

test("una imagen dentro de un enlace se reconoce también por el selector de axe", () => {
  // Los hallazgos de axe no traen `enEnlace`, traen el selector con ascendencia.
  assert.equal(letraOAW(f("1.1.1", { locator: "a[href] > img" }, [], [])).subcriterio, "9.1.1.1-G");
  assert.equal(letraOAW(f("1.1.1", { locator: "a.marca img.logo" }, [], [])).subcriterio, "9.1.1.1-G");
  // Y un selector sin enlace no se contagia.
  assert.equal(letraOAW(f("1.1.1", { locator: "figure > img" }, [], [])).subcriterio, "9.1.1.1-A");
});

test("regresión: dos elementos distintos con el mismo locator son dos barreras, no una", () => {
  // Dos <img> sin id ni clase comparten locator («img»). Deduplicando por locator
  // se fusionaban en un solo nodo y el IRA contaba una barrera donde hay dos.
  const out = analyze(understand('<img src="a.png"><img src="b.png">'));
  const uno = out.findings.find((x) => x.c.n === "1.1.1" && x.verdict === "falla");
  assert.ok(uno, "el motor debería detectar las imágenes sin alternativa");
  assert.equal(uno.nodes.length, 2, "dos imágenes, dos nodos: " + JSON.stringify(uno.nodes));
  assert.equal(oawExport([uno]).barreras.length, 2, "y dos filas en el informe");
});

test("sobre un análisis real, 4.1.2 por falta de nombre es -A", () => {
  const out = analyze(understand('<button></button>'));
  const h = out.findings.find((x) => x.c.n === "4.1.2" && x.verdict === "falla");
  const r = letraOAW(h);
  assert.equal(r.subcriterio, "9.4.1.2-A");
  assert.equal(r.via, "estructura", "la decide el tipo de regla, no la redacción: " + r.motivo);
});

/* ── El selector identifica; el locator solo se lee ──────────────────────── */

test("regresión: dos elementos con el mismo locator llevan selectores distintos", () => {
  // El locator legible de las dos imágenes es «img» en ambos casos. Sin selector,
  // la columna «Elemento» del IRA daba dos filas idénticas: cuenta bien las
  // barreras pero no sirve para ir a buscar ninguna de las dos.
  const out = analyze(understand('<html><body><main><img src="a.png"><img src="b.png"></main></body></html>'));
  const uno = out.findings.find((x) => x.c.n === "1.1.1" && x.verdict === "falla");
  const filas = oawExport([uno]).barreras;
  assert.equal(filas.length, 2);
  assert.equal(filas[0].elemento, filas[1].elemento, "el nombre legible sí colisiona, y no pasa nada");
  assert.notEqual(filas[0].selector, filas[1].selector, "el selector NO puede colisionar");
  assert.match(filas[0].selector, /img:nth-of-type\(1\)$/);
  assert.match(filas[1].selector, /img:nth-of-type\(2\)$/);
});

test("el CSV de barreras lleva la columna Selector", () => {
  const out = oawExport([f("2.4.7", { locator: "a", path: "html > body > a:nth-of-type(3)" })]);
  assert.match(out.csv.barreras.split("\r\n")[0], /Selector/);
  assert.equal(out.barreras[0].selector, "html > body > a:nth-of-type(3)");
});

test("una fila sin ruta deja el selector vacío en vez de inventarlo", () => {
  assert.equal(oawExport([f("2.4.7", { locator: "a" })]).barreras[0].selector, "");
});

/* ── Regresiones de la revisión profunda ─────────────────────────────────── */

test("regresión: las claves que son nombres de etiqueta sí pueden coincidir", () => {
  // `textoDe` despojaba TODO lo que pareciera una etiqueta antes de buscar, así
  // que las claves «<ul», «<li», «<th>», «<main» no podían coincidir jamás. Lo
  // que quedaba del texto caía en la primera regla que casara — la letra
  // equivocada, y con una `via` de aspecto legítimo.
  const t = (e) => letraOAW({ c: { n: "1.3.1", t: "x", lvl: "A" }, evid: [e], nodes: [], types: [] });
  assert.equal(t("Los elementos del menú se maquetan con <div> en vez de <ul>.").subcriterio, "9.1.3.1-D");
  assert.equal(t("El grupo de opciones no está dentro de <fieldset> con <legend>.").subcriterio, "9.1.3.1-Ñ");
  assert.equal(t("Se usan <br> en lugar de <li>.").subcriterio, "9.1.3.1-D");
});

test("el formato del motor sí se quita: <code> y <strong> no cuentan como contenido", () => {
  const r = letraOAW({ c: { n: "1.3.1", t: "x", lvl: "A" }, nodes: [], types: [],
    evid: ["La <strong>tabla</strong> de precios no tiene <code>th</code>."] });
  assert.equal(r.subcriterio, "9.1.3.1-I");
});

test("regresión: la URL del hallazgo manda sobre la del contexto", () => {
  const out = oawExport([
    { url: "https://x.es/pagina-1", c: { n: "1.1.1", t: "a", lvl: "A" }, verdict: "falla", nodes: [{ locator: "img" }], evid: ["x"] },
    { url: "(toda la muestra)", c: { n: "3.2.3", t: "b", lvl: "AA" }, verdict: "falla", nodes: [{ locator: "nav" }], evid: ["y"] }
  ], { url: "https://x.es/pagina-7" });
  assert.deepEqual(out.barreras.map((r) => r.pagina), ["https://x.es/pagina-1", "(toda la muestra)"]);
});

test("regresión: la evidencia no pierde los nombres de etiqueta que nombra", () => {
  const out = oawExport([{ c: { n: "2.4.2", t: "a", lvl: "A" }, verdict: "falla", nodes: [{ locator: "html" }],
    evid: ["La página no tiene <title> en <head> o está vacío."] }]);
  assert.match(out.barreras[0].evidencia, /<title>/);
  assert.match(out.barreras[0].evidencia, /<head>/);
});
