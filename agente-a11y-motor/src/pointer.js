/**
 * Los cuatro criterios de puntero, a partir del censo REAL de oyentes.
 *
 * 2.5.1 (gestos), 2.5.2 (cancelación), 2.5.4 (actuación por movimiento) y 2.5.7
 * (arrastre) salían los cuatro como «requiere evaluación humana» en todas las
 * páginas. Medido sobre el sitio de prueba: `humano` ×15 cada uno, sin una sola
 * línea de expediente. Eso es verdad —ninguno se cierra sin juicio— pero no es
 * todo lo que se puede decir: lo que una persona necesita para juzgarlos es
 * saber QUÉ de la página se opera con gestos, con arrastre o al pulsar, y eso sí
 * se puede averiguar.
 *
 * ── De dónde sale el dato ───────────────────────────────────────────────────
 * No de adivinar leyendo los scripts, que es como se cuelan los supuestos: del
 * registro de oyentes del propio navegador, vía `getEventListeners` del
 * protocolo de depuración. Lo que devuelve es lo que el navegador tiene
 * apuntado, incluidos los oyentes que añadió JavaScript en tiempo de ejecución.
 * Es un hecho, no una conjetura.
 *
 * ── Lo que NO se puede afirmar ──────────────────────────────────────────────
 * Encontrar un gesto no es incumplir: 2.5.1 pide que exista alternativa de un
 * solo puntero, y eso hay que probarlo. Y no encontrarlo tampoco cierra el
 * criterio: el censo es una foto del documento principal en un instante, así que
 * no ve dentro de los marcos, no sabe qué pasa dentro de un `<canvas>`, y una
 * biblioteca que ate sus oyentes al interactuar por primera vez no aparece.
 * Por eso el silencio sale como `cumple-parcial` —la presencia está medida, el
 * resto es juicio— y nunca como `cumple` ni como `no-aplica`.
 */
import { WCAG22, enClause } from "./engine.js";

const IX = {};
WCAG22.forEach(function (c) { IX[c.n] = { t: c.t, lvl: c.lvl }; });
function crit(n) { return { n: n, t: (IX[n] ? IX[n].t : n), lvl: (IX[n] ? IX[n].lvl : "A") }; }
function F(n, verdict, sev, evid, nodes) {
  const f = { c: crit(n), verdict: verdict, sev: sev, evid: evid, scope: "medición", origen: "puntero", en: enClause(n) };
  if (nodes && nodes.length) f.nodes = nodes;
  return f;
}
function tiene(tipos, t) { return (tipos || []).indexOf(t) !== -1; }
function alguno(tipos, lista) { return lista.some(function (t) { return tiene(tipos, t); }); }
function nodosDe(lista) {
  return lista.slice(0, 20).map(function (x) { return { locator: x.loc, name: "", path: x.path || "" }; });
}
/** Lo que el censo no alcanza, dicho igual en los cuatro criterios. */
const LIMITE =
  "El censo es una foto del documento principal: no ve dentro de los marcos ni de un <code>canvas</code>, " +
  "y una biblioteca que ate sus oyentes la primera vez que se interactúa con ella no aparece aquí.";

/* Qué eventos delatan cada cosa. Nombres del DOM, no inventados. */
const BAJADA = ["mousedown", "pointerdown", "touchstart"];
const SUBIDA = ["mouseup", "pointerup", "touchend", "click"];
const GESTO_NATIVO = ["gesturestart", "gesturechange", "gestureend"];
const MOVIMIENTO = ["devicemotion", "deviceorientation", "deviceorientationabsolute"];

/**
 * @param {{ disponible:boolean, motivo?:string,
 *           nodos?:Array<{loc:string, path?:string, tipos:Array<string>, draggable?:boolean}>,
 *           globales?:Array<{que:string, tipos:Array<string>}> }} censo
 */
export function analizaPuntero(censo) {
  censo = censo || {};
  if (!censo.disponible) {
    // Sin censo no se dice nada: que lo diga el relleno del motor o el barrido,
    // que para eso están. Inventar aquí un veredicto sería lo contrario de medir.
    return [];
  }
  const nodos = censo.nodos || [];
  const globales = censo.globales || [];
  const out = [];
  /* CUÁNTOS SE MIRARON, no cuántos tenían algo.
   *
   * La primera versión decía «se han revisado los oyentes de N elementos» con N
   * = los que TIENEN oyente, así que en una página limpia salía «se han revisado
   * los oyentes de 0 elementos» — que se lee como que no se miró nada, justo lo
   * contrario de lo que había pasado. El censo recorre todos los elementos del
   * documento; eso es lo que hay que contar. */
  const examinados = censo.examinados != null ? censo.examinados : nodos.length;
  const mirados = "Se han recorrido los " + examinados + " elemento(s) del documento y se han leído sus oyentes tal como los tiene apuntados el navegador" +
    (nodos.length ? " (" + nodos.length + " con alguno)" : " (ninguno tiene oyentes de puntero)") + "." +
    (censo.truncado ? " ATENCIÓN: el recorrido se cortó en el tope, así que quedan elementos sin mirar." : "");

  /* ── 2.5.1 Gestos del puntero ── */
  const gestos = nodos.filter(function (n) {
    return alguno(n.tipos, GESTO_NATIVO) ||
      (tiene(n.tipos, "touchstart") && tiene(n.tipos, "touchmove")) ||
      (tiene(n.tipos, "pointerdown") && tiene(n.tipos, "pointermove"));
  });
  if (gestos.length) {
    out.push(F("2.5.1", "humano", null, [
      gestos.length + " elemento(s) escuchan un gesto de TRAYECTORIA o multipunto (arrastrar el dedo, pellizcar): " +
        gestos.slice(0, 8).map(function (n) { return n.loc + " [" + n.tipos.filter(function (t) { return /^(touch|pointer|gesture)/.test(t); }).join(", ") + "]"; }).join(" · ") + ".",
      "Encontrar el gesto NO es incumplir: el criterio pide que la misma función se pueda hacer con un solo puntero y sin recorrer un camino. Hay que probarlo.",
      LIMITE
    ], nodosDe(gestos)));
  } else {
    out.push(F("2.5.1", "cumple-parcial", null, [
      "No se ha encontrado ningún elemento que escuche un gesto de trayectoria ni multipunto. " + mirados,
      LIMITE
    ]));
  }

  /* ── 2.5.2 Cancelación del puntero ── */
  const alPulsar = nodos.filter(function (n) {
    return alguno(n.tipos, BAJADA) && !alguno(n.tipos, SUBIDA);
  });
  if (alPulsar.length) {
    out.push(F("2.5.2", "humano", null, [
      alPulsar.length + " control(es) escuchan el evento de BAJADA del puntero y ninguno de subida ni `click`: " +
        alPulsar.slice(0, 8).map(function (n) { return n.loc + " [" + n.tipos.filter(function (t) { return BAJADA.indexOf(t) !== -1; }).join(", ") + "]"; }).join(" · ") + ".",
      "Es candidato, no barrera: el criterio se incumple si la ACCIÓN se ejecuta al pulsar y no se puede abortar soltando fuera. Un manejador de bajada que solo cambia un estado visual no incumple nada.",
      "Para comprobarlo: pulsa sobre el control, arrastra fuera de él y suelta. Si la acción se ha ejecutado igual, falla.",
      LIMITE
    ], nodosDe(alPulsar)));
  } else {
    out.push(F("2.5.2", "cumple-parcial", null, [
      "Ningún control actúa solo en el evento de bajada del puntero: los que escuchan la bajada escuchan también la subida o el `click`. " + mirados,
      LIMITE
    ]));
  }

  /* ── 2.5.4 Actuación por movimiento ── */
  const porMovimiento = globales.filter(function (g) { return alguno(g.tipos, MOVIMIENTO); })
    .concat(nodos.filter(function (n) { return alguno(n.tipos, MOVIMIENTO); }));
  if (porMovimiento.length) {
    out.push(F("2.5.4", "humano", null, [
      "La página escucha el movimiento del dispositivo (" +
        porMovimiento.map(function (g) { return (g.que || g.loc) + " [" + (g.tipos || []).filter(function (t) { return MOVIMIENTO.indexOf(t) !== -1; }).join(", ") + "]"; }).join(" · ") + ").",
      "El criterio pide dos cosas: que esa función se pueda hacer también con los controles de la interfaz, y que se pueda desactivar la respuesta al movimiento. Compruébalo.",
      LIMITE
    ]));
  } else {
    out.push(F("2.5.4", "cumple-parcial", null, [
      "La página no escucha `devicemotion` ni `deviceorientation`: no hay ninguna función que se active agitando o inclinando el dispositivo. " + mirados,
      LIMITE
    ]));
  }

  /* ── 2.5.7 Movimientos de arrastre ── */
  const arrastre = nodos.filter(function (n) {
    return n.draggable || tiene(n.tipos, "dragstart") ||
      (tiene(n.tipos, "pointerdown") && tiene(n.tipos, "pointermove") && tiene(n.tipos, "pointerup")) ||
      (tiene(n.tipos, "mousedown") && tiene(n.tipos, "mousemove"));
  });
  if (arrastre.length) {
    out.push(F("2.5.7", "humano", null, [
      arrastre.length + " elemento(s) se operan arrastrando: " +
        arrastre.slice(0, 8).map(function (n) {
          return n.loc + (n.draggable ? " [draggable]" : "") + (tiene(n.tipos, "dragstart") ? " [dragstart]" : "") +
            (tiene(n.tipos, "pointermove") ? " [pointerdown→move→up]" : "");
        }).join(" · ") + ".",
      "El criterio pide que exista otra forma de hacer lo mismo con un solo puntero sin arrastrar —pulsar origen y destino, un control alternativo— salvo que el arrastre sea esencial.",
      LIMITE
    ], nodosDe(arrastre)));
  } else {
    out.push(F("2.5.7", "cumple-parcial", null, [
      "No se ha encontrado ningún elemento arrastrable: ni `draggable`, ni `dragstart`, ni la secuencia de puntero que delata un arrastre. " + mirados,
      LIMITE
    ]));
  }

  return out;
}

/* NODE-ONLY:START */
/**
 * El censo, vía el protocolo de depuración del navegador.
 *
 * `getEventListeners` es una función de la consola de DevTools, así que no se
 * puede llamar desde un `page.evaluate` normal: hace falta `Runtime.evaluate`
 * con `includeCommandLineAPI`. Por eso esto vive en el lado Node y la extensión
 * no lo tiene — allí el censo sale `disponible: false` y el analizador calla,
 * que es lo correcto.
 *
 * @param {import("playwright").Page} page
 * @param {{ max?:number }} [opts]
 */
export async function censoDeOyentes(page, opts) {
  opts = opts || {};
  const max = opts.max || 1500;
  try {
    const cdp = await page.context().newCDPSession(page);
    const r = await cdp.send("Runtime.evaluate", {
      includeCommandLineAPI: true,
      returnByValue: true,
      expression: "(" + FN_CENSO + ")(" + max + ")"
    });
    const v = r && r.result && r.result.value;
    if (!v || v.error) return { disponible: false, motivo: (v && v.error) || "el protocolo no devolvió el censo" };
    return { disponible: true, nodos: v.nodos || [], globales: v.globales || [],
      examinados: v.examinados || 0, truncado: !!v.truncado };
  } catch (e) {
    return { disponible: false, motivo: (e && e.message ? e.message : String(e)).split("\n")[0] };
  }
}

/* Se evalúa en la página con la API de consola disponible. Vive en una cadena
   —no en una plantilla con comillas invertidas— para no repetir la trampa de
   siempre: una comilla invertida dentro de un comentario cierra la plantilla. */
const FN_CENSO = [
  "function (max) {",
  "  var nodos = [], globales = [], truncado = false;",
  "  var mira = function (n, etiqueta) {",
  "    var ls; try { ls = getEventListeners(n); } catch (e) { return null; }",
  "    var tipos = ls ? Object.keys(ls) : [];",
  "    return tipos.length ? { que: etiqueta, tipos: tipos } : null;",
  "  };",
  "  [[window, 'window'], [document, 'document']].forEach(function (par) {",
  "    var g = mira(par[0], par[1]); if (g) globales.push(g);",
  "  });",
  "  var loc = function (el) {",
  "    var t = el.tagName.toLowerCase();",
  "    if (el.id) return t + '#' + el.id;",
  "    var c = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean)[0];",
  "    return c ? t + '.' + c : t;",
  "  };",
  "  var ruta = function (el) {",
  "    var p = [], n = el;",
  "    while (n && n.nodeType === 1) {",
  "      var t = n.tagName.toLowerCase();",
  "      if (t === 'html') break;",
  "      var pa = n.parentElement; if (!pa) { p.unshift(t); break; }",
  "      var i = 1, s = pa.firstElementChild;",
  "      while (s && s !== n) { if (s.tagName === n.tagName) i++; s = s.nextElementSibling; }",
  "      p.unshift(t + ':nth-of-type(' + i + ')'); n = pa;",
  "    }",
  "    return p.length ? 'html > ' + p.join(' > ') : '';",
  "  };",
  "  var todos = document.querySelectorAll('*');",
  "  for (var i = 0; i < todos.length; i++) {",
  "    if (nodos.length >= max) { truncado = true; break; }",
  "    var el = todos[i];",
  "    var r = mira(el, null);",
  "    var arrastrable = el.getAttribute('draggable') === 'true';",
  "    if (!r && !arrastrable) continue;",
  "    nodos.push({ loc: loc(el), path: ruta(el), tipos: (r && r.tipos) || [], draggable: arrastrable });",
  "  }",
  "  return { nodos: nodos, globales: globales, examinados: todos.length, truncado: truncado };",
  "}"
].join("\n");
/* NODE-ONLY:END */
