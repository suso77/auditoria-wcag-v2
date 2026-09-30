import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeContextChange } from "../src/dynamic.js";
import { esConforme } from "../src/verdicts.js";
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs, analyzeErrorState } from "../src/index.js";

const has = (arr, n, v) => arr.some((f) => f.c.n === n && f.verdict === v);

test("tab-trace: controles no alcanzados → falla 2.1.1", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "button#a" }, { locator: "div.b" }], reached: [{ locator: "button#a" }] });
  assert.ok(has(r, "2.1.1", "falla"));
});

test("tab-trace: todos alcanzados → cumple 2.1.1", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "button#a" }], reached: [{ locator: "button#a" }] });
  assert.ok(has(r, "2.1.1", "cumple"));
});

test("tab-trace: trampa de foco → falla 2.1.2", () => {
  const r = analyzeTabTrace({ focusables: [{ locator: "a#x" }], reached: [{ locator: "a#x" }], trapped: true });
  assert.ok(has(r, "2.1.2", "falla"));
});

test("disclosure: aria-expanded no cambia → falla 4.1.2", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "false" }]);
  assert.ok(has(r, "4.1.2", "falla"));
});

test("disclosure: cambia estado pero no el contenido → revisar", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "true", targetShownBefore: false, targetShownAfter: false }]);
  assert.ok(has(r, "4.1.2", "revisar"));
});

test("disclosure: funciona → cumple", () => {
  const r = analyzeDisclosure([{ locator: "button#m", expandedBefore: "false", expandedAfter: "true", targetShownBefore: false, targetShownAfter: true }]);
  assert.ok(has(r, "4.1.2", "cumple"));
});

test("tabs: aria-selected no pasa a true → falla", () => {
  const r = analyzeTabs([{ locator: "button#t1", selectedAfter: "false", othersSelected: 0 }]);
  assert.ok(has(r, "4.1.2", "falla"));
});

test("errores: campo requerido en error sin texto → falla 3.3.1", () => {
  const r = analyzeErrorState({ submitted: true, fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "" }], hasAlert: false });
  assert.ok(has(r, "3.3.1", "falla"));
  assert.ok(has(r, "4.1.3", "revisar"));
});

test("errores: bien identificados y anunciados → cumple 3.3.1", () => {
  /* «Y anunciados» hay que haberlo VISTO anunciar: `liveCambio` es que el contenido
   * de la región de estado cambiara al enviar. Antes bastaba `hasAlert`, que era la
   * simple EXISTENCIA de un `[aria-live]` en cualquier parte del documento, vacío o
   * no, relacionado con el error o no — y con eso se emitía `cumple` y la evidencia
   * «se identifican en texto, exponen aria-invalid y se anuncian»: tres
   * afirmaciones y ninguna comprobada. */
  const r = analyzeErrorState({ submitted: true, fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "Introduce un correo válido", hasAlert: true }], hasAlert: true, liveCambio: true });
  assert.ok(has(r, "3.3.1", "cumple"));
});

test("regresión: sin ver el anuncio producirse, 3.3.1 no se cierra como conforme", () => {
  const r = analyzeErrorState({ submitted: true, fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "Introduce un correo válido", hasAlert: true }], hasAlert: true });
  assert.ok(!has(r, "3.3.1", "cumple"), "un contenedor live vacío no demuestra que el error se anuncie");
  assert.ok(has(r, "3.3.1", "cumple-parcial"), "se ha medido el texto y el aria-invalid; el anuncio queda por comprobar");
  assert.ok(has(r, "4.1.3", "revisar"));
  const nota = r.find((f) => f.c.n === "4.1.3").evid.join(" ");
  assert.match(nota, /no ha cambiado al enviar/, "y se dice por qué, en vez de callarlo");
});

test("regresión: la técnica G83 no es una barrera de 3.3.1", () => {
  /* Texto de error visible junto al campo y sin asociar por ARIA: es lo que admite
   * G83, técnica SUFICIENTE para 3.3.1. Mirando solo `aria-describedby` se emitía un
   * `falla` GRAVE sobre un formulario conforme, y la evidencia decía «sin
   * descripción en texto» cuando lo que faltaba era la asociación. */
  const r = analyzeErrorState({
    submitted: true, hasAlert: true, liveCambio: true,
    fields: [{ locator: "input#email", required: true, invalid: true,
               describedbyText: "", errorCercaText: "Error: el correo electrónico es obligatorio." }]
  });
  assert.ok(!has(r, "3.3.1", "falla"), "G83 se satisface con el texto al lado: no es barrera de 3.3.1");
  assert.ok(has(r, "3.3.1", "cumple-parcial"));
  assert.ok(has(r, "4.1.2", "revisar"), "lo que falta —la asociación programática— es 4.1.2, y ahí se dice");
  assert.match(r.find((f) => f.c.n === "3.3.1").evid.join(" "), /G83/);
  // Y sin texto en ninguna parte, sigue siendo la falla que era.
  const sinNada = analyzeErrorState({ submitted: true, hasAlert: true, liveCambio: true,
    fields: [{ locator: "input#email", required: true, invalid: true, describedbyText: "", errorCercaText: "" }] });
  assert.ok(has(sinNada, "3.3.1", "falla"));
});

test("errores: sin envío → sin hallazgos", () => {
  assert.equal(analyzeErrorState({ submitted: false, fields: [] }).length, 0);
});

/* ── 3.2.1 / 3.2.2: cambio de contexto sin que nadie lo pida ─────────────── */

const ctx = (e) => analyzeContextChange(e).map((f) => f.c.n + "/" + f.verdict);

test("navegar al recibir el foco falla 3.2.1", () => {
  // Los dos criterios dicen lo mismo con disparadores distintos, y los dos
  // estaban enteros en «evaluación humana». Son medibles: la URL, dónde queda el
  // foco y una huella del contenido visible son tres señales observables.
  const out = analyzeContextChange([{ locator: "select#pais", uid: "u1", disparador: "foco", navego: true }]);
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["3.2.1/falla"]);
  assert.match(out[0].evid[0], /prohíbe expresamente/);
});

test("navegar al cambiar el valor falla 3.2.2", () => {
  assert.deepEqual(ctx([{ locator: "select#pais", uid: "u1", disparador: "entrada", navego: true }]), ["3.2.2/falla"]);
});

test("mover el foco o cambiar el contenido queda a revisar, no a falla", () => {
  // El criterio lo PERMITE si se ha avisado antes, y ese aviso no se ve desde
  // aquí: convertirlo en falla sería inventar una barrera.
  const out = analyzeContextChange([{ locator: "input#a", uid: "u", disparador: "foco", navego: false, focoMovido: true }]);
  assert.equal(out[0].verdict, "revisar");
  assert.match(out[0].evid[0], /si se ha avisado antes/);
  assert.match(out[0].evid[0], /el foco salta a otro sitio/);
});

test("sin incidencias, el criterio PASA diciendo cuántos controles se probaron", () => {
  const out = analyzeContextChange([
    { locator: "a#x", uid: "u1", disparador: "foco", navego: false, focoMovido: false, contenidoCambio: false },
    { locator: "button#y", uid: "u2", disparador: "foco", navego: false, focoMovido: false, contenidoCambio: false }
  ]);
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["3.2.1/pasa"]);
  assert.match(out[0].evid[0], /2 control\(es\)/);
});

test("los controles que no se pudieron sondar se declaran", () => {
  const out = analyzeContextChange([{ locator: "a#x", uid: "u1", disparador: "foco", navego: false }], 7);
  assert.match(out[0].evid[0], /7 control\(es\) no se pudieron sondar/);
  assert.match(out[0].evid[0], /quedan sin comprobar/);
});

test("sin eventos de un disparador, ese criterio no se pronuncia", () => {
  assert.deepEqual(ctx([{ locator: "a", uid: "u", disparador: "foco", navego: false }]), ["3.2.1/pasa"]);
});

/* ── Regresión: 2.1.1 mira los controles INTERACTIVOS, no solo los enfocables ─
 *
 * `__focusables` enumera lo que YA es enfocable, así que un `div role="button"`
 * sin `tabindex` —el 2.1.1 de libro— no entraba en la lista, no había nada «sin
 * alcanzar», y el análisis emitía `cumple` con la frase «Todos los controles
 * interactivos se alcanzan con Tab». Cinco barreras reales invisibles, y una
 * afirmación sobre «todos los controles interactivos» hecha sin mirar ninguno.
 */
test("regresión: un control con rol de widget que no puede enfocarse es 2.1.1", () => {
  const r = analyzeTabTrace({
    focusables: [{ locator: "a", uid: "u1" }],
    reached: [{ locator: "a", uid: "u1" }],
    medida: true,
    interactivos: { sueltos: [
      { locator: "div#guardar", uid: "d1", rol: "button", name: "Guardar" },
      { locator: "span#ficha", uid: "d2", rol: "link", name: "Ver ficha" }
    ], enCompuesto: [] }
  });
  const f = r.find((x) => x.c.n === "2.1.1");
  assert.equal(f.verdict, "falla");
  assert.equal(f.sev, "grave");
  assert.match(f.evid[0], /2 control\(es\) con rol de widget/);
  assert.equal(f.nodes.length, 2);
  assert.ok(!r.some((x) => x.verdict === "cumple"), "no puede haber ningún `cumple` con dos barreras delante");
});

test("regresión: un widget compuesto con tabindex rotatorio NO es una barrera", () => {
  // El patrón ARIA correcto es UNA parada de tabulación y las flechas por dentro.
  // Señalarlo como 2.1.1 sería inventar una barrera sobre el patrón recomendado.
  const r = analyzeTabTrace({
    focusables: [{ locator: "button#t1", uid: "u1" }, { locator: "a", uid: "u2" }],
    reached: [{ locator: "button#t1", uid: "u1" }, { locator: "a", uid: "u2" }],
    medida: true,
    interactivos: { sueltos: [], enCompuesto: [
      { locator: "div#t2", uid: "c1", rol: "tab", compuesto: "div#tl", name: "Dos" },
      { locator: "div#t3", uid: "c2", rol: "tab", compuesto: "div#tl", name: "Tres" }
    ] }
  });
  const f = r.find((x) => x.c.n === "2.1.1");
  assert.equal(f.verdict, "cumple-parcial", "ni falla ni conforme: las flechas no las recorre esta prueba");
  assert.match(f.evid[0], /flechas/);
  assert.match(f.evid[0], /div#tl/);
});

test("regresión: una fase de tabulación caída no inventa barreras", () => {
  // Si la fase lanza —página cerrada, timeout de CDP— `reached` queda vacío y el
  // análisis emitía `falla` GRAVE para TODOS los enfocables: cinco barreras graves
  // inventadas por un error de la sonda sobre una página perfectamente operable.
  const focusables = ["a", "button", "input[type=text]", "select", "summary"]
    .map((l, i) => ({ locator: l, uid: "u" + i }));
  const caida = analyzeTabTrace({ focusables, reached: [], trapped: false, exhausted: false, medida: false });
  const f = caida.find((x) => x.c.n === "2.1.1");
  assert.equal(f.verdict, "revisar");
  assert.match(f.evid[0], /no llegó a ejecutarse/);
  assert.ok(!caida.some((x) => x.verdict === "falla"));
  // Y con la fase medida de verdad, la falla sí se emite: el arreglo no la tapa.
  const medida = analyzeTabTrace({ focusables, reached: [], trapped: false, exhausted: false, medida: true });
  assert.ok(medida.some((x) => x.c.n === "2.1.1" && x.verdict === "falla"));
});

test("regresión: una trampa de foco CÍCLICA se detecta y se nombra", () => {
  /* Solo se veía el caso degenerado —el mismo control tres veces seguidas—, y una
   * trampa real no repite un control: cicla entre los del modal. `trapped` se
   * quedaba en `false`, y como esta capa es la ÚNICA que emite 2.1.2, el criterio
   * no se evaluaba en ninguna parte: la trampa salía reetiquetada como un 2.1.1 de
   * los controles de fuera, que es un diagnóstico equivocado del mismo síntoma. */
  const r = analyzeTabTrace({
    focusables: ["a#fuera1", "a#fuera2", "button#cerrar", "button#ok"].map((l, i) => ({ locator: l, uid: "u" + i })),
    reached: [{ locator: "button#cerrar", uid: "u2" }, { locator: "button#ok", uid: "u3" }],
    trapped: true, medida: true, atrapadoEn: ["button#cerrar", "button#ok"]
  });
  const t = r.find((x) => x.c.n === "2.1.2");
  assert.ok(t, "2.1.2 tiene que emitirse: es el único sitio del motor que lo hace");
  assert.equal(t.verdict, "falla");
  assert.equal(t.sev, "crítica");
  assert.match(t.evid[0], /cicla entre 2 control\(es\)/);
  assert.match(t.evid[0], /button#cerrar → button#ok/);
  // Y el 2.1.1 de los de fuera baja a `revisar`: la tabulación se interrumpió.
  assert.ok(r.some((x) => x.c.n === "2.1.1" && x.verdict === "revisar"));
});

test("regresión: el tope del sondeo de 3.2.1 sale del veredicto, no solo del texto", () => {
  // `esConforme("pasa")` es true: con el tope invisible, 3.2.1 se exportaba como
  // conforme habiendo sondado 20 de 60 controles.
  const eventos = Array.from({ length: 20 }, (_, i) => ({
    locator: "button#b" + i, uid: "u" + i, disparador: "foco",
    navego: false, focoMovido: false, contenidoCambio: false
  }));
  const recortado = analyzeContextChange(eventos, 0, { total: 60, sondados: 20 });
  const f = recortado.find((x) => x.c.n === "3.2.1");
  assert.equal(f.verdict, "cumple-parcial", "no puede salir conforme con 40 controles sin tocar");
  assert.ok(!esConforme(f.verdict));
  assert.match(f.evid[0], /Quedan 40 de 60/);
  assert.match(f.evid[0], /maxContexto/, "y se dice cómo mirar el resto");
  // Sondados todos, sí es `pasa`.
  const completo = analyzeContextChange(eventos, 0, { total: 20, sondados: 20 });
  assert.equal(completo.find((x) => x.c.n === "3.2.1").verdict, "pasa");
});
