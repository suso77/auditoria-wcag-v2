/**
 * Demo del cruce motor ⁄ axe-core sobre componentes de ejemplo.
 *
 *   node examples/cross-check.mjs
 *
 * Requiere un Chromium de Playwright:  npx playwright install chromium
 * (En CI o entornos con el navegador en una ruta fija, exporta
 *  PW_CHROMIUM para pasarlo como executablePath.)
 */
import { DOMParser } from "linkedom";
import { setDOMParser, crossCheck, runAxeWithPlaywright } from "../src/index.js";

setDOMParser(DOMParser);

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const runAxe = (html) => runAxeWithPlaywright(html, { launchOptions });

const EJEMPLOS = [
  ["Botón de icono sin nombre", '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>'],
  ["«Botón» hecho con div", '<div class="btn" onclick="enviar()">Enviar formulario</div>'],
  ["Campo sin etiqueta", '<input type="email" placeholder="Tu correo">'],
  ["Enlace poco descriptivo", '<a href="/informe-2026.pdf">Leer más</a>'],
  ["Botón bien construido", '<button type="button" aria-label="Cerrar diálogo"><svg aria-hidden="true"><path d="M6 6l12 12"/></svg></button>']
];

for (const [label, html] of EJEMPLOS) {
  const { engine, axeViolations, reconciliation: r } = await crossCheck(html, { runAxe });
  console.log("\n=== " + label + " ===");
  console.log("  Motor: " + engine.summary.falla + " barreras   ·   axe: " + (axeViolations.map((v) => v.id).join(", ") || "sin violaciones"));
  console.log("  Cruce → acuerdo " + r.summary.acuerdo + " · solo-motor " + r.summary.soloMotor + " · solo-axe " + r.summary.soloAxe);
  if (r.agreements.length) console.log("    ✓ Coinciden: " + r.agreements.map((a) => a.sc).join(", "));
  if (r.onlyEngine.length) console.log("    ◐ Solo el motor: " + r.onlyEngine.map((a) => a.sc).join(", "));
  if (r.onlyAxe.length) console.log("    ◑ Solo axe: " + r.onlyAxe.map((a) => a.sc + " (" + a.rules.map((x) => x.id).join("/") + ")").join(", "));
}
