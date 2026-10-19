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
  /* El nombre previsto se busca en la frase CRUDA, no en la recortada.
   *
   * El recorte de ruido quita estados y posiciones —«marcada», «nivel 2», «3 de
   * 10»— y esos patrones no se pueden distinguir de un nombre que diga lo mismo.
   * Un enlace que se llama «Nivel 2» salía `divergente` porque el filtro se comía
   * justo su nombre; igual «Página 3 de 10», «Requerido para continuar» o «Texto
   * marcado como leído».
   *
   * Aquí esa ambigüedad SÍ se puede resolver, porque el motor dice qué nombre
   * espera: si la frase contiene esa secuencia de palabras, es contenido de la
   * página y no ruido del lector. El recorte sigue haciendo su trabajo donde de
   * verdad hace falta —en `residualName`, que es quien decide si un control SIN
   * nombre previsto se queda con algo—, y ahí no hay nada que proteger. */
  const nameFound = expectName
    ? (contienePalabras(normalize(spoken), expectName) || contienePalabras(normalize(cleaned), expectName))
    : null;

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
  const steps = opts.steps == null ? 400 : opts.steps;   // TECHO, no objetivo
  const sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const sleepMs = opts.sleepMs == null ? 250 : opts.sleepMs;

  const phrases = [];
  const seen = new Set();
  /* La deduplicación va por la frase CRUDA, no por la recortada.
   *
   * La clave era `normalize(stripReaderNoise(spoken))` —y encima sin lector, o sea
   * con los dos filtros—, así que dos elementos DISTINTOS cuya diferencia estaba
   * justo en lo que el filtro borra quedaban con la misma clave y el segundo se
   * descartaba en silencio. Medido: «casilla, Recibir novedades, no marcada» y
   * «casilla, Recibir novedades, marcada» son dos casillas, y solo se recogía una;
   * el nodo que se quedaba sin frase acababa `no-encontrado`, es decir, sin
   * verificar, por un artefacto del recorte.
   *
   * El recorte sirve para COMPARAR, no para decidir si dos frases son la misma.
   * Aquí lo que interesa es que el lector repita literalmente lo mismo, que es lo
   * que pasa cuando el recorrido se queda quieto. */
  const anotar = function (spoken, step) {
    const key = normalize(spoken);
    if (!spoken || !key || seen.has(key)) return false;
    seen.add(key);
    phrases.push({ step: step, spoken: spoken });
    return true;
  };

  /* EL RECORRIDO SE PARA CUANDO ACABA LA PÁGINA, NO A LOS QUINCE PASOS.
   *
   * `steps` era un NÚMERO FIJO de pasos —12 aquí, 14 en el verificador, 15 en los
   * adaptadores— y eso no es «leer la página»: es leer sus primeros quince
   * elementos. Reportado desde una sesión real: «se conecta pero no lee la página
   * entera». En una página de verdad hay decenas de elementos; con quince pasos,
   * de un 4.1.2 con 24 familias se verificarían las primeras y el resto saldría
   * `no-encontrado`, que en este puente significa «sin verificar» — es decir, el
   * informe tendría filas sin confirmar por un tope, no por la página.
   *
   * Ahora `steps` es un TECHO (400 por omisión) y lo que para el recorrido es que
   * el cursor deje de avanzar. La señal es que el lector repita LITERALMENTE la
   * misma frase varias veces seguidas, que es lo que hace VoiceOver cuando ya está
   * en el último elemento y se le pide el siguiente. Se mira la repetición
   * CONSECUTIVA y no el duplicado global, porque dos elementos distintos pueden
   * sonar igual —dos botones sin nombre dicen «botón» los dos— y eso no es haber
   * llegado al final. Y no se busca ninguna frase de «fin de página»: eso depende
   * del idioma del sistema, y aquí el sistema está en español.
   *
   * Si se acaba el techo, la lectura está INCOMPLETA y hay que decirlo: una
   * verificación a medias no puede leerse como una verificación. */
  const transcripcion = [];
  const tope = opts.repeticionesParaParar == null ? 3 : opts.repeticionesParaParar;
  let repes = 0, anterior = null, dados = 0, motivoFin = null;
  for (let i = 0; i < steps; i++) {
    await vo.next();
    if (sleepMs) await sleep(sleepMs);
    const frase = await vo.lastSpokenPhrase();
    dados = i + 1;
    /* La TRANSCRIPCIÓN va aquí, en bruto y sin deduplicar.
     *
     * Lo que se guardaba como «transcripción en bruto» era la lista ya
     * deduplicada, o sea ni en bruto ni una transcripción: una frase repetida
     * —que es justo lo que delata que el recorrido se quedó quieto— desaparecía,
     * y el orden mezclaba el bucle con el registro del lector. Una transcripción
     * es lo que dijo, en el orden en que lo dijo, con las repeticiones. */
    transcripcion.push({ paso: i, spoken: frase == null ? "" : String(frase) });
    anotar(frase, i);
    if (frase && anterior != null && normalize(frase) === normalize(anterior)) repes++;
    else repes = 0;
    anterior = frase;
    if (repes >= tope) { motivoFin = "el recorrido dejó de avanzar: la misma frase " + (tope + 1) + " veces seguidas"; break; }
    if (opts.stopWhenRepeated && phrases.length && seen.size <= i) { motivoFin = "stopWhenRepeated"; break; }
  }
  if (!motivoFin) motivoFin = "se agotó el techo de " + steps + " pasos SIN llegar al final de la página";
  const completo = motivoFin.indexOf("dejó de avanzar") !== -1 || motivoFin === "stopWhenRepeated";

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
      (registro || []).forEach(function (spoken, i) {
        anotar(spoken, dados + i);
        transcripcion.push({ paso: dados + i, spoken: spoken == null ? "" : String(spoken), deRegistro: true });
      });
    } catch (e) { /* sin registro, nos quedamos con lo del bucle */ }
  }
  /* El detalle del recorrido, para quien lo pida. Se devuelve por parámetro de
   * salida y no cambiando el valor de retorno, porque `phrases` lo consumen el
   * puente, los dos adaptadores y los tests: lo que hacía falta era AÑADIR la
   * transcripción, no mover nada de sitio. */
  if (opts.detalle) {
    opts.detalle.transcripcion = transcripcion;
    opts.detalle.pasos = dados;
    opts.detalle.techo = steps;
    opts.detalle.completo = completo;
    opts.detalle.motivoFin = motivoFin;
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
/**
 * APAGAR VOICEOVER DE VERDAD, Y COMPROBARLO.
 *
 * Reportado desde una sesión real: «se conecta pero no se apaga». El puente ya
 * llamaba a `voiceOver.stop()` dentro de un `finally`, así que el defecto no era
 * que faltara: era que nadie comprobaba el resultado. El `catch` estaba vacío
 * —`catch (e) { /* noop *\/ }`— de modo que si `stop()` fallaba, o si devolvía sin
 * cerrar nada, VoiceOver se quedaba hablando en la máquina de la persona y el
 * programa terminaba diciendo que todo había ido bien. Es el mismo defecto que
 * este proyecto persigue en los informes, aplicado a un proceso: el silencio
 * pareciéndose al éxito.
 *
 * Ahora hay una escalera de tres peldaños y se comprueba entre peldaño y peldaño:
 *   1. `voiceOver.stop()`, que es la vía del API;
 *   2. `tell application "VoiceOver" to quit`, la de AppleScript;
 *   3. `killall VoiceOver`, la bruta.
 * Y si después del tercero sigue vivo, se DICE, con la tecla para apagarlo a mano
 * (Cmd+F5). Nunca se devuelve «apagado» sin haberlo mirado.
 *
 * NO VERIFICADO EN MÁQUINA: esto solo corre en macOS con VoiceOver, y el
 * contenedor donde se escribió no tiene ninguno de los dos. Lo que sí está
 * probado aquí, con un ejecutor simulado, es la escalera: que pasa al peldaño
 * siguiente solo si sigue vivo, que no miente cuando no puede comprobarlo, y que
 * un fallo de `stop()` ya no se traga.
 *
 * @param {object} vo  el objeto voiceOver de Guidepup
 * @param {(cmd:string)=>Promise<{stdout:string}>} ejec  ejecutor de comandos
 */
export async function apagarLector(vo, ejec) {
  const pasos = [];
  const sigueVivo = async function () {
    try {
      const r = await ejec("pgrep -x VoiceOver || true");
      return String((r && r.stdout) || "").trim().length > 0;
    } catch (e) { return null; }   // no se sabe, y eso NO es «apagado»
  };

  try { await vo.stop(); pasos.push({ via: "guidepup.stop()", ok: true }); }
  catch (e) { pasos.push({ via: "guidepup.stop()", ok: false, error: (e && e.message) || String(e) }); }

  let vivo = await sigueVivo();
  if (vivo === true) {
    try {
      await ejec("osascript -e 'tell application \"VoiceOver\" to quit'");
      pasos.push({ via: "osascript quit", ok: true });
    } catch (e) { pasos.push({ via: "osascript quit", ok: false, error: (e && e.message) || String(e) }); }
    vivo = await sigueVivo();
  }
  if (vivo === true) {
    try { await ejec("killall VoiceOver"); pasos.push({ via: "killall", ok: true }); }
    catch (e) { pasos.push({ via: "killall", ok: false, error: (e && e.message) || String(e) }); }
    vivo = await sigueVivo();
  }
  return {
    vivo: vivo,
    pasos: pasos,
    aviso: vivo === true
      ? "VoiceOver SIGUE ENCENDIDO: no he podido apagarlo. Apágalo a mano con Cmd+F5."
      : vivo === null
        ? "No he podido comprobar si VoiceOver quedó apagado (no pude consultar los procesos). Si sigue hablando, Cmd+F5."
        : null
  };
}

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
    /* Y ACTIVAR el navegador explícitamente.
     *
     * `open -a` abre la URL, pero con el navegador ya corriendo no siempre trae
     * su ventana al frente, y arrancar VoiceOver justo antes mueve el foco por
     * su cuenta. Si el navegador no está delante, `lastSpokenPhrase()` —que
     * escucha a TODO el sistema— devuelve el Finder, el Terminal o la ventana de
     * otra app: eso es exactamente lo que se ve en la transcripción real de
     * `voiceover-verificacion-real`, un pegote con Chrome, el Terminal y los
     * Ajustes del Sistema dentro de una sola «frase».
     *
     * NO VERIFICADO AQUÍ: esta línea solo corre en macOS con VoiceOver, y el
     * contenedor donde se escribió no tiene ninguno de los dos. Lo que sí está
     * comprobado, contra transcripciones reales, es que si la captura falla el
     * puente ahora lo DICE (`sesionUtil`) en vez de dejar que parezca una
     * divergencia del léxico. */
    try { await execAsync('osascript -e \'tell application "' + app + '" to activate\''); } catch (e) { /* si no se puede, se sigue: la sesión se declarará nula si no capturó nada */ }
    await new Promise(function (r) { setTimeout(r, opts.loadMs == null ? 3000 : opts.loadMs); });
    const detalle = opts.detalle || {};
    const phrases = await verifyWithScreenReader({
      voiceOver: voiceOver,
      // TECHO, no objetivo: el recorrido se para al llegar al final de la página.
      steps: opts.steps == null ? 400 : opts.steps,
      detalle: detalle
    });
    return phrases;
  } finally {
    const apagado = await apagarLector(voiceOver, execAsync);
    if (opts.detalle) opts.detalle.apagado = apagado;
    if (apagado.aviso) console.error("\n⚠ " + apagado.aviso);
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
    const detalle = opts.detalle || {};
    const phrases = await verifyWithScreenReader({
      voiceOver: nvda,
      // TECHO, no objetivo: el mismo arreglo que en VoiceOver. Quince pasos fijos
      // no son «leer la página», son leer sus primeros quince elementos.
      steps: opts.steps == null ? 400 : opts.steps,
      sleepMs: opts.sleepMs == null ? 500 : opts.sleepMs,
      detalle: detalle
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
    /* El apagado también se comprueba aquí, y por el mismo motivo: un `catch`
     * vacío convierte «no se pudo cerrar el lector» en «todo bien». En Windows la
     * escalera no es la misma (no hay `pgrep` ni AppleScript), así que de momento
     * se dice lo que pasó con `stop()` y no se finge saber más. */
    try { await nvda.stop(); if (opts.detalle) opts.detalle.apagado = { vivo: null, pasos: [{ via: "guidepup.stop()", ok: true }], aviso: null }; }
    catch (e) {
      const msg = (e && e.message) || String(e);
      if (opts.detalle) opts.detalle.apagado = { vivo: null, pasos: [{ via: "guidepup.stop()", ok: false, error: msg }],
        aviso: "No he podido cerrar NVDA (" + msg + "). Ciérralo a mano antes de seguir." };
      console.error("\n⚠ No he podido cerrar NVDA: " + msg + ". Ciérralo a mano antes de seguir.");
    }
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
/**
 * ¿La sesión llegó a la página, o se capturó el escritorio?
 *
 * Esto faltaba, y se notó el día que la prueba con VoiceOver real se ejecutó por
 * primera vez: tardó 103 segundos y falló diciendo «el icono sin nombre debería
 * confirmarse». Ese mensaje vale igual si el lector habló y dijo otra cosa —un
 * defecto del léxico— que si no llegó a leer la página —el entorno—, y son
 * conclusiones opuestas. El puente ya marcaba `sin-captura` nodo a nodo, pero
 * nadie resumía la SESIÓN, así que el informe no distinguía «no hay evidencia»
 * de «la evidencia contradice la predicción».
 *
 * Es puro y se comprueba sin lector, con las transcripciones reales del fixture.
 *
 * @param {Array<{spoken:string}>|Array<string>} phrases
 * @param {"voiceover"|"nvda"} [lector]
 */
/* EL RELLENO QUE VOICEOVER AÑADE A CADA ANUNCIO, que no es de la página ni de
   ninguna otra ventana: son sus instrucciones. Fuera, para que no cuenten como
   contenido ni a favor ni en contra. */
const RELLENO_LECTOR = [
  /est[aá]s en un elemento de tipo[^.]*/gi,
  /est[aá]s en (el|la) (contenido web|[aá]rea web|barra de[^.]*)/gi,
  /para desplazarte[^.]*/gi,
  /para (hacer clic|salir|interactuar|entrar)[^.]*/gi,
  /pulsa control[^.]*/gi,
  /tiene el foco del teclado/gi,
  /inserci[oó]n al final del texto/gi
];
/* OJO: «nivel de encabezamiento N» y «área de entrada de texto» NO entran aquí.
   Los puse como relleno y era un error mío: son la forma en que VoiceOver ANUNCIA
   EL ROL en español. Quitándolos, un encabezado no podía salir `confirmado` nunca
   —se quedaba en `parcial` por «no se reconoce el rol»— y un campo de texto
   tampoco. El relleno es lo que el lector dice sobre cómo moverse, no lo que dice
   sobre qué es la cosa. */

/**
 * UN ANUNCIO POR SEGMENTO, NO UNA FRASE POR PASO.
 *
 * `lastSpokenPhrase()` no devuelve «lo último que dijo»: devuelve todo lo que ha
 * dicho desde la última vez que se le preguntó, pegado. Medido con una sesión
 * real, UNA sola «frase» traía dentro el encabezado de la página, su botón, el
 * aviso de que VoiceOver se desactivaba, el «Bienvenido a macOS» del arranque y
 * la ventana de Chrome con la app de Claude — todo junto.
 *
 * Por eso clasificar por frase no sirve: ese pegote es a la vez de la página y de
 * otra ventana, así que se le ponga la etiqueta que se le ponga, está mal. La
 * unidad tiene que ser el ENUNCIADO, y la separación la dan los puntos dobles con
 * los que el lector encadena.
 */
export function segmentaFrase(spoken) {
  let t = String(spoken == null ? "" : spoken);
  RELLENO_LECTOR.forEach(function (re) { t = t.replace(re, " · "); });
  return t.split(/\s*\.{2,}\s*|\s*·\s*|\.\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/)
    .map(function (x) { return x.replace(/\s+/g, " ").trim(); })
    .filter(function (x) { return x.length > 1; });
}

/**
 * ¿QUÉ SE CAPTURÓ DE LA PÁGINA SERVIDA, Y QUÉ DE OTRA VENTANA?
 *
 * `lastSpokenPhrase()` escucha a TODO el sistema, así que una sesión puede
 * capturar la ventana de al lado sin que nada falle. Y hasta aquí el único filtro
 * era una lista de pistas del escritorio más una línea que bendecía todo lo que
 * dijera «contenido web» — que es justo lo que dice una aplicación de Electron.
 *
 * Medido con una sesión real: la ventana de la app desde la que se lanzó la prueba
 * se colaba entera y el informe no lo decía: emparejó tres nodos del componente
 * contra botones ajenos y firmó `divergente` ×3. Una afirmación sobre la página
 * hecha con frases que no eran de la página.
 *
 * Quien decide ahora es el TEXTO DE LA PÁGINA, y por PAREJAS de palabras. Una
 * palabra sola no distingue: la página de prueba tiene un botón «Enviar
 * formulario» y la app de al lado uno de «Enviar mensaje», y con «enviar» como
 * señal, dieciocho enunciados ajenos pasaban por página. Dos palabras seguidas sí
 * distinguen.
 *
 * Tres clases, y la del medio es la que evita que esto sea un filtro ingenuo:
 *
 *   · `pagina`: comparte una pareja de palabras con la página o con el nombre de
 *     un nodo previsto. Es de la página.
 *   · `ajena`: nombra dos o más palabras de contenido y ninguna está en la
 *     página. Es de otra ventana.
 *   · `sinDatos`: solo rol o relleno — «botón», «imagen». No distingue, y NO se
 *     descarta: el caso más importante de 4.1.2 es un botón sin nombre, cuyo
 *     anuncio es «botón» y nada más. Tirarlo sería perder la barrera que se busca.
 */
const ROL_PALABRAS = (function () {
  const out = new Set();
  Object.keys(ROLE_KEYWORDS || {}).forEach(function (r) {
    (ROLE_KEYWORDS[r] || []).forEach(function (k) {
      normalize(k).split(/[^a-z0-9ñ]+/).forEach(function (w) { if (w.length >= 4) out.add(w); });
    });
  });
  return out;
})();

export function clasificaFrases(phrases, html, predicted, lector) {
  const parejas = function (txt) {
    const ws = normalize(String(txt || "")).split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 4; });
    const out = new Set();
    for (let k = 1; k < ws.length; k++) out.add(ws[k - 1] + " " + ws[k]);
    return out;
  };
  const texto = String(html || "").replace(/<[^>]*>/g, " ");
  /* SIN EL HTML SERVIDO NO HAY PÁGINA CON LA QUE COMPARAR.
   *
   * Pasa con las transcripciones antiguas, guardadas antes de que el puente
   * anotara el HTML. Entonces la prueba fuerte no se puede hacer, y lo que NO
   * vale es hacer como si se hubiera hecho: se descartan las pistas de escritorio
   * —eso sigue valiendo— y todo lo demás queda en `sinDatos`, que es «no lo sé».
   * `sesionUtil` lo dice con esas palabras. */
  const sinPagina = !normalize(texto).replace(/[^a-z0-9ñ]+/g, "").length && !(predicted || []).length;
  const dePagina = parejas(texto);
  const sueltasDePagina = new Set(normalize(texto).split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 4; }));
  (predicted || []).forEach(function (p) {
    parejas(p.name).forEach(function (b) { dePagina.add(b); });
    normalize(p.name || "").split(/[^a-z0-9ñ]+/).forEach(function (w) { if (w.length >= 4) sueltasDePagina.add(w); });
  });
  const palabrasDeRol = new Set();
  Object.keys(ROLE_KEYWORDS || {}).forEach(function (r) {
    (ROLE_KEYWORDS[r] || []).forEach(function (k) {
      normalize(k).split(/[^a-z0-9ñ]+/).forEach(function (w) { if (w.length >= 4) palabrasDeRol.add(w); });
    });
  });

  const out = [];
  (phrases || []).forEach(function (ph, i) {
    const spoken = (ph && typeof ph === "object" && ph.spoken != null) ? ph.spoken : ph;
    const bruto = String(spoken == null ? "" : spoken);
    if (!bruto.trim()) { out.push({ i: i, seg: 0, texto: "", clase: "vacia", porQue: "el lector no dijo nada" }); return; }
    segmentaFrase(bruto).forEach(function (t, k) {
      if (esRuidoDeEscritorio(t, lector)) {
        out.push({ i: i, seg: k, texto: t, clase: "ajena", porQue: "pista de escritorio o del cromo del navegador" });
        return;
      }
      const limpio = normalize(stripReaderNoise(t, lector));
      const ws = limpio.split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 4; });
      const bi = [];
      for (let z = 1; z < ws.length; z++) bi.push(ws[z - 1] + " " + ws[z]);
      if (sinPagina) {
        out.push({ i: i, seg: k, texto: t, clase: "sinDatos", porQue: "no se guardó el HTML servido: no hay con qué comparar" });
        return;
      }
      const casan = bi.filter(function (b) { return dePagina.has(b); });
      if (casan.length) {
        out.push({ i: i, seg: k, texto: t, clase: "pagina", porQue: "comparte «" + casan.slice(0, 2).join("», «") + "» con la página" });
        return;
      }
      const contenido = ws.filter(function (w) { return !palabrasDeRol.has(w); });
      const fuera = contenido.filter(function (w) { return !sueltasDePagina.has(w); });
      if (contenido.length >= 2 && fuera.length === contenido.length) {
        out.push({ i: i, seg: k, texto: t, clase: "ajena",
          porQue: "nombra «" + fuera.slice(0, 3).join("», «") + "», que no está en la página servida" });
        return;
      }
      out.push({ i: i, seg: k, texto: t, clase: "sinDatos", porQue: "solo rol o relleno del lector" });
    });
  });
  return out;
}

/**
 * ¿SIRVE ESTA SESIÓN PARA DECIR ALGO DE LA PÁGINA?
 *
 * Antes la respuesta era «sí» en cuanto UNA frase fuera de la página. Medido con
 * una sesión real: 12 enunciados de la página contra 140 de otras ventanas, y la
 * sesión se declaró útil — con lo que tres nodos salieron `divergente` por
 * haberse emparejado contra botones ajenos.
 *
 * Una frase suelta no sostiene cuatro veredictos. Ahora manda la PROPORCIÓN entre
 * lo que es de la página y lo que es de otra ventana, contado por enunciados, y
 * los que no aportan dato no cuentan a ningún lado.
 */
export function sesionUtil(phrases, lector, html, predicted) {
  const cl = clasificaFrases(phrases, html, predicted, lector);
  const n = function (clase) { return cl.filter(function (x) { return x.clase === clase; }).length; };
  const pagina = n("pagina"), ajena = n("ajena"), sinDatos = n("sinDatos"), vacias = n("vacia");
  const total = cl.length;
  /* QUÉ INVALIDA UNA SESIÓN, Y QUÉ SOLO LA ENSUCIA.
   *
   * Mi primera versión de esto la invalidaba cuando lo ajeno era mayoría, y era
   * pasarme: con el filtrado puesto —al emparejar solo se usan los enunciados de
   * la página—, un pegote de otra ventana ya no puede contaminar ningún veredicto.
   * Lo comprobó el fixture de abril: dos anuncios limpios del enlace de salto y un
   * pegote de escritorio de veinte enunciados; esa sesión SÍ dice algo del enlace,
   * y declararla nula habría tirado la única evidencia buena que tenía.
   *
   * Lo que invalida es no tener NADA de la página. Que lo ajeno sea mayoría es un
   * aviso: explica por qué quedaron nodos sin confirmar, y no es poca cosa, pero no
   * borra lo que sí se capturó. */
  let motivo, ok, aviso = null;
  if (!total) {
    ok = false;
    motivo = "El lector no devolvió ni un enunciado: no llegó a arrancar, o no se le preguntó.";
  } else if (!pagina && sinDatos && !String(html || "").trim() && !(predicted || []).length) {
    ok = false;
    motivo = "No se guardó el HTML servido con esta transcripción, así que no puedo comparar lo capturado con la " +
      "página: solo he descartado " + ajena + " enunciado(s) por pistas de escritorio. Lo demás queda sin decidir.";
  } else if (!pagina) {
    ok = false;
    motivo = "Ninguno de los " + total + " enunciado(s) capturados es de la página (" + ajena + " de otras ventanas, " +
      sinDatos + " sin dato, " + vacias + " vacíos): el navegador perdió el primer plano o el lector nunca leyó la " +
      "página. Esto NO dice nada sobre el componente.";
  } else {
    ok = true;
    motivo = pagina + " de " + (pagina + ajena) + " enunciado(s) informativos son de la página" +
      (ajena ? " (" + ajena + " de otras ventanas, descartados del emparejamiento)" : "") + ".";
    if (ajena > pagina) {
      aviso = "La mayor parte de lo que oyó el lector era de OTRA VENTANA (" + ajena + " enunciados frente a " +
        pagina + " de la página). Lo capturado de la página vale, pero los nodos que hayan quedado sin confirmar " +
        "lo más probable es que sea por esto y no por un defecto suyo: deja el navegador en primer plano, no toques " +
        "el equipo y repite la sesión antes de concluir nada de ellos.";
    }
  }
  return { ok: ok, total: total, dePagina: pagina, ruido: ajena, sinDatos: sinDatos, vacias: vacias, motivo: motivo, aviso: aviso };
}

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
  /* EMPAREJAR SOLO CONTRA LO QUE ES DE LA PÁGINA.
   *
   * Aquí estaba el daño de verdad: el emparejamiento recibía TODO lo capturado, y
   * con la ventana de otra aplicación dentro, «Enviar mensaje botón» —de la app de
   * al lado— se llevaba un nodo del componente y lo firmaba `divergente`. El nodo
   * se queda mejor sin frase (`no-encontrado`, que es «sin verificar») que con la
   * frase de otra ventana. */
  const clasificacion = clasificaFrases(phrases, html, predicted, lector);
  const utilizables = clasificacion
    .filter(function (x) { return x.clase === "pagina" || x.clase === "sinDatos"; })
    .map(function (x) { return { step: x.i, spoken: x.texto, clase: x.clase }; });
  const aligned = alignPredictedToSpoken(predicted, utilizables, lector);
  /* De qué clase era el enunciado con el que se emparejó cada nodo. Hace falta
     abajo: un enunciado que no aporta dato no puede CONTRADECIR una predicción. */
  const claseDe = {};
  utilizables.forEach(function (u) { claseDe[u.spoken] = u.clase; });

  const results = aligned.map(function (a) {
    if (a.spoken == null) {
      // El `locator` va también aquí: sin él, el informe dice «no-encontrado»
      // sobre un elemento sin nombre, y no hay forma de saber cuál de los nodos
      // previstos se quedó sin verificar.
      return { locator: a.predicted.locator, predicted: a.predicted, spoken: null, verdict: "no-encontrado",
        note: "El lector no visitó un elemento que casara con este nodo." };
    }
    const r = Object.assign({ locator: a.predicted.locator }, compareAnnouncement(a.predicted, a.spoken, lector));
    /* UN ENUNCIADO SIN DATO NO PUEDE CONTRADECIR NADA.
     *
     * `divergente` es una acusación: dice que el lector NO pronuncia el nombre
     * previsto. Para sostenerla hace falta que el enunciado diga algo. Medido con
     * la sesión real: «Nueva pestaña botón» —de la barra del navegador— y
     * «Estás en el contenido web» —relleno del propio lector— firmaban dos
     * `divergente` sobre nodos del componente.
     *
     * Si el nodo previsto NO tiene nombre y el lector dice solo su rol, eso sí es
     * un dato: es el caso de libro de 4.1.2 y sigue saliendo como barrera
     * confirmada. Lo que no vale es lo contrario: con nombre previsto y un
     * enunciado que no distingue, lo honesto es «sin verificar». */
    /* `divergente` SOLO lo puede sostener un enunciado que sepamos de la página.
     *
     * Es una acusación —«el lector no pronuncia el nombre previsto»— y para
     * hacerla hay que estar seguro de que el lector estaba mirando este elemento.
     * Medido con la sesión real: «Nueva pestaña botón», que es el botón de nueva
     * pestaña del NAVEGADOR, firmaba `divergente` contra el botón de icono del
     * componente. Dos elementos de dos ventanas distintas.
     *
     * Con un enunciado que no distingue solo quedan dos salidas honestas: si el
     * nodo previsto no tiene nombre y el lector tampoco dijo ninguno, es el caso
     * de libro de 4.1.2 y se confirma la barrera; y si el enunciado trae algún
     * nombre que no es de la página, no se sabe de qué elemento hablaba —
     * «sin verificar». */
    if (r.verdict !== "confirmado" && claseDe[a.spoken] !== "pagina") {
      const sinRol = normalize(stripReaderNoise(String(a.spoken), lector))
        .split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length >= 4 && !ROL_PALABRAS.has(w); });
      const previstoSinNombre = !(a.predicted.name || "").trim();
      if (previstoSinNombre && !sinRol.length) {
        return Object.assign(r, {
          verdict: "barrera-confirmada",
          note: "El lector anuncia solo el rol y ningún nombre, y el motor tampoco le encontraba uno: " +
            "la barrera de 4.1.2 queda confirmada por el lector."
        });
      }
      return Object.assign(r, {
        verdict: "no-encontrado",
        note: "Sin verificar. El enunciado con el que casó («" + String(a.spoken).slice(0, 40) +
          "») no es de la página servida o no nombra nada de ella, así que no sirve ni para confirmar este " +
          "elemento ni para contradecirlo. Una acusación sobre la página necesita una frase de la página."
      });
    }
    return r;
  });

  const tally = { confirmado: 0, parcial: 0, divergente: 0, "barrera-confirmada": 0, "no-encontrado": 0, "sin-captura": 0 };
  results.forEach(function (r) { if (tally[r.verdict] != null) tally[r.verdict]++; });

  /* El resumen de la SESIÓN va al mismo nivel que el de los nodos: si no hubo
     captura de la página, lo de abajo no es un veredicto sobre el componente,
     es la ausencia de uno, y eso tiene que leerse sin interpretar la tabla. */
  const sesion = sesionUtil(phrases, lector, html, predicted);

  return {
    model: model, lector: lector || null, predicted: predicted, spokenPhrases: phrases,
    // La clasificación entera, para poder revisar de dónde salió cada veredicto.
    clasificacion: clasificacion,
    results: results, summary: tally, sesion: sesion
  };
}
