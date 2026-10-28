#!/usr/bin/env node
/**
 * Verificación contra NVDA REAL (Windows).
 *
 *   node examples/verificar-nvda.mjs [salida.json]
 *
 * El gemelo del de VoiceOver, y el que de verdad hace falta: en España el lector
 * dominante es NVDA, y NVDA es Windows. Desde un Mac no se puede ejecutar, así
 * que el sitio natural de esta prueba es la integración continua —
 * `.github/workflows/nvda.yml`, sobre `windows-latest` — y su resultado es un
 * JSON que se guarda como fixture: a partir de ahí, la comparación ya se puede
 * probar sin Windows y sin lector.
 *
 * ── Antes de ejecutarlo ────────────────────────────────────────────────────
 *  - Windows con NVDA instalado por `npx @guidepup/setup install`. Ojo al
 *    subcomando: `setup` en Windows no hace NADA —está vacío en el propio
 *    CLI— y quien descarga y registra el lector es `install`.
 *  - NVDA ARRANCA y habla durante la prueba. No es para dejarlo de fondo.
 *  - El navegador tiene que quedarse en primer plano: `lastSpokenPhrase()` habla
 *    de todo el sistema, y si el foco se va, lo que se captura es la barra de
 *    tareas. El puente detecta esas frases y las marca `sin-captura` en vez de
 *    inventarse un nombre, pero entonces la prueba no verifica nada.
 */
import { writeFile } from "fs/promises";
import { understand, analyze, setDOMParser } from "../src/index.js";
import { bridge, captureWithNvda } from "../src/guidepup-bridge.js";
import { idiomaDelLector } from "../src/reader-lexicon.js";

const salida = process.argv[2] || "verificacion-nvda.json";

/* ── UN FALLO TAMBIÉN TIENE QUE DEJAR INFORME ──────────────────────────────
 *
 * Esto sale de una ejecución real en CI, y de lo que NO se pudo saber de ella.
 * El workflow de NVDA terminó así, y es todo lo que llegó:
 *
 *     nvda  Process completed with exit code 1.
 *     nvda  No files were found with the provided path:
 *           agente-a11y-motor/verificacion-nvda.json. No artifacts will be uploaded.
 *
 * Dos líneas que no dicen nada. El script sí explicaba el motivo por la salida
 * de error, pero el log de un runner se mira una vez y se cierra, mientras que
 * el artefacto es lo que queda — y al no escribir nada cuando falla, lo que
 * quedaba era la ausencia. Es la regla de oro del proyecto aplicada a la
 * integración continua: el silencio de un artefacto que falta se lee como «no
 * pasó nada», cuando lo que pasó es que no se pudo comprobar.
 *
 * Así que todas las salidas, incluidas las de error, dejan el JSON con el
 * motivo. Comprobable aquí mismo: en macOS o Linux este script sale con 2 y
 * ahora deja un informe que dice por qué.
 */
async function salir(codigo, motivo, extra) {
  const informe = Object.assign({
    creado: new Date().toISOString(),
    lector: "nvda",
    ok: false,
    motivo: motivo,
    plataforma: process.platform,
    nodeVersion: process.version,
    salidaCodigo: codigo
  }, extra || {});
  try {
    await writeFile(salida, JSON.stringify(informe, null, 2) + "\n", "utf8");
    console.error("  Informe del fallo: " + salida);
  } catch (e) {
    console.error("  (y no se pudo escribir el informe: " + ((e && e.message) || e) + ")");
  }
  process.exit(codigo);
}

if (process.platform !== "win32") {
  console.error("✗ NVDA solo existe en Windows. Aquí no hay nada que verificar.");
  console.error("  Desde macOS o Linux, lanza el workflow de CI: .github/workflows/nvda.yml");
  await salir(2, "NVDA solo existe en Windows: esta máquina es " + process.platform);
}

const { DOMParser } = await import("linkedom");
setDOMParser(DOMParser);

const RUTAS_GUIDEPUP = ["@guidepup/guidepup", process.env.GUIDEPUP_PATH].filter(Boolean);
let guidepup = null, deDonde = null;
const fallosDeImport = [];
for (const r of RUTAS_GUIDEPUP) {
  try { guidepup = await import(r); deDonde = r; break; }
  catch (e) { fallosDeImport.push(r + ": " + ((e && e.message) || e)); }
}
if (!guidepup || !guidepup.nvda) {
  /* OJO AL MOTIVO, que no es obvio: `import("@guidepup/guidepup")` LANZA en el
   * propio import cuando no hay lector soportado —comprobado, el mensaje es
   * «No available supported screen readers»—, así que este caso no significa
   * «la versión es antigua» sino «NVDA no está registrado». Si el runner llega
   * aquí, lo que falló es `npx @guidepup/setup install`. */
  console.error("✗ No se encuentra `nvda` en @guidepup/guidepup. Instálalo, o apunta GUIDEPUP_PATH a donde esté.");
  await salir(2, "@guidepup/guidepup no expone `nvda`: NVDA no está registrado en esta máquina",
    { intentos: RUTAS_GUIDEPUP, detalle: fallosDeImport });
}

/**
 * El mismo componente que la prueba de VoiceOver, a propósito: así los dos
 * informes se pueden poner uno al lado del otro y se ve qué anuncia cada lector
 * de lo mismo.
 *   1. botón de icono SIN nombre  → debería salir `barrera-confirmada`
 *   2. botón con texto            → `confirmado`
 *   3. enlace con texto           → `confirmado`
 */
/* Cada control en su propio bloque, y no es cosmética.
 *
 * En modo exploración, NVDA junta en UNA línea los elementos en línea que van
 * seguidos, y una línea es un anuncio. Con los tres controles pegados, el
 * lector decía «button, , button, Enviar formulario, same page, link, Saltar al
 * contenido» de una vez: un bloque que contiene tres elementos y que no se
 * puede atribuir a ninguno sin mentir sobre los otros dos — al botón sin nombre
 * le pondría de nombre «Enviar formulario» y absolvería el 4.1.2 que este
 * componente existe para confirmar.
 *
 * Envolviéndolos en <div>, cada uno cae en su línea y se anuncia solo. No
 * debilita la prueba: los elementos son los mismos y siguen siendo un botón de
 * icono sin nombre, un botón con texto, un enlace y un encabezado. */
const HTML = [
  '<div><button><svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" fill="none"/></svg></button></div>',
  "<div><button>Enviar formulario</button></div>",
  '<div><a href="#contenido">Saltar al contenido</a></div>',
  '<main id="contenido"><h1>Verificación con lector real</h1><p>Fin del recorrido.</p></main>'
].join("\n");

const pasos = Number(process.env.NVDA_PASOS || 14);
const navegador = process.env.NVDA_NAVEGADOR || "chrome";

console.log("→ Guidepup desde: " + deDonde);
console.log("→ Arrancando NVDA sobre " + navegador + ". Hablará en voz alta.");
console.log("→ Deja el navegador en primer plano y no toques nada hasta que termine.\n");

const t0 = Date.now();
let out;
try {
  out = await bridge(HTML, {
    lector: "nvda",
    capture: (h) => captureWithNvda(h, { guidepup: guidepup, steps: pasos, browser: navegador })
  });
} catch (e) {
  console.error("✗ La captura falló: " + (e && e.message ? e.message : e));
  console.error("  Lo más habitual: NVDA no está instalado. Instálalo con `npx @guidepup/setup install`");
  console.error("  desde esta carpeta (busca `@guidepup/guidepup` a partir del directorio actual).");
  // Y el fallo, en el artefacto: con el mensaje y la pila, que es lo único que
  // permite distinguir «NVDA no arrancó» de «el navegador no se puso delante».
  await salir(1, "la captura con NVDA falló: " + ((e && e.message) || e),
    { pila: (e && e.stack) ? String(e.stack).split("\n").slice(0, 8) : null,
      guidepup: deDonde, navegador: navegador, pasos: pasos, duracionMs: Date.now() - t0 });
}
const ms = Date.now() - t0;

const prediccion = analyze(understand(HTML));

/* En qué idioma habló. El runner de GitHub es una máquina en inglés, y eso
 * cambia lo que esta sesión verifica: el mecanismo y las palabras inglesas sí,
 * el léxico español no. Se anota para que el fixture no pueda mentir sobre su
 * procedencia. */
const idioma = idiomaDelLector(out.spokenPhrases);
console.log("\n  Idioma del lector: " + (idioma || "no reconocido"));
if (idioma && idioma !== "es") {
  console.log("  Ojo: esta sesión NO verifica el léxico español. Para eso hace falta un NVDA en español.");
}

const informe = {
  creado: new Date().toISOString(),
  lector: "nvda",
  // El informe dice si vale: un JSON sin veredicto sobre sí mismo obliga a
  // deducirlo de sus campos, y eso en CI nadie lo hace.
  ok: true,
  idioma: idioma,
  duracionMs: ms,
  plataforma: process.platform,
  guidepup: deDonde,
  navegador: navegador,
  html: HTML,
  resumen: out.summary,
  resultados: out.results.map((r) => ({
    locator: r.locator,
    previsto: r.predicted,
    veredicto: r.verdict,
    nota: r.note,
    frase: r.spoken,
    fraseLimpia: r.cleaned
  })),
  transcripcion: out.spokenPhrases,
  prediccionMotor: (prediccion.findings || [])
    .filter((f) => f.verdict === "falla")
    .map((f) => ({ criterio: f.c.n, nodos: (f.nodes || []).map((n) => n.locator) }))
};

await writeFile(salida, JSON.stringify(informe, null, 2) + "\n", "utf8");

/* La transcripción, SIEMPRE y en el log.
 *
 * Queda en el JSON, sí, pero el JSON es un artefacto que hay que bajar y
 * descomprimir. Cuando esto corre en CI, lo único que se lee de verdad es el
 * log, y sin las frases delante un recorrido que no casa con nada no se puede
 * diagnosticar: no se distingue «el lector no dijo nada» de «dijo otra cosa».
 */
console.log("\n── Lo que dijo NVDA (" + out.spokenPhrases.length + " frase/s) ─────────────────");
if (!out.spokenPhrases.length) {
  console.log("  (ninguna)");
} else {
  out.spokenPhrases.forEach((p, i) => console.log("  " + (i + 1) + ". «" + String(p.spoken || "").replace(/\s+/g, " ").slice(0, 160) + "»"));
}

console.log("\n── Lo que el motor esperaba ───────────────────────────────");
out.predicted.forEach((p) => console.log("  " + p.locator + "  nombre=«" + (p.name || "(sin nombre)") + "»  rol=" + p.role));

console.log("\n── Resultado ──────────────────────────────────────────────");
for (const r of informe.resultados) {
  console.log("  " + r.veredicto.padEnd(20) + r.locator + "  ← «" + (r.fraseLimpia || "").slice(0, 70) + "»");
}
console.log("\n  " + JSON.stringify(out.summary));
console.log("  Informe: " + salida + "  (" + Math.round(ms / 1000) + " s)");

/* El listón: al menos UN nodo casado con lo que dijo el lector.
 *
 * «Que no haya reventado» no es lo mismo que «ha verificado algo». Una sesión
 * en la que el lector recorrió otra cosa deja todos los nodos en
 * `no-encontrado` y termina sin error; una en la que todo sale `divergente` es
 * el léxico o el motor equivocándose en bloque. Las dos tienen que salir en
 * rojo, porque las dos significan que nadie ha comprobado nada.
 */
const casados = out.results.filter((r) => r.verdict === "confirmado" || r.verdict === "barrera-confirmada").length;
const perdidos = out.results.filter((r) => r.verdict === "no-encontrado" || r.verdict === "sin-captura").length;
if (perdidos) {
  console.error("\n  Aviso: " + perdidos + " de " + out.results.length + " nodo(s) no se emparejaron con ninguna frase del lector.");
}
if (!casados) {
  console.error("\n✗ Ningún nodo quedó verificado contra el lector: la sesión no comprueba nada.");
  console.error("  Si el recorrido no llegó al componente, mira arriba los títulos de ventana y la transcripción.");
  /* El informe ya está escrito con la sesión entera —transcripción incluida—,
   * así que aquí solo se marca que NO vale, sin perder el contenido: una sesión
   * que no verifica nada es justo la que hay que poder leer después. */
  try {
    await writeFile(salida, JSON.stringify(Object.assign({}, informe, {
      ok: false,
      motivo: "ningún nodo quedó verificado contra el lector: la sesión no comprueba nada"
    }), null, 2) + "\n", "utf8");
  } catch (e) { /* el informe de arriba ya está en disco */ }
  process.exit(1);
}
