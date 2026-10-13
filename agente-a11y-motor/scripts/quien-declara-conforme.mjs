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
 *   node scripts/quien-declara-conforme.mjs            # la lista entera
 *   node scripts/quien-declara-conforme.mjs 2.4.3      # solo un criterio
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WCAG22 } from "../src/engine.js";
import { esConforme } from "../src/verdicts.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const filtro = process.argv[2] || null;

const VOCABULARIO = ["cumple", "pasa", "cumple-parcial", "revisar", "humano", "no-aplica", "falla"];
const conformes = VOCABULARIO.filter(esConforme);
console.log("Veredictos que `esConforme()` acepta: " + conformes.join(", "));
console.log("(cualquier otro NO cuenta como conformidad en los entregables)\n");

const dir = join(raiz, "src");
const ficheros = (await readdir(dir)).filter((f) => f.endsWith(".js"));
const re = new RegExp('"(' + conformes.join("|") + ')"');
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
    const vs = [...new Set((l.match(new RegExp(re.source, "g")) || []).map((x) => x.replace(/"/g, "")))];
    new Set(nums).forEach((n) => {
      if (!WCAG22.some((c) => c.n === n)) return;
      (porCrit[n] = porCrit[n] || []).push({ f, i: i + 1, v: vs.join("/"), txt: t.slice(0, 100) });
    });
  });
}

const nums = Object.keys(porCrit)
  .filter((n) => !filtro || n === filtro)
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (!nums.length) {
  console.log(filtro ? "Ninguna capa declara conforme " + filtro + "." : "Ninguna capa declara conforme nada (raro: revisa el barrido).");
} else {
  console.log("Criterios que alguna capa puede declarar conformes: " + nums.length + " de " + WCAG22.length + "\n");
  nums.forEach((n) => {
    const c = WCAG22.find((x) => x.n === n);
    console.log("── " + n + "  " + c.t + "  (" + c.lvl + ")");
    porCrit[n].forEach((e) => console.log("     " + e.v.padEnd(8) + e.f + ":" + e.i + "  " + e.txt));
    console.log("");
  });
  console.log("La pregunta para cada línea: ¿lo medido cubre TODO lo que pide el criterio?");
  console.log("Si cubre una parte, el veredicto es `cumple-parcial`, no `pasa`.");
}
