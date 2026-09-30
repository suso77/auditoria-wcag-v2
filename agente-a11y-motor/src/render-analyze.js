/**
 * Análisis sobre render REAL.
 *
 * Renderiza una URL (o HTML) en un navegador de verdad y:
 *   1) toma el DOM ya renderizado (post-JS) y lo pasa por el motor determinista;
 *   2) mide contraste/foco/tamaño/orden con getComputedStyle y layout REALES
 *      inyectando el núcleo de medición en la página;
 *   3) opcionalmente corre axe-core sobre la misma página.
 *
 * Es el puente de "componente aislado" a "página real". Solo Node (usa Playwright
 * y, para el motor, el DOMParser de linkedom). La medición inyectada es el mismo
 * código que puede correr la extensión de Chrome sobre una pestaña viva.
 */
import { understand, analyze, setDOMParser, WCAG22 } from "./engine.js";
import { launchOptions } from "./playwright-launch.js";
import { MEASURE_BODY } from "./measure.browser.js";
import { auditPageDoc } from "./page-audit.js";
import { cuadernoDeJuicio, aplicaCuaderno, CRITERIOS_DE_JUICIO } from "./cuaderno.js";

const WIX = {};
WCAG22.forEach(function (c) { WIX[c.n] = { t: c.t, lvl: c.lvl }; });

function tally(list, key) {
  const t = {};
  (list || []).forEach(function (x) { const k = x[key]; t[k] = (t[k] || 0) + 1; });
  return t;
}
// Gravedad de una barrera detectada por medición. Sin esto las filas de
// "Barreras" del IRA salían con la columna Gravedad en blanco.
const SEV_MEDICION = { "2.1.1": "crítica", "1.4.3": "grave", "1.4.1": "grave", "2.4.7": "grave", "2.4.11": "grave", "2.2.2": "grave", "2.5.8": "moderada", "2.4.3": "moderada" };

// Convierte las mediciones del render real en hallazgos con forma de criterio.
// `__meta` no es un criterio WCAG: es el aviso de cobertura de la medición.
function measurementFindings(measurements) {
  return (measurements || []).filter(function (m) { return m.crit !== "__meta"; }).map(function (m) {
    return {
      c: { n: m.crit, t: (WIX[m.crit] ? WIX[m.crit].t : m.label), lvl: (WIX[m.crit] ? WIX[m.crit].lvl : "AA") },
      verdict: m.verdict,
      sev: m.verdict === "falla" ? (SEV_MEDICION[m.crit] || "grave") : null,
      // El locator viaja también como nodo: la columna "Elemento" del IRA lo necesita.
      nodes: [{ locator: m.node, name: "", path: m.path || "" }],
      evid: [m.node + ": " + m.detail],
      scope: "render", origen: "medición"
    };
  });
}

/**
 * @param {{url?:string, html?:string}} target
 * @param {{ launchOptions?, waitUntil?, timeout?, waitMs?, measureLimit?, axe?:boolean }} [opts]
 */
export async function analyzeRendered(target, opts) {
  opts = opts || {};
  // El motor necesita un DOMParser en Node.
  let DP = (typeof DOMParser !== "undefined") ? DOMParser : null;
  try { const m = await import("linkedom"); DP = m.DOMParser; setDOMParser(DP); } catch (e) { /* en navegador ya existe */ }

  // `opts.page` permite reutilizar una página ya abierta: el orquestador audita
  // una página entera con UN solo Chromium en vez de lanzar uno por fase.
  const prestada = !!opts.page;
  const { chromium } = prestada ? {} : await import("playwright");
  const browser = prestada ? null : await chromium.launch(launchOptions(opts.launchOptions));
  try {
    const page = opts.page || await browser.newPage();
    if (opts.yaAbierta) { /* la página ya está en el destino */ }
    else if (target.url) await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
    else if (target.html != null) await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + target.html + "</body></html>", { waitUntil: "load" });
    else throw new Error("analyzeRendered necesita { url } o { html }");
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

    // 1) DOM renderizado → motor determinista + auditoría de página
    const html = await page.evaluate(function () { return document.documentElement.outerHTML; });
    const model = understand(html);
    const analysis = model ? analyze(model) : { summary: null, findings: [] };

    // Los criterios de ÁMBITO DE PÁGINA (title, lang, landmarks, saltar bloques)
    // solo tienen sentido sobre una página real. Con `{html}` analizamos un
    // FRAGMENTO metido en un documento sintético: auditarlo como página fabricaba
    // barreras que no son del componente (2.4.2 «sin title», 3.1.1, 2.4.1…).
    const pageScope = (opts.pageScope != null) ? !!opts.pageScope : !!target.url;
    let pageAudit = [];
    let cuaderno = null;
    /* Lo que falla se APUNTA, y lo que deja de comprobarse se DICE.
     *
     * Aquí había tres `catch` vacíos seguidos y una salida sin campo de errores —a
     * diferencia de `viewportAnalyze`, que sí devuelve `errores`—. Si la fase del
     * cuaderno reventaba, `cuaderno` quedaba en `null`, `aplicaCuaderno` no corría, y
     * los criterios que el cuaderno resuelve desaparecían de `findings`: ni hallazgo,
     * ni `revisar`, ni nota. Reproducido con un script que envuelve
     * `document.styleSheets` para que lance —el patrón de los scripts de
     * consentimiento y anti-bot—: de 36 criterios se pasaba a 28, y los ocho que
     * faltaban (1.2.4, 1.2.5, 1.3.2, 1.4.5, 2.3.1, 3.3.4, 3.3.7, 3.3.8) no aparecían
     * en ninguna parte. En un IRA, un criterio que no está es un criterio del que
     * nadie sabe que no se comprobó, y eso es peor que un `revisar`. */
    const errores = [];
    const coberturasPropias = [];
    if (pageScope) {
      let docPagina = null;
      try { docPagina = new DP().parseFromString(html, "text/html"); }
      catch (e) {
        docPagina = null;
        errores.push({ capa: "página", error: "no se pudo reparsear el DOM renderizado: " + ((e && e.message) || e) });
        coberturasPropias.push({ crit: "__meta", label: "Ámbito de página sin comprobar", node: "(documento)", verdict: "revisar",
          detail: "el DOM renderizado no se pudo volver a parsear, así que NO se han comprobado los criterios de ámbito de página (2.4.1, 2.4.2, 3.1.1, 1.3.1 estructural) ni el cuaderno de juicio. No es que cumplan: es que no se han mirado." });
      }
      if (docPagina) {
        try { pageAudit = auditPageDoc(docPagina); }
        catch (e) {
          pageAudit = [];
          errores.push({ capa: "página", error: "auditPageDoc lanzó: " + ((e && e.message) || e) });
          coberturasPropias.push({ crit: "__meta", label: "Ámbito de página sin comprobar", node: "(documento)", verdict: "revisar",
            detail: "la auditoría de página falló (" + ((e && e.message) || e) + "): los criterios de ámbito de página —title, idioma, landmarks, saltar bloques— NO se han comprobado en esta ejecución." });
        }
        /* El cuaderno de juicio, sobre el MISMO documento y con el CSS ya
         * resuelto por el navegador.
         *
         * Va aquí y no aparte porque aquí está lo que necesita y no hay en
         * ningún otro sitio: el DOM después de ejecutar los scripts, y las
         * reglas de las hojas de estilo externas —que es lo que le hace falta a
         * 2.3.1 para saber si hay animaciones declaradas. Montándolo fuera, con
         * el HTML servido, ese criterio se quedaba corto sin decirlo. */
        if (opts.cuaderno !== false) {
          /* El CSS es un EXTRA del cuaderno, no un requisito.
           *
           * Solo 2.3.1 lo necesita (para ver animaciones declaradas en hojas
           * externas). Que no se pueda leer no es motivo para quedarse sin cuaderno
           * entero: se monta sin CSS, se dice que 2.3.1 va corto, y los otros diez
           * criterios siguen en el informe. Antes, un fallo al leer las hojas se
           * llevaba los once por delante. */
          let css = null;
          try {
            css = await page.evaluate(function () {
              return Array.prototype.map.call(document.styleSheets, function (s) {
                try { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join("\n"); }
                catch (e) { return ""; }   // hoja de otro origen: no se puede leer
              }).join("\n");
            });
          } catch (e) {
            css = null;
            errores.push({ capa: "cuaderno", error: "no se pudieron leer las hojas de estilo: " + ((e && e.message) || e) });
            coberturasPropias.push({ crit: "__meta", label: "CSS no legible", node: "(hojas de estilo)", verdict: "revisar",
              detail: "las hojas de estilo de la página no se pudieron leer (" + ((e && e.message) || e) +
                "): el cuaderno se ha montado sin ellas, así que 2.3.1 solo ha visto las animaciones declaradas en el marcado. Comprueba a mano si hay animaciones en un CSS aparte." });
          }
          try {
            cuaderno = cuadernoDeJuicio(docPagina, { url: target.url || null, css: css || "" });
          } catch (e) {
            cuaderno = null;
            errores.push({ capa: "cuaderno", error: "cuadernoDeJuicio lanzó: " + ((e && e.message) || e) });
            coberturasPropias.push({ crit: "__meta", label: "Cuaderno de juicio sin montar", node: "(documento)", verdict: "revisar",
              detail: "el cuaderno de juicio falló (" + ((e && e.message) || e) + "): los once criterios que resuelve (" +
                CRITERIOS_DE_JUICIO.join(", ") + ") se quedan como los deja el motor, sin el expediente que dice qué mirar en cada uno. " +
                "Ninguno está comprobado por esta vía." });
          }
        }
      }
    }

    // 2) Medición sobre estilos/layout reales.
    //    Vía page.evaluate (CDP): a diferencia de addScriptTag, no la bloquea la CSP.
    const measurements = await page.evaluate(new Function("lim", MEASURE_BODY), opts.measureLimit || 400);

    /* Y la misma medición DENTRO de cada marco.
     *
     * `page.evaluate` corre en el marco principal y nada más, así que el contenido de
     * un `<iframe>` no se medía: ni contraste, ni tamaño de objetivos, ni foco. En un
     * sitio que mete el formulario de pago, el reproductor o el mapa en un marco, eso
     * es la parte que más falta hace comprobar. Se mide marco a marco y los hallazgos
     * se sellan con el marco de donde vienen, para que el informe diga dónde está la
     * barrera y no solo que existe.
     *
     * Un marco de otro origen no se puede evaluar —la política del navegador lo
     * impide, y no es un fallo nuestro— y se declara como nota de cobertura. */
    const medicionMarcos = [];
    if (opts.marcos !== false) {
      const marcos = page.frames().filter(function (f) { return f !== page.mainFrame(); });
      for (const marco of marcos.slice(0, 10)) {
        const url = (function () { try { return marco.url(); } catch (e) { return ""; } })();
        if (!url || url === "about:blank") continue;
        const etiqueta = "marco " + url.slice(0, 80);
        try {
          const dentro = await marco.evaluate(new Function("lim", MEASURE_BODY), opts.measureLimit || 400);
          (dentro || []).forEach(function (m) {
            medicionMarcos.push(Object.assign({}, m, {
              node: etiqueta + " » " + m.node,
              path: m.path ? etiqueta + " » " + m.path : m.path,
              marco: url
            }));
          });
        } catch (e) {
          // Otro origen, o el marco se fue a mitad: se dice, no se calla.
          errores.push({ capa: "marco", error: "no se pudo medir " + url.slice(0, 80) + ": " + ((e && e.message) || e) });
          coberturasPropias.push({ crit: "__meta", label: "Marco no medible", node: url.slice(0, 60), verdict: "revisar",
            detail: "el marco « " + url.slice(0, 80) + " » no se puede medir desde aquí (lo más probable: es de otro origen y el navegador no deja entrar). " +
              "Su contenido NO está comprobado: audítalo por su propia URL." });
        }
      }
    }
    // TODAS, no la primera: la medición emite hasta tres notas de cobertura
    // (texto recortado por el límite, controles recortados, y 2.4.7 sin el foco
    // del sistema). Con `.find` la segunda y la tercera se perdían en silencio.
    const todasLasMedidas = (measurements || []).concat(medicionMarcos);
    const coberturas = coberturasPropias.concat(todasLasMedidas.filter(function (m) { return m.crit === "__meta"; }));

    // 3) axe-core (opcional)
    let axe = null;
    if (opts.axe) {
      try {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
        /* Cada nodo de axe sale con la RUTA del motor al lado, resuelta aquí.
         *
         * axe identifica los elementos con su propio selector mínimo
         * (`img[src="a.png"]`, `a`, `.btn > span`); el motor los identifica con la
         * ruta canónica `html > body > tag:nth-of-type(n) > …`. Son dos maneras de
         * nombrar el MISMO elemento, y comparar las cadenas no casa nunca: por eso
         * la deduplicación motor↔axe no se disparaba jamás y la misma imagen sin
         * alt salía dos veces en el IRA, una por fuente, con `num_barreras` al
         * doble. El único sitio donde se puede resolver esto es aquí, con la
         * página abierta: se pasa el selector de axe por `querySelector` y se
         * calcula la ruta canónica del elemento que devuelve. */
        const r = await page.evaluate(async function () {
          const res = await axe.run(document, { resultTypes: ["violations"] });
          function rutaCanonica(el) {
            const partes = [];
            let n = el;
            while (n && n.nodeType === 1) {
              const t = n.tagName.toLowerCase();
              if (t === "html" || t === "body") break;
              const p = n.parentElement;
              if (!p) { partes.unshift(t); break; }
              let i = 1, s = p.firstElementChild;
              while (s && s !== n) { if (s.tagName === n.tagName) i++; s = s.nextElementSibling; }
              partes.unshift(t + ":nth-of-type(" + i + ")");
              n = p;
            }
            return partes.length ? "html > body > " + partes.join(" > ") : "body";
          }
          (res.violations || []).forEach(function (v) {
            (v.nodes || []).forEach(function (nd) {
              // `target` puede ser una cadena o una lista (un nivel por cada
              // frame anidado); el elemento vive en el último tramo.
              const t = nd.target;
              const sel = Array.isArray(t) ? t[t.length - 1] : t;
              try {
                const el = typeof sel === "string" ? document.querySelector(sel) : null;
                nd.__path = el ? rutaCanonica(el) : null;
              } catch (e) { nd.__path = null; }
            });
          });
          return res;
        });
        axe = r.violations || [];
      } catch (e) { axe = { error: (e && e.message) || String(e) }; }
    }

    // Hallazgos unificados (semántico + página + medición real), listos para el muestreo.
    let findings = (analysis.findings || []).concat(pageAudit).concat(measurementFindings(todasLasMedidas));
    // El cuaderno sustituye el «requiere evaluación humana» genérico del motor
    // por lo suyo: «no aplica» donde no viene al caso, y el expediente donde sí.
    // No borra ninguna barrera real: eso lo garantiza `aplicaCuaderno`.
    if (cuaderno) findings = aplicaCuaderno(findings, cuaderno);

    return {
      url: target.url || null,
      model: model,
      analysis: analysis,
      pageScope: pageScope,
      pageAudit: pageAudit,
      cuaderno: cuaderno,
      measurements: todasLasMedidas,
      // Las del marco principal aparte, para quien quiera separarlas.
      medicionPrincipal: measurements || [],
      medicionMarcos: medicionMarcos,
      coberturas: coberturas,
      cobertura: coberturas[0] || null,
      // Los fallos de fase VIAJAN, como en `viewportAnalyze`. Sin esto, una capa
      // caída era indistinguible de una capa que no encontró nada.
      errores: errores,
      axe: axe,
      findings: findings,
      summary: {
        barreras: analysis.summary ? analysis.summary.falla : 0,
        pagina: tally(pageAudit, "verdict"),
        medicion: tally(measurements, "verdict"),
        axeViolaciones: Array.isArray(axe) ? axe.length : null
      }
    };
  } finally {
    if (browser) await browser.close();
  }
}
