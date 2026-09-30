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

/* ¿Está el nombre previsto DENTRO de la frase, como secuencia de palabras enteras?
 *
 * Con `indexOf` sobre las cadenas ya normalizadas, «Ver» casaba dentro de
 * «Verificar mis datos», «Ir» dentro de «Iribarren» y «Alta» dentro de
 * «Altavoz»: el puente devolvía `confirmado` con la nota «el lector anuncia el
 * nombre y el rol previstos» sobre un elemento que el lector anuncia con OTRO
 * nombre. Es la peor clase de error de este proyecto: no un fallo de detección,
 * sino una evidencia falsa escrita por nosotros en un informe con efectos
 * legales. (El mismo arreglo se hizo en `alignPredictedToSpoken` y no se trajo
 * aquí.)
 *
 * Se compara por secuencia de palabras completas, así que «Ver» casa con «botón,
 * Ver» y con «Ver más tarde», pero no con «Verificar». Palabras de dos letras
 * incluidas: aquí se exige la secuencia entera, no tokens sueltos, y «Ir a» tiene
 * que aparecer como «ir» seguido de «a».
 */
function palabras(s) { return String(s || "").split(/[^a-z0-9ñ]+/).filter(Boolean); }
function contienePalabras(heno, aguja) {
  const h = palabras(heno), a = palabras(aguja);
  if (!a.length) return false;
  for (let i = 0; i + a.length <= h.length; i++) {
    let casa = true;
    for (let j = 0; j < a.length; j++) if (h[i + j] !== a[j]) { casa = false; break; }
    if (casa) return true;
  }
  return false;
}

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
  const nameFound = expectName ? contienePalabras(normalize(cleaned), expectName) : null;

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
  const anotar = function (spoken, step) {
    const key = normalize(stripReaderNoise(spoken));
    if (!spoken || !key || seen.has(key)) return false;
    seen.add(key);
    phrases.push({ step: step, spoken: spoken });
    return true;
  };

  for (let i = 0; i < steps; i++) {
    await vo.next();
    if (sleepMs) await sleep(sleepMs);
    anotar(await vo.lastSpokenPhrase(), i);
    if (opts.stopWhenRepeated && phrases.length && seen.size <= i) break;
  }

  /* Y al final, el REGISTRO COMPLETO del lector.
   *
   * Preguntar «¿qué acabas de decir?» después de cada paso se pierde frases: el
   * lector va por su cuenta, y si dice dos cosas seguidas entre dos preguntas,
   * la primera no la ve nadie. Se vio en la primera sesión de NVDA que llegó a
   * leer la página: dieciséis pasos, y solo dos frases recogidas —las dos
   * últimas—, con los botones y el enlace del principio perdidos por el camino.
   *
   * `spokenPhraseLog()` devuelve todo lo que ha dicho, en orden. El bucle de
   * arriba se queda porque marca el ritmo del recorrido; esto rescata lo que se
   * escapó entre paso y paso. La deduplicación es la misma, así que no aparece
   * nada dos veces, y un lector simulado que no tenga registro sigue valiendo. */
  if (typeof vo.spokenPhraseLog === "function") {
    try {
      const registro = await vo.spokenPhraseLog();
      (registro || []).forEach(function (spoken, i) { anotar(spoken, steps + i); });
    } catch (e) { /* sin registro, nos quedamos con lo del bucle */ }
  }
  return phrases;
}

/* Empareja cada nodo previsto con la frase real que mejor le encaja.
 *
 * La asignación es GLOBAL y por puntuación, no nodo a nodo por orden de
 * aparición. La diferencia importa cuando hay dos elementos del mismo rol:
 * en el componente de prueba hay un botón sin nombre y otro que se llama
 * «Enviar formulario», y las frases son «button» y «button, Enviar
 * formulario». Recorriendo los nodos en orden, el primero —el que no tiene
 * nombre— podía quedarse con la frase del segundo, porque ambas puntúan por el
 * rol; y entonces el botón sin nombre accesible aparecía nombrado, que es
 * exactamente la forma de absolver un 4.1.2 real.
 *
 * Resolviendo primero las parejas de puntuación más alta, la frase con nombre
 * se la lleva quien tiene ese nombre, y al otro le queda la que le toca.
 */
function alignPredictedToSpoken(predicted, phrases, lector) {
  const candidatas = [];
  predicted.forEach(function (p, pi) {
    phrases.forEach(function (ph, fi) {
      // Una frase del escritorio no puede «ganar» el emparejamiento: si lo
      // hiciera, le pondría a un control el nombre de una ventana del Finder.
      if (esRuidoDeEscritorio(ph.spoken, lector)) return;
      const clean = normalize(stripReaderNoise(ph.spoken, lector));
      /* Por PALABRA COMPLETA, no por subcadena.
       *
       * Buscando con `indexOf`, el nombre «Saltar al contenido» puntuaba contra
       * «…Verificación con lector real» porque «al» está dentro de «real», y el
       * enlace acababa emparejado con el encabezado. Las palabras de dos letras
       * —al, de, la, el, en— aparecen dentro de casi cualquier cosa, así que
       * además de comparar por palabra entera se descartan: no distinguen. */
      const tokens = new Set(clean.split(/[^a-z0-9ñ]+/).filter(Boolean));
      let score = 0;
      if (p.name) {
        /* El nombre COMPLETO puntúa, además de sus palabras largas.
         *
         * Descartar los tokens de dos letras deja sin puntuación los nombres
         * hechos solo de palabras cortas —«Ir a», «Sí», los números de una
         * paginación—. Ese nodo empataba con uno SIN nombre (los dos puntúan solo
         * por el rol) y el desempate por orden se la llevaba el nodo sin nombre:
         * el enlace-imagen sin `alt` aparecía nombrado «Ir a» y su 4.1.2 salía
         * como «posible falso positivo del motor». Justo la absolución que este
         * emparejamiento se reescribió para impedir.
         *
         * Con la secuencia entera esos nombres vuelven a puntuar, y fuerte: casar
         * el nombre completo vale más que casar palabras sueltas. */
        if (contienePalabras(clean, normalize(p.name))) score += 3;
        normalize(p.name).split(/[^a-z0-9ñ]+/).forEach(function (tok) {
          if (tok && tok.length > 2 && tokens.has(tok)) score += 2;
        });
      }
      if (spokenHasRole(ph.spoken, p.role)) score += 1;
      /* Y una frase con nombre no se le adjudica a un nodo SIN nombre mientras
       * otro nodo previsto reclame ese nombre. Solo por el rol, cualquier frase
       * encaja con cualquier control del mismo rol, y la que lleva nombre es
       * precisamente la que no puede acabar en el nodo que no lo tiene. */
      if (!p.name && score === 1) {
        const residuo = residualName(ph.spoken, p.role, lector);
        if (residuo.length >= 2 && predicted.some(function (q) {
          return q !== p && q.name && contienePalabras(residuo, normalize(q.name));
        })) return;
      }
      if (score > 0) candidatas.push({ pi: pi, fi: fi, score: score });
    });
  });
  // Mayor puntuación primero; a igualdad, el orden del recorrido, que es el
  // orden en que el lector fue diciendo las cosas.
  candidatas.sort(function (a, b) { return b.score - a.score || a.fi - b.fi || a.pi - b.pi; });

  const deNodo = {}, usadas = new Set();
  candidatas.forEach(function (c) {
    if (deNodo[c.pi] != null || usadas.has(c.fi)) return;
    deNodo[c.pi] = c.fi;
    usadas.add(c.fi);
  });
  return predicted.map(function (p, pi) {
    const fi = deNodo[pi];
    return { predicted: p, spoken: fi == null ? null : phrases[fi].spoken };
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

  /* El título de la ventana es ASCII y sin espacios a propósito: se usa para
   * volver a traer el navegador al primer plano, y esa búsqueda acaba en un
   * `-Match` de PowerShell —una expresión regular— dentro de un VBScript. Un
   * acento o un paréntesis ahí no fallan: simplemente no encuentran nada. */
  const TITULO = "GuidepupA11y";
  const file = path.join(os.tmpdir(), "a11y-motor-" + Date.now() + ".html");
  await fs.writeFile(file,
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + TITULO + "</title></head><body>" +
    String(html || "") + "</body></html>", "utf8");

  const esperar = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // `start` necesita un primer argumento como título de ventana; el `""` es
  // obligatorio, no decorativo: sin él, una ruta entrecomillada se toma por el
  // título y no se abre nada.
  const app = opts.browser || "chrome";
  const exe = /\.exe$/i.test(app) ? app : app + ".exe";

  /* Qué ventanas hay abiertas y cómo se llaman.
   *
   * Es la pregunta que no supimos responder durante tres ejecuciones. NVDA
   * contestaba «blank» —su forma de decir «documento vacío»— y desde el log no
   * había manera de saber si el navegador se había quedado en una pestaña de
   * bienvenida, si la página no había cargado, o si el foco estaba en otra
   * ventana. El título de la ventana lo dice en una línea. */
  const ventanas = async function (cuando) {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + \' :: \' + $_.MainWindowTitle }"',
        { shell: "cmd.exe" });
      const lineas = String(stdout || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      console.error("  (ventanas " + cuando + ") " + (lineas.length ? lineas.join(" | ") : "ninguna con título"));
    } catch (e) {
      console.error("  (ventanas " + cuando + ") no se pudieron listar: " + ((e && e.message) || e));
    }
  };

  try {
    await nvda.start();
    /* Las banderas no son opcionales en un perfil recién nacido: sin
     * `--no-first-run` Chrome abre su pantalla de bienvenida, y la pestaña que
     * queda delante no es la nuestra. */
    await execAsync('start "" ' + app + ' --no-first-run --no-default-browser-check --start-maximized "file:///' +
      file.replace(/\\/g, "/") + '"', { shell: "cmd.exe" });
    await esperar(opts.loadMs == null ? 15000 : opts.loadMs);
    await ventanas("tras abrir el navegador");

    /* Traer el navegador al PRIMER PLANO, y no darlo por hecho.
     *
     * Las teclas que NVDA manda van a la ventana que tenga el foco. En un
     * escritorio de CI nadie ha hecho clic en nada: `start` abre Chrome, pero
     * la ventana activa puede seguir siendo la consola desde la que se lanzó
     * todo. Entonces las flechas no recorren la página, NVDA no anuncia nada, y
     * la sesión entera devuelve cero frases sin un solo error — que es
     * exactamente lo que pasó en la primera ejecución que llegó hasta aquí.
     *
     * `windowsActivate` hace ese trabajo (AppActivate + SetForegroundWindow).
     * Si falla, se sigue: puede que la ventana ya estuviera delante, y abortar
     * aquí sería tirar una sesión que quizá funcionaba. */
    try {
      const gp = opts.guidepup || await import("@guidepup/guidepup");
      if (gp.windowsActivate) {
        await gp.windowsActivate(exe, TITULO);
        await esperar(1500);
      }
    } catch (e) {
      console.error("  (aviso) no se pudo activar la ventana de " + exe + ": " + ((e && e.message) || e));
    }

    await ventanas("tras activarla");

    // Y colocar el cursor de NVDA al principio del documento. Sin esto, el
    // recorrido empieza donde estuviera, que en una ventana recién abierta
    // suele ser la barra de direcciones y no el contenido.
    try { await nvda.press("Control+Home"); await esperar(500); } catch (e) { /* noop */ }

    /* Vaciar el registro ANTES de empezar a recorrer.
     *
     * Al cargar la página, NVDA la lee entera de un tirón, y esa lectura entra
     * en el registro como UNA sola entrada con todo dentro: «button, , button,
     * Enviar formulario, same page, link, Saltar al contenido». Un bloque así no
     * se puede emparejar con nada: contiene tres controles, y asignárselo a uno
     * sería mentir sobre los otros dos — al botón sin nombre le pondría de
     * nombre «Enviar formulario» y absolvería un 4.1.2 real.
     *
     * Vaciándolo aquí, lo que queda es una entrada por paso del recorrido, que
     * es lo que sí se puede comparar. No se pierde nada: el recorrido pasa por
     * todo igualmente. */
    try { await nvda.clearSpokenPhraseLog(); } catch (e) { /* si no se puede, seguimos */ }

    /* Y que lea la línea en la que está ANTES del primer paso.
     *
     * `Control+Home` coloca el cursor en la primera línea y la anuncia, pero ese
     * anuncio se acaba de tirar al vaciar el registro. Luego la primera flecha
     * abajo salta YA a la segunda línea, así que la primera no la recoge nadie:
     * en el componente de prueba eso era perder los dos botones y el enlace, que
     * es justo lo que hay que verificar. `readLine` vuelve a decir la línea
     * actual, y como el registro ya está limpio, entra como una entrada más. */
    try {
      await nvda.perform(nvda.keyboardCommands.readLine);
      await esperar(600);
    } catch (e) { /* noop */ }

    // Y un respiro algo mayor entre pasos, por la misma razón: si dos anuncios
    // se pisan, NVDA los junta en una sola entrada.
    const phrases = await verifyWithScreenReader({
      voiceOver: nvda,
      steps: opts.steps == null ? 15 : opts.steps,
      sleepMs: opts.sleepMs == null ? 500 : opts.sleepMs
    });

    /* Si no se capturó nada, volcar lo que NVDA tenga en su registro.
     *
     * Sin esto, una sesión vacía solo dice «ninguna captura sirvió», que no
     * distingue entre «NVDA no habló» y «habló y no lo recogimos». Con el
     * registro delante, la diferencia se ve en una línea. */
    if (!phrases.length) {
      try {
        const registro = await nvda.spokenPhraseLog();
        console.error("  (diagnóstico) NVDA no devolvió ninguna frase en el recorrido.");
        console.error("  Registro completo del lector (" + registro.length + " entradas):");
        registro.slice(0, 40).forEach(function (f, i) { console.error("    " + (i + 1) + ". " + f); });
      } catch (e) {
        console.error("  (diagnóstico) tampoco se pudo leer el registro de NVDA: " + ((e && e.message) || e));
      }
    }
    return phrases;
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
      // El `locator` va también aquí: sin él, el informe dice «no-encontrado»
      // sobre un elemento sin nombre, y no hay forma de saber cuál de los nodos
      // previstos se quedó sin verificar.
      return { locator: a.predicted.locator, predicted: a.predicted, spoken: null, verdict: "no-encontrado",
        note: "El lector no visitó un elemento que casara con este nodo." };
    }
    return Object.assign({ locator: a.predicted.locator }, compareAnnouncement(a.predicted, a.spoken, lector));
  });

  const tally = { confirmado: 0, parcial: 0, divergente: 0, "barrera-confirmada": 0, "no-encontrado": 0, "sin-captura": 0 };
  results.forEach(function (r) { if (tally[r.verdict] != null) tally[r.verdict]++; });

  return { model: model, lector: lector || null, predicted: predicted, spokenPhrases: phrases, results: results, summary: tally };
}
