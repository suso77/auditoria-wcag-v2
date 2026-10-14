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

/**
 * Y LO QUE NO SE PUEDE COMPARAR SE DICE, NO SALE EN BLANCO.
 *
 * Cuatro casos salidos del primer uso real. La orden que tenía que generar el
 * segundo informe falló, pero la redirección del intérprete ya había creado el
 * fichero: quedó un `.json` de cero bytes y la herramienta se rompió con un
 * «Unexpected end of JSON input» y una pila de llamadas.
 *
 * Lo grave era el caso de al lado: con un JSON válido que no es una auditoría,
 * imprimía el informe entero —«0 más severo, 0 más indulgente, 0 barreras»—,
 * que se lee como «no ha cambiado nada» cuando lo que pasa es que no se ha
 * leído nada. Es la regla de oro del proyecto aplicada a la herramienta: el
 * silencio se lee como conformidad.
 */
test("comparar: un fichero vacío se dice, y además por qué suele quedar vacío", async () => {
  const vacio = await escribe("vacio.json", "");
  const bueno = await escribe("k.json", auditoria({ "1.1.1": { v: "falla", n: 1 } }));
  const r = await run([vacio, bueno]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /VACÍO/);
  assert.match(r.stderr, /redirección/, "y se apunta a la causa, que es la orden que falló antes");
  assert.doesNotMatch(r.stdout, /MÁS INDULGENTE/, "no se imprime ningún informe");
});

test("comparar: un fichero que no existe se dice con su ruta, sin pila de llamadas", async () => {
  const bueno = await escribe("l.json", auditoria({ "1.1.1": { v: "falla", n: 1 } }));
  const r = await run([join(dir, "no-esta.json"), bueno]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /No existe el fichero.*no-esta\.json/);
  assert.doesNotMatch(r.stderr, /at JSON\.parse|internal\/fs/, "nada de volcados de Node");
});

test("comparar: un JSON que no es una auditoría se RECHAZA, no se compara con ceros", async () => {
  const otro = await escribe("otro.json", '{"hola":1}');
  const r = await run([otro, otro]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no parece un informe del agente/);
  assert.match(r.stderr, /seguimiento/);
  assert.doesNotMatch(r.stdout, /BARRERAS|MÁS SEVERO/,
    "un informe de ceros se leería como «no ha cambiado nada», y eso es lo contrario de lo que pasa");
});

test("comparar contra referencia: un CSV del que no sale ni un criterio se rechaza", async () => {
  const malo = await escribe("malo.csv", "Pagina;Nota\nhttps://x.test/;hola\n");
  const audit = await escribe("m.json", auditoria({ "1.4.3": { v: "falla", n: 3 } }));
  const r = await run([audit, "--referencia", malo]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /ningún criterio WCAG/);
  assert.match(r.stderr, /pagina \| nota/, "se dicen las cabeceras que había, para ver cuál falta");
  assert.doesNotMatch(r.stdout, /SE LE ESCAPAN/, "«0 se le escapan» se leería como coincidencia total");
});

/**
 * EL 12 % DE LAS BARRERAS QUE EL COTEJO NO VEÍA.
 *
 * Esto salió comparando dos pasadas reales del mismo sitio. De 522 filas, 62
 * —el 12 %— venían sin `selector`: todas de la capa de adaptación (1.4.4,
 * 1.4.10, 1.4.12), que nombra el bloque recortado en el campo `elemento` y no
 * calcula ruta. Con la clave «criterio | página | selector», las diez filas de
 * una misma página se fundían en una, y la comparación dijo «desaparecidas 1»
 * cuando 1.4.4 había perdido dos filas y 1.4.10 una.
 *
 * Callarse el 12 % de las barreras es la misma falta que absolver por no haber
 * mirado: «nuevas 3 · desaparecidas 1» se lee como el recuento completo.
 */
test("comparar: una barrera sin selector se identifica por su `elemento`", async () => {
  const b = (sel, el) => ({ criterio: "1.4.4", pagina: "https://x.test/a", selector: sel, elemento: el });
  const antes = await escribe("n.json", auditoria({ "1.4.4": { v: "falla", n: 2 } },
    [b("", "div.list_item «204 px de alto ocultos»"), b("", "p.title «50 px de alto ocultos»")]));
  const despues = await escribe("o.json", auditoria({ "1.4.4": { v: "falla", n: 2 } },
    [b("", "div.list_item «204 px de alto ocultos»"), b("", "p.otro «12 px de alto ocultos»")]));
  const r = await run([antes, despues]);
  assert.match(r.stdout, /antes 2 · después 2/, "dos y dos, no una y una");
  assert.match(r.stdout, /nuevas 1/);
  assert.match(r.stdout, /desaparecidas 1/);
  assert.match(r.stdout, /identificado por su campo `elemento`/, "y se dice cómo se las ha distinguido");
});

test("comparar: lo que sigue sin poder distinguirse se CUENTA y se dice", async () => {
  /* Dos filas idénticas en criterio, página, selector y elemento: no hay por
   * dónde separarlas. Lo que no se puede decir, se dice que no se puede. */
  const b = { criterio: "1.4.10", pagina: "https://x.test/a", selector: "", elemento: "" };
  const antes = await escribe("p.json", auditoria({ "1.4.10": { v: "falla", n: 2 } }, [b, b]));
  const despues = await escribe("q.json", auditoria({ "1.4.10": { v: "falla", n: 2 } }, [b, b]));
  const r = await run([antes, despues]);
  assert.match(r.stdout, /Lo que este cotejo NO distingue/);
  assert.match(r.stdout, /NI selector NI elemento/);
  assert.match(r.stdout, /comparten identidad con otra/);
});

/**
 * EL MODO HOJA DE SEGUIMIENTO, Y POR QUÉ HIZO FALTA.
 *
 * El modo `--referencia` lee una LISTA DE BARRERAS, y con la auditoría real de
 * un sitio delante quedó claro lo que eso no puede decir. La hoja traía cuatro
 * criterios con hallazgos y el agente denunciaba catorce, así que el informe
 * sacó «SOLO EL AGENTE · 10 (candidatos a falso positivo)». Y era falso: de
 * esos diez, nueve estaban SIN EVALUAR en la hoja y uno estaba marcado como que
 * CUMPLE. Son dos cosas distintísimas —una no dice nada de la precisión del
 * agente y la otra es el único desacuerdo de verdad— y meterlas en el mismo
 * montón es la forma de no mirar la que importaba.
 *
 * Una hoja de seguimiento sí lo distingue, porque tiene vocabulario: cumple,
 * falla, no aplica, y «nulo» para lo que nadie ha visto todavía.
 */
const hojaCsv = (filas) => "Criterio;Nivel;home;destino;galeria\n" + filas.map((f) => f.join(";")).join("\n") + "\n";

test("seguimiento: «la persona dice que cumple y el agente denuncia» va aparte de «nadie lo ha mirado»", async () => {
  const h = await escribe("seg1.csv", hojaCsv([
    ["SC 2.4.11 — Foco no oscurecido", "AA", "Total", "Total", "Total"],
    ["SC 1.4.3 — Contraste", "AA", "Nulo", "Nulo", "Nulo"]
  ]));
  const audit = await escribe("r.json", auditoria({ "2.4.11": { v: "falla", n: 7 }, "1.4.3": { v: "falla", n: 138 } }));
  const r = await run([audit, "--seguimiento", h]);
  const falsos = r.stdout.split("CANDIDATOS A FALSO POSITIVO")[1].split("── ")[0];
  assert.match(falsos, /2\.4\.11/, "este sí es un candidato: la persona dice que cumple");
  assert.doesNotMatch(falsos, /1\.4\.3/, "y este no: nadie se ha pronunciado enfrente");
  assert.match(r.stdout.split("VA POR DELANTE")[1], /1\.4\.3/);
});

test("seguimiento: un «no aplica» contra una denuncia es un desacuerdo de APLICABILIDAD", async () => {
  const h = await escribe("seg2.csv", hojaCsv([["SC 1.4.13 — Contenido al recibir foco", "AA", "No aplica", "No aplica", "No aplica"]]));
  const audit = await escribe("s.json", auditoria({ "1.4.13": { v: "falla", n: 14 } }));
  const r = await run([audit, "--seguimiento", h]);
  assert.match(r.stdout.split("APLICABILIDAD")[1], /1\.4\.13/);
  assert.match(r.stdout, /saca el criterio del informe sin que nadie lo mire/);
});

test("seguimiento: lo que la persona denuncia y el agente no es LO MÁS GRAVE y sale primero", async () => {
  const h = await escribe("seg3.csv", hojaCsv([["SC 1.1.1 — Contenido no textual", "A", "Ninguno", "Total", "Total"]]));
  const audit = await escribe("t.json", auditoria({ "1.1.1": { v: "revisar" } }));
  const r = await run([audit, "--seguimiento", h]);
  const antes = r.stdout.split("CANDIDATOS A FALSO POSITIVO")[0];
  assert.match(antes, /SE LE ESCAPAN[\s\S]*1\.1\.1/, "primero, y antes que todo lo demás");
  /* Lo peor de alguna página manda: falla en una, falla en el sitio. */
  assert.match(r.stdout, /falla x1, cumple x2/);
});

test("seguimiento: la cuenta cierra — ningún criterio se queda sin decir", async () => {
  const h = await escribe("seg4.csv", hojaCsv([
    ["SC 1.1.1", "A", "Ninguno", "Total", "Total"],
    ["SC 2.4.11", "AA", "Total", "Total", "Total"],
    ["SC 1.4.13", "AA", "No aplica", "No aplica", "No aplica"],
    ["SC 1.4.3", "AA", "Nulo", "Nulo", "Nulo"],
    ["SC 2.4.5", "AA", "Total", "Total", "Total"]
  ]));
  const audit = await escribe("u.json", auditoria({
    "1.1.1": { v: "revisar" }, "2.4.11": { v: "falla", n: 7 }, "1.4.13": { v: "falla", n: 14 },
    "1.4.3": { v: "falla", n: 1 }, "2.4.5": { v: "cumple" }
  }));
  const r = await run([audit, "--seguimiento", h]);
  const m = /Criterios de la hoja: (\d+) = (\d+) escapados \+ (\d+) falsos candidatos \+ (\d+) de aplicabilidad \+ (\d+) por delante \+ (\d+) coincidentes \+ (\d+) sin absolver \+ (\d+) sin ficha \+ (\d+) de acuerdo/.exec(r.stdout);
  assert.ok(m, "la línea del recuento tiene que estar: " + r.stdout.slice(-400));
  const total = Number(m[1]);
  const suma = m.slice(2).reduce((a, x) => a + Number(x), 0);
  assert.equal(suma, total, "los montones tienen que sumar los criterios de la hoja");
  assert.equal(total, 5);
});

test("seguimiento: un valor que no está en el vocabulario se DICE, no se da por «sin mirar»", async () => {
  const h = await escribe("seg5.csv", hojaCsv([
    ["SC 1.4.3", "AA", "Total", "Total", "Total"],
    ["SC 1.1.1", "A", "Regulal", "Total", "Total"]
  ]));
  const audit = await escribe("v.json", auditoria({ "1.4.3": { v: "cumple" }, "1.1.1": { v: "cumple" } }));
  const r = await run([audit, "--seguimiento", h]);
  assert.match(r.stdout, /no reconozco/);
  assert.match(r.stdout, /Regulal/);
});

test("seguimiento: una hoja sin columna de criterios se rechaza con las cabeceras delante", async () => {
  const h = await escribe("seg6.csv", "Pagina;Nota\nhttps://x.test/;Total\n");
  const audit = await escribe("w.json", auditoria({ "1.4.3": { v: "falla", n: 1 } }));
  const r = await run([audit, "--seguimiento", h]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /ninguna columna con números de criterio/);
});

test("seguimiento: y un fichero que no existe, igual que en los otros modos", async () => {
  const audit = await escribe("x.json", auditoria({ "1.4.3": { v: "falla", n: 1 } }));
  const r = await run([audit, "--seguimiento", join(dir, "no-esta.csv")]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /No existe la hoja de seguimiento/);
});
