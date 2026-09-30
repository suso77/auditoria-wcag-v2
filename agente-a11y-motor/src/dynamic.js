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
  const bad = (trace.fields || []).filter(function (f) { return f.required || f.invalid; });
  if (!bad.length) return out;
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
