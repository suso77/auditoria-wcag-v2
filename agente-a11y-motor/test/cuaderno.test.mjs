import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import {
  cuadernoDeJuicio, cuadernoDeMuestra, registrarJuicio, findingsDelCuaderno, aplicaCuaderno,
  pendientesDeJuicio, cuadernoTexto, CRITERIOS_DE_JUICIO
} from "../src/cuaderno.js";
import { resultadoOAW, seguimiento } from "../src/report-oaw.js";
import { worseOf, esConforme, esIndeterminado, esNoAplica } from "../src/verdicts.js";

const doc = (html) => new DOMParser()
  .parseFromString('<!doctype html><html lang="es"><body>' + html + "</body></html>", "text/html");
const cuad = (html, opts) => cuadernoDeJuicio(doc(html), opts);
const fichaDe = (c, n) => c.criterios.find((x) => x.criterio === n);

/* ── Lo primero: decir cuándo NO viene al caso ───────────────────────────── */

test("una página sin medios deja 1.2.4 y 1.2.5 fuera, diciendo por qué", () => {
  const c = cuad("<main><h1>Hola</h1><p>Texto normal.</p></main>");
  ["1.2.4", "1.2.5"].forEach((n) => {
    const f = fichaDe(c, n);
    assert.equal(f.aplica, false, n);
    assert.equal(f.veredicto, "no-aplica");
    assert.match(f.loQueYaSabemos.join(" "), /no tiene ning[uú]n/);
  });
});

test("pero un iframe de YouTube basta para que 1.2.4 y 1.2.5 vuelvan a aplicar", () => {
  // Un reproductor embebido es contenido audiovisual aunque no haya <video>.
  const c = cuad('<main><iframe src="https://www.youtube.com/embed/abc" title="Charla"></iframe></main>');
  assert.equal(fichaDe(c, "1.2.4").aplica, true);
  assert.equal(fichaDe(c, "1.2.5").aplica, true);
  assert.match(JSON.stringify(fichaDe(c, "1.2.5").queMirar), /youtube/);
});

test("un vídeo oculto no cuenta: no hay nada que ver", () => {
  const c = cuad('<main><video hidden src="x.mp4"></video><p>Texto.</p></main>');
  assert.equal(fichaDe(c, "1.2.5").aplica, false);
});

test("sin nada que pueda destellar, 2.3.1 no aplica; con un GIF, sí", () => {
  assert.equal(fichaDe(cuad("<main><p>Texto.</p></main>"), "2.3.1").aplica, false);
  assert.equal(fichaDe(cuad('<main><img src="/banner.gif" alt="Oferta"></main>'), "2.3.1").aplica, true);
  // Y una animación CSS declarada también levanta el criterio.
  const c = cuad("<style>@keyframes p{from{opacity:0}to{opacity:1}}</style><main><p>x</p></main>");
  assert.equal(fichaDe(c, "2.3.1").aplica, true);
});

test("sin campos con restricciones, 3.3.3 no aplica", () => {
  assert.equal(fichaDe(cuad('<form><input name="q"><button>Buscar</button></form>'), "3.3.3").aplica, false);
  assert.equal(fichaDe(cuad('<form><input name="q" required></form>'), "3.3.3").aplica, true);
});

test("un buscador no levanta 3.3.4; un formulario que compra, sí", () => {
  const busca = cuad('<form method="get" action="/buscar"><input name="q"><button>Buscar</button></form>');
  assert.equal(fichaDe(busca, "3.3.4").aplica, false);
  assert.match(fichaDe(busca, "3.3.4").loQueYaSabemos.join(" "), /consulta o b[uú]squeda/);

  const compra = cuad('<form method="post" action="/pedido"><button>Comprar</button></form>');
  assert.equal(fichaDe(compra, "3.3.4").aplica, true);
});

test("sin campo de contraseña ni captcha, 3.3.8 no aplica", () => {
  assert.equal(fichaDe(cuad('<form><input name="q"></form>'), "3.3.8").aplica, false);
  assert.equal(fichaDe(cuad('<form><input type="password" name="p"></form>'), "3.3.8").aplica, true);
});

/* ── Y lo segundo: montar el expediente de los que sí ────────────────────── */

test("2.4.4 trae los enlaces vagos CON su contexto, y no los que ya se explican", () => {
  const c = cuad(
    '<main><p>Consulte <a href="/becas">Leer más</a> sobre las becas de 2026.</p>' +
    '<p><a href="/convocatoria-2026">Convocatoria de ayudas 2026</a></p></main>');
  const f = fichaDe(c, "2.4.4");
  assert.equal(f.aplica, true);
  assert.equal(f.queMirar.length, 1, "solo el genérico");
  assert.match(f.queMirar[0].detalle, /Leer m[aá]s/);
  assert.match(f.queMirar[0].detalle, /becas de 2026/, "y el párrafo que lo rodea");
});

test("2.4.4 sin ningún enlace vago se resuelve como cumple-parcial, no como deber", () => {
  const c = cuad('<main><a href="/a">Convocatoria de ayudas 2026</a><a href="/b">Plazos de solicitud</a></main>');
  const f = fichaDe(c, "2.4.4");
  assert.equal(f.veredicto, "cumple-parcial");
  assert.deepEqual(f.queMirar, []);
});

test("2.4.4 marca los que se quedan SIN contexto, que son los que suelen fallar", () => {
  const c = cuad('<main><div><a href="/a">Leer más</a></div></main>');
  assert.match(fichaDe(c, "2.4.4").queMirar[0].detalle, /SIN contexto/);
});

test("2.4.4 no le inventa contexto a un enlace con un encabezado lejano", () => {
  // Un <h1> a doce hermanos de distancia no es el contexto de nadie.
  const lejos = '<main><h1>Inicio</h1>' + "<p>relleno</p>".repeat(10) + '<div><a href="/a">Leer más</a></div></main>';
  assert.match(fichaDe(cuad(lejos), "2.4.4").queMirar[0].detalle, /SIN contexto/);
});

test("1.3.3 encuentra las instrucciones sensoriales y dice de qué tipo", () => {
  const c = cuad("<main><p>Pulse el botón verde para continuar.</p><p>Vea la columna de la derecha.</p></main>");
  const f = fichaDe(c, "1.3.3");
  assert.equal(f.aplica, true);
  const d = f.queMirar.map((x) => x.detalle).join(" | ");
  assert.match(d, /\[color\]/);
  assert.match(d, /\[posición\]/);
});

test("1.3.3 sin ninguna construcción de esas no aplica — y avisa de que solo miró el texto", () => {
  const f = fichaDe(cuad("<main><p>Rellene el campo Nombre y pulse Enviar.</p></main>"), "1.3.3");
  assert.equal(f.aplica, false);
  assert.match(f.loQueYaSabemos.join(" "), /solo se ha mirado el TEXTO/i);
});

test("3.3.7 agrupa el campo y su confirmación, y la marca como excepción", () => {
  const c = cuad('<form><label for="e">Correo</label><input id="e" name="e" type="email">' +
    '<label for="e2">Confirmar correo</label><input id="e2" name="e2" type="email"></form>');
  const f = fichaDe(c, "3.3.7");
  assert.equal(f.aplica, true, "el par no puede salir «no aplica»: hay un dato pedido dos veces");
  assert.equal(f.queMirar.length, 2);
  assert.ok(f.queMirar.every((m) => /CONFIRMACI[OÓ]N/.test(m.detalle)), JSON.stringify(f.queMirar));
});

test("3.3.7 agrupa también por autocomplete, que es el propósito declarado", () => {
  const c = cuad('<form><label for="a">Dirección de envío</label><input id="a" autocomplete="street-address">' +
    '<label for="b">Dirección de facturación</label><input id="b" autocomplete="street-address"></form>');
  const f = fichaDe(c, "3.3.7");
  assert.equal(f.aplica, true);
  assert.ok(f.queMirar.every((m) => /street-address/.test(m.detalle)));
  assert.ok(!f.queMirar.some((m) => /CONFIRMACI[OÓ]N/.test(m.detalle)), "estas dos no son una confirmación");
});

test("3.3.8 señala el autocomplete que impide al gestor de contraseñas rellenar", () => {
  const c = cuad('<form><input type="password" name="p" autocomplete="off"></form>');
  const f = fichaDe(c, "3.3.8");
  assert.match(f.queMirar[0].detalle, /impide al gestor/);
  assert.match(f.loQueYaSabemos.join(" "), /1 de 1/);
});

test("1.4.5 no dice que lee dentro de la imagen, porque no lo hace", () => {
  const f = fichaDe(cuad('<main><img src="/promo-oferta.png" alt="Rebajas de enero hasta el 50 por ciento"></main>'), "1.4.5");
  assert.equal(f.aplica, true);
  assert.match(f.loQueYaSabemos.join(" "), /no hay OCR/);
});

test("1.4.5 marca el logotipo como la excepción que es", () => {
  const f = fichaDe(cuad('<main><img src="/logo-empresa.png" alt="Ayuntamiento de Pontevedra"></main>'), "1.4.5");
  assert.match(JSON.stringify(f.queMirar), /logotipo/);
});

/* ── La decisión: sin motivo y sin firma no se registra ──────────────────── */

const base = () => cuad('<main><p>Pulse el botón verde.</p></main>');

test("una decisión sin motivo se rechaza", () => {
  assert.throws(() => registrarJuicio(base(), { criterio: "1.3.3", veredicto: "cumple", auditor: "Suso" }),
    /Falta el motivo/);
  assert.throws(() => registrarJuicio(base(), { criterio: "1.3.3", veredicto: "cumple", auditor: "Suso", motivo: "vale" }),
    /Falta el motivo/, "un motivo de cuatro letras no es un motivo");
});

test("una decisión sin firma se rechaza", () => {
  assert.throws(() => registrarJuicio(base(), { criterio: "1.3.3", veredicto: "cumple", motivo: "La frase da también el nombre del botón." }),
    /qui[eé]n firma/);
});

test("`pasa` y `cumple-parcial` no son palabras de una persona", () => {
  ["pasa", "cumple-parcial", "humano", "inventado"].forEach((v) => {
    assert.throws(() => registrarJuicio(base(), { criterio: "1.3.3", veredicto: v, motivo: "Motivo suficientemente largo.", auditor: "Suso" }),
      /no admitido/, v);
  });
});

test("un criterio que no es de juicio no se puede registrar aquí", () => {
  assert.throws(() => registrarJuicio(base(), { criterio: "1.1.1", veredicto: "cumple", motivo: "Motivo suficientemente largo.", auditor: "Suso" }),
    /no est[aá] en el cuaderno/);
});

test("registrar no modifica el cuaderno anterior: devuelve uno nuevo", () => {
  const c0 = base();
  const c1 = registrarJuicio(c0, { criterio: "1.3.3", veredicto: "falla", motivo: "El color es el único dato: no dice el nombre del botón.", auditor: "Suso", fecha: "2026-09-28" });
  assert.equal(fichaDe(c0, "1.3.3").decision, null, "el original no se toca");
  assert.equal(fichaDe(c1, "1.3.3").decision.veredicto, "falla");
  assert.equal(c1.resumen.decididos, 1);
  assert.equal(c0.resumen.decididos, 0);
});

test("pendientesDeJuicio deja fuera los que no aplican y los ya decididos", () => {
  const c0 = base();
  const antes = pendientesDeJuicio(c0).length;
  const c1 = registrarJuicio(c0, { criterio: "1.3.3", veredicto: "cumple", motivo: "La frase da también el nombre del botón.", auditor: "Suso" });
  assert.equal(pendientesDeJuicio(c1).length, antes - 1);
  assert.ok(!pendientesDeJuicio(c1).some((x) => !x.aplica));
});

/* ── Y de ahí al informe ─────────────────────────────────────────────────── */

test("un criterio pendiente sale como «humano», nunca como conforme", () => {
  const fs = findingsDelCuaderno(base());
  const f = fs.find((x) => x.c.n === "1.3.3");
  assert.equal(f.verdict, "humano");
  assert.equal(esConforme(f.verdict), false);
  assert.match(f.evid.join(" "), /C[oó]mo decidirlo/);
});

test("uno que no aplica sale como «no-aplica» y el OAW lo escribe así", () => {
  const f = findingsDelCuaderno(base()).find((x) => x.c.n === "1.2.5");
  assert.equal(f.verdict, "no-aplica");
  assert.equal(resultadoOAW("no-aplica"), "No aplica");
  assert.equal(esConforme("no-aplica"), false, "«no aplica» NO es conformidad");
  assert.equal(esIndeterminado("no-aplica"), false, "ni es una duda pendiente");
  assert.equal(esNoAplica("no-aplica"), true);
});

test("«no aplica» nunca tapa un hallazgo de otra página o de otra capa", () => {
  assert.equal(worseOf("no-aplica", "falla"), "falla");
  assert.equal(worseOf("no-aplica", "humano"), "humano");
  assert.equal(worseOf("no-aplica", "cumple"), "cumple");
  assert.equal(worseOf("no-aplica", null), "no-aplica");
});

test("la decisión firmada viaja al informe con su motivo y su firma", () => {
  const c = registrarJuicio(base(), {
    criterio: "1.3.3", veredicto: "falla",
    motivo: "«Pulse el botón verde» no da el nombre del botón: sin ver la pantalla no se sabe cuál es.",
    auditor: "Jesús Fernández Abeledo", fecha: "2026-09-28T10:00:00Z"
  });
  const f = findingsDelCuaderno(c).find((x) => x.c.n === "1.3.3");
  assert.equal(f.verdict, "falla");
  assert.equal(f.sev, "grave");
  assert.match(f.evid[0], /Jes[uú]s Fern[aá]ndez Abeledo/);
  assert.match(f.evid[0], /2026-09-28/);
  assert.match(f.evid[0], /bot[oó]n verde/);
  const fila = seguimiento([f]).find((r) => r.criterio === "1.3.3");
  assert.equal(fila.resultado, "Falla");
});

test("aplicaCuaderno sustituye el «humano» genérico del motor por el del cuaderno", () => {
  const delMotor = [
    { c: { n: "1.2.5", t: "Audiodescripción (grabado)", lvl: "AA" }, verdict: "humano", scope: "componente", evid: ["Requiere evaluación humana; ninguna máquina lo dictamina."] },
    { c: { n: "1.1.1", t: "Contenido no textual", lvl: "A" }, verdict: "falla", scope: "componente", evid: ["imagen sin alt"] }
  ];
  const out = aplicaCuaderno(delMotor, base());
  const de125 = out.filter((f) => f.c.n === "1.2.5");
  assert.equal(de125.length, 1, "no puede haber dos hallazgos del mismo criterio peleándose");
  assert.equal(de125[0].verdict, "no-aplica");
  assert.ok(out.some((f) => f.c.n === "1.1.1" && f.verdict === "falla"), "lo que no es de juicio se queda igual");
});

test("aplicaCuaderno NO borra una barrera real de un criterio de juicio", () => {
  // Si axe encontró un enlace sin nombre en 2.4.4, el cuaderno no lo perdona.
  const conBarrera = [
    { c: { n: "2.4.4", t: "Propósito de los enlaces (en contexto)", lvl: "A" }, verdict: "falla", scope: "axe", evid: ["enlace sin nombre"] }
  ];
  const out = aplicaCuaderno(conBarrera, base());
  assert.ok(out.some((f) => f.c.n === "2.4.4" && f.verdict === "falla"), "la barrera tiene que sobrevivir");
});

test("aplicar el cuaderno dos veces no duplica sus hallazgos", () => {
  const c = base();
  const una = aplicaCuaderno([], c);
  const dos = aplicaCuaderno(una, c);
  assert.equal(dos.length, una.length);
});

test("el cuaderno se puede leer en texto, con el estado de cada criterio", () => {
  const t = cuadernoTexto(registrarJuicio(base(), {
    criterio: "1.3.3", veredicto: "cumple", motivo: "La frase da también el nombre del botón.", auditor: "Suso"
  }));
  assert.match(t, /CUADERNO DE JUICIO/);
  assert.match(t, /\[NO APLICA\]/);
  assert.match(t, /\[CUMPLE\]/);
  assert.match(t, /Suso/);
});

test("son once, y son los once que el motor no mide", async () => {
  const { WCAG22, capaQueMide } = await import("../src/engine.js");
  const huerfanos = WCAG22.filter((c) => c.det !== "auto" && !capaQueMide(c.n)).map((c) => c.n);
  assert.deepEqual(CRITERIOS_DE_JUICIO.slice().sort(), huerfanos.slice().sort(),
    "si el motor gana una capa, ese criterio tiene que salir del cuaderno");
});

test("cuadernoDeJuicio exige un Document de verdad", () => {
  assert.throws(() => cuadernoDeJuicio(null), /Document/);
  assert.throws(() => cuadernoDeJuicio("<p>x</p>"), /Document/);
});

/* ── La muestra: lo que no se ve mirando una página ──────────────────────── */

const paso1 = () => cuadernoDeJuicio(doc(
  '<main><h1>Paso 1</h1><form method="post">' +
  '<label for="e">Correo</label><input id="e" autocomplete="email">' +
  '<label for="t">Teléfono</label><input id="t" autocomplete="tel">' +
  "<button>Siguiente</button></form></main>"), { url: "https://x.es/paso-1" });

const paso2 = () => cuadernoDeJuicio(doc(
  '<main><h1>Paso 2</h1><video src="/v.mp4" controls></video><form method="post">' +
  '<label for="e2">Correo</label><input id="e2" autocomplete="email">' +
  '<label for="d">Dirección</label><input id="d" autocomplete="street-address">' +
  "<button>Presentar solicitud</button></form></main>"), { url: "https://x.es/paso-2" });

test("un criterio aplica al sitio si aplica en UNA sola página de la muestra", () => {
  // La primera página no tiene vídeo. Si la muestra se quedara con la primera,
  // el 1.2.5 del sitio saldría «no aplica» habiendo un vídeo en la segunda.
  assert.equal(fichaDe(paso1(), "1.2.5").aplica, false);
  const m = cuadernoDeMuestra([paso1(), paso2()], { sitio: "x.es" });
  const f = fichaDe(m, "1.2.5");
  assert.equal(f.aplica, true);
  assert.match(f.loQueYaSabemos.join(" "), /Aplica en 1 de 2/);
  assert.equal(f.queMirar[0].pagina, "https://x.es/paso-2", "y dice en qué página mirar");
});

test("un criterio que no viene al caso en NINGUNA página sigue sin aplicar", () => {
  const m = cuadernoDeMuestra([paso1(), paso1()]);
  const f = fichaDe(m, "1.2.4");
  assert.equal(f.aplica, false);
  assert.match(f.loQueYaSabemos.join(" "), /ninguna de las 2 p[aá]gina/);
});

test("3.3.7 entre páginas: el dato que se pide en el paso 1 y otra vez en el paso 3", () => {
  // Ninguna de las dos páginas repite nada DENTRO de sí misma…
  assert.equal(fichaDe(paso1(), "3.3.7").aplica, false);
  assert.equal(fichaDe(paso2(), "3.3.7").aplica, false);
  // …pero las dos piden el correo, y eso solo se ve poniéndolas juntas.
  const f = fichaDe(cuadernoDeMuestra([paso1(), paso2()]), "3.3.7");
  assert.equal(f.aplica, true, "el cruce entre páginas tiene que levantar el criterio");
  assert.match(f.loQueYaSabemos.join(" "), /autocomplete:email/);
  const paginas = f.queMirar.map((m) => m.pagina);
  assert.ok(paginas.indexOf("https://x.es/paso-1") !== -1 && paginas.indexOf("https://x.es/paso-2") !== -1,
    "y señalar el campo en las dos páginas: " + JSON.stringify(paginas));
});

test("al cruzarse no se queda la frase vieja diciendo que no venía al caso", () => {
  const f = fichaDe(cuadernoDeMuestra([paso1(), paso2()]), "3.3.7");
  assert.ok(!/No viene al caso en ninguna/.test(f.loQueYaSabemos.join(" ")),
    "contradiría al estado nuevo: " + JSON.stringify(f.loQueYaSabemos));
  assert.match(f.loQueYaSabemos.join(" "), /la repetici[oó]n est[aá] ENTRE p[aá]ginas/);
});

test("el cruce no da por hecho que las páginas sean pasos del mismo proceso", () => {
  const f = fichaDe(cuadernoDeMuestra([paso1(), paso2()]), "3.3.7");
  assert.match(f.loQueYaSabemos.join(" ") + f.comoDecidir.join(" "), /mismo proceso/);
});

test("un veredicto adelantado solo sobrevive si lo comparten todas las páginas", () => {
  const limpia = () => cuadernoDeJuicio(doc('<main><a href="/a">Convocatoria de ayudas 2026</a><a href="/b">Plazos</a></main>'), { url: "https://x.es/a" });
  const vaga = () => cuadernoDeJuicio(doc('<main><p>Vea <a href="/c">Leer más</a> sobre las bases.</p></main>'), { url: "https://x.es/b" });
  assert.equal(fichaDe(cuadernoDeMuestra([limpia(), limpia()]), "2.4.4").veredicto, "cumple-parcial");
  assert.equal(fichaDe(cuadernoDeMuestra([limpia(), vaga()]), "2.4.4").veredicto, null,
    "si una página tiene enlaces vagos, el sitio no puede darse por resuelto");
});

test("el cuaderno de muestra se registra y se exporta igual que el de una página", () => {
  const m0 = cuadernoDeMuestra([paso1(), paso2()], { sitio: "x.es" });
  const m1 = registrarJuicio(m0, {
    criterio: "3.3.7", veredicto: "falla",
    motivo: "Los dos pasos son del mismo trámite y el correo se vuelve a pedir en blanco.",
    auditor: "Suso", fecha: "2026-09-28"
  });
  const f = findingsDelCuaderno(m1).find((x) => x.c.n === "3.3.7");
  assert.equal(f.verdict, "falla");
  assert.match(f.evid[0], /Suso/);
  assert.match(cuadernoTexto(m1), /muestra de 2 p[aá]gina/);
});

test("cuadernoDeMuestra necesita al menos un cuaderno", () => {
  assert.throws(() => cuadernoDeMuestra([]), /al menos un cuaderno/);
  assert.throws(() => cuadernoDeMuestra(null), /al menos un cuaderno/);
});

/* ── Regresión: la firma del auditor tiene que sobrevivir a la agregación ───
 *
 * Los cuatro casos de abajo salieron de una revisión completa del agente, y los
 * cuatro estaban rotos a la vez. El peor: un `falla` firmado a mano sobre una
 * ficha que el motor había marcado «no aplica» salía del informe del SITIO como
 * «No aplica», y la conformidad pasaba de «No conforme» a «Sin barreras
 * deterministas en la muestra». Es decir: el agente absolvía al sitio de una
 * barrera que una persona había confirmado y firmado.
 */

test("regresión: firmar un veredicto pone la ficha en juego, aunque el motor la hubiera descartado", () => {
  // Página sin <video>: el motor marca 1.2.5 «no aplica». El auditor mira la
  // página de verdad y encuentra un reproductor inyectado por JS.
  const c = cuad("<main><h1>Hola</h1><p>Texto.</p></main>", { url: "https://ej.test/a" });
  assert.equal(fichaDe(c, "1.2.5").aplica, false, "el motor no ve vídeo en el marcado");

  const firmado = registrarJuicio(c, {
    criterio: "1.2.5", veredicto: "falla", auditor: "Suso",
    motivo: "Reproductor inyectado por JS con vídeo sin audiodescripción."
  });
  const f = fichaDe(firmado, "1.2.5");
  assert.equal(f.veredicto, "falla");
  assert.equal(f.aplica, true, "la firma manda sobre la detección: si hay barrera, el criterio viene al caso");

  // Y un `no-aplica` firmado sí lo deja fuera, que es lo que significa.
  const fuera = registrarJuicio(c, {
    criterio: "1.2.4", veredicto: "no-aplica", auditor: "Suso",
    motivo: "No hay ninguna emisión en directo en todo el sitio."
  });
  assert.equal(fichaDe(fuera, "1.2.4").aplica, false);
});

test("regresión: un falla firmado en una página es un falla del SITIO, no un «No aplica»", () => {
  const c = cuad("<main><h1>Hola</h1><p>Texto.</p></main>", { url: "https://ej.test/a" });
  const firmado = registrarJuicio(c, {
    criterio: "1.2.5", veredicto: "falla", auditor: "Suso",
    motivo: "Reproductor inyectado por JS con vídeo sin audiodescripción."
  });

  const muestra = cuadernoDeMuestra([firmado], { sitio: "https://ej.test" });
  const f = fichaDe(muestra, "1.2.5");
  assert.equal(f.veredicto, "falla");
  assert.ok(f.decision, "la decisión del auditor viaja al cuaderno de la muestra");
  assert.match(f.decision.motivo, /Reproductor inyectado/);
  assert.match(f.decision.motivo, /https:\/\/ej\.test\/a/, "dice en qué página se firmó");
  assert.equal(f.decision.auditor, "Suso");
  assert.equal(muestra.resumen.decididos, 1);

  const h = findingsDelCuaderno(muestra).find((x) => x.c.n === "1.2.5");
  assert.equal(h.verdict, "falla", "y llega al informe como barrera, no como «no aplica» ni como «humano»");
  assert.equal(h.sev, "grave");
});

test("regresión: una firma en una página no cierra el criterio del sitio si falta otra", () => {
  const conEnlaces = '<main><h1>H</h1><p><a href="/a">Leer más</a> <a href="/b">Más información</a></p></main>';
  const a = registrarJuicio(cuad(conEnlaces, { url: "https://ej.test/a" }), {
    criterio: "2.4.4", veredicto: "cumple", auditor: "Suso",
    motivo: "El contexto de cada enlace deja claro a dónde lleva."
  });
  const b = cuad(conEnlaces, { url: "https://ej.test/b" });   // sin firmar

  const muestra = cuadernoDeMuestra([a, b]);
  const f = fichaDe(muestra, "2.4.4");
  assert.equal(f.decision, null, "un `cumple` en A no dice nada de B");
  assert.ok((f.loQueYaSabemos || []).some((s) => /Decidido a mano en 1 de 2/.test(s)),
    "pero el trabajo hecho se dice, para que nadie lo repita");
  assert.equal(findingsDelCuaderno(muestra).find((x) => x.c.n === "2.4.4").verdict, "humano");

  // Firmadas las dos, el sitio hereda la peor.
  const bFirmada = registrarJuicio(b, {
    criterio: "2.4.4", veredicto: "falla", auditor: "Ana",
    motivo: "Aquí «Leer más» se repite doce veces sin contexto que lo distinga."
  });
  const cerrada = cuadernoDeMuestra([a, bFirmada]);
  const g = fichaDe(cerrada, "2.4.4");
  assert.equal(g.veredicto, "falla", "el peor de los dos manda");
  assert.match(g.decision.auditor, /Ana/);
  assert.equal(findingsDelCuaderno(cerrada).find((x) => x.c.n === "2.4.4").verdict, "falla");
});

test("regresión: un falla firmado se lleva TODOS los elementos, no ocho", () => {
  // En el IRA cada elemento afectado es una fila de «Barreras» y alimenta
  // `num_barreras`: recortar a ocho no recortaba una lista de ejemplos, mentía en
  // el recuento. Veinte enlaces salían como ocho.
  const enlaces = Array.from({ length: 20 }, (_, i) => '<a href="/p' + i + '">Leer más</a>').join(" ");
  const c = cuad("<main><h1>H</h1><p>" + enlaces + "</p></main>", { url: "https://ej.test/a" });
  assert.equal(fichaDe(c, "2.4.4").queMirar.length, 20);

  const firmado = registrarJuicio(c, {
    criterio: "2.4.4", veredicto: "falla", auditor: "Suso",
    motivo: "Veinte enlaces «Leer más» sin contexto que los distinga."
  });
  const h = findingsDelCuaderno(firmado).find((x) => x.c.n === "2.4.4");
  assert.equal(h.nodes.length, 20, "una fila por elemento afectado");

  // En los demás veredictos el tope sigue, pero se dice cuántos quedan fuera.
  const aRevisar = registrarJuicio(c, {
    criterio: "2.4.4", veredicto: "revisar", auditor: "Suso",
    motivo: "Hay que verlos con el contexto delante, uno por uno."
  });
  const r = findingsDelCuaderno(aRevisar).find((x) => x.c.n === "2.4.4");
  assert.equal(r.nodes.length, 8);
  assert.ok(r.evid.some((e) => /Se listan 8 de 20/.test(e)), "y no se recorta en silencio");
});

/* ── Regresión: una muestra con huecos no puede declarar «no aplica» ──────── */

test("regresión: con páginas sin auditar, «no aplica en el sitio» se queda en pendiente", () => {
  const c = cuad("<main><h1>Hola</h1><p>Texto.</p></main>", { url: "https://ej.test/a" });

  // Sin huecos: el criterio se cierra, como debe.
  const limpia = cuadernoDeMuestra([c]);
  assert.equal(fichaDe(limpia, "1.2.5").aplica, false);
  assert.equal(findingsDelCuaderno(limpia).find((x) => x.c.n === "1.2.5").verdict, "no-aplica");

  // Con dos páginas caídas de tres, de esas dos no se sabe si tenían vídeo.
  const conHuecos = cuadernoDeMuestra([c], { sinAnalizar: ["https://ej.test/b", "https://ej.test/c"] });
  const f = fichaDe(conHuecos, "1.2.5");
  assert.equal(f.aplica, true, "no se puede afirmar que no venga al caso en el sitio");
  assert.equal(f.veredicto, null);
  assert.ok((f.loQueYaSabemos || []).some((s) => /no se auditaron/.test(s)), "y se dice por qué");
  assert.equal(findingsDelCuaderno(conHuecos).find((x) => x.c.n === "1.2.5").verdict, "humano");

  // Un falla firmado sí se mantiene: una barrera confirmada basta.
  const firmado = registrarJuicio(c, {
    criterio: "1.2.5", veredicto: "falla", auditor: "Suso",
    motivo: "Reproductor inyectado por JS sin audiodescripción."
  });
  const conFalla = cuadernoDeMuestra([firmado], { sinAnalizar: ["https://ej.test/b"] });
  assert.equal(fichaDe(conFalla, "1.2.5").veredicto, "falla");
});
