/**
 * Prueba dinámica de widgets — análisis PURO de la traza capturada.
 *
 * Un driver (Playwright o la extensión) opera la página de verdad —tabula, abre,
 * expande, cambia de pestaña, envía formularios— y captura qué pasó. Estas
 * funciones interpretan esa traza y emiten veredictos. Son puras y testeables sin
 * navegador; el driver vive en dynamic-analyze.js.
 *
 * Principio: el driver distingue "he comprobado y está mal" de "no he podido
 * comprobarlo". Estas funciones NUNCA convierten lo segundo en una falla. Si el
 * clic no llegó a ocurrir, o si se agotó el presupuesto de tabulaciones, el
 * veredicto es `revisar`, no `falla`.
 */
import { WCAG22, enClause } from "./engine.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "A") }; }
function F(n, verdict, sev, evid, nodes) {
  const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "dinámico", en: enClause(n) };
  if (nodes && nodes.length) f.nodes = nodes;
  return f;
}
// Identidad estable de un control en la traza: el uid único del driver si lo hay,
// y si no el locator legible (que PUEDE colisionar — por eso el driver manda uid).
function key(x) { return (x && (x.uid || x.locator)) || null; }
function nodesOf(list) {
  return (list || []).slice(0, 12).map(function (x) { return { locator: x.locator, name: x.name || "" }; });
}

/**
 * Operabilidad por teclado real: ¿la tabulación alcanza todos los controles?
 * @param {{ focusables:Array<{locator:string,uid?:string}>, reached:Array<{locator:string,uid?:string}>,
 *           trapped?:boolean, exhausted?:boolean, tabs?:number }} trace
 */
export function analyzeTabTrace(trace) {
  const out = [];
  trace = trace || {};
  const reached = new Set((trace.reached || []).map(key));
  const focusables = trace.focusables || [];
  const unreached = focusables.filter(function (f) { return !reached.has(key(f)); });
  const inter = trace.interactivos || { sueltos: [], enCompuesto: [] };
  const sueltos = inter.sueltos || [];
  const enCompuesto = inter.enCompuesto || [];

  if (trace.trapped) {
    out.push(F("2.1.2", "falla", "crítica", [
      "El foco queda atrapado con Tab: no se puede salir del componente solo con teclado." +
      (trace.atrapadoEn && trace.atrapadoEn.length
        ? " El recorrido cicla entre " + trace.atrapadoEn.length + " control(es) —" + trace.atrapadoEn.slice(0, 6).join(" → ") +
          "— y no vuelve a salir, con " + unreached.length + " control(es) del resto de la página sin alcanzar."
        : "")
    ], (trace.atrapadoEn || []).slice(0, 8).map(function (l) { return { locator: l, name: "" }; })));
  }

  /* 2.1.1 sobre los controles INTERACTIVOS que no son enfocables.
   *
   * Es el fallo de libro del criterio y no se estaba mirando: el driver enumeraba
   * lo que YA era enfocable, así que un `div role="button"` sin `tabindex` no
   * entraba en la lista, no había nada «sin alcanzar», y el análisis emitía 2.1.1
   * `cumple` con la frase «Todos los controles interactivos se alcanzan con Tab».
   * Cinco barreras reales invisibles, y la afirmación hecha sin haber mirado uno.
   *
   * Los de un widget compuesto con su parada de tabulación (tablist, listbox…) NO
   * son barrera: el patrón ARIA correcto es una sola parada y las flechas por
   * dentro. Pero esta prueba no recorre las flechas, así que tampoco puede firmar
   * que ese widget se opere con teclado: se dice, y el criterio no se cierra. */
  if (sueltos.length) {
    out.push(F("2.1.1", "falla", "grave", [
      sueltos.length + " control(es) con rol de widget no pueden recibir el foco: no son alcanzables con teclado de ninguna manera (sin `tabindex`, y sin un widget compuesto que gestione el foco por ellos). " +
      sueltos.slice(0, 6).map(function (x) { return x.locator + " (role=" + x.rol + ")"; }).join(", ") + (sueltos.length > 6 ? "…" : "")
    ], nodesOf(sueltos)));
  }

  if (!focusables.length && !sueltos.length && !enCompuesto.length) return out;

  // ¿Se ha medido la tabulación? Si la fase se cayó, lo que falta NO se ha comprobado.
  if (trace.medida === false) {
    out.push(F("2.1.1", "revisar", null, [
      "La prueba de tabulación no llegó a ejecutarse (la fase falló), así que de los " + focusables.length +
      " control(es) enfocables de la página no se sabe si se alcanzan: no es que no se alcancen. Mira los errores de la ejecución y repítela."
    ], nodesOf(focusables)));
    return out;
  }

  if (!unreached.length && !sueltos.length) {
    if (enCompuesto.length) {
      out.push(F("2.1.1", "cumple-parcial", null, [
        "Todos los controles enfocables se alcanzan con Tab (" + focusables.length + "). Además hay " + enCompuesto.length +
        " control(es) dentro de widgets compuestos (" + enCompuesto.slice(0, 3).map(function (x) { return x.compuesto; }).join(", ") +
        ") que por diseño no son tabulables y se operan con las flechas: el patrón es el correcto, pero esta prueba no recorre las flechas, así que esa parte queda por comprobar a mano."
      ], nodesOf(enCompuesto)));
      return out;
    }
    out.push(F("2.1.1", "cumple", null, ["Todos los controles enfocables se alcanzan con Tab (" + focusables.length + "), y no hay ningún control con rol de widget que no pueda recibir el foco."]));
    return out;
  }
  if (!unreached.length) return out;   // lo de `sueltos` ya se ha dicho arriba
  // No se alcanzaron todos. ¿Es una barrera o es que no terminamos de mirar?
  // Si la tabulación se cortó (trampa de foco o presupuesto agotado), lo que falta
  // NO está comprobado: pedir revisión en vez de declarar falla.
  if (trace.trapped || trace.exhausted) {
    out.push(F("2.1.1", "revisar", null, [
      "La tabulación se interrumpió " + (trace.trapped ? "por una trampa de foco" : "al agotar el presupuesto de " + (trace.tabs || "?") + " pulsaciones") +
      " con " + unreached.length + " control(es) sin alcanzar: no se puede afirmar que sean inalcanzables. Repite la prueba con un presupuesto mayor o revisa a mano."
    ], nodesOf(unreached)));
    return out;
  }
  out.push(F("2.1.1", "falla", "grave", [
    unreached.length + " controle(s) no se alcanzan tabulando: " +
    unreached.slice(0, 6).map(function (u) { return u.locator; }).join(", ") + (unreached.length > 6 ? "…" : "")
  ], nodesOf(unreached)));
  return out;
}

/**
 * Disclosure / expandible: al activar, ¿cambia aria-expanded y el contenido controlado?
 * @param {Array<{locator:string, name?:string, clicked?:boolean, expandedBefore:string,
 *                expandedAfter:string, targetShownBefore?:boolean, targetShownAfter?:boolean}>} events
 */
export function analyzeDisclosure(events) {
  const out = [];
  (events || []).forEach(function (e) {
    const who = e.locator + (e.name ? " «" + e.name + "»" : "");
    const nodes = [{ locator: e.locator, name: e.name || "" }];
    // Si la activación no llegó a ocurrir, no hay nada medido: no inventamos una falla.
    if (e.clicked === false) {
      out.push(F("4.1.2", "revisar", null, [
        who + ": no se pudo activar automáticamente (" + (e.reason || "el control no responde al clic sintético") +
        "): el cambio de estado queda sin comprobar."
      ], nodes));
      return;
    }
    if (e.expandedBefore === e.expandedAfter) {
      out.push(F("4.1.2", "falla", "grave", ["Al activar " + who + ", <code>aria-expanded</code> no cambia (" + e.expandedBefore + "): el estado no se expone tras la interacción."], nodes));
    } else if (e.targetShownBefore != null && e.targetShownAfter != null && e.targetShownBefore === e.targetShownAfter) {
      out.push(F("4.1.2", "revisar", null, [who + ": aria-expanded cambia (" + e.expandedBefore + "→" + e.expandedAfter + ") pero el contenido controlado no cambia de visibilidad."], nodes));
    } else {
      out.push(F("4.1.2", "cumple", null, [who + ": el estado y el contenido controlado cambian al activar (" + e.expandedBefore + "→" + e.expandedAfter + ")."], nodes));
    }
  });
  return out;
}

/**
 * Pestañas: al activar una pestaña, ¿se mueve aria-selected y se muestra su panel?
 * @param {Array<{locator:string, clicked?:boolean, selectedAfter:string, othersSelected:number, panelShown?:boolean}>} events
 */
export function analyzeTabs(events) {
  const out = [];
  (events || []).forEach(function (e) {
    const nodes = [{ locator: e.locator, name: e.name || "" }];
    if (e.clicked === false) {
      out.push(F("4.1.2", "revisar", null, [e.locator + ": no se pudo activar automáticamente (" + (e.reason || "sin respuesta al clic") + "): sin comprobar."], nodes));
    } else if (e.selectedAfter !== "true") {
      out.push(F("4.1.2", "falla", "grave", [e.locator + ": al activarla, aria-selected no pasa a true."], nodes));
    } else if (e.othersSelected > 0) {
      out.push(F("4.1.2", "revisar", null, [e.locator + ": hay " + e.othersSelected + " pestaña(s) más marcadas como seleccionadas a la vez."], nodes));
    } else if (e.panelShown === false) {
      out.push(F("1.3.1", "revisar", null, [e.locator + ": la pestaña se selecciona pero su tabpanel no se muestra."], nodes));
    } else {
      out.push(F("4.1.2", "cumple", null, [e.locator + ": selecciona y muestra su panel correctamente."], nodes));
    }
  });
  return out;
}

/**
 * Errores de formulario forzados: al enviar con datos inválidos, ¿se identifican
 * en texto y se anuncian?
 *
 * `trace.intercepted` indica que el envío se bloqueó antes de salir a la red (modo
 * seguro). No cambia el veredicto: la validación de cliente y el marcado ARIA se
 * producen igual; solo evita tocar el servidor ajeno.
 *
 * @param {{ submitted:boolean, intercepted?:boolean, hasAlert?:boolean,
 *           fields:Array<{locator:string, required:boolean, invalid:boolean,
 *                         describedbyText?:string, hasAlert?:boolean}> }} trace
 */
export function analyzeErrorState(trace) {
  const out = [];
  if (!trace || !trace.submitted) return out;
  /* Qué es un campo EN ERROR, que no es lo mismo que un campo obligatorio.
   *
   * Esto era `f.required || f.invalid`, con `invalid` mirando solo
   * `aria-invalid="true"`. O sea: «obligatorio» se usaba como sustituto de
   * «habrá fallado la validación», y en cuanto el campo está rellenado y es
   * válido eso es falso. Medido: un `required` correctamente rellenado producía
   * `3.3.1 falla grave` («1 campo con error sin descripción») y, de paso, un
   * `4.1.2 revisar` por no exponer `aria-invalid` en un campo que no tiene
   * ningún error que exponer. Una barrera inventada sobre contenido conforme,
   * que es precisamente lo que el comentario de abajo advierte de no hacer.
   *
   * Ahora el error es lo que lo acredita: `aria-invalid="true"`, o la validez
   * NATIVA que el navegador acaba de decidir al enviar (`nativoInvalido`). Y se
   * mantiene «obligatorio y vacío» como respaldo para los rastreos que no traen
   * la validez nativa (los de la extensión, o una traza antigua): ahí la
   * inferencia sí es correcta, porque un obligatorio vacío tras un envío ha
   * fallado seguro. Un obligatorio relleno y válido no entra por ninguna vía. */
  const enError = function (f) {
    if (f.invalid) return true;
    if (f.nativoInvalido) return true;
    if (f.nativoInvalido === false && f.vacio === false) return false;   // el navegador ya ha dicho que vale
    return !!(f.required && (f.vacio === undefined || f.vacio));
  };
  const bad = (trace.fields || []).filter(enError);
  // Sin campos en error no se sale en silencio: más abajo se dice que el envío
  // no disparó ninguna validación, que es información y no es conformidad.
  /* 3.3.1 pide que el error se DESCRIBA EN TEXTO, no que esté asociado por ARIA.
   *
   * La técnica suficiente **G83** se satisface con texto de error visible junto al
   * campo, sin asociación programática (eso es 1.3.1 y 4.1.2, que son otros
   * criterios y tienen sus propias filas). Mirando solo `aria-describedby`, un
   * formulario que hace lo que manda G83 —desocultar «Error: el correo es
   * obligatorio» al lado del campo, más un `role="alert"` con el resumen— salía con
   * un `falla` **grave** de 3.3.1. Una barrera inventada sobre contenido conforme,
   * que es lo que destruye la credibilidad de un informe delante de un cliente.
   *
   * Así que el texto cuenta venga de donde venga: de `aria-describedby`, de
   * `aria-errormessage` o del entorno del campo (`errorCercaText`, que el driver
   * recoge). Si no hay texto en ninguna parte, entonces sí es 3.3.1; si hay texto
   * pero sin asociar, es 4.1.2 a revisar. */
  const textoDe = function (f) {
    return [f.describedbyText, f.errormessageText, f.errorCercaText]
      .map(function (t) { return String(t || "").trim(); }).filter(Boolean).join(" ");
  };
  const sinTexto = bad.filter(function (f) { return !textoDe(f); });
  const textoSinAsociar = bad.filter(function (f) {
    return textoDe(f) && !(f.describedbyText || f.errormessageText || "").trim();
  });
  const sinInvalid = bad.filter(function (f) { return !f.invalid; });
  const hayAlerta = (trace.fields || []).some(function (f) { return f.hasAlert; }) || trace.hasAlert;
  /* Y «se anuncian» hay que haberlo VISTO anunciar.
   *
   * `hasAlert` era la simple existencia de un `[role=alert]` o `[aria-live]` en
   * cualquier parte del documento, vacío o no, relacionado con el error o no. Con
   * eso se emitía `3.3.1 cumple` y la evidencia «los errores se identifican en
   * texto, exponen aria-invalid **y se anuncian**»: tres afirmaciones, y ninguna
   * comprobada. El driver compara ahora el contenido de las regiones live antes y
   * después del envío (`liveCambio`); mientras no conste ese cambio, el criterio no
   * se cierra como conforme. */
  const anuncioVisto = trace.liveCambio === true;

  if (sinTexto.length) out.push(F("3.3.1", "falla", "grave", [sinTexto.length + " campo(s) con error sin ninguna descripción en texto —ni asociada (aria-describedby/errormessage) ni visible junto al campo—: " + sinTexto.slice(0, 6).map(function (f) { return f.locator; }).join(", ") + "."], nodesOf(sinTexto)));
  if (textoSinAsociar.length) out.push(F("4.1.2", "revisar", null, [textoSinAsociar.length + " campo(s) tienen el texto del error al lado pero sin asociar por ARIA: cumple 3.3.1 (técnica G83) y deja 4.1.2 y 1.3.1 por comprobar. Elementos: " + textoSinAsociar.slice(0, 6).map(function (f) { return f.locator; }).join(", ") + "."], nodesOf(textoSinAsociar)));
  if (sinInvalid.length) out.push(F("4.1.2", "revisar", null, [sinInvalid.length + " campo(s) en error sin <code>aria-invalid=\"true\"</code>: el estado de error no se expone a la API."], nodesOf(sinInvalid)));
  if (!hayAlerta) out.push(F("4.1.3", "revisar", null, ["No se detecta un mensaje de estado (role=alert / aria-live) al enviar: revisa que el error se anuncie sin mover el foco."]));
  else if (!anuncioVisto) out.push(F("4.1.3", "revisar", null, ["Hay una región de estado (role=alert / aria-live) en la página, pero su contenido no ha cambiado al enviar: que exista el contenedor no quiere decir que el error se anuncie. Compruébalo con un lector."]));

  /* Un envío en el que NO falla nada no dice nada sobre 3.3.1 — y eso hay que
   * decirlo, porque antes no se emitía nada en absoluto y un criterio ausente se
   * lee en el informe igual que uno conforme. Lo que se ha observado es que el
   * formulario se envió sin disparar ninguna validación: no había errores que
   * describir, así que el criterio no se ha podido comprobar en este envío. */
  if (!bad.length) {
    out.push(F("3.3.1", "revisar", null, [
      "Se envió el formulario y NINGÚN campo quedó en error (" + ((trace.fields || []).length) +
      " campo(s) revisados), así que no se ha podido comprobar cómo se identifican los errores: no hubo ninguno. " +
      "Pruébalo a mano con datos inválidos —un correo mal escrito, un obligatorio vacío— y comprueba que el error se describe en texto junto al campo."
    ]));
    return out;
  }
  if (!sinTexto.length && !sinInvalid.length) {
    if (anuncioVisto && !textoSinAsociar.length) {
      out.push(F("3.3.1", "cumple", null, ["Los errores se identifican en texto asociado al campo, exponen <code>aria-invalid</code>, y el anuncio se ha visto producirse: el contenido de la región de estado cambió al enviar."]));
    } else {
      /* Se ha medido lo medible y falta juicio: ni falla ni conforme.
       *
       * Y se dice QUÉ se ha medido, que no es lo mismo que lo que pide el criterio.
       * Lo observado es que al enviar apareció texto nuevo junto al campo; que ese
       * texto describa el error —y no sea otra cosa que salió a la vez— lo juzga una
       * persona leyéndolo. Escribir «el error está descrito en texto» sería afirmar
       * el criterio a partir de un indicio. */
      out.push(F("3.3.1", "cumple-parcial", null, [
        (textoSinAsociar.length
          ? "Al enviar apareció texto nuevo junto a " + textoSinAsociar.length + " campo(s) en error, sin asociar por ARIA — que es lo que admite la técnica G83. Lee ese texto y comprueba que identifica el error: «" +
            textoDe(textoSinAsociar[0]).slice(0, 120) + "»."
          : "Cada campo en error tiene texto de error asociado por ARIA.") +
        (anuncioVisto ? "" : " Y no se ha podido comprobar que el error se ANUNCIE: la región de estado no cambió de contenido al enviar, o no se pudo observar.")
      ], nodesOf(textoSinAsociar.length ? textoSinAsociar : bad)));
    }
  }
  return out;
}

/**
 * 3.2.1 Al recibir el foco · 3.2.2 Al recibir entradas.
 *
 * Los dos criterios dicen lo mismo con dos disparadores distintos: enfocar un
 * control (3.2.1) o cambiar su valor (3.2.2) NO puede provocar por sí solo un
 * cambio de contexto —navegar a otra página, abrir una ventana, mover el foco a
 * otro sitio, sustituir el contenido— si no se ha avisado antes.
 *
 * Esto es medible con lo que la capa dinámica ya hace: tabula y pulsa. Lo único
 * que faltaba era mirar qué pasa DESPUÉS de enfocar y después de cambiar, y las
 * tres señales son observables: la URL, dónde está el foco, y una huella del
 * contenido visible.
 *
 * @param {Array<{locator:string, uid:string, disparador:"foco"|"entrada",
 *                navego:boolean, focoMovido:boolean, contenidoCambio:boolean}>} eventos
 */
export function analyzeContextChange(eventos, noSondados, censo) {
  const out = [];
  /* Lo que NO se ha sondado sale en la evidencia y, cuando no hay nada que
   * reprochar, también en el veredicto.
   *
   * El driver recorta la lista de candidatos con un tope (veinte por defecto) y
   * antes no se lo contaba a nadie: en una página de sesenta controles se sondaban
   * veinte y el criterio salía `pasa`, que `esConforme()` trata como conformidad.
   * Cuarenta controles sin tocar y 3.2.1 exportado como conforme en el IRA.
   *
   * `cumple-parcial` es la palabra exacta para esto —la parte medida está bien, el
   * resto no se ha mirado— y `esConforme()` ya la excluye. */
  const fuera = (censo && censo.total > censo.sondados) ? censo.total - censo.sondados : 0;
  const cola = (noSondados
    ? " " + noSondados + " control(es) no se pudieron sondar (la página se recargó o cambió durante la prueba): quedan sin comprobar."
    : "") + (fuera
    ? " Quedan " + fuera + " de " + censo.total + " control(es) sin sondar por el tope de la prueba (súbelo con `maxContexto`): de esos no se sabe nada."
    : "");
  const porCrit = { foco: "3.2.1", entrada: "3.2.2" };
  ["foco", "entrada"].forEach(function (disp) {
    const crit = porCrit[disp];
    const propios = (eventos || []).filter(function (e) { return e.disparador === disp; });
    if (!propios.length) return;

    const graves = propios.filter(function (e) { return e.navego; });
    const medios = propios.filter(function (e) { return !e.navego && (e.focoMovido || e.contenidoCambio); });
    const verbo = disp === "foco" ? "al recibir el foco" : "al cambiar su valor";

    if (graves.length) {
      out.push(F(crit, "falla", "grave", [
        graves.length + " control(es) provocan una NAVEGACIÓN " + verbo + ", sin que medie ninguna acción de la persona: " +
        graves.slice(0, 5).map(function (e) { return e.locator; }).join(", ") +
        ". Es el caso que " + crit + " prohíbe expresamente." + cola
      ], graves.slice(0, 8).map(function (e) { return { locator: e.locator, name: "", path: e.uid }; })));
    }
    if (medios.length) {
      out.push(F(crit, "revisar", null, [
        medios.length + " control(es) cambian algo " + verbo + " sin activarlos: " +
        medios.slice(0, 5).map(function (e) {
          const q = [];
          if (e.focoMovido) q.push("el foco salta a otro sitio");
          if (e.contenidoCambio) q.push("cambia el contenido visible");
          return e.locator + " (" + q.join(" y ") + ")";
        }).join(" · ") +
        ". " + crit + " lo permite si se ha avisado antes de que iba a pasar: comprueba si hay ese aviso."
      ], medios.slice(0, 8).map(function (e) { return { locator: e.locator, name: "", path: e.uid }; })));
    }
    if (!graves.length && !medios.length) {
      // Sin nada que reprochar, el veredicto depende de si se miró TODO.
      const completo = !fuera && !noSondados;
      out.push(F(crit, completo ? "pasa" : "cumple-parcial", null, [
        "Se han probado " + propios.length + " control(es) y ninguno provoca navegación, salto de foco ni sustitución de contenido " + verbo + "." + cola
      ]));
    }
  });
  return out;
}

/**
 * 2.2.2 Poner en pausa, detener u ocultar — a partir de lo OBSERVADO.
 *
 * La medición sobre el render ve lo que el CSS declara: `animationName`,
 * `animationIterationCount`, `<marquee>`, `video[autoplay][loop]`. Lo que mueve
 * JavaScript no declara nada, y es la mayoría: medido en un sitio real, el
 * carrusel de la portada pasaba sin que el agente lo viera y en su lugar se acusó
 * a un icono con `fadeInDown`, que era lo único escrito en el CSS.
 *
 * Aquí el dato viene de un MutationObserver que ha estado mirando la página sin
 * tocarla, así que lo que se afirma es lo que pasó: tal elemento cambió N veces
 * entre el segundo X y el segundo Y sin que nadie hiciera nada.
 *
 * Los dos umbrales son los del criterio. Repartido más de CINCO segundos es lo que
 * 2.2.2 llama «lasts more than five seconds», y entonces, si no hay ningún control
 * para pararlo en toda la página, es una falla de nivel A. Entre 2,5 y 5 segundos
 * se observó movimiento pero no se llegó al umbral: eso se dice y se deja a
 * revisar, porque la ventana de observación se acabó, no el movimiento.
 */
export function analyzeAutoMovement(obs) {
  if (!obs || obs.error || !Array.isArray(obs.movidos)) return [];
  /* Haber mirado y no haber visto nada NO es lo mismo que no haber mirado, y
   * callarse hace que se parezcan.
   *
   * Esto devolvía lista vacía cuando la observación no encontraba movimiento, así que
   * en el informe no quedaba ni rastro de que se hubiera observado. Medido contra un
   * sitio real: 2.2.2 salió «sin determinar» en las diez páginas y lo único que había
   * escrito era un icono con `fadeInDown` que vio la capa de CSS — leyendo eso no hay
   * forma de saber si la observación miró ocho segundos y la página estaba quieta, o
   * si no llegó a correr. Ahora lo dice, con los segundos que miró y con lo que queda
   * fuera por haber mirado solo esa ventana. */
  if (!obs.movidos.length) {
    const seg0 = ((obs.ms || 0) / 1000).toFixed(1);
    return [F("2.2.2", "cumple-parcial", null, [
      "Observada la página " + seg0 + " s SIN tocar nada: ningún elemento cambia por su cuenta de forma repetida.",
      "Queda fuera lo que tarde más de " + seg0 + " s en empezar a moverse, lo que solo se mueva al interactuar, lo que se mueva dentro de un marco o un vídeo —que no emiten cambios en este documento— y el movimiento pintado en un <canvas>. Por eso es `cumple-parcial` y no `cumple`."
    ])];
  }
  const controles = obs.controles || [];
  const seg = function (ms) { return (ms / 1000).toFixed(1); };
  const comoSeLlama = function (x) {
    return x.loc + " (" + x.n + " cambios de «" + x.tipo + "» entre el segundo " + seg(x.primero) + " y el " + seg(x.ultimo) + ")";
  };
  /* «Dura más de cinco segundos» no es «el primero y el último cambio distan cinco
   * segundos»: es que SIGA moviéndose cuando dejamos de mirar.
   *
   * Lo escribí como la distancia entre el primer y el último cambio y la sonda lo
   * cazó enseguida: un carrusel que pasa de diapositiva cada 1,2 s observado durante
   * 7 s tiene su primer cambio en el segundo 1,2 y el último en el 6,0 —4,8 s de
   * distancia— y salía clasificado como movimiento que «no llega al umbral». No es
   * que no llegara: es que se acabó la ventana. Lo que distingue los dos casos es si
   * el último cambio cae junto al final de la observación, contando con que entre dos
   * cambios pasa un intervalo. */
  const sigueAlFinal = function (x) {
    const intervalo = x.n > 1 ? (x.ultimo - x.primero) / (x.n - 1) : (x.ultimo - x.primero);
    return x.ultimo >= obs.ms - intervalo - 500;
  };
  const sostenidos = obs.movidos.filter(function (x) { return x.ultimo >= 5000 && sigueAlFinal(x); });
  const breves = obs.movidos.filter(function (x) { return !(x.ultimo >= 5000 && sigueAlFinal(x)); });
  const out = [];
  const nodos = function (lista) { return lista.slice(0, 8).map(function (x) { return { locator: x.loc, name: "", path: x.uid }; }); };
  const conQue = controles.length
    ? " En la página hay " + controles.length + " control(es) que podrían servir para pararlo (" +
      controles.slice(0, 3).map(function (c) { return c.loc + ": «" + c.motivo + "»"; }).join(", ") +
      "): comprueba que de verdad paren ESTO y que se alcancen con el teclado."
    : " No se ha encontrado en toda la página ningún control de pausa, parada u ocultación (ni por nombre, ni por clase, ni controles nativos de vídeo o audio).";
  if (sostenidos.length) {
    out.push(F("2.2.2", controles.length ? "revisar" : "falla", controles.length ? null : "grave", [
      "Observando la página " + seg(obs.ms) + " s SIN tocar nada, " + sostenidos.length +
      " elemento(s) cambian solos de forma sostenida: " + sostenidos.slice(0, 4).map(comoSeLlama).join(" · ") + ".",
      "El movimiento arranca solo y se mantiene más de cinco segundos, que es el umbral de 2.2.2." + conQue
    ], nodos(sostenidos)));
  }
  if (breves.length) {
    out.push(F("2.2.2", "revisar", null, [
      "Se ha observado movimiento automático que NO llega al umbral de cinco segundos dentro de la ventana de observación (" +
      seg(obs.ms) + " s): " + breves.slice(0, 4).map(comoSeLlama).join(" · ") + ".",
      "Puede ser contenido que se carga al entrar y se queda quieto —y entonces 2.2.2 no dice nada— o movimiento que sigue más allá de lo que se miró. Lo distingue mirar la página unos segundos más." + conQue
    ], nodos(breves)));
  }
  return out;
}

/**
 * 2.1.4 Atajos de teclado de un carácter — a partir de lo PULSADO.
 *
 * El detector del ámbito de página solo ve los manejadores en línea
 * (`onkeydown="…"`), y hoy nadie los escribe así: un `addEventListener` dentro de un
 * bundle no está en el marcado. Resultado medido contra un sitio real: 2.1.4 era uno
 * de los siete criterios que no miraba ninguna capa, ni para bien ni para mal.
 *
 * Aquí el dato viene de pulsar la tecla con el foco en el cuerpo del documento —fuera
 * de cualquier campo— y mirar si pasa algo. Y lo que se puede concluir es exactamente
 * una de las tres salidas del criterio: si la tecla actúa con el foco en el cuerpo,
 * el atajo NO está limitado a un control. Las otras dos salidas —poder desactivarlo y
 * poder reasignarlo— viven en las preferencias del sitio y no se pueden comprobar
 * desde fuera, así que el veredicto es `revisar` y no `falla`: queda dicho qué tecla
 * hace qué, que es lo que una persona necesita para ir a buscar el interruptor.
 */
export function analyzeCharKeyShortcuts(res) {
  if (!res || !Array.isArray(res.probadas) || !res.probadas.length) return [];
  const probadas = res.probadas.map(function (t) { return "«" + t + "»"; }).join(", ");
  const cola = " Se han probado " + res.probadas.length + " tecla(s) (" + probadas +
    "), no todas: un atajo con otra tecla no se habría visto, así que esto no cierra el criterio por sí solo.";
  const activas = res.activas || [];
  if (!activas.length) {
    return [F("2.1.4", "cumple-parcial", null, [
      "Con el foco en el cuerpo del documento, ninguna de las teclas sueltas probadas hace nada: ni navega, ni mueve el foco, ni cambia lo que se ve, ni desplaza la página." + cola
    ])];
  }
  return [F("2.1.4", "revisar", null, [
    activas.length + " tecla(s) suelta(s) actúan con el foco en el CUERPO del documento, sin exigir Ctrl, Alt, Cmd ni Mayúsculas: " +
    activas.slice(0, 6).map(function (a) { return "«" + a.tecla + "» " + a.cambios.join(" y "); }).join(" · ") + ".",
    "Eso descarta una de las tres salidas que da 2.1.4: el atajo no está limitado al foco de un control, actúa en toda la página. Quedan las otras dos —que se pueda desactivar o reasignar—, y eso vive en las preferencias del sitio: compruébalo ahí. Si no hay ni interruptor ni reasignación, es una falla de nivel A." + cola
  ], activas.slice(0, 8).map(function (a) { return { locator: "tecla «" + a.tecla + "»", name: a.cambios.join("; ") }; }))];
}

/**
 * 4.1.3 Mensajes de estado — a partir del texto que APARECE al interactuar.
 *
 * El criterio ya se dictaminaba para un caso: el error de formulario, con el envío
 * forzado y la comparación de las regiones live antes y después. Pero en un sitio sin
 * formularios con error eso no emite nada, y 4.1.3 cubre mucho más: «información
 * sobre el éxito o el resultado de una acción, el estado de espera, el progreso de un
 * proceso o la existencia de errores». Medido contra un sitio real: 4.1.3 fue uno de
 * los siete criterios de los que no se dijo ni una palabra.
 *
 * Aquí el dato viene de los clics que la prueba dinámica ya hacía sobre los
 * `[aria-expanded]`: texto que apareció en OTRO sitio de la página —descontando el
 * panel que el propio control declara con `aria-controls`, que es contenido y no un
 * mensaje de estado—, sin que el foco se mueva hasta él y sin que ninguna región live
 * cambie de contenido. Ese es exactamente el patrón que 4.1.3 prohíbe.
 *
 * El veredicto es `revisar`, no `falla`, y el motivo es honesto: que ese texto SEA un
 * mensaje de estado —y no un trozo de interfaz que salió a la vez— lo decide alguien
 * leyéndolo. Lo que se afirma es lo observado: apareció, el foco no fue ahí, y ninguna
 * región de estado se enteró.
 */
export function analyzeStatusMessages(eventos, ctx) {
  const list = eventos || [];
  const c = ctx || {};
  if (!list.length) {
    /* No haber tenido nada que pulsar no es «no hay mensajes de estado».
     *
     * Es la tercera vez que aparece el mismo defecto —primero en 2.2.2, luego al dejar
     * 1.2.1 y 1.2.3 en blanco— y aquí se vio medido: la página de vídeos del sitio
     * real no tiene NI UN `[aria-expanded]`, así que la fase no pulsó nada, no hubo
     * candidatos, y 4.1.3 salió en blanco. Blanco no es «comprobado».
     *
     * Si no se sondeó nada, se dice. Y se dice también cuántas regiones de estado
     * declara la página, que es el dato que de verdad orienta: cero regiones en un
     * sitio con filtros y formularios es una pista fuerte, aunque no sea un veredicto. */
    if (c.expandibles === 0 || c.expandibles == null) {
      if (c.regiones == null) return [];
      return [F("4.1.3", "revisar", null, [
        "No se ha podido observar ningún mensaje de estado: la prueba dinámica no encontró controles expandibles que pulsar" +
        (c.expandibles === 0 ? " (0 elementos con `aria-expanded`)" : "") + ".",
        c.regiones
          ? "La página declara " + c.regiones + " región(es) de estado (`role=status` / `role=alert` / `aria-live`): comprueba con un lector que lo que anuncian es lo que la persona necesita oír cuando algo cambia."
          : "Y la página NO declara ninguna región de estado. Si al filtrar, buscar, enviar un formulario o navegar aparece algún mensaje de resultado, progreso o error, no hay nada que lo anuncie: eso sí sería una falla de 4.1.3. Compruébalo interactuando."
      ])];
    }
    return [F("4.1.3", "cumple-parcial", null, [
      "Se pulsaron " + c.expandibles + " control(es) expandible(s) y ninguno hizo aparecer texto nuevo fuera de su propio panel: no hay mensajes de estado desatendidos en lo que se ha podido probar.",
      "Queda fuera lo que aparezca al filtrar, buscar, enviar un formulario o navegar, que esta prueba no recorre." +
      (c.regiones ? " La página declara " + c.regiones + " región(es) de estado." : " La página no declara ninguna región de estado.")
    ])];
  }
  const mudos = list.filter(function (e) { return !e.liveCambio && !e.focoDentro; });
  if (!mudos.length) {
    const conLive = list.filter(function (e) { return e.liveCambio; }).length;
    return [F("4.1.3", "cumple-parcial", null, [
      "Al pulsar los controles expandibles apareció texto nuevo en " + list.length + " caso(s), y en todos ellos o cambió el contenido de una región de estado (" +
      conLive + ") o el foco se movió hasta el texto nuevo: ninguno queda sin anunciar.",
      "Queda por juzgar si ese texto es de verdad un mensaje de estado y si lo que anuncia la región es lo que la persona necesita oír; eso se comprueba con un lector de pantalla."
    ])];
  }
  const sinRegiones = mudos.every(function (e) { return !e.regiones; });
  return [F("4.1.3", "revisar", null, [
    mudos.length + " caso(s) en los que, al pulsar un control, apareció texto nuevo FUERA del panel que ese control gobierna, sin que el foco se moviera hasta él y sin que cambiara ninguna región de estado: " +
    mudos.slice(0, 4).map(function (e) {
      return "«" + e.locator + "» → «" + (e.textos || []).slice(0, 2).join(" / ").slice(0, 100) + "»";
    }).join(" · ") + ".",
    "Si ese texto informa del resultado de la acción, del progreso o de un error, es un mensaje de estado y 4.1.3 exige que se exponga con `role=\"status\"`, `role=\"alert\"` o `aria-live`, para que se anuncie sin robar el foco. Si es otra cosa —un trozo de interfaz que salió a la vez—, el criterio no dice nada: lo decide leerlo." +
    (sinRegiones ? " En estas páginas no hay NINGUNA región de estado declarada, así que si hay mensajes de estado, no se anuncian." : "")
  ], mudos.slice(0, 8).map(function (e) { return { locator: e.locator, name: (e.textos || [])[0] || "", path: (e.uids || [])[0] }; }))];
}
