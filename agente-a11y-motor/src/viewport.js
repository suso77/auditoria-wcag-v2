/**
 * Adaptación del contenido — análisis PURO de las trazas de viewport.
 *
 * Cinco criterios que el motor marcaba `revisar` a ciegas, sin mirar nada, y que
 * en realidad son MECÁNICOS: se aplica un cambio (estrechar, agrandar el texto,
 * forzar el espaciado, girar) y se mide qué se rompe. Es exactamente el
 * procedimiento manual de la Guía Técnica del OAW —el bookmarklet de Text
 * Spacing, el zoom al 400 %— hecho por el agente.
 *
 *   1.4.4  Redimensionar el texto        (AA)
 *   1.4.10 Reflujo                       (AA)
 *   1.4.12 Espaciado del texto           (AA)
 *   1.4.13 Contenido al recibir foco o puntero (AA)
 *   1.3.4  Orientación                   (AA)
 *
 * El principio de siempre: estas funciones distinguen «lo he medido y está mal»
 * de «no he podido medirlo». Un recorte medido es `falla`; una excepción posible
 * o una traza incompleta es `revisar`.
 */
import { WCAG22, enClause } from "./engine.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "AA") }; }
function F(n, verdict, sev, evid, nodes) {
  const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "adaptación", origen: "medición", en: enClause(n) };
  if (nodes && nodes.length) f.nodes = nodes;
  return f;
}
/* El `uid` de la sonda es un selector canónico, y viaja al hallazgo como `path`.
 *
 * Sin él, las barreras de esta capa salían al CSV con la columna «Selector» VACÍA y
 * un locator que no distingue: cinco filas de 1.4.13 diciendo `li.float-left` y
 * nada con que ir a buscarlas. Una barrera que no se puede localizar no se puede
 * arreglar ni comprobar. */
function nodesOf(list, max) {
  return (list || []).slice(0, max || 10).map(function (x) {
    const n = { locator: x.locator, name: x.detalle || "" };
    if (x.uid) n.path = x.uid;
    return n;
  });
}

/**
 * Contenido que la propia WCAG exime de reflujo por «uso esencial»: lo que pierde
 * sentido si se reorganiza en una columna. No es una falla automática, pero
 * tampoco un aprobado: lo marcamos para que una persona confirme la excepción.
 */
export const EXENTOS_REFLUJO = ["table", "img", "svg", "canvas", "iframe", "video", "object", "embed", "pre", "code"];
function esExento(o) {
  if (EXENTOS_REFLUJO.indexOf(String(o.tag || "").toLowerCase()) !== -1) return true;
  const r = String(o.role || "").toLowerCase();
  return r === "img" || r === "table" || r === "grid" || r === "treegrid" || r === "application";
}

/**
 * 1.4.10 Reflujo: a 320 px CSS de ancho (equivale al 400 % sobre 1280) el
 * contenido no puede exigir desplazamiento horizontal.
 * @param {{ w:number, h:number, scrollWidth:number, clientWidth:number,
 *           offenders?:Array<{locator:string, tag?:string, role?:string, ancho?:number, detalle?:string}> }} trace
 */
export function analyzeReflow(trace) {
  if (!trace || trace.clientWidth == null) return [];
  const exceso = Math.round(trace.scrollWidth - trace.clientWidth);
  const donde = " a " + trace.w + "×" + trace.h + " px CSS";
  /* El contenido RECORTADO cuenta, y cuenta antes que la barra.
   *
   * Dictaminando solo por el desplazamiento horizontal, un desbordamiento escondido
   * con `overflow:hidden` no produce barra, `scrollWidth` del documento no crece, y
   * 1.4.10 salía «cumple» con cientos de píxeles de texto ocultos e inalcanzables a
   * 320 px CSS. El criterio no habla de barras: exige que no haya pérdida de
   * información ni de funcionalidad. Esconder lo que no cabe es peor que la barra,
   * porque ni se ve que falte algo. */
  const rec = (trace.recortados || []).filter(function (r) { return !r.alcanzable; });
  if (rec.length) {
    return [F("1.4.10", "falla", "grave", [
      rec.length + " bloque(s) de contenido se RECORTAN" + donde + " y lo que sobra no se puede alcanzar: el desbordamiento está oculto con " +
      "`overflow:" + rec[0].overflow + "`, así que no hay barra ni forma de desplazarlo. " +
      rec.slice(0, 6).map(function (r) { return r.locator + " (" + r.px + " px ocultos, termina en «…" + r.muestra + "»)"; }).join(" · ") +
      (rec.length > 6 ? " · …" : "") + ". 1.4.10 exige que no haya pérdida de información, no solo que no haya barra horizontal."
    ], nodesOf(rec))];
  }
  if (exceso <= 2) {
    const tapado = (trace.recortados || []).filter(function (r) { return r.alcanzable; });
    if (tapado.length) {
      return [F("1.4.10", "revisar", null, [
        "Sin desplazamiento horizontal" + donde + ", pero " + tapado.length + " contenedor(es) esconden contenido que no les cabe (" +
        tapado.slice(0, 4).map(function (r) { return r.locator + ", " + r.px + " px"; }).join(" · ") +
        "). Tienen controles dentro, así que el teclado sí arrastra el contenedor al enfocarlos; comprueba que con el ratón y a la vista también se llegue, porque no hay barra."
      ], nodesOf(tapado))];
    }
    return [F("1.4.10", "cumple", null, ["Sin desplazamiento horizontal ni contenido recortado" + donde + " (equivale al 400 % sobre 1280 px)."])];
  }
  const off = trace.offenders || [];
  const todosExentos = off.length > 0 && off.every(esExento);
  if (todosExentos) {
    return [F("1.4.10", "revisar", null, [
      "Hay " + exceso + " px de desplazamiento horizontal" + donde + ", pero todo lo que desborda es contenido que WCAG puede eximir por uso esencial (" +
      off.slice(0, 6).map(function (o) { return o.locator; }).join(", ") + "). Confirma que la excepción aplica."
    ], nodesOf(off))];
  }
  return [F("1.4.10", "falla", "grave", [
    "El contenido exige desplazamiento horizontal" + donde + ": " + exceso + " px de exceso. " +
    (off.length ? "Desbordan " + off.length + " elemento(s): " + off.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (off.length > 6 ? "…" : "") : "No se ha podido señalar el elemento concreto.")
  ], nodesOf(off))];
}

// Recorte medido: el elemento no cabía y su desbordamiento queda OCULTO. Si
// desborda con barra de desplazamiento, el contenido sigue siendo alcanzable.
function informeRecorte(n, etiqueta, cambio, trace, sevFalla) {
  // Sin traza no hay nada que decir: el criterio no se ha mirado. Distinto de
  // `aplicado:false`, que sí es información — se intentó medir y no se pudo.
  if (!trace) return [];
  if (!trace.aplicado) {
    return [F(n, "revisar", null, ["No se pudo aplicar " + cambio + " sobre la página (" + ((trace && trace.motivo) || "motivo desconocido") + "): queda por comprobar a mano."])];
  }
  const rec = trace.recortados || [];
  const sup = trace.solapados || [];
  const prev = trace.previos || [];
  if (!rec.length && !sup.length) {
    // Nada empeora con el cambio. Si YA había contenido recortado de serie, eso
    // no lo causa el cambio —así que no es una falla de este criterio— pero es
    // pérdida de contenido real y no se puede dar por bueno en silencio.
    if (prev.length) {
      return [F(n, "revisar", null, [
        "Con " + cambio + " no empeora nada, pero " + prev.length + " bloque(s) YA venían con contenido recortado antes del cambio: " +
        prev.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (prev.length > 6 ? "…" : "") +
        ". No lo provoca " + cambio + ", pero hay texto que no se puede leer: compruébalo."
      ], nodesOf(prev))];
    }
    const cob = trace.cobertura;
    if (cob && cob.truncado) {
      // Con el tope, lo no medido quedaba fuera sin una palabra: la misma tarjeta
      // que se recorta daba «falla» sola y «cumple» detrás de 400 párrafos.
      return [F(n, "revisar", null, ["Con " + cambio + " no se recorta ni se solapa ningún bloque de texto de los " + cob.medidos +
        " medidos, pero la página tiene " + cob.total + ": el resto NO se ha comprobado. Sube el límite para dictaminar."])];
    }
    /* Y «cumple» solo si el cambio SURTIÓ EFECTO.
     *
     * `html{font-size:200%}` no toca nada cuando los tamaños están en `px`, que es
     * lo normal, y el criterio salía «cumple · con el texto al 200 % no se recorta
     * ni se solapa ningún bloque» sobre una medición de efecto nulo. Ahora la fase
     * dice por qué vía consiguió duplicarlo; si no lo consiguió por ninguna, no hay
     * nada medido que declarar conforme. */
    const ef = trace.efecto;
    if (ef && ef.muestra && !ef.crecioConLaRaiz && !ef.escalados) {
      return [F(n, "revisar", null, [
        "No se ha podido aplicar " + cambio + " a la página: ni cambiando el tamaño de la raíz ni escalando los elementos con texto. " +
        "No hay medición, así que el criterio queda por comprobar a mano (con el zoom de texto del navegador, no el de página)."
      ])];
    }
    return [F(n, "cumple", null, ["Con " + cambio + " no se recorta ni se solapa ningún bloque de texto (" + (trace.revisados || 0) + " elementos medidos" +
      (ef && ef.via && ef.via !== "raiz" ? "; el tamaño de la raíz no bastaba —la página declara el texto en px— y se escaló el tamaño computado de " + ef.escalados + " elemento(s), que es lo que hace el zoom de texto del navegador" : "") + ")."])];
  }
  const ev = [];
  if (rec.length) ev.push(rec.length + " bloque(s) de texto se recortan al aplicar " + cambio + " (el contenido queda oculto, sin barra de desplazamiento): " +
    rec.slice(0, 6).map(function (o) { return o.locator + (o.detalle ? " (" + o.detalle + ")" : ""); }).join(", ") + (rec.length > 6 ? "…" : "") + ".");
  if (sup.length) ev.push(sup.length + " bloque(s) se solapan con el contenido contiguo: " + sup.slice(0, 6).map(function (o) { return o.locator; }).join(", ") + ".");
  return [F(n, rec.length ? "falla" : "revisar", rec.length ? sevFalla : null, ev, nodesOf(rec.concat(sup)))];
}

/**
 * 1.4.4 Redimensionar el texto: al 200 % el contenido y la funcionalidad siguen
 * disponibles, sin pérdida por recorte.
 */
export function analyzeResize(trace) {
  return informeRecorte("1.4.4", "Redimensionar el texto", "el texto al 200 %", trace, "grave");
}

/**
 * 1.4.12 Espaciado del texto: line-height 1.5, letter-spacing 0.12em,
 * word-spacing 0.16em y 2em entre párrafos, sin pérdida de contenido.
 */
export function analyzeTextSpacing(trace) {
  return informeRecorte("1.4.12", "Espaciado del texto", "el espaciado de 1.4.12", trace, "grave");
}

/**
 * 1.3.4 Orientación: el contenido no se restringe a una sola orientación.
 * @param {{ bloqueoJS?:boolean, mediaBloqueante?:Array<string>, textoVertical?:number, textoHorizontal?:number }} trace
 */
export function analyzeOrientation(trace) {
  if (!trace) return [];
  const out = [];
  if (trace.bloqueoJS) {
    out.push(F("1.3.4", "falla", "grave", ["La página llama a <code>screen.orientation.lock()</code>: fuerza una orientación concreta."]));
    return out;
  }
  if ((trace.mediaBloqueante || []).length) {
    out.push(F("1.3.4", "revisar", null, ["Hay reglas CSS que ocultan contenido según la orientación (" + trace.mediaBloqueante.slice(0, 3).join(" · ") + "): comprueba que no se pierda nada al girar."]));
    return out;
  }
  const v = trace.textoVertical || 0, h = trace.textoHorizontal || 0;
  if (v && h) {
    const perdida = Math.round((1 - Math.min(v, h) / Math.max(v, h)) * 100);
    if (perdida >= 15) {
      out.push(F("1.3.4", "revisar", null, ["Al girar el dispositivo cambia un " + perdida + " % la cantidad de texto visible (" + h + " → " + v + " caracteres): revisa que no se pierda contenido en una de las orientaciones."]));
    } else {
      out.push(F("1.3.4", "cumple", null, ["El contenido se mantiene en vertical y en horizontal (diferencia del " + perdida + " %) y no hay bloqueo de orientación."]));
    }
  }
  return out;
}

/**
 * 1.4.13 Contenido al recibir foco o puntero: lo que aparece al pasar el puntero
 * o al enfocar debe poder descartarse (Esc), poder señalarse con el puntero sin
 * que desaparezca, y persistir hasta que se retire.
 *
 * El atributo `title` está EXENTO de este criterio, y esto emitía un `falla` por él.
 *
 * El texto normativo de 1.4.13 termina así: «Exception: The visual presentation of
 * the additional content is controlled by the user agent and is not modified by the
 * author». El tooltip nativo del navegador es exactamente eso — lo pinta el agente
 * de usuario y el autor no lo toca—, así que no se puede fallar 1.4.13 por usar
 * `title`. Se emitía `falla` moderada en cualquier página con un `<abbr title>`.
 *
 * Que `title` sea mala idea sigue siendo verdad, pero por otras vías: no se alcanza
 * con teclado ni con el dedo, y el soporte en lectores es desigual. Eso aterriza en
 * 1.1.1, 2.5.3 y 4.1.2 según el caso, no aquí. Así que se dice, y se dice donde
 * corresponde, sin colgarle al criterio una barrera que su propia excepción excluye.
 *
 * @param {{ titles?:Array<{locator:string, texto:string, tieneNombre?:boolean}>,
 *           hovers?:Array<{locator:string, descartable?:boolean, señalable?:boolean}> }} trace
 */
export function analyzeHoverContent(trace) {
  if (!trace) return [];
  const out = [];
  const titles = (trace.titles || []).filter(function (t) { return t.texto && t.texto.trim(); });
  if (titles.length) {
    /* Y va como `revisar`, no como `falla`: la excepción del criterio lo excluye.
     * Lo que queda por decidir no es 1.4.13, sino si esa información solo está ahí
     * —y entonces el problema es de otro criterio—. */
    const sinNombre = titles.filter(function (t) { return t.tieneNombre === false; });
    out.push(F("1.4.13", "revisar", null, [
      titles.length + " elemento(s) llevan el atributo <code>title</code>. El tooltip nativo lo pinta el navegador y el autor no lo modifica, así que la EXCEPCIÓN de 1.4.13 lo excluye: no es una barrera de este criterio. " +
      titles.slice(0, 6).map(function (t) { return t.locator + " «" + String(t.texto).slice(0, 30) + "»"; }).join(", ") + (titles.length > 6 ? "…" : "") + ".",
      "Lo que sí hay que comprobar: que esa información no esté SOLO en el `title`, porque no se alcanza con teclado ni con el dedo y el soporte en lectores es desigual. Si es la única vía, la barrera es de 1.1.1, 2.5.3 o 4.1.2, según lo que aporte." +
        (sinNombre.length ? " Ojo a " + sinNombre.length + " de ellos, que además no tienen otro nombre accesible." : "")
    ], nodesOf(titles.map(function (t) { return { locator: t.locator, detalle: t.texto }; }))));
  }
  // Acepta los dos juegos de nombres: la sonda real emite `descartableConEsc` y
  // `senalable` (sin eñe, que viaja mejor dentro del código inyectado).
  const noDescartable = function (h) { return h.descartable === false || h.descartableConEsc === false; };
  const noSenalable = function (h) { return h["señalable"] === false || h.senalable === false; };
  /* El requisito de «descartable» solo se incumple si el emergente TAPA algo.
   *
   * Lo dice el propio criterio: «except when the additional content ... does not
   * obscure or replace other content». Un emergente hecho con `:hover` en CSS no
   * responde a Esc por definición, así que sin esta condición TODOS salían como falla
   * grave — incluido el tooltip que aparece en un hueco reservado y no tapa nada, que
   * la excepción exime expresamente. Medido contra un sitio real: 47 filas de 1.4.13,
   * y el informe hecho a mano no señalaba ninguna.
   *
   * `tapa` lo mide la sonda (fuera del flujo y con algo pintado debajo). Cuando el
   * dato no está —una traza vieja, o una pasada donde no se pudo medir— se mantiene
   * el criterio a prueba de fallos: se cuenta como que tapa, porque lo contrario es
   * absolver sin haber mirado. */
  const tapa = function (h) { return h.tapa !== false; };
  const rotos = (trace.hovers || []).filter(function (h) { return (noDescartable(h) && tapa(h)) || noSenalable(h); });
  const eximidos = (trace.hovers || []).filter(function (h) { return noDescartable(h) && !tapa(h) && !noSenalable(h); });
  if (rotos.length) {
    out.push(F("1.4.13", "falla", "grave", [
      rotos.length + " contenido(s) emergente(s) incumplen: " + rotos.slice(0, 6).map(function (h) {
        const q = [];
        if (noDescartable(h) && tapa(h)) q.push("no se descarta con Esc y tapa contenido que había debajo" + (h.tapa === undefined ? " (o no se pudo comprobar que no lo tape)" : ""));
        if (noSenalable(h)) q.push("desaparece al llevar el puntero encima");
        return h.locator + " (" + q.join(" y ") + ")";
      }).join(", ") + (rotos.length > 6 ? ", …" : "") + ".",
      "Las tres condiciones de 1.4.13 son descartable sin mover el puntero ni el foco, señalable con el puntero sin que se cierre, y persistente. «Descartable» solo se exige cuando el emergente tapa o sustituye otro contenido, que es lo que se ha comprobado aquí."
    ], nodesOf(rotos)));
  }
  if (eximidos.length) {
    // No es una barrera: la excepción del criterio lo dice. Se cuenta, porque un
    // emergente que no responde a Esc conviene conocerlo, y no se acusa.
    out.push(F("1.4.13", "cumple-parcial", null, [
      eximidos.length + " contenido(s) emergente(s) no responden a Esc pero NO tapan ningún contenido (" +
      eximidos.slice(0, 5).map(function (h) { return h.locator; }).join(", ") +
      "): la excepción de 1.4.13 los exime expresamente («does not obscure or replace other content»), así que no son barreras de este criterio. Si cambia la maquetación y llegan a solapar, pasan a serlo."
    ], nodesOf(eximidos)));
  }
  /* Y lo que no se pudo medir no se cuenta como medido.
   *
   * La sonda devuelve `señalable: null` cuando el viaje del puntero no se pudo hacer
   * (el emergente quedó fuera de la ventana, o la página se movió por debajo). Eso no
   * es «se puede señalar»: es «no se ha comprobado», y mezclarlo con los sanos era
   * firmar `cumple` sobre un emergente que nadie miró. */
  const sinViaje = (trace.hovers || []).filter(function (h) {
    const falta = h.senalable === null || h.descartableConEsc === null || h.descartable === null;
    return falta && !noSenalable(h) && !(noDescartable(h) && tapa(h));
  });
  const sanos = (trace.hovers || []).length - rotos.length - eximidos.length - sinViaje.length;
  if (!titles.length && !rotos.length && !eximidos.length) {
    if (sanos > 0 || sinViaje.length) {
      out.push(F("1.4.13", sinViaje.length ? "cumple-parcial" : "cumple", null, [
        sanos + " contenido(s) emergente(s) se descartan con Esc y se pueden señalar con el puntero." +
        (sinViaje.length ? " De otros " + sinViaje.length + " no se pudieron comprobar las dos condiciones (el puntero no llegó a viajar hasta ellos, o el emergente no se pudo volver a abrir para probar Esc): " +
          sinViaje.slice(0, 4).map(function (h) { return h.locator; }).join(", ") + ". Eso queda sin comprobar, no aprobado." : "")
      ], nodesOf(sinViaje)));
    } else if (!trace.hoverProbado) {
      // No haber encontrado `title` no es haber probado el contenido emergente.
      // Un tooltip hecho con `:hover` en CSS —que no se cierra con Esc y
      // desaparece al mover el puntero— es una falla de libro de 1.4.13, y esto
      // lo daba por conforme.
      out.push(F("1.4.13", "revisar", null, [
        "No se han encontrado atributos <code>title</code>, y la sonda de puntero NO llegó a ejecutarse en esta pasada (la capa de adaptación no corrió, o falló). Sin ella no se ha comprobado ningún contenido emergente: compruébalo a mano o vuelve a ejecutar con la capa de viewport activa."
      ]));
    } else {
      const dis = trace.disparadores || 0;
      out.push(F("1.4.13", "cumple", null, [
        "Se ha pasado el puntero por " + dis + " disparador(es) de contenido emergente encontrados en el CSS y no ha aparecido ninguno problemático; tampoco hay atributos <code>title</code> usados como tooltip." +
        (trace.hojasBloqueadas ? " (" + trace.hojasBloqueadas + " hoja(s) de otro origen no se han podido leer: puede haber disparadores fuera de alcance.)" : "")
      ]));
    }
  }
  return out;
}

/** Agrega las cinco trazas en una sola lista de hallazgos. */
export function analyzeViewport(traces) {
  traces = traces || {};
  return [].concat(
    analyzeReflow(traces.reflow),
    analyzeResize(traces.resize),
    analyzeTextSpacing(traces.spacing),
    analyzeOrientation(traces.orientation),
    analyzeHoverContent(traces.hover),
    analyzeTimeLimits(traces.tiempos)
  );
}

/**
 * 2.2.1 Tiempo ajustable — los temporizadores largos, vistos al programarse.
 *
 * Lo único que se miraba era `<meta http-equiv="refresh">`, que es el fallo de libro
 * y que hoy casi nadie usa: medido contra un sitio real, 2.2.1 no emitió nada. El
 * límite de tiempo de verdad lo pone JavaScript —`setTimeout(cerrarSesion, 900000)`—
 * y eso no está en el marcado. Envolviendo `setTimeout` y `setInterval` antes de que
 * cargue la página se anota cada llamada con retardo de 20 s o más, con su retardo y
 * la línea de pila de donde sale.
 *
 * El veredicto es `revisar`, y el motivo está en los datos: un temporizador largo
 * puede ser un cierre de sesión —y entonces 2.2.1 exige poder apagarlo, ajustarlo o
 * prorrogarlo— o puede ser un sondeo, una baliza de analítica o la caducidad de una
 * caché, que al criterio no le importan. Lo que se afirma es lo observado: se programó
 * un temporizador de tantos segundos, y sale de aquí.
 */
export function analyzeTimeLimits(t) {
  if (!t || !Array.isArray(t.largos)) return [];
  const seg = function (ms) { return ms >= 60000 ? Math.round(ms / 60000) + " min" : Math.round(ms / 1000) + " s"; };
  if (!t.largos.length) {
    return [F("2.2.1", "cumple-parcial", null, [
      "Con la API de temporizadores envuelta desde antes de cargar, no se ha programado ningún `setTimeout` ni `setInterval` de 20 s o más (" +
      (t.total || 0) + " temporizador(es) en total, todos por debajo del umbral).",
      "Queda fuera lo que se programe DESPUÉS del momento de mirar —un cierre de sesión que arranca al iniciar sesión, por ejemplo—, los límites que imponga el servidor y los que vengan de un `<meta http-equiv=\"refresh\">`, que se comprueba aparte. Por eso es `cumple-parcial` y no `cumple`."
    ])];
  }
  /* Y si el temporizador sale de una etiqueta de analítica, se dice.
   *
   * Medido contra el sitio real, el único temporizador largo de la muestra es un
   * `setInterval` de 24 h programado por `gtm.js` de Google Tag Manager: no impone
   * ningún límite a la persona. La fila es correcta —se programó, y eso es lo que se
   * afirma— pero sin anotar la procedencia obliga a quien audita a ir a mirar un
   * bundle de terceros para descartarla. Anotarlo no la esconde: la deja descartable
   * de un vistazo. */
  const ANALITICA = /(googletagmanager|google-analytics|gtag\/js|gtm\.js|doubleclick|hotjar|clarity\.ms|segment\.(com|io)|matomo|piwik|newrelic|sentry|intercom|zendesk|facebook\.net\/.*\/fbevents)/i;
  const deAnalitica = t.largos.filter(function (x) { return ANALITICA.test(String(x.origen || "")); });
  return [F("2.2.1", "revisar", null, [
    t.largos.length + " temporizador(es) de 20 s o más programados mientras la página cargaba: " +
    t.largos.slice(0, 5).map(function (x) {
      return x.api + " de " + seg(x.ms) + (x.origen ? " (desde " + x.origen + ")" : "");
    }).join(" · ") + ".",
    deAnalitica.length === t.largos.length
      ? "Todos salen de etiquetas de analítica o de herramientas de terceros, que no imponen ningún límite de tiempo a la persona: lo normal es que esto se descarte. Confírmalo y ciérralo."
      : (deAnalitica.length ? deAnalitica.length + " de ellos salen de etiquetas de analítica o herramientas de terceros, que no imponen límites a la persona." : null),
    "Si alguno impone un límite de tiempo a la persona —cerrar la sesión, caducar un carrito, pasar de paso en un formulario—, 2.2.1 exige poder apagarlo, ajustarlo hasta diez veces, o prorrogarlo con un aviso de al menos 20 s. Si es un sondeo, una baliza o una caché, el criterio no dice nada. Lo que se ha visto es que se programaron: lo que hacen al cumplirse lo decide quien audita."
  ].filter(Boolean), t.largos.slice(0, 8).map(function (x) {
    return { locator: x.api + "(" + seg(x.ms) + ")", name: x.origen || "" };
  }))];
}
