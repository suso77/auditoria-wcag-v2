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
  console.log(s.falla + " barreras · " + (s.revisar + s.humano) + " a revisar · " + s.cumple + " cumplen · de " + a.findings.length + " criterios evaluados\n");
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
