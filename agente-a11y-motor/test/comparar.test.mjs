import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * La herramienta de comparación, con los dos errores que cometió en su primer
 * uso con datos reales ya fijados en tests.
 *
 * Los dos venían de suponer en vez de mirar: uno clasificaba como «más
 * indulgente» un criterio que antes tenía el veredicto a `null` —es decir, que
 * nadie se había pronunciado— y el otro leía la columna del subcriterio de la EN
 * («9.1.1.1»), sacaba de ahí «9.1.1» con la expresión del criterio WCAG, y
 * producía siete criterios inventados y todo lo demás «escapado». Con la
 * auditoría de un sitio real delante, los dos salieron al primer intento.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "scripts", "comparar-auditorias.mjs");

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, [BIN, ...args], (error, stdout, stderr) => {
    resolve({ code: error ? error.code : 0, stdout, stderr });
  });
});

const auditoria = (criterios, barreras) => ({
  rollup: { conformidad: "No conforme", resumen: { fallan: 1, revisar: 1, conformes: 0, noAplican: 0 } },
  seguimiento: Object.keys(criterios).map((n) => ({
    criterio: n, veredicto: criterios[n].v, num_barreras: criterios[n].n || 0
  })),
  barreras: barreras || []
});

let dir;
const escribe = async (nombre, obj) => {
  if (!dir) dir = await mkdtemp(join(tmpdir(), "comparar-"));
  const f = join(dir, nombre);
  await writeFile(f, typeof obj === "string" ? obj : JSON.stringify(obj), "utf8");
  return f;
};

test("comparar: lo que se vuelve más indulgente se separa de lo que se vuelve más severo", async () => {
  const antes = await escribe("a.json", auditoria({
    "1.4.3": { v: "falla", n: 3 }, "2.4.3": { v: "pasa" }, "1.3.2": { v: "humano" }
  }));
  const despues = await escribe("b.json", auditoria({
    "1.4.3": { v: "revisar", n: 1 }, "2.4.3": { v: "revisar" }, "1.3.2": { v: "humano" }
  }));
  const r = await run([antes, despues]);
  assert.equal(r.code, 0, r.stderr);
  const severo = r.stdout.split("MÁS INDULGENTE")[0];
  const indulgente = r.stdout.split("MÁS INDULGENTE")[1];
  assert.match(severo, /2\.4\.3/, "pasa → revisar es más severo");
  assert.match(indulgente, /1\.4\.3/, "falla → revisar es más indulgente: la dirección peligrosa");
  assert.doesNotMatch(indulgente.split("BARRERAS")[0], /1\.3\.2/, "lo que no cambia no sale");
});

test("comparar: un veredicto `null` anterior es «sin veredicto», no indulgencia", async () => {
  const antes = await escribe("c.json", auditoria({ "4.1.3": { v: null }, "1.1.1": { v: "falla", n: 2 } }));
  const despues = await escribe("d.json", auditoria({ "4.1.3": { v: "revisar" }, "1.1.1": { v: "falla", n: 2 } }));
  const r = await run([antes, despues]);
  assert.match(r.stdout, /CRITERIOS NUEVOS/);
  assert.match(r.stdout.split("MÁS SEVERO")[0], /4\.1\.3/);
  assert.match(r.stdout, /MÁS INDULGENTE \(0\)/, "no era indulgencia: antes nadie se había pronunciado");
});

test("comparar: un criterio que DESAPARECE del informe se dice primero y en mayúsculas", async () => {
  const antes = await escribe("e.json", auditoria({ "2.1.1": { v: "falla", n: 4 } }));
  const despues = await escribe("f.json", auditoria({ "2.1.1": { v: null } }));
  const r = await run([antes, despues]);
  assert.match(r.stdout, /DESAPARECEN DEL INFORME/);
  assert.match(r.stdout, /2\.1\.1.*DESAPARECE/);
});

test("comparar: las barreras se cotejan por criterio, página y selector", async () => {
  const b = (crit, sel) => ({ criterio: crit, pagina: "https://x.test/a", selector: sel, elemento: "img" });
  const antes = await escribe("g.json", auditoria({ "1.1.1": { v: "falla", n: 2 } }, [b("1.1.1", "body > img:nth-of-type(1)"), b("1.1.1", "body > img:nth-of-type(2)")]));
  const despues = await escribe("h.json", auditoria({ "1.1.1": { v: "falla", n: 2 } }, [b("1.1.1", "body > img:nth-of-type(1)"), b("1.1.1", "body > img:nth-of-type(3)")]));
  const r = await run([antes, despues]);
  assert.match(r.stdout, /nuevas 1/);
  assert.match(r.stdout, /desaparecidas 1/);
  assert.match(r.stdout, /NUEVAS/);
});

test("comparar contra referencia: manda la columna de WCAG, no la de la EN", async () => {
  /* El CSV del agente trae las dos: «Subcriterio EN (9.X.Y.Z)» primero y
   * «Criterio WCAG» después. Leyendo la primera, de «9.1.1.1» salía «9.1.1». */
  const csv = "﻿Subcriterio EN (9.X.Y.Z);Criterio WCAG;Nombre\n9.1.1.1;1.1.1;Contenido no textual\n9.4.1.2;4.1.2;Nombre, función, valor\n";
  const ref = await escribe("ref.csv", csv);
  const audit = await escribe("i.json", auditoria({ "1.1.1": { v: "falla", n: 9 }, "4.1.2": { v: "revisar" }, "2.4.7": { v: "falla", n: 1 } }));
  const r = await run([audit, "--referencia", ref]);
  assert.match(r.stdout, /columna «criterio wcag»/);
  assert.match(r.stdout, /2 criterio\(s\) con barrera/, "dos criterios, no cuatro ni siete inventados");
  assert.match(r.stdout.split("SE LE ESCAPAN")[0], /✓ 1\.1\.1/, "coinciden: los dos lo denuncian");
  const escapan = r.stdout.split("SE LE ESCAPAN")[1].split("SOLO EL AGENTE")[0];
  assert.match(escapan, /4\.1\.2/, "la referencia lo denuncia y el agente solo lo deja a revisar");
  assert.match(r.stdout.split("SOLO EL AGENTE")[1], /2\.4\.7/, "y lo que solo ve el agente, aparte");
});

test("comparar contra referencia: distingue «lo deja a juicio» de «lo absuelve»", async () => {
  const ref = await escribe("ref2.csv", "Criterio WCAG;Nombre\n1.4.3;Contraste\n2.4.5;Varias vías\n");
  const audit = await escribe("j.json", auditoria({ "1.4.3": { v: "revisar" }, "2.4.5": { v: "cumple" } }));
  const r = await run([audit, "--referencia", ref]);
  const escapan = r.stdout.split("SE LE ESCAPAN")[1];
  assert.match(escapan, /1\.4\.3.*lo deja a juicio/);
  assert.match(escapan, /2\.4\.5.*ESTO ES LO GRAVE, lo absuelve/);
});

test("comparar: sin argumentos, explica cómo se usa y sale con 2", async () => {
  const r = await run([]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /--referencia/);
});
