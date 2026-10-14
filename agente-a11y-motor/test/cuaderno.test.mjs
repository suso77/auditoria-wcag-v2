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

test("un vídeo oculto no absuelve el criterio: lo deja a revisión", () => {
  // Este test afirmaba lo contrario hasta v0.37.0. Era una mentira cómoda:
  // `hidden` en el marcado inicial no significa que nadie lo vea nunca — un
  // carrusel, una pestaña o un modal lo enseñan en cuanto se interactúa, y el
  // motor estático no ejecuta ese guion. Decir "no aplica" sobre contenido
  // que no se ha podido mirar es exactamente lo que la regla de oro prohíbe.
  const c = cuad('<main><video hidden src="x.mp4"></video><p>Texto.</p></main>');
  const f = fichaDe(c, "1.2.5");
  assert.equal(f.aplica, true);
  assert.equal(f.veredicto, "revisar");
  assert.match(f.loQueYaSabemos.join(" "), /ocult/i);

  // Y sin ningún candidato, ni visible ni oculto, sigue siendo "no aplica".
  const vacio = cuad("<main><p>Solo texto.</p></main>");
  assert.equal(fichaDe(vacio, "1.2.5").aplica, false);
  assert.equal(fichaDe(vacio, "1.2.5").veredicto, "no-aplica");
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
  // El motivo cambió de redacción al invertir la regla (antes se excluía lo que
  // no fuera POST; ahora se excluye solo lo que SE RECONOCE como buscador), pero
  // lo que defiende este test —que una búsqueda no levanta el criterio— es lo mismo.
  assert.match(fichaDe(busca, "3.3.4").loQueYaSabemos.join(" "), /buscador|b[uú]squeda/);

  const compra = cuad('<form method="post" action="/pedido"><button>Comprar</button></form>');
  assert.equal(fichaDe(compra, "3.3.4").aplica, true);
});

test("regresión: un formulario que no declara método NO queda fuera de 3.3.4", () => {
  // La exclusión se apoyaba en method="post". Un formulario sin `method` envía
  // por GET, y uno de una aplicación moderna lo envía JavaScript. Medido con una
  // pantalla de pago: «no aplica», el criterio de los compromisos legales y
  // económicos cerrado sobre un campo de tarjeta, y con el botón diciendo
  // «Continuar», que no está ni puede estar en la lista de palabras.
  const pago = cuad('<form id="checkout"><label for="t">Tarjeta</label><input id="t" name="tarjeta"><button type="submit">Continuar</button></form>');
  assert.equal(fichaDe(pago, "3.3.4").aplica, true, JSON.stringify(fichaDe(pago, "3.3.4").loQueYaSabemos));
  assert.ok(fichaDe(pago, "3.3.4").queMirar.length >= 1);
  assert.match(fichaDe(pago, "3.3.4").loQueYaSabemos.join(" "), /El método no decide nada/);
  // Y el buscador sigue excluido: la regla acota por lo reconocible, no adivina.
  assert.equal(fichaDe(cuad('<form><input type="search" name="x"><button>Ir</button></form>'), "3.3.4").aplica, false);
  assert.equal(fichaDe(cuad('<form role="search"><input name="x"></form>'), "3.3.4").aplica, false);
});

test("regresión: 1.3.2 aplica a una página de párrafos, no solo a la que trae regiones", () => {
  // La lista de bloques se quedaba en encabezados, regiones, formularios y
  // tablas: una página de <div> y <p> salía «no aplica», y 1.3.2 va exactamente
  // de tres párrafos que se leen en un orden y se ven en otro.
  const parrafos = cuad('<div><p>Primero esto.</p><p>Después esto otro.</p><p>Y al final, esto.</p></div>');
  assert.equal(fichaDe(parrafos, "1.3.2").aplica, true);
  assert.ok(fichaDe(parrafos, "1.3.2").queMirar.length >= 3);
  // Un solo bloque sí queda fuera: no hay secuencia que alterar.
  assert.equal(fichaDe(cuad('<p>Una sola cosa.</p>'), "1.3.2").aplica, false);
  assert.equal(fichaDe(cuad(''), "1.3.2").aplica, false);
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

/* ── Regresión: «no aplica» es una AFIRMACIÓN, y era falsa ───────────────────
 *
 * Medido contra un sitio institucional español hecho para el mercado chino, con una
 * página entera de vídeos: el cuaderno declaró «1.2.5 no aplica: la página no tiene
 * ningún vídeo». Los vídeos estaban, en un reproductor que la lista blanca de
 * plataformas no conocía — y no estar en la lista se interpretaba como no haber
 * medios. Para un motor de fallo seguro el reparto es el contrario.
 */

test("regresión: los reproductores chinos cuentan como medios", () => {
  ["https://player.youku.com/embed/XNTk=",
   "https://player.bilibili.com/player.html?aid=1",
   "https://v.qq.com/txp/iframe/player.html?vid=x",
   "https://open.iqiyi.com/developer/player_js/coopPlayerIndex.html"
  ].forEach((src) => {
    const c = cuad('<main><h1>H</h1><iframe src="' + src + '"></iframe></main>', { url: "https://x.test/" });
    assert.equal(fichaDe(c, "1.2.5").aplica, true, src + " tiene que hacer aplicar 1.2.5");
    assert.equal(fichaDe(c, "1.2.4").aplica, true, src + " tiene que hacer aplicar 1.2.4");
  });
});

test("regresión: un marco que no se identifica deja el criterio PENDIENTE, no «no aplica»", () => {
  const c = cuad('<main><h1>H</h1><iframe src="https://travel.example.es/widget"></iframe></main>', { url: "https://x.test/" });
  const f = fichaDe(c, "1.2.5");
  assert.equal(f.aplica, true, "un marco desconocido puede ser un reproductor: no se puede afirmar que no aplique");
  assert.equal(f.veredicto, null);
  assert.ok((f.queMirar || []).some((m) => /NO se ha podido identificar/.test(m.detalle)),
    "y se dice qué marco hay que abrir: " + JSON.stringify((f.queMirar || []).map((m) => m.detalle)));
});

test("un marco que claramente no es un medio no deja el criterio pendiente", () => {
  // Dejar 1.2.5 pendiente por el iframe de Google Maps de la página de contacto es
  // ruido, no prudencia.
  ["https://maps.google.com/maps?q=madrid",
   "https://www.google.com/recaptcha/api2/anchor",
   "https://www.googletagmanager.com/ns.html?id=X"
  ].forEach((src) => {
    const c = cuad('<main><h1>H</h1><iframe src="' + src + '"></iframe></main>', { url: "https://x.test/" });
    assert.equal(fichaDe(c, "1.2.5").aplica, false, src + " no es un reproductor");
  });
});

test("regresión: el dominio de un reproductor se ancla a una frontera de host", () => {
  /* `le.com` (LeTV) sin anclar casa dentro de «google.com», así que CUALQUIER URL de
   * Google pasaba por reproductor reconocido y el iframe de Maps hacía aplicar 1.2.4
   * y 1.2.5. Es el mismo error que el `\s` colapsado: un patrón que casa dentro de
   * otra palabra. */
  const comoMedio = (src) => fichaDe(cuad('<main><h1>H</h1><iframe src="' + src + '"></iframe></main>',
    { url: "https://x.test/" }), "1.2.5");
  // Google no es un reproductor por contener «le.com».
  assert.equal(comoMedio("https://maps.google.com/maps").aplica, false);
  // Pero LeTV de verdad sí.
  const letv = comoMedio("https://le.com/ptv/vplay/1.html");
  assert.equal(letv.aplica, true);
  assert.ok(!(letv.queMirar || []).some((m) => /NO se ha podido identificar/.test(m.detalle)),
    "y se reconoce como reproductor, no como marco dudoso");
});

test("sin ningún marco ni medio, «no aplica» sigue siendo «no aplica»", () => {
  const c = cuad("<main><h1>H</h1><p>Solo texto.</p></main>", { url: "https://x.test/" });
  ["1.2.4", "1.2.5"].forEach((n) => {
    assert.equal(fichaDe(c, n).aplica, false);
    assert.match((fichaDe(c, n).loQueYaSabemos || [])[0], /marco embebido de ninguna clase/);
  });
});

/* ── Lo oculto y el CSS que no se puede leer (v0.37.0) ─────────────────────── */
test("un formulario oculto tampoco absuelve los criterios de formulario", () => {
  // Control A/B: el MISMO formulario, visible y escondido. Daba `no-aplica` al
  // esconderlo, que es declarar que en la página no hay nada a lo que el
  // criterio se refiera cuando lo que pasa es que no se ha podido mirar.
  const visible = '<form method="post" action="/alta"><input name="u" required><button>Enviar</button></form>';
  const v = cuad("<main>" + visible + "</main>");
  const o = cuad('<main><div style="display:none">' + visible + "</div></main>");
  // 3.3.7 queda fuera a propósito: no aplica a un formulario de un solo campo
  // por razones que no tienen que ver con que falten campos, y el censo de lo
  // oculto no debe convertir ese «no aplica» correcto en una duda inventada.
  ["3.3.3", "3.3.4"].forEach((n) => {
    assert.equal(fichaDe(v, n).aplica, true, n + " visible");
    assert.equal(fichaDe(o, n).aplica, true, n + " oculto: aplica, a revisión");
    assert.equal(fichaDe(o, n).veredicto, "revisar", n);
  });
  // Y sin formulario de ninguna clase, sigue siendo «no aplica».
  assert.equal(fichaDe(cuad("<main><p>Solo texto.</p></main>"), "3.3.3").veredicto, "no-aplica");
  // Con el formulario a la vista, el «no aplica» de 3.3.7 se mantiene: el censo
  // de lo oculto solo responde a «¿de verdad no hay nada de esto en la página?».
  assert.equal(fichaDe(v, "3.3.7").veredicto, "no-aplica");
});

test("2.3.1 no afirma que nada puede destellar si no ha leído el CSS", () => {
  const sinNada = cuad("<main><p>Texto.</p></main>", { cssLeido: true, cssBloqueadas: 0 });
  assert.equal(fichaDe(sinNada, "2.3.1").veredicto, "no-aplica");

  const conHojasCiegas = cuad("<main><p>Texto.</p></main>", { cssLeido: true, cssBloqueadas: 2 });
  assert.equal(fichaDe(conHojasCiegas, "2.3.1").veredicto, "revisar");
  assert.match(fichaDe(conHojasCiegas, "2.3.1").loQueYaSabemos.join(" "), /2 hoja/);

  const sinCss = cuad("<main><p>Texto.</p></main>", { cssLeido: false });
  assert.equal(fichaDe(sinCss, "2.3.1").veredicto, "revisar");
});

/* ── 2.4.4: sin nombre NO es lo mismo que nombre vago ──
 *
 * `NOMBRES_VACIOS` va anclada entre ^ y $ y no tiene alternativa vacía, así que
 * un enlace SIN nombre accesible no casaba, contaba como «tiene nombre propio»
 * y la ficha firmaba `cumple-parcial` escribiendo «todos tienen nombre propio».
 * Medido sobre una página con cuatro de seis enlaces sin nombre: una afirmación
 * falsa en la evidencia, con veredicto casi conforme y `queMirar` vacío — es
 * decir, diciendo que no hay nada que mirar en el criterio que más barreras
 * masivas produce en una auditoría real.
 */

test("regresión: enlaces sin nombre accesible NO salen como «todos tienen nombre propio»", () => {
  const f = fichaDe(cuad(`<main><h1>h</h1>
    <a href="/a"><img src="i.png"></a>
    <a href="/b"><svg viewBox="0 0 1 1"><path/></svg></a>
    <a href="/c"></a>
    <a href="/noticia">Incendio en el puerto de Vigo</a></main>`), "2.4.4");
  assert.notEqual(f.veredicto, "cumple-parcial", "tres de cuatro no tienen nombre");
  assert.equal(f.queMirar.length, 3, "y los tres van al expediente");
  assert.match(f.loQueYaSabemos.join(" "), /nombre que no existe no puede describir el destino/);
  assert.match(f.pregunta, /3 de los 4/);
});

test("2.4.4 solo firma «cumple-parcial» cuando TODOS tienen nombre y ninguno es vago", () => {
  const bien = fichaDe(cuad('<main><h1>h</h1><a href="/a">Incendio en el puerto</a><a href="/b">Pleno de octubre</a></main>'), "2.4.4");
  assert.equal(bien.veredicto, "cumple-parcial");
  assert.match(bien.loQueYaSabemos.join(" "), /tienen nombre accesible/);
  const vago = fichaDe(cuad('<main><h1>h</h1><a href="/a">Incendio</a><a href="/b">Leer más</a></main>'), "2.4.4");
  assert.equal(vago.veredicto, null, "un nombre vago deja el criterio pendiente de juicio");
});

test("el nombre accesible lo calcula el motor: aria-labelledby cuenta", () => {
  // El cálculo propio del cuaderno se dejaba fuera `aria-labelledby`, así que un
  // enlace nombrado así se leía como SIN nombre — y con el arreglo de arriba eso
  // habría sido un falso positivo nuevo en la dirección contraria.
  const f = fichaDe(cuad('<main><h1>h</h1><a href="/a" aria-labelledby="t1">x</a><span id="t1">Ver el expediente completo</span></main>'), "2.4.4");
  assert.equal(f.veredicto, "cumple-parcial", JSON.stringify(f.loQueYaSabemos));
});

/* ── «No aplica» en 1.4.5 y 3.3.8: dos supuestos que no eran los únicos ── */

test("1.4.5: una imagen de FONDO no deja el criterio en «no aplica»", () => {
  // El hero con el titular incrustado —el caso típico de 1.4.5— casi nunca es
  // un `<img>`: es un `background-image`. Sin mirarlo, una página cuya única
  // imagen es de fondo firmaba «no aplica · no tiene imágenes con contenido».
  const conFondo = fichaDe(cuad('<main><h1>h</h1><div class="hero">Bienvenida a la provincia</div></main>',
    { css: ".hero{background-image:url(hero.jpg)}" }), "1.4.5");
  assert.notEqual(conFondo.veredicto, "no-aplica");
  assert.match(conFondo.loQueYaSabemos.join(" "), /imágenes de fondo/);
  // Y un degradado no es una imagen con texto: atar de más también estorba.
  const degradado = fichaDe(cuad('<main><h1>h</h1><div class="hero">x</div></main>',
    { css: ".hero{background:linear-gradient(#000,#fff)}" }), "1.4.5");
  assert.equal(degradado.veredicto, "no-aplica");
});

test("3.3.8: un acceso por código de un solo uso SÍ es autenticación", () => {
  // 3.3.8 admite el código solo si se puede pegar, así que un acceso sin
  // contraseña le aplica de lleno. Antes firmaba «no hay proceso de
  // autenticación que evaluar» sobre un formulario de acceso.
  const otp = fichaDe(cuad('<main><h1>h</h1><form><label for="c">Código recibido</label>' +
    '<input type="text" id="c" name="otp" autocomplete="one-time-code"><button>Entrar</button></form></main>'), "3.3.8");
  assert.notEqual(otp.veredicto, "no-aplica");
  assert.match(otp.loQueYaSabemos.join(" "), /pegarlo/);
  assert.ok(otp.queMirar.length >= 1);
  const porNombre = fichaDe(cuad('<main><h1>h</h1><form><input type="email" name="correo">' +
    '<input type="text" name="codigo_verificacion"><button>Entrar</button></form></main>'), "3.3.8");
  assert.notEqual(porNombre.veredicto, "no-aplica");
  // Un buscador no es un acceso: la señal tiene que seguir siendo estrecha.
  const buscador = fichaDe(cuad('<main><h1>h</h1><form><input type="text" name="buscar"><button>Buscar</button></form></main>'), "3.3.8");
  assert.equal(buscador.veredicto, "no-aplica");
});

test("regresión: un paso de UN solo campo también cuenta para el 3.3.7 de la muestra", () => {
  // El atajo `campos.length < 2` salía antes de calcular los grupos y sin
  // `datos`, así que un paso con un único campo no aportaba nada al cruce entre
  // páginas. Medido: paso 1 con un solo «Correo electrónico» y paso 3 con ese
  // mismo correo daban, en el cuaderno de la muestra, 3.3.7 «no aplica · no
  // viene al caso en ninguna de las 2 páginas» — el criterio cerrado justo
  // sobre el caso para el que existe.
  const paso1 = cuadernoDeJuicio(doc('<form><label for="e">Correo electrónico</label>' +
    '<input id="e" name="email" autocomplete="email"></form>'), { url: "https://x/paso-1" });
  const paso3 = cuadernoDeJuicio(doc('<form><label for="e3">Correo electrónico</label>' +
    '<input id="e3" name="email" autocomplete="email">' +
    '<label for="t">Teléfono</label><input id="t" name="tel"></form>'), { url: "https://x/paso-3" });

  // El paso de un solo campo guarda su grupo aunque el criterio no aplique en él.
  const f1 = fichaDe(paso1, "3.3.7");
  assert.equal(f1.aplica, false, "en esa página sola no hay repetición");
  assert.ok(f1.datos && f1.datos.grupos, "pero los datos viajan igual");
  assert.deepEqual(Object.keys(f1.datos.grupos), ["autocomplete:email"]);

  // Y la muestra ve la repetición entre páginas.
  const m = cuadernoDeMuestra([paso1, paso3], { sitio: "https://x" }).criterios.find((c) => c.criterio === "3.3.7");
  assert.equal(m.aplica, true, "3.3.7 tiene que reabrirse: " + (m.loQueYaSabemos || []).join(" | "));
  assert.equal(m.veredicto, null, "y queda pendiente de juicio, no cerrado");
  assert.match(m.loQueYaSabemos.join(" "), /autocomplete:email/);
  assert.match(m.loQueYaSabemos.join(" "), /ENTRE páginas/);
});

/* ── El cuaderno concreta lo que nadie ha mirado; no tapa lo ya medido ───────
 *
 * Descubierto al añadir la medición de 1.3.2: la capa de render detectaba los
 * tres pasos de una receta reordenados con `order` —orden de lectura 1, 2, 3 y
 * orden visual 3, 2, 1, medido sobre el navegador— y `aplicaCuaderno` BORRABA
 * ese hallazgo por ser un `revisar` de uno de los once, dejando en el informe
 * la pregunta genérica y ni una línea del dato.
 */
test("aplicaCuaderno conserva el `revisar` de una capa que MIDE", () => {
  const medido = {
    c: { n: "1.3.2", t: "Secuencia significativa", lvl: "A" }, verdict: "revisar",
    origen: "medición", scope: "render", evid: ["el contenido se lee en un orden y se ve en otro, por `order`"]
  };
  const libro = cuad("<main><h1>T</h1><p>uno</p><p>dos</p></main>");
  const out = aplicaCuaderno([medido], libro);
  const mio = out.find((f) => f.c.n === "1.3.2" && f.origen === "medición");
  assert.ok(mio, "el hallazgo medido no puede desaparecer: " + JSON.stringify(out.map((f) => [f.c.n, f.verdict, f.origen])));
  // Y la ficha del cuaderno sigue estando, con su expediente.
  assert.ok(out.some((f) => f.c.n === "1.3.2" && f.scope === "juicio"), "la ficha del cuaderno también se queda");
});

test("aplicaCuaderno sigue barriendo el `humano` genérico del motor", () => {
  const placeholder = { c: { n: "1.3.2", t: "Secuencia significativa", lvl: "A" }, verdict: "humano", evid: ["Requiere evaluación humana."] };
  const out = aplicaCuaderno([placeholder], cuad("<main><h1>T</h1><p>uno</p><p>dos</p></main>"));
  assert.ok(!out.some((f) => f.c.n === "1.3.2" && f.verdict === "humano" && f.scope !== "juicio"),
    "el relleno del motor es justo lo que el cuaderno viene a sustituir");
});

/* ── 1.3.3: el léxico, medido con frases de respuesta sabida ─────────────────
 *
 * El anterior se le escapaba la mitad: solo artículo determinado («el botón
 * verde» sí, «un recuadro rojo» no), la forma solo en botón/icono, nada del
 * TAMAÑO ni del SONIDO —que el criterio nombra expresamente—, nada en gallego
 * y «el botón de abajo» tampoco. Y tenía un falso positivo claro: «más abajo»
 * a secas en prosa normal, que no es una instrucción de operar nada.
 */
const frases133 = (t) => {
  const c = cuad('<main><h1>T</h1><p>' + t + "</p></main>");
  const f = fichaDe(c, "1.3.3");
  return f.aplica === false ? [] : (f.queMirar || []).map((m) => m.detalle);
};
const pilla = (t, que) => {
  const h = frases133(t);
  assert.ok(h.length, "no pilló nada en: " + t);
  if (que) assert.ok(h.some((x) => x.indexOf("[" + que + "]") === 0), que + " esperado en: " + JSON.stringify(h));
};

test("1.3.3: color, forma, tamaño, posición y sonido, con cualquier artículo", () => {
  pilla("Pulse el botón verde para continuar", "color");
  pilla("Rellena los campos del cuadro azul", "color");
  pilla("Verás un recuadro rojo con el error", "color");
  pilla("Haz clic en el icono redondo", "forma");
  pilla("Selecciona la casilla cuadrada", "forma");
  pilla("Pulsa el botón grande de la cabecera", "tamaño");
  pilla("Usa el menú de la izquierda", "posición");
  pilla("El botón de abajo guarda los cambios", "posición");
  pilla("Pulsa el botón de la derecha", "posición");
  pilla("Cuando oigas el pitido, pulsa Enter", "sonido");
});

test("1.3.3: también en gallego, que es la mitad de los sitios de aquí", () => {
  pilla("Preme o botón verde para continuar", "color");
  pilla("Usa a columna da dereita", "posición");
});

test("1.3.3: y la prosa normal NO es una instrucción sensorial", () => {
  // «más abajo» a secas era un falso positivo: aparece en cualquier página.
  [
    "Más abajo encontrarás el teléfono de contacto.",
    "A continuación se explica el proceso de solicitud.",
    "El plazo se amplía hasta el 30 de junio.",
    "La casilla de verificación es obligatoria.",
    "Pulsa el botón Enviar para terminar.",
    "El color corporativo es el verde desde 1998."
  ].forEach((t) => assert.deepEqual(frases133(t), [], "falso positivo en: " + t));
});

test("1.3.3: sin ninguna frase sensorial, el criterio NO aplica y lo dice", () => {
  const f = fichaDe(cuad("<main><h1>T</h1><p>Texto normal sin instrucciones.</p></main>"), "1.3.3");
  assert.equal(f.aplica, false);
  assert.match(f.loQueYaSabemos.join(" "), /solo se ha mirado el TEXTO/, "y dice qué no ha mirado");
});
