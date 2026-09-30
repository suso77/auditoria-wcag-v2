#!/usr/bin/env node
/**
 * CLI del motor de accesibilidad. Consume la MISMA librería que el artifact web.
 *
 *   a11y-motor componente.html            # informe legible
 *   a11y-motor componente.html --json     # informe en JSON
 *   cat componente.html | a11y-motor      # desde stdin
 *
 * Código de salida: 1 si hay barreras (útil en CI), 0 si no.
 */
import { readFile } from "fs/promises";
import { DOMParser } from "linkedom";
import { setDOMParser, understand, analyze, enClause } from "../src/index.js";

setDOMParser(DOMParser);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const wantsHelp = args.includes("--help") || args.includes("-h");
const file = args.find((a) => !a.startsWith("-"));

if (wantsHelp) {
  console.log("Uso: a11y-motor [archivo.html] [--json]\n  Analiza un componente HTML (WCAG 2.2 A+AA / EN 301 549).\n  Sin archivo, lee de stdin. Salida 1 si hay barreras.");
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

const html = file ? await readFile(file, "utf8") : await readStdin();

const model = understand(html);
if (!model) {
  if (asJson) console.log(JSON.stringify({ error: "sin-elemento-analizable" }));
  else console.error("No se encontró ningún elemento analizable en el fragmento.");
  process.exit(2);
}

const a = analyze(model);
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
