import { test } from "node:test";
import assert from "node:assert/strict";
import { oawExport, barreras, barrerasAgrupadas, seguimiento, motivoPendiente } from "../src/index.js";

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
  assert.match(motivoPendiente([], "revisar"), /Sin dictamen/i);
  // Y nunca se clasifica buscando expresiones regulares en la prosa castellana
  // de las evidencias: esa prosa cambia y la hoja tiene efectos legales.
  assert.equal(motivoPendiente([{ c: { n: "1.1.1" }, verdict: "cumple", evid: ["la capa que lo mide sí se ha ejecutado y no ha dicho nada"] }], "cumple"), "");
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
