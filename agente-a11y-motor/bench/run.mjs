/**
 * Banco de precisión del motor contra un corpus de referencia.
 *
 *   node bench/run.mjs            # informe legible
 *   node bench/run.mjs --json     # informe JSON
 *
 * Mide el cálculo de nombre accesible (accname) del motor contra casos
 * transcritos de los Web Platform Tests (WPT, accname/name/*), citando la
 * fuente. Los casos que dependen de CSS (contenido ::before/::after,
 * text-transform) o de matices de render que un motor sin layout no puede
 * resolver se marcan `skip` con su motivo, y NO cuentan contra la precisión:
 * se informan aparte como limitaciones conocidas.
 */
import { DOMParser } from "linkedom";
import { setDOMParser, accessibleName, implicitRole } from "../src/index.js";
import { ACCNAME_CASES } from "./corpus/accname.cases.mjs";

setDOMParser(DOMParser);

const asJson = process.argv.includes("--json");

function roleOf(el) {
  const explicit = el.getAttribute("role");
  return explicit ? explicit.split(/\s+/)[0] : implicitRole(el);
}

function runCase(c) {
  const doc = new DOMParser().parseFromString('<div id="__r">' + c.html + "</div>", "text/html");
  const root = doc.getElementById("__r");
  const el = root.querySelector(c.sel || ".ex");
  if (!el) return { name: c.name, status: "error", detail: "selector no encontró elemento (" + (c.sel || ".ex") + ")" };
  const got = accessibleName(el, doc, roleOf(el)).name;
  const ok = got === c.expected;
  return { name: c.name, status: ok ? "pass" : "fail", expected: c.expected, got: got, cite: c.cite };
}

const groups = {};
const results = [];
let pass = 0, fail = 0, skipped = 0;
const failures = [];
const skips = [];

for (const c of ACCNAME_CASES) {
  const g = c.group || "otros";
  groups[g] = groups[g] || { pass: 0, fail: 0, skip: 0 };
  if (c.skip) { skipped++; groups[g].skip++; skips.push({ name: c.name, motivo: c.skip, cite: c.cite }); continue; }
  const r = runCase(c);
  results.push(r);
  if (r.status === "pass") { pass++; groups[g].pass++; }
  else { fail++; groups[g].fail++; failures.push(r); }
}

const scored = pass + fail;
const precision = scored ? (100 * pass / scored) : 0;

if (asJson) {
  console.log(JSON.stringify({ total: ACCNAME_CASES.length, pass, fail, skipped, precision: Number(precision.toFixed(1)), groups, failures, skips }, null, 2));
} else {
  console.log("\n═══ Banco de precisión · accname (fuente: WPT accname/name) ═══\n");
  console.log("Casos en ámbito: " + scored + "   ✓ " + pass + "   ✗ " + fail + "   ·   Fuera de alcance (skip): " + skipped);
  console.log("PRECISIÓN accname (en ámbito): " + precision.toFixed(1) + "%\n");
  console.log("Por grupo:");
  Object.keys(groups).sort().forEach(function (g) {
    const x = groups[g];
    console.log("  " + g.padEnd(22) + "✓ " + x.pass + "  ✗ " + x.fail + (x.skip ? "  (skip " + x.skip + ")" : ""));
  });
  if (failures.length) {
    console.log("\nDivergencias (a investigar):");
    failures.forEach(function (f) {
      console.log('  ✗ ' + f.name + '\n      esperado: ' + JSON.stringify(f.expected) + '   obtenido: ' + JSON.stringify(f.got) + (f.cite ? "\n      fuente: " + f.cite : ""));
    });
  }
  if (skips.length) {
    console.log("\nLimitaciones conocidas (fuera del alcance de un motor sin CSS/layout):");
    skips.forEach(function (s) { console.log("  – " + s.name + " → " + s.motivo); });
  }
  console.log("");
}

process.exit(fail ? 1 : 0);
