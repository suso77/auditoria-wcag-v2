#!/usr/bin/env node
/**
 * Verificación contra VoiceOver REAL (macOS).
 *
 *   node examples/verificar-voiceover.mjs [salida.json]
 *
 * El motor PREDICE lo que anunciaría un lector; esto captura lo que VoiceOver
 * anuncia DE VERDAD y compara. Un 4.1.2 predicho deja de ser una hipótesis.
 *
 * ── Antes de ejecutarlo ────────────────────────────────────────────────────
 *  - macOS con VoiceOver y permisos de Accesibilidad para el Terminal
 *    (Ajustes del Sistema → Privacidad y Seguridad → Accesibilidad), o
 *    `npx @guidepup/setup`.
 *  - VoiceOver se ACTIVA y habla en voz alta durante la prueba, y toma el
 *    control del teclado. No es para dejarlo corriendo de fondo.
 *  - **Deja Safari en primer plano y no toques el equipo.** Es la condición que
 *    más fastidia la captura: `lastSpokenPhrase()` habla de todo el sistema, y
 *    si el foco se va a otra app, lo que se captura es el Finder o el Terminal.
 *    El puente detecta esas frases y las marca `sin-captura` en vez de
 *    inventarse un nombre, pero entonces la prueba no verifica nada.
 *
 * Deja un JSON con el veredicto de cada nodo, la frase literal del lector y la
 * transcripción en bruto, para poder revisarlo después sin repetir la sesión.
 */
import { writeFile } from "fs/promises";
import { createRequire } from "module";
import { understand, analyze, setDOMParser } from "../src/index.js";
import { bridge, captureWithGuidepup } from "../src/guidepup-bridge.js";

if (process.platform !== "darwin") {
  console.error("✗ VoiceOver solo existe en macOS. Aquí no hay nada que verificar.");
  process.exit(2);
}

// linkedom para el motor; `@guidepup/guidepup` puede estar instalado en otro
// proyecto (guidepup-mcp), así que se busca también ahí antes de rendirse.
const require = createRequire(import.meta.url);
const { DOMParser } = await import("linkedom");
setDOMParser(DOMParser);

const RUTAS_GUIDEPUP = [
  "@guidepup/guidepup",
  process.env.GUIDEPUP_PATH,
  "/Users/" + (process.env.USER || "") + "/guidepup-mcp/node_modules/@guidepup/guidepup/lib/index.js"
].filter(Boolean);

let guidepup = null, deDonde = null;
for (const r of RUTAS_GUIDEPUP) {
  try { guidepup = await import(r); deDonde = r; break; } catch (e) { /* siguiente */ }
}
if (!guidepup || !guidepup.voiceOver) {
  console.error("✗ No se encuentra @guidepup/guidepup. Instálalo aquí, o apunta GUIDEPUP_PATH a donde esté.");
  console.error("  Probado en: " + RUTAS_GUIDEPUP.join(", "));
  process.exit(2);
}

/**
 * Componente de prueba. Tres casos con veredicto esperado distinto, para que el
 * resultado se pueda leer de un vistazo:
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

const salida = process.argv[2] || "verificacion-voiceover.json";
const pasos = Number(process.env.VO_PASOS || 14);

console.log("→ Guidepup desde: " + deDonde);
console.log("→ Arrancando VoiceOver. Hablará en voz alta y tomará el teclado.");
console.log("→ Deja Safari en primer plano y no toques nada hasta que termine.\n");

const t0 = Date.now();
let out;
try {
  out = await bridge(HTML, {
    capture: (h) => captureWithGuidepup(h, { guidepup: guidepup, steps: pasos, browser: process.env.VO_NAVEGADOR || "Safari" })
  });
} catch (e) {
  console.error("✗ La captura falló: " + (e && e.message ? e.message : e));
  console.error("  Lo más habitual: faltan permisos de Accesibilidad para el Terminal.");
  process.exit(1);
}
const ms = Date.now() - t0;

// El motor, por su cuenta, para poder contrastar predicción y realidad.
const prediccion = analyze(understand(HTML));

const informe = {
  creado: new Date().toISOString(),
  duracionMs: ms,
  plataforma: process.platform,
  guidepup: deDonde,
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

// Salida distinta de 0 si la sesión no verificó nada: capturas inservibles o
// nodos que el lector nunca visitó. Mejor un fallo visible que un informe vacío
// que parezca bueno.
const utiles = out.results.filter((r) => r.verdict !== "sin-captura" && r.verdict !== "no-encontrado").length;
if (!utiles) {
  console.error("\n✗ Ninguna captura sirvió. Casi siempre es que el navegador perdió el primer plano.");
  process.exit(1);
}
