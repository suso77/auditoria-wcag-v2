#!/usr/bin/env node
/**
 * CLI del motor de accesibilidad. Consume la MISMA librería que el artifact web.
 *
 *   a11y-motor componente.html            # informe legible
 *   a11y-motor componente.html --json     # informe en JSON
 *   cat componente.html | a11y-motor      # desde stdin
 *
 * CÓDIGOS DE SALIDA. Antes eran tres —0 sin barreras, 1 con barreras, 2 sin
 * elemento analizable— y el 1 estaba compartido con el fallo: Node sale con 1
 * ante una excepción no capturada, así que `a11y-motor fichero-que-no-existe.html`
 * salía 1 con stdout VACÍO y un volcado de pila en stderr, exactamente igual que
 * «he encontrado barreras». Medido: un CI que hace `a11y-motor x.html || echo
 * BARRERAS` canta barreras por una ruta mal escrita, y un script que parsea
 * `--json` recibe cero bytes donde esperaba un informe — y si es indulgente con
 * el parseo, una lista de barreras vacía se lee como página limpia. Es la regla
 * de oro del proyecto en el borde del proceso: el fallo no puede parecerse al
 * veredicto.
 *
 *   0  sin barreras deterministas
 *   1  hay barreras                       ← los tres de siempre, sin cambios
 *   2  sin elemento analizable
 *   3  no pude leer la entrada            ← ruta inexistente, directorio, permiso
 *   4  error inesperado del motor         ← esto es un fallo del agente, no tuyo
 *
 * 3 y 4 son nuevos y solo ocupan casos que antes caían en el 1 ambiguo: nada de
 * lo que ya salía 0, 1 o 2 cambia de código. Y los dos quieren decir lo mismo de
 * fondo: NO HAY VEREDICTO.
 */
import { readFile } from "fs/promises";
import { DOMParser } from "linkedom";
import { setDOMParser, understand, analyze, enClause } from "../src/index.js";

setDOMParser(DOMParser);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const wantsHelp = args.includes("--help") || args.includes("-h");
const file = args.find((a) => !a.startsWith("-"));

/* Un fallo se cuenta como fallo, no como informe.
 *
 * En `--json` el objeto de error NO lleva `summary` ni `barreras`, ni siquiera
 * vacíos: un consumidor que mire `parsed.barreras.length === 0` concluiría
 * «página limpia» a partir de una excepción. Lleva `error` y nada más, de modo
 * que cualquier lectura razonable falle en vez de absolver. */
function muere(codigo, mensaje, detalle) {
  if (asJson) console.log(JSON.stringify({ error: mensaje, detalle: detalle || null, veredicto: null }, null, 2));
  else console.error("✕ " + mensaje + (detalle ? "\n  " + detalle : ""));
  process.exit(codigo);
}

if (wantsHelp) {
  console.log([
    "Uso: a11y-motor [archivo.html] [--json]",
    "  Analiza un componente HTML (WCAG 2.2 A+AA / EN 301 549).",
    "  Sin archivo, lee de stdin.",
    "",
    "  Códigos de salida:",
    "    0  sin barreras deterministas",
    "    1  hay barreras",
    "    2  sin elemento analizable en el fragmento",
    "    3  no se pudo leer la entrada",
    "    4  error inesperado del motor",
    "  3 y 4 quieren decir que NO hay veredicto: no los confundas con el 1."
  ].join("\n"));
  process.exit(0);
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

async function readStdin() {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

/* Leer la entrada es lo PRIMERO que puede fallar y lo que más veces falla: una
 * ruta mal escrita, un directorio, un fichero sin permiso. Nada de eso es un
 * veredicto, así que sale con 3 y lo dice en una frase en vez de volcar la pila
 * de Node y salir con el mismo 1 que «hay barreras». */
let html;
try {
  html = file ? await readFile(file, "utf8") : await readStdin();
} catch (e) {
  const codigo = (e && e.code) || "";
  const porQue = codigo === "ENOENT" ? "no existe"
    : codigo === "EISDIR" ? "es un directorio, no un fichero"
    : codigo === "EACCES" || codigo === "EPERM" ? "no se puede leer (permisos)"
    : ((e && e.message) || String(e)).split("\n")[0];
  muere(3, "No pude leer " + (file ? "«" + file + "»" : "la entrada estándar") + ": " + porQue,
    "No hay informe: esto no es ni «hay barreras» ni «no hay barreras».");
}

/* Y de aquí al final, cualquier excepción del motor sale con 4.
 *
 * Sin esto, un fallo interno —un hallazgo malformado, un criterio que revienta—
 * salía con el 1 de Node, que es el código de «hay barreras». Un fallo del
 * agente presentándose como un resultado del agente. */
let a, model;
try {
  model = understand(html);
  if (!model) {
    if (asJson) console.log(JSON.stringify({ error: "sin-elemento-analizable", veredicto: null }, null, 2));
    else console.error("No se encontró ningún elemento analizable en el fragmento.");
    process.exit(2);
  }
  a = analyze(model);
} catch (e) {
  muere(4, "El motor falló analizando el fragmento: " + ((e && e.message) || String(e)).split("\n")[0],
    "Esto es un fallo del agente, no de tu HTML. No hay veredicto.");
}
const fallas = a.findings.filter((f) => f.verdict === "falla");

if (asJson) {
  console.log(JSON.stringify({
    summary: a.summary,
    barreras: fallas.map((f) => ({
      criterio: f.c.n, nombre: f.c.t, nivel: f.c.lvl, severidad: f.sev,
      en: enClause(f.c.n), evidencia: f.evid.map(stripTags),
      donde: (f.nodes || []).map((n) => n.locator)
    }))
  }, null, 2));
} else {
  const s = a.summary;
  const titulo = (model.all.length === 1)
    ? (model.primary.role + (model.primary.name.name ? " «" + model.primary.name.name + "»" : ""))
    : (model.pattern ? model.pattern.name : model.primary.role);
  console.log("\nInforme de conformidad — " + titulo);
  /* «Cumplen» son los que cumplen, y ninguno más.
   *
   * `cumple-parcial` quiere decir que el motor midió la presencia y la calidad la
   * juzga una persona (el texto de un `alt`, el nombre de un encabezado). Contarlo
   * como conforme —que es lo que hacía este resumen— le decía al lector que el
   * 1.1.1 estaba resuelto cuando nadie había leído un solo alternativo. Va con lo
   * que queda por revisar, que es donde está el trabajo. */
  const aRevisar = s.revisar + s.humano + s["cumple-parcial"];
  console.log(s.falla + " barreras · " + aRevisar + " a revisar · " + (s.cumple + s.pasa) + " cumplen" +
    (s["no-aplica"] ? " · " + s["no-aplica"] + " no aplican" : "") +
    " · de " + a.findings.length + " criterios evaluados");
  if (s["cumple-parcial"]) {
    console.log("  (" + s["cumple-parcial"] + " de los que hay que revisar cumplen la parte automatizable; lo que falta es juicio humano sobre la calidad del texto.)");
  }
  console.log("");
  if (!fallas.length) {
    console.log("  Sin barreras deterministas en este componente.");
  } else {
    for (const f of fallas.sort((x, y) => (x.sev < y.sev ? 1 : -1))) {
      const en = enClause(f.c.n) ? " · EN " + enClause(f.c.n) : " · (aún no en la EN vigente)";
      console.log("  ✕ [" + f.c.n + "] " + f.c.t + " — " + f.c.lvl + " · " + f.sev + en);
      if (f.nodes && f.nodes.length) console.log("      en: " + f.nodes.map((n) => n.locator + (n.name ? " «" + n.name + "»" : "")).join(", "));
      f.evid.forEach((e) => console.log("      · " + stripTags(e)));
    }
  }
  console.log("");
}

process.exit(fallas.length ? 1 : 0);
