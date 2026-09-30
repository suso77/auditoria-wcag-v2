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
import { WCAG22, enClause } from "./engine.js";

const WIX = {};
WCAG22.forEach(function (c) { WIX[c.n] = { t: c.t, lvl: c.lvl }; });

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

/** Mediciones por píxeles → hallazgos con forma de criterio. */
export function pixelFindings(mediciones) {
  return (mediciones || []).map(function (m) {
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
  const capas = Object.assign({ render: true, viewport: true, dynamic: false, axe: true, huella: true, pixeles: true }, opts.capas || {});
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
      findings: propios.concat(coherencia).concat(deJuicio)
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
