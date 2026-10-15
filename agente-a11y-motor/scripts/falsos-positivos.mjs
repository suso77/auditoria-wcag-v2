#!/usr/bin/env node
/**
 * LA TASA DE FALSOS POSITIVOS, MEDIDA — NO SUPUESTA.
 *
 * Todo lo que se ha arreglado en este agente se encontró igual: sospechar de una
 * afirmación, construir una página de respuesta sabida, ejecutar y comparar. Eso
 * encuentra defectos de uno en uno y funciona muy bien. Lo que no responde es la
 * pregunta que de verdad decide si el agente es fiable:
 *
 *     de las 203 familias de barreras que firma en un sitio real,
 *     ¿cuántas están mal?
 *
 * Hoy la respuesta es «no se sabe». Y «no se sabe» no es «ninguna»: es el mismo
 * silencio que la regla de oro de este proyecto persigue en los informes, solo que
 * aplicado al propio agente. Un informe de accesibilidad tiene efectos legales, y
 * la frase «nada de falsos positivos» sin un número detrás es una intención.
 *
 * Esto es el instrumento que convierte esa intención en una cifra. Dos pasos:
 *
 *   1. SACAR LA MUESTRA
 *      node scripts/falsos-positivos.mjs visitspain9-barreras.csv --muestra 30
 *
 *      Escribe una plantilla con 30 filas y una columna «Juicio» vacía. La muestra
 *      es ALEATORIA Y ESTRATIFICADA por criterio, con semilla fija: reproducible, y
 *      —sobre todo— no elegida por quien va a juzgarla. Elegir a mano las barreras
 *      que se revisan es la forma más fácil de medir un 100 % de precisión: se
 *      revisan las fáciles. El sesgo de selección no se corrige después.
 *
 *   2. ADJUDICAR Y MEDIR
 *      node scripts/falsos-positivos.mjs visitspain9-barreras.csv --juicios plantilla.csv
 *
 *      En la columna «Juicio» va `si` (la barrera es real), `no` (es un falso
 *      positivo) o `duda` (no se puede decidir sin más datos). De ahí sale la
 *      precisión por criterio y global, SIEMPRE con intervalo de confianza.
 *
 * POR QUÉ EL INTERVALO Y NO UN PORCENTAJE. Con 30 filas juzgadas y ningún falso
 * positivo, la precisión medida es del 100 % y el techo real de falsos positivos
 * está en el 11,4 %. Decir «0 % de falsos positivos» con 30 de 203 revisadas es
 * exactamente la clase de afirmación que este proyecto no se permite. Se usa el
 * intervalo de Wilson, que es el que se porta bien cuando los aciertos son todos
 * o casi todos — el normal daría un intervalo de ancho cero, que es mentira.
 *
 * Y SE NIEGA A DAR UNA CIFRA GLOBAL si la muestra no cubre los bloques grandes.
 * Un sitio real reparte las barreras muy desigual: en visitspain, 1.4.1 y 1.4.3
 * son 87 de 203 familias. Una «precisión global» calculada sin haber mirado ni una
 * fila de esos dos bloques no mide el agente, mide la suerte.
 */
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const opcion = (nombre) => { const i = args.indexOf(nombre); return i !== -1 ? args[i + 1] : null; };
const valores = new Set(["--muestra", "--juicios", "--semilla", "--salida", "--minimo-bloque", "--bloque"]
  .map((n) => args.indexOf(n)).filter((i) => i !== -1).map((i) => i + 1));
const ficheros = args.filter((a, i) => a.indexOf("--") !== 0 && !valores.has(i));

const salir = (...lineas) => { lineas.forEach((l) => console.error(l)); process.exit(1); };

if (!ficheros.length) {
  salir("Uso:",
    "  node scripts/falsos-positivos.mjs <barreras.csv> --muestra 30 [--semilla 1] [--salida plantilla.csv]",
    "  node scripts/falsos-positivos.mjs <barreras.csv> --bloque 3.3.2   (ese bloque entero)",
    "  node scripts/falsos-positivos.mjs <barreras.csv> --juicios plantilla-rellena.csv",
    "",
    "El CSV es el «-barreras.csv» o el «-barreras-agrupadas.csv» que escribe el agente.");
}

/* ── Lectura del CSV ──────────────────────────────────────────────────────────
 *
 * Mismo criterio que en `comparar-auditorias.mjs`: si de aquí no sale nada, se
 * para y se dice. Un CSV mal leído produciría «0 falsos positivos» sobre 0 filas,
 * que es la salida más tranquilizadora y más falsa posible. */
async function leeCsv(ruta) {
  let txt;
  try { txt = await readFile(ruta, "utf8"); }
  catch (e) {
    if (e.code === "ENOENT") salir("✕ No existe el fichero: " + ruta);
    if (e.code === "EISDIR") salir("✕ " + ruta + " es una carpeta, no un CSV.");
    salir("✕ No puedo leer " + ruta + ": " + e.message);
  }
  const lineas = txt.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) {
    salir("✕ " + ruta + " no tiene filas (" + lineas.length + " línea(s) con contenido).",
      "  Si lo generaste con «> fichero.csv», comprueba que el comando escribió algo.");
  }
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const parte = (l) => {
    /* Partidor que respeta las comillas: la columna de evidencia lleva puntos y
     * comas dentro, y partir a lo bruto desplazaba todas las columnas siguientes. */
    const out = []; let act = "", dentro = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (dentro && l[i + 1] === '"') { act += '"'; i++; } else dentro = !dentro; }
      else if (c === sep && !dentro) { out.push(act); act = ""; }
      else act += c;
    }
    out.push(act);
    return out.map((c) => c.replace(/^﻿/, "").trim());
  };
  const cab = parte(lineas[0]).map((c) => c.toLowerCase());
  const filas = lineas.slice(1).map(parte);
  return { ruta: ruta, sep: sep, cab: cab, cabOriginal: parte(lineas[0]), filas: filas };
}

const RE_SC = /\b\d\.\d\.\d+\b/;
const indiceDe = (cab, patrones) => {
  for (const p of patrones) { const i = cab.findIndex((c) => p.test(c)); if (i !== -1) return i; }
  return -1;
};

function columnas(csv) {
  const crit = indiceDe(csv.cab, [/criterio wcag/, /^criterio$/, /^sc$/, /^wcag$/]);
  const sel = indiceDe(csv.cab, [/^selector$/, /todos los selectores/, /^elemento$/]);
  const pag = indiceDe(csv.cab, [/^p[áa]gina$/, /^url$/]);
  const evid = indiceDe(csv.cab, [/^evidencia$/, /^detalle$/]);
  if (crit === -1) {
    salir("✕ En " + csv.ruta + " no encuentro la columna del criterio WCAG.",
      "  Cabeceras leídas: " + csv.cab.join(" | "),
      "  Sin criterio no puedo estratificar la muestra ni dar precisión por bloque,",
      "  y una cifra global sin bloques no dice nada.");
  }
  return { crit, sel, pag, evid };
}

/* Identidad de una fila: criterio + selector + página. Es la misma idea que la
 * identidad de barrera de `comparar-auditorias.mjs`, y por el mismo motivo: el
 * texto de la evidencia cambia entre versiones y el selector no. */
const identidad = (f, c) => [
  (f[c.crit] || "").trim(),
  (c.sel !== -1 ? (f[c.sel] || "") : "").trim(),
  (c.pag !== -1 ? (f[c.pag] || "") : "").trim()
].join(" ‖ ");

function porCriterio(csv, c) {
  const mapa = new Map();
  csv.filas.forEach((f, i) => {
    const m = RE_SC.exec(f[c.crit] || "");
    if (!m) return;
    const k = m[0];
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push({ fila: f, i: i });
  });
  return mapa;
}

/* ── Azar reproducible ────────────────────────────────────────────────────────
 * Un `Math.random()` daría una muestra distinta cada vez y la adjudicación de
 * ayer no cuadraría con la plantilla de hoy. */
function dado(semilla) {
  let s = (semilla | 0) || 1;
  return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/* ── Intervalo de Wilson al 95 % ──────────────────────────────────────────────
 * El normal (p ± 1,96·√(p(1-p)/n)) da ancho CERO cuando no hay ningún fallo, y
 * eso se leería como certeza absoluta a partir de treinta filas. */
function wilson(aciertos, n) {
  if (!n) return null;
  const z = 1.959964, p = aciertos / n, d = 1 + z * z / n;
  const centro = (p + z * z / (2 * n)) / d;
  const semi = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p: p, bajo: Math.max(0, centro - semi), alto: Math.min(1, centro + semi) };
}
const pc = (x) => (x * 100).toFixed(1).replace(".", ",") + " %";

const csv = await leeCsv(ficheros[0]);
const col = columnas(csv);
const bloques = porCriterio(csv, col);
if (!bloques.size) {
  salir("✕ De la columna «" + (csv.cab[col.crit] || "?") + "» de " + csv.ruta +
    " no he sacado ningún criterio WCAG (" + csv.filas.length + " fila(s) leídas).",
    "  Me paro: diría «0 falsos positivos» sobre 0 barreras, y eso se leería como",
    "  que el agente no se equivoca nunca.");
}
const totalFilas = Array.from(bloques.values()).reduce((a, b) => a + b.length, 0);

console.log("FICHERO: " + csv.ruta);
console.log("  " + totalFilas + " barrera(s) en " + bloques.size + " criterio(s)\n");

const MINIMO_BLOQUE = Number(opcion("--minimo-bloque") || 10);

/* ── MODO 1b: un bloque entero, sin muestrear ─────────────────────────────────
 *
 * Para un bloque pequeño, muestrear es el instrumento equivocado: con diez
 * barreras, que le toquen cinco filas exige una muestra de más de cien, y a esas
 * alturas se juzgan las diez y se acabó. Y tiene una ventaja que la muestra no
 * puede dar: un bloque juzgado ENTERO no tiene error de muestreo. Su precisión no
 * es una estimación con intervalo, es el dato. */
if (opcion("--bloque")) {
  const k = opcion("--bloque").trim();
  if (!bloques.has(k)) {
    salir("✕ En " + csv.ruta + " no hay ninguna barrera del criterio «" + k + "».",
      "  Los que hay: " + Array.from(bloques.keys()).sort((a, b) => a.localeCompare(b, "es", { numeric: true })).join(", "));
  }
  const filas = bloques.get(k);
  const CAB = ["Criterio WCAG", "Página", "Selector", "Evidencia", "Juicio"];
  const esc = (s) => { const t = String(s == null ? "" : s); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lineas = [CAB.join(";")].concat(filas.map((x) => [
    k,
    col.pag !== -1 ? x.fila[col.pag] : "",
    col.sel !== -1 ? x.fila[col.sel] : "",
    col.evid !== -1 ? x.fila[col.evid] : "",
    ""
  ].map(esc).join(";")));
  const destino = opcion("--salida") || csv.ruta.replace(/\.csv$/i, "") + "-bloque-" + k + ".csv";
  await writeFile(destino, "﻿" + lineas.join("\n") + "\n", "utf8");
  console.log("BLOQUE " + k + " COMPLETO: " + filas.length + " barrera(s), sin muestrear.");
  console.log("Juzgadas todas, ese bloque no tiene error de muestreo: su precisión será el dato, no una estimación.");
  console.log("\nEscrito en " + destino);
  console.log("Rellena la columna «Juicio» con: si · no · duda");
  console.log("Para la cifra global hacen falta también los demás bloques: --muestra N aparte.");
  process.exit(0);
}

/* ── MODO 1: sacar la muestra ─────────────────────────────────────────────── */
if (opcion("--muestra")) {
  const n = Number(opcion("--muestra"));
  if (!Number.isFinite(n) || n < 1) salir("✕ --muestra necesita un número de filas (por ejemplo 30).");
  if (n > totalFilas) salir("✕ Pides " + n + " filas y solo hay " + totalFilas + ".");
  const rnd = dado(Number(opcion("--semilla") || 1));

  /* Estratificada: cada criterio aporta en proporción a su tamaño, pero con un
   * mínimo de UNA fila por bloque mientras quepa. Un bloque sin ninguna fila
   * juzgada es un bloque cuya precisión no se conoce, y eso hay que poder decirlo
   * por separado en vez de esconderlo en una media. */
  const orden = Array.from(bloques.entries()).sort((a, b) => b[1].length - a[1].length);
  const cupos = new Map();
  /* Reparto proporcional PRIMERO y el mínimo de uno DESPUÉS, no al revés.
   *
   * Lo tenía al revés en el primer intento y se vio al probarlo con la forma real
   * de visitspain: dar una fila a cada bloque y luego repartir lo proporcional
   * encima gastaba el presupuesto en los bloques gordos, y 4.1.2 —24 barreras, el
   * segundo bloque del informe— se quedaba con UNA fila mientras 1.4.1 se llevaba
   * ocho. Una muestra así no mide 4.1.2, y 4.1.2 es justo el bloque que nadie ha
   * confirmado nunca con un lector de pantalla. */
  for (const [k, filas] of orden) {
    cupos.set(k, Math.min(filas.length, Math.max(1, Math.round((filas.length / totalFilas) * n))));
  }
  const suma = () => Array.from(cupos.values()).reduce((a, b) => a + b, 0);
  while (suma() > n) {                    // sobra: se quita del bloque con más cupo
    const cand = orden.filter(([k]) => cupos.get(k) > 1).sort((a, b) => cupos.get(b[0]) - cupos.get(a[0]))[0];
    if (!cand) break;
    cupos.set(cand[0], cupos.get(cand[0]) - 1);
  }
  while (suma() < n) {                    // falta: se añade al bloque con más hueco
    const cand = orden.filter(([k, f]) => cupos.get(k) < f.length)
      .sort((a, b) => (b[1].length - cupos.get(b[0])) - (a[1].length - cupos.get(a[0])))[0];
    if (!cand) break;
    cupos.set(cand[0], cupos.get(cand[0]) + 1);
  }

  const elegidas = [];
  for (const [k, filas] of orden) {
    const cupo = cupos.get(k);
    if (!cupo) continue;
    const pool = filas.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    pool.slice(0, cupo).forEach((x) => elegidas.push({ crit: k, fila: x.fila }));
  }
  elegidas.sort((a, b) => a.crit.localeCompare(b.crit, "es", { numeric: true }));

  const CAB = ["Criterio WCAG", "Página", "Selector", "Evidencia", "Juicio"];
  const esc = (s) => { const t = String(s == null ? "" : s); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lineas = [CAB.join(";")].concat(elegidas.map((e) => [
    e.crit,
    col.pag !== -1 ? e.fila[col.pag] : "",
    col.sel !== -1 ? e.fila[col.sel] : "",
    col.evid !== -1 ? e.fila[col.evid] : "",
    ""
  ].map(esc).join(";")));
  const destino = opcion("--salida") || csv.ruta.replace(/\.csv$/i, "") + "-muestra-" + n + ".csv";
  await writeFile(destino, "﻿" + lineas.join("\n") + "\n", "utf8");

  console.log("MUESTRA de " + elegidas.length + " de " + totalFilas + " barreras (" +
    pc(elegidas.length / totalFilas) + "), semilla " + (opcion("--semilla") || 1) + "\n");
  for (const [k, filas] of orden) {
    const c = cupos.get(k);
    console.log("  " + k.padEnd(7) + String(c).padStart(3) + " de " + String(filas.length).padEnd(4) +
      (c === 0 ? "  ← sin adjudicar: aquí la precisión NO se va a conocer" : ""));
  }
  const sinCupo = orden.filter(([k]) => !cupos.get(k)).map(([k]) => k);

  /* Y lo que la muestra NO va a poder decir, dicho antes de que nadie pierda una
   * tarde adjudicando. Con muchos bloques, el mínimo de uno por bloque se come el
   * presupuesto: en la forma real de visitspain, 15 bloques y 30 filas dejan solo
   * 15 para repartir, y el bloque más grande —1.4.1, el 22 % del informe— se queda
   * con tres. Tres filas dan un intervalo de Wilson tan ancho que no concluye nada.
   * Un medidor que no avisa de eso deja creer que la tarde sirvió para algo. */
  const MIN_UTIL = 5;
  const flacos = orden.filter(([k, f]) => f.length >= MINIMO_BLOQUE && cupos.get(k) < MIN_UTIL);
  if (flacos.length) {
    console.log("\nOJO: " + flacos.length + " bloque(s) de más de " + MINIMO_BLOQUE + " barreras se quedan con menos de " +
      MIN_UTIL + " filas");
    console.log("(" + flacos.map(([k]) => k + ": " + cupos.get(k) + " de " + bloques.get(k).length).join(", ") + ").");
    console.log("Con tan pocas, el intervalo de ese bloque sale demasiado ancho para concluir nada de él;");
    console.log("la cifra GLOBAL sí vale.");
    /* Y el consejo, calculado para CADA bloque flaco y no para el más grande.
     *
     * El primer intento lo sacaba del bloque mayor, y en el informe real salió lo
     * ridículo: con --muestra 39 los flacos eran 1.4.13 (11 barreras) y 3.3.2 (10),
     * y el consejo decía «--muestra 39». La cuenta correcta es al revés: cuanto más
     * PEQUEÑO es el bloque, más muestra total hace falta para que le toquen cinco
     * filas, y a partir de cierto punto la respuesta ya no es muestrear sino juzgar
     * el bloque entero. Diez barreras se revisan de una sentada. */
    for (const [k, f] of flacos) {
      const necesario = Math.ceil(bloques.size + (MIN_UTIL * totalFilas) / f.length);
      if (necesario >= totalFilas / 2 || f.length <= 2 * MIN_UTIL + 2) {
        console.log("· " + k + ": son " + f.length + " barreras en total. Para que le tocaran " + MIN_UTIL +
          " filas haría falta una muestra de " + necesario + " (de " + totalFilas + "),");
        console.log("  así que para este bloque sale más barato juzgarlo entero: --bloque " + k + ".");
      } else {
        console.log("· " + k + ": --muestra " + necesario + " le daría " + MIN_UTIL + " filas.");
      }
    }
    console.log("Con " + bloques.size + " bloques, " + n + " filas dejan solo " + (n - bloques.size) + " para repartir.");
  }

  console.log("\nEscrita en " + destino);
  console.log("Rellena la columna «Juicio» con: si (la barrera es real) · no (falso positivo) · duda");
  console.log("Y no cambies el orden ni las filas: la identidad es criterio + selector + página.");
  if (sinCupo.length) {
    console.log("\nOJO: " + sinCupo.length + " criterio(s) se quedan fuera de la muestra (" + sinCupo.join(", ") + ").");
    console.log("Para que la cifra global valga, sube --muestra hasta que todos los bloques de más de");
    console.log(MINIMO_BLOQUE + " barreras tengan al menos una fila.");
  }
  process.exit(0);
}

/* ── MODO 2: leer los juicios y medir ─────────────────────────────────────── */
if (!opcion("--juicios")) {
  salir("✕ Falta decirme qué hago: --muestra N para sacar la plantilla, o --juicios fichero.csv para medir.");
}

const jc = await leeCsv(opcion("--juicios"));
const jcol = columnas(jc);
const iJuicio = indiceDe(jc.cab, [/^juicio$/, /^veredicto humano$/, /^correcto$/]);
if (iJuicio === -1) {
  salir("✕ En " + jc.ruta + " no hay columna «Juicio».",
    "  Cabeceras leídas: " + jc.cab.join(" | "),
    "  Es la columna donde va si / no / duda. Sin ella no hay nada que medir.");
}

const SI = /^(si|sí|s|real|correcta?|ok|1)$/i;
const NO = /^(no|n|falso|falso positivo|fp|0)$/i;
const DUDA = /^(duda|dudosa?|\?|revisar|ni idea)$/i;

const indice = new Map();
for (const [k, filas] of bloques) for (const x of filas) indice.set(identidad(x.fila, col), k);

const juicios = new Map();   // identidad → si | no | duda
const enBlanco = new Map();  // criterio → filas que SÍ están en la muestra pero sin rellenar
const sueltas = [], raros = [];
jc.filas.forEach((f) => {
  const v = (f[iJuicio] || "").trim();
  const id = identidad(f, jcol);
  const crit = indice.get(id);
  if (!crit) { if (v) sueltas.push(id); return; }
  /* Las vacías se cuentan aparte, y no es un detalle: sin esto, un bloque con
   * filas en la muestra pero sin rellenar se confunde con un bloque que no entró
   * en la muestra, y el consejo que da el informe es el contrario del que hace
   * falta — «saca más muestra» cuando lo que toca es rellenar la que ya hay. */
  if (!v) { enBlanco.set(crit, (enBlanco.get(crit) || 0) + 1); return; }
  if (SI.test(v)) juicios.set(id, "si");
  else if (NO.test(v)) juicios.set(id, "no");
  else if (DUDA.test(v)) juicios.set(id, "duda");
  else raros.push(v);
});

if (!juicios.size) {
  salir("✕ No he leído ni un juicio de " + jc.ruta + " (" + jc.filas.length + " fila(s)).",
    "  La columna «Juicio» admite si / no / duda, y las vacías no cuentan.",
    sueltas.length ? "  " + sueltas.length + " fila(s) no casan con ninguna barrera del CSV del agente." : "",
    "  Me paro aquí: una precisión calculada sobre cero juicios saldría como 100 %.");
}

console.log("JUICIOS: " + jc.ruta + "  (" + juicios.size + " adjudicada(s) de " + totalFilas + ")\n");

const cuenta = { si: 0, no: 0, duda: 0 };
const porBloque = new Map();
for (const [id, v] of juicios) {
  cuenta[v]++;
  const k = indice.get(id);
  if (!porBloque.has(k)) porBloque.set(k, { si: 0, no: 0, duda: 0 });
  porBloque.get(k)[v]++;
}

console.log("— POR CRITERIO —");
const orden = Array.from(bloques.entries()).sort((a, b) => b[1].length - a[1].length);
for (const [k, filas] of orden) {
  const b = porBloque.get(k);
  if (!b) {
    const bl = enBlanco.get(k) || 0;
    console.log("  " + k.padEnd(7) + String(filas.length).padStart(4) + " barrera(s) · SIN ADJUDICAR — su precisión no se conoce" +
      (bl ? " (tiene " + bl + " fila(s) en la muestra, sin rellenar)" : " (no entró en la muestra)"));
    continue;
  }
  const n = b.si + b.no;
  const w = wilson(b.si, n);
  /* Bloque juzgado ENTERO: no hay error de muestreo, así que no hay intervalo que
   * dar. Decirlo importa — un intervalo sobre un censo haría dudar de un dato. */
  const censo = (b.si + b.no + b.duda) >= filas.length;
  console.log("  " + k.padEnd(7) + String(filas.length).padStart(4) + " barrera(s) · " +
    (b.si + b.no + b.duda) + " juzgada(s): " + b.si + " real(es), " + b.no + " falso(s)" +
    (b.duda ? ", " + b.duda + " en duda" : "") +
    (!n ? " · nada decidido"
        : censo && !b.duda ? " · precisión " + pc(w.p) + " EXACTA (bloque completo, sin intervalo)"
        : " · precisión " + pc(w.p) + " (entre " + pc(w.bajo) + " y " + pc(w.alto) + ")"));
}

/* La cifra global solo si la muestra cubre los bloques grandes. Un sitio reparte
 * las barreras muy desigual, y una media sin los bloques gordos mide la suerte. */
const grandesSinMirar = orden.filter(([k, f]) => f.length >= MINIMO_BLOQUE && !porBloque.has(k));
const n = cuenta.si + cuenta.no;
const w = wilson(cuenta.si, n);

console.log("\n— GLOBAL —");
if (grandesSinMirar.length) {
  console.log("  NO doy una cifra global: " + grandesSinMirar.length + " bloque(s) de más de " + MINIMO_BLOQUE +
    " barreras no tienen ni una fila juzgada");
  console.log("  (" + grandesSinMirar.map(([k, f]) => k + ": " + f.length).join(", ") + ").");
  console.log("  Entre ellos son " + grandesSinMirar.reduce((a, b) => a + b[1].length, 0) + " de las " + totalFilas +
    " barreras del informe. Una media que los deja fuera no mide el agente.");
  /* Y el consejo correcto, que depende de por qué faltan. */
  const conFilas = grandesSinMirar.filter(([k]) => enBlanco.get(k));
  if (conFilas.length === grandesSinMirar.length) {
    console.log("  Esos bloques YA tienen filas en la muestra (" +
      conFilas.map(([k]) => k + ": " + enBlanco.get(k)).join(", ") + "): rellena su columna «Juicio».");
  } else {
    const minimo = Math.min.apply(null, grandesSinMirar.filter(([k]) => !enBlanco.get(k)).map(([, f]) => f.length));
    console.log("  Saca más muestra: node scripts/falsos-positivos.mjs " + csv.ruta + " --muestra " +
      Math.ceil((2 * totalFilas) / minimo) + "   (para que el bloque más pequeño de los que faltan tenga dos filas)");
    if (conFilas.length) {
      console.log("  Y " + conFilas.map(([k]) => k).join(", ") + " ya tienen filas sin rellenar en la muestra de ahora.");
    }
  }
} else if (!n) {
  console.log("  Nada decidido: las " + cuenta.duda + " fila(s) juzgadas están todas en duda.");
} else {
  /* La cifra que se cita es la PONDERADA POR TAMAÑO DE BLOQUE, no la bruta de la
   * muestra. La muestra está estratificada con un mínimo por bloque, así que los
   * bloques pequeños salen sobrerrepresentados: en la forma real de visitspain,
   * 1.1.1 tiene UNA barrera de 190 y aporta una fila de 30 — un 3,3 % de la cifra
   * bruta para un 0,5 % del informe. Un falso positivo ahí movería la precisión
   * global seis veces más de lo que le toca. */
  let pond = 0, pesoUsado = 0;
  for (const [k, filas] of orden) {
    const b = porBloque.get(k); if (!b) continue;
    const nk = b.si + b.no; if (!nk) continue;
    pond += (filas.length / totalFilas) * (b.si / nk);
    pesoUsado += filas.length / totalFilas;
  }
  const pPond = pesoUsado ? pond / pesoUsado : null;
  console.log("  " + n + " barrera(s) decidida(s): " + cuenta.si + " real(es), " + cuenta.no + " falso(s) positivo(s)" +
    (cuenta.duda ? " (+" + cuenta.duda + " en duda, fuera del cálculo)" : ""));
  console.log("  PRECISIÓN: " + pc(pPond) + " ponderada por el tamaño de cada bloque");
  console.log("             (la bruta de la muestra sería " + pc(w.p) + ", pero los bloques pequeños");
  console.log("              están sobrerrepresentados: la muestra lleva un mínimo de uno por bloque).");
  console.log("  Y lo que se puede AFIRMAR está entre " + pc(w.bajo) + " y " + pc(w.alto) + " (Wilson, 95 %,");
  console.log("  aproximado: el intervalo exacto de una muestra estratificada es más estrecho por abajo).");
  console.log("  TECHO DE FALSOS POSITIVOS: " + pc(1 - w.bajo) + ".");
  if (cuenta.no === 0) {
    console.log("\n  Ningún falso positivo en la muestra NO es «ningún falso positivo»: con " + n +
      " filas,\n  el techo sigue en " + pc(1 - w.bajo) + ". Para bajarlo hace falta más muestra, no más confianza.");
  }
  if (cuenta.duda > n / 4) {
    console.log("\n  OJO: " + cuenta.duda + " de " + (n + cuenta.duda) + " filas quedaron en duda. Con esa proporción el");
    console.log("  intervalo de arriba es optimista: una duda puede acabar en falso positivo.");
  }
}

if (sueltas.length) {
  console.log("\nOJO: " + sueltas.length + " fila(s) de los juicios no casan con ninguna barrera de " + csv.ruta + ".");
  console.log("Suele ser que el informe se regeneró después de adjudicar, o que se editaron los selectores.");
  console.log("Primera: " + sueltas[0]);
}
if (raros.length) {
  console.log("\nOJO: " + raros.length + " valor(es) de «Juicio» que no entiendo y no he contado: " +
    Array.from(new Set(raros)).slice(0, 6).map((r) => "«" + r + "»").join(", ") + ".");
  console.log("Solo cuento si / no / duda.");
}
