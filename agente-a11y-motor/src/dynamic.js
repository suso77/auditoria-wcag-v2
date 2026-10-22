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

  /* 2.1.2 hablaba SOLO cuando encontraba la trampa.
   *
   * Si el recorrido con Tab daba la vuelta a la página entera sin quedarse
   * atrapado, esta función no emitía nada y el criterio desaparecía del informe
   * —hasta que el barrido de `audit-run` lo rescataba como «la capa se ejecutó y
   * no dijo nada de este criterio»—. Medido sobre el sitio de prueba con la capa
   * dinámica encendida: 2.1.2 salía `revisar` en las 19 páginas, incluidas las
   * que se recorren enteras sin un solo problema. El agente había hecho el
   * trabajo —tabular toda la página y comprobar que de todas partes se sale— y
   * no lo contaba.
   *
   * Lo que sí se puede afirmar y lo que no:
   *  · atrapado        → `falla`, con los controles del ciclo;
   *  · sin atrapar pero con el presupuesto de tabulaciones agotado → `revisar`,
   *    porque el recorrido se cortó antes de terminar y «no vi una trampa» no es
   *    «no hay trampa»;
   *  · recorrido completo sin atrapar → `cumple-parcial`, no `cumple`: esta
   *    prueba pulsa Tab, y dentro de un widget compuesto (tablist, listbox,
   *    menú) se navega con flechas, que es justo donde viven las trampas que
   *    Tab no ve. Se dice cuántos controles se recorrieron. */
  /* Los marcos atravesados se declaran SIEMPRE que los haya, pase lo que pase
   * con la trampa: dentro de un `<iframe>` esta sonda no ve —desde el documento
   * padre, mientras el foco recorre los controles de dentro, `activeElement`
   * sigue siendo el iframe—, así que lo que se afirme de 2.1.2 no cubre su
   * interior. Callarlo es firmar como comprobado lo que no se ha mirado. */
  const marcos = (trace.marcos || []).filter(Boolean);
  if (trace.trapped) {
    /* LAS DOS FORMAS DE TRAMPA NO SE CUENTAN IGUAL. Una se queda en UN control
     * —Tab vuelve una y otra vez al mismo— y la otra cicla entre varios. La
     * frase decía siempre «cicla entre N control(es)», y en la forma degenerada
     * `atrapadoEn` llegaba vacío, así que la segunda mitad desaparecía y la fila
     * se quedaba sin elemento al que señalar. */
    /* `atrapadoEn` viaja ahora como `{loc, ruta}` para que la fila lleve
     * SELECTOR y no solo un nombre legible: una barrera Crítica a la que nadie
     * puede ir no es reportable. Se acepta también la forma antigua —cadenas
     * sueltas— porque la usan las trazas de la suite pura y porque una capa que
     * se rompe al cambiarle la forma de un campo es una capa frágil. */
    const donde = (trace.atrapadoEn || []).filter(Boolean).map(function (x) {
      return typeof x === "string" ? { loc: x, ruta: "" } : { loc: x.loc || x.locator || "", ruta: x.ruta || x.path || "" };
    }).filter(function (x) { return x.loc; });
    out.push(F("2.1.2", "falla", "crítica", [
      (trace.mismoControl && donde.length === 1
        ? "El foco queda atrapado con Tab en «" + donde[0].loc + "»: pulsando Tab se vuelve una y otra vez al mismo control y no se puede salir de él solo con teclado, con " +
          unreached.length + " control(es) del resto de la página sin alcanzar."
        : "El foco queda atrapado con Tab: no se puede salir del componente solo con teclado." +
          (donde.length
            ? " El recorrido cicla entre " + donde.length + " control(es) —" + donde.slice(0, 6).map(function (x) { return x.loc; }).join(" → ") +
              "— y no vuelve a salir, con " + unreached.length + " control(es) del resto de la página sin alcanzar."
            : "")) +
      (marcos.length ? " Además el recorrido pasó por " + marcos.length + " marco(s) (" + marcos.slice(0, 3).join(", ") + ") cuyo interior esta prueba no ve." : "")
    ], donde.slice(0, 8).map(function (x) { return { locator: x.loc, path: x.ruta, name: "" }; })));
  } else if (!focusables.length) {
    out.push(F("2.1.2", "no-aplica", null, [
      "La página no tiene ningún control enfocable, así que no hay foco que pueda quedar atrapado."
    ]));
  } else if (trace.exhausted) {
    out.push(F("2.1.2", "revisar", null, [
      "El recorrido con Tab se cortó antes de terminar: el presupuesto de " + (trace.tabs || 0) +
      " tabulación(es) no llegaba para los " + focusables.length + " control(es) enfocables de la página. " +
      "No se ha visto ninguna trampa, pero no verla sin haber recorrido el camino entero no es haber comprobado que no la hay." +
      /* Y si el recorrido se agotó habiendo pasado por un marco, eso es
       * justamente lo que hay que ir a mirar: una trampa DENTRO del marco es
       * indistinguible, desde fuera, de un marco con muchos controles. */
      (marcos.length
        ? " El recorrido pasó por " + marcos.length + " marco(s) (" + marcos.slice(0, 3).join(", ") +
          ") y esta prueba no ve dentro de ellos: desde el documento padre, mientras el foco va por los controles de dentro, el elemento activo sigue siendo el marco. Si el recorrido se agotó ahí, una trampa dentro del marco y un marco con muchos controles se parecen desde fuera. Compruébalo a mano tabulando dentro."
        : "")
    ]));
  } else {
    /* «94 de 93 control(es) alcanzados.»
     *
     * Eso salía en un sitio real, y leído así parece una cuenta mal hecha. No lo
     * es: el censo se toma ANTES de tabular y el recorrido alcanza lo que haya
     * en ese momento, así que un control que se vuelve enfocable durante el
     * camino —un menú que se despliega al recibir el foco su botón— se alcanza
     * sin estar censado. Medido con una página de respuesta sabida (un botón que
     * al enfocarse añade tres enlaces): 5 alcanzados de 2 censados.
     *
     * Así que el número no se toca, se explica — y además es información que
     * interesa, porque dice que la página cambia al tabularla. */
    const alcanzados = (trace.reached || []).length;
    const aparecidos = alcanzados - focusables.length;
    /* Un marco atravesado LIMITA ESTA AFIRMACIÓN, y es la afirmación peligrosa:
     * aquí se dice «el foco sale de todos ellos: no hay trampa». De los controles
     * de dentro del marco no se ha salido ni se ha entrado — no se han visto. */
    const avisoMarcos = marcos.length
      ? "Y no cubre el interior de " + marcos.length + " marco(s) por los que pasó el foco (" + marcos.slice(0, 3).join(", ") +
        "): desde el documento padre, mientras el foco recorre los controles de dentro, el elemento activo sigue siendo el marco, así que de ahí no se ha comprobado nada. Tabula dentro a mano."
      : null;
    out.push(F("2.1.2", "cumple-parcial", null, [
      "Se ha recorrido la página con Tab —" + alcanzados + (aparecidos > 0
        ? " control(es) alcanzados, " + aparecidos + " más de los " + focusables.length +
          " que estaban censados antes de empezar: alguno se ha vuelto enfocable durante el recorrido" +
          " (un menú que se despliega al recibir el foco, por ejemplo)"
        : " de " + focusables.length + " control(es) alcanzados") +
      " en " + (trace.tabs || 0) + " tabulación(es)— y el foco sale de todos ellos: no hay trampa en el recorrido de tabulación.",
      "Queda lo que esta prueba no toca: dentro de un widget compuesto (pestañas, listbox, menú) se navega con las FLECHAS, y una trampa ahí no la ve el Tab. Si la página tiene alguno, compruébalo a mano."
    ].concat(avisoMarcos ? [avisoMarcos] : [])));
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

    /* TRES CAUSAS DURAS, NO UNA.
     *
     * Aquí solo contaba `navego`, y eso dejaba fuera dos fallos con nombre y
     * apellidos. Medido sobre una página con los cuatro casos escritos en los
     * atributos: `onfocus="window.open('/cal')"` abría una ventana de verdad
     * —el evento `popup` de Playwright se dispara— y `onfocus="this.blur()"`
     * quitaba el foco nada más recibirlo, y la capa dinámica emitía
     * «se han probado 9 control(es) y ninguno provoca navegación, salto de foco
     * ni sustitución de contenido», es decir `pasa`, en una página que falla
     * 3.2.1 dos veces. Una frase falsa en la evidencia y, peor, un criterio
     * declarado conforme sin serlo: lo que la regla de oro prohíbe.
     *
     * Por qué se escapaban: la URL no cambia al abrir una ventana nueva, y el
     * foco perdido deja `document.activeElement` en `<body>`, que la huella
     * leía como «sin foco» y el filtro `!== null` descartaba — un guardia
     * puesto para no acusar a los controles que NO pueden recibir el foco,
     * donde `el.focus()` no mueve nada. Ahora el driver escucha el evento
     * `focus` del propio elemento, así que distingue «lo recibió y lo perdió»
     * de «no pudo recibirlo», y cuenta las ventanas que se abren. */
    const graves = propios.filter(function (e) { return e.navego || e.abrioVentana || e.focoQuitado; });
    const medios = propios.filter(function (e) { return !(e.navego || e.abrioVentana || e.focoQuitado) && (e.focoMovido || e.contenidoCambio); });
    const verbo = disp === "foco" ? "al recibir el foco" : "al cambiar su valor";

    if (graves.length) {
      const causa = function (e) {
        const q = [];
        if (e.navego) q.push("NAVEGA a otra página");
        if (e.abrioVentana) q.push("ABRE UNA VENTANA nueva");
        if (e.focoQuitado) q.push("recibe el foco y lo SUELTA, dejándolo en ningún sitio");
        return e.locator + " (" + q.join(" y ") + ")";
      };
      const tecnicas = [];
      if (graves.some(function (e) { return e.navego; })) tecnicas.push(disp === "foco" ? "F52" : "F37");
      if (graves.some(function (e) { return e.abrioVentana; })) tecnicas.push("F52");
      if (graves.some(function (e) { return e.focoQuitado; })) tecnicas.push("F55");
      out.push(F(crit, "falla", "grave", [
        graves.length + " control(es) provocan un cambio de contexto " + verbo + ", sin que medie ninguna acción de la persona: " +
        graves.slice(0, 5).map(causa).join(" · ") +
        ". Es el caso que " + crit + " prohíbe expresamente" +
        (tecnicas.length ? " (fallo" + (tecnicas.length > 1 ? "s " : " ") + tecnicas.filter(function (t, i, a) { return a.indexOf(t) === i; }).join(", ") + ")" : "") +
        "." + cola
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
 * 3.3.3 Sugerencias ante errores — sobre el MENSAJE que se vio de verdad.
 *
 * El cuaderno de juicio dejaba este criterio con una frase honesta: «este
 * criterio va del CONTENIDO del mensaje, y eso hay que leerlo». Pero el mensaje
 * ya lo tenemos: la capa dinámica envía el formulario en modo seguro y se trae
 * el texto que apareció —de `aria-describedby`, de `aria-errormessage` o del
 * entorno del campo—. Lo que faltaba era leerlo.
 *
 * LA DISTINCIÓN QUE HACE QUE ESTO NO SEA RUIDO: 3.3.3 pide una sugerencia
 * «cuando se conoce». Un obligatorio vacío se corrige rellenándolo y el propio
 * «este campo es obligatorio» ya dice cómo; ahí no hay nada que reprochar. Un
 * formato incumplido es otra cosa: el formato esperado lo conoce la página,
 * porque está escrito en sus propios atributos (`type`, `pattern`, `minlength`,
 * `min`/`max`), así que un mensaje que solo diga «campo inválido» incumple. El
 * navegador dice cuál de las dos cosas ha pasado (`ValidityState`), y por eso
 * esto se puede decidir sin adivinar.
 *
 * El veredicto es `revisar`, nunca `falla`: que una sugerencia sea SUFICIENTE lo
 * juzga una persona, y puede estar fuera del mensaje —en una pista junto al
 * campo, en una ayuda de la página—. Lo que no se puede es firmar el criterio
 * sin haber leído el mensaje, ni callarlo cuando el mensaje leído no sugiere
 * nada.
 */
const FORMATO_FALLADO = { typeMismatch: 1, patternMismatch: 1, tooShort: 1, tooLong: 1, rangeUnderflow: 1, rangeOverflow: 1, stepMismatch: 1, badInput: 1 };
const COMO_SE_DICE_LA_CAUSA = {
  valueMissing: "está vacío y es obligatorio", typeMismatch: "no tiene la forma que pide su tipo",
  patternMismatch: "no encaja con el patrón declarado", tooShort: "es más corto que el mínimo",
  tooLong: "es más largo que el máximo", rangeUnderflow: "está por debajo del mínimo",
  rangeOverflow: "está por encima del máximo", stepMismatch: "no cae en uno de los pasos permitidos",
  badInput: "no se puede interpretar"
};
/* Lo que cuenta como SUGERENCIA en un mensaje, en español y en inglés.
 *
 * No es «sentimiento»: son las formas con las que de verdad se dice un formato
 * esperado. Un ejemplo («ej. nombre@dominio.es»), una regla («debe tener al
 * menos 8 caracteres»), un formato («dd/mm/aaaa»), un rango («entre 1 y 99») o
 * una instrucción («incluye una mayúscula»). Si no hay ninguna de estas y el
 * campo falló por formato, el mensaje dice QUÉ pasa y no CÓMO arreglarlo. */
const SUGIERE = [
  /\bpor ejemplo\b|\bej(\.|emplo)\b|\be\.g\.|\bfor example\b/i,
  /\bformato\b|\bformat\b|\bdd\s*\/\s*mm|\baaaa\b|\byyyy\b|\bmm\s*\/\s*aa/i,
  /\bdebe\b|\bdeben\b|\btiene que\b|\btienen que\b|\bmust\b|\bshould\b|\bneeds? to\b/i,
  /\bal menos\b|\bcomo m[ií]nimo\b|\bm[ií]nimo\b|\bm[áa]ximo\b|\bat least\b|\bminimum\b|\bmaximum\b/i,
  /\bentre \d+ y \d+\b|\bbetween \d+ and \d+\b/i,
  /\bincluy[ae]\b|\bincluir\b|\binclude\b|\bcontain\b|\bcontenga\b/i,
  /\bcaracteres\b|\bcharacters\b|\bd[ií]gitos\b|\bdigits\b|\bletras\b|\bletters\b|\bmay[úu]scula\b|\buppercase\b|\bmin[úu]scula\b|\blowercase\b|\bs[íi]mbolo\b|\bsymbol\b/i,
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\busa\b|\butiliza\b|\bescribe\b|\bintroduce\b.*\b(con|en el formato|sin)\b|\benter\b.*\b(in|with|without)\b/i
];
function mensajeSugiere(t) {
  const s = String(t || "");
  for (let i = 0; i < SUGIERE.length; i++) if (SUGIERE[i].test(s)) return true;
  return false;
}

export function analyzeSuggestions(trace) {
  const out = [];
  if (!trace || !trace.submitted) return out;
  const campos = (trace.fields || []).filter(function (f) {
    return f && (f.invalid || f.nativoInvalido || (f.required && f.vacio));
  });
  if (!campos.length) return out;

  const textoDe = function (f) {
    return [f.describedbyText, f.errormessageText, f.errorCercaText]
      .map(function (t) { return String(t || "").trim(); }).filter(Boolean).join(" · ");
  };
  const comoSeLlama = function (f) { return f.locator + (f.etiqueta ? " «" + f.etiqueta + "»" : (f.name ? " «" + f.name + "»" : "")); };

  const deFormato = campos.filter(function (f) { return FORMATO_FALLADO[f.causa]; });
  /* Los que TIENEN restricción de formato y aun así no acabaron en error: en
   * esos no se pudo provocar el fallo, y hay que decirlo. Pasa de verdad con
   * `minlength`/`maxlength`: el navegador solo marca `tooShort`/`tooLong` cuando
   * el valor lo ha escrito una persona, no cuando se pone por programa, así que
   * un campo con `minlength="8"` no se puede provocar desde aquí. Callarlo haría
   * leer «se probó el formulario» como «se probó todo». */
  const sinProvocar = (trace.fields || []).filter(function (f) {
    if (!f || !f.restricciones || !f.restricciones.length) return false;
    return !FORMATO_FALLADO[f.causa];
  });
  const cola = sinProvocar.length
    ? " En " + sinProvocar.length + " campo(s) con restricción no se pudo provocar el error de formato desde la prueba (" +
      sinProvocar.slice(0, 4).map(function (f) { return f.locator + " [" + f.restricciones.join(", ") + "]"; }).join(", ") +
      "): de esos no se sabe qué mensaje dan. El caso típico es `minlength`, que el navegador solo marca cuando el valor lo escribe una persona."
    : "";
  const sinSugerencia = deFormato.filter(function (f) { return !mensajeSugiere(textoDe(f) + " " + (f.mensajeNativo || "")); });
  const conSugerencia = deFormato.filter(function (f) { return mensajeSugiere(textoDe(f) + " " + (f.mensajeNativo || "")); });
  const soloVacios = campos.length - deFormato.length;

  if (sinSugerencia.length) {
    out.push(Object.assign(F("3.3.3", "revisar", null, [
      sinSugerencia.length + " campo(s) fallaron por FORMATO y el mensaje que apareció no dice cómo corregirlo: " +
      sinSugerencia.slice(0, 4).map(function (f) {
        const t = textoDe(f) || (f.mensajeNativo ? "(sin mensaje propio; el navegador diría «" + f.mensajeNativo.slice(0, 60) + "»)" : "(sin mensaje de ninguna clase)");
        return comoSeLlama(f) + " — " + (COMO_SE_DICE_LA_CAUSA[f.causa] || f.causa) +
          (f.restricciones && f.restricciones.length ? " [" + f.restricciones.join(", ") + "]" : "") + ": «" + String(t).slice(0, 90) + "»";
      }).join(" · ") +
      ". El formato esperado lo conoce la página —está en sus propios atributos—, así que 3.3.3 pide decirlo: un ejemplo, " +
      "la regla («al menos 8 caracteres») o el formato («dd/mm/aaaa»). No sale como falla porque la sugerencia puede estar " +
      "fuera del mensaje, en una pista junto al campo o en la ayuda de la página: eso lo juzga una persona con esto delante." + cola
    ], sinSugerencia.slice(0, 8).map(function (f) { return { locator: f.locator, name: f.etiqueta || f.name || "" }; })), { origen: "dinámico" }));
  }
  if (conSugerencia.length && !sinSugerencia.length) {
    out.push(Object.assign(F("3.3.3", "cumple-parcial", null, [
      "Los " + conSugerencia.length + " campo(s) que fallaron por formato traen un mensaje que apunta al formato esperado: " +
      conSugerencia.slice(0, 3).map(function (f) { return comoSeLlama(f) + ": «" + String(textoDe(f) || f.mensajeNativo).slice(0, 80) + "»"; }).join(" · ") +
      ". `cumple-parcial` y no `cumple`: que la sugerencia sea SUFICIENTE y correcta lo juzga una persona" +
      (soloVacios ? ". Y los otros " + soloVacios + " campo(s) fallaron por estar vacíos, donde la corrección es rellenarlos y no hay más que sugerir" : "") + "." + cola
    ]), { origen: "dinámico" }));
  }
  if (!deFormato.length && campos.length) {
    out.push(Object.assign(F("3.3.3", "cumple-parcial", null, [
      "El envío solo produjo errores de campo VACÍO (" + campos.length + "), que se corrigen rellenándolos: ahí 3.3.3 no exige más sugerencia que decir que falta. " +
      "Lo que no se ha podido probar es qué dice la página cuando un campo se rellena MAL —con un formato que no encaja—, porque el modo seguro no inventa datos. " +
      "Eso es lo que hay que comprobar a mano, y es donde este criterio suele fallar." + cola
    ]), { origen: "dinámico" }));
  }
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
    const libs = obs.carruseles || [];
    /* NO HABER VISTO MOVERSE UN CARRUSEL NO ES QUE NO SE MUEVA.
     *
     * Esto lo destapó comparar dos pasadas de la misma página: `teatro_real.html`
     * dio `cumple-parcial` —«observada 8,0 s: ningún elemento cambia por su
     * cuenta»— en una pasada y `falla` grave en la siguiente, con tres elementos
     * de Swiper cambiando entre el segundo 2,4 y el 7,7. El carrusel es el
     * mismo: lo que cambió es cuándo arrancó, porque Swiper espera a que carguen
     * las imágenes. El veredicto de un criterio de nivel A dependía del tiempo
     * de carga.
     *
     * Así que si la página TRAE un carrusel y no se le ha visto moverse, el
     * veredicto baja a `revisar` y se dice qué se encontró. `cumple-parcial`
     * ahí es casi una absolución, y absolver por no haber mirado bastante es
     * exactamente lo que este proyecto persigue. */
    if (libs.length) {
      const comoEs = libs.map(function (x) { return x.sel + " ×" + x.n; }).join(", ");
      return [F("2.2.2", "revisar", null, [
        "Observada la página " + seg0 + " s SIN tocar nada y NO se le ha visto mover nada por su cuenta — pero la página trae un carrusel: " + comoEs + ".",
        "Un carrusel que no arranca dentro de la ventana de observación no es un carrusel quieto: Swiper y compañía esperan a que carguen las imágenes, así que con la red lenta empiezan más tarde. Medido sobre un sitio real, la MISMA página dio «nada se mueve» en una pasada y tres elementos moviéndose entre el segundo 2,4 y el 7,7 en la siguiente. Compruébalo a mano, o repite la pasada con `movimientoMs` más alto."
      ])];
    }
    return [F("2.2.2", "cumple-parcial", null, [
      "Observada la página " + seg0 + " s SIN tocar nada: ningún elemento cambia por su cuenta de forma repetida, y no hay ningún carrusel declarado en el marcado.",
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
 *
 * — v0.60.0: LA SONDA NO PUEDE ABSOLVER SOLA ——————————————————————————————————
 *
 * Esta era la segunda de las dos cosas que se movían entre pasadas del mismo sitio
 * (la primera, el carrusel de 2.2.2, se arregló en v0.59.0). Y al medirla con
 * fixtures salieron los dos errores, los dos deterministas:
 *
 *   · una página que crece sola cada 300 ms, SIN un solo manejador de teclado, hacía
 *     que se acusara a tres o cuatro teclas de ser atajos de página. Un falso
 *     positivo entero, y además inestable: dependía de si el cambio caía dentro de
 *     los 260 ms de la ventana;
 *   · un atajo de página REAL —el típico guardado con «si el target es un campo, no
 *     hagas nada»— detrás de un modal que se vuelve a enfocar solo salía
 *     `cumple-parcial`, porque la tecla se la comía el campo de texto. Y el informe
 *     afirmaba «con el foco en el cuerpo del documento» sin haberlo comprobado.
 *
 * Las dos salen del mismo agujero: la sonda no medía las condiciones de su propia
 * medida. Ahora sí, y de las dos maneras. Cada tecla lleva emparejada una VENTANA EN
 * BLANCO —los mismos 260 ms sin pulsar nada— que dice qué señales se mueven por su
 * cuenta; un cambio en una señal con ruido no se le atribuye a la tecla. Y el foco se
 * comprueba en el instante de pulsar, no al pedirlo.
 *
 * De ahí las cuatro cuentas: teclas que actúan (con el foco comprobado y sin ruido),
 * teclas descartadas por ruido, teclas pulsadas con el foco en otro sitio, y teclas
 * limpias sin cambio. Solo las últimas sostienen una absolución, y basta que haya
 * ruido o foco secuestrado para que no la sostengan: entonces es `revisar`, que es
 * pedir que lo mire alguien, no decir que está bien.
 */
export function analyzeCharKeyShortcuts(res) {
  if (!res || !Array.isArray(res.probadas) || !res.probadas.length) return [];
  const probadas = res.probadas.map(function (t) { return "«" + t + "»"; }).join(", ");
  const cola = " Se han probado " + res.probadas.length + " tecla(s) (" + probadas +
    "), no todas: un atajo con otra tecla no se habría visto, así que esto no cierra el criterio por sí solo.";
  const activas = res.activas || [];
  const descartadas = res.descartadas || [];
  const fuera = res.fueraDelCuerpo || [];
  const limpias = res.limpias || [];
  const ruido = res.ruido || [];

  const COMO = { url: "la dirección", red: "las peticiones de red", foco: "el foco",
    scroll: "el desplazamiento", pintura: "lo que se ve en pantalla" };
  const comoEsElRuido = ruido.map(function (s) { return COMO[s] || s; }).join(" y ");
  const notaRuido = ruido.length
    ? " La página se mueve sola: en las ventanas de control, sin pulsar ninguna tecla, ya cambia " + comoEsElRuido + "." +
      (descartadas.length
        ? " Por eso " + descartadas.length + " tecla(s) que parecían hacer algo (" +
          descartadas.map(function (d) { return "«" + d.tecla + "»"; }).join(", ") + ") NO se cuentan: el mismo cambio ocurre sin tocar nada, y atribuírselo a la tecla sería inventarse un atajo."
        : "")
    : "";
  const notaFoco = fuera.length
    ? " Y " + fuera.length + " tecla(s) (" + fuera.map(function (f) { return "«" + f.tecla + "»"; }).join(", ") +
      ") se pulsaron con el foco en «" + fuera[0].quien + "» y no en el cuerpo del documento: ahí el campo se come la tecla, así que no dicen nada del ámbito del atajo."
    : "";
  /* LAS DUDOSAS: parecieron hacer algo UNA VEZ y no lo repitieron.
   *
   * El testigo emparejado sabe ver una página que se mueve continuamente y no ve
   * una que se mueve una sola vez: si ese único cambio cae dentro de la ventana
   * con tecla, ningún testigo lo ha visto y se le atribuía a la tecla. Medido con
   * una página sin un solo manejador de teclado que añade seis elementos a los
   * 400 ms: «la tecla "/" cambia qué se ve». Ahora lo acusado se vuelve a pulsar,
   * y si la señal no reaparece la tecla cae aquí: ni acusada —no hay prueba— ni
   * absuelta, porque un atajo de un solo uso (un modal que se abre y se queda
   * abierto) también deja de producir cambios al segundo intento. */
  const dudosas = res.dudosas || [];
  const notaDudosas = dudosas.length
    ? " Y " + dudosas.length + " tecla(s) (" + dudosas.map(function (d) { return "«" + d.tecla + "»"; }).join(", ") +
      ") produjeron un cambio UNA VEZ que no se repitió al volver a pulsarlas (" +
      dudosas[0].cambios.join(" y ") + "): puede ser la página moviéndose sola justo en ese instante, o un atajo de un solo uso que ya no vuelve a cambiar nada. No se acusan, porque un cambio que no se repite no prueba un atajo; y no se absuelven, porque tampoco lo descarta. Pulsa esas teclas a mano con el foco fuera de cualquier campo."
    : "";

  if (activas.length) {
    return [F("2.1.4", "revisar", null, [
      activas.length + " tecla(s) suelta(s) actúan con el foco COMPROBADO en el cuerpo del documento, sin exigir Ctrl, Alt, Cmd ni Mayúsculas, y con un cambio que no ocurre sin pulsarlas: " +
      activas.slice(0, 6).map(function (a) { return "«" + a.tecla + "» " + a.cambios.join(" y "); }).join(" · ") + ".",
      "Eso descarta una de las tres salidas que da 2.1.4: el atajo no está limitado al foco de un control, actúa en toda la página. Quedan las otras dos —que se pueda desactivar o reasignar—, y eso vive en las preferencias del sitio: compruébalo ahí. Si no hay ni interruptor ni reasignación, es una falla de nivel A." + cola + notaRuido + notaFoco + notaDudosas
    ], activas.slice(0, 8).map(function (a) { return { locator: "tecla «" + a.tecla + "»", name: a.cambios.join("; ") }; }))];
  }

  /* Ninguna tecla actúa de forma atribuible. Eso solo vale como «no hay atajos de un
   * carácter» si la medida se pudo hacer en condiciones; si no, se dice que no se pudo. */
  if (ruido.length || fuera.length || dudosas.length || !limpias.length) {
    const porque = [];
    if (ruido.length) porque.push("la página cambia " + comoEsElRuido + " por su cuenta, así que un cambio al pulsar no se le puede atribuir a la tecla");
    if (fuera.length) porque.push("el foco no estaba en el cuerpo del documento al pulsar " + fuera.length + " de las " + res.probadas.length + " teclas");
    /* Una dudosa no puede acabar en conforme: hubo un cambio y no se sabe de
     * quién. Esta es la rama de «no se ha podido comprobar», que es la verdad. */
    if (dudosas.length) porque.push(dudosas.length + " tecla(s) produjeron un cambio que no se repitió, y un cambio que no se repite no prueba un atajo ni lo descarta");
    if (!limpias.length) porque.push("ninguna tecla llegó a probarse en condiciones limpias");
    return [F("2.1.4", "revisar", null, [
      "NO se ha podido comprobar si la página tiene atajos de un solo carácter: " + porque.join("; ") + ".",
      "Y no haber podido medirlo no es haberlo medido bien: por eso esto no sale como conforme. Compruébalo a mano —pulsa «/», «s» o «f» con el foco fuera de cualquier campo y mira si pasa algo— o repite la pasada sobre un estado quieto de la página." + cola + notaRuido + notaFoco + notaDudosas
    ])];
  }

  return [F("2.1.4", "cumple-parcial", null, [
    "Con el foco COMPROBADO en el cuerpo del documento, ninguna de las " + limpias.length +
    " tecla(s) sueltas probadas hace nada: ni navega, ni mueve el foco, ni cambia lo que se ve, ni desplaza la página. Y las ventanas de control confirman que la página no se mueve sola, así que la ausencia de cambio significa lo que parece." + cola
  ])];
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
