/**
 * Auditoría completa de una página, en UNA sola sesión de navegador.
 *
 * Antes cada capa abría su propio Chromium: el análisis de render, la adaptación
 * del contenido y la prueba dinámica eran tres lanzamientos por página — quince
 * páginas de muestra, cuarenta y cinco navegadores. Aquí se abre uno, se presta
 * la misma página a cada capa y se cierra al final.
 *
 * El orden no es casual: primero lo que solo OBSERVA (motor, página, medición,
 * axe), después lo que MODIFICA la presentación (viewport: estrecha, agranda,
 * fuerza espaciado) y al final lo que INTERACTÚA (dinámico: tabula, pulsa,
 * envía). Así ninguna capa mide sobre el desorden que dejó otra.
 *
 * Además unifica dos cosas que se estaban perdiendo:
 *  - lo que axe ve y el motor no (antes axe se ejecutaba pero sus hallazgos no
 *    llegaban a `findings`, así que no salían en el informe);
 *  - la trazabilidad de la ejecución (versión del motor, navegador, fecha, qué
 *    capas corrieron), que un entregable con efectos legales debería llevar.
 */
import { createRequire } from "module";
import { analyzeRendered } from "./render-analyze.js";
import { viewportAnalyze } from "./viewport-analyze.js";
import { dynamicAnalyze } from "./dynamic-analyze.js";
import { scFromAxeTags, scFromAxeTag } from "./axe-map.js";
import { launchOptions } from "./playwright-launch.js";
import { FINGERPRINT_BODY, analyzeCoherence } from "./coherence.js";
import { resolverContrastePorPixeles } from "./pixel-contrast.js";
import { rollupSample } from "./sample-audit.js";
import { reconcile } from "./axe-cross.js";
import { cuadernoDeMuestra, findingsDelCuaderno } from "./cuaderno.js";
import { WCAG22, enClause, capaQueMide } from "./engine.js";
import { aplicaCoberturas } from "./verdicts.js";

const WIX = {};
WCAG22.forEach(function (c) { WIX[c.n] = { t: c.t, lvl: c.lvl }; });

/* ── El barrido de los criterios que nadie nombró ────────────────────────────
 *
 * La regla de oro del proyecto dice que un criterio sin comprobar NO puede
 * exportarse como conforme, y hasta aquí se cumplía criterio a criterio. Lo que
 * no se comprobaba era el conjunto: si NINGUNA capa emitía un hallazgo para un
 * criterio, ese criterio simplemente no existía en el informe, y en la plantilla
 * del IRA eso se imprime «No evaluado» —o peor, se queda en blanco— sin que
 * nadie haya dicho que no se miró. El silencio y la conformidad se parecen
 * demasiado en un informe, y esto era silencio puro.
 *
 * Medido sobre una página del sitio de pruebas:
 *   · con las capas POR DEFECTO, once criterios salían sin una sola frase
 *     (1.2.1, 1.2.2, 1.2.3, 1.4.2, 2.1.4, 2.2.2, 4.1.3 y los cuatro de
 *     coherencia, que sí los decide `auditSite`);
 *   · con `capas.render: false` —una opción legítima— eran CUARENTA Y NUEVE de
 *     los cincuenta y cinco, y el informe no decía en ninguna parte que no se
 *     hubiera medido nada.
 *
 * El barrido no inventa un veredicto: pone `revisar`, que no es conforme, y
 * explica cuál de las tres cosas pasó. Se alimenta de `CAPA_QUE_MIDE`, que ya
 * era la única tabla de qué capa mide qué, así que un criterio nuevo entra aquí
 * solo. */

/** De la prosa de `CAPA_QUE_MIDE` a las banderas de `capas`. */
const CAPA_POR_PALABRA = [
  ["píxeles", "pixeles"], ["adaptación", "viewport"], ["dinámico", "dynamic"],
  ["coherencia", "coherencia"], ["medición", "render"], ["página", "render"]
];
function capasDe(n) {
  const prosa = capaQueMide(n) || "";
  const out = [];
  CAPA_POR_PALABRA.forEach(function (par) {
    if (prosa.indexOf(par[0]) !== -1 && out.indexOf(par[1]) === -1) out.push(par[1]);
  });
  return out;
}
function critDe(n) { return { n: n, t: (WIX[n] ? WIX[n].t : n), lvl: (WIX[n] ? WIX[n].lvl : "A") }; }

/**
 * Las banderas de capa de una pasada, con los valores por defecto puestos.
 *
 * Vive aquí fuera porque la necesitan dos: `auditRun`, para decidir qué corre, y
 * el barrido de `auditSite`, para saber qué corrió. Cuando estaba dentro de
 * `auditRun`, el barrido de sitio leía `opts.capas` en crudo y con las opciones
 * por defecto —que es el caso normal— creía que NINGUNA capa se había ejecutado.
 */
export function capasEfectivas(capas) {
  return Object.assign({ render: true, viewport: true, dynamic: false, axe: true, huella: true, pixeles: true }, capas || {});
}

/**
 * Los criterios de los que no habló nadie, con un `revisar` que dice por qué.
 *
 * @param {Array} findings  los hallazgos ya reunidos
 * @param {object} capas    las banderas de capa de esta pasada
 * @param {{ sitio?:boolean, omitir?:Array<string> }} [opts]
 *        `sitio: true` incluye los criterios de coherencia (que una página sola
 *        no puede decidir y `auditSite` sí).
 */
/* LA CAPA QUE NO SE EJECUTÓ, DICHA TAMBIÉN CUANDO HAY VEREDICTO.
 *
 * `criteriosEnSilencio` ya decía esto, pero solo para los criterios de los que no
 * había NI UN hallazgo. Y ahí estaba el hueco: un criterio puede tener el
 * hallazgo genérico del motor —«requiere evaluación humana»— y entonces esa pasada
 * se lo salta, de modo que el informe no dice nunca que la sonda que lo mide no
 * llegó a correr.
 *
 * Medido sobre el banco del sitio limpio: 25 de los 55 criterios salieron «No se
 * puede comprobar (revisión manual)», y entre ellos 2.1.1, 2.1.4, 2.2.2, 3.3.1,
 * 3.3.2, 3.3.3 y 4.1.3 — exactamente los que mide la capa dinámica, que en esa
 * pasada estaba APAGADA porque `auditar-sitio.mjs` la deja tras un flag. Leyendo
 * el informe no hay forma de distinguir «esto necesita una persona» de «no corrí
 * la sonda que lo mide». Son dos cosas muy distintas y una de ellas es culpa del
 * agente.
 *
 * Y es la regla de oro del proyecto aplicada a su propia configuración: si no se
 * ha medido, no puede leerse como medido. Así que además de decirlo, una
 * conformidad firmada con la capa apagada se baja a `revisar`.
 */
/**
 * Las líneas que CUALQUIER salida tiene que dar cuando la muestra tiene huecos.
 *
 * `auditSite` ya sabía qué páginas se cayeron: las guarda en `paginasFallidas`,
 * las pone en `avisos` y se las pasa al cuaderno para que no firme «no aplica en
 * el sitio» a partir de las que sí cargaron. Y `seguimiento.csv` lleva la columna
 * «Cobertura de la muestra» en cada fila. Todo eso estaba bien.
 *
 * Lo que no estaba era la salida de `auditar-sitio.mjs`, que es el script que
 * produce los entregables y lo único que se lee después de una pasada. Con una
 * página de cuatro caída imprimía:
 *
 *     NO CONFORME
 *       3 criterios fallan · 46 sin determinar · 6 conformes
 *
 * y ni una palabra del hueco. Porque `rollup.conformidad` solo dice «Incompleta»
 * cuando NO falla nada —la escalera mira `fallan` antes que `sinAnalizar`, y eso
 * está bien, que una página sin mirar no puede volver conforme a un sitio que
 * falla—, de modo que en cuanto hay una barrera la incompletitud desaparece de la
 * única frase que el script imprimía. Sus hermanos (`auditar-muestra.mjs`,
 * `regresion-sitio.mjs`) sí la imprimían: el que hace los entregables del cliente
 * era el único callado.
 *
 * Es la regla de oro otra vez: seis criterios presentados como conformes sobre una
 * muestra de la que no se abrió la cuarta parte. Así que esto vive aquí, al lado
 * del motor y con tests, y no copiado en tres scripts que pueden volver a
 * separarse. Devuelve [] cuando la muestra está completa.
 */
export function lineasDeCobertura(sitio) {
  const s = sitio || {};
  const r = s.rollup || {};
  const fallidas = (s.paginasFallidas && s.paginasFallidas.length)
    ? s.paginasFallidas
    : (r.sinAnalizar || []);
  if (!fallidas.length) return [];
  const total = r.paginas || (s.procedencia && s.procedencia.paginas) || fallidas.length;
  const analizadas = (typeof r.paginasAnalizadas === "number")
    ? r.paginasAnalizadas
    : Math.max(0, total - fallidas.length);
  const lineas = [
    "MUESTRA INCOMPLETA: " + analizadas + " de " + total + " página(s) analizadas. " +
    "Lo que diga este informe NO cubre la(s) que faltan, y un criterio sin barreras " +
    "en las analizadas no está comprobado en las que no se abrieron."
  ];
  fallidas.slice(0, 10).forEach(function (f) {
    lineas.push("  · " + ((f && f.url) || "(sin url)") + " — " + ((f && f.error) || "no se obtuvo ningún hallazgo"));
  });
  if (fallidas.length > 10) lineas.push("  · … y " + (fallidas.length - 10) + " más");
  return lineas;
}

export function notaDeCapaApagada(findings, capas, opts) {
  opts = opts || {};
  const porCrit = {};
  (findings || []).forEach(function (f) {
    if (f && f.c && f.c.n) { (porCrit[f.c.n] = porCrit[f.c.n] || []).push(f); }
  });
  const afectados = [];
  Object.keys(porCrit).forEach(function (n) {
    const suyas = capasDe(n);
    if (!suyas.length) return;                       // nadie más que el motor: no es esto
    const corridas = suyas.filter(function (k) {
      return k === "coherencia" ? !!opts.sitio : !!(capas && capas[k]);
    });
    if (corridas.length) return;                     // alguna corrió: no aplica la nota
    afectados.push(n);
    const nota = "LA SONDA QUE MIDE ESTE CRITERIO NO SE EJECUTÓ en esta pasada (" + capaQueMide(n) +
      "), así que lo de arriba no es el resultado de haberlo medido: es lo que se puede decir sin medirlo. " +
      "No es lo mismo que «necesita una persona». Para medirlo, repite la pasada con esa capa encendida.";
    porCrit[n].forEach(function (f) {
      f.evid = (f.evid || []).concat([nota]);
      // Y el motivo como dato, para que `seguimiento.csv` pueda decirlo en su
      // fila: es el único de los motivos que se arregla repitiendo la pasada.
      f.motivo = "capa-apagada";
      // Una conformidad firmada con la sonda apagada no es una conformidad.
      if (f.verdict === "cumple" || f.verdict === "pasa") f.verdict = "revisar";
    });
  });
  return afectados;
}

export function criteriosEnSilencio(findings, capas, opts) {
  opts = opts || {};
  const dichos = {};
  (findings || []).forEach(function (f) { if (f && f.c && f.c.n) dichos[f.c.n] = 1; });
  const out = [];
  WCAG22.forEach(function (c) {
    if (dichos[c.n]) return;
    if (opts.omitir && opts.omitir.indexOf(c.n) !== -1) return;
    const suyas = capasDe(c.n);
    const esDeSitio = suyas.indexOf("coherencia") !== -1;
    // Una página sola no puede dictaminar los criterios de sitio: los decide
    // `auditSite` cruzando la muestra. Ahí sí se barren.
    if (esDeSitio && !opts.sitio) return;
    const corridas = suyas.filter(function (k) {
      return k === "coherencia" ? !!opts.sitio : !!(capas && capas[k]);
    });
    /* El MOTIVO va también como dato, no solo dentro de la frase.
     *
     * La razón se escribió para que la leyera una persona en la evidencia del
     * hallazgo, y ahí se quedó: `seguimiento.csv` —la fila por criterio que
     * alimenta el IRA— no tiene columna de evidencia, así que sus filas decían
     * «No se puede comprobar (revisión manual)» sin decir nunca por qué. En el
     * banco del sitio limpio eran 21 de 55 filas. Un código aquí permite que esa
     * hoja clasifique sin que nadie tenga que buscar expresiones regulares en mi
     * propia prosa castellana, que es frágil y además mía. */
    let razon, motivo;
    if (!suyas.length) {
      motivo = "nadie-lo-mide";
      razon = "ninguna capa del agente mide este criterio aparte del motor, y el motor no ha encontrado en el marcado nada a lo que aplique: nadie lo ha comprobado.";
    } else if (!corridas.length) {
      motivo = "capa-no-corrio";
      razon = "la capa que lo mide (" + capaQueMide(c.n) + ") no se ha ejecutado en esta pasada, así que este criterio NO se ha comprobado.";
    } else {
      motivo = "sonda-muda";
      razon = "la capa que lo mide (" + capaQueMide(c.n) + ") sí se ha ejecutado y no ha dicho nada de este criterio: " +
        "lo más probable es que no haya encontrado contenido al que aplique, pero el agente no lo afirma.";
    }
    out.push({
      c: critDe(c.n), verdict: "revisar", sev: null,
      evid: [razon + " Queda sin dictamen: «revisar» no es conforme y no puede exportarse como cumplido."],
      scope: "cobertura", origen: "barrido", motivo: motivo, en: enClause(c.n)
    });
  });
  return out;
}

// Gravedad de axe → la nuestra.
const SEV_AXE = { critical: "crítica", serious: "grave", moderate: "moderada", minor: "leve" };

/**
 * Hallazgos que aporta axe y que el motor NO ha marcado ya como falla.
 *
 * No duplicamos: si los dos ven la misma barrera en el mismo criterio, la del
 * motor ya está en el informe con su evidencia en castellano. Lo que sí entra es
 * lo que solo ve axe — que es justo el valor de tener una segunda fuente.
 */
/**
 * @param {Array} violations      violaciones crudas de axe-core
 * @param {Array|object} yaFallan criterios que el motor ya falla. Acepta la forma
 *   antigua (lista de criterios) y la nueva ({ "1.1.1": ["img.logo", …] }), que
 *   es la que permite deduplicar por ELEMENTO en vez de tirar el criterio entero.
 */
export function axeFindingsNuevos(violations, yaFallan) {
  // Compatibilidad: una lista suelta se interpreta como «de estos criterios no
  // sé qué elementos vio el motor», y entonces no se descarta ningún elemento.
  const yaFallanNodos = Array.isArray(yaFallan) ? {} : (yaFallan || {});
  // Agrupamos sobre las violaciones CRUDAS, no sobre `axeViolationsBySC`: esa
  // indexación devuelve el número de nodos, y aquí hacen falta sus selectores
  // para la columna "Elemento" del IRA.
  const porSC = new Map();
  (violations || []).forEach(function (v) {
    scFromAxeTags(v.tags).forEach(function (sc) {
      if (!porSC.has(sc)) porSC.set(sc, []);
      porSC.get(sc).push(v);
    });
  });

  const out = [];
  porSC.forEach(function (vs, sc) {
    if (!WIX[sc]) return; // regla de axe fuera de los 55 criterios A+AA que cubrimos
    const nodes = [];
    let peor = 0;
    const ORDEN = { leve: 1, moderada: 2, grave: 3, "crítica": 4 };
    let sev = "moderada";
    /* Dos conjuntos, y la diferencia importa.
     *
     * `delMotor` son los elementos que el motor ya señaló en este criterio: si
     * axe repite uno, no se añade fila Y se dice en la evidencia, porque eso es
     * información real («las dos fuentes ven lo mismo»).
     *
     * `vistos` es la deduplicación DENTRO de axe: dos reglas distintas de axe
     * —`image-alt` y `role-img-alt`, por ejemplo— señalan el mismo elemento en el
     * mismo criterio. También hay que quedarse con una fila, pero eso no lo
     * detectó el motor, y contarlo como tal ponía en el informe la frase «1
     * elemento(s) ya los había detectado el motor» en páginas donde el motor no
     * había visto nada. Una evidencia falsa, escrita por nosotros, en un
     * entregable con efectos legales. */
    const delMotor = new Set((yaFallanNodos && yaFallanNodos[sc]) || []);
    const vistos = new Set();
    let repetidos = 0;
    vs.forEach(function (v) {
      const s = SEV_AXE[v.impact];
      if (s && (ORDEN[s] || 0) > peor) { peor = ORDEN[s]; sev = s; }
      (v.nodes || []).forEach(function (n) {
        const locator = (Array.isArray(n.target) ? n.target : [n.target]).filter(Boolean).join(" ") || "(sin selector)";
        // La RUTA canónica es lo que permite cruzar con el motor: el selector de
        // axe y el del motor nombran el mismo elemento de dos maneras distintas.
        // Ver `render-analyze.js`, donde se resuelve con la página abierta.
        const path = n.__path || null;
        // Antes se descartaba el criterio ENTERO si el motor ya fallaba en él, así
        // que 25 imágenes sin alt vistas por axe se perdían porque el motor había
        // visto una. Lo que se repite es el ELEMENTO, no el criterio.
        if ((path && delMotor.has(path)) || delMotor.has(locator)) { repetidos++; return; }
        const clave = path || locator;
        if (vistos.has(clave)) return;   // otra regla de axe, el mismo elemento
        vistos.add(clave);
        nodes.push({ locator: locator, name: v.id, path: path || "" });
      });
    });
    if (!nodes.length) return;
    out.push({
      c: { n: sc, t: WIX[sc].t, lvl: WIX[sc].lvl },
      verdict: "falla",
      sev: sev,
      nodes: nodes,   // SIN tope: cada elemento afectado es una fila del IRA
      evid: vs.map(function (v) { return "axe-core «" + v.id + "»: " + (v.help || v.description || ""); })
        .concat(repetidos ? ["(" + repetidos + " elemento(s) ya los había detectado el motor: no se duplican)"] : []),
      scope: "render", origen: "axe-core", en: enClause(sc)
    });
  });
  return out;
}

/**
 * Mediciones por píxeles → hallazgos con forma de criterio.
 *
 * `__meta` no es un criterio: es la nota de cobertura de la propia sonda (las
 * restauraciones que no alcanzaron a un elemento). Sin filtrarla, esa nota
 * instrumental se convertía en una fila de 1.4.3 «revisar» con el texto de la
 * sonda dentro, mezclada con las barreras de contraste de verdad. Va por la vía
 * de las coberturas, que es la que ahora ata los veredictos.
 */
export function pixelFindings(mediciones) {
  return (mediciones || []).filter(function (m) { return m && m.crit !== "__meta"; }).map(function (m) {
    return {
      c: { n: "1.4.3", t: WIX["1.4.3"].t, lvl: WIX["1.4.3"].lvl },
      verdict: m.verdict,
      sev: m.verdict === "falla" ? "grave" : null,
      // `path`: si no se copia, la columna Selector del informe sale vacía justo
      // en las barreras que una persona no puede localizar a ojo (texto sobre
      // degradado), que son las que más falta hace poder señalar.
      nodes: [{ locator: m.node, name: "", path: m.uid || m.path || "" }],
      evid: [m.node + ": " + m.detail],
      scope: "render", origen: "píxeles", en: enClause("1.4.3")
    };
  });
}

function versionAxe() {
  try { return createRequire(import.meta.url)("axe-core/package.json").version; } catch (e) { return null; }
}

/**
 * Audita una página completa.
 *
 * @param {{url?:string, html?:string}} target
 * @param {{ capas?: {render?:boolean, viewport?:boolean, dynamic?:boolean, axe?:boolean},
 *           capas.huella saca la huella para los criterios de sitio (barata, activa por defecto),
 *           launchOptions?, waitMs?, timeout?, measureLimit?, forms?, maxTabs?, maxWidgets?,
 *           baseW?, baseH? }} [opts]
 */
export async function auditRun(target, opts) {
  opts = opts || {};
  const capas = capasEfectivas(opts.capas);
  const t0 = Date.now();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(launchOptions(opts.launchOptions));
  const errores = [];
  const avisos = [];
  const corridas = [];

  async function capa(nombre, fn) {
    const ini = Date.now();
    try { const r = await fn(); corridas.push({ capa: nombre, ms: Date.now() - ini, ok: true }); return r; }
    catch (e) { errores.push({ capa: nombre, error: (e && e.message) || String(e) }); corridas.push({ capa: nombre, ms: Date.now() - ini, ok: false }); return null; }
  }

  try {
    const baseW = opts.baseW || 1280, baseH = opts.baseH || 1024;
    const page = await browser.newPage({ viewport: { width: baseW, height: baseH } });
    const compartido = { page: page, launchOptions: opts.launchOptions, waitMs: opts.waitMs, timeout: opts.timeout };

    // El orquestador abre la página UNA vez, aquí. Antes la navegación era un
    // efecto secundario de la capa de render: apagándola, todo lo demás medía
    // sobre about:blank y devolvía vacío sin dar ningún error.
    if (target.url) await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
    else if (target.html != null) await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + target.html + "</body></html>", { waitUntil: "load" });
    else throw new Error("auditRun necesita { url } o { html }");
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

    // 1) OBSERVAR — motor + ámbito de página + medición + axe
    const render = capas.render ? await capa("render", function () {
      return analyzeRendered(target, Object.assign({}, compartido, { yaAbierta: true, measureLimit: opts.measureLimit, axe: capas.axe }));
    }) : null;

    // Huella para la coherencia entre páginas (3.2.3/3.2.4/3.2.6/2.4.5). Se toma
    // ANTES de tocar nada: los criterios de sitio comparan la página tal cual es.
    const huella = capas.huella ? await capa("huella", function () {
      return page.evaluate(new Function("url", FINGERPRINT_BODY), target.url || null);
    }) : null;

    // 1 bis) Resolver por PÍXELES el contraste que getComputedStyle no puede.
    // Va aquí, todavía en la fase de observación, porque repinta el texto y lo
    // restaura: hay que hacerlo antes de que la adaptación cambie la maquetación.
    const pixeles = capas.pixeles ? await capa("píxeles", function () {
      return resolverContrastePorPixeles(page, { max: opts.maxPixeles || 12 });
    }) : null;

    // 2) MODIFICAR la presentación — adaptación del contenido
    const viewport = capas.viewport ? await capa("viewport", function () {
      return viewportAnalyze(target, Object.assign({}, compartido, { baseW: baseW, baseH: baseH, maxBloques: opts.maxBloques }));
    }) : null;

    // 3) INTERACTUAR — prueba dinámica (la última: deja la página tocada)
    const dynamic = capas.dynamic ? await capa("dinámico", function () {
      return dynamicAnalyze(target, Object.assign({}, compartido, { forms: opts.forms, maxTabs: opts.maxTabs, maxWidgets: opts.maxWidgets }));
    }) : null;

    // ── Unificación ──
    // Lo tratado por píxeles SUSTITUYE al «no medible» de la medición normal para
    // ese mismo elemento. Vale tanto si se resolvió —arrastrar el pendiente sería
    // dejar en el informe un trabajo que ya está hecho— como si no: cuando no se
    // pudo, la capa de píxeles dice POR QUÉ («el color es transparent», «está en
    // un canvas»), y eso le sirve a una persona auditora; «no medible
    // automáticamente» a secas, no.
    // Por RUTA, no por locator. El locator («p.hero») lo comparten todos los
    // hermanos con la misma clase, así que resolver UNO por píxeles borraba los
    // pendientes de TODOS: cuatro textos sobre degradado sin comprobar
    // desaparecían del informe, ni como barrera ni como pendiente. La ruta única
    // ya viaja en los dos lados (`path` en la medición, `uid` en los píxeles).
    const tratadosPorPixel = new Set((pixeles || [])
      .map(function (p) { return p.uid || p.path; })
      .filter(Boolean));
    const findingsRender = ((render && render.findings) || []).filter(function (f) {
      if (f.c.n !== "1.4.3" || f.verdict !== "revisar") return true;
      if (!/imagen o degradado/.test((f.evid || []).join(" "))) return true;
      const ruta = (f.nodes && f.nodes[0] && f.nodes[0].path) || "";
      // Sin ruta no se puede afirmar que sea el mismo elemento: se conserva el
      // pendiente. Perder una barrera es peor que repetir una fila.
      return !ruta || !tratadosPorPixel.has(ruta);
    });

    let findings = [].concat(
      findingsRender,
      pixelFindings(pixeles),
      (viewport && viewport.findings) || [],
      (dynamic && dynamic.findings) || []
    );

    /* Y se retira el RELLENO del motor en los criterios de los que la capa sí habló.
     *
     * El motor, que solo lee el marcado, deja un `revisar`/`humano` por criterio
     * diciendo «lo mide la capa de X». Cuando esa capa corre y dictamina, el
     * relleno no aporta nada —y sí estorba: el rollup se queda con el PEOR
     * veredicto del criterio, así que un `revisar` de relleno dejaba pendiente
     * un criterio que la capa había medido. Medido sobre el sitio de prueba con
     * la capa dinámica encendida: 2.1.2 salía 15 `revisar` de relleno conviviendo
     * con 15 `cumple-parcial` de la capa, y el criterio se quedaba en `revisar`
     * en el informe. Esa es buena parte de la columna de criterios que nunca
     * concluían nada.
     *
     * Retirar el relleno NO vuelve conforme lo que estaba medido a medias: las
     * notas de cobertura siguen atando después (`aplicaCoberturas`), y el
     * barrido final sigue nombrando lo que se quede sin nadie que hable. */
    const conCapa = {};
    findings.forEach(function (f) {
      if (f && f.c && f.c.n && f.origen !== "motor-sin-capa") conCapa[f.c.n] = 1;
    });
    const rellenosRetirados = [];
    findings = findings.filter(function (f) {
      if (f && f.origen === "motor-sin-capa" && f.c && conCapa[f.c.n]) { rellenosRetirados.push(f.c.n); return false; }
      return true;
    });

    /* Las notas de cobertura ATAN los criterios que limitan.
     *
     * Hasta aquí estas notas solo iban a `avisos` —prosa al final del informe—
     * y no tocaban ningún veredicto. El resultado era una incoherencia dentro
     * del propio agente: la capa de adaptación bajaba a `revisar` cuando su
     * medición estaba recortada (`informeRecorte`), mientras que la de render
     * podía declarar 2.4.3 `pasa` habiendo medido 20 de 500 controles, con la
     * nota que lo decía a cuatro páginas de distancia. Un criterio medido a
     * medias no es un criterio conforme. */
    const coberturas = ((render && render.coberturas) || [])
      .concat((pixeles || []).filter(function (m) { return m && m.crit === "__meta"; }));
    const ataduras = aplicaCoberturas(findings, coberturas);
    findings = ataduras.findings;
    // Un aviso por CRITERIO, no por elemento: con el tope bajo, 200 controles
    // daban 102 líneas repitiendo lo mismo y el informe era ilegible.
    const porCriterio = {};
    ataduras.atados.forEach(function (a) {
      const k = a.n + "||" + a.por;
      porCriterio[k] = (porCriterio[k] || 0) + 1;
    });
    Object.keys(porCriterio).forEach(function (k) {
      const p = k.split("||");
      avisos.push("El criterio " + p[0] + " no se declara conforme en " + porCriterio[k] +
        " medición(es): la medición de la página está incompleta — " + p[1] + ".");
    });

    // axe: solo lo que el motor no ha visto ya.
    let axeExtra = [], reconciliacion = null;
    const axeViol = render && Array.isArray(render.axe) ? render.axe : null;
    if (axeViol) {
      // Qué ELEMENTOS ha visto ya el motor en cada criterio, no solo qué
      // criterios: así axe aporta las instancias nuevas en vez de perderse entero.
      // Se apuntan las RUTAS, no los locators legibles. El locator del motor es
      // «img» y el de axe `img[src="a.png"]`: comparar esas dos cadenas no casaba
      // nunca, así que la deduplicación no se disparaba jamás y cada barrera que
      // ven las dos fuentes salía dos veces en el IRA. La ruta canónica
      // (`html > body > main:nth-of-type(1) > img:nth-of-type(1)`) sí identifica.
      const yaFallan = {};
      findings.filter(function (f) { return f.verdict === "falla"; }).forEach(function (f) {
        const k = f.c.n;
        if (!yaFallan[k]) yaFallan[k] = [];
        (f.nodes || []).forEach(function (nd) {
          if (!nd) return;
          if (nd.path) yaFallan[k].push(nd.path);
          if (nd.uid && nd.uid !== nd.path) yaFallan[k].push(nd.uid);
          // El locator se sigue apuntando por si otra capa no trae ruta: no casa
          // con axe, pero tampoco estorba.
          if (nd.locator) yaFallan[k].push(nd.locator);
        });
      });
      axeExtra = axeFindingsNuevos(axeViol, yaFallan);
      findings = findings.concat(axeExtra);
      // El informe de reconciliación: dónde coinciden las dos fuentes, dónde solo
      // ve el motor y dónde solo axe. `reconcile` existía y no lo llamaba nadie,
      // así que esa lectura —la que dice cuánto se fía uno de cada capa— no
      // llegaba nunca al informe. (La CORRECCIÓN sí llegaba: los hallazgos de axe
      // se agregan y `worseOf` baja un `cumple` a `falla`; esto es la foto de
      // conjunto, no el rescate.)
      reconciliacion = reconcile(
        findings.filter(function (f) { return f.verdict === "falla" && f.origen !== "axe-core"; }),
        axeViol
      );
    } else if (capas.axe && render && render.axe && render.axe.error) {
      avisos.push("axe-core no se pudo ejecutar: " + render.axe.error);
    }

    // Los de la capa de RENDER también, que es la que monta el cuaderno y la
    // auditoría de página: cuando una de esas fases se cae, sin esto el informe no
    // decía nada y los criterios afectados simplemente no aparecían.
    (render && render.errores || []).forEach(function (e) { errores.push(Object.assign({ capa: "render" }, e)); });
    (viewport && viewport.errores || []).forEach(function (e) { errores.push(Object.assign({ capa: "viewport" }, e)); });
    (dynamic && dynamic.errores || []).forEach(function (e) { errores.push(Object.assign({ capa: "dinámico" }, e)); });
    (dynamic && dynamic.avisos || []).forEach(function (a) { avisos.push(a); });
    ((render && render.coberturas) || []).forEach(function (c) { avisos.push(c.detail); });

    /* Y lo último: nombrar los criterios de los que no habló nadie. Va aquí, con
       todas las capas ya volcadas en `findings`, porque solo entonces se sabe
       qué quedó en silencio. Los de coherencia no, que los decide `auditSite`. */
    /* Antes del silencio: los criterios que SÍ tienen veredicto pero cuya sonda no
       corrió. Si no se dice, el informe los confunde con «necesita una persona». */
    const apagadas = notaDeCapaApagada(findings, capas, { sitio: false });
    if (apagadas.length) {
      avisos.push("La sonda de " + apagadas.length + " criterio(s) NO se ejecutó en esta pasada (" +
        apagadas.join(", ") + "): su veredicto no es el resultado de haberlos medido, y así lo dice cada ficha. " +
        "Si alguno salía conforme, se ha bajado a «revisar»: una conformidad firmada con la sonda apagada no es una conformidad.");
    }

    const silencio = criteriosEnSilencio(findings, capas, { sitio: false });
    if (silencio.length) {
      findings = findings.concat(silencio);
      avisos.push("Hay " + silencio.length + " criterio(s) de los que ninguna capa ha dicho nada en esta página (" +
        silencio.map(function (f) { return f.c.n; }).join(", ") + "): salen como «revisar» explicando por qué, " +
        "no en blanco. Un criterio sin comprobar no puede exportarse como conforme.");
    }

    const cuenta = {};
    findings.forEach(function (f) { cuenta[f.verdict] = (cuenta[f.verdict] || 0) + 1; });

    return {
      url: target.url || null,
      findings: findings,
      // El cuaderno de juicio de esta página, tal como lo montó la capa de
      // render (que es donde están el DOM ejecutado y el CSS resuelto).
      cuaderno: (render && render.cuaderno) || null,
      render: render, viewport: viewport, dynamic: dynamic,
      huella: huella, pixeles: pixeles,
      axeExtra: axeExtra,
      avisos: avisos,
      errores: errores,
      // Trazabilidad: sin esto, un informe con efectos legales no es reproducible.
      procedencia: {
        fecha: new Date().toISOString(),
        objetivo: target.url || "(fragmento HTML)",
        motor: "agente-a11y-motor",
        criterios: WCAG22.length + " criterios WCAG 2.2 A+AA",
        navegador: "Chromium " + browser.version(),
        viewportBase: baseW + "×" + baseH,
        axe: axeViol ? "axe-core " + (versionAxe() || "?") : (capas.axe ? "no disponible" : "desactivado"),
        capas: corridas,
        duracionMs: Date.now() - t0
      },
      reconciliacion: reconciliacion,
      // Un cubo por veredicto del vocabulario, `no-aplica` incluido: el cuaderno
      // emite hasta once hallazgos `no-aplica` por página y sin su cubo se
      // evaporaban del resumen —los criterios estaban decididos y el resumen
      // decía que no existían—. `otros` recoge cualquier veredicto que no
      // conozcamos, para que un vocabulario nuevo se note en vez de perderse.
      summary: (function () {
        const s = {
          falla: cuenta.falla || 0, revisar: cuenta.revisar || 0, humano: cuenta.humano || 0,
          "cumple-parcial": cuenta["cumple-parcial"] || 0, pasa: cuenta.pasa || 0, cumple: cuenta.cumple || 0,
          "no-aplica": cuenta["no-aplica"] || 0
        };
        s.otros = Object.keys(cuenta).reduce(function (a, k) { return s[k] === undefined ? a + cuenta[k] : a; }, 0);
        s.criteriosDistintos = new Set(findings.map(function (f) { return f.c.n; })).size;
        s.soloAxe = axeExtra.length;
        return s;
      })()
    };
  } finally {
    await browser.close();
  }
}

export { scFromAxeTag };


/**
 * Audita una MUESTRA de páginas y añade los criterios de sitio.
 *
 * Cuatro criterios —3.2.3 Navegación coherente, 3.2.4 Identificación coherente,
 * 3.2.6 Ayuda coherente y 2.4.5 Múltiples vías— no se pueden dictaminar mirando
 * una página: hablan de comparar unas con otras. El motor los daba por
 * «evaluación humana» por eso; con la muestra delante son deterministas.
 *
 * Los hallazgos de sitio se anexan a CADA página, para que el rollup por criterio
 * los vea, y también se devuelven aparte.
 *
 * @param {Array<{url:string}>} targets
 * @param {object} [opts]  los de auditRun, más `onPage(resultado)`
 */
export async function auditSite(targets, opts) {
  opts = opts || {};
  const paginas = [];
  const fallidas = [];
  for (const t of (targets || [])) {
    // Una página que no carga NO puede llevarse por delante la auditoría entera.
    // `page.goto` está fuera de `capa()`, así que un timeout o un DNS caído
    // lanzaba desde `auditRun` y, sin este try, la página 12 de 15 tiraba las
    // once ya auditadas: ni muestra, ni rollup, ni CSV, después de doce arranques
    // de navegador. Se registra como NO EVALUADA y se sigue.
    let r;
    try {
      r = await auditRun({ url: t.url }, opts);
    } catch (e) {
      const motivo = (e && e.message ? e.message : String(e)).split("\n")[0];
      fallidas.push({ url: t.url, error: motivo });
      r = { url: t.url, error: motivo, findings: [], avisos: ["La página no se pudo auditar: " + motivo], errores: [{ capa: "carga", error: motivo }] };
    }
    paginas.push(r);
    if (opts.onPage) opts.onPage(r);
  }
  const huellas = paginas.map(function (p) { return p.huella; }).filter(Boolean);
  const coherencia = analyzeCoherence(huellas);

  /* El cuaderno de juicio, de la MUESTRA y no de cada página.
   *
   * Cada página trae el suyo, pero los once criterios de juicio son del SITIO:
   * uno aplica si aplica en una sola página, y 3.3.7 solo se ve cruzando unas
   * con otras (el dato que se pide en el paso 1 y otra vez en el paso 3).
   *
   * Así que los de página se retiran del informe agregado y se pone el de la
   * muestra, una vez. Dejar los dos llenaría el CSV de N copias del mismo
   * expediente —una por página— diciendo cosas distintas del mismo criterio.
   * Los cuadernos por página siguen en `paginas[i].cuaderno` para el detalle. */
  const cuadernos = paginas.map(function (p) { return p.cuaderno; }).filter(Boolean);
  /* Las páginas que faltan van AL cuaderno, no solo al aviso de arriba.
   *
   * El cuaderno de la muestra decide «no aplica en el sitio» cuando no aplica en
   * ninguna página, y con dos de tres páginas caídas eso llegaba a poner nueve
   * criterios como «No aplica» para el sitio entero a partir de UNA página. Con
   * la lista de huecos delante, el cuaderno los deja pendientes y explica por qué. */
  const cuaderno = cuadernos.length
    ? cuadernoDeMuestra(cuadernos, {
        sitio: opts.sitio || null,
        sinAnalizar: paginas.filter(function (p) { return p.error || !p.cuaderno; }).map(function (p) { return p.url; })
      })
    : null;
  const deJuicio = cuaderno ? findingsDelCuaderno(cuaderno) : [];
  const sinJuicio = function (list) {
    return (list || []).filter(function (f) { return f.scope !== "juicio"; });
  };

  // Cada hallazgo lleva su URL: la columna "Página" del IRA la necesita.
  const findings = [];
  paginas.forEach(function (p) {
    sinJuicio(p.findings).forEach(function (f) { findings.push(Object.assign({ url: p.url }, f)); });
  });
  coherencia.forEach(function (f) { findings.push(Object.assign({ url: "(toda la muestra)" }, f)); });
  deJuicio.forEach(function (f) { findings.push(Object.assign({ url: "(toda la muestra)" }, f)); });

  /* El barrido del SITIO. El de cada página ya habló de lo suyo, pero los
     criterios de coherencia solo se pueden decidir aquí, y si `analyzeCoherence`
     no emitiera nada —muestra de una sola página, huellas que no se pudieron
     sacar— se quedaban en blanco en el agregado. Se barre sobre lo ya reunido,
     con los de sitio incluidos esta vez. */
  const silencioSitio = criteriosEnSilencio(findings, Object.assign(capasEfectivas((opts || {}).capas), { coherencia: true }), { sitio: true });
  silencioSitio.forEach(function (f) { findings.push(Object.assign({ url: "(toda la muestra)" }, f)); });

  // El rollup necesita ver la coherencia y el cuaderno en todas las páginas para
  // que el peor veredicto del criterio sea el del sitio, no el de una suelta.
  const pages = paginas.map(function (p) {
    const propios = sinJuicio(p.findings);
    return {
      url: p.url,
      // `error` y `analizada` viajan con la página, y no son adorno: son lo que
      // permite a `rollupSample` distinguir una página SIN barreras de una página
      // que no se llegó a auditar. Sin ellos, los hallazgos de sitio que se
      // añaden justo aquí —coherencia y cuaderno— rellenaban la lista de toda
      // página caída y el guardia de «muestra incompleta» no se disparaba nunca.
      error: p.error || null,
      analizada: !p.error && propios.length > 0,
      findings: propios.concat(coherencia).concat(deJuicio).concat(silencioSitio)
    };
  });

  return {
    paginas: paginas,
    coherencia: coherencia,
    cuaderno: cuaderno,
    findings: findings,
    rollup: rollupSample(pages),
    procedencia: {
      fecha: new Date().toISOString(),
      muestra: paginas.map(function (p) { return p.url; }),
      paginas: paginas.length,
      porPagina: paginas.map(function (p) { return p.procedencia; })
    },
    errores: paginas.reduce(function (a, p) { return a.concat((p.errores || []).map(function (e) { return Object.assign({ url: p.url }, e); })); }, []),
    // Las páginas que no se pudieron auditar se dicen, y arriba del todo: una
    // muestra con huecos no es una muestra más pequeña, es una muestra incompleta.
    paginasFallidas: fallidas,
    avisos: (fallidas.length
      ? ["ATENCIÓN: " + fallidas.length + " de " + paginas.length + " página(s) de la muestra NO se han podido auditar (" +
         fallidas.slice(0, 4).map(function (f) { return f.url + ": " + f.error; }).join(" · ") + (fallidas.length > 4 ? " · …" : "") +
         "). La conformidad que salga de aquí no cubre esas páginas."]
      : []).concat(paginas.reduce(function (a, p) { return a.concat(p.avisos || []); }, []))
  };
}
