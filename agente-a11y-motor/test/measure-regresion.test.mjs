import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { ownText, textTargets, renderedM, disabledM, managedM, runChecksReal, contrastOf, MEASURE_SRC, MEASURE_BODY,
  sinPseudoFoco, coincideSinFoco, reglasDeFoco, pinta, ratioTxt } from "../src/measure.browser.js";

/**
 * DOM simulado con lo justo que necesita la medición: estilos por atributo
 * `data-cs` (JSON), caja por `data-box` y foco real. Así las funciones que corren
 * en la página quedan testeadas en Node, sin navegador.
 */
function dom(body, opts) {
  opts = opts || {};
  const doc = new DOMParser().parseFromString("<html><body>" + body + "</body></html>", "text/html");
  let active = null;
  // Solo se define cuando el test lo pide: sin `hasFocus` el motor asume que el
  // documento está enfocado, que es como se comportaba antes.
  if (opts.hasFocus !== undefined) doc.hasFocus = () => opts.hasFocus;
  if (opts.hojas) Object.defineProperty(doc, "styleSheets", { get: () => opts.hojas, configurable: true });
  Object.defineProperty(doc, "activeElement", { get: () => active, configurable: true });
  const todos = doc.querySelectorAll("*");
  Array.prototype.forEach.call(todos, (el) => {
    const box = JSON.parse(el.getAttribute("data-box") || '{"width":100,"height":40}');
    el.getClientRects = () => (box.width === 0 && box.height === 0 ? [] : [box]);
    el.getBoundingClientRect = () => box;
    // Enfocable como en un navegador real: nativamente enfocable, o con tabindex>=0.
    const NATIVO = ["a", "area", "button", "input", "select", "textarea", "summary", "iframe"];
    el.focus = () => {
      if (el.hasAttribute("disabled")) return;
      const ti = el.getAttribute("tabindex");
      if (ti != null && parseInt(ti, 10) < 0) return;
      const nativo = NATIVO.indexOf(el.tagName.toLowerCase()) !== -1 && (el.tagName.toLowerCase() !== "a" || el.hasAttribute("href"));
      if (nativo || ti != null) active = el;
    };
    el.blur = () => { active = null; };
  });
  const win = {
    getComputedStyle(el) {
      const cs = JSON.parse(el.getAttribute("data-cs") || "{}");
      return Object.assign({
        color: "rgb(0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none",
        fontSize: "16px", fontWeight: "400", visibility: "visible", display: "block", opacity: "1",
        outlineStyle: "none", outlineWidth: "0px", outlineColor: "rgb(0,0,0)", boxShadow: "none", borderColor: "rgb(0,0,0)"
      }, cs);
    }
  };
  return { doc, win };
}
const run = (body, limit) => { const { doc, win } = dom(body); return runChecksReal(doc, win, limit); };
const de = (res, crit) => res.filter((r) => r.crit === crit);

/* ── Contraste: medir donde de verdad hay texto ── */

test("ownText solo cuenta los nodos de texto propios", () => {
  const { doc } = dom('<div id="d">padre <span>hijo</span></div>');
  assert.equal(ownText(doc.getElementById("d")), "padre");
  assert.equal(ownText(doc.querySelector("span")), "hijo");
});

test("regresión: no se mide el color del contenedor contra el texto de un hijo", () => {
  // El contenedor dice color gris claro pero no pinta texto; el texto lo pinta el
  // span en negro. Antes salía «1.4.3 falla» sobre un contraste que no existe.
  const res = run('<button data-cs=\'{"color":"rgb(204,204,204)","backgroundColor":"rgb(255,255,255)"}\'><span data-cs=\'{"color":"rgb(0,0,0)","backgroundColor":"rgb(255,255,255)"}\'>Guardar</span></button>');
  const c = de(res, "1.4.3");
  assert.equal(c.length, 1);
  assert.equal(c[0].verdict, "pasa", c[0].detail);
  assert.match(c[0].detail, /rgb\(0 0 0\)/);
});

test("textTargets baja al descendiente que pinta el texto", () => {
  const { doc } = dom('<button><span>Guardar</span></button>');
  const t = textTargets(doc.querySelector("button"));
  assert.equal(t.length, 1);
  assert.equal(t[0].tagName.toLowerCase(), "span");
});

test("un contraste realmente insuficiente se sigue detectando", () => {
  const res = run('<button data-cs=\'{"color":"rgb(200,200,200)","backgroundColor":"rgb(255,255,255)"}\'>Enviar</button>');
  assert.equal(de(res, "1.4.3")[0].verdict, "falla");
});

test("texto invisible no se mide", () => {
  const { doc, win } = dom('<span data-cs=\'{"opacity":"0"}\'>oculto</span>');
  assert.equal(contrastOf(doc.querySelector("span"), win), null);
});

/* ── 2.1.1: no acusar de barrera de teclado a lo que no debe enfocarse ── */

test("regresión: un control deshabilitado no falla 2.1.1", () => {
  const res = run('<button disabled>No</button>');
  assert.equal(de(res, "2.1.1")[0].verdict, "pasa");
  assert.match(de(res, "2.1.1")[0].detail, /deshabilitado/);
});

test("un control no renderizado no FALLA 2.1.1, pero tampoco pasa", () => {
  // Antes salía «pasa» diciendo literalmente «fuera del alcance de esta
  // medición»: un criterio no comprobado declarado conforme. Los controles de un
  // menú o un modal cerrados al cargar son el caso normal, no el raro.
  const res = run('<button data-box=\'{"width":0,"height":0}\'>Oculto</button>');
  assert.equal(de(res, "2.1.1")[0].verdict, "revisar");
  assert.match(de(res, "2.1.1")[0].detail, /no lo alcanza|a mano/);
});

test("regresión: un hijo de widget compuesto con roving tabindex no falla 2.1.1", () => {
  const res = run('<div role="tablist"><button role="tab" tabindex="-1">Uno</button></div>');
  assert.equal(de(res, "2.1.1").pop().verdict, "pasa");
  assert.match(de(res, "2.1.1").pop().detail, /roving|compuesto/);
});

test("un tabindex=-1 suelto queda a revisar, no falla", () => {
  const res = run('<div role="button" tabindex="-1">Falso botón</div>');
  assert.equal(de(res, "2.1.1")[0].verdict, "revisar");
});

test("un control realmente inalcanzable sigue fallando 2.1.1", () => {
  const res = run('<div role="button" onclick="x()">Falso botón</div>');
  assert.equal(de(res, "2.1.1")[0].verdict, "falla");
});

test("un control deshabilitado tampoco genera 2.5.8", () => {
  assert.equal(de(run('<button disabled data-box=\'{"width":10,"height":10}\'>x</button>'), "2.5.8").length, 0);
});

/* ── Cobertura: filtrar antes de recortar ── */

test("regresión: el límite se aplica DESPUÉS de filtrar los no interactivos", () => {
  // 5 encabezados con role= (no interactivos) + 2 botones, límite 5.
  // Antes el slice se comía los botones y no se medía ninguno.
  const ruido = '<h2 role="heading">a</h2>'.repeat(5);
  const res = run(ruido + '<button>Uno</button><button>Dos</button>', 5);
  assert.equal(de(res, "2.1.1").length, 2);
  assert.equal(res.filter((r) => r.label === "Cobertura de los controles").length, 0, "los 2 botones caben en el cupo de controles");
});

test("si el límite sí recorta, la medición lo DICE en vez de callarlo", () => {
  const res = run('<button>a</button><button>b</button><button>c</button>', 2);
  const meta = res.filter((r) => r.label === "Cobertura de los controles");
  assert.equal(meta.length, 1);
  assert.equal(meta[0].verdict, "revisar");
  assert.match(meta[0].detail, /2 de 3/);
});

/* ── Empaquetado del código inyectable ── */

test("regresión: MEASURE_SRC va envuelto en IIFE (no ensucia el global del sitio)", () => {
  assert.ok(MEASURE_SRC.startsWith("(function(){"));
  assert.ok(MEASURE_SRC.trimEnd().endsWith("})();"));
  assert.ok(MEASURE_SRC.includes("window.__a11yMeasure"));
});

test("MEASURE_BODY compila y devuelve el resultado directamente (vía CDP, sin CSP)", () => {
  assert.doesNotThrow(() => new Function("lim", MEASURE_BODY));
  assert.ok(MEASURE_BODY.includes("return runChecksReal"));
  assert.ok(!MEASURE_BODY.includes("window.__a11yMeasure"));
});

test("las funciones auxiliares viajan todas en el código inyectado", () => {
  ["ownText", "textTargets", "renderedM", "disabledM", "managedM", "MANAGED_PARENT",
    // La vía estática de 2.4.7 corre DENTRO de la página: si no viaja, en el
    // navegador se lanzaría un ReferenceError justo donde no hay foco.
    "reglasDeFoco", "sinPseudoFoco", "coincideSinFoco", "PROP_INDICADOR"].forEach((n) => {
    assert.ok(MEASURE_BODY.includes(n), "falta " + n + " en MEASURE_BODY");
  });
});

/* ── Helpers puros ── */

test("renderedM / disabledM / managedM", () => {
  const { doc, win } = dom('<fieldset disabled><button id="a">x</button></fieldset><div role="menu"><button role="menuitem" id="m">y</button></div><b id="v" data-box=\'{"width":0,"height":0}\'>z</b>');
  assert.equal(disabledM(doc.getElementById("a")), true);
  assert.equal(managedM(doc.getElementById("m")), true);
  assert.equal(renderedM(doc.getElementById("v"), win), false);
});

test("regresión: el.focus() enfoca un tabindex=-1, pero Tab NO: 2.1.1 no puede dar «pasa» por eso", () => {
  // La sonda de foco es programática. Si mandara ella, un control con tabindex="-1"
  // saldría «recibe el foco» aunque el tabulador nunca llegue a él.
  const suelto = de(run('<div role="button" tabindex="-1">Falso</div>'), "2.1.1")[0];
  assert.equal(suelto.verdict, "revisar");
  assert.match(suelto.detail, /programático/);

  const enWidget = de(run('<div role="tablist"><button role="tab" tabindex="-1">P</button></div>'), "2.1.1").pop();
  assert.equal(enWidget.verdict, "pasa");
  assert.match(enWidget.detail, /roving/);
});

test("1.4.11: el límite de un control personalizado se mide; el de uno nativo no", () => {
  const custom = run('<div role="button" tabindex="0" data-cs=\'{"backgroundColor":"rgb(250,250,250)"}\'>X</div>');
  const n = custom.filter((r) => r.crit === "1.4.11");
  assert.equal(n.length, 1);
  assert.equal(n[0].verdict, "revisar", n[0].detail);
  assert.equal(run('<button data-cs=\'{"backgroundColor":"rgb(250,250,250)"}\'>X</button>').filter((r) => r.crit === "1.4.11").length, 0);
});

/* ── 1.4.3 aplica a TODO el texto, no solo al de los controles ── */

test("regresión: el contraste del texto NO interactivo también se mide", () => {
  // Un párrafo gris claro sin ningún control alrededor: la pasada de controles no
  // lo tocaba y la barrera se escapaba (la encontraba axe, no nosotros).
  const res = run('<p data-cs=\'{"color":"rgb(187,187,187)","backgroundColor":"rgb(255,255,255)"}\'>Texto con contraste insuficiente.</p>');
  const c = de(res, "1.4.3");
  assert.equal(c.length, 1, JSON.stringify(c));
  assert.equal(c[0].verdict, "falla", c[0].detail);
});

test("regresión: un mismo elemento no se mide dos veces con dos nombres", () => {
  // El <span> se llama «button › span» en la pasada de controles y «span» en la de
  // texto: con claves de texto salían dos filas para la misma barrera.
  const res = run('<button data-cs=\'{"backgroundColor":"rgb(255,255,255)"}\'><span data-cs=\'{"color":"rgb(187,187,187)","backgroundColor":"rgb(255,255,255)"}\'>Guardar</span></button>');
  assert.equal(de(res, "1.4.3").length, 1, JSON.stringify(de(res, "1.4.3")));
  assert.match(de(res, "1.4.3")[0].node, /›/, "gana el nombre con el control que lo contiene");
});

test("la cobertura del contraste se informa aparte de la de los controles", () => {
  const res = run("<p>uno</p><p>dos</p><p>tres</p><p>cuatro</p>", 2);
  const meta = res.filter((r) => r.label === "Cobertura del contraste");
  assert.equal(meta.length, 1);
  assert.match(meta[0].detail, /2 de 4/);
});

test("2.4.3 informa de la SECUENCIA de foco, no solo del veredicto", () => {
  const res = run('<button id="a">a</button><button id="b">b</button><button id="c">c</button>');
  const o = res.filter((r) => r.crit === "2.4.3");
  assert.equal(o.length, 1);
  assert.equal(o[0].verdict, "pasa");
  /* Cada control va con su TEXTO al lado. Sin él, una fila de enlaces sin id ni
   * clase salía como «a → a → a → a», que no permite comprobar nada: no se sabe de
   * qué enlace habla cada tramo. */
  assert.match(o[0].detail, /button#a «a» → button#b «b» → button#c «c»/);
});

test("un tabindex positivo reordena la secuencia mostrada", () => {
  const res = run('<button id="a">a</button><button id="b" tabindex="1">b</button>');
  const o = res.filter((r) => r.crit === "2.4.3")[0];
  assert.equal(o.verdict, "revisar");
  assert.match(o.detail, /button#b «b» → button#a «a»/, "el tabindex=1 va primero: " + o.detail);
  assert.match(o.detail, /tabindex` positivo/, "y se dice por qué está a revisar");
});

test("regresión: 2.4.3 se compara con el orden VISUAL, no solo con el tabindex", () => {
  /* El único criterio de decisión era la existencia de un `tabindex` positivo: sin
   * él, `pasa` y la evidencia «sigue el orden del DOM». Pero 2.4.3 exige que el
   * orden de foco preserve el significado, y el orden del DOM y el visual se separan
   * con `flex-direction: row-reverse`, `order`, `float`… y nada de eso se miraba.
   *
   * Con `linkedom` no hay layout, así que este caso vive en la batería de
   * integración (`test/integration/render-real.test.mjs`); aquí se comprueba que,
   * sin rects, el veredicto no se inventa una inversión que no puede ver. */
  const res = run('<button id="a">a</button><button id="b">b</button>');
  const o = res.filter((r) => r.crit === "2.4.3")[0];
  assert.equal(o.verdict, "pasa", "sin layout no hay inversión detectable: " + o.detail);
});

/* ── 2.4.7 cuando el documento NO tiene el foco del sistema ──────────────────
 *
 * Se descubrió auditando un sitio real desde un panel de navegador: con el panel
 * abierto el documento pierde el foco del sistema, `:focus` deja de aplicarse y
 * la comparación de estilos antes/después salía idéntica en TODOS los controles.
 * `el.focus()` sí mueve `activeElement`, así que 2.1.1 seguía bien, pero 2.4.7
 * emitía «sin cambio medible» en cada elemento de la página. En Playwright no se
 * ve nunca, porque allí la página siempre está enfocada; en la extensión pasaría
 * SIEMPRE, porque el popup se queda con el foco.
 */

function regla(r) {
  return {
    selectorText: r.sel,
    style: { getPropertyValue: (p) => (r.props && r.props[p]) || "" },
    cssRules: (r.hijas || []).map(regla)
  };
}
const hoja = (reglas) => ({ get cssRules() { return reglas.map(regla); } });
const hojaBloqueada = () => ({ get cssRules() { throw new Error("cross-origin"); } });

test("sinPseudoFoco respeta el escape de Tailwind en el nombre de clase", () => {
  // `.focus\:outline-2:focus` → la clase se llama literalmente «focus:outline-2».
  // Una regex ingenua sobre /:focus/ destroza la clase y el selector no coincide
  // ya con nada: la vía estática se quedaría muda en todo Tailwind.
  assert.equal(sinPseudoFoco(".focus\\:outline-2:focus"), ".focus\\:outline-2");
  assert.equal(sinPseudoFoco("a:focus-visible"), "a");
  assert.equal(sinPseudoFoco(".card:focus-within .x"), ".card .x");
  assert.equal(sinPseudoFoco("a:hover"), "a:hover", "otras pseudoclases no se tocan");
});

test("coincideSinFoco alcanza al elemento por cualquiera de las partes del selector", () => {
  const { doc } = dom('<a href="#x" class="skip-link">Saltar</a>');
  const a = doc.querySelector("a");
  assert.equal(coincideSinFoco(a, ".skip-link:focus"), true);
  assert.equal(coincideSinFoco(a, "button:focus, .skip-link:focus-visible"), true);
  assert.equal(coincideSinFoco(a, ".otra:focus"), false);
  assert.equal(coincideSinFoco(a, "«selector roto:focus"), false, "un selector inválido no puede reventar la pasada");
});

test("reglasDeFoco encuentra la regla aunque la regla lleve CSS anidado dentro", () => {
  // OJO: en Chrome moderno una CSSStyleRule TAMBIÉN tiene `cssRules` (anidado).
  // Con un `if (r.cssRules) { bajar; continue; }` se saltarían en silencio TODAS
  // las reglas normales y la vía estática nunca encontraría nada.
  const { doc } = dom('<a href="#x" class="skip-link">Saltar</a>', {
    hojas: [hoja([{ sel: ".skip-link:focus", props: { outline: "2px solid" }, hijas: [{ sel: "& span", props: {} }] }])]
  });
  const r = reglasDeFoco(doc.querySelector("a"), doc);
  assert.equal(r.encontradas, 1);
  assert.equal(r.conIndicador, 1);
  assert.deepEqual(r.ejemplos, [".skip-link:focus"]);
});

test("reglasDeFoco cuenta las hojas de otro origen que no puede leer", () => {
  const { doc } = dom('<a href="#x" class="skip-link">Saltar</a>', { hojas: [hojaBloqueada(), hoja([])] });
  const r = reglasDeFoco(doc.querySelector("a"), doc);
  assert.equal(r.hojasBloqueadas, 1);
  assert.equal(r.encontradas, 0);
});

test("reglasDeFoco no cuenta una regla de foco que no pinta ningún indicador", () => {
  const { doc } = dom('<a href="#x" class="skip-link">Saltar</a>', {
    hojas: [hoja([{ sel: ".skip-link:focus", props: { cursor: "pointer" } }])]
  });
  const r = reglasDeFoco(doc.querySelector("a"), doc);
  assert.equal(r.encontradas, 1);
  assert.equal(r.conIndicador, 0);
});

test("regresión: sin foco del sistema, 2.4.7 NO dice «sin cambio medible» si el CSS define indicador", () => {
  const { doc, win } = dom('<a href="#x" class="skip-link">Saltar al contenido</a>', {
    hasFocus: false,
    hojas: [hoja([{ sel: ".skip-link:focus", props: { "outline-width": "2px" } }])]
  });
  const res = runChecksReal(doc, win, 400);
  const f = res.filter((r) => r.crit === "2.4.7");
  assert.equal(f.length, 1);
  assert.equal(f[0].verdict, "cumple-parcial", f[0].detail);
  assert.match(f[0].detail, /no tiene el foco del sistema/);
  assert.match(f[0].detail, /\.skip-link:focus/);
  // Y 2.1.1 no se ve afectado: activeElement sí se mueve aunque el documento no
  // esté enfocado, así que el veredicto de enfocable sigue siendo medido.
  assert.equal(res.filter((r) => r.crit === "2.1.1")[0].verdict, "pasa");
  const meta = res.filter((r) => r.crit === "__meta" && /foco del sistema/i.test(r.label));
  assert.equal(meta.length, 1, "tiene que quedar constancia de la limitación en la cobertura");
  assert.match(meta[0].detail, /vuelve a analizar/);
});

test("sin foco del sistema y sin ninguna regla de foco, 2.4.7 queda a revisar con el motivo honesto", () => {
  const { doc, win } = dom('<button>Enviar</button>', { hasFocus: false, hojas: [hoja([])] });
  const f = runChecksReal(doc, win, 400).filter((r) => r.crit === "2.4.7")[0];
  assert.equal(f.verdict, "revisar");
  assert.match(f.detail, /tampoco se ha encontrado ninguna regla CSS de foco/);
});

test("con el documento enfocado la medición manda y nada cambia", () => {
  const { doc, win } = dom('<button data-cs=\'{"outlineStyle":"none"}\'>Enviar</button>', { hasFocus: true, hojas: [hoja([])] });
  const f = runChecksReal(doc, win, 400).filter((r) => r.crit === "2.4.7")[0];
  assert.equal(f.verdict, "revisar");
  assert.equal(f.detail, "sin cambio medible (revisar a ojo / :focus-visible)");
  assert.equal(runChecksReal(doc, win, 400).filter((r) => r.crit === "__meta" && /foco del sistema/i.test(r.label)).length, 0);
});

test("regresión: `outline: none` NO cuenta como indicador de foco", () => {
  // `*:focus { outline: none }` es justo la regla que QUITA el foco visible. Si
  // contase como indicador, la vía estática daría «cumple-parcial» en toda la
  // página exactamente en el sitio donde más falta hace fallar.
  assert.equal(pinta("none"), false);
  assert.equal(pinta("0"), false);
  assert.equal(pinta("medium none currentcolor"), false);
  assert.equal(pinta(""), false);
  assert.equal(pinta("2px solid red"), true);
  assert.equal(pinta("auto"), true, "`outline: auto` es el anillo del navegador: sí pinta");

  const { doc } = dom('<button>Enviar</button>', { hojas: [hoja([{ sel: "*:focus", props: { outline: "none" } }])] });
  const r = reglasDeFoco(doc.querySelector("button"), doc);
  assert.equal(r.encontradas, 1, "la regla está");
  assert.equal(r.conIndicador, 0, "pero no pinta nada");

  const { doc: d2, win } = dom('<button>Enviar</button>', { hasFocus: false, hojas: [hoja([{ sel: "*:focus", props: { outline: "none" } }])] });
  const f = runChecksReal(d2, win, 400).filter((r2) => r2.crit === "2.4.7")[0];
  assert.equal(f.verdict, "revisar", f.detail);
});

test("regresión: Chrome normaliza `*:focus` a `:focus` y aun así tiene que alcanzar al elemento", () => {
  // Al quitarle la pseudoclase queda la cadena vacía. Descartando los vacíos se
  // perdían justo las reglas que alcanzan a TODA la página — que son las más
  // habituales para definir (o quitar) el indicador de foco.
  const { doc } = dom('<button>Enviar</button>', {
    hojas: [hoja([{ sel: ":focus", props: { "box-shadow": "0 0 0 3px #06c" } }])]
  });
  const r = reglasDeFoco(doc.querySelector("button"), doc);
  assert.equal(r.encontradas, 1);
  assert.equal(r.conIndicador, 1);
});

/* ── Regresiones de la revisión profunda: el fondo que no se sabe leer ───── */

test("regresión: un color que no se sabe leer NO se degrada a blanco", () => {
  // `parseColor` solo entiende rgb()/rgba(). Chromium NO serializa a rgb() los
  // colores en oklch(), lab(), color(srgb …) ni color-mix(): los devuelve tal
  // cual. Al no parsearlos, `bgBehind` seguía subiendo y acababa midiendo contra
  // el blanco por omisión — texto ilegible sobre fondo oscuro declarado conforme
  // con un 10.90:1 inventado.
  const { doc, win } = dom('<p data-cs=\'{"color":"rgb(60,60,70)","backgroundColor":"oklch(0.30 0.02 250)"}\'>Texto</p>');
  const c = contrastOf(doc.querySelector("p"), win);
  assert.equal(c.undetermined, true, JSON.stringify(c));
  assert.match(c.motivo, /no sabe leer/);
});

test("regresión: la opacidad de un antepasado hace la medición no determinable", () => {
  // El glifo que se ve pintado no es el color declarado. Y el cálculo no puede
  // ir dentro del recorrido de fondos, que se PARA en el primer fondo opaco: la
  // opacidad de un antepasado por encima de ese punto sigue afectando.
  const { doc, win } = dom('<div data-cs=\'{"opacity":"0.25","backgroundColor":"rgb(255,255,255)"}\'>' +
    '<p data-cs=\'{"color":"rgb(0,0,0)","backgroundColor":"rgb(255,255,255)"}\'>Texto</p></div>');
  const c = contrastOf(doc.querySelector("p"), win);
  assert.equal(c.undetermined, true, JSON.stringify(c));
  assert.match(c.motivo, /opacidad/);
});

test("sin opacidad ni colores raros, se sigue midiendo igual", () => {
  const { doc, win } = dom('<p data-cs=\'{"color":"rgb(0,0,0)","backgroundColor":"rgb(255,255,255)"}\'>Texto</p>');
  const c = contrastOf(doc.querySelector("p"), win);
  assert.equal(c.undetermined, undefined);
  assert.ok(c.ratio > 20);
});

test("regresión: el ratio se presenta redondeando hacia ABAJO", () => {
  // Con toFixed(2), un 4.4995 se imprimía «4.50:1 (mín 4.5:1)» junto al veredicto
  // «revisar»: una contradicción que invita a subirlo a conforme al revisarlo.
  assert.equal(ratioTxt(4.4995), "4.49");
  assert.equal(ratioTxt(4.5001), "4.50");
  assert.equal(ratioTxt(21), "21.00");
});

/* ── 1.4.1 Uso del color: el caso clásico, ahora medido ─────────────────── */

test("un enlace en texto corrido sin más distintivo que el color falla 1.4.1", () => {
  // Es el caso de libro del criterio y sale en casi toda auditoría. Estaba entre
  // los que el agente no dictaminaba, y sí es medible: basta compararlo con el
  // texto que lo rodea, que es lo que mira una persona auditando.
  const { doc, win } = dom('<p data-cs=\'{"color":"rgb(0,0,0)"}\'>Lee nuestra ' +
    '<a href="/p" data-cs=\'{"color":"rgb(0,102,204)","textDecorationLine":"none"}\'>política</a>' +
    ' antes de continuar con el registro.</p>');
  const r = runChecksReal(doc, win, 400).filter((x) => x.crit === "1.4.1");
  assert.equal(r.length, 1);
  assert.equal(r[0].verdict, "falla", r[0].detail);
  assert.match(r[0].detail, /salvo el color/);
});

test("con subrayado, negrita o icono, 1.4.1 queda en cumple-parcial", () => {
  const caso = (cs) => {
    const { doc, win } = dom('<p data-cs=\'{"color":"rgb(0,0,0)","fontWeight":"400"}\'>Lee nuestra ' +
      '<a href="/p" data-cs=\'' + cs + '\'>política</a> antes de continuar con el registro.</p>');
    return runChecksReal(doc, win, 400).filter((x) => x.crit === "1.4.1")[0];
  };
  assert.equal(caso('{"color":"rgb(0,102,204)","textDecorationLine":"underline"}').verdict, "cumple-parcial");
  assert.equal(caso('{"color":"rgb(0,102,204)","textDecorationLine":"none","fontWeight":"700"}').verdict, "cumple-parcial");
});

test("1.4.1 no se pronuncia sobre enlaces que no van en texto corrido", () => {
  // Un menú o una tarjeta no tienen «texto circundante» del que distinguirse:
  // ahí el criterio se juzga de otra manera y el agente no debe inventarlo.
  const { doc, win } = dom('<nav><ul><li><a href="/a" data-cs=\'{"textDecorationLine":"none"}\'>Inicio</a></li>' +
    '<li><a href="/b" data-cs=\'{"textDecorationLine":"none"}\'>Blog</a></li></ul></nav>');
  assert.deepEqual(runChecksReal(doc, win, 400).filter((x) => x.crit === "1.4.1"), []);
});

test("el cumple-parcial de 1.4.1 dice lo que queda por mirar a ojo", () => {
  const { doc, win } = dom('<p data-cs=\'{"color":"rgb(0,0,0)"}\'>Lee la ' +
    '<a href="/p" data-cs=\'{"textDecorationLine":"underline"}\'>política</a> antes de continuar con el registro.</p>');
  const r = runChecksReal(doc, win, 400).filter((x) => x.crit === "1.4.1")[0];
  assert.match(r.detail, /leyendas, gráficos, estados/);
});

/* ── 2.2.2: lo que se mueve solo más de cinco segundos ───────────────────── */

test("un <marquee> falla 2.2.2: no admite control posible", () => {
  const { doc, win } = dom("<marquee>Ofertas</marquee>");
  const r = runChecksReal(doc, win, 400).filter((x) => x.crit === "2.2.2");
  assert.equal(r.length, 1);
  assert.equal(r[0].verdict, "falla");
  assert.match(r[0].detail, /no ofrece ningún mecanismo/);
});

test("una animación infinita queda a revisar, no a falla", () => {
  // Desde la medición no se puede saber si hay un botón de pausa en otro punto
  // de la página, y el criterio lo admite en cualquier sitio.
  const { doc, win } = dom('<div data-cs=\'{"animationName":"gira","animationIterationCount":"infinite","animationDuration":"2s"}\'>x</div>');
  const r = runChecksReal(doc, win, 400).filter((x) => x.crit === "2.2.2");
  assert.equal(r[0].verdict, "revisar");
  assert.match(r[0].detail, /infinita/);
  assert.match(r[0].detail, /no se puede saber si existe/);
});

test("una animación corta no entra en 2.2.2", () => {
  const { doc, win } = dom('<div data-cs=\'{"animationName":"fade","animationIterationCount":"1","animationDuration":"0.3s"}\'>x</div>');
  assert.deepEqual(runChecksReal(doc, win, 400).filter((x) => x.crit === "2.2.2"), []);
});

test("una animación pausada tampoco", () => {
  const { doc, win } = dom('<div data-cs=\'{"animationName":"gira","animationIterationCount":"infinite","animationDuration":"2s","animationPlayState":"paused"}\'>x</div>');
  assert.deepEqual(runChecksReal(doc, win, 400).filter((x) => x.crit === "2.2.2"), []);
});
