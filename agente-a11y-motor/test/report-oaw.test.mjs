import { test } from "node:test";
import assert from "node:assert/strict";
import { oawExport, barreras, barrerasAgrupadas, seguimiento, motivoPendiente, loComprobado, formaDeEvidencia, esqueletoSelector } from "../src/index.js";

const F = (n, lvl, verdict, sev, nodes, evid) => ({ c: { n, lvl, t: n }, verdict, sev, nodes, evid });

test("barreras: mapea el criterio WCAG a subcriterio EN 9.X.Y.Z", () => {
  const rows = barreras([F("4.1.2", "A", "falla", "crítica", [{ locator: "button.icon" }], ["<b>sin nombre</b>"])], { url: "/home" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subcriterio, "9.4.1.2");
  assert.equal(rows[0].enEN, true);
  assert.equal(rows[0].criterio, "4.1.2");
  assert.equal(rows[0].gravedad, "Crítica");
  assert.equal(rows[0].pagina, "/home");
  assert.equal(rows[0].elemento, "button.icon");
  assert.equal(rows[0].evidencia, "sin nombre"); // sin etiquetas HTML
});

test("barreras: un criterio nuevo de 2.2 (2.5.8) no está en la EN → enEN false", () => {
  const out = oawExport([F("2.5.8", "AA", "falla", "moderada", [], ["objetivo pequeño"])], { url: "/x" });
  assert.equal(out.barreras[0].enEN, false);
  assert.equal(out.barreras[0].subcriterio, "");
  assert.ok(out.fueraDeEN.includes("2.5.8"));
});

test("seguimiento: resultado agregado por subcriterio (peor veredicto)", () => {
  const rows = seguimiento([
    F("1.4.3", "AA", "cumple"), F("1.4.3", "AA", "falla"),
    F("2.4.1", "A", "revisar"),
    F("2.4.2", "A", "cumple")
  ]);
  const c143 = rows.find((r) => r.criterio === "1.4.3");
  const c241 = rows.find((r) => r.criterio === "2.4.1");
  const c242 = rows.find((r) => r.criterio === "2.4.2");
  assert.equal(c143.resultado, "Falla");
  assert.equal(c143.num_barreras, 1);
  assert.match(c241.resultado, /No se puede comprobar/);
  assert.equal(c242.resultado, "Correcto");
});

test("oawExport: CSV con BOM, separador ; y cabecera", () => {
  const out = oawExport([F("4.1.2", "A", "falla", "grave", [{ locator: "a" }], ["x"])], { url: "/" });
  assert.ok(out.csv.barreras.startsWith("﻿"));
  assert.match(out.csv.barreras.split("\r\n")[0], /Subcriterio EN.*;.*Criterio WCAG/);
  assert.match(out.csv.seguimiento, /9\.4\.1\.2/);
});

/* ── La hoja de Seguimiento declara su cobertura (v0.37.0) ──────────────────── */
test("con la muestra incompleta, nada se exporta como «Correcto»", () => {
  const f = (n, v) => ({ c: { n, lvl: "A", t: "x" }, verdict: v });
  const findings = [f("1.1.1", "cumple"), f("1.3.1", "falla"), f("2.4.4", "no-aplica")];
  const res = (m) => {
    const o = {};
    seguimiento(findings, { muestra: m }).forEach((r) => { o[r.criterio] = r.resultado; });
    return o;
  };
  const completa = res({ paginas: 10, paginasAnalizadas: 10, sinAnalizar: [] });
  assert.equal(completa["1.1.1"], "Correcto");

  // Con tres páginas sin analizar, ese «Correcto» es una afirmación que el
  // agente no puede sostener: se queda sin determinar, y con el motivo dentro.
  const parcial = res({ paginas: 10, paginasAnalizadas: 7, sinAnalizar: [1, 2, 3] });
  assert.match(parcial["1.1.1"], /No se puede comprobar \(muestra incompleta: 7 de 10/);
  // Lo que NO cambia: una barrera encontrada sigue siendo una barrera, y «no
  // aplica» habla de lo que hay en las páginas, no de cuántas se miraron.
  assert.equal(parcial["1.3.1"], "Falla");
  assert.equal(parcial["2.4.4"], "No aplica");
});

test("la cobertura de la muestra viaja en su propia columna del CSV", () => {
  const findings = [{ c: { n: "1.1.1", lvl: "A", t: "x" }, verdict: "cumple" }];
  const csv = oawExport(findings, { muestra: { paginas: 10, paginasAnalizadas: 7, sinAnalizar: [1, 2, 3] }, todosLosCriterios: false }).csv.seguimiento;
  assert.match(csv.split("\r\n")[0], /Cobertura de la muestra/);
  assert.match(csv, /7 de 10 página\(s\) analizadas/);
});

/* ── Cada fila con la evidencia de SU elemento (v0.38.0) ───────────────────── */
test("una barrera con varios elementos no reparte la evidencia de todos a cada fila", async () => {
  const { understand, analyze, setDOMParser } = await import("../src/engine.js");
  const { DOMParser } = await import("linkedom");
  setDOMParser(DOMParser);
  // Tres problemas distintos de 4.1.2 en tres elementos distintos.
  const { findings } = analyze(understand(
    '<div tabindex="0" onclick="abrir()">Abrir el panel</div>' +
    '<div role="slider" tabindex="0" aria-label="Volumen"></div>' +
    "<button></button>"
  ));
  const filas = barreras(findings).filter((r) => r.criterio === "4.1.2");
  assert.equal(filas.length, 3);

  const slider = filas.find((r) => /Volumen/.test(r.elemento));
  assert.match(slider.evidencia, /aria-valuenow/, "la fila del deslizador dice lo suyo");
  // Y NO arrastra lo de los otros dos, que es lo que pasaba: las tres filas
  // salían con la unión de los mensajes del criterio.
  assert.doesNotMatch(slider.evidencia, /Abrir el panel/);
  assert.doesNotMatch(slider.evidencia, /anunciaría solo como «button»/);

  const boton = filas.find((r) => r.elemento === "button");
  assert.match(boton.evidencia, /sin nombre accesible/);
  assert.doesNotMatch(boton.evidencia, /aria-valuenow/);
});

test("lo que no es de ningún elemento acompaña a todas las filas", async () => {
  const { understand, analyze, setDOMParser } = await import("../src/engine.js");
  const { DOMParser } = await import("linkedom");
  setDOMParser(DOMParser);
  // Una observación estructural (contenido enfocable dentro de un subárbol
  // oculto) no se le puede cargar a una fila concreta: va en todas.
  const { findings } = analyze(understand(
    '<div aria-hidden="true"><a href="/x">Oculto pero enfocable</a></div><button></button>'
  ));
  const filas = barreras(findings).filter((r) => r.criterio === "4.1.2");
  assert.ok(filas.length >= 1);
  assert.ok(filas.every((r) => /subárbol oculto/.test(r.evidencia)), JSON.stringify(filas.map((r) => r.evidencia.slice(0, 80))));
});

/**
 * 320 DE 522 FILAS LLEVABAN EL MISMO PÁRRAFO.
 *
 * Medido sobre una auditoría real de diez páginas. Y no era un error de
 * medición —son elementos distintos y la frase es verdad en todos—, sino que la
 * frase no los distingue: 63 enlaces `a.red-link` con el mismo color dan 63
 * veces «ratio 3.38:1 … rgb(231 30 15) sobre rgb(28 36 55)», y los 63 de axe,
 * 63 veces «Links must have discernible text». En el Word eso son 63 párrafos
 * iguales y quien lee uno no sabe cuál de los 63 elementos es el suyo.
 *
 * Intentar arreglarlo capa por capa fue un error: en la de adaptación quedaron
 * 18 filas igualmente, porque dos elementos pueden compartir `locator` y medida
 * («p» + «96 px de alto ocultos»). El sitio donde se resuelve de una vez es
 * aquí, donde nacen las filas.
 */
const hallazgo = (n, nodes, evid) => ({
  c: { n: n, t: n, lvl: "AA" }, verdict: "falla", sev: "grave", evid: [evid], nodes: nodes
});

test("barreras: elementos distintos con la MISMA medida se distinguen por su selector", () => {
  const nodes = [1, 2, 3].map((i) => ({
    locator: "a.red-link", path: "html > body > div:nth-of-type(" + i + ") > a:nth-of-type(1)"
  }));
  const rows = barreras([hallazgo("1.4.3", nodes,
    "a.red-link: ratio 3.38:1 (mín 4.5:1) — rgb(231 30 15) sobre rgb(28 36 55)")], { url: "https://x.test/" });
  assert.equal(rows.length, 3);
  const textos = rows.map((r) => r.evidencia);
  assert.equal(new Set(textos).size, 3, "las tres frases tienen que ser distintas: " + JSON.stringify(textos));
  textos.forEach((t) => {
    assert.match(t, /ratio 3\.38:1/, "sin perder la medida");
    assert.match(t, /de 3 con la misma medida/, "y diciendo que hay tres iguales");
    assert.match(t, /div:nth-of-type\(\d\)/, "con la ruta de SU elemento");
  });
});

test("barreras: si la columna «Elemento» ya distingue, el párrafo NO se toca", () => {
  /* Las filas de axe traen el dato que falta en el propio elemento
   * (`a[alt="…"]`), así que la fila se distingue sin tocar nada. Añadirle una
   * cola sería repetir una columna que el informe ya lleva. */
  const nodes = ["萨克拉河岸修道院之路", "塞维利亚两日游"].map((t, i) => ({
    locator: 'a[alt="' + t + '"]', name: "link-name", path: "html > body > a:nth-of-type(" + (i + 1) + ")"
  }));
  const rows = barreras([hallazgo("2.4.4", nodes, "axe-core «link-name»: Links must have discernible text")], { url: "https://x.test/" });
  assert.equal(rows.length, 2);
  rows.forEach((r) => assert.equal(r.evidencia, "axe-core «link-name»: Links must have discernible text",
    "intacta: " + r.evidencia));
  assert.notEqual(rows[0].elemento, rows[1].elemento, "porque el elemento ya las separa");
});

test("barreras: una sola fila no se adorna con nada", () => {
  const rows = barreras([hallazgo("1.1.1", [{ locator: "img", path: "html > body > img:nth-of-type(1)" }],
    "img: sin alternativa textual.")], { url: "https://x.test/" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].evidencia, "img: sin alternativa textual.");
});

test("barreras: sin selector ni elemento, al menos se numeran", () => {
  const rows = barreras([hallazgo("1.4.10", [{ locator: "div" }, { locator: "div" }],
    "2 bloques se recortan.")], { url: "https://x.test/" });
  assert.equal(new Set(rows.map((r) => r.evidencia)).size, 2);
  assert.match(rows[0].evidencia, /elemento 1 de 2/);
});

/**
 * UNA FILA POR FAMILIA, EN VEZ DE UNA POR ELEMENTO.
 *
 * Decisión suya con los números delante: en la auditoría real, 63 enlaces
 * `a.red-link` con el mismo color daban 63 filas con la misma medida, y otras 63
 * de axe con el mismo «Links must have discernible text». Son 63 instancias de
 * UNA barrera. Medido sobre esas 522 filas, agrupando quedan 202.
 *
 * Lo que estos tests vigilan es lo que no se puede perder al agrupar: los 63
 * elementos y sus 63 rutas. Fundirlos sin más borraría 62 datos que hacen falta
 * para arreglarlo.
 */
const familia = (n, nodes, evid) => ({
  c: { n: n, t: n, lvl: "AA" }, verdict: "falla", sev: "grave", evid: [evid], nodes: nodes
});

test("agrupadas: 63 elementos con la misma medida son UNA fila con 63 instancias", () => {
  const nodes = Array.from({ length: 63 }, (_, i) => ({
    locator: "a.red-link", path: "html > body > div:nth-of-type(" + (i + 1) + ") > a:nth-of-type(1)"
  }));
  const g = barrerasAgrupadas([familia("1.4.3", nodes, "a.red-link: ratio 3.38:1 — rgb(231 30 15) sobre rgb(28 36 55)")], { url: "https://x.test/a" });
  assert.equal(g.length, 1);
  assert.equal(g[0].instancias, 63);
  assert.equal(g[0].selectores.length, 63, "las 63 rutas, enteras, en el objeto");
  assert.match(g[0].evidencia, /63 elementos con esta misma medida/, "y el recuento en la evidencia, que es lo que leen el Word y el IRA");
  assert.match(g[0].evidencia, /ratio 3\.38:1/, "sin perder la medida");
});

test("agrupadas: los elementos distintos NO se pierden", () => {
  /* El grupo de axe: 63 enlaces, cada uno con su `alt`. Es el dato para
   * arreglarlo, así que tiene que seguir estando. */
  const nodes = ["萨克拉河岸修道院之路", "塞维利亚两日游", "马德里王宫"].map((t, i) => ({
    locator: 'a[alt="' + t + '"]', name: "link-name", path: "html > body > a:nth-of-type(" + (i + 1) + ")"
  }));
  const g = barrerasAgrupadas([familia("2.4.4", nodes, "axe-core «link-name»: Links must have discernible text")], { url: "https://x.test/a" });
  assert.equal(g.length, 1);
  assert.equal(g[0].instancias, 3);
  assert.match(g[0].elemento, /y 2 más/, "la columna «Elemento» avisa de que hay más");
  ["萨克拉河岸修道院之路", "塞维利亚两日游", "马德里王宫"].forEach((t) => {
    assert.ok(g[0].elementos.indexOf(t) !== -1, "falta " + t + " en: " + g[0].elementos);
  });
});

test("agrupadas: dos páginas no se funden, aunque la medida sea la misma", () => {
  /* Arreglarlo en una página no lo arregla en la otra, y un IRA se afirma por
   * página. La página es parte de la identidad de la familia. */
  const uno = familia("1.4.3", [{ locator: "a", path: "html > body > a:nth-of-type(1)" }], "a: ratio 3.38:1");
  uno.url = "https://x.test/a";
  const dos = familia("1.4.3", [{ locator: "a", path: "html > body > a:nth-of-type(1)" }], "a: ratio 3.38:1");
  dos.url = "https://x.test/b";
  const g = barrerasAgrupadas([uno, dos], {});
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((r) => r.pagina).sort(), ["https://x.test/a", "https://x.test/b"]);
});

test("agrupadas: una sola instancia no se adorna con recuentos", () => {
  const g = barrerasAgrupadas([familia("1.1.1", [{ locator: "img", path: "html > body > img:nth-of-type(1)" }], "img: sin alternativa textual.")], { url: "https://x.test/a" });
  assert.equal(g.length, 1);
  assert.equal(g[0].instancias, 1);
  assert.equal(g[0].evidencia, "img: sin alternativa textual.");
  assert.doesNotMatch(g[0].elemento, /más/);
});

test("agrupadas: la celda del CSV se recorta y dice dónde está la lista entera", () => {
  const nodes = Array.from({ length: 63 }, (_, i) => ({ locator: "a", path: "html > body > div:nth-of-type(" + (i + 1) + ") > a:nth-of-type(1)" }));
  const out = oawExport([familia("1.4.3", nodes, "a: ratio 3.38:1")], { url: "https://x.test/a" });
  const r = out.barrerasAgrupadas[0];
  assert.equal(r.selectores.length, 63, "en el objeto, las 63");
  assert.match(r.selectoresCsv, /y 53 más \(las 63 están en el JSON/, "en el CSV, recortada: " + r.selectoresCsv.slice(-80));
  const lineas = out.csv.barrerasAgrupadas.split("\r\n");
  assert.ok(Math.max(...lineas.map((l) => l.length)) < 6000, "y ninguna línea monstruosa");
});

test("agrupadas: el informe por elemento sigue intacto y sale en el mismo viaje", () => {
  const nodes = [1, 2, 3].map((i) => ({ locator: "a", path: "html > body > a:nth-of-type(" + i + ")" }));
  const out = oawExport([familia("1.4.3", nodes, "a: ratio 3.38:1")], { url: "https://x.test/a" });
  assert.equal(out.barreras.length, 3, "una por elemento, que es lo que pide un IRA");
  assert.equal(out.barrerasAgrupadas.length, 1, "y una por familia, que es lo que se lee");
  assert.ok(out.csv.barreras && out.csv.barrerasAgrupadas, "los dos CSV");
});

/* ── Por qué una fila no se puede comprobar ────────────────────────────────────
 *
 * Medido en el banco del sitio limpio: 21 de las 55 filas de `seguimiento.csv`
 * decían «No se puede comprobar (revisión manual)» y ni una decía por qué, con lo
 * que «no corrí la sonda» (se arregla repitiendo la pasada), «nadie lo mide»
 * (cobertura del agente) y «hace falta una persona» (trabajo del auditor) caían
 * en el mismo cajón. La distinción existía desde v0.67.0 pero vivía en la
 * evidencia del hallazgo, y esta hoja —la que alimenta el IRA— no tiene columna
 * de evidencia. */
const Fm = (n, verdict, motivo) => ({ c: { n, lvl: "A", t: n }, verdict, motivo, evid: [] });

test("motivo: la sonda apagada manda sobre los demás, porque es lo único que arregla quien lee", () => {
  const m = motivoPendiente([Fm("3.3.1", "revisar", "sonda-muda"), Fm("3.3.1", "revisar", "capa-apagada")], "revisar");
  assert.match(m, /no se ejecutó/);
  assert.match(m, /repite la pasada/);
});

test("motivo: sin código se deduce del veredicto, que también es un dato", () => {
  assert.match(motivoPendiente([], "humano"), /hace falta una persona/i);
  assert.match(motivoPendiente([], "cumple-parcial"), /calidad del texto/i);
  /* `revisar` ES un dictamen: lo emite el agente después de mirar, y decir
   * «sin dictamen» era afirmar lo contrario. Medido en `ja10`: catorce de los
   * 55 criterios salían con esa frase mientras el rollup decía `revisar` para
   * todos ellos. La hoja que firma el auditor decía que el agente no había
   * opinado sobre criterios que sí había examinado. */
  /* Y `revisar` tiene DOS frases, según el dato: con evidencia medida es
   * «revisado, falta el juicio humano»; sin ninguna, es «aquí no ha mirado
   * nadie». Medido al construir esto: de trece `revisar` en una página de
   * prueba, once traían medición y dos eran relleno, y las dos cosas salían con
   * la misma frase. */
  const conMedicion = [{ verdict: "revisar", evid: ["a: 40×20 px (< 24×24)"] }];
  assert.match(motivoPendiente(conMedicion, "revisar"), /Revisado por el agente/i);
  assert.match(motivoPendiente([], "revisar"), /Ninguna capa llegó a dictaminarlo/i);
  assert.ok(!/Sin dictamen/i.test(motivoPendiente(conMedicion, "revisar")));
  // Y el relleno del motor NO cuenta como medición para elegir la frase.
  assert.match(motivoPendiente([{ verdict: "revisar", origen: "motor-sin-capa",
    evid: ["lo mide la capa de medición"] }], "revisar"), /Ninguna capa llegó a dictaminarlo/i);
  // Y nunca se clasifica buscando expresiones regulares en la prosa castellana
  // de las evidencias: esa prosa cambia y la hoja tiene efectos legales.
  assert.equal(motivoPendiente([{ c: { n: "1.1.1" }, verdict: "cumple", evid: ["la capa que lo mide sí se ha ejecutado y no ha dicho nada"] }], "cumple"), "");
});

test("un «no aplica» de UNA página no decide por el sitio: manda la peor", () => {
  /* LA REGRESIÓN QUE HABÍA QUE EVITAR al hacer que los criterios de medios
   * salgan «no aplica» sin medios. En una muestra de doce páginas, once sin
   * vídeo y una con un vídeo sin subtítulos, el criterio NO puede salir «no
   * aplica» por el sitio: saldría conforme un sitio con una barrera dentro.
   * `worseOf` ordena `no-aplica` como el más débil de todos, y esto lo vigila
   * desde la hoja, que es donde se vería el daño. */
  const rows = seguimiento([
    { c: { n: "1.2.2", t: "Subtítulos (grabados)", lvl: "A" }, verdict: "no-aplica", sev: null,
      evid: ["Sin medios en el marcado de esta página"] },
    { c: { n: "1.2.2", t: "Subtítulos (grabados)", lvl: "A" }, verdict: "no-aplica", sev: null,
      evid: ["Sin medios en el marcado de esta página"] },
    { c: { n: "1.2.2", t: "Subtítulos (grabados)", lvl: "A" }, verdict: "falla", sev: "grave",
      nodes: [{ locator: "video" }], evid: ["1 vídeo sin pista de subtítulos"] }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].veredicto, "falla", "la barrera manda sobre el «no aplica» de las otras páginas");
  assert.equal(rows[0].resultado, "Falla");
  assert.equal(rows[0].num_barreras, 1);
});

test("y sin ninguna barrera, el «no aplica» sí llega al informe", () => {
  const rows = seguimiento([
    { c: { n: "1.2.2", t: "Subtítulos (grabados)", lvl: "A" }, verdict: "no-aplica", sev: null,
      evid: ["Sin medios en el marcado de esta página"] }
  ]);
  assert.equal(rows[0].resultado, "No aplica");
  // Y un «no aplica» es un dictamen: no lleva motivo ni «qué ha comprobado».
  assert.equal(rows[0].motivo, "");
  assert.equal(rows[0].comprobado, "");
});

test("motivo: una medición en una página gana al «aquí no había nada» de otra", () => {
  /* Medido en la auditoría `ja13` del sitio del autor: la fila de 3.2.2 decía
   * «La sonda corrió y no encontró contenido al que aplicarlo» en el motivo y
   * «Se han probado 3 control(es)…» en la casilla de lo comprobado. Las dos
   * frases eran ciertas de páginas distintas, y juntas en una fila se
   * contradicen. */
  const fs = [
    { verdict: "revisar", motivo: "sonda-muda", evid: ["la capa que lo mide no dijo nada de este criterio"] },
    { verdict: "cumple-parcial", evid: ["Se han probado 3 control(es) y ninguno provoca navegación."] }
  ];
  const m = motivoPendiente(fs, "cumple-parcial");
  assert.match(m, /Medido donde había algo que medir/, m);
  assert.ok(!/no encontró contenido al que aplicarlo/.test(m), m);
  assert.match(m, /en el resto de las páginas de la muestra no había contenido/, m);
});

test("motivo: pero lo que limita la muestra SIGUE mandando aunque haya medición", () => {
  /* La dirección contraria, y es la que protege el informe: «una capa no corrió»
   * o «hay páginas sin analizar» significan que parte de la muestra NO se midió,
   * y eso manda sobre cualquier medición en las demás páginas. Suavizar eso
   * sería exactamente la media verdad que este arreglo viene a quitar. */
  const fs = [
    { verdict: "revisar", motivo: "capa-no-corrio", evid: ["la capa de dinámico no se ejecutó"] },
    { verdict: "cumple-parcial", evid: ["Se han probado 3 control(es) y ninguno provoca navegación."] }
  ];
  const m = motivoPendiente(fs, "cumple-parcial");
  assert.match(m, /no se ejecutó en esta pasada/, m);
});

test("loComprobado: trae las evidencias de lo que SÍ se midió, sin repetirlas", () => {
  /* En una muestra de doce páginas la misma evidencia llega doce veces, y la
   * celda de una hoja de cálculo no es un sitio donde repetirla. */
  const fs = [
    { verdict: "revisar", evid: ["Se han recorrido 31 controles con el teclado."] },
    { verdict: "revisar", evid: ["Se han recorrido 31 controles con el teclado."] },
    { verdict: "cumple-parcial", evid: ["El borde se mide: 3.1:1 contra el fondo."] }
  ];
  const t = loComprobado(fs, 3);
  assert.equal(t.match(/31 controles/g).length, 1, "no se repite: " + t);
  assert.match(t, /3\.1:1/);
});

test("loComprobado: el relleno del motor NO se presenta como algo comprobado", () => {
  /* «Lo mide la capa de dinámico, que este análisis del marcado no ejecuta» no
   * es algo que se haya comprobado: es la ausencia de una capa, y para eso está
   * el motivo `capa-no-corrio`. Colarlo en «qué ha comprobado el agente» sería
   * exactamente la clase de media verdad que este proyecto persigue. */
  const fs = [
    { verdict: "revisar", origen: "motor-sin-capa",
      evid: ["El motor no lo dictamina desde el marcado; lo mide la capa de dinámico, que este análisis del marcado no ejecuta."] },
    // Y el barrido de cobertura, que se reconoce por su `motivo` y no por su
    // prosa: su frase dice que NADIE lo comprobó, así que ponerla en la casilla
    // de «qué se ha comprobado» sería afirmar lo contrario de lo que dice.
    { verdict: "revisar", motivo: "sonda-muda",
      evid: ["la capa que lo mide sí se ha ejecutado y no ha dicho nada de este criterio"] },
    { verdict: "revisar", evid: ["Se ha pasado el puntero por 4 disparadores."] }
  ];
  const t = loComprobado(fs, 3);
  assert.ok(!/no ejecuta/.test(t), t);
  assert.ok(!/no ha dicho nada/.test(t), t);
  assert.match(t, /4 disparadores/);
});

test("loComprobado: una falla no se cuenta como comprobación limpia", () => {
  // Las fallas ya viajan en las barreras con su evidencia; repetirlas aquí
  // haría leer una barrera como «esto se comprobó y está bien».
  assert.equal(loComprobado([{ verdict: "falla", evid: ["botón sin nombre"] }], 3), "");
});

test("seguimiento: la fila de un `revisar` dice qué se comprobó", () => {
  const rows = seguimiento([
    { c: { n: "2.1.1", t: "Teclado", lvl: "A" }, verdict: "revisar", sev: null,
      evid: ["Se han recorrido 31 controles con el teclado y todos se alcanzan."] }
  ]);
  const r = rows[0];
  assert.match(r.motivo, /Revisado por el agente/);
  assert.match(r.comprobado, /31 controles/);
});

test("seguimiento: un dictamen no lleva «qué ha comprobado» tampoco", () => {
  const rows = seguimiento([
    F("4.1.2", "A", "falla", "crítica", [{ locator: "button" }], ["sin nombre"]),
    F("2.1.1", "A", "cumple", null, [], ["Correcto."])
  ]);
  rows.forEach((r) => assert.equal(r.comprobado, "", r.criterio + " no debía llevar «comprobado»"));
});

test("seguimiento: un dictamen NO lleva motivo al lado", () => {
  /* Una barrera, un «Correcto» y un «No aplica» son afirmaciones del agente.
   * Ponerles un motivo invitaría a leerlo como una reserva sobre el dictamen. */
  const rows = seguimiento([
    F("4.1.2", "A", "falla", "crítica", [{ locator: "button" }], ["sin nombre"]),
    F("2.1.1", "A", "cumple", null, [], ["Correcto."]),
    F("3.3.4", "AA", "no-aplica", null, [], ["No hay formularios."])
  ]);
  rows.forEach((r) => assert.equal(r.motivo, "", r.criterio + " no debía llevar motivo (" + r.resultado + ")"));
});

test("seguimiento: toda fila sin dictamen SÍ lleva motivo", () => {
  const rows = seguimiento([
    Fm("3.3.1", "revisar", "capa-apagada"),
    Fm("1.1.1", "revisar", "nadie-lo-mide"),
    Fm("2.2.2", "revisar", "sonda-muda"),
    { c: { n: "1.4.5", lvl: "AA", t: "x" }, verdict: "humano", evid: [] },
    { c: { n: "1.1.1b", lvl: "A", t: "y" }, verdict: "cumple-parcial", evid: [] }
  ].filter((f) => f.c.n !== "1.1.1b"));
  const sinMotivo = rows.filter((r) => /No se puede comprobar/.test(r.resultado) && !String(r.motivo || "").trim());
  assert.deepEqual(sinMotivo.map((r) => r.criterio), [], "estas filas se quedaron sin decir por qué");
});

test("seguimiento: la muestra incompleta es su propio motivo, y pisa a los demás", () => {
  /* Un «Correcto» degradado por muestra incompleta ya no es un dictamen: la razón
   * que tiene que leerse es que faltan páginas, no lo que dijera cada hallazgo. */
  const rows = seguimiento([F("2.1.1", "A", "cumple", null, [], ["Correcto."])],
    { muestra: { paginas: 4, paginasAnalizadas: 3 } });
  const r = rows.find((x) => x.criterio === "2.1.1");
  assert.match(r.resultado, /muestra incompleta/);
  assert.match(r.motivo, /sin analizar/i);
});

test("seguimiento: la columna viaja al CSV con su cabecera", () => {
  const out = oawExport([Fm("3.3.1", "revisar", "capa-apagada")], {});
  const lineas = out.csv.seguimiento.split("\r\n");
  assert.match(lineas[0], /Por qué no se puede comprobar/);
  // Y en el sitio correcto: justo después de la cobertura.
  const cols = lineas[0].replace(/^﻿/, "").split(";");
  assert.equal(cols[cols.indexOf("Cobertura de la muestra") + 1], "Por qué no se puede comprobar");
  const fila331 = lineas.find((l) => /;3\.3\.1;/.test(l));
  assert.match(fila331, /no se ejecutó/);
});

test("seguimiento: «No evaluado» tampoco se queda sin motivo", () => {
  /* Esta la encontró el test de arriba al leer la primera fila de datos (1.1.1,
   * por orden) en vez de la que yo esperaba: salía «No evaluado» con la columna
   * en blanco. Es la fila que más tiene que explicarse de toda la hoja. */
  const out = oawExport([Fm("3.3.1", "revisar", "capa-apagada")], {});
  const L = out.csv.seguimiento.split("\r\n").filter(Boolean);
  const noEvaluadas = L.slice(1).filter((l) => /;No evaluado;/.test(l));
  assert.ok(noEvaluadas.length, "este export tiene que traer filas «No evaluado»");
  noEvaluadas.forEach((l) => {
    const c = l.split(";");
    assert.match(String(c[7] || "").replace(/^"|"$/g, ""), /no se ha comprobado/i, l.slice(0, 80));
  });
  // Y el invariante de toda la hoja: ninguna fila que no sea un dictamen se calla.
  const mudas = L.slice(1).filter((l) => {
    const c = l.split(";"); const res = String(c[5] || "").replace(/"/g, "");
    return !/^(Falla|Correcto|No aplica)/.test(res) && !String(c[7] || "").replace(/"/g, "").trim();
  });
  assert.deepEqual(mudas.map((l) => l.split(";")[2]), []);
});

/* ── Una familia es un defecto, no un elemento ────────────────────────────────
 *
 * La clave de agrupación era `[criterio, página, EVIDENCIA, subcriterio]`, y la
 * evidencia lleva dentro los textos del elemento. Mientras son iguales en todas
 * las instancias —visitspain, donde la familia mayor tenía 63 rutas— agrupa
 * bien; en cuanto cambian, no agrupa nada.
 *
 * Medido en la pasada `ja6` de jesusaccesible.com: 134 familias de 147 filas por
 * elemento, y 113 de esas familias eran 2.5.3, con 93 en `/blog`. Reducidas a su
 * esqueleto de selector son cuatro patrones, y 85 de las 93 son UN componente
 * repetido 85 veces: tarjetas «Leer guía» cuyo nombre accesible es el título de
 * la guía. Un solo arreglo para las 85, y 85 filas en el fichero que promete
 * «una fila por familia».
 *
 * Y envenenaba la medición: contar por filas pesa un único error de autoría 85
 * veces, así que la precisión dependía de cuántos artículos tiene el blog.
 *
 * Con la clave nueva, sobre esas mismas 147 filas: 134 familias → 56, y 2.5.3
 * 113 → 35, sin que ningún otro criterio se mueva. */

test("forma de evidencia: enmascara los textos y NO deja entrar el recuento", () => {
  const e = "link «Leer guía»: El texto visible es «Leer guía» y el nombre accesible es «WCAG 1.1.1 Contenido no textual», que no lo contiene.";
  assert.equal(formaDeEvidencia(e), "link «·»: El texto visible es «·» y el nombre accesible es «·», que no lo contiene.");
  /* El recuento lo añade la propia agrupación. Si entrara en la clave, agrupar
   * dos veces daría familias distintas: una agrupación no idempotente es un
   * informe que cambia según cuántas veces lo generes. */
  assert.equal(formaDeEvidencia(e + " [85 elementos con esta misma medida en esta página]"), formaDeEvidencia(e));
});

test("esqueleto de selector: quita los índices de posición y nada más", () => {
  assert.equal(esqueletoSelector("html > body > ul > li:nth-of-type(31) > article:nth-of-type(1) > div > a"),
    "html > body > ul > li > article > div > a");
  assert.equal(esqueletoSelector("div:nth-child(4) > a"), "div > a");
  // Dos rutas distintas NO colapsan: dos componentes nunca se mezclan.
  assert.notEqual(esqueletoSelector("header > nav > a"), esqueletoSelector("footer > nav > a"));
});

test("agrupación: 85 tarjetas del mismo componente son UNA familia", () => {
  const filas = [];
  for (let i = 1; i <= 85; i++) {
    filas.push(F("2.5.3", "A", "falla", "grave",
      [{ locator: "a.card", path: "html > body > ul > li:nth-of-type(" + i + ") > article > div > a" }],
      ["link «Leer guía»: El texto visible es «Leer guía» y el nombre accesible es «WCAG " + i + " Algo», que no lo contiene."]));
  }
  const g = barrerasAgrupadas(filas, { url: "https://x/blog" });
  assert.equal(g.length, 1, "85 instancias de un componente son un defecto, no 85");
  assert.equal(g[0].instancias, 85);
  // Y lo que se enmascaró para agrupar no se pierde: se dice que variaba, con ejemplos.
  assert.match(g[0].evidencia, /85 elementos/);
  assert.match(g[0].evidencia, /los textos cambian de uno a otro \(85 variantes\)/);
  assert.match(g[0].evidencia, /por ejemplo:/);
});

test("agrupación: dos componentes distintos NO se fusionan aunque el hallazgo tenga la misma forma", () => {
  /* Este es el test que impide que el arreglo se pase de listo. El esqueleto es
   * la garantía: misma forma de evidencia, rutas distintas, familias distintas. */
  const ev = ["link «JFA»: El texto visible es «JFA» y el nombre accesible es «Ir a la página de inicio», que no lo contiene."];
  const filas = [
    F("2.5.3", "A", "falla", "grave", [{ locator: "a.logo", path: "html > body > header > nav > a" }], ev),
    F("2.5.3", "A", "falla", "grave", [{ locator: "a.logo", path: "html > body > footer > div > a" }], ev)
  ];
  const g = barrerasAgrupadas(filas, { url: "https://x/" });
  assert.equal(g.length, 2, "el logo del header y el del footer son dos sitios que arreglar");
});

test("agrupación: SIN selector no se enmascara nada, y no se fusiona más que antes", () => {
  /* Fail-safe que encontró el test de arriba al fallar. El esqueleto es la
   * prueba de que dos filas son el mismo componente; sin ruta no hay prueba, así
   * que se usa la evidencia literal —la clave de antes— y este cambio no puede
   * colapsar nada que no colapsara ya. */
  const filas = [
    F("4.1.2", "A", "falla", "grave", [{ locator: "button" }], ["Referencia a «uno» que no existe."]),
    F("4.1.2", "A", "falla", "grave", [{ locator: "button" }], ["Referencia a «otro» que no existe."])
  ];
  const g = barrerasAgrupadas(filas, { url: "https://x/" });
  assert.equal(g.length, 2, "sin ruta, dos evidencias distintas siguen siendo dos familias");
});

test("agrupación: el caso que ya funcionaba sigue funcionando", () => {
  /* Regresión de visitspain: evidencias IDÉNTICAS en el mismo componente. Si el
   * arreglo rompiera esto, cambiaría una agrupación buena por otra. */
  const filas = [1, 2, 3].map((i) => F("1.4.3", "AA", "falla", "grave",
    [{ locator: "span", path: "html > body > main > p:nth-of-type(" + i + ") > span" }],
    ["Contraste 2,63:1 sobre blanco."]));
  const g = barrerasAgrupadas(filas, { url: "https://x/" });
  assert.equal(g.length, 1);
  assert.equal(g[0].instancias, 3);
  // Aquí los textos NO variaban, así que no se dice que varíen.
  assert.ok(!/los textos cambian/.test(g[0].evidencia), g[0].evidencia);
});

test("agrupación: agrupar dos veces da lo mismo (idempotente)", () => {
  const filas = [1, 2, 3].map((i) => F("2.5.3", "A", "falla", "grave",
    [{ locator: "a.card", path: "html > body > ul > li:nth-of-type(" + i + ") > a" }],
    ["link «Leer»: visible «Leer», nombre «Título " + i + "», que no lo contiene."]));
  const una = barrerasAgrupadas(filas, { url: "https://x/" });
  assert.equal(una.length, 1);
  // La forma de la evidencia YA agrupada tiene que seguir siendo la misma forma.
  assert.equal(formaDeEvidencia(una[0].evidencia), formaDeEvidencia(filas[0].evid[0]));
});

/* ── UNA SONDA CAÍDA EN UNA PÁGINA NO LA TAPAN LAS OTRA ONCE ─────────────────
 *
 * Es el caso medido: once páginas con la sonda dinámica midiendo y diciendo
 * «cumple-parcial», una con la sonda caída. `loComprobado` encuentra medición
 * —la de las once—, y si `sonda-rota` se tratara como un motivo suave la fila
 * diría «medido donde había algo que medir», que es exactamente lo que no pasó
 * en la página que importa. */
test("«sonda-rota» no se ablanda porque haya medición en otras páginas", () => {
  const fs = [
    { c: { n: "2.2.2" }, verdict: "cumple-parcial", origen: "dinamico",
      evid: ["Observada la página 8.0 s SIN tocar nada: ningún elemento cambia por su cuenta."] },
    { c: { n: "2.2.2" }, verdict: "revisar", origen: "barrido", motivo: "sonda-rota",
      evid: ["la capa que lo mide se ha ejecutado pero 1 de sus sondas ha FALLADO en esta página"] }
  ];
  const m = motivoPendiente(fs, "revisar");
  assert.match(m, /FALLÓ/, m);
  assert.doesNotMatch(m, /Medido donde había algo que medir/, "eso tapa la página que no se midió");
});

test("y «sonda-muda» sí se ablanda: ese comportamiento no cambia", () => {
  const fs = [
    { c: { n: "3.2.2" }, verdict: "cumple-parcial", origen: "dinamico", evid: ["Se han probado 3 control(es)."] },
    { c: { n: "3.2.2" }, verdict: "revisar", origen: "barrido", motivo: "sonda-muda", evid: ["no encontró contenido"] }
  ];
  assert.match(motivoPendiente(fs, "revisar"), /Medido donde había algo que medir/);
});

/* ── EL TEXTO HONESTO, INVERTIDO POR EL EXPORTADOR ───────────────────────────
 *
 * Medido en `ja14`, con la huella caída en las doce páginas de la muestra.
 * `analyzeCoherence` hacía bien su parte: emitía los cuatro criterios de sitio a
 * `revisar` con la frase «no se ha podido tomar la huella de ninguna página… no
 * es que el sitio sea coherente, es que no se ha mirado». Pero esos hallazgos no
 * llevaban código de motivo, así que `motivoPendiente` caía a la rama de
 * `revisar`, `loComprobado` encontraba evidencia —esa misma— y la fila que ve el
 * cliente decía «Revisado por el agente sin encontrar incumplimiento
 * automatizable». La frase que dice «no se ha mirado» convertida en absolución, y
 * además copiada en la columna de «qué ha comprobado el agente». */
test("un criterio de sitio sin huella NO sale como «revisado sin incumplimiento»", () => {
  const sinHuella = {
    c: { n: "3.2.3" }, verdict: "revisar", origen: "coherencia", motivo: "sonda-rota",
    evid: ["No se ha podido tomar la huella de ninguna página de la muestra, así que los criterios de SITIO no se han comparado."]
  };
  const m = motivoPendiente([sinHuella], "revisar");
  assert.doesNotMatch(m, /Revisado por el agente sin encontrar incumplimiento/, m);
  assert.match(m, /FALLÓ/, m);
  // Y no se cuela en la columna de lo comprobado: ahí va lo que el agente MIRÓ.
  assert.equal(loComprobado([sinHuella], 3), "");
});

/* ── LA PLANTILLA ES UNA FAMILIA, NO DIEZ ────────────────────────────────────
 *
 * Reproduce la forma exacta de la auditoría `ja14` del sitio del autor: el
 * fichero que promete «una fila por familia» traía 43 filas, y tres familias se
 * comían 30 de ellas — el logo de la cabecera, el logo del pie y el enlace de
 * LinkedIn del pie, cada uno en las diez páginas de la muestra. Un solo arreglo
 * cierra cada uno, así que treinta filas afirman treinta problemas que no hay, e
 * inflan además la estimación del trabajo de remediación.
 */
const LOGOS = [
  { sel: "html > body > header:nth-of-type(1) > nav:nth-of-type(1) > a:nth-of-type(1)", el: "a.text-black", nom: "Ir a la página de inicio", vis: "JFA" },
  { sel: "html > body > footer:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)", el: "a.text-3xl", nom: "Ir a la página de inicio", vis: "JFA" },
  { sel: "html > body > footer:nth-of-type(1) > nav:nth-of-type(2) > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)", el: "a.flex", nom: "Perfil de LinkedIn", vis: "LinkedIn Profesional" }
];
const plantilla = (nPaginas) => {
  const fs = [];
  for (let i = 0; i < nPaginas; i++) {
    LOGOS.forEach(function (L) {
      const f = familia("2.5.3", [{ locator: L.el, name: L.nom, path: L.sel }],
        "link «" + L.nom + "»: El texto visible es «" + L.vis + "» y el nombre accesible es «" + L.nom + "», que no lo contiene (fallo F96).");
      f.url = "https://x.test/p" + i;
      fs.push(f);
    });
  }
  return fs;
};

test("agrupadas: tres elementos de la plantilla en diez páginas son TRES filas", () => {
  const g = barrerasAgrupadas(plantilla(10), {});
  assert.equal(g.length, 3, "una fila por componente, no una por página: " +
    g.map(function (r) { return r.elemento; }).join(" | "));
  g.forEach(function (r) {
    assert.equal(r.instancias, 10);
    assert.equal(r.nPaginas, 10, "las diez páginas, contadas");
    assert.equal(r.paginas.length, 10, "y enteras en el objeto, que no se pierde ninguna");
    assert.match(r.evidencia, /en 10 páginas de la muestra/, r.evidencia.slice(-180));
    assert.match(r.evidencia, /un solo arreglo los cierra todos/);
  });
  // Y los tres componentes siguen separados: son tres arreglos distintos.
  assert.equal(new Set(g.map(function (r) { return r.selector; })).size, 3);
});

test("agrupadas: por debajo del umbral NO se funde, que dos páginas no son una plantilla", () => {
  // Es el caso que defiende el test de más arriba: con dos páginas, arreglar una
  // puede no arreglar la otra, y el agente no tiene con qué demostrarlo.
  assert.equal(barrerasAgrupadas(plantilla(2), {}).length, 6, "dos páginas × tres componentes = seis filas");
  assert.equal(barrerasAgrupadas(plantilla(3), {}).length, 3, "con tres ya es la plantilla");
});

test("agrupadas: el umbral de plantilla se puede cambiar y apagar", () => {
  assert.equal(barrerasAgrupadas(plantilla(10), { umbralPlantilla: 1 }).length, 30, "apagado: como antes de v0.92.0");
  assert.equal(barrerasAgrupadas(plantilla(4), { umbralPlantilla: 5 }).length, 12, "con el umbral por encima, no funde");
});

test("agrupadas: componentes DISTINTOS con el mismo defecto no se funden entre sí", () => {
  // La prueba de que son el mismo componente es el esqueleto de la ruta. Tres
  // rutas distintas son tres componentes aunque el hallazgo tenga la misma forma.
  const g = barrerasAgrupadas(plantilla(10), {});
  const esqueletos = g.map(function (r) { return esqueletoSelector(r.selector); });
  assert.equal(new Set(esqueletos).size, 3, esqueletos.join(" | "));
});
