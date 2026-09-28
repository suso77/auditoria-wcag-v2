import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeReflow, analyzeResize, analyzeTextSpacing, analyzeOrientation, analyzeHoverContent, analyzeViewport, EXENTOS_REFLUJO } from "../src/viewport.js";

const v = (fs) => fs.map((f) => f.c.n + "/" + f.verdict);

/* ── 1.4.10 Reflujo ── */

test("sin desplazamiento horizontal a 320 px → cumple 1.4.10", () => {
  assert.deepEqual(v(analyzeReflow({ w: 320, h: 256, scrollWidth: 320, clientWidth: 320 })), ["1.4.10/cumple"]);
});

test("una tolerancia de 2 px no dispara la falla (redondeos de layout)", () => {
  assert.deepEqual(v(analyzeReflow({ w: 320, h: 256, scrollWidth: 322, clientWidth: 320 })), ["1.4.10/cumple"]);
});

test("desbordamiento real → falla 1.4.10 grave, con los elementos señalados", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 980, clientWidth: 320, offenders: [{ locator: "div.grid", tag: "div", detalle: "660 px fuera" }] });
  assert.deepEqual(v(out), ["1.4.10/falla"]);
  assert.equal(out[0].sev, "grave");
  assert.match(out[0].evid[0], /660 px de exceso/);
  assert.deepEqual(out[0].nodes, [{ locator: "div.grid", name: "660 px fuera" }]);
});

test("si TODO lo que desborda puede acogerse a la excepción de uso esencial → revisar, no falla", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 900, clientWidth: 320, offenders: [{ locator: "table.datos", tag: "table" }, { locator: "div.mapa", tag: "div", role: "img" }] });
  assert.deepEqual(v(out), ["1.4.10/revisar"]);
  assert.match(out[0].evid[0], /uso esencial/);
});

test("una sola excepción no salva al resto", () => {
  const out = analyzeReflow({ w: 320, h: 256, scrollWidth: 900, clientWidth: 320, offenders: [{ locator: "table.datos", tag: "table" }, { locator: "nav.menu", tag: "nav" }] });
  assert.deepEqual(v(out), ["1.4.10/falla"]);
});

test("la lista de exentos es la que dice WCAG por uso esencial", () => {
  ["table", "img", "iframe", "pre"].forEach((t) => assert.ok(EXENTOS_REFLUJO.includes(t)));
  assert.ok(!EXENTOS_REFLUJO.includes("div"));
});

/* ── 1.4.4 y 1.4.12: el mismo patrón de recorte ── */

test("sin recortes al aplicar el cambio → cumple", () => {
  assert.deepEqual(v(analyzeResize({ aplicado: true, revisados: 42, recortados: [], solapados: [] })), ["1.4.4/cumple"]);
  assert.deepEqual(v(analyzeTextSpacing({ aplicado: true, revisados: 42, recortados: [], solapados: [] })), ["1.4.12/cumple"]);
});

test("texto recortado tras el cambio → falla grave", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 42, recortados: [{ locator: "div.card", detalle: "31 px de alto ocultos" }], solapados: [] });
  assert.deepEqual(v(out), ["1.4.12/falla"]);
  assert.equal(out[0].sev, "grave");
  assert.match(out[0].evid[0], /sin barra de desplazamiento/);
});

test("solo solapes (sin recorte) → revisar, no falla", () => {
  const out = analyzeResize({ aplicado: true, revisados: 10, recortados: [], solapados: [{ locator: "p.pie" }] });
  assert.deepEqual(v(out), ["1.4.4/revisar"]);
});

test("si el cambio NO se pudo aplicar, el veredicto es revisar y lo dice", () => {
  const out = analyzeTextSpacing({ aplicado: false, motivo: "CSP bloqueó el <style>" });
  assert.deepEqual(v(out), ["1.4.12/revisar"]);
  assert.match(out[0].evid[0], /CSP bloqueó/);
});

/* ── 1.3.4 Orientación ── */

test("screen.orientation.lock() → falla 1.3.4", () => {
  const out = analyzeOrientation({ bloqueoJS: true });
  assert.deepEqual(v(out), ["1.3.4/falla"]);
});

test("media query de orientación que oculta contenido → revisar", () => {
  assert.deepEqual(v(analyzeOrientation({ mediaBloqueante: ["(orientation: landscape)"] })), ["1.3.4/revisar"]);
});

test("mismo contenido en vertical y horizontal → cumple", () => {
  assert.deepEqual(v(analyzeOrientation({ textoVertical: 5000, textoHorizontal: 5100 })), ["1.3.4/cumple"]);
});

test("pérdida grande de texto al girar → revisar", () => {
  const out = analyzeOrientation({ textoVertical: 1000, textoHorizontal: 5000 });
  assert.deepEqual(v(out), ["1.3.4/revisar"]);
  assert.match(out[0].evid[0], /80 %/);
});

/* ── 1.4.13 Contenido al recibir foco o puntero ── */

test("el atributo title como tooltip → falla 1.4.13", () => {
  const out = analyzeHoverContent({ titles: [{ locator: "a.ayuda", texto: "Más información sobre el trámite" }] });
  assert.deepEqual(v(out), ["1.4.13/falla"]);
  assert.match(out[0].evid[0], /no se puede descartar con Esc/);
});

test("un title vacío no cuenta", () => {
  // Con la sonda de puntero ejecutada (`hoverProbado`), un title vacío deja el
  // criterio conforme; sin ejecutar, queda a revisar — que es el otro test.
  assert.deepEqual(v(analyzeHoverContent({ titles: [{ locator: "a", texto: "   " }], hovers: [], hoverProbado: true, disparadores: 0 })), ["1.4.13/cumple"]);
});

test("emergente que no se descarta con Esc → falla grave", () => {
  const out = analyzeHoverContent({ hovers: [{ locator: "div.tooltip", descartable: false, señalable: true }] });
  assert.deepEqual(v(out), ["1.4.13/falla"]);
  assert.equal(out[0].sev, "grave");
});

test("emergentes correctos → cumple", () => {
  assert.deepEqual(v(analyzeHoverContent({ hovers: [{ locator: "div.tip", descartable: true, señalable: true }] })), ["1.4.13/cumple"]);
});

/* ── Agregado ── */

test("analyzeViewport cubre los cinco criterios de una vez", () => {
  const out = analyzeViewport({
    reflow: { w: 320, h: 256, scrollWidth: 320, clientWidth: 320 },
    resize: { aplicado: true, revisados: 5, recortados: [], solapados: [] },
    spacing: { aplicado: true, revisados: 5, recortados: [], solapados: [] },
    orientation: { textoVertical: 100, textoHorizontal: 100 },
    hover: { titles: [], hovers: [] }
  });
  assert.deepEqual(out.map((f) => f.c.n).sort(), ["1.3.4", "1.4.10", "1.4.12", "1.4.13", "1.4.4"]);
  assert.ok(out.every((f) => f.scope === "adaptación" && f.en), "todos llevan ámbito y cláusula EN");
});

test("trazas ausentes no inventan veredictos", () => {
  assert.deepEqual(analyzeViewport({}), []);
});

test("recorte PREVIO al cambio → revisar, no falla, y se distingue del causado por el cambio", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 9, recortados: [], solapados: [], previos: [{ locator: "div.card", detalle: "102 px de alto ocultos" }] });
  assert.deepEqual(v(out), ["1.4.12/revisar"]);
  assert.match(out[0].evid[0], /YA venían/);
  assert.match(out[0].evid[0], /No lo provoca/);
  assert.equal(out[0].nodes[0].locator, "div.card");
});

test("si el cambio SÍ empeora algo, manda el recorte nuevo", () => {
  const out = analyzeTextSpacing({ aplicado: true, revisados: 9, recortados: [{ locator: "div.nueva" }], solapados: [], previos: [{ locator: "div.vieja" }] });
  assert.deepEqual(v(out), ["1.4.12/falla"]);
  assert.match(out[0].evid[0], /div\.nueva/);
});

/* ── Regresiones de la revisión profunda ─────────────────────────────────── */

test("regresión: 1.4.13 no se declara conforme si la sonda no llegó a correr", () => {
  // Cuando `hovers` viene vacío sin haber probado nada —la capa no corrió, o
  // falló—, leerlo como «se probó y no había emergentes» daba «cumple» sobre
  // tooltips CSS reales que no se cierran con Esc.
  const out = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: false });
  assert.deepEqual(out.map((f) => f.c.n + "/" + f.verdict), ["1.4.13/revisar"]);
  assert.match(out[0].evid[0], /sonda de puntero NO llegó a ejecutarse/);
});

test("regresión: si el tope de bloques recortó, el criterio no puede salir conforme", () => {
  // La misma tarjeta que se recorta daba «falla» sola y «cumple» detrás de 400
  // párrafos, porque el barrido corta en 300 elementos y no lo decía.
  const trace = { aplicado: true, revisados: 300, recortados: [], solapados: [], previos: [],
    cobertura: { total: 412, medidos: 300, truncado: true } };
  const out = analyzeTextSpacing(trace);
  assert.equal(out[0].verdict, "revisar", out[0].evid[0]);
  assert.match(out[0].evid[0], /412/);
  assert.match(out[0].evid[0], /NO se ha comprobado/);
});

test("sin truncar, el veredicto sigue siendo cumple", () => {
  const trace = { aplicado: true, revisados: 12, recortados: [], solapados: [], previos: [],
    cobertura: { total: 12, medidos: 12, truncado: false } };
  assert.equal(analyzeTextSpacing(trace)[0].verdict, "cumple");
});

test("la sonda de puntero distingue los tres desenlaces", () => {
  // Probado y limpio → cumple, diciendo cuántos disparadores se recorrieron.
  const ok = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: true, disparadores: 3 });
  assert.equal(ok[0].verdict, "cumple");
  assert.match(ok[0].evid[0], /3 disparador/);

  // Probado y roto → falla, con el motivo concreto.
  const malo = analyzeHoverContent({ titles: [], hoverProbado: true,
    hovers: [{ locator: "span.tip", aparece: 1, descartableConEsc: false, senalable: true }] });
  assert.equal(malo[0].verdict, "falla");
  assert.match(malo[0].evid[0], /no se descarta con Esc/);

  // Probado y sano → cumple.
  const sano = analyzeHoverContent({ titles: [], hoverProbado: true,
    hovers: [{ locator: "span.tip", aparece: 1, descartableConEsc: true, senalable: true }] });
  assert.equal(sano[0].verdict, "cumple");
});

test("las hojas de otro origen ilegibles se declaran en el cumple", () => {
  const out = analyzeHoverContent({ titles: [], hovers: [], hoverProbado: true, disparadores: 2, hojasBloqueadas: 3 });
  assert.equal(out[0].verdict, "cumple");
  assert.match(out[0].evid[0], /3 hoja\(s\) de otro origen/);
});
