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
import { censoDeOyentes, analizaPuntero } from "./pointer.js";

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

    /* 0) LAS HOJAS DE OTRO ORIGEN, RESCATADAS — antes que nada que lea el CSSOM.
     *
     * `hoja.cssRules` lanza en una hoja servida desde otro dominio, y lo único
     * que se hacía era contarla: cada pasada de medición decía «1 hoja(s) de
     * estilo de otro origen no se han podido leer» y 2.4.7 se quedaba sin poder
     * declararse conforme — en un sitio real, 93, 225 y 41 mediciones en tres
     * páginas distintas. Lo mismo arrastraba a 2.3.1 y 1.3.4, que también leen
     * el CSSOM.
     *
     * Pero la hoja está ahí y se puede traer: la CORS es del navegador DENTRO de
     * la página, no de Playwright. Se piden los ficheros desde fuera y se le
     * pasan al documento.
     *
     * DONDE IMPORTA: no se inyectan en la página. Un `<style>` añadido
     * duplicaría reglas y movería la cascada, y entonces lo medido ya no sería
     * lo que ve el usuario. Se montan como `CSSStyleSheet` SUELTAS —
     * `replaceSync`, sin adoptar— y la medición las consulta aparte: se leen los
     * selectores y las declaraciones, que es lo único que necesita, y la página
     * se queda exactamente como estaba. */
    let rescate = null, falloRescate = null;
    try {
      /* Apagable, como todas las capas: `hojasExternas: false`. Hay redes donde
       * conviene que el agente no pida nada que el navegador no haya pedido ya.
       *
       * Y el candado: solo se piden URLs que la PROPIA PÁGINA declara en
       * `styleSheets[].href` y solo por http(s). Son ficheros que el navegador
       * ya ha descargado para pintar la página, así que esto no abre ningún
       * destino nuevo; lo que hace es volver a pedir el mismo desde fuera, donde
       * la CORS no aplica. */
      const urls = opts.hojasExternas === false ? [] : await page.evaluate(function () {
        const out = [];
        const hojas = document.styleSheets || [];
        for (let i = 0; i < hojas.length; i++) {
          try { if (hojas[i].cssRules) continue; } catch (e) {
            const h = hojas[i].href || "";
            if (/^https?:\/\//i.test(h)) out.push(h);
          }
        }
        return out;
      });
      if (urls.length) {
        const textos = [];
        for (const u of urls.slice(0, 12)) {
          try {
            const resp = await page.context().request.get(u, { timeout: 8000 });
            if (!resp.ok()) { textos.push({ url: u, error: "HTTP " + resp.status() }); continue; }
            const css = await resp.text();
            textos.push({ url: u, css: css.length > 2000000 ? css.slice(0, 2000000) : css });
          } catch (e) {
            textos.push({ url: u, error: (e && e.message) || String(e) });
          }
        }
        rescate = await page.evaluate(function (lista) {
          window.__a11yHojasRescatadas = [];
          const ok = [], mal = [];
          lista.forEach(function (x) {
            if (!x.css) { mal.push({ url: x.url, motivo: x.error || "sin contenido" }); return; }
            try {
              const h = new CSSStyleSheet();
              h.replaceSync(x.css);
              window.__a11yHojasRescatadas.push(h);
              ok.push({ url: x.url, reglas: h.cssRules.length });
            } catch (e) {
              mal.push({ url: x.url, motivo: "no se pudo parsear: " + ((e && e.message) || e) });
            }
          });
          return { rescatadas: ok, fallidas: mal };
        }, textos);
      }
    } catch (e) {
      /* El rescate corre ANTES de que exista la lista de errores —tiene que ir
       * por delante de todo lo que lee el CSSOM—, así que su fallo se guarda
       * aquí y se vuelca en cuanto la lista existe. Esto lo encontró el test de
       * «una fase caída no hace desaparecer criterios del informe»: la rama de
       * error era justo la que se rompía. */
      falloRescate = "el rescate de hojas falló: " + ((e && e.message) || e);
    }


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
    if (falloRescate) errores.push({ capa: "hojas-de-otro-origen", error: falloRescate });
    const coberturasPropias = [];
    if (pageScope) {
      let docPagina = null;
      try { docPagina = new DP().parseFromString(html, "text/html"); }
      catch (e) {
        docPagina = null;
        errores.push({ capa: "página", error: "no se pudo reparsear el DOM renderizado: " + ((e && e.message) || e) });
        coberturasPropias.push({ crit: "__meta", label: "Ámbito de página sin comprobar", node: "(documento)", verdict: "revisar",
          limita: ["2.4.1", "2.4.2", "3.1.1", "1.3.1"],
          detail: "el DOM renderizado no se pudo volver a parsear, así que NO se han comprobado los criterios de ámbito de página (2.4.1, 2.4.2, 3.1.1, 1.3.1 estructural) ni el cuaderno de juicio. No es que cumplan: es que no se han mirado." });
      }
      if (docPagina) {
        try { pageAudit = auditPageDoc(docPagina); }
        catch (e) {
          pageAudit = [];
          errores.push({ capa: "página", error: "auditPageDoc lanzó: " + ((e && e.message) || e) });
          coberturasPropias.push({ crit: "__meta", label: "Ámbito de página sin comprobar", node: "(documento)", verdict: "revisar",
            limita: ["2.4.1", "2.4.2", "3.1.1", "1.3.1"],
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
          /* Y las hojas que NO se pueden leer se cuentan, no se devuelven como vacías.
           *
           * El `catch` interior devolvía `""` por hoja, así que `css` no era `null` y la
           * nota de cobertura de abajo no se emitía NUNCA. Resultado medido con la misma
           * página servida de dos formas: con la animación en un `<style>` propio, 2.3.1
           * sale `humano`; con esa misma regla en una hoja de OTRO origen, 2.3.1 sale
           * `no-aplica` diciendo «no hay nada que pueda destellar», con `errores: []` y
           * sin una sola nota de cobertura. 2.3.1 es el criterio cuyo incumplimiento
           * puede provocar una crisis epiléptica: ahí no se puede firmar «no aplica»
           * sobre un CSS que nadie ha leído. */
          let css = null, cssBloqueadas = 0;
          try {
            const lectura = await page.evaluate(function () {
              let bloqueadas = 0;
              const trozos = Array.prototype.map.call(document.styleSheets, function (s) {
                try { return Array.prototype.map.call(s.cssRules, function (r) { return r.cssText; }).join("\n"); }
                catch (e) { bloqueadas++; return ""; }   // hoja de otro origen: no se puede leer
              });
              /* Y las de otro origen que se hayan podido traer desde fuera. Lo que
               * declaren —animaciones, reglas por orientación, revelados— decide
               * 2.3.1 y 1.3.4, así que no leerlas era decidirlos a medias. */
              (window.__a11yHojasRescatadas || []).forEach(function (h) {
                try {
                  trozos.push(Array.prototype.map.call(h.cssRules, function (r) { return r.cssText; }).join("\n"));
                  if (bloqueadas > 0) bloqueadas--;
                } catch (e) { /* ilegible incluso rescatada: sigue contando como bloqueada */ }
              });
              return { texto: trozos.join("\n"), bloqueadas: bloqueadas };
            });
            css = lectura.texto;
            cssBloqueadas = lectura.bloqueadas || 0;
            if (cssBloqueadas) {
              coberturasPropias.push({ crit: "__meta", label: "CSS parcialmente ilegible", node: "(hojas de estilo)", verdict: "revisar",
                limita: ["2.3.1", "1.3.4", "1.4.1", "2.4.7"],
                detail: cssBloqueadas + " hoja(s) de estilo de otro origen no se han podido leer. Lo que declaren esas hojas —animaciones, reglas por orientación, revelados— NO se ha visto: 2.3.1 y 1.3.4 se han decidido con el CSS que sí era legible." });
            }
          } catch (e) {
            css = null;
            errores.push({ capa: "cuaderno", error: "no se pudieron leer las hojas de estilo: " + ((e && e.message) || e) });
            coberturasPropias.push({ crit: "__meta", label: "CSS no legible", node: "(hojas de estilo)", verdict: "revisar",
              limita: ["2.3.1", "1.3.4", "1.4.1", "2.4.7"],
              detail: "las hojas de estilo de la página no se pudieron leer (" + ((e && e.message) || e) +
                "): el cuaderno se ha montado sin ellas, así que 2.3.1 solo ha visto las animaciones declaradas en el marcado. Comprueba a mano si hay animaciones en un CSS aparte." });
          }
          try {
            cuaderno = cuadernoDeJuicio(docPagina, { url: target.url || null, css: css || "", cssBloqueadas: cssBloqueadas, cssLeido: css != null });
          } catch (e) {
            cuaderno = null;
            errores.push({ capa: "cuaderno", error: "cuadernoDeJuicio lanzó: " + ((e && e.message) || e) });
            coberturasPropias.push({ crit: "__meta", label: "Cuaderno de juicio sin montar", node: "(documento)", verdict: "revisar",
              limita: CRITERIOS_DE_JUICIO.slice(),
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
            limita: ["1.4.3", "1.4.11", "2.4.7", "2.5.8", "2.1.1"],
            detail: "el marco « " + url.slice(0, 80) + " » no se puede medir desde aquí (lo más probable: es de otro origen y el navegador no deja entrar). " +
              "Su contenido NO está comprobado: audítalo por su propia URL." });
        }
      }
    }
    /* El censo de SHADOW ROOTS CERRADOS, preguntándoselo al navegador.
     *
     * Desde dentro de la página no se pueden enumerar: un root cerrado no se
     * expone en `el.shadowRoot`. El código inyectado se las arregla con una
     * heurística —elemento personalizado (con guion en el nombre), pintado, sin
     * hijos propios y sin shadowRoot accesible— y eso deja fuera el caso de un
     * `<div>` corriente con un root cerrado: no se detecta, no se emite la nota,
     * y los criterios de medición no quedan atados sobre contenido que nadie ha
     * podido mirar. Ésa es la dirección peligrosa del error.
     *
     * El protocolo de depuración sí lo sabe: `DOM.getDocument` con `pierce`
     * devuelve los shadow roots con su `shadowRootType`, cerrados incluidos. Así
     * que aquí se pregunta, y lo que diga CDP manda sobre la heurística. Si la
     * sesión CDP no se puede abrir (otro navegador, página cerrada), se queda la
     * heurística y no se pierde nada de lo que ya había. */
    let censoCDP = null;
    try {
      const cdp = await page.context().newCDPSession(page);
      try {
        const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
        const hosts = [];
        (function anda(n) {
          if (!n) return;
          (n.shadowRoots || []).forEach(function (sr) {
            if (sr.shadowRootType === "closed") hosts.push(n);
            anda(sr);
          });
          (n.children || []).forEach(anda);
        })(doc.root);
        const nombrados = [];
        for (const h of hosts.slice(0, 20)) {
          let loc = h.localName || "?";
          try {
            const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: h.backendNodeId });
            const r = await cdp.send("Runtime.callFunctionOn", {
              objectId: object.objectId, returnByValue: true,
              functionDeclaration: `function(){
                var partes=[], n=this;
                while(n && n.nodeType===1){
                  var t=n.tagName.toLowerCase();
                  if(t==='html'||t==='body') break;
                  var p=n.parentElement; if(!p){ partes.unshift(t); break; }
                  var i=1, s=p.children, k;
                  for(k=0;k<s.length;k++){ if(s[k]===n) break; if(s[k].tagName===n.tagName) i++; }
                  partes.unshift(t+':nth-of-type('+i+')');
                  n=p;
                }
                var id=this.id?('#'+this.id):'';
                var cl=(this.className&&typeof this.className==='string')?('.'+this.className.trim().split(/\\s+/).join('.')):'';
                return { ruta:'html > body > '+partes.join(' > '), loc:this.tagName.toLowerCase()+id+cl };
              }`
            });
            if (r && r.result && r.result.value) { nombrados.push(r.result.value); loc = r.result.value.loc; }
            else nombrados.push({ loc: loc, ruta: "" });
          } catch (e) { nombrados.push({ loc: loc, ruta: "" }); }
        }
        censoCDP = { total: hosts.length, hosts: nombrados };
      } finally { try { await cdp.detach(); } catch (e) { /* la sesión ya se fue */ } }
    } catch (e) {
      censoCDP = null;   // sin CDP: manda la heurística inyectada
    }

    /* El censo de OYENTES, que es de donde salen los cuatro criterios de puntero.
     *
     * Va aquí porque necesita el protocolo de depuración, igual que el censo de
     * shadow roots. Si no está disponible, `analizaPuntero` no dice nada y el
     * relleno del motor o el barrido se encargan: inventar un veredicto sin el
     * censo sería lo contrario de medir. */
    let oyentes = { disponible: false, motivo: "no se intentó" };
    try { oyentes = await censoDeOyentes(page); } catch (e) { oyentes = { disponible: false, motivo: (e && e.message) || String(e) }; }
    const hallazgosPuntero = analizaPuntero(oyentes);

    // TODAS, no la primera: la medición emite hasta tres notas de cobertura
    // (texto recortado por el límite, controles recortados, y 2.4.7 sin el foco
    // del sistema). Con `.find` la segunda y la tercera se perdían en silencio.
    const todasLasMedidas = (measurements || []).concat(medicionMarcos);
    let metaMedidas = todasLasMedidas.filter(function (m) { return m.crit === "__meta"; });
    if (censoCDP) {
      // El censo de verdad sustituye a la nota heurística: una sola nota, con la
      // lista completa, en vez de dos que se contradicen.
      metaMedidas = metaMedidas.filter(function (m) { return m.label !== "Shadow DOM cerrado"; });
      if (censoCDP.total) {
        coberturasPropias.push({
          crit: "__meta", label: "Shadow DOM cerrado", node: censoCDP.total + " componente(s)", verdict: "revisar",
          limita: ["1.4.3", "1.4.11", "2.4.7", "2.5.8", "2.4.3", "2.1.1"],
          /* Y además esconde CONTENIDO, no solo medidas. Es lo que invalida los
             «no aplica» de la página: un `<video>` dentro de un shadow cerrado
             daba 1.2.5 «no aplica · la página no tiene ningún vídeo» tres líneas
             debajo de esta misma nota. Lo usa `aplicaCoberturas`. */
          ocultaContenido: true,
          detail: "hay " + censoCDP.total + " shadow root(s) CERRADO(s) en la página (" +
            censoCDP.hosts.slice(0, 5).map(function (h) { return h.loc; }).join(", ") +
            (censoCDP.total > 5 ? ", …" : "") +
            "), contados por el protocolo del navegador y no por aproximación. Su contenido no se puede inspeccionar desde fuera, así que el contraste, el tamaño de los objetivos y el foco de lo que haya dentro NO están comprobados, y tampoco se puede afirmar que algo no exista en la página. Compruébalo con el inspector o pídeselo a quien mantenga el componente.",
          rutas: censoCDP.hosts.map(function (h) { return h.ruta; }).filter(Boolean)
        });
      }
    }
    const coberturas = coberturasPropias.concat(metaMedidas);

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
          // De 2.5.3 habla el motor, no axe: su regla
          // `label-content-name-mismatch` es experimental, viene desactivada, y
          // medida sobre los ocho casos acusa un icono de fuente que no es
          // barrera y se le escapa un `input type=submit` que sí lo es. El por
          // qué completo está en `src/axe-cross.js`.
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

    /* NO ACUSAR LO QUE NO SE PINTA EN EL ESTADO MEDIDO.
     *
     * El motor lee el marcado y no resuelve CSS, así que juzga por igual un
     * elemento visible y uno en `display:none`. Medido en vivo con la extensión
     * del navegador sobre un sitio real: `button.md:hidden` —el botón del menú
     * móvil— lleva `aria-controls="mobile-menu"` apuntando a un id que no existe,
     * y el motor firmaba `1.3.1 falla` por ello. Pero a 1470 px ese botón está en
     * `display:none`: el árbol de accesibilidad del navegador NO LO CONTIENE —lo
     * comprobé leyéndolo—, así que ningún lector llega nunca a él en ese estado.
     *
     * Y no es un falso positivo sin más: a ancho de móvil ese botón sí se pinta y
     * entonces es el control del menú. O sea que la respuesta honesta no es callar
     * ni acusar: es decir en qué estado se midió. Por eso baja a `revisar`
     * nombrando el estado, en vez de afirmar una barrera sobre algo que en esa
     * pasada no existía para nadie.
     *
     * Solo se toca el hallazgo cuando TODOS sus nodos están sin pintar: si uno
     * solo se ve, la barrera es de ese y se mantiene como estaba. */
    const sinPintar = await (async function () {
      try {
        const rutas = [];
        (analysis.findings || []).forEach(function (f) {
          (f.nodes || []).forEach(function (n) { if (n.path) rutas.push(n.path); });
        });
        if (!rutas.length) return {};
        return await page.evaluate(function (lista) {
          const out = {};
          lista.forEach(function (ruta) {
            let el = null;
            try { el = document.querySelector(ruta); } catch (e) { el = null; }
            if (!el) { out[ruta] = null; return; }   // no se encontró: no se afirma nada
            const cs = getComputedStyle(el);
            out[ruta] = (cs.display === "none") ? "display:none"
              : (cs.visibility === "hidden") ? "visibility:hidden"
              : (el.getClientRects().length === 0) ? "sin caja" : false;
          });
          return out;
        }, Array.from(new Set(rutas)));
      } catch (e) { return {}; }
    })();
    const motivoOculto = function (f) {
      const ns = (f.nodes || []).filter(function (n) { return n.path; });
      if (!ns.length) return null;
      const motivos = ns.map(function (n) { return sinPintar[n.path]; });
      if (motivos.some(function (m) { return m === false || m == null; })) return null;  // alguno se ve, o no se sabe
      return motivos[0];
    };
    (analysis.findings || []).forEach(function (f) {
      if (f.verdict !== "falla") return;
      const m = motivoOculto(f);
      if (!m) return;
      f.verdict = "revisar";
      f.evid = (f.evid || []).concat([
        "OJO AL ESTADO: en esta pasada ese elemento NO SE PINTA (" + m + "), así que el árbol de " +
        "accesibilidad del navegador no lo contiene y ningún lector llega a él. No se afirma como barrera " +
        "aquí — pero tampoco se descarta: si en otro estado (otro ancho de ventana, un menú abierto, una " +
        "pestaña activa) sí se pinta, el defecto del marcado sigue ahí y entonces sí es una barrera. " +
        "Compruébalo en ese estado."
      ]);
    });

    // Hallazgos unificados (semántico + página + medición real), listos para el muestreo.
    let findings = (analysis.findings || []).concat(pageAudit).concat(measurementFindings(todasLasMedidas)).concat(hallazgosPuntero);
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
      oyentes: oyentes,
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
