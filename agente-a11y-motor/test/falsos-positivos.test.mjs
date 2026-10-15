import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * EL MEDIDOR DE PRECISIÓN, con las trampas que una medida de precisión tiene que
 * saber evitar — porque todas ellas producen cifras tranquilizadoras y falsas:
 *
 *   · decir «0 % de falsos positivos» a partir de treinta filas sin un fallo;
 *   · calcular una media global dejando fuera los bloques grandes del informe;
 *   · dar la cifra bruta de una muestra estratificada, donde un bloque de una
 *     barrera pesa lo mismo que uno de cuarenta y cuatro;
 *   · contar una «duda» como un acierto;
 *   · y medir sobre cero juicios, que sale como el 100 %.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "scripts", "falsos-positivos.mjs");

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, [BIN, ...args], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ code: error ? error.code : 0, stdout, stderr });
  });
});

let dir;
const escribe = async (nombre, texto) => {
  if (!dir) dir = await mkdtemp(join(tmpdir(), "precision-"));
  const f = join(dir, nombre);
  await writeFile(f, texto, "utf8");
  return f;
};

/* Un informe con la forma del real: muy desigual, que es lo que hace que la
 * ponderación y el corte por bloques importen. */
const informe = (bloques) => {
  const l = ["Criterio WCAG;Página;Selector;Evidencia"];
  let i = 0;
  for (const [c, n] of Object.entries(bloques)) {
    for (let k = 0; k < n; k++) { i++; l.push([c, "https://x/p" + (k % 7) + ".html", "a.s" + i, "evidencia; con separador y \"comillas\" " + i].join(";")); }
  }
  return l.join("\n") + "\n";
};
const FORMA_REAL = { "1.4.1": 44, "1.4.3": 43, "1.4.10": 26, "4.1.2": 24, "1.4.13": 11, "1.1.1": 1 };

const juicios = (plantilla, decide) => {
  const ls = plantilla.split(/\r?\n/).filter((x) => x.trim());
  const out = [ls[0]];
  for (let i = 1; i < ls.length; i++) out.push(ls[i] + decide(ls[i].split(";")[0]));
  return out.join("\n") + "\n";
};

test("precisión: la muestra es proporcional al tamaño de cada bloque", async () => {
  const f = await escribe("b.csv", informe(FORMA_REAL));
  const r = await run([f, "--muestra", "30", "--salida", join(dir, "m.csv")]);
  assert.equal(r.code, 0, r.stderr);
  const m = await readFile(join(dir, "m.csv"), "utf8");
  const filas = m.split(/\r?\n/).filter((x) => x.trim()).slice(1);
  assert.equal(filas.length, 30);
  const cuenta = {};
  for (const l of filas) { const c = l.split(";")[0]; cuenta[c] = (cuenta[c] || 0) + 1; }
  /* 4.1.2 tiene 24 barreras de 149: le toca del orden de 4 o 5 filas. El primer
   * intento le daba UNA, porque repartía el mínimo de uno antes que lo
   * proporcional y los bloques gordos se comían el presupuesto. 4.1.2 es justo el
   * bloque que ningún lector de pantalla ha confirmado nunca. */
  assert.ok(cuenta["4.1.2"] >= 3, "4.1.2 se queda con " + cuenta["4.1.2"] + " fila(s): " + JSON.stringify(cuenta));
  // Y todos los bloques entran, también el de una sola barrera.
  assert.equal(Object.keys(cuenta).length, Object.keys(FORMA_REAL).length, JSON.stringify(cuenta));
  assert.ok(cuenta["1.4.1"] >= cuenta["1.4.13"], JSON.stringify(cuenta));
});

test("precisión: la misma semilla da la misma muestra, y otra semilla otra", async () => {
  const f = await escribe("b2.csv", informe(FORMA_REAL));
  await run([f, "--muestra", "20", "--semilla", "7", "--salida", join(dir, "a.csv")]);
  await run([f, "--muestra", "20", "--semilla", "7", "--salida", join(dir, "b.csv")]);
  await run([f, "--muestra", "20", "--semilla", "8", "--salida", join(dir, "c.csv")]);
  const [a, b, c] = await Promise.all(["a.csv", "b.csv", "c.csv"].map((n) => readFile(join(dir, n), "utf8")));
  assert.equal(a, b, "la semilla fija tiene que ser reproducible: si no, la adjudicación de ayer no cuadra con la plantilla de hoy");
  assert.notEqual(a, c);
});

test("precisión: sin un solo falso positivo NO dice «0 %», dice el techo", async () => {
  const f = await escribe("b3.csv", informe(FORMA_REAL));
  await run([f, "--muestra", "30", "--salida", join(dir, "m3.csv")]);
  const j = await escribe("j3.csv", juicios(await readFile(join(dir, "m3.csv"), "utf8"), () => "si"));
  const r = await run([f, "--juicios", j]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /PRECISIÓN: 100,0 %/);
  // Lo que de verdad importa: el techo, y la frase que impide leerlo como certeza.
  assert.match(r.stdout, /TECHO DE FALSOS POSITIVOS: 11,4 %/);
  assert.match(r.stdout, /NO es «ningún falso positivo»/);
  assert.match(r.stdout, /más muestra, no más confianza/);
});

test("precisión: la cifra global se pondera, y un fallo en un bloque chico no la hunde", async () => {
  const f = await escribe("b4.csv", informe(FORMA_REAL));
  await run([f, "--muestra", "30", "--salida", join(dir, "m4.csv")]);
  const plantilla = await readFile(join(dir, "m4.csv"), "utf8");
  // El único falso positivo cae en 1.1.1, que es UNA barrera de 149 del informe.
  const j = await escribe("j4.csv", juicios(plantilla, (c) => (c === "1.1.1" ? "no" : "si")));
  const r = await run([f, "--juicios", j]);
  const bruta = /la bruta de la muestra sería (\d+,\d) %/.exec(r.stdout);
  const pond = /PRECISIÓN: (\d+,\d) %/.exec(r.stdout);
  assert.ok(bruta && pond, r.stdout);
  const n = (s) => Number(s.replace(",", "."));
  /* Una barrera de 149 es el 0,7 % del informe y una fila de 30 es el 3,3 % de la
   * muestra: la cifra bruta castiga cinco veces más de lo que le toca. */
  assert.ok(n(pond[1]) > n(bruta[1]), "ponderada " + pond[1] + " vs bruta " + bruta[1]);
  assert.ok(n(pond[1]) > 99, "ponderada " + pond[1]);
});

test("precisión: no hay cifra global si los bloques grandes no se han juzgado", async () => {
  const f = await escribe("b5.csv", informe(FORMA_REAL));
  await run([f, "--muestra", "30", "--salida", join(dir, "m5.csv")]);
  const plantilla = await readFile(join(dir, "m5.csv"), "utf8");
  // Se juzga todo MENOS los dos bloques gordos (87 de 149 barreras).
  const j = await escribe("j5.csv", juicios(plantilla, (c) => (c === "1.4.1" || c === "1.4.3" ? "" : "si")));
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /NO doy una cifra global/);
  assert.doesNotMatch(r.stdout, /PRECISIÓN:/);
  assert.match(r.stdout, /1\.4\.1: 44/);
  // Y el consejo correcto: esas filas YA están en la muestra, hay que rellenarlas.
  assert.match(r.stdout, /YA tienen filas en la muestra/);
  assert.doesNotMatch(r.stdout, /Saca más muestra/);
});

test("precisión: un bloque que no entró en la muestra se distingue de uno sin rellenar", async () => {
  const f = await escribe("b6.csv", informe(FORMA_REAL));
  await run([f, "--muestra", "30", "--salida", join(dir, "m6.csv")]);
  const ls = (await readFile(join(dir, "m6.csv"), "utf8")).split(/\r?\n/).filter((x) => x.trim());
  // Se BORRAN del fichero de juicios las filas de 1.4.1: no están, no es que estén vacías.
  const out = [ls[0]];
  for (let i = 1; i < ls.length; i++) if (ls[i].split(";")[0] !== "1.4.1") out.push(ls[i] + "si");
  const j = await escribe("j6.csv", out.join("\n") + "\n");
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /1\.4\.1.*no entró en la muestra/);
  assert.match(r.stdout, /Saca más muestra/);
});

test("precisión: una «duda» no es un acierto", async () => {
  const f = await escribe("b7.csv", informe({ "1.4.1": 10, "1.4.3": 10 }));
  await run([f, "--muestra", "20", "--salida", join(dir, "m7.csv")]);
  const plantilla = await readFile(join(dir, "m7.csv"), "utf8");
  const j = await escribe("j7.csv", juicios(plantilla, (c) => (c === "1.4.1" ? "duda" : "si")));
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /10 barrera\(s\) decidida\(s\)/);         // las 10 «si», no 20
  assert.match(r.stdout, /\+10 en duda, fuera del cálculo/);
  // Y con tanta duda, se avisa de que el intervalo es optimista.
  assert.match(r.stdout, /quedaron en duda/);
  assert.match(r.stdout, /es optimista/);
});

test("precisión: si todo está en duda, no se inventa una cifra", async () => {
  const f = await escribe("b8.csv", informe({ "1.4.1": 6 }));
  await run([f, "--muestra", "6", "--salida", join(dir, "m8.csv")]);
  const j = await escribe("j8.csv", juicios(await readFile(join(dir, "m8.csv"), "utf8"), () => "duda"));
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /Nada decidido/);
  assert.doesNotMatch(r.stdout, /PRECISIÓN:/);
});

test("precisión: con cero juicios se para, en vez de salir al 100 %", async () => {
  const f = await escribe("b9.csv", informe({ "1.4.1": 6 }));
  await run([f, "--muestra", "6", "--salida", join(dir, "m9.csv")]);
  const ls = (await readFile(join(dir, "m9.csv"), "utf8")).split(/\r?\n/).filter((x) => x.trim());
  const j = await escribe("j9.csv", ls.join("\n") + "\n");   // plantilla sin rellenar
  const r = await run([f, "--juicios", j]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /No he leído ni un juicio/);
  assert.match(r.stderr, /saldría como 100 %/);
});

test("precisión: una fila de juicios que no casa con ninguna barrera se dice, no se cuenta", async () => {
  const f = await escribe("b10.csv", informe({ "1.4.1": 6 }));
  await run([f, "--muestra", "6", "--salida", join(dir, "m10.csv")]);
  const ls = (await readFile(join(dir, "m10.csv"), "utf8")).split(/\r?\n/).filter((x) => x.trim());
  const out = [ls[0]].concat(ls.slice(1).map((l) => l + "si"));
  out.push(["1.4.1", "https://x/inventada.html", "a.que-no-existe", "evidencia", "no"].join(";"));
  const j = await escribe("j10.csv", out.join("\n") + "\n");
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /1 fila\(s\) de los juicios no casan/);
  // Y ese «no» inventado NO entra en la cuenta: 6 decididas, 0 falsos.
  assert.match(r.stdout, /6 barrera\(s\) decidida\(s\): 6 real\(es\), 0 falso/);
});

test("precisión: un valor raro en «Juicio» no se interpreta, se avisa", async () => {
  const f = await escribe("b11.csv", informe({ "1.4.1": 6 }));
  await run([f, "--muestra", "6", "--salida", join(dir, "m11.csv")]);
  const plantilla = await readFile(join(dir, "m11.csv"), "utf8");
  const ls = plantilla.split(/\r?\n/).filter((x) => x.trim());
  const out = [ls[0]].concat(ls.slice(1).map((l, i) => l + (i === 0 ? "a medias" : "si")));
  const j = await escribe("j11.csv", out.join("\n") + "\n");
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /no entiendo y no he contado/);
  assert.match(r.stdout, /«a medias»/);
  assert.match(r.stdout, /5 barrera\(s\) decidida\(s\)/);
});

test("precisión: sin columna de criterio se para y dice por qué", async () => {
  const f = await escribe("mal.csv", "Cosa;Otra\nuna;dos\n");
  const r = await run([f, "--muestra", "2"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no encuentro la columna del criterio/);
  assert.match(r.stderr, /una cifra global sin bloques no dice nada/);
});

test("precisión: un CSV vacío o sin filas se para, no da 0 falsos positivos", async () => {
  const vacio = await escribe("vacio.csv", "");
  let r = await run([vacio, "--muestra", "2"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no tiene filas/);
  const soloCab = await escribe("cab.csv", "Criterio WCAG;Selector\n");
  r = await run([soloCab, "--muestra", "2"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no tiene filas/);
});

test("precisión: la evidencia con punto y coma dentro no desplaza las columnas", async () => {
  /* El partidor tiene que respetar las comillas: la columna de evidencia del
   * agente lleva separadores dentro, y partir a lo bruto movía el selector a otra
   * columna — con lo que la identidad de la barrera dejaba de casar y TODOS los
   * juicios salían como «no casan con ninguna barrera». */
  const f = await escribe("comas.csv",
    'Criterio WCAG;Página;Selector;Evidencia\n' +
    '1.4.1;https://x/a.html;a.uno;"enlace «x» sin distintivo; ni subrayado; ni borde"\n' +
    '1.4.1;https://x/b.html;a.dos;"otro; con; separadores"\n');
  await run([f, "--muestra", "2", "--salida", join(dir, "mc.csv")]);
  const m = await readFile(join(dir, "mc.csv"), "utf8");
  assert.match(m, /a\.uno/);
  assert.match(m, /a\.dos/);
  const j = await escribe("jc.csv", juicios(m, () => "si"));
  const r = await run([f, "--juicios", j]);
  assert.match(r.stdout, /2 barrera\(s\) decidida\(s\)/);
  assert.doesNotMatch(r.stdout, /no casan/);
});

/* ── Los dos fallos que salieron en el primer uso real (v0.61.1) ─────────── */

test("el consejo para un bloque flaco no repite la muestra que ya se pidió", async () => {
  /* Primer uso con datos reales: con --muestra 39 los bloques flacos eran 1.4.13
   * (11 barreras) y 3.3.2 (10), y el consejo decía «--muestra 39» — la misma que
   * acababa de lanzar. El cálculo salía del bloque MAYOR, y es al revés: cuanto
   * más pequeño es el bloque, más muestra total hace falta para que le toquen
   * cinco filas. Para diez barreras hacen falta 117 de 203, o sea que la
   * respuesta ya no es muestrear. */
  const f = await escribe("flaco.csv", informe(FORMA_REAL));
  const r = await run([f, "--muestra", "39", "--salida", join(dir, "mf.csv")]);
  assert.match(r.stdout, /OJO: .* se quedan con menos de 5 filas/);
  assert.doesNotMatch(r.stdout, /precisión por bloque en los grandes: --muestra 39/);
  assert.match(r.stdout, /sale más barato juzgarlo entero: --bloque 1\.4\.13/);
  // Y la cifra que da tiene que ser la del bloque pequeño, no la del grande.
  assert.match(r.stdout, /1\.4\.13: son 11 barreras/);
});

test("--bloque saca el bloque entero, y juzgado entero no lleva intervalo", async () => {
  const f = await escribe("bloque.csv", informe({ "1.4.1": 40, "3.3.2": 6 }));
  const r = await run([f, "--bloque", "3.3.2", "--salida", join(dir, "b.csv")]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /BLOQUE 3\.3\.2 COMPLETO: 6 barrera\(s\)/);
  const plantilla = await readFile(join(dir, "b.csv"), "utf8");
  assert.equal(plantilla.split(/\r?\n/).filter((x) => x.trim()).length - 1, 6);
  // Un falso positivo de seis: 83,3 % EXACTO, sin intervalo, porque es un censo.
  const j = await escribe("bj.csv", juicios(plantilla, () => "si").replace(/si\n/, "no\n"));
  const r2 = await run([f, "--juicios", j]);
  assert.match(r2.stdout, /3\.3\.2.*EXACTA \(bloque completo, sin intervalo\)/);
  assert.doesNotMatch(/3\.3\.2[^\n]*/.exec(r2.stdout)[0], /entre /);
});

test("--bloque con un criterio que no está lo dice y lista los que hay", async () => {
  const f = await escribe("nob.csv", informe({ "1.4.1": 3 }));
  const r = await run([f, "--bloque", "9.9.9"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /no hay ninguna barrera del criterio «9\.9\.9»/);
  assert.match(r.stderr, /Los que hay: 1\.4\.1/);
});
