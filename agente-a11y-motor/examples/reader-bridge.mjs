/**
 * Demo del puente Guidepup — verificación con VoiceOver REAL.
 *
 *   npx @guidepup/setup      # una vez: permisos de accesibilidad
 *   node examples/reader-bridge.mjs
 *
 * Solo macOS con VoiceOver. Al arrancar, VoiceOver toma el control del equipo
 * unos segundos: no toques el teclado mientras recorre el componente.
 *
 * Compara, para cada control, lo que el motor PREDICE que se anunciará con lo
 * que VoiceOver anuncia DE VERDAD, y emite un veredicto por elemento.
 */
import { DOMParser } from "linkedom";
import { setDOMParser, bridge, captureWithGuidepup } from "../src/index.js";

setDOMParser(DOMParser);

const COMPONENTE = `
  <nav aria-label="Cuenta">
    <button>Enviar formulario</button>
    <button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/></svg></button>
    <a href="/informe-2026.pdf">Leer más</a>
  </nav>
`;

const ICONO = { confirmado: "✅", parcial: "🟡", divergente: "🔴", "barrera-confirmada": "🎯", "no-encontrado": "⚪" };

const out = await bridge(COMPONENTE, { capture: (h) => captureWithGuidepup(h, { steps: 12 }) });

console.log("\n=== Puente Guidepup · anuncio predicho vs. real ===\n");
for (const r of out.results) {
  console.log((ICONO[r.verdict] || "•") + " [" + r.verdict + "] " + (r.locator || ""));
  console.log("   predicho: " + (r.predicted ? r.predicted.say : "—"));
  console.log("   real:     " + (r.spoken || "(el lector no lo visitó)"));
  if (r.note) console.log("   nota:     " + r.note);
}
console.log("\nResumen:", JSON.stringify(out.summary));
console.log("\nRecuerda: solo VoiceOver/NVDA/JAWS reales confirman el anuncio. Este es ese puente.");
