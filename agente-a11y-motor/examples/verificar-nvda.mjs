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

if (process.platform !== "win32") {
  console.error("✗ NVDA solo existe en Windows. Aquí no hay nada que verificar.");
  console.error("  Desde macOS o Linux, lanza el workflow de CI: .github/workflows/nvda.yml");
  process.exit(2);
}

const { DOMParser } = await import("linkedom");
setDOMParser(DOMParser);

const RUTAS_GUIDEPUP = ["@guidepup/guidepup", process.env.GUIDEPUP_PATH].filter(Boolean);
let guidepup = null, deDonde = null;
for (const r of RUTAS_GUIDEPUP) {
  try { guidepup = await import(r); deDonde = r; break; } catch (e) { /* siguiente */ }
}
if (!guidepup || !guidepup.nvda) {
  console.error("✗ No se encuentra `nvda` en @guidepup/guidepup. Instálalo, o apunta GUIDEPUP_PATH a donde esté.");
  process.exit(2);
}

/**
 * El mismo componente que la prueba de VoiceOver, a propósito: así los dos
 * informes se pueden poner uno al lado del otro y se ve qué anuncia cada lector
 * de lo mismo.
 *   1. botón de icono SIN nombre  → debería salir `barrera-confirmada`
 *   2. botón con texto            → `confirmado`
 *   3. enlace con texto           → `confirmado`
 */
const HTML = [
  '<button><svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" fill="none"/></svg></button>',
  '<button>Enviar formulario</button>',
  '<a href="#contenido">Saltar al contenido</a>',
  '<main id="contenido"><h1>Verificación con lector real</h1><p>Fin del recorrido.</p></main>'
].join("\n");

const salida = process.argv[2] || "verificacion-nvda.json";
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
  process.exit(1);
}
const ms = Date.now() - t0;

const prediccion = analyze(understand(HTML));

const informe = {
  creado: new Date().toISOString(),
  lector: "nvda",
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

console.log("\n── Resultado ──────────────────────────────────────────────");
for (const r of informe.resultados) {
  console.log("  " + r.veredicto.padEnd(20) + r.locator + "  ← «" + (r.fraseLimpia || "").slice(0, 70) + "»");
}
console.log("\n  " + JSON.stringify(out.summary));
console.log("  Informe: " + salida + "  (" + Math.round(ms / 1000) + " s)");

// Igual que con VoiceOver: mejor un fallo visible que un informe vacío que
// parezca bueno. Si ninguna captura sirvió, la ejecución no verificó nada.
const utiles = out.results.filter((r) => r.verdict !== "sin-captura" && r.verdict !== "no-encontrado").length;
if (!utiles) {
  console.error("\n✗ Ninguna captura sirvió. Casi siempre es que el navegador perdió el primer plano.");
  process.exit(1);
}
