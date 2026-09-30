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
function nodesOf(list, max) {
  return (list || []).slice(0, max || 10).map(function (x) { return { locator: x.locator, name: x.detalle || "" }; });
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
 * El caso más común y más claro: el atributo `title`. El tooltip nativo del
 * navegador no se puede descartar con Esc ni señalar con el ratón, y además
 * muchos lectores no lo anuncian. Es una falla de libro.
 *
 * @param {{ titles?:Array<{locator:string, texto:string, tieneNombre?:boolean}>,
 *           hovers?:Array<{locator:string, descartable?:boolean, señalable?:boolean}> }} trace
 */
export function analyzeHoverContent(trace) {
  if (!trace) return [];
  const out = [];
  const titles = (trace.titles || []).filter(function (t) { return t.texto && t.texto.trim(); });
  if (titles.length) {
    out.push(F("1.4.13", "falla", "moderada", [
      titles.length + " elemento(s) usan el atributo <code>title</code> como contenido emergente: el tooltip nativo no se puede descartar con Esc ni señalar con el puntero, y desaparece solo. " +
      titles.slice(0, 6).map(function (t) { return t.locator + " «" + String(t.texto).slice(0, 30) + "»"; }).join(", ") + (titles.length > 6 ? "…" : "")
    ], nodesOf(titles.map(function (t) { return { locator: t.locator, detalle: t.texto }; }))));
  }
  // Acepta los dos juegos de nombres: la sonda real emite `descartableConEsc` y
  // `senalable` (sin eñe, que viaja mejor dentro del código inyectado).
  const noDescartable = function (h) { return h.descartable === false || h.descartableConEsc === false; };
  const noSenalable = function (h) { return h["señalable"] === false || h.senalable === false; };
  const rotos = (trace.hovers || []).filter(function (h) { return noDescartable(h) || noSenalable(h); });
  if (rotos.length) {
    out.push(F("1.4.13", "falla", "grave", [
      rotos.length + " contenido(s) emergente(s) incumplen: " + rotos.slice(0, 6).map(function (h) {
        const q = [];
        if (noDescartable(h)) q.push("no se descarta con Esc");
        if (noSenalable(h)) q.push("desaparece al llevar el puntero encima");
        return h.locator + " (" + q.join(" y ") + ")";
      }).join(", ")
    ], nodesOf(rotos)));
  }
  const sanos = (trace.hovers || []).length - rotos.length;
  if (!titles.length && !rotos.length) {
    if (sanos > 0) {
      out.push(F("1.4.13", "cumple", null, [sanos + " contenido(s) emergente(s) se descartan con Esc y se pueden señalar con el puntero."]));
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
    analyzeHoverContent(traces.hover)
  );
}
