/**
 * Puente Guidepup — el tercer nivel de verdad.
 *
 * El motor PREDICE qué anunciaría un lector de pantalla (`announcement(node)`).
 * Este puente CAPTURA lo que VoiceOver/NVDA anuncia DE VERDAD (vía Guidepup sobre
 * un render real) y compara ambos. Así, un «a revisar» o un 4.1.2 predicho deja
 * de ser una hipótesis y pasa a ser un veredicto verdadero:
 *
 *   - confirmado: el lector anuncia el nombre y el rol esperados.
 *   - parcial:    anuncia el nombre pero no un rol reconocible.
 *   - divergente: el lector anuncia algo distinto a lo previsto (posible falso
 *                 positivo/negativo del motor, o una barrera real distinta).
 *   - barrera-confirmada: el motor predijo un control SIN nombre y el lector, en
 *                 efecto, solo pronuncia el rol → el 4.1.2 es real, no una hipótesis.
 *
 * La comparación es pura y testeable sin lector. La captura real es un adaptador
 * (import perezoso de @guidepup/guidepup) que solo corre en macOS con VoiceOver.
 */

import { understand, analyze, announcement } from "./engine.js";
import { normalize, spokenHasRole, stripReaderNoise, esRuidoDeEscritorio, ROLE_KEYWORDS } from "./reader-lexicon.js";

// Texto que queda tras quitar ruido del lector y las palabras del rol: si es
// trivial, el lector no pronunció ningún nombre.
function residualName(spoken, role, lector) {
  const kws = (ROLE_KEYWORDS[role] || []).map(normalize);
  let n = normalize(stripReaderNoise(spoken, lector));
  // quita frases multi-palabra primero
  kws.filter(function (k) { return k.indexOf(" ") !== -1; }).forEach(function (k) { n = n.split(k).join(" "); });
  // quita palabras clave sueltas por token completo (no por subcadena)
  const singles = new Set(kws.filter(function (k) { return k.indexOf(" ") === -1; }));
  return n.split(/[^a-z0-9ñ]+/).filter(function (t) { return t && !singles.has(t); }).join(" ").trim();
}

/**
 * Compara un anuncio PREDICHO con la frase REAL del lector.
 * @param {{name:string, role:string}} predicted
 * @param {string} spoken  frase real (p. ej. voiceOver.lastSpokenPhrase()).
 * @param {"voiceover"|"nvda"} [lector]  de quién es la frase. Sin él se recorta
 *   el ruido de los dos, que es lo prudente: deja el residuo más corto y
 *   confirma barreras en vez de absolverlas.
 */
export function compareAnnouncement(predicted, spoken, lector) {
  const cleaned = stripReaderNoise(spoken, lector);

  // Antes de comparar nada: ¿esta frase es siquiera de la página? Una captura
  // vacía o del escritorio no dice NADA del componente, y tratarla como
  // divergencia absolvería barreras reales con ruido del sistema.
  if (!String(spoken || "").trim()) {
    return { verdict: "sin-captura", nameFound: null, roleFound: false, predicted: predicted, spoken: spoken, cleaned: cleaned,
      note: "El lector no devolvió ninguna frase para este elemento: no hay evidencia, ni a favor ni en contra." };
  }
  if (esRuidoDeEscritorio(spoken, lector)) {
    return { verdict: "sin-captura", nameFound: null, roleFound: false, predicted: predicted, spoken: spoken, cleaned: cleaned,
      note: "La frase capturada es del escritorio (otra app, el Finder, la barra de tareas o el propio lector), no de la página: no sirve como evidencia. Repite la captura con el navegador en primer plano." };
  }

  const roleFound = spokenHasRole(spoken, predicted.role);
  const expectName = normalize(predicted.name || "");
  const nameFound = expectName ? normalize(cleaned).indexOf(expectName) !== -1 : null;

  let verdict, note;
  if (!expectName) {
    // El motor predijo un control sin nombre accesible (candidato a 4.1.2).
    const residual = residualName(spoken, predicted.role, lector);
    if (roleFound && residual.length < 2) {
      verdict = "barrera-confirmada";
      note = "El lector solo pronuncia el rol, sin nombre: la falta de nombre accesible es real.";
    } else if (residual.length >= 2) {
      verdict = "divergente";
      note = "El lector sí pronuncia un nombre («" + residual + "») que el motor no previó: revisar posible falso positivo.";
    } else {
      verdict = "divergente";
      note = "El lector no anuncia ni nombre ni rol reconocibles.";
    }
  } else if (nameFound && roleFound) {
    verdict = "confirmado";
    note = "El lector anuncia el nombre y el rol previstos.";
  } else if (nameFound && !roleFound) {
    verdict = "parcial";
    note = "El nombre coincide, pero no se reconoce el rol en la frase del lector.";
  } else {
    verdict = "divergente";
    note = "El lector no pronuncia el nombre previsto («" + (predicted.name || "") + "»).";
  }

  return { verdict, nameFound, roleFound, predicted, spoken, cleaned, note };
}

/**
 * Recorre los elementos con el lector inyectado y captura la frase de cada paso.
 * `voiceOver` sigue el API de @guidepup/guidepup (next, lastSpokenPhrase, …), lo
 * que permite testear el bucle con un lector simulado, sin VoiceOver real.
 *
 * @param {{ voiceOver:object, steps?:number, sleep?:(ms:number)=>Promise, sleepMs?:number }} opts
 */
export async function verifyWithScreenReader(opts) {
  const vo = opts.voiceOver;
  const steps = opts.steps == null ? 12 : opts.steps;
  const sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const sleepMs = opts.sleepMs == null ? 250 : opts.sleepMs;

  const phrases = [];
  const seen = new Set();
  for (let i = 0; i < steps; i++) {
    await vo.next();
    if (sleepMs) await sleep(sleepMs);
    const spoken = await vo.lastSpokenPhrase();
    const key = normalize(stripReaderNoise(spoken));
    if (spoken && !seen.has(key)) { seen.add(key); phrases.push({ step: i, spoken: spoken }); }
    if (opts.stopWhenRepeated && phrases.length && key && seen.size <= i) break;
  }
  return phrases;
}

// Empareja cada nodo previsto con la frase real de mayor solape de nombre/rol.
function alignPredictedToSpoken(predicted, phrases, lector) {
  const used = new Set();
  return predicted.map(function (p) {
    let best = -1, bestScore = -1;
    phrases.forEach(function (ph, idx) {
      if (used.has(idx)) return;
      // Una frase del escritorio no puede «ganar» el emparejamiento: si lo
      // hiciera, le pondría a un control el nombre de una ventana del Finder.
      if (esRuidoDeEscritorio(ph.spoken, lector)) return;
      const clean = normalize(stripReaderNoise(ph.spoken, lector));
      let score = 0;
      if (p.name) { normalize(p.name).split(" ").forEach(function (tok) { if (tok && clean.indexOf(tok) !== -1) score += 2; }); }
      if (spokenHasRole(ph.spoken, p.role)) score += 1;
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    if (best >= 0 && bestScore > 0) { used.add(best); return { predicted: p, spoken: phrases[best].spoken }; }
    return { predicted: p, spoken: null };
  });
}

/**
 * Adaptador REAL: captura los anuncios de VoiceOver sobre el componente con
 * Guidepup. Import perezoso; solo funciona en macOS con VoiceOver y permisos
 * concedidos (`npx @guidepup/setup setup`). Sirve el HTML en un archivo temporal y lo
 * abre en el navegador; luego recorre con el lector.
 *
 * @param {string} html
 * @param {{ steps?:number, browser?:string, keepOpen?:boolean, guidepup?:object }} [opts]
 *   `guidepup` permite inyectar el módulo ya importado: `@guidepup/guidepup` se
 *   resuelve desde la carpeta de ESTE paquete, y quien lo tiene instalado suele
 *   ser otro proyecto del equipo. Sin esto había que duplicar la dependencia.
 */
export async function captureWithGuidepup(html, opts) {
  opts = opts || {};
  const { voiceOver } = opts.guidepup || await import("@guidepup/guidepup");
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs/promises");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const file = path.join(os.tmpdir(), "a11y-motor-" + Date.now() + ".html");
  await fs.writeFile(file,
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verificación</title></head><body>' +
    String(html || "") + "</body></html>", "utf8");

  const app = opts.browser || "Safari";
  try {
    await voiceOver.start();
    await execAsync('open -a "' + app + '" "file://' + file + '"');
    await new Promise(function (r) { setTimeout(r, opts.loadMs == null ? 3000 : opts.loadMs); });
    const phrases = await verifyWithScreenReader({ voiceOver: voiceOver, steps: opts.steps == null ? 15 : opts.steps });
    return phrases;
  } finally {
    try { await voiceOver.stop(); } catch (e) { /* noop */ }
    if (!opts.keepOpen) { try { await fs.unlink(file); } catch (e) { /* noop */ } }
  }
}

/**
 * Adaptador REAL para NVDA (Windows).
 *
 * Mismo guion que el de VoiceOver, con las tres diferencias que impone Windows:
 * el lector es `nvda`, la página se abre con `start` en vez de `open -a`, y hay
 * que darle a NVDA un momento para entrar en modo exploración después de cargar
 * —si se empieza a tabular antes, las primeras frases son del navegador y no de
 * la página, y el puente las descarta con razón, pero se pierden pasos.
 *
 * Pensado para correr en CI (`windows-latest` con `npx @guidepup/setup install`), que es
 * la única forma realista de verificar con NVDA desde un Mac.
 *
 * @param {string} html
 * @param {{ steps?:number, browser?:string, keepOpen?:boolean, guidepup?:object, loadMs?:number }} [opts]
 */
export async function captureWithNvda(html, opts) {
  opts = opts || {};
  const { nvda } = opts.guidepup || await import("@guidepup/guidepup");
  if (!nvda) throw new Error("@guidepup/guidepup no expone `nvda`: ¿versión antigua?");
  const os = await import("os");
  const path = await import("path");
  const fs = await import("fs/promises");
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const file = path.join(os.tmpdir(), "a11y-motor-" + Date.now() + ".html");
  await fs.writeFile(file,
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Verificación</title></head><body>' +
    String(html || "") + "</body></html>", "utf8");

  // `start` necesita un primer argumento como título de ventana; el `""` es
  // obligatorio, no decorativo: sin él, una ruta entrecomillada se toma por el
  // título y no se abre nada.
  const app = opts.browser || "chrome";
  try {
    await nvda.start();
    await execAsync('start "" ' + app + ' "file:///' + file.replace(/\\/g, "/") + '"', { shell: "cmd.exe" });
    await new Promise(function (r) { setTimeout(r, opts.loadMs == null ? 6000 : opts.loadMs); });
    return await verifyWithScreenReader({ voiceOver: nvda, steps: opts.steps == null ? 15 : opts.steps });
  } finally {
    try { await nvda.stop(); } catch (e) { /* noop */ }
    if (!opts.keepOpen) { try { await fs.unlink(file); } catch (e) { /* noop */ } }
  }
}

/**
 * Verificación completa de un componente contra un lector real.
 * @param {string} html
 * @param {{ capture:(html:string)=>Promise<Array>, lector?:"voiceover"|"nvda" }} opts
 *   `capture` devuelve [{spoken}] (inyectable para tests). `lector` dice de quién
 *   son las frases, para recortar su ruido y no el del otro sistema.
 */
export async function bridge(html, opts) {
  if (!opts || typeof opts.capture !== "function") {
    throw new Error("bridge necesita opts.capture(html) → [{ spoken }]");
  }
  const lector = opts.lector;
  const model = understand(html);
  const nodes = model ? model.all.filter(function (n) { return n.interactive || n.isImage || n.isHeading; }) : [];
  const predicted = nodes.map(function (n) {
    return { name: n.name.name, role: n.role, say: announcement(n), locator: n.locator };
  });
  const phrases = await opts.capture(html);
  const aligned = alignPredictedToSpoken(predicted, phrases, lector);

  const results = aligned.map(function (a) {
    if (a.spoken == null) {
      return { predicted: a.predicted, spoken: null, verdict: "no-encontrado", note: "El lector no visitó un elemento que casara con este nodo." };
    }
    return Object.assign({ locator: a.predicted.locator }, compareAnnouncement(a.predicted, a.spoken, lector));
  });

  const tally = { confirmado: 0, parcial: 0, divergente: 0, "barrera-confirmada": 0, "no-encontrado": 0, "sin-captura": 0 };
  results.forEach(function (r) { if (tally[r.verdict] != null) tally[r.verdict]++; });

  return { model: model, lector: lector || null, predicted: predicted, spokenPhrases: phrases, results: results, summary: tally };
}
