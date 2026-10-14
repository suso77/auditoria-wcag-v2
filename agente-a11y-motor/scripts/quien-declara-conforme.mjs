#!/usr/bin/env node
/**
 * ¿QUIÉN PUEDE DECLARAR CONFORME QUÉ, Y CON QUÉ BASE?
 *
 * La regla de oro del proyecto dice que un criterio sin comprobar no puede
 * exportarse como conforme. El riesgo gemelo del falso positivo es este: una
 * capa que mide una PARTE y firma `pasa` por el todo — y es el más difícil de
 * ver, porque un informe que absuelve no se queja.
 *
 * Ya ha pasado tres veces: 1.4.11 medía el relleno del control y firmaba el
 * criterio; 3.2.1 sondaba sin foco de documento y firmaba «ninguno provoca
 * nada»; 2.4.3 comparaba los 25 primeros controles y firmaba «la tabulación
 * sigue el orden visual de la página». Las tres se encontraron mirando esta
 * lista y yendo a comprobar una por una.
 *
 * Esto no juzga: LOCALIZA. Saca cada sitio del código que emite un veredicto
 * conforme (`pasa` o `cumple`) y a qué criterio, para repasarlos a mano. La
 * pregunta que hay que hacerle a cada línea es siempre la misma: ¿lo que se ha
 * medido cubre TODO lo que pide el criterio, o solo una parte?
 *
 * Y LA ABSOLUCIÓN VIENE EN DOS FORMAS. La otra es «no aplica», que es peor:
 * un criterio conforme al menos deja su fila en el informe, y uno marcado «no
 * aplica» desaparece sin que nadie lo mire. Con `--no-aplica` se saca esa
 * segunda lista. También ahí salieron cinco huecos midiendo casos de respuesta
 * sabida: un vídeo enlazado, un reproductor hecho con JavaScript, un cartel con
 * texto puesto como imagen de fondo en el atributo `style`, un GIF de fondo y
 * los enlaces de un mapa de imagen.
 *
 *   node scripts/quien-declara-conforme.mjs            # quién puede firmar conforme
 *   node scripts/quien-declara-conforme.mjs 2.4.3      # solo un criterio
 *   node scripts/quien-declara-conforme.mjs --no-aplica    # quién puede cerrar por «no aplica»
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WCAG22 } from "../src/engine.js";
import { esConforme } from "../src/verdicts.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const modoNoAplica = args.indexOf("--no-aplica") !== -1;
const filtro = args.filter(function (a) { return a.indexOf("--") !== 0; })[0] || null;

const VOCABULARIO = ["cumple", "pasa", "cumple-parcial", "revisar", "humano", "no-aplica", "falla"];
const conformes = VOCABULARIO.filter(esConforme);
if (modoNoAplica) {
  console.log("Quién puede cerrar un criterio con «no aplica».");
  console.log("Un `no-aplica` no es conformidad, pero saca el criterio del informe: si la");
  console.log("decisión se toma mal, nadie lo mira nunca.\n");
} else {
  console.log("Veredictos que `esConforme()` acepta: " + conformes.join(", "));
  console.log("(cualquier otro NO cuenta como conformidad en los entregables)\n");
}

const dir = join(raiz, "src");
const ficheros = (await readdir(dir)).filter((f) => f.endsWith(".js"));
const re = modoNoAplica ? /no-aplica|noAplica\(/ : new RegExp('"(' + conformes.join("|") + ')"');
const porCrit = {};

for (const f of ficheros) {
  const lineas = (await readFile(join(dir, f), "utf8")).split("\n");
  lineas.forEach((l, i) => {
    const t = l.trim();
    // Los comentarios no emiten veredictos.
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;
    if (!re.test(l)) return;
    // El número de criterio suele estar en la misma línea o muy cerca: así se
    // escriben las llamadas, `F("1.4.3", "pasa", …)` o `crit: … verdict: …`.
    const cerca = lineas.slice(Math.max(0, i - 2), i + 3).join(" ");
    const nums = cerca.match(/\b\d\.\d\.\d+\b/g) || [];
    const vs = modoNoAplica ? ["no-aplica"]
      : [...new Set((l.match(new RegExp(re.source, "g")) || []).map((x) => x.replace(/"/g, "")))];
    new Set(nums).forEach((n) => {
      if (!WCAG22.some((c) => c.n === n)) return;
      (porCrit[n] = porCrit[n] || []).push({ f, i: i + 1, v: vs.join("/"), txt: t.slice(0, 100) });
    });
  });
}

const nums = Object.keys(porCrit)
  .filter((n) => !filtro || n === filtro)
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

const QUE = modoNoAplica ? "cerrar con «no aplica»" : "declarar conformes";
if (!nums.length) {
  console.log(filtro ? "Ninguna capa puede " + QUE + " " + filtro + "." : "Ninguna capa puede " + QUE + " nada (raro: revisa el barrido).");
} else {
  console.log("Criterios que alguna capa puede " + QUE + ": " + nums.length + " de " + WCAG22.length + "\n");
  nums.forEach((n) => {
    const c = WCAG22.find((x) => x.n === n);
    console.log("── " + n + "  " + c.t + "  (" + c.lvl + ")");
    porCrit[n].forEach((e) => console.log("     " + (e.v + "  ").padEnd(14) + e.f + ":" + e.i + "  " + e.txt));
    console.log("");
  });
  if (modoNoAplica) {
    console.log("La pregunta para cada línea: ¿se ha mirado TODO lo que haría aplicar el criterio?");
    console.log("Un medio también puede estar enlazado, servido por JavaScript o puesto de fondo en CSS.");
  } else {
    console.log("La pregunta para cada línea: ¿lo medido cubre TODO lo que pide el criterio?");
    console.log("Si cubre una parte, el veredicto es `cumple-parcial`, no `pasa`.");
  }
}
