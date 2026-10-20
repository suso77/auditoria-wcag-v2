import { test } from "node:test";
import assert from "node:assert/strict";
import { seleccionarMuestra } from "../src/sampling.js";
import { axeFindingsNuevos, criteriosEnSilencio, capasEfectivas, notaDeCapaApagada, lineasDeCobertura } from "../src/audit-run.js";
import { readFileSync } from "node:fs";
import { WCAG22, understand, analyze, capaQueMide } from "../src/engine.js";
import "./helpers.mjs"; // inyecta el DOMParser
import { esConforme } from "../src/verdicts.js";

const viol = (id, sc, impact, targets) => ({
  id, impact, help: "Ayuda de " + id, tags: ["wcag2a", "wcag" + sc.replace(/\./g, "")],
  nodes: (targets || ["div"]).map((t) => ({ target: [t] }))
});

test("axe aporta al informe lo que el motor NO ha visto", () => {
  const out = axeFindingsNuevos([viol("image-alt", "111", "critical", ["img.logo"])], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].c.n, "1.1.1");
  assert.equal(out[0].verdict, "falla");
  assert.equal(out[0].sev, "crítica");
  assert.equal(out[0].origen, "axe-core");
  // `path` viaja vacío cuando axe no trae ruta resuelta: el selector de axe no se
  // inventa como si fuera la ruta canónica del motor.
  assert.deepEqual(out[0].nodes, [{ locator: "img.logo", name: "image-alt", path: "" }]);
  assert.match(out[0].evid[0], /axe-core «image-alt»/);
});

test("regresión: no duplica el mismo ELEMENTO que el motor ya reporta", () => {
  // Antes axe se ejecutaba y sus hallazgos NO llegaban a findings; luego llegaban
  // pero se descartaba el CRITERIO entero si el motor ya fallaba en él, así que
  // veinticinco imágenes sin alt vistas por axe se perdían porque el motor había
  // visto una. Lo que se repite es el elemento, no el criterio.
  const v = viol("image-alt", "111", "critical");
  const mismo = axeFindingsNuevos([v], { "1.1.1": (v.nodes || []).map((n) => n.target.join(" ")) });
  assert.deepEqual(mismo, [], "el mismo elemento no se duplica");
  const otro = axeFindingsNuevos([v], { "1.1.1": ["img.otra-cosa"] });
  assert.equal(otro.length, 1, "un elemento que el motor no vio SÍ tiene que entrar");
  assert.match(otro[0].evid.join(" "), /ya los había detectado el motor|axe-core/);
});

test("regresión: axe no trunca las instancias a 10", () => {
  // `num_barreras` del Seguimiento sale de `nodes.length`: truncar aquí hacía que
  // la hoja de Seguimiento mintiera de forma coherente, y por tanto indetectable.
  const muchos = { id: "image-alt", impact: "critical", tags: ["wcag2a", "wcag111"], help: "h",
    nodes: Array.from({ length: 25 }, (_, i) => ({ target: ["img.foto-" + i] })) };
  assert.equal(axeFindingsNuevos([muchos], {})[0].nodes.length, 25);
});

test("la gravedad de axe se traduce a la del agente, quedándose con la peor", () => {
  assert.equal(axeFindingsNuevos([viol("x", "111", "serious")], [])[0].sev, "grave");
  assert.equal(axeFindingsNuevos([viol("x", "111", "minor")], [])[0].sev, "leve", "minor no escala");
  // Varias reglas en el mismo criterio: manda la más grave, no la última leída.
  assert.equal(axeFindingsNuevos([viol("a", "111", "minor"), viol("b", "111", "critical"), viol("c", "111", "moderate")], [])[0].sev, "crítica");
});

test("los hallazgos de axe llevan cláusula EN y nivel, como el resto", () => {
  const f = axeFindingsNuevos([viol("image-alt", "111", "critical")], [])[0];
  assert.equal(f.en, "9.1.1.1");
  assert.equal(f.c.lvl, "A");
  assert.equal(f.c.t, "Contenido no textual");
});

test("una violación sin criterio WCAG mapeable no inventa un criterio", () => {
  const sinTag = { id: "region", impact: "moderate", tags: ["best-practice"], nodes: [{ target: ["body"] }] };
  assert.deepEqual(axeFindingsNuevos([sinTag], []), []);
});

test("sin violaciones no hay hallazgos", () => {
  assert.deepEqual(axeFindingsNuevos([], []), []);
  assert.deepEqual(axeFindingsNuevos(null, null), []);
});

/* ── Resistencia y reconciliación ────────────────────────────────────────── */

test("regresión: la muestra se ordena antes de elegir, así la semilla basta", () => {
  // La semilla garantiza la misma permutación, pero sobre la misma lista de
  // entrada: si las candidatas llegaban en otro orden —otro rastreo, otra
  // concurrencia— la muestra «reproducible» salía distinta con la misma semilla.
  const c = [];
  for (let i = 0; i < 20; i++) c.push({ url: "https://x.es/p" + i, ruta: "/p" + i, plantilla: "art" + (i % 5) });
  const urls = (sel) => sel.muestra.map((p) => p.url).join(",");
  const A = seleccionarMuestra(c, { semilla: "S", max: 8 });
  const B = seleccionarMuestra(c.slice().reverse(), { semilla: "S", max: 8 });
  assert.equal(urls(A), urls(B), "el orden de entrada no puede cambiar la muestra");
  assert.notEqual(urls(A), urls(seleccionarMuestra(c, { semilla: "T", max: 8 })), "otra semilla sí");
});

/* ── Regresión: cruzar motor y axe por ELEMENTO, no por cadena ──────────────
 *
 * El motor nombra un elemento con su ruta canónica
 * (`html > body > main:nth-of-type(1) > img:nth-of-type(1)`) y axe con su propio
 * selector mínimo (`img[src="a.png"]`, `a`, `.btn > span`). Son dos maneras de
 * nombrar el MISMO elemento, y la deduplicación comparaba las cadenas: no casaba
 * nunca. Resultado: la misma imagen sin alt salía dos veces en el IRA —una fila
 * por fuente— y `num_barreras` iba al doble. La ruta la resuelve
 * `render-analyze.js` con la página abierta y viaja en `__path`.
 */
test("regresión: axe no duplica un elemento que el motor ya vio, aunque lo nombre distinto", () => {
  const RUTA = "html > body > main:nth-of-type(1) > img:nth-of-type(1)";
  const v = {
    id: "image-alt", impact: "critical", help: "h", tags: ["wcag2a", "wcag111"],
    // Lo que axe devuelve de verdad: su selector, más la ruta ya resuelta.
    nodes: [{ target: ['img[src="a.png"]'], __path: RUTA }]
  };
  // El motor apunta la RUTA (así lo hace ahora `auditRun`).
  assert.deepEqual(axeFindingsNuevos([v], { "1.1.1": [RUTA] }), [],
    "mismo elemento, dos nombres: una sola fila");
  // Y si de verdad es otro elemento, entra.
  const otro = axeFindingsNuevos([v], { "1.1.1": ["html > body > main:nth-of-type(1) > img:nth-of-type(2)"] });
  assert.equal(otro.length, 1);
  assert.equal(otro[0].nodes[0].path, RUTA, "la ruta llega al informe: la columna Selector la necesita");
  assert.match(otro[0].evid.join(" "), /axe-core «image-alt»/);
});

test("regresión: no se dice «ya los había detectado el motor» cuando el motor no vio nada", () => {
  // Dos reglas de axe sobre el mismo elemento y el mismo criterio. Hay que
  // quedarse con una fila, sí, pero eso no lo detectó el motor: la frase era una
  // evidencia falsa escrita por nosotros en un entregable con efectos legales.
  const mismas = [
    { id: "image-alt",     impact: "critical", help: "A", tags: ["wcag2a", "wcag111"], nodes: [{ target: ["main > img"] }] },
    { id: "role-img-alt",  impact: "serious",  help: "B", tags: ["wcag2a", "wcag111"], nodes: [{ target: ["main > img"] }] }
  ];
  const out = axeFindingsNuevos(mismas, {});
  assert.equal(out.length, 1);
  assert.equal(out[0].nodes.length, 1, "un elemento, una fila");
  assert.ok(!out[0].evid.some((e) => /ya los había detectado el motor/.test(e)),
    "el motor no vio nada: no se puede decir que lo viera");
  assert.match(out[0].evid.join(" "), /image-alt/);
  assert.match(out[0].evid.join(" "), /role-img-alt/, "las dos reglas se siguen citando");

  // Y cuando el motor SÍ lo vio, la frase vuelve, porque entonces es verdad.
  const conMotor = axeFindingsNuevos(
    [{ id: "image-alt", impact: "critical", help: "A", tags: ["wcag2a", "wcag111"],
       nodes: [{ target: ["main > img"] }, { target: ["main > img.otra"] }] }],
    { "1.1.1": ["main > img"] }
  );
  assert.match(conMotor[0].evid.join(" "), /1 elemento\(s\) ya los había detectado el motor/);
});

test("el target de axe se acepta como lista o como cadena", () => {
  const comoCadena = { id: "image-alt", impact: "critical", help: "h", tags: ["wcag2a", "wcag111"],
    nodes: [{ target: "main > img" }] };
  assert.equal(axeFindingsNuevos([comoCadena], {})[0].nodes[0].locator, "main > img");
});

/* ── El barrido de los criterios que nadie nombró ──
 *
 * Un criterio del que ninguna capa habla no aparecía en el informe, y en la
 * plantilla del IRA eso se imprime «No evaluado» o se queda en blanco sin que
 * nadie haya dicho que no se miró. Medido: con las capas por defecto once
 * criterios salían sin una frase, y con `render: false`, cuarenta y nueve.
 */

test("ningún criterio se queda sin una frase, ni con todas las capas apagadas", () => {
  const apagadas = { render: false, viewport: false, dynamic: false, pixeles: false, axe: false, huella: false };
  const out = criteriosEnSilencio([], apagadas, { sitio: true });
  assert.equal(out.length, WCAG22.length, "los 55 tienen que salir nombrados");
  assert.ok(out.every((f) => f.verdict === "revisar"), "y todos como «revisar»");
  assert.ok(out.every((f) => !esConforme(f.verdict)), "«revisar» no es conforme: no puede exportarse como cumplido");
  assert.ok(out.every((f) => f.evid.join(" ").length > 40), "cada uno con su explicación");
});

test("el barrido NO pisa a quien ya habló", () => {
  const yaDicho = [{ c: { n: "1.1.1", t: "x", lvl: "A" }, verdict: "falla", sev: "grave", evid: ["una barrera real"] }];
  const out = criteriosEnSilencio(yaDicho, capasEfectivas(), { sitio: true });
  assert.ok(!out.some((f) => f.c.n === "1.1.1"), "1.1.1 ya tenía veredicto");
  assert.ok(out.length === WCAG22.length - 1);
});

test("distingue «la capa no se ejecutó» de «se ejecutó y no dijo nada»", () => {
  // 4.1.3 lo mide la capa dinámica, que viene APAGADA por defecto.
  const apagada = criteriosEnSilencio([], capasEfectivas(), { sitio: true }).find((f) => f.c.n === "4.1.3");
  assert.match(apagada.evid.join(" "), /no se ha ejecutado/, apagada.evid.join(" "));
  assert.match(apagada.evid.join(" "), /dinámico/);
  const encendida = criteriosEnSilencio([], capasEfectivas({ dynamic: true }), { sitio: true }).find((f) => f.c.n === "4.1.3");
  assert.match(encendida.evid.join(" "), /sí se ha ejecutado y no ha dicho nada/, encendida.evid.join(" "));
  assert.match(encendida.evid.join(" "), /el agente no lo afirma/);
});

test("una página sola no dictamina los criterios de sitio: los deja para la muestra", () => {
  const dePagina = criteriosEnSilencio([], capasEfectivas(), { sitio: false }).map((f) => f.c.n);
  ["2.4.5", "3.2.3", "3.2.4", "3.2.6"].forEach((n) => {
    assert.ok(!dePagina.includes(n), n + " lo decide auditSite cruzando la muestra, no una página");
  });
  const deSitio = criteriosEnSilencio([], capasEfectivas(), { sitio: true }).map((f) => f.c.n);
  ["2.4.5", "3.2.3", "3.2.4", "3.2.6"].forEach((n) => assert.ok(deSitio.includes(n), n + " sí se barre en el sitio"));
});

test("capasEfectivas pone los valores por defecto, y la dinámica no se enciende sola", () => {
  // El barrido de sitio leía `opts.capas` en crudo: con las opciones por defecto
  // —el caso normal— creía que ninguna capa se había ejecutado y lo decía.
  const d = capasEfectivas();
  assert.equal(d.render, true);
  assert.equal(d.dynamic, false, "la capa dinámica pulsa y envía: sigue siendo opt-in");
  assert.equal(capasEfectivas({ dynamic: true }).dynamic, true);
  assert.equal(capasEfectivas({ render: false }).render, false);
});

/* ── El relleno del motor, retirado cuando la capa sí habló ──
 *
 * El motor, que solo lee el marcado, deja un `revisar`/`humano` por criterio
 * diciendo «lo mide la capa de X». Cuando esa capa corre y dictamina, ese
 * relleno no aporta nada y sí estorba: el rollup se queda con el PEOR veredicto
 * del criterio, así que un `revisar` de relleno dejaba pendiente un criterio que
 * la capa había medido. Medido sobre el sitio de prueba con la capa dinámica
 * encendida: 2.1.2 salía 15 `revisar` de relleno conviviendo con 15
 * `cumple-parcial` de la capa, y el criterio se quedaba en `revisar`.
 */

test("el motor no afirma que una capa «no ha corrido»: no puede saberlo", () => {
  // La frase vieja —«lo mide la capa de dinámico, que en esta ejecución no ha
  // corrido»— salía en auditorías donde esa capa SÍ había corrido. El motor
  // analiza el marcado; no lanza las capas ni sabe cuáles lanzará la orquestación.
  const a = analyze(understand('<div role="button" tabindex="0">x</div>'));
  const textos = a.findings.flatMap((f) => f.evid || []).join(" ");
  assert.ok(!/en esta ejecución no ha corrido/.test(textos), "esa afirmación no se puede sostener");
  assert.match(textos, /este análisis del marcado no ejecuta/);
});

test("el relleno del motor va marcado para poder retirarlo", () => {
  const a = analyze(understand('<div role="button" tabindex="0">x</div>'));
  const rellenos = a.findings.filter((f) => f.origen === "motor-sin-capa");
  assert.ok(rellenos.length, "tiene que haber relleno en los criterios que mide otra capa");
  rellenos.forEach((f) => {
    assert.ok(["revisar", "humano"].includes(f.verdict), f.c.n + " no puede ser relleno con veredicto " + f.verdict);
    assert.match(f.evid.join(" "), /lo mide la capa de/);
  });
  // Y lo que el motor sí dictamina no lleva esa marca.
  const propios = a.findings.filter((f) => ["cumple", "falla"].includes(f.verdict));
  propios.forEach((f) => assert.notEqual(f.origen, "motor-sin-capa"));
});

test("toda la prosa de CAPA_QUE_MIDE mapea a una capa conocida", () => {
  // El barrido traduce la prosa de esa tabla a las banderas de `capas`. Si
  // alguien añade un criterio con una prosa nueva que no mapee, el barrido diría
  // «ninguna capa lo mide aparte del motor» sobre un criterio que sí mide una
  // capa — y lo diría con toda la seguridad del mundo. Este test es el guardia.
  const PALABRAS = ["píxeles", "adaptación", "dinámico", "coherencia", "medición", "página"];
  const huerfanos = WCAG22
    .map((c) => ({ n: c.n, prosa: capaQueMide(c.n) }))
    .filter((x) => x.prosa && !PALABRAS.some((p) => x.prosa.indexOf(p) !== -1));
  assert.deepEqual(huerfanos, [], "prosa que el barrido no sabe traducir");
});

/* ── La sonda que no se ejecutó, dicha también cuando hay veredicto (v0.67.0) ──
 *
 * `criteriosEnSilencio` ya lo decía, pero solo para los criterios sin NI UN
 * hallazgo. Un criterio con el hallazgo genérico del motor —«requiere evaluación
 * humana»— se escapaba, y el informe no decía nunca que la sonda no corrió.
 *
 * Medido sobre el banco del sitio limpio: 25 de 55 criterios salieron «No se
 * puede comprobar (revisión manual)», y entre ellos 2.1.1, 2.1.4, 2.2.2, 3.3.1,
 * 3.3.2, 3.3.3 y 4.1.3 — los que mide la capa dinámica, apagada en esa pasada.
 * Leyendo el informe no había forma de distinguir «esto necesita una persona» de
 * «no corrí la sonda que lo mide».
 */
test("capa apagada: el criterio con veredicto también lo dice", () => {
  const f = [{ c: { n: "3.3.1" }, verdict: "humano", evid: ["Requiere evaluación humana."] }];
  const tocados = notaDeCapaApagada(f, capasEfectivas({ dynamic: false }), { sitio: false });
  assert.deepEqual(tocados, ["3.3.1"]);
  assert.match(f[0].evid.join(" "), /LA SONDA QUE MIDE ESTE CRITERIO NO SE EJECUTÓ/);
  assert.match(f[0].evid.join(" "), /No es lo mismo que «necesita una persona»/);
  // La evidencia que ya había no se pierde.
  assert.match(f[0].evid[0], /Requiere evaluación humana/);
});

test("capa apagada: una conformidad firmada con la sonda apagada baja a revisar", () => {
  /* La regla de oro aplicada a la configuración del propio agente: si no se ha
   * medido, no puede leerse como medido. */
  const f = [{ c: { n: "3.3.1" }, verdict: "cumple", evid: ["Correcto."] }];
  notaDeCapaApagada(f, capasEfectivas({ dynamic: false }), { sitio: false });
  assert.equal(f[0].verdict, "revisar");
  assert.match(f[0].evid.join(" "), /NO SE EJECUTÓ/);
});

test("capa apagada: si la sonda SÍ corrió, no se toca nada", () => {
  const f = [{ c: { n: "3.3.1" }, verdict: "cumple", evid: ["Correcto."] }];
  const tocados = notaDeCapaApagada(f, capasEfectivas({ dynamic: true }), { sitio: false });
  assert.deepEqual(tocados, []);
  assert.equal(f[0].verdict, "cumple");
  assert.equal(f[0].evid.length, 1);
});

test("capa apagada: un criterio que solo mide el motor no lleva la nota", () => {
  /* 1.1.1 lo dictamina el motor desde el marcado: que la capa dinámica esté
   * apagada no dice nada de él, y meterle la nota sería ruido. */
  const f = [{ c: { n: "1.1.1" }, verdict: "falla", evid: ["Imagen sin alternativa."] }];
  const tocados = notaDeCapaApagada(f, capasEfectivas({ dynamic: false, render: false, viewport: false, pixeles: false }), { sitio: false });
  assert.ok(!tocados.includes("1.1.1"), JSON.stringify(tocados));
});

/* ── El hueco de la muestra tiene que salir en la SALIDA, no solo en el objeto ──
 *
 * Medido con una muestra de 4 páginas y una caída: `auditSite` producía
 * `paginasFallidas`, el aviso «ATENCIÓN: 1 de 4…» y `rollup.sinAnalizar`, y
 * `seguimiento.csv` llevaba «3 de 4 página(s) analizadas» en cada fila. Pero
 * `examples/auditar-sitio.mjs` —el script que hace los entregables— imprimía
 * solo «NO CONFORME / 3 criterios fallan · 46 sin determinar · 6 conformes»,
 * sin una palabra del hueco, porque `rollup.conformidad` únicamente dice
 * «Incompleta» cuando no falla nada. */

test("cobertura: una muestra completa no genera ninguna línea", () => {
  assert.deepEqual(lineasDeCobertura({ rollup: { paginas: 3, paginasAnalizadas: 3, sinAnalizar: [] }, paginasFallidas: [] }), []);
});

test("cobertura: con un hueco lo dice con las dos cifras y la url", () => {
  const l = lineasDeCobertura({
    rollup: { paginas: 4, paginasAnalizadas: 3, sinAnalizar: [{ url: "https://x/c", error: "ERR_CONNECTION_REFUSED" }] },
    paginasFallidas: [{ url: "https://x/c", error: "ERR_CONNECTION_REFUSED" }]
  });
  assert.ok(l.length >= 2, JSON.stringify(l));
  assert.match(l[0], /INCOMPLETA/);
  assert.match(l[0], /3 de 4/);
  // Y lo que importa: que un criterio sin barreras no se lea como comprobado.
  assert.match(l[0], /no está comprobado/i);
  assert.match(l.join(" "), /https:\/\/x\/c/);
  assert.match(l.join(" "), /ERR_CONNECTION_REFUSED/);
});

test("cobertura: sirve con solo rollup.sinAnalizar, sin paginasFallidas", () => {
  /* Fail-safe: si quien llama trae el rollup pero no la lista de fallidas, la
   * cobertura se calcula igual. Lo contrario —callarse por falta de un campo—
   * es justo el defecto que esto arregla. */
  const l = lineasDeCobertura({ rollup: { paginas: 8, paginasAnalizadas: 6, sinAnalizar: [{ url: "a" }, { url: "b" }] } });
  assert.match(l[0], /6 de 8/);
});

test("cobertura: con muchas caídas no vuelca las 50, pero dice cuántas quedan", () => {
  const caidas = Array.from({ length: 14 }, (_, i) => ({ url: "https://x/" + i, error: "timeout" }));
  const l = lineasDeCobertura({ rollup: { paginas: 20, paginasAnalizadas: 6, sinAnalizar: caidas }, paginasFallidas: caidas });
  assert.match(l[0], /6 de 20/);
  assert.match(l[l.length - 1], /y 4 más/);
});

test("cobertura: el script de los entregables la imprime Y la escribe en el json", () => {
  /* Este test existe porque el defecto no estaba en el motor sino en el script,
   * y un motor correcto con un script callado produce un entregable que afirma
   * una cobertura que no hubo. Sus hermanos (`auditar-muestra.mjs`,
   * `regresion-sitio.mjs`) ya lo imprimían: el de los entregables era el único
   * que no. Si alguien vuelve a quitarlo, esto se pone rojo. */
  const src = readFileSync(new URL("../examples/auditar-sitio.mjs", import.meta.url), "utf8");
  assert.match(src, /lineasDeCobertura/, "el script tiene que llamar a lineasDeCobertura");
  assert.ok(src.indexOf("lineasDeCobertura(sitio)") < src.indexOf("rollup.conformidad.toUpperCase"),
    "la cobertura va ANTES de la conformidad: cambia cómo hay que leer lo que sigue");
  assert.match(src, /paginasFallidas: sitio\.paginasFallidas/, "auditoria.json tiene que llevar las páginas caídas");
  assert.match(src, /avisos: sitio\.avisos/, "y los avisos del sitio");
});
