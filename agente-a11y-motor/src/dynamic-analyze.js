/**
 * Driver de prueba dinámica (Playwright). Opera la página de verdad y captura
 * trazas que interpretan las funciones puras de dynamic.js:
 *   - tabulación real (¿se alcanzan todos los controles? ¿hay trampa de foco?)
 *   - disclosure/expandibles (aria-expanded + contenido controlado)
 *   - pestañas (aria-selected + panel)
 *   - errores de formulario forzados (aria-invalid, texto de error, anuncio)
 *
 * Solo Node. El mismo enfoque puede ejecutarlo la extensión de Chrome sobre una
 * pestaña viva.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────
 * Este driver INTERACTÚA con un sitio de terceros. Tres reglas, y ninguna es
 * negociable:
 *
 *  1. El envío de formularios NUNCA sale a la red por defecto. En modo `safe`
 *     (el de serie) se instala un escuchador de `submit` en fase de captura que
 *     cancela el envío, y además se abortan las navegaciones del marco principal
 *     mientras dura la prueba. La validación de cliente y el marcado ARIA de
 *     error se producen igual —que es lo que medimos—, pero no se crea ni se
 *     borra nada en el servidor ajeno. `forms: "submit"` permite el envío real y
 *     exige opt-in explícito.
 *  2. Nunca se pulsa un botón cualquiera para enviar. Se usa `requestSubmit()`
 *     sin submitter: dispara validación y evento `submit` sin activar ningún
 *     control. El código anterior hacía clic en el primer `<button>` del
 *     formulario, que podía ser «Eliminar cuenta» o «Cerrar sesión».
 *  3. No se vacían los `input[type=hidden]`. Ahí viven los tokens CSRF, los
 *     identificadores de sesión y el estado del formulario; borrarlos rompe la
 *     prueba y, con envío real, puede provocar acciones inesperadas.
 *
 * Además, cada fase va en su propio try/catch: un fallo en una no tira la
 * ejecución entera ni pierde lo ya medido.
 */
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs, analyzeErrorState, analyzeContextChange } from "./dynamic.js";
import { launchOptions } from "./playwright-launch.js";

// Palabras que marcan un formulario como destructivo: no se tocan ni en modo real.
const DESTRUCTIVO = /(delete|destroy|remove|logout|sign-?out|unsubscribe|cancel-?account|elimina|borrar|baja|cerrar-?sesion|desactivar)/i;

// Helpers de página (se serializan dentro de page.evaluate).
const PAGE_HELPERS = `
function __loc(el){ if(!el||el.nodeType!==1) return null; var t=el.tagName.toLowerCase(); if(el.id) return t+'#'+el.id; var c=(el.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean)[0]; if(c) return t+'.'+c; var ty=el.getAttribute('type'); if(t==='input'&&ty) return t+'[type='+ty+']'; return t; }
/* Identidad ÚNICA y estable: ruta CSS por nth-child. __loc puede repetirse (tres
   button.btn son el mismo texto) y eso hacía que la traza confundiera controles:
   un control alcanzado "tapaba" a otro y se inventaban 2.1.1 y trampas de foco. */
function __uid(el){
  if(!el||el.nodeType!==1) return null;
  var parts=[], n=el, t;
  while(n && n.nodeType===1){
    t=n.tagName.toLowerCase();
    if(t==='html'||t==='body') break;
    var p=n.parentElement;
    if(!p){ parts.unshift(t); break; }
    var i=1, s=p.firstElementChild;
    while(s && s!==n){ if(s.tagName===n.tagName) i++; s=s.nextElementSibling; }
    parts.unshift(t+':nth-of-type('+i+')');
    n=p;
  }
  return parts.length ? 'html > body > '+parts.join(' > ') : 'body';
}
function __visible(el){ if(!el) return false; var r=el.getClientRects(); if(!r.length) return false; var cs=getComputedStyle(el); return cs.visibility!=='hidden' && cs.display!=='none'; }
function __focusables(){
  var sel='a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable]:not([contenteditable="false"])';
  return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function(el){
    if(el.hasAttribute('disabled')) return false;
    if(el.closest && el.closest('[inert]')) return false;
    var ti=el.getAttribute('tabindex'); if(ti!=null && parseInt(ti,10)<0) return false;
    return __visible(el);
  }).map(function(el){ return { locator: __loc(el), uid: __uid(el), name:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40) }; });
}
function __el(uid){ try { return document.querySelector(uid); } catch(e) { return null; } }
`;

async function evalIn(page, body, arg) {
  return page.evaluate(new Function("__arg", PAGE_HELPERS + "\nreturn (async function(){" + body + "})();"), arg === undefined ? null : arg);
}

/**
 * @param {{url?:string, html?:string}} target
 * @param {{ launchOptions?, waitUntil?, timeout?, waitMs?, maxTabs?, maxWidgets?,
 *           forms?: "safe"|"off"|"submit" }} [opts]
 */
export async function dynamicAnalyze(target, opts) {
  opts = opts || {};
  const formMode = opts.forms || "safe";
  if (["safe", "off", "submit"].indexOf(formMode) === -1) throw new Error('opts.forms debe ser "safe", "off" o "submit"');
  const prestada = !!opts.page;
  const { chromium } = prestada ? {} : await import("playwright");
  const browser = prestada ? null : await chromium.launch(launchOptions(opts.launchOptions));
  const errores = [];
  const avisos = [];
  async function fase(nombre, fn, fallback) {
    try { return await fn(); }
    catch (e) { errores.push({ fase: nombre, error: (e && e.message) || String(e) }); return fallback; }
  }

  try {
    const page = opts.page || await browser.newPage();
    if (target.url) await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
    else if (target.html != null) await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + target.html + "</body></html>", { waitUntil: "load" });
    else throw new Error("dynamicAnalyze necesita { url } o { html }");
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

    /* Cortafuegos de red.
     *
     * Antes solo abortaba las NAVEGACIONES del marco principal, y eso deja
     * pasar lo que de verdad hace daño: un `fetch`, un `XMLHttpRequest` o un
     * `sendBeacon` disparado por el manejador de un control que la prueba pulsa.
     * Comprobado contra un servidor de verdad: pulsando los `[aria-expanded]` y
     * los `[role=tab]` de una página, el servidor recibía
     * `POST /api/pedidos/42/anular` y `DELETE /api/papelera` — con la sesión del
     * auditor, y con `forms:"off"`, porque eso no es la fase de formularios.
     *
     * En modo seguro se aborta todo lo que no sea de LECTURA (GET/HEAD) durante
     * la interacción, más las navegaciones del marco principal. Lo abortado se
     * anota y sale en los avisos: callarlo sería peor que no bloquearlo.
     */
    /* Y una vez armado, NO se desarma: es un pestillo, no un interruptor.
     *
     * Estaba escrito como interruptor —`navBlocked = true` al empezar cada fase de
     * interacción, `= false` al acabarla— y eso deja una rendija por la que se
     * cuela justo lo que el cortafuegos existe para parar. El manejador de un
     * control no lanza su petición durante el `click()`: la lanza después, en un
     * `await`, un `setTimeout` o un `debounce`, que es lo normal. Cuando llega, la
     * fase ya terminó, `navBlocked` ya es `false`, y la petición sale.
     *
     * Reproducido: seis botones cuyo manejador hace `fetch(…, {method:"DELETE"})`
     * dentro de un `setTimeout`; el cortafuegos abortaba cinco y la sexta llegaba
     * al servidor — mientras el aviso decía «No han llegado al servidor». Un
     * `DELETE` ejecutado en el sitio de un cliente, con la sesión del auditor, y el
     * informe afirmando que no había salido nada.
     *
     * Ahora, en cuanto la sonda toca algo, el cortafuegos se queda armado hasta el
     * final. Las recargas de la SONDA siguen pasando, pero por otra vía
     * (`propia`), que distingue la navegación que pedimos nosotros de la que
     * dispara la página: antes se desarmaba el cortafuegos entero para poder
     * recargar, y en esa ventana volvía a colarse cualquier cosa. */
    let navBlocked = false;
    let pestillo = false;   // armado permanente: una vez puesto, ya no se quita
    let propia = false;     // ventana para las recargas que pide la propia sonda
    const bloqueadas = [];
    const soloLectura = opts.soloLectura !== false;
    const armar = function () { navBlocked = true; pestillo = true; };
    const desarmar = function () { if (!pestillo) navBlocked = false; };
    const mismaPagina = function (u) {
      if (!target.url) return false;
      try { const a = new URL(u), b = new URL(target.url); return a.origin === b.origin && a.pathname === b.pathname; }
      catch (e) { return u === target.url; }
    };
    await page.route("**/*", function (route) {
      const req = route.request();
      if (navBlocked) {
        const metodo = (req.method() || "GET").toUpperCase();
        const esNav = req.isNavigationRequest() && req.frame() === page.mainFrame();
        if (esNav) {
          // La recarga que pide la sonda sí pasa; la navegación que dispara la
          // página, no. Es la misma distinción de siempre, hecha por quién la pide
          // en vez de por en qué momento llega.
          if (propia && (metodo === "GET" || metodo === "HEAD") && mismaPagina(req.url())) return route.continue();
          if (bloqueadas.length < 20) bloqueadas.push(metodo + " " + req.url().slice(0, 120));
          return route.abort();
        }
        if (soloLectura && metodo !== "GET" && metodo !== "HEAD") {
          if (bloqueadas.length < 20) bloqueadas.push(metodo + " " + req.url().slice(0, 120));
          return route.abort();
        }
      }
      return route.continue();
    });

    // 1) Tabulación real
    const focusables = await fase("focusables", function () { return evalIn(page, "return __focusables();"); }, []);
    const needed = (focusables.length || 0) + 10;
    const cap = opts.maxTabs || 300;
    const maxTabs = Math.min(needed, cap);
    const exhausted = maxTabs < needed; // el tope recortó lo que hacía falta

    const reached = []; let trapped = false;
    await fase("tabulación", async function () {
      armar();
      await page.evaluate(function () { var b = document.body || document.documentElement; if (b && b.focus) b.focus(); });
      let sameCount = 0, last = null;
      const seen = new Set();
      for (let i = 0; i < maxTabs; i++) {
        await page.keyboard.press("Tab");
        const cur = await evalIn(page, "var el=document.activeElement; return (el && el!==document.body && el!==document.documentElement)? { locator:__loc(el), uid:__uid(el) } : null;");
        const k = cur ? cur.uid : null;
        if (k && k === last) {
          sameCount++;
          // Trampa solo si hay más de un control y quedan controles sin alcanzar:
          // con un único control enfocable, repetirse es el comportamiento normal.
          if (sameCount >= 3 && focusables.length > 1 && seen.size < focusables.length) { trapped = true; break; }
        } else sameCount = 0;
        last = k;
        if (k && !seen.has(k)) { seen.add(k); reached.push(cur); }
      }
      desarmar();
    });
    desarmar();
    const tabFindings = analyzeTabTrace({ focusables: focusables, reached: reached, trapped: trapped, exhausted: exhausted, tabs: maxTabs });

    /* 1 bis) 3.2.1 / 3.2.2: ¿enfocar o cambiar un valor mueve el suelo?
     *
     * Los dos criterios estaban enteros en «evaluación humana» y son medibles
     * con lo que esta capa ya hace. Las tres señales de un cambio de contexto
     * son observables: la URL, dónde queda el foco y una huella del contenido
     * visible. El cortafuegos de red sigue armado, así que una navegación se
     * DETECTA sin llegar a ocurrir. */
    const ctxEventos = [], noSondados = [];
    let recargasContexto = 0;
    await fase("cambio de contexto", async function () {
      armar();
      const uids = await evalIn(page,
        "return Array.prototype.slice.call(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]'))" +
        ".filter(function(e){ return __visible(e) && !e.disabled; }).slice(0," + (opts.maxContexto || 20) + ").map(__uid);");
      const huella = "return { url: location.href, foco: document.activeElement?__uid(document.activeElement):null," +
        " contenido: (document.body?document.body.innerText:'').replace(/\\s+/g,' ').slice(0,4000).length + ':' + document.querySelectorAll('body *').length };";

      // Cuando el cortafuegos aborta una navegación, el contexto de ejecución de
      // la página se destruye y TODAS las evaluaciones siguientes fallan. Sin
      // esto, el primer control que intentaba navegar dejaba sin sondar a los
      // demás y el criterio salía «probado 1 control» sobre una página con
      // veinte. Se espera y se reintenta una vez.
      let recargas = 0;
      const recargar = async function () {
        if (!target.url || recargas >= 6) return false;
        recargas++;
        try {
          propia = true;
          await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
          propia = false;
          return true;
        } catch (e) { return false; }
      };
      const evalConReintento = async function (expr, arg) {
        try { return await evalIn(page, expr, arg); }
        catch (e) {
          await page.waitForTimeout(250);
          try { return await evalIn(page, expr, arg); } catch (e2) { /* sigue roto */ }
          // Último recurso: recargar. Es lo que hace una persona cuando un
          // control se lleva la página por delante, y devuelve la sonda a un
          // estado conocido para seguir con el resto de controles.
          if (target.url && recargas < 4) {
            recargas++;
            try {
              propia = true;
              await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
              propia = false;
              return await evalIn(page, expr, arg);
            } catch (e3) { /* nada que hacer */ }
          }
          return undefined;
        }
      };
      for (const uid of uids) {
        try {
          // ORDEN: primero resolver el elemento (recargando si hace falta), y
          // SOLO DESPUÉS tomar la huella «antes». Al revés, la huella se capturaba
          // en la página rota que había dejado el control anterior, y la recarga
          // posterior cambiaba la URL: todos los controles siguientes salían
          // acusados de «provocar una navegación» que no habían provocado ellos.
          const pedirInfo = function () {
            return evalConReintento("var el=__el(__arg); if(!el) return null; return { locator:__loc(el), tag:el.tagName.toLowerCase(), tipo:(el.getAttribute('type')||'').toLowerCase() };", uid);
          };
          let info = await pedirInfo();
          if (!info) { await recargar(); info = await pedirInfo(); }
          if (!info) { noSondados.push(uid); continue; }

          const antes = await evalConReintento(huella);
          if (!antes) { noSondados.push(uid); continue; }

          // (a) 3.2.1 — solo enfocar.
          await evalConReintento("var el=__el(__arg); if(el && el.focus) el.focus(); return true;", uid);
          await page.waitForTimeout(120);
          let trasFoco = await evalConReintento(huella);
          if (!trasFoco) {
            // Enfocarlo se llevó la página: ESO es justo lo que 3.2.1 prohíbe.
            ctxEventos.push({ locator: info.locator, uid: uid, disparador: "foco", navego: true, focoMovido: true, contenidoCambio: true });
            await recargar();
            continue;
          }
          ctxEventos.push({
            locator: info.locator, uid: uid, disparador: "foco",
            navego: trasFoco.url !== antes.url,
            focoMovido: trasFoco.foco !== uid && trasFoco.foco !== null,
            contenidoCambio: trasFoco.contenido !== antes.contenido
          });

          // (b) 3.2.2 — cambiar el valor, solo donde tiene sentido y sin escribir
          //     nada en campos que ya tuvieran datos del usuario.
          if (info.tag === "select" || (info.tag === "input" && ["checkbox", "radio"].indexOf(info.tipo) !== -1)) {
            const antes2 = await evalConReintento(huella);
            const restaurar = antes2 && await evalConReintento(`
              var el=__el(__arg); if(!el) return null;
              if (el.tagName.toLowerCase()==='select') {
                var prev=el.selectedIndex;
                if (el.options.length<2) return null;
                el.selectedIndex = (prev+1) % el.options.length;
                el.dispatchEvent(new Event('change',{bubbles:true}));
                return { tipo:'select', prev:prev };
              }
              var prevC=el.checked; el.checked=!prevC;
              el.dispatchEvent(new Event('change',{bubbles:true}));
              return { tipo:'check', prev:prevC };`, uid);
            if (restaurar) {
              await page.waitForTimeout(150);
              const trasCambio = await evalConReintento(huella);
              if (trasCambio) ctxEventos.push({
                locator: info.locator, uid: uid, disparador: "entrada",
                navego: trasCambio.url !== antes2.url,
                focoMovido: trasCambio.foco !== uid && trasCambio.foco !== null,
                contenidoCambio: trasCambio.contenido !== antes2.contenido
              });
              // Devolver el control a su estado: la página se sigue usando.
              await evalConReintento(`
                var el=__el(__arg.uid); if(!el) return null;
                if (__arg.r.tipo==='select') el.selectedIndex=__arg.r.prev; else el.checked=__arg.r.prev;
                el.dispatchEvent(new Event('change',{bubbles:true}));
                return true;`, { uid: uid, r: restaurar });
            }
          }
        } catch (e) { noSondados.push(uid); /* un control que no se deja sondar no tumba la fase */ }
      }
      recargasContexto = recargas;
      desarmar();
    });
    desarmar();
    const ctxFindings = analyzeContextChange(ctxEventos, noSondados.length);
    if (recargasContexto) avisos.push("Durante la prueba de 3.2.1/3.2.2 hubo que recargar la página " + recargasContexto + " vez/veces: algún control se la llevaba por delante al enfocarlo o al cambiarlo. El cortafuegos impidió que la navegación saliera a la red.");

    // 2) Disclosure / expandibles — resueltos por uid, no por índice: el DOM
    //    cambia al abrir un acordeón y el índice i deja de apuntar al mismo nodo.
    const discEvents = [];
    await fase("disclosure", async function () {
      armar();  // pulsar un expandible puede lanzar fetch/XHR: ver el cortafuegos
      const uids = await evalIn(page, "return Array.prototype.slice.call(document.querySelectorAll('[aria-expanded]')).slice(0," + (opts.maxWidgets || 15) + ").map(__uid);");
      for (const uid of uids) {
        const before = await evalIn(page, "var el=__el(__arg); if(!el) return null; var c=el.getAttribute('aria-controls'); var tgt=c?document.getElementById(c.split(/\\s+/)[0]):null; return { locator:__loc(el), name:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40), expanded: el.getAttribute('aria-expanded'), shown: tgt?__visible(tgt):null };", uid);
        if (!before) continue;
        let clicked = true, reason = null;
        armar();
        try { await page.locator(uid).first().click({ timeout: 2000 }); }
        catch (e) { clicked = false; reason = (e && e.message ? String(e.message).split("\n")[0] : "clic no realizado"); }
        desarmar();
        const after = await evalIn(page, "var el=__el(__arg); if(!el) return null; var c=el.getAttribute('aria-controls'); var tgt=c?document.getElementById(c.split(/\\s+/)[0]):null; return { expanded: el.getAttribute('aria-expanded'), shown: tgt?__visible(tgt):null };", uid);
        discEvents.push({
          locator: before.locator, name: before.name, clicked: clicked, reason: reason,
          expandedBefore: before.expanded, expandedAfter: after ? after.expanded : before.expanded,
          targetShownBefore: before.shown, targetShownAfter: after ? after.shown : before.shown
        });
      }
    });
    desarmar();
    const discFindings = analyzeDisclosure(discEvents);

    // 3) Pestañas
    const tabEvents = [];
    await fase("pestañas", async function () {
      armar();
      const uids = await evalIn(page, "return Array.prototype.slice.call(document.querySelectorAll('[role=tab]')).slice(0," + (opts.maxWidgets || 15) + ").map(__uid);");
      for (const uid of uids) {
        let clicked = true, reason = null;
        armar();
        try { await page.locator(uid).first().click({ timeout: 2000 }); }
        catch (e) { clicked = false; reason = (e && e.message ? String(e.message).split("\n")[0] : "clic no realizado"); }
        desarmar();
        const st = await evalIn(page, "var el=__el(__arg); if(!el) return null; var tabs=document.querySelectorAll('[role=tab]'); var others=0; Array.prototype.forEach.call(tabs,function(t){ if(t!==el && t.getAttribute('aria-selected')==='true') others++; }); var c=el.getAttribute('aria-controls'); var tgt=c?document.getElementById(c.split(/\\s+/)[0]):null; return { locator:__loc(el), name:(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40), selectedAfter: el.getAttribute('aria-selected'), othersSelected: others, panelShown: tgt?__visible(tgt):null };", uid);
        if (st) tabEvents.push(Object.assign(st, { clicked: clicked, reason: reason }));
      }
    });
    desarmar();
    const tabWidgetFindings = analyzeTabs(tabEvents);

    // 4) Errores de formulario forzados
    let errFindings = [], formInfo = { modo: formMode, probado: false };
    if (formMode !== "off") {
      await fase("formulario", async function () {
        const cand = await evalIn(page, `
          var fs = Array.prototype.slice.call(document.querySelectorAll('form'));
          for (var i=0;i<fs.length;i++){
            var f=fs[i];
            var huella = (f.getAttribute('action')||'')+' '+(f.id||'')+' '+(f.className||'')+' '+(f.getAttribute('name')||'');
            if (${DESTRUCTIVO.source ? "/" + DESTRUCTIVO.source + "/i" : "/$^/"}.test(huella)) continue;
            if (!__visible(f)) continue;
            return { uid: __uid(f), huella: huella.trim(), metodo: (f.getAttribute('method')||'get').toLowerCase() };
          }
          return null;`);
        if (!cand) { formInfo.motivo = "sin formulario apto (ninguno visible o todos parecen destructivos)"; return; }
        formInfo.formulario = cand.huella || "(sin action)";

        if (formMode === "submit") {
          avisos.push("forms:\"submit\" — el formulario se ha enviado DE VERDAD al servidor de destino.");
        } else {
          armar(); // cortafuegos de red
        }

        const trace = await evalIn(page, `
          var f = __el(__arg.uid);
          if (!f) return null;
          var seguro = __arg.seguro;
          var intercept = null, intercepted = false;
          if (seguro) {
            // SOLO preventDefault. Con stopImmediatePropagation se mataba también
            // el manejador del propio sitio, así que su marcado de error nunca
            // llegaba a producirse… y el análisis lo leía como «no marca los
            // errores»: una falla grave de 3.3.1 inventada sobre un formulario
            // correcto. Lo que impide que salga nada a la red es el cortafuegos
            // de la ruta, no cortar la propagación.
            intercept = function(ev){ ev.preventDefault(); intercepted = true; };
            document.addEventListener('submit', intercept, true);
            window.__a11yQuitarSubmit = function(){ document.removeEventListener('submit', intercept, true); };
          }
          var novalidatePrevio = f.hasAttribute('novalidate');
          f.setAttribute('novalidate','');           // deja correr la validación del sitio
          // Vacía SOLO campos editables visibles. Jamás los hidden (CSRF/sesión/estado),
          // ni los deshabilitados o de solo lectura, ni los botones o ficheros.
          var saltar = { hidden:1, submit:1, button:1, image:1, reset:1, file:1 };
          // Se GUARDA lo que había antes de vaciarlo. La página que se le
          // devuelve al auditor es la suya, con sus datos: vaciar el formulario
          // de un perfil ya relleno y dejarlo así no es una opción.
          var previos = [];
          Array.prototype.forEach.call(f.querySelectorAll('input,textarea,select'), function(el){
            var t=(el.getAttribute('type')||'').toLowerCase();
            if (saltar[t]) return;
            if (el.disabled || el.readOnly) return;
            if (el.tagName.toLowerCase()==='input' && (t==='checkbox'||t==='radio')) { previos.push({el:el, checked:el.checked}); el.checked=false; return; }
            if ('value' in el) { previos.push({el:el, value:el.value}); el.value=''; }
          });
          window.__a11yRestaurarCampos = function(){
            previos.forEach(function(p){
              if ('checked' in p && p.checked !== undefined) p.el.checked = p.checked;
              if ('value' in p && p.value !== undefined) p.el.value = p.value;
            });
          };
          // Enviar SIN pulsar ningún botón: requestSubmit() sin submitter dispara la
          // validación y el evento submit, pero no activa ningún control de la página.
          try {
            if (f.requestSubmit) f.requestSubmit();
            else f.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
          } catch(e) { /* algunos sitios lanzan desde su propio handler */ }
          if (!novalidatePrevio) f.removeAttribute('novalidate');
          return { uid: __arg.uid, intercepted: intercepted, listener: !!intercept };
        `, { uid: cand.uid, seguro: formMode !== "submit" });

        if (!trace) { formInfo.motivo = "el formulario desapareció del DOM"; desarmar(); return; }
        await page.waitForTimeout(400);

        const campos = await evalIn(page, `
          var f=__el(__arg); if(!f) return null;
          var fields=Array.prototype.slice.call(f.querySelectorAll('input:not([type=hidden]),textarea,select')).map(function(el){
            var d=el.getAttribute('aria-describedby'); var dt='';
            if(d){ d.split(/\\s+/).forEach(function(id){ var r=document.getElementById(id); if(r) dt+=' '+(r.textContent||''); }); }
            var em=el.getAttribute('aria-errormessage'); if(em){ var r2=document.getElementById(em); if(r2) dt+=' '+(r2.textContent||''); }
            return { locator:__loc(el), name:(el.getAttribute('aria-label')||el.getAttribute('name')||'').slice(0,40),
                     required: el.hasAttribute('required')||el.getAttribute('aria-required')==='true',
                     invalid: el.getAttribute('aria-invalid')==='true', describedbyText: dt.trim() };
          });
          var hasAlert=!!document.querySelector('[role=alert],[aria-live=assertive],[aria-live=polite]');
          return { submitted:true, fields:fields, hasAlert:hasAlert };`, cand.uid);

        // Deshacer lo que la prueba tocó ANTES de seguir: los valores del
        // usuario y el escuchador de submit. Sin esto, la página se devolvía con
        // el formulario vacío y sin poder enviarse nunca más.
        await evalIn(page, "try{ window.__a11yRestaurarCampos && window.__a11yRestaurarCampos(); }catch(e){} " +
          "try{ window.__a11yQuitarSubmit && window.__a11yQuitarSubmit(); }catch(e){} " +
          "delete window.__a11yRestaurarCampos; delete window.__a11yQuitarSubmit; return true;").catch(function () {});

        desarmar();
        if (campos) {
          formInfo.probado = true;
          formInfo.interceptado = !!trace.intercepted;
          errFindings = analyzeErrorState(Object.assign(campos, { intercepted: trace.intercepted }));
          if (formMode !== "submit" && !trace.intercepted) {
            avisos.push("El formulario no disparó ningún evento submit cancelable: puede que el sitio envíe por fetch/XHR. No ha salido nada a la red (el cortafuegos abortó todo lo que no fuera GET/HEAD), pero revisa el caso a mano.");
          }
        }
      });
      desarmar();
    }

    // Lo abortado SE DICE. Un `POST` que el sitio intentó lanzar al pulsar un
    // expandible es información de auditoría, no ruido: significa que ese control
    // tiene efectos, y que la prueba los ha parado.
    /* Y se dice lo que el cortafuegos GARANTIZA, que no es lo mismo que «no ha
     * llegado nada al servidor».
     *
     * La frase anterior afirmaba eso, en absoluto, y era falsa mientras el
     * cortafuegos fue un interruptor que se apagaba al acabar cada fase: una
     * petición diferida salía después y el aviso seguía diciendo que no. Ahora el
     * cortafuegos se arma en cuanto la sonda toca algo y no se desarma, así que la
     * garantía es real — pero empieza cuando empieza la interacción, no antes: lo
     * que la página lanzara al cargar, antes de que nadie pulse nada, no lo para
     * esto ni tiene por qué. Se dice tal cual. */
    if (bloqueadas.length) {
      avisos.push("Se han abortado " + bloqueadas.length + " petición(es) con efecto que la página intentó lanzar durante la prueba (" +
        bloqueadas.slice(0, 4).join(" · ") + (bloqueadas.length > 4 ? " · …" : "") +
        "). Desde la primera interacción de la sonda no ha salido a la red ninguna petición que no sea de lectura: esas no se han ejecutado en el servidor. " +
        "Si alguna es legítima, ten en cuenta que esa parte no se ha ejercitado de verdad.");
    }

    /* Y lo último de todo: apagar la página antes de recoger.
     *
     * El cortafuegos vive en `page.route`, que deja de existir cuando el navegador
     * se cierra. Un `setTimeout` que el manejador de un control dejó pendiente
     * puede dispararse justo en ese hueco —entre la última fase y el cierre— y
     * entonces su petición sale sin pasar por la ruta. Es un fallo intermitente, y
     * se veía como tal: la misma página, seis `DELETE` diferidos, y uno de cada
     * tres intentos dejaba llegar el último al servidor, con el aviso diciendo que
     * se habían abortado los seis (que es verdad: se abortó, y además salió).
     *
     * Ir a `about:blank` destruye el documento y con él todos sus temporizadores y
     * peticiones pendientes, y no es una petición de red, así que no la para el
     * propio cortafuegos. Si falla, se dice en los errores: cerrar sin apagar es
     * exactamente el caso que esto viene a cubrir. */
    try {
      await page.goto("about:blank", { timeout: 5000 });
    } catch (e) {
      errores.push({ capa: "cierre", error: "no se pudo apagar la página antes de cerrar (" +
        ((e && e.message) || e) + "): una petición diferida podría haber salido después de la prueba." });
    }

    const findings = [].concat(tabFindings, ctxFindings, discFindings, tabWidgetFindings, errFindings);
    return {
      url: target.url || null,
      findings: findings,
      bloqueadas: bloqueadas,
      trace: {
        focusables: focusables.length, reached: reached.length, trapped: trapped,
        tabsPresupuesto: maxTabs, tabsAgotado: exhausted,
        contextoProbados: ctxEventos.length,
        disclosures: discEvents.length, disclosuresSinClic: discEvents.filter(function (e) { return e.clicked === false; }).length,
        tabs: tabEvents.length, formulario: formInfo
      },
      avisos: avisos,
      errores: errores,
      summary: {
        falla: findings.filter(function (f) { return f.verdict === "falla"; }).length,
        revisar: findings.filter(function (f) { return f.verdict === "revisar"; }).length
      }
    };
  } finally {
    if (browser) await browser.close();
  }
}
