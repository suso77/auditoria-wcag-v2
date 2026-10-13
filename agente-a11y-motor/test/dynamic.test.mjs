import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeContextChange, analyzeAutoMovement, analyzeCharKeyShortcuts, analyzeStatusMessages } from "../src/dynamic.js";
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

/* ── 2.2.2 a partir de lo observado, no de lo que declara el CSS ─────────── */

/**
 * La medición sobre el render lee `animationName` e `animationIterationCount`, así
 * que ve los carruseles hechos con `@keyframes` y no ve los que mueve JavaScript.
 * Medido en un sitio real: el carrusel de la portada no se cazó y en su lugar se
 * acusó a un icono con `fadeInDown`, que era lo único escrito en el CSS.
 */
const obs = (movidos, controles, ms) => ({ ms: ms || 8000, movidos: movidos, controles: controles || [] });
const mov = (loc, n, primero, ultimo) => ({ loc: loc, uid: loc, tipo: "attributes:class", n: n, primero: primero, ultimo: ultimo });

test("2.2.2 observado: movimiento sostenido sin ningún control de pausa es falla", () => {
  const f = analyzeAutoMovement(obs([mov("div.slide", 6, 1200, 7400)], []));
  assert.equal(f.length, 1);
  assert.equal(f[0].c.n, "2.2.2");
  assert.equal(f[0].verdict, "falla");
  assert.equal(f[0].sev, "grave");
  assert.match(f[0].evid.join(" "), /No se ha encontrado en toda la página ningún control de pausa/);
  assert.equal(f[0].nodes.length, 1);
});

test("2.2.2 observado: con un candidato a control de pausa es revisar, y se nombra", () => {
  const f = analyzeAutoMovement(obs([mov("div.slide", 6, 1200, 7400)], [{ loc: "button#pausa", motivo: "Pausar el carrusel" }]));
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid.join(" "), /button#pausa: «Pausar el carrusel»/);
});

test("2.2.2 observado: «dura más de cinco segundos» es que siga moviéndose al final, no la distancia entre cambios", () => {
  /* Lo escribí como la distancia entre el primer y el último cambio y la sonda lo
   * cazó: un carrusel de 1,2 s por diapositiva observado 7 s tiene su primer cambio
   * en el 1,2 y el último en el 6,0 —4,8 s— y salía como «no llega al umbral». No es
   * que no llegara: es que se acabó la ventana. */
  const f = analyzeAutoMovement(obs([mov("div.slide", 5, 1200, 6000)], [], 7000));
  assert.equal(f[0].verdict, "falla", JSON.stringify(f[0] && f[0].evid));
  assert.match(f[0].evid.join(" "), /se mantiene más de cinco segundos/);
});

test("2.2.2 observado: lo que se mueve y PARA antes del final se deja a revisar, no a falla", () => {
  const f = analyzeAutoMovement(obs([mov("p#p", 7, 700, 4900)], [], 8000));
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid.join(" "), /NO llega al umbral de cinco segundos/);
});

test("2.2.2 observado: haber mirado y no ver nada se DICE, con los segundos y lo que queda fuera", () => {
  /* Devolver lista vacía hacía que «he mirado ocho segundos y la página está quieta»
   * y «no he mirado» quedaran idénticos en el informe. Medido contra un sitio real:
   * 2.2.2 salió «sin determinar» en las diez páginas y lo único escrito era un icono
   * con `fadeInDown` que vio la capa de CSS — sin forma de saber si la observación
   * había corrido. */
  const f = analyzeAutoMovement(obs([], [], 8000));
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "cumple-parcial", "nunca `cumple`: solo se miraron esos segundos");
  assert.equal(esConforme(f[0].verdict), false);
  assert.match(f[0].evid[0], /Observada la página 8\.0 s SIN tocar nada/);
  assert.match(f[0].evid[1], /dentro de un marco o un vídeo/);
  assert.match(f[0].evid[1], /canvas/);
});

test("2.2.2 observado: si la observación NO corrió o falló, no se dice nada", () => {
  // Aquí sí: no hay nada que contar, y un `cumple-parcial` sería afirmar que se miró.
  assert.deepEqual(analyzeAutoMovement({ error: "no se pudo observar", movidos: [] }), []);
  assert.deepEqual(analyzeAutoMovement(null), []);
  assert.deepEqual(analyzeAutoMovement({ ms: 0 }), []);
});

/* ── 2.1.4 a partir de lo pulsado, no de lo que haya en el marcado ───────── */

/**
 * El detector del ámbito de página solo ve los manejadores en línea, y hoy nadie los
 * escribe así: un `addEventListener` dentro de un bundle no está en el marcado, así
 * que 2.1.4 salía SIN EVALUAR. Medido contra un sitio real: era uno de los siete
 * criterios que no miraba ninguna capa, ni para bien ni para mal.
 */
test("2.1.4 pulsado: una tecla suelta que actúa con el foco en el cuerpo queda a revisar", () => {
  const f = analyzeCharKeyShortcuts({ probadas: ["/", "s", "f"], activas: [{ tecla: "s", cambios: ["mueve el foco a «input#q»", "cambia qué se ve (+3 elemento(s) visibles)"] }] });
  assert.equal(f.length, 1);
  assert.equal(f[0].c.n, "2.1.4");
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /«s» mueve el foco a «input#q»/);
  // Lo que se puede concluir, y solo eso: una de las tres salidas del criterio.
  assert.match(f[0].evid[1], /no está limitado al foco de un control/);
  assert.match(f[0].evid[1], /se pueda desactivar o reasignar/);
  assert.equal(f[0].nodes.length, 1);
});

test("2.1.4 pulsado: sin ninguna tecla activa es cumple-parcial, nunca cumple", () => {
  /* `cumple` sería afirmar que no hay atajos de un carácter habiendo probado diez
   * teclas de las que hay. `cumple-parcial` dice la verdad: lo probado está bien y el
   * resto no se ha mirado — y `esConforme()` ya lo excluye de la conformidad. */
  const f = analyzeCharKeyShortcuts({ probadas: ["/", "?", "s"], activas: [] });
  assert.equal(f[0].verdict, "cumple-parcial");
  assert.equal(esConforme(f[0].verdict), false);
  assert.match(f[0].evid[0], /no todas/);
  assert.match(f[0].evid[0], /no cierra el criterio por sí solo/);
});

test("2.1.4 pulsado: si la fase no corrió, no se dice nada", () => {
  assert.deepEqual(analyzeCharKeyShortcuts(null), []);
  assert.deepEqual(analyzeCharKeyShortcuts({ probadas: [], activas: [] }), []);
});

/* ── 4.1.3 fuera del formulario: el texto que aparece al interactuar ─────── */

/**
 * 4.1.3 ya se dictaminaba para UN caso —el error de formulario, con el envío forzado
 * y la comparación de las regiones live—, y en un sitio sin formularios con error eso
 * no emite nada. Medido contra un sitio real: 4.1.3 fue uno de los siete criterios de
 * los que no se dijo ni una palabra.
 */
const ev = (o) => Object.assign({ locator: "button#b", name: "Filtros", textos: ["3 resultados encontrados"], uids: ["html > body > p"], liveCambio: false, focoDentro: false, regiones: 0 }, o);

test("4.1.3: texto que aparece sin región live y sin mover el foco queda a revisar", () => {
  const f = analyzeStatusMessages([ev({})]);
  assert.equal(f.length, 1);
  assert.equal(f[0].c.n, "4.1.3");
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /«3 resultados encontrados»/);
  assert.match(f[0].evid[1], /role="status"/);
  assert.match(f[0].evid[1], /NINGUNA región de estado declarada/, "y si no hay ni una, se dice");
  assert.equal(f[0].nodes[0].path, "html > body > p", "con selector, para poder ir a buscarlo");
});

test("4.1.3: si el cambio pasó por una región live, se cuenta como anunciado", () => {
  const f = analyzeStatusMessages([ev({ liveCambio: true, regiones: 1 })]);
  assert.equal(f[0].verdict, "cumple-parcial");
  assert.equal(esConforme(f[0].verdict), false);
  assert.match(f[0].evid[0], /ninguno queda sin anunciar/);
  assert.match(f[0].evid[1], /lector de pantalla/);
});

test("4.1.3: si el foco se movió hasta el texto nuevo, tampoco es un mensaje desatendido", () => {
  const f = analyzeStatusMessages([ev({ focoDentro: true })]);
  assert.equal(f[0].verdict, "cumple-parcial");
});

test("4.1.3: no haber tenido nada que pulsar se DICE, con el censo de regiones live", () => {
  /* Es la tercera vez que aparece el mismo defecto —antes en 2.2.2, y dejando 1.2.1 y
   * 1.2.3 en blanco—, y aquí se vio medido: la página de vídeos del sitio real no
   * tiene NI UN `[aria-expanded]`, así que la fase no pulsó nada, no hubo candidatos,
   * y 4.1.3 salió en blanco. Blanco no es «comprobado». */
  const f = analyzeStatusMessages([], { expandibles: 0, regiones: 0 });
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid[0], /no encontró controles expandibles que pulsar/);
  assert.match(f[0].evid[1], /NO declara ninguna región de estado/);

  const conRegion = analyzeStatusMessages([], { expandibles: 0, regiones: 2 });
  assert.match(conRegion[0].evid[1], /declara 2 región\(es\) de estado/);
});

test("4.1.3: haber pulsado y no encontrar nada es cumple-parcial, no silencio", () => {
  const f = analyzeStatusMessages([], { expandibles: 3, regiones: 1 });
  assert.equal(f[0].verdict, "cumple-parcial");
  assert.equal(esConforme(f[0].verdict), false);
  assert.match(f[0].evid[0], /Se pulsaron 3 control/);
  assert.match(f[0].evid[1], /al filtrar, buscar, enviar un formulario o navegar/);
});

test("4.1.3: sin censo —la fase no corrió— no se dice nada", () => {
  // Aquí el silencio sí es correcto: ni se pulsó ni se contó, así que no hay nada
  // que afirmar sobre el criterio.
  assert.deepEqual(analyzeStatusMessages([]), []);
  assert.deepEqual(analyzeStatusMessages(null), []);
  assert.deepEqual(analyzeStatusMessages([], { expandibles: null, regiones: null }), []);
});

/* ── 3.3.1: un campo OBLIGATORIO no es un campo en error (v0.37.0) ─────────── */
test("un obligatorio correctamente rellenado no inventa una barrera de 3.3.1", () => {
  // Esto emitía `falla` grave («1 campo con error sin descripción») sobre un
  // formulario conforme: el analizador usaba `required` como sustituto de
  // «habrá fallado la validación», y en cuanto el campo está relleno es falso.
  const r = analyzeErrorState({
    submitted: true, hasAlert: true, liveCambio: true,
    fields: [{ locator: "input#n", required: true, invalid: false, nativoInvalido: false, vacio: false }]
  });
  const v = r.filter((f) => f.c.n === "3.3.1").map((f) => f.verdict);
  assert.ok(!v.includes("falla"), JSON.stringify(r.map((f) => f.c.n + "=" + f.verdict)));
  // Y tampoco se calla: el envío no disparó ninguna validación, y eso se dice.
  assert.deepEqual(v, ["revisar"]);
  assert.match(r.find((f) => f.c.n === "3.3.1").evid[0], /NINGÚN campo quedó en error/);
  // Ni se le reclama `aria-invalid` a un campo que no tiene error que exponer.
  assert.ok(!r.some((f) => f.c.n === "4.1.2" && /aria-invalid/.test(f.evid[0])));
});

test("el error de verdad sigue siendo una barrera, venga del navegador o de ARIA", () => {
  const casos = [
    { locator: "i#a", required: true, invalid: false, nativoInvalido: true, vacio: true },   // obligatorio vacío
    { locator: "i#c", required: false, invalid: false, nativoInvalido: true, vacio: false }, // correo mal escrito
    { locator: "i#d", required: false, invalid: true, nativoInvalido: false, vacio: false }, // aria-invalid
  ];
  casos.forEach((f) => {
    const r = analyzeErrorState({ submitted: true, hasAlert: true, liveCambio: true, fields: [f] });
    assert.ok(r.some((x) => x.c.n === "3.3.1" && x.verdict === "falla"), JSON.stringify(f));
  });
});

test("una traza sin validez nativa conserva la inferencia por obligatorio vacío", () => {
  // La extensión y las trazas antiguas no traen `nativoInvalido`: ahí un
  // obligatorio tras un envío ha fallado seguro, y la inferencia es correcta.
  const r = analyzeErrorState({ submitted: true, hasAlert: true, liveCambio: true,
    fields: [{ locator: "i#a", required: true, invalid: false }] });
  assert.ok(r.some((x) => x.c.n === "3.3.1" && x.verdict === "falla"));
});

/* ── 3.2.1 / 3.2.2: las dos causas duras que no se contaban ──────────────────
 *
 * `analyzeContextChange` solo miraba `navego`, y eso dejaba fuera dos fallos
 * con nombre propio: abrir una ventana (F52) y soltar el foco nada más
 * recibirlo (F55). Medido sobre una página con los cuatro casos escritos en
 * los atributos, la capa emitía «se han probado 9 control(es) y ninguno
 * provoca navegación, salto de foco ni sustitución de contenido» —es decir,
 * `pasa`— en una página que falla 3.2.1 dos veces.
 */
const ctxTodo = (e) => analyzeContextChange(e, 0, { total: e.length, sondados: e.length });
const unCrit = (fs, n, v) => fs.find((f) => f.c.n === n && f.verdict === v);

test("3.2.1: abrir una ventana al enfocar es barrera, aunque la URL no cambie", () => {
  const fs = ctxTodo([{ locator: "input#fecha", uid: "u1", disparador: "foco", navego: false, abrioVentana: true, focoQuitado: false, focoMovido: false, contenidoCambio: false }]);
  const f = unCrit(fs, "3.2.1", "falla");
  assert.ok(f, JSON.stringify(fs.map((x) => [x.c.n, x.verdict])));
  assert.match(f.evid[0], /ABRE UNA VENTANA/);
  assert.match(f.evid[0], /F52/);
});

test("3.2.1: recibir el foco y soltarlo es barrera (F55)", () => {
  const f = unCrit(ctxTodo([{ locator: "input#codigo", uid: "u2", disparador: "foco", navego: false, abrioVentana: false, focoQuitado: true, focoMovido: false, contenidoCambio: false }]), "3.2.1", "falla");
  assert.ok(f);
  assert.match(f.evid[0], /SUELTA/);
  assert.match(f.evid[0], /F55/);
});

test("3.2.2: cambiar el valor y navegar sigue siendo F37", () => {
  const f = unCrit(ctxTodo([{ locator: "select#prov", uid: "u3", disparador: "entrada", navego: true, abrioVentana: false, focoMovido: false, contenidoCambio: false }]), "3.2.2", "falla");
  assert.ok(f);
  assert.match(f.evid[0], /NAVEGA/);
  assert.match(f.evid[0], /F37/);
});

test("3.2.x: lo que cambia sin ser ninguna de las tres cosas sigue siendo sospecha", () => {
  const fs = ctxTodo([{ locator: "input#x", uid: "u4", disparador: "foco", navego: false, abrioVentana: false, focoQuitado: false, focoMovido: false, contenidoCambio: true }]);
  assert.ok(unCrit(fs, "3.2.1", "revisar"), "un cambio de contenido admite aviso previo: revisar");
});

test("3.2.x: sin nada que reprochar y con todo sondado, `pasa`; si falta algo, `cumple-parcial`", () => {
  const limpio = [{ locator: "input#x", uid: "u5", disparador: "foco", navego: false, abrioVentana: false, focoQuitado: false, focoMovido: false, contenidoCambio: false }];
  assert.ok(unCrit(analyzeContextChange(limpio, 0, { total: 1, sondados: 1 }), "3.2.1", "pasa"));
  // Un control que no se pudo sondar baja el veredicto: no se declara conforme
  // lo que no se ha mirado.
  assert.ok(unCrit(analyzeContextChange(limpio, 1, { total: 2, sondados: 2 }), "3.2.1", "cumple-parcial"));
});
