#!/usr/bin/env node
/**
 * COMPARAR DOS AUDITORÍAS, O UNA AUDITORÍA CONTRA UNA REFERENCIA HUMANA.
 *
 * Hasta aquí la precisión del agente se ha medido por dentro: criterios que no
 * podían denunciar, capas que firmaban conformidad sin haberlo visto todo,
 * «no aplica» que cerraban sin dejar rastro. Todo eso se encuentra leyendo el
 * código y midiendo con páginas de respuesta sabida.
 *
 * Lo que no se puede medir así es lo que de verdad importa: sobre un sitio real
 * y grande, ¿qué se le escapa y qué se inventa? Para eso hacen falta dos cosas
 * que no están en el código — una auditoría anterior del mismo sitio, o una
 * hecha a mano por una persona — y esto es la herramienta que las compara.
 *
 * DOS MODOS:
 *
 *   node scripts/comparar-auditorias.mjs antes.json despues.json
 *     Dos salidas `--json` del agente (del mismo sitio y la misma muestra).
 *     Dice qué criterio cambió de veredicto y en qué dirección, y qué barreras
 *     aparecieron y desaparecieron. Lo que se vuelve MÁS INDULGENTE se marca
 *     aparte: en este proyecto esa es la dirección peligrosa, y cada caso hay
 *     que justificarlo o es una regresión.
 *
 *   node scripts/comparar-auditorias.mjs auditoria.json --referencia barreras.csv
 *     Contra una referencia humana: un CSV con una columna de criterio WCAG
 *     (vale el «-barreras.csv» del propio agente, o un export de tu hoja de
 *     seguimiento). Dice qué criterios marca la persona y el agente no (lo que
 *     SE LE ESCAPA) y al contrario (candidatos a falso positivo, que hay que ir
 *     a ver uno por uno).
 *
 * No concluye nada solo: señala dónde mirar. La precisión se mide elemento a
 * elemento, y eso lo hace una persona con esta lista delante.
 */
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const refIx = args.indexOf("--referencia");
const referencia = refIx !== -1 ? args[refIx + 1] : null;
const segIx = args.indexOf("--seguimiento");
const seguimientoRuta = segIx !== -1 ? args[segIx + 1] : null;
const hojaIx = args.indexOf("--hoja");
const hojaNombre = hojaIx !== -1 ? args[hojaIx + 1] : null;
// OJO con el `refIx + 1`: sin `--referencia`, refIx es -1 y eso se comía el
// primer fichero. Lo encontró el primer uso, que es lo que tienen las pruebas
// de verdad frente a leer el código.
const valorDeOpcion = new Set([refIx, segIx, hojaIx].filter((i) => i !== -1).map((i) => i + 1));
const ficheros = args.filter((a, i) => a.indexOf("--") !== 0 && !valorDeOpcion.has(i));

if (!ficheros.length) {
  console.error("Uso:\n  node scripts/comparar-auditorias.mjs antes.json despues.json" +
    "\n  node scripts/comparar-auditorias.mjs auditoria.json --referencia barreras.csv" +
    "\n  node scripts/comparar-auditorias.mjs auditoria.json --seguimiento hoja.xlsx [--hoja Seguimiento]");
  process.exit(2);
}

/* El orden de severidad, que es el del propio agente: lo que sube es más
 * severo, lo que baja es más indulgente. `no-aplica` queda aparte porque no es
 * un grado de la misma escala: es sacar el criterio del informe. */
const RANGO = { falla: 5, revisar: 4, humano: 3, "cumple-parcial": 2, pasa: 1, cumple: 0, "no-aplica": -1 };
const rango = (v) => (RANGO[v] === undefined ? 4 : RANGO[v]);   // desconocido → se trata como `revisar`

/* LEER, Y NEGARSE A COMPARAR NADA.
 *
 * Esto salió del primer uso de verdad: la orden que tenía que generar el
 * segundo informe falló, pero la redirección del intérprete ya había creado el
 * fichero, así que quedó un `.json` de cero bytes — y la comparación se rompió
 * con un «Unexpected end of JSON input» y una pila de llamadas, que no le dice
 * a nadie qué ha pasado.
 *
 * Y lo peor no era eso. Con un JSON válido pero que no es una auditoría del
 * agente, la herramienta imprimía el informe entero: «0 más severo, 0 más
 * indulgente, 0 barreras», que se lee como «no ha cambiado nada» cuando lo que
 * pasa es que no se ha leído nada. Es la regla de oro del proyecto aplicada a
 * la propia herramienta: el silencio se lee como conformidad, así que una
 * comparación que no puede hacerse tiene que decirlo y salir, no salir en
 * blanco. */
const salir = (...lineas) => { lineas.forEach((l) => console.error(l)); process.exit(2); };

const leer = async function (f) {
  let txt;
  try {
    txt = await readFile(f, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") salir("✕ No existe el fichero: " + f);
    if (e.code === "EISDIR") salir("✕ Eso es una carpeta, no un informe: " + f);
    salir("✕ No puedo leer " + f + ": " + e.message);
  }
  if (!txt.trim()) {
    salir("✕ El fichero está VACÍO (0 bytes útiles): " + f,
      "  Suele pasar cuando la orden que tenía que generarlo falló y la",
      "  redirección `> " + f + "` creó el fichero igualmente. Mira el error de",
      "  esa orden y vuelve a generarlo antes de comparar.");
  }
  let j;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    salir("✕ " + f + " no es JSON válido: " + e.message,
      "  Empieza así: " + JSON.stringify(txt.slice(0, 60)));
  }
  if (!j || typeof j !== "object" || !Array.isArray(j.seguimiento)) {
    salir("✕ " + f + " no parece un informe del agente: no trae la lista `seguimiento`.",
      "  Aquí van las salidas `--json` de `examples/auditar-muestra.mjs` o de",
      "  `auditar-sitio.mjs`, que llevan `seguimiento` (un veredicto por",
      "  subcriterio) y `barreras`. Comparar otra cosa daría un informe lleno de",
      "  ceros, y un informe lleno de ceros se lee como «no ha cambiado nada».");
  }
  return j;
};
const porCriterio = (j) => {
  const out = {};
  (j.seguimiento || []).forEach((s) => { out[s.criterio] = { veredicto: s.veredicto, barreras: s.num_barreras || 0 }; });
  return out;
};
/* Identidad de una barrera: criterio + página + selector. El selector es la
 * ruta canónica que el agente calcula, así que es estable entre pasadas del
 * mismo sitio; el texto de la evidencia no lo es (cambia al mejorar la
 * redacción), y por eso no entra en la clave.
 *
 * Y HAY BARRERAS SIN SELECTOR. Esto salió comparando las pasadas v5 y v6 de un
 * sitio real: 62 de 522 filas —el 12 %— venían sin `selector`, todas de la capa
 * de adaptación (1.4.4, 1.4.10, 1.4.12), que nombra el bloque recortado en el
 * campo `elemento` y no calcula ruta. Con la clave a secas, las diez filas de
 * una misma página se fundían en una, y la comparación dijo «desaparecidas 1»
 * cuando 1.4.4 había perdido dos filas y 1.4.10 una. Quedarse callado sobre el
 * 12 % de las barreras es lo mismo que el informe que absuelve por no haber
 * mirado: así que se usa `elemento` cuando no hay selector, y lo que AÚN no se
 * pueda distinguir se cuenta y se dice. */
const identidad = (b) => (b.selector || b.path || "").trim() || (b.elemento || "").trim();
const clave = (b) => [b.criterio || (b.c && b.c.n), b.pagina || b.url || "", identidad(b)].join(" | ");
const barrerasDe = (j) => {
  const m = new Map();
  let porElemento = 0, sinNada = 0, colisiones = 0;
  (j.barreras || []).forEach((b) => {
    if (!(b.selector || b.path || "").trim()) {
      if ((b.elemento || "").trim()) porElemento++; else sinNada++;
    }
    const k = clave(b);
    if (m.has(k)) colisiones++; else m.set(k, b);
  });
  return { mapa: m, porElemento: porElemento, sinNada: sinNada, colisiones: colisiones };
};
/* La nota de cobertura de la comparación elemento a elemento: sin ella, «nuevas
 * 3 · desaparecidas 1» se lee como el recuento completo. */
const notaIdentidad = function (a, b) {
  const l = [];
  const pe = a.porElemento + b.porElemento;
  if (pe) l.push(pe + " fila(s) no traían selector y se han identificado por su campo `elemento`");
  const sn = a.sinNada + b.sinNada;
  if (sn) l.push(sn + " fila(s) no traían NI selector NI elemento: de esas no se puede decir si son la misma o otra");
  const co = a.colisiones + b.colisiones;
  if (co) l.push(co + " fila(s) comparten identidad con otra y se han contado UNA vez: un cambio dentro de ese grupo no se ve aquí");
  return l;
};

const uno = await leer(ficheros[0]);

if (seguimientoRuta) {
  /* ── MODO HOJA DE SEGUIMIENTO ───────────────────────────────────────────────
   *
   * El modo `--referencia` lee una LISTA DE BARRERAS, y con la auditoría real de
   * un sitio delante se vio lo que eso no puede decir. La hoja traía cuatro
   * criterios con hallazgos y el agente denunciaba catorce, así que el informe
   * sacó «SOLO EL AGENTE · 10 (candidatos a falso positivo)». Y era falso: de
   * esos diez, nueve estaban sin evaluar en la hoja —«Nulo»— y uno estaba
   * marcado como que CUMPLE. Son dos cosas distintísimas, y meterlas en el mismo
   * montón es la forma de no mirar la única que importaba.
   *
   * Una hoja de seguimiento sí lo distingue, porque tiene vocabulario para ello:
   * una matriz de criterios por páginas donde cada celda dice cumple, falla, no
   * aplica o todavía nadie lo ha visto. Con eso el cotejo se parte en cuatro
   * montones que exigen cuatro reacciones distintas. */
  const { leeLibro } = await import("./xlsx-min.mjs");
  let filas;
  if (/\.xlsx$/i.test(seguimientoRuta)) {
    let libro;
    try { libro = await leeLibro(seguimientoRuta); }
    catch (e) { salir("✕ No puedo leer " + seguimientoRuta + ": " + e.message); }
    const cual = hojaNombre || libro.hojas.find((h) => /seguimiento/i.test(h));
    if (!cual) {
      salir("✕ En " + seguimientoRuta + " no hay ninguna hoja que se llame «Seguimiento».",
        "  Hojas del libro: " + libro.hojas.join(" | "),
        "  Dime cuál con `--hoja «<nombre>»`.");
    }
    try { filas = libro.filas(cual); }
    catch (e) { salir("✕ " + e.message); }
    console.log("HOJA:    " + seguimientoRuta + "  (pestaña «" + cual + "»)");
  } else {
    let txt;
    try { txt = await readFile(seguimientoRuta, "utf8"); }
    catch (e) {
      if (e.code === "ENOENT") salir("✕ No existe la hoja de seguimiento: " + seguimientoRuta);
      salir("✕ No puedo leer " + seguimientoRuta + ": " + e.message);
    }
    const ls = txt.split(/\r?\n/).filter((l) => l.trim());
    if (ls.length < 2) salir("✕ " + seguimientoRuta + " no tiene filas suficientes (" + ls.length + ").");
    const sp = (ls[0].match(/;/g) || []).length >= (ls[0].match(/,/g) || []).length ? ";" : ",";
    filas = ls.map((l) => l.replace(/^﻿/, "").split(sp).map((c) => c.replace(/^"|"$/g, "").trim()));
    console.log("HOJA:    " + seguimientoRuta);
  }
  console.log("AGENTE:  " + ficheros[0] + "\n");

  /* El vocabulario de la hoja. Se normaliza sin acentos y en minúsculas porque
   * lo escribe una persona a mano, pero NO se adivina: un valor que no esté en
   * ninguna lista se dice al final en vez de tratarse como «sin mirar», que es
   * como un error de escritura se convertiría en silencio. */
  const pela = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const VOCAB = [
    ["falla", ["ninguno", "no cumple", "falla", "fallo", "incumple", "no", "fail", "error", "barrera", "ko"]],
    ["parcial", ["parcial", "parcialmente", "cumple parcial", "cumple parcialmente", "partial"]],
    ["cumple", ["total", "totalmente", "cumple", "pasa", "conforme", "ok", "si", "pass", "aprobado", "correcto"]],
    ["no-aplica", ["no aplica", "no procede", "n/a", "na", "not applicable", "no aplicable"]],
    ["sin-mirar", ["nulo", "pendiente", "sin evaluar", "sin comprobar", "por revisar", "tbd", "-", "", "null"]]
  ];
  const desconocidos = {};
  let numericos = 0;
  const clasifica = function (celda) {
    const t = pela(celda);
    for (const [clase, lista] of VOCAB) if (lista.indexOf(t) !== -1) return clase;
    /* Un número no es un veredicto en ninguna hoja: una prioridad, un peso, un
     * recuento. Se cuentan aparte en vez de engordar la lista de avisos. */
    if (/^-?\d+([.,]\d+)?%?$/.test(t)) { numericos++; return null; }
    desconocidos[celda] = (desconocidos[celda] || 0) + 1;
    return null;   // null ≠ «sin mirar»: es «no sé qué pone aquí»
  };

  /* La columna del criterio es la primera que contenga un número de criterio en
   * la mayoría de sus filas; las columnas de páginas son las que traen valores
   * del vocabulario. Así no hay que configurar nada. */
  const RE = /\b([1-4])\.(\d)\.(\d+)\b/;
  const anchura = filas.reduce((a, f) => Math.max(a, f.length), 0);
  let colCrit = -1, mejor = 0;
  for (let c = 0; c < anchura; c++) {
    const n = filas.filter((f) => RE.test(String(f[c] == null ? "" : f[c]))).length;
    if (n > mejor) { mejor = n; colCrit = c; }
  }
  if (colCrit === -1) {
    salir("✕ En la hoja no encuentro ninguna columna con números de criterio («1.4.3» o «SC 1.4.3 — …»).",
      "  La primera fila dice: " + (filas[0] || []).slice(0, 12).join(" | "));
  }

  /* QUÉ COLUMNAS SON LAS DE LAS PÁGINAS.
   *
   * Hacía falta saberlo antes de clasificar nada. La primera versión miraba
   * TODAS las columnas de la fila, y con la hoja real delante avisó de diez
   * «valores que no reconozco» que eran las columnas de al lado —«A», «AA»,
   * «Obligatorio», «Visual», la prioridad—. Un aviso que salta donde no hay
   * nada que avisar enseña a no leer los avisos, y entonces el día que uno sea
   * de verdad tampoco se lee.
   *
   * Así que primero se localizan las columnas que de verdad llevan veredictos
   * —las que traen dos o más celdas del vocabulario— y el aviso solo mira ahí
   * dentro. */
  const esVocabulario = function (celda) {
    const t = pela(celda);
    if (!t) return false;                                  // vacía no es un valor
    for (const [, lista] of VOCAB) if (lista.indexOf(t) !== -1) return true;
    return false;
  };
  const sonVeredicto = [];
  for (let c = 0; c < anchura; c++) {
    if (c === colCrit) continue;
    /* Basta UNA celda del vocabulario para que la columna cuente. El primer
     * umbral pedía dos y se cargaba las hojas pequeñas —tres páginas y dos
     * criterios— donde una columna legítima tiene una sola. Lo que separa una
     * columna de páginas de la de «Nivel» o «Requisito» no es cuántas tiene,
     * sino que tenga alguna: «A», «AA» u «Obligatorio» no son veredictos. */
    if (filas.some((f) => esVocabulario(f[c]))) sonVeredicto.push(c);
  }
  /* UNA COLUMNA MEZCLADA SUELE SER UNA FILA DESPLAZADA.
   *
   * En la hoja real, la columna «Prioridad» traía 50 números y además seis
   * veredictos: en seis filas —las de los criterios que añadió WCAG 2.2— el
   * veredicto de la primera página se había escrito una columna antes, y la
   * última columna de páginas quedaba vacía. El cotejo sale bien porque cuenta
   * valores y no posiciones, pero callarlo sería quedarse con un dato que a
   * quien mantiene la hoja le interesa. */
  const mezcladas = sonVeredicto.filter((c) => {
    let v = 0, o = 0;
    filas.forEach((f) => {
      const t = pela(f[c]);
      if (!t) return;
      let esV = false;
      for (const [clase, lista] of VOCAB) if (clase !== "sin-mirar" && lista.indexOf(t) !== -1) esV = true;
      if (esV) v++; else o++;
    });
    return v && o > v;
  });
  if (!sonVeredicto.length) {
    salir("✕ He encontrado la columna de criterios (la " + (colCrit + 1) + ") pero ninguna columna de veredictos.",
      "  Vocabulario que entiendo: " + VOCAB.map(([k, l]) => k + " (" + l.slice(0, 4).join(", ") + "…)").join(" · "),
      "  La primera fila dice: " + (filas[0] || []).slice(0, 14).join(" | "));
  }

  const hoja = {};
  filas.forEach((f) => {
    const m = RE.exec(String(f[colCrit] == null ? "" : f[colCrit]));
    if (!m) return;
    const n = m[1] + "." + m[2] + "." + m[3];
    const cuenta = { falla: 0, parcial: 0, cumple: 0, "no-aplica": 0, "sin-mirar": 0 };
    let celdas = 0;
    sonVeredicto.forEach((c) => {
      const v = f[c];
      /* Una celda vacía al final de la fila es que la fila se acabó, no un
       * criterio sin mirar: no se cuenta ni como una cosa ni como la otra. */
      if (!pela(v)) return;
      const k = clasifica(v);
      if (k === null) return;
      cuenta[k]++; celdas++;
    });
    if (!celdas) return;
    hoja[n] = cuenta;
  });
  if (!Object.keys(hoja).length) {
    salir("✕ He encontrado la columna de criterios pero ninguna celda con veredicto reconocible.",
      "  Vocabulario que entiendo: " + VOCAB.map(([k, l]) => k + " (" + l.slice(0, 4).join(", ") + "…)").join(" · "));
  }

  /* El veredicto de la persona para el criterio entero, con el mismo criterio de
   * seguridad que usa el agente: lo peor que haya dicho de alguna página manda.
   * Un criterio que falla en una página falla en el sitio. */
  const suyo = function (c) {
    if (c.falla) return "falla";
    if (c.parcial) return "parcial";
    if (c.cumple) return "cumple";
    if (c["no-aplica"]) return "no-aplica";
    return "sin-mirar";
  };
  const mios = porCriterio(uno);
  const DENUNCIA = (v) => v === "falla";
  const ABSUELVE = (v) => v === "cumple" || v === "pasa";

  const escapan = [], falsos = [], aplicabilidad = [], adelantado = [], coinciden = [], noAbsuelve = [], fuera = [];
  let deAcuerdo = 0;
  const detalle = (c) => Object.keys(c).filter((k) => c[k]).map((k) => k + " x" + c[k]).join(", ");

  Object.keys(hoja).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).forEach((n) => {
    const s = suyo(hoja[n]);
    const mio = mios[n];
    const v = mio ? mio.veredicto : null;
    const nb = mio ? mio.barreras : 0;
    const linea = n + "  [persona: " + detalle(hoja[n]) + "]  [agente: " + (v || "sin ficha") +
      (nb ? " · " + nb + " barrera(s)" : "") + "]";
    /* Un criterio de la hoja del que el agente no tiene ficha no es el agente
     * callándose: la hoja puede venir de WCAG 2.1 y traer el 4.1.1, que 2.2
     * retiró. Eso va aparte o se leería como un hueco del motor. */
    if (!v) { fuera.push(n + "  [persona: " + detalle(hoja[n]) + "]"); return; }
    if (s === "falla" && DENUNCIA(v)) coinciden.push(linea);
    else if (s === "falla") escapan.push(linea);
    else if ((s === "cumple" || s === "parcial") && DENUNCIA(v)) falsos.push(linea);
    else if (s === "no-aplica" && DENUNCIA(v)) aplicabilidad.push(linea);
    else if (s === "sin-mirar" && DENUNCIA(v)) adelantado.push(linea);
    else if ((s === "cumple" || s === "no-aplica") && !ABSUELVE(v) && v !== "no-aplica") noAbsuelve.push(linea);
    else deAcuerdo++;
  });

  const bloque = (t, xs, marca, nota) => {
    console.log("── " + t + " · " + xs.length);
    if (nota) nota.forEach((l) => console.log("   " + l));
    xs.forEach((x) => console.log("   " + marca + " " + x));
    console.log("");
  };
  bloque("SE LE ESCAPAN al agente (la persona lo denuncia y él no)", escapan, "✕",
    ["Lo más grave que puede salir aquí: una barrera real que el agente no ve."]);
  bloque("CANDIDATOS A FALSO POSITIVO (la persona dice que CUMPLE y el agente lo denuncia)", falsos, "!",
    ["Esto sí son candidatos de verdad, y hay que ir a verlos uno por uno.",
     "O el agente se lo inventa, o la persona lo miró en otras condiciones."]);
  bloque("DESACUERDO DE APLICABILIDAD (la persona dice «no aplica» y el agente denuncia)", aplicabilidad, "?",
    ["Un «no aplica» saca el criterio del informe sin que nadie lo mire.",
     "Si el agente tiene razón en que aplica, ese cierre es el que hay que deshacer."]);
  bloque("EL AGENTE VA POR DELANTE (la persona no lo ha mirado todavía)", adelantado, "·",
    ["De aquí NO se concluye nada sobre precisión: nadie se ha pronunciado enfrente."]);
  bloque("COINCIDEN (los dos lo denuncian)", coinciden, "✓");
  if (noAbsuelve.length) {
    console.log("── Y donde la persona absuelve, el agente no (sin denunciar) · " + noAbsuelve.length);
    console.log("   Esto es el diseño, no un desacuerdo: `revisar`, `humano` y `cumple-parcial`");
    console.log("   no son conformidad, y el agente no firma lo que no ha medido entero.");
    noAbsuelve.forEach((x) => console.log("   – " + x));
    console.log("");
  }
  if (fuera.length) {
    console.log("── Criterios de la hoja de los que el agente no tiene ficha · " + fuera.length);
    console.log("   No es un hueco del motor: una hoja de WCAG 2.1 trae criterios que 2.2 retiró.");
    fuera.forEach((x) => console.log("   » " + x));
    console.log("");
  }
  /* La cuenta tiene que cerrar: si los montones no suman los criterios de la
   * hoja, hay criterios que no se están diciendo en ninguna parte. */
  const total = Object.keys(hoja).length;
  console.log("Criterios de la hoja: " + total + " = " + escapan.length + " escapados + " + falsos.length +
    " falsos candidatos + " + aplicabilidad.length + " de aplicabilidad + " + adelantado.length +
    " por delante + " + coinciden.length + " coincidentes + " + noAbsuelve.length + " sin absolver + " +
    fuera.length + " sin ficha + " + deAcuerdo + " de acuerdo sin más.\n");

  if (mezcladas.length) {
    console.log("── Ojo con la hoja: " + mezcladas.length + " columna(s) mezclan veredictos con otra cosa");
    mezcladas.forEach((c) => console.log("   » columna " + (c + 1) +
      " («" + String((filas[0] || [])[c] || "sin cabecera") + "»): suele ser una fila en la que el" +
      " veredicto de la primera página se escribió una columna antes."));
    console.log("   El cotejo cuenta valores, no posiciones, así que sale bien de todas formas.");
    console.log("");
  }
  const mal = Object.keys(desconocidos);
  if (mal.length) {
    console.log("── Celdas con un valor que no reconozco · " + mal.length + " distinto(s)");
    console.log("   No las he contado como nada. Si alguna es un veredicto, dímelo y amplío el vocabulario:");
    mal.slice(0, 12).forEach((k) => console.log("   » " + JSON.stringify(k) + " x" + desconocidos[k]));
    if (mal.length > 12) console.log("   … y " + (mal.length - 12) + " más");
    console.log("");
  }
  console.log("Lo que esto NO dice: si las barreras que coinciden en criterio son las MISMAS");
  console.log("barreras. Eso se compara elemento a elemento, con el selector delante.");
} else if (referencia) {
  // ── MODO REFERENCIA ────────────────────────────────────────────────────────
  let csv;
  try {
    csv = await readFile(referencia, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") salir("✕ No existe el CSV de referencia: " + referencia);
    salir("✕ No puedo leer la referencia " + referencia + ": " + e.message);
  }
  const lineas = csv.split(/\r?\n/).filter(Boolean);
  if (lineas.length < 2) {
    salir("✕ La referencia " + referencia + " no tiene filas: " + lineas.length + " línea(s).",
      "  Hace falta una cabecera y al menos una barrera.");
  }
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const cab = lineas[0].replace(/^﻿/, "").split(sep).map((c) => c.replace(/^"|"$/g, "").trim().toLowerCase());
  /* La columna del criterio, POR ORDEN DE PREFERENCIA.
   *
   * El primer uso con datos reales buscó «subcriterio» antes que «criterio
   * wcag», cogió la columna de la EN («9.1.1.1») y de ahí sacó «9.1.1» con la
   * expresión del criterio: siete criterios inventados y todo lo demás
   * «escapado». La columna de WCAG manda, y un subcriterio de la EN se
   * normaliza quitándole el 9 de delante. */
  const PREFERIDAS = [/criterio wcag/, /^criterio$/, /^sc$/, /^wcag$/, /subcriterio/];
  let col = -1;
  for (let i = 0; i < PREFERIDAS.length && col === -1; i++) col = cab.findIndex((c) => PREFERIDAS[i].test(c));
  if (col === -1) col = 0;
  const RE_SC = /\b\d\.\d\.\d+\b/;
  const normaliza = function (t) {
    const en = /^9\.(\d\.\d\.\d+)$/.exec(t);
    return en ? en[1] : t;
  };
  const refCrits = {};
  lineas.slice(1).forEach((l) => {
    const campos = l.split(sep);
    const bruto = (campos[col] || l).replace(/"/g, "");
    const m = /\b9\.\d\.\d\.\d+\b/.exec(bruto) || RE_SC.exec(bruto) || RE_SC.exec(l);
    if (m) { const n = normaliza(m[0]); refCrits[n] = (refCrits[n] || 0) + 1; }
  });
  /* Si de la columna elegida no sale ni un criterio, el informe diría «0
   * criterios con barrera · 0 se le escapan», que es la peor salida posible:
   * parece que el agente coincide con la persona en todo. */
  if (!Object.keys(refCrits).length) {
    salir("✕ En " + referencia + " no he sacado ningún criterio WCAG de la columna «" +
      (cab[col] || "?") + "» (" + (lineas.length - 1) + " fila(s) leídas).",
      "  Hace falta una columna con el número del criterio («1.4.3») o del",
      "  subcriterio de la EN («9.1.4.3»). Las cabeceras que encontré: " + cab.join(" | "),
      "  Sin eso no comparo nada: diría «0 se le escapan», y eso se leería como",
      "  que el agente coincide con la persona en todo.");
  }
  const mios = porCriterio(uno);
  const DENUNCIA = { falla: 1 };
  const SOSPECHA = { revisar: 1, humano: 1, "cumple-parcial": 1 };

  console.log("REFERENCIA: " + referencia + "  (columna «" + (cab[col] || "?") + "», " +
    Object.keys(refCrits).length + " criterio(s) con barrera)");
  console.log("AGENTE:     " + ficheros[0] + "\n");

  const escapan = [], coinciden = [], soloAgente = [];
  Object.keys(refCrits).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).forEach((n) => {
    const mio = mios[n];
    const v = mio ? mio.veredicto : "(sin ficha)";
    if (DENUNCIA[v]) coinciden.push(n + " (" + refCrits[n] + " en la referencia, " + (mio.barreras || 0) + " en el agente)");
    else if (SOSPECHA[v]) escapan.push(n + " → el agente dice `" + v + "`: lo deja a juicio, no lo denuncia");
    else escapan.push(n + " → el agente dice `" + v + "`: ESTO ES LO GRAVE, lo absuelve");
  });
  Object.keys(mios).forEach((n) => { if (mios[n].veredicto === "falla" && !refCrits[n]) soloAgente.push(n + " (" + mios[n].barreras + " barrera(s))"); });

  console.log("── COINCIDEN (los dos denuncian) · " + coinciden.length);
  coinciden.forEach((x) => console.log("   ✓ " + x));
  console.log("\n── SE LE ESCAPAN al agente · " + escapan.length);
  escapan.forEach((x) => console.log("   ✕ " + x));
  console.log("\n── SOLO EL AGENTE los denuncia · " + soloAgente.length);
  console.log("   (candidatos a falso positivo: hay que ir a ver cada uno. También puede ser");
  console.log("    que la persona no llegara a ese elemento, que para eso está la máquina.)");
  soloAgente.forEach((x) => console.log("   ? " + x));
  console.log("\nLo que esto NO dice: si las barreras que coinciden en criterio son las MISMAS");
  console.log("barreras. Eso se compara elemento a elemento, con el selector delante.");
} else {
  // ── MODO DOS PASADAS ───────────────────────────────────────────────────────
  if (ficheros.length < 2) { console.error("Faltan dos ficheros, o usa --referencia."); process.exit(2); }
  const dos = await leer(ficheros[1]);
  const a = porCriterio(uno), b = porCriterio(dos);
  const todos = [...new Set(Object.keys(a).concat(Object.keys(b)))].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));

  console.log("ANTES:   " + ficheros[0] + "  → " + (uno.rollup && uno.rollup.conformidad));
  console.log("DESPUÉS: " + ficheros[1] + "  → " + (dos.rollup && dos.rollup.conformidad));
  const r1 = (uno.rollup && uno.rollup.resumen) || {}, r2 = (dos.rollup && dos.rollup.resumen) || {};
  console.log("resumen: fallan " + r1.fallan + "→" + r2.fallan + " · revisar " + r1.revisar + "→" + r2.revisar +
    " · conformes " + r1.conformes + "→" + r2.conformes + " · no aplican " + r1.noAplican + "→" + r2.noAplican + "\n");

  const masSevero = [], masIndulgente = [], mismoDistinto = [], nuevos = [], perdidos = [];
  todos.forEach((n) => {
    const va = a[n] && a[n].veredicto, vb = b[n] && b[n].veredicto;
    /* Que un criterio NO ESTUVIERA antes no es indulgencia ni severidad: es que
     * el informe no lo traía. Pasa de verdad —la primera pasada de visitspain
     * traía 51 criterios y la última 55— y mezclarlo con los cambios de
     * veredicto haría leer «más indulgente» donde lo que hubo fue un criterio
     * nuevo. Lo encontró el primer uso con datos reales. */
    /* Y «veredicto null» es lo mismo que no estar: la pasada v4 de visitspain
     * traía cuatro criterios con el veredicto a null —el criterio estaba en la
     * tabla pero nadie se había pronunciado—, y el primer uso de esto los
     * clasificó como «más indulgente», que es exactamente lo contrario. */
    if (va === undefined || va === null) { nuevos.push("   " + n + "  (sin veredicto antes) → `" + vb + "`"); return; }
    if (vb === undefined || vb === null) { perdidos.push("   " + n + "  `" + va + "` → DESAPARECE DEL INFORME"); return; }
    if (va === vb) {
      const na = (a[n] || {}).barreras || 0, nb = (b[n] || {}).barreras || 0;
      if (na !== nb) mismoDistinto.push("   " + n + "  `" + va + "`, pero " + na + " → " + nb + " barrera(s)");
      return;
    }
    const linea = "   " + n + "  `" + va + "` → `" + vb + "`";
    if (vb === "no-aplica" && va !== "no-aplica") masIndulgente.push(linea + "   ← SALE DEL INFORME");
    else if (va === "no-aplica" && vb !== "no-aplica") masSevero.push(linea + "   ← vuelve al informe");
    else if (rango(vb) > rango(va)) masSevero.push(linea);
    else masIndulgente.push(linea);
  });

  if (perdidos.length) {
    console.log("── CRITERIOS QUE DESAPARECEN DEL INFORME (" + perdidos.length + "): lo más grave que puede salir aquí");
    perdidos.forEach((x) => console.log(x));
    console.log("");
  }
  if (nuevos.length) {
    console.log("── CRITERIOS NUEVOS en el informe (" + nuevos.length + "): antes no traían ni fila");
    nuevos.forEach((x) => console.log(x));
    console.log("");
  }
  console.log("── MÁS SEVERO (" + masSevero.length + "): antes callaba o absolvía, ahora dice algo");
  masSevero.forEach((x) => console.log(x));
  console.log("\n── MÁS INDULGENTE (" + masIndulgente.length + "): LA DIRECCIÓN PELIGROSA");
  console.log("   Cada uno hay que justificarlo —un falso positivo retirado está bien— o es");
  console.log("   una regresión: el agente ha dejado de ver algo que veía.");
  masIndulgente.forEach((x) => console.log(x));
  if (mismoDistinto.length) {
    console.log("\n── MISMO VEREDICTO, DISTINTO RECUENTO (" + mismoDistinto.length + ")");
    mismoDistinto.forEach((x) => console.log(x));
  }

  // Barreras concretas, por elemento.
  const ia = barrerasDe(uno), ib = barrerasDe(dos);
  const ba = ia.mapa, bb = ib.mapa;
  const nuevas = [...bb.keys()].filter((k) => !ba.has(k));
  const idas = [...ba.keys()].filter((k) => !bb.has(k));
  console.log("\n── BARRERAS, ELEMENTO A ELEMENTO ──");
  console.log("   antes " + ba.size + " · después " + bb.size + " · nuevas " + nuevas.length + " · desaparecidas " + idas.length);
  const nota = notaIdentidad(ia, ib);
  if (nota.length) {
    console.log("   Lo que este cotejo NO distingue:");
    nota.forEach((l) => console.log("     · " + l));
  }
  const muestra = (ks, m, t) => {
    if (!ks.length) return;
    console.log("\n   " + t);
    ks.slice(0, 12).forEach((k) => {
      const b2 = m.get(k);
      console.log("     " + k.split(" | ")[0] + "  " + String(b2.pagina || "").replace(/^https?:\/\//, "").slice(0, 40) +
        "  " + String(b2.elemento || "").slice(0, 48));
    });
    if (ks.length > 12) console.log("     … y " + (ks.length - 12) + " más");
  };
  muestra(nuevas, bb, "NUEVAS (cada una hay que comprobarla: una barrera inventada es lo único que no se perdona)");
  muestra(idas, ba, "DESAPARECIDAS (o era un falso positivo que se ha retirado, o es algo que ya no se ve)");
}
