/**
 * 3.2.1 / 3.2.2 (cambio de contexto) y 2.2.2 (movimiento que no para) sobre
 * navegador y servidor REALES.
 *
 * Son los dos criterios de esta tanda que no se pueden verificar con un DOM
 * simulado: uno depende de que enfocar o cambiar un control provoque de verdad
 * una navegación, y el otro de que el motor de estilos resuelva la animación.
 *
 * El servidor es de verdad a propósito. Con `setContent` la página vive en
 * `about:blank`, y una navegación desde ahí no se comporta igual que la de un
 * sitio servido por HTTP — que es lo que el auditor va a auditar. Además deja
 * comprobar, de paso, que el cortafuegos no permitió que la navegación llegara
 * al servidor.
 *
 * Requiere Chromium. Se salta sola si no hay:  npm run test:integracion
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dynamicAnalyze } from "../../src/dynamic-analyze.js";
import { analyzeRendered } from "../../src/index.js";
import { chromiumDisponible } from "../../src/playwright-launch.js";

/* La sonda ARRANCA el navegador, no se conforma con que el paquete importe.
 * Tener `playwright` instalado no significa tener un Chromium descargado: en
 * una máquina sin `npx playwright install` el import funciona y el lanzamiento
 * falla, y entonces la batería no se salta — se cae con fallos rojos que no
 * dicen nada de la accesibilidad de nada. Es la misma sonda que usan las demás. */
const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const sonda = await chromiumDisponible(launchOptions);
const disponible = sonda.ok;
const skip = disponible ? false : "sin navegador (npx playwright install chromium): " + sonda.motivo;

/* Página con un `<select>` de los de siempre: el de «ir a» que navega al
 * cambiar de opción. Es el ejemplo canónico de fallo de 3.2.2. Los otros dos
 * controles son inocentes, y están para que el test note un falso positivo. */
const NAVEGA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ir a</title></head><body>
<main>
  <h1>Cambio de contexto</h1>
  <label for="ir">Ir a la sección</label>
  <select id="ir" onchange="location.href='/seccion/'+this.value">
    <option value="a">Sección A</option>
    <option value="b">Sección B</option>
  </select>
  <label for="n">Nombre</label><input id="n" name="n" value="Suso">
  <button type="button" id="ok">Guardar</button>
</main></body></html>`;

/* Un `focus` que roba el foco. No navega, y aun así es BARRERA: es el fallo
 * F55, y 3.2.1 —al contrario que 3.2.2— no tiene la salida del «salvo que se
 * haya avisado antes». El texto del criterio es tajante: cuando un componente
 * recibe el foco, no puede iniciar un cambio de contexto, y el foco está en la
 * lista de lo que es un cambio de contexto. Este test pedía `revisar` con esa
 * excepción como motivo, que es de 3.2.2: corregido al medir que la sonda, ya
 * arreglada, distingue «recibió el foco y lo soltó» de «no pudo recibirlo». */
const ROBA_FOCO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Foco</title></head><body>
<main>
  <h1>Foco que salta</h1>
  <label for="c">Acepto</label>
  <input type="checkbox" id="c" onfocus="document.getElementById('otro').focus()">
  <button type="button" id="otro">Otro sitio</button>
</main></body></html>`;

/* Nada raro: tres controles que se comportan. Sirve para el caso `pasa`. */
const LIMPIA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Limpia</title></head><body>
<main>
  <h1>Sin sorpresas</h1>
  <label for="a">Texto</label><input id="a" value="hola">
  <label for="s">Talla</label><select id="s"><option>S</option><option>M</option></select>
  <button type="button">Aceptar</button>
</main></body></html>`;

/* ── EL FORMULARIO DE CONTACTO DE TODA LA VIDA (v0.88.0) ────────────────────
 *
 * Ni un select, ni una casilla, ni un radio: tres campos de texto y un botón.
 * Medido en el sitio del autor, sus doce páginas de muestra son exactamente así,
 * y por eso 3.2.2 se quedaba sin comprobar — la sonda solo probaba `select`,
 * casillas y radios, corría, no encontraba nada y lo decía honradamente.
 *
 * El campo `#busca` incumple 3.2.2 del modo clásico: al confirmar lo escrito,
 * navega. Los otros dos se portan. Y `#tel` lleva un valor puesto de antemano:
 * la sonda NO puede tocarlo. */
const CONTACTO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contacto</title></head><body>
<main>
  <h1>Escríbeme</h1>
  <form action="/enviar" method="post">
    <label for="nom">Nombre</label><input id="nom" name="nom">
    <label for="mail">Correo</label><input type="email" id="mail" name="mail">
    <label for="tel">Teléfono</label><input type="tel" id="tel" name="tel" value="600111222">
    <label for="clave">Contraseña</label><input type="password" id="clave" name="clave">
    <label for="msg">Mensaje</label><textarea id="msg" name="msg"></textarea>
    <button type="submit">Enviar</button>
  </form>
  <label for="busca">Buscar</label>
  <input id="busca" onchange="location.href='/resultados?q='+this.value">
</main></body></html>`;

/* Y el formulario que NO se toca ni para medir: su `action` suena a borrar. La
 * lista de palabras es la misma que ya protege la fase de formularios. */
const DESTRUCTIVO_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Baja</title></head><body>
<main>
  <h1>Darse de baja</h1>
  <form action="/cuenta/eliminar" method="post">
    <label for="conf">Escribe BORRAR para confirmar</label><input id="conf" name="conf">
    <button type="submit">Darme de baja</button>
  </form>
</main></body></html>`;

/* El mismo formulario sin el campo que navega: sirve para medir el veredicto
 * cuando no hay nada que reprochar pero sí campos que los cerrojos no tocan. */
const CONTACTO_LIMPIO = CONTACTO.replace(/<label for="busca">[\s\S]*?<\/main>/, "</main>");
/* Y uno con TODO vacío: ningún cerrojo salta, así que el veredicto sí puede ser
 * `pasa`. Es la dirección contraria, la que evita que el `cumple-parcial` salga
 * siempre y deje de significar algo. */
const TEXTO_LIMPIO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Vacío</title></head><body>
<main><h1>Todo vacío</h1>
  <label for="t1">Nombre</label><input id="t1">
  <label for="t2">Mensaje</label><textarea id="t2"></textarea>
  <button type="button">Aceptar</button>
</main></body></html>`;

const PAGINAS = { "/navega": NAVEGA, "/roba-foco": ROBA_FOCO, "/limpia": LIMPIA,
                  "/contacto": CONTACTO, "/baja": DESTRUCTIVO_HTML,
                  "/contacto-limpio": CONTACTO_LIMPIO, "/texto-limpio": TEXTO_LIMPIO };

let server, base, recibido;
before(async () => {
  if (!disponible) return;
  recibido = [];
  server = createServer((req, res) => {
    recibido.push(req.method + " " + req.url);
    const cuerpo = PAGINAS[req.url.replace(/\?.*$/, "")] || LIMPIA;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(cuerpo);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise((r) => server.close(r)); });

test("3.2.2 real: un select que navega al cambiar de opción → falla", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/navega" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(f, "debería dictaminar 3.2.2");
  assert.equal(f.verdict, "falla");
  assert.match(f.evid.join(" "), /NAVEGA a otra p/);
  assert.ok(f.nodes.some((n) => /select/.test(n.locator)), "la barrera tiene que señalar al select: " + JSON.stringify(f.nodes));

  // La navegación NO salió a la red: el cortafuegos la abortó en el navegador.
  assert.ok(!recibido.some((l) => l.includes("/seccion/")), "la navegación llegó al servidor: " + JSON.stringify(recibido));
});

test("3.2.2 real: ni el input ni el botón se cuelan como falso positivo", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/navega" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2" && x.verdict === "falla");
  const locs = f.nodes.map((n) => n.locator).join(" ");
  assert.ok(!/button|input#n/.test(locs), "acusa a controles inocentes: " + locs);
});

test("3.2.1 real: un control que roba el foco al recibirlo → falla (F55)", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/roba-foco" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.1");
  assert.ok(f, "debería dictaminar 3.2.1");
  assert.equal(f.verdict, "falla", JSON.stringify(f && f.evid));
  assert.match(f.evid.join(" "), /SUELTA/);
  assert.match(f.evid.join(" "), /F55/);
  assert.ok(f.nodes.some((n) => /input#c/.test(n.locator)), "tiene que señalar al control: " + JSON.stringify(f.nodes));
});

test("3.2.1/3.2.2 real: página sin sorpresas → pasa, diciendo cuántos controles se probaron", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/limpia" }, { launchOptions, forms: "safe" });
  const foco = out.findings.find((x) => x.c.n === "3.2.1");
  assert.ok(foco, "falta 3.2.1");
  assert.equal(foco.verdict, "pasa", JSON.stringify(foco.evid));
  assert.match(foco.evid.join(" "), /Se han probado \d+ control/);

  /* 3.2.2 YA NO PUEDE SER `pasa` EN ESTE MONTAJE, y el cambio es correcto: su
   * `<input id="a" value="hola">` viene relleno, y desde v0.88.0 la sonda no
   * escribe en un campo con valor —puede ser dato del usuario—. Un campo sin
   * escribir es un campo sin comprobar, así que el criterio baja a
   * `cumple-parcial` y lo dice. Enfocar no escribe nada, por eso 3.2.1 sigue
   * siendo `pasa`: la diferencia entre los dos criterios está en eso. */
  const entrada = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(entrada, "falta 3.2.2");
  assert.equal(entrada.verdict, "cumple-parcial", JSON.stringify(entrada.evid));
  assert.match(entrada.evid.join(" "), /Se han probado \d+ control/);
  assert.match(entrada.evid.join(" "), /ya tenía un valor puesto/);
});

test("2.2.2 real: animación infinita → revisar; <marquee> → falla", { skip }, async () => {
  const html = '<style>@keyframes giro{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.gira{animation:giro 2s linear infinite;width:40px;height:40px;background:#333}</style>' +
    '<div class="gira"></div><marquee>Oferta del día</marquee>';
  const out = await analyzeRendered({ html }, { launchOptions });
  const m = out.measurements.filter((x) => x.crit === "2.2.2");
  assert.ok(m.length >= 2, "debería medir las dos: " + JSON.stringify(m));

  const anim = m.find((x) => /animaci/.test(x.detail));
  assert.ok(anim, "falta la animación CSS");
  assert.equal(anim.verdict, "revisar");
  assert.match(anim.detail, /infinita/);

  const marq = m.find((x) => /marquee/.test(x.detail));
  assert.ok(marq, "falta el marquee");
  assert.equal(marq.verdict, "falla");
  assert.ok(marq.path, "la barrera tiene que llevar su ruta CSS");
});

test("2.2.2 real: una transición corta no es una barrera", { skip }, async () => {
  const html = '<style>@keyframes ent{from{opacity:0}to{opacity:1}}' +
    '.ent{animation:ent 0.3s ease-out 1;width:40px;height:40px;background:#333}</style>' +
    '<div class="ent"></div>';
  const out = await analyzeRendered({ html }, { launchOptions });
  assert.deepEqual(out.measurements.filter((x) => x.crit === "2.2.2"), []);
});

test("2.2.2 real: una animación pausada no se reporta", { skip }, async () => {
  const html = '<style>@keyframes giro{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '.gira{animation:giro 2s linear infinite;animation-play-state:paused;width:40px;height:40px;background:#333}</style>' +
    '<div class="gira"></div>';
  const out = await analyzeRendered({ html }, { launchOptions });
  assert.deepEqual(out.measurements.filter((x) => x.crit === "2.2.2"), []);
});

/* ── 3.2.2 EN LOS CAMPOS DE TEXTO (v0.88.0) ──────────────────────────────────
 *
 * El último criterio del hueco que destapó la hoja de v0.85.0. La sonda solo
 * probaba `select`, casillas y radios; un formulario de contacto normal no tiene
 * ninguno de los tres, así que 3.2.2 se quedaba sin medir en el sitio del autor.
 * Escribir en un sitio ajeno es la parte delicada, y por eso la mitad de estas
 * pruebas son de los cerrojos y no de la detección. */

test("3.2.2 real: un campo de TEXTO que navega al confirmar → falla", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/contacto" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(f, "debería dictaminar 3.2.2 en un formulario sin selects");
  assert.equal(f.verdict, "falla", JSON.stringify(f.evid));
  assert.match(f.evid.join(" "), /NAVEGA a otra p/);
  assert.ok(f.nodes.some((n) => /busca/.test(n.locator)),
    "la barrera tiene que señalar al campo que navega: " + JSON.stringify(f.nodes));
  // Y la navegación no salió a la red: el cortafuegos la abortó en el navegador.
  assert.ok(!recibido.some((l) => l.includes("/resultados")),
    "la navegación llegó al servidor: " + JSON.stringify(recibido));
});

test("3.2.2 real: los campos que se portan no se acusan, y se dicen cuántos", { skip }, async () => {
  const out = await dynamicAnalyze({ url: base + "/contacto" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  const locs = f.nodes.map((n) => n.locator).join(" ");
  assert.ok(!/nom|mail|msg/.test(locs), "acusa a campos inocentes: " + locs);
  assert.match(f.evid.join(" "), /control/);
});

test("3.2.2 real: los campos que los cerrojos no tocan SE DECLARAN, con su motivo", { skip }, async () => {
  /* La regla de oro aplicada al criterio que acaba de dejar de estar sin medir:
   * un campo que la sonda no escribe —porque ya tenía valor, porque es una
   * contraseña o porque su formulario suena a destructivo— es un campo SIN
   * COMPROBAR, y callarlo sería firmar sobre lo que no se ha mirado.
   *
   * Y hubo que arreglar dos cosas al medirlo: la contraseña no entraba en la
   * rama, así que quedaba excluida EN SILENCIO y sin contar; y el veredicto
   * salía `pasa` —que `esConforme()` trata como conformidad— en la misma frase
   * que decía que de otro campo no se sabía nada. La evidencia era honrada y el
   * veredicto no, que es la peor combinación: al IRA viaja el veredicto. */
  const out = await dynamicAnalyze({ url: base + "/contacto-limpio" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(f, "falta 3.2.2");
  assert.equal(f.verdict, "cumple-parcial",
    "con campos sin escribir NO puede ser `pasa`: " + f.verdict + " — " + f.evid.join(" "));
  const ev = f.evid.join(" ");
  assert.match(ev, /2 campo\(s\) de texto NO se han escrito/, ev);
  assert.match(ev, /ya tenía un valor puesto/, ev);
  assert.match(ev, /tipo sensible \(password\)/, "la contraseña tiene que contarse, no saltarse en silencio: " + ev);
  assert.match(ev, /input#tel/, ev);
});

test("3.2.2 real: con todos los campos vacíos y nada que reprochar, SÍ es `pasa`", { skip }, async () => {
  // La dirección contraria: si no quedó nada sin escribir, el veredicto no se
  // degrada. Un `cumple-parcial` que sale siempre deja de significar algo.
  const out = await dynamicAnalyze({ url: base + "/texto-limpio" }, { launchOptions, forms: "safe" });
  const f = out.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(f, "falta 3.2.2");
  assert.equal(f.verdict, "pasa", f.evid.join(" "));
  assert.ok(!/NO se han escrito/.test(f.evid.join(" ")), f.evid.join(" "));
});

test("3.2.2 real: ni la contraseña ni el formulario que suena a destructivo", { skip }, async () => {
  /* Dos cerrojos en uno: en la página de baja el único campo está dentro de un
   * formulario cuyo `action` lleva «eliminar», así que no se escribe nada y 3.2.2
   * no puede salir dictaminado por ese campo. Y en el contacto, la contraseña
   * nunca se toca: si se hubiera tocado, aparecería entre los nodos. */
  const baja = await dynamicAnalyze({ url: base + "/baja" }, { launchOptions, forms: "safe" });
  const fb = baja.findings.find((x) => x.c.n === "3.2.2");
  if (fb && fb.nodes) {
    assert.ok(!fb.nodes.some((n) => /conf/.test(n.locator)),
      "se ha sondado un campo de un formulario destructivo: " + JSON.stringify(fb.nodes));
  }
  const cont = await dynamicAnalyze({ url: base + "/contacto" }, { launchOptions, forms: "safe" });
  const fc = cont.findings.find((x) => x.c.n === "3.2.2");
  assert.ok(!(fc.nodes || []).some((n) => /clave/.test(n.locator)),
    "la contraseña no se puede sondar: " + JSON.stringify(fc.nodes));
});
