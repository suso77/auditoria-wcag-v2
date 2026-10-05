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
import { analyzeTabTrace, analyzeDisclosure, analyzeTabs, analyzeErrorState, analyzeContextChange, analyzeAutoMovement, analyzeCharKeyShortcuts, analyzeStatusMessages } from "./dynamic.js";
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
function __apagado(el){
  /* \`disabled\` se HEREDA de <fieldset disabled>, y el atributo no está en el hijo.
     Mirando solo \`hasAttribute('disabled')\`, los campos de un fieldset deshabilitado
     entraban en la lista de enfocables, la tabulación no los alcanzaba —porque no se
     pueden alcanzar— y salía un 2.1.1 \`falla\` GRAVE sobre dos campos correctamente
     deshabilitados. \`:disabled\` sí recoge la herencia. */
  if(el.hasAttribute('disabled')) return true;
  try { if(el.matches && el.matches(':disabled')) return true; } catch(e) {}
  return false;
}
function __focusables(){
  var sel='a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[tabindex],[contenteditable]:not([contenteditable="false"])';
  return Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function(el){
    if(__apagado(el)) return false;
    if(el.closest && el.closest('[inert]')) return false;
    var ti=el.getAttribute('tabindex'); if(ti!=null && parseInt(ti,10)<0) return false;
    return __visible(el);
  }).map(function(el){ return { locator: __loc(el), uid: __uid(el), name:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40) }; });
}
/* Controles INTERACTIVOS que no son enfocables: el 2.1.1 de libro, y el que no se
   estaba mirando.
   \`__focusables\` enumera lo que YA es enfocable, así que un \`div role="button"\`
   sin \`tabindex\` no entraba en la lista, \`unreached\` salía vacío y el análisis
   emitía 2.1.1 \`cumple\` con la frase «Todos los controles interactivos se alcanzan
   con Tab». Cinco barreras reales invisibles, y una afirmación sobre «todos los
   controles interactivos» hecha sin haber mirado ninguno de ellos.
   La excepción que hay que respetar: en un widget compuesto (tablist, listbox,
   menu, tree, grid, radiogroup, toolbar) el patrón ARIA correcto es UNA sola
   parada de tabulación y las flechas por dentro, así que sus hijos NO deben ser
   tabulables. Eso se distingue y no se cuenta como barrera: se dice aparte, porque
   esta prueba no recorre las flechas. */
function __interactivosNoEnfocables(){
  var ROLES='button,link,checkbox,radio,switch,tab,menuitem,menuitemcheckbox,menuitemradio,option,slider,spinbutton,textbox,combobox,searchbox,treeitem';
  var rs=ROLES.split(',');
  var selRol=rs.map(function(r){ return '[role="'+r+'"]'; }).join(',');
  var COMPUESTOS='[role="tablist"],[role="listbox"],[role="menu"],[role="menubar"],[role="tree"],[role="grid"],[role="treegrid"],[role="radiogroup"],[role="toolbar"]';
  var NATIVOS={a:1,area:1,button:1,input:1,select:1,textarea:1,summary:1};
  var sueltos=[], enCompuesto=[];
  Array.prototype.forEach.call(document.querySelectorAll(selRol+',[onclick]'), function(el){
    if(!__visible(el)) return;
    if(__apagado(el)) return;
    if(el.closest && el.closest('[inert]')) return;
    if(el.getAttribute('aria-hidden')==='true') return;
    var t=el.tagName.toLowerCase();
    var ti=el.getAttribute('tabindex');
    // Enfocable de verdad: etiqueta nativa que lo es, o tabindex >= 0.
    var esNativo = NATIVOS[t] && !(t==='a' && !el.hasAttribute('href'));
    if(esNativo) return;
    if(el.isContentEditable) return;
    if(ti!=null && parseInt(ti,10)>=0) return;
    var rol=(el.getAttribute('role')||'').trim();
    // \`[onclick]\` sin rol de widget es un contenedor con manejador, no un control:
    // señalarlo produciría falsas barreras en cualquier sitio con delegación.
    if(rs.indexOf(rol)===-1) return;
    var ficha={ locator: __loc(el), uid: __uid(el), rol: rol,
      name:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40) };
    var cont = el.closest && el.closest(COMPUESTOS);
    if(cont){
      // ¿Tiene el widget compuesto alguna parada de tabulación? Si no, nada de
      // dentro se puede alcanzar y sí es barrera.
      var hayParada = !!cont.querySelector('[tabindex="0"],a[href],button,input,select,textarea') ||
        (cont.getAttribute('tabindex')!=null && parseInt(cont.getAttribute('tabindex'),10)>=0);
      ficha.compuesto = __loc(cont);
      (hayParada ? enCompuesto : sueltos).push(ficha);
    } else {
      sueltos.push(ficha);
    }
  });
  return { sueltos: sueltos.slice(0,40), enCompuesto: enCompuesto.slice(0,40) };
}
function __el(uid){ try { return document.querySelector(uid); } catch(e) { return null; } }
/* 4.1.3 Mensajes de estado: censo del texto visible, dentro y fuera de las regiones
   live. Lo que interesa es el texto PROPIO de cada elemento (sus nodos de texto
   directos), no el acumulado de sus antepasados: si no, un cambio dentro de un
   <div> hace que aparezca como nuevo todo el árbol que lo contiene. */
function __censoEstado(){
  var LIVE='[role=alert],[role=status],[role=log],[role=progressbar],[aria-live]';
  var regiones=Array.prototype.slice.call(document.querySelectorAll(LIVE));
  var enLive=function(el){ for(var i=0;i<regiones.length;i++){ if(regiones[i]===el||regiones[i].contains(el)) return true; } return false; };
  var fuera=[], live=[];
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function(el){
    if(!__visible(el)) return;
    var propio='';
    for(var i=0;i<el.childNodes.length;i++) if(el.childNodes[i].nodeType===3) propio+=el.childNodes[i].nodeValue||'';
    propio=propio.replace(/\\s+/g,' ').trim();
    if(!propio) return;
    if(enLive(el)) live.push(propio);
    else fuera.push(__uid(el)+' \\u0000 '+propio.slice(0,90));
  });
  return { fuera: fuera, live: live.join(' | '), foco: document.activeElement?__uid(document.activeElement):null,
    regiones: regiones.length };
}
/* 2.1.4 Atajos de teclado de un carácter: se pulsan y se mira.
   El detector estático solo ve los manejadores EN LÍNEA (el atributo onkeydown), y
   hoy nadie los escribe así: un document.addEventListener('keydown', …) dentro de un
   bundle no está en el marcado, así que el criterio salía sin evaluar. Medido contra
   un sitio real: 2.1.4 era uno de los siete que no miraba ninguna capa.
   (Sin comillas invertidas en este comentario: vive dentro de una plantilla de
   cadena, y una sola la cerraría. Ya pasó una vez.)
   Lo que sí se puede hacer es lo que hace una persona auditando: poner el foco en el
   cuerpo del documento —fuera de cualquier campo de texto— pulsar una tecla suelta y
   ver si pasa algo. Si pasa, el atajo NO está limitado a un control, que es una de
   las tres salidas que da el criterio. */
function __huellaTeclado(){
  var n=0;
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function(el){ if(__visible(el)) n++; });
  var a=document.activeElement;
  return { url: location.href, foco: a?__loc(a):null, y: Math.round(window.scrollY||0),
    visibles: n, texto: (document.body?(document.body.innerText||''):'').replace(/\\s+/g,' ').length };
}
/* El foco al cuerpo, sin tocar el marcado: basta con quitárselo a quien lo tenga.
   Poner tabindex="-1" en el body para poder enfocarlo cambiaría la página que se está
   midiendo, y no hace falta: al llamar a blur(), activeElement vuelve al body solo. */
function __focoAlCuerpo(){
  try { if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch(e) {}
  return document.activeElement ? __loc(document.activeElement) : null;
}
/* 2.2.2: movimiento automático que el CSS no delata.
   \`animacionesPersistentes\` lee \`animationName\` y \`animationIterationCount\`, así
   que ve los carruseles hechos con \`@keyframes\` y no ve los que mueve JavaScript
   —que son la mayoría—. Medido en un sitio real: el agente no cazó el carrusel de
   la portada y en su lugar acusó a un icono con \`fadeInDown\`, que es lo único que
   el CSS declaraba. Un carrusel que pasa de diapositiva cada cuatro segundos no
   declara nada: cambia clases, cambia \`style.transform\`, mete y quita nodos.
   Eso se ve observando, no leyendo, así que se observa: un MutationObserver sin
   tocar la página, y después se busca si hay algún control de pausa.
   El filtro es lo que separa un carrusel de la carga de la página: hacen falta
   VARIOS cambios REPARTIDOS en el tiempo. Una ráfaga en el primer segundo es el
   \`lazy-load\` y la animación de entrada; un cambio único no es movimiento. */
function __observarMovimiento(ms){
  return new Promise(function(resolve){
    var vistos = {}, t0 = Date.now();
    var obs;
    try {
      obs = new MutationObserver(function(muts){
        for (var i=0;i<muts.length;i++){
          var m = muts[i];
          var el = (m.target && m.target.nodeType===1) ? m.target : (m.target && m.target.parentElement);
          if (!el || el===document.body || el===document.documentElement) continue;
          if (!__visible(el)) continue;
          var tipo = m.type + (m.attributeName ? ':'+m.attributeName : '');
          var k = __loc(el) + ' [' + tipo + ']';
          var ahora = Date.now() - t0;
          if (!vistos[k]) vistos[k] = { loc:__loc(el), uid:__uid(el), tipo:tipo, n:1, primero:ahora, ultimo:ahora };
          else { vistos[k].n++; vistos[k].ultimo = ahora; }
        }
      });
      obs.observe(document.body, { subtree:true, childList:true, attributes:true,
        attributeFilter:['class','style','hidden','aria-hidden','src','transform','aria-selected','aria-current','data-active'] });
    } catch(e) { resolve({ error:String((e&&e.message)||e), movidos:[], ms:0, controles:[] }); return; }
    setTimeout(function(){
      try { obs.disconnect(); } catch(e) {}
      var movidos = [];
      for (var k in vistos) if (Object.prototype.hasOwnProperty.call(vistos,k)) movidos.push(vistos[k]);
      movidos = movidos.filter(function(x){ return x.n >= 2 && (x.ultimo - x.primero) >= 2500; });
      movidos.sort(function(a,b){ return (b.ultimo-b.primero) - (a.ultimo-a.primero) || b.n - a.n; });
      resolve({ movidos: movidos.slice(0,8), ms: Date.now()-t0, controles: __controlesDePausa() });
    }, ms);
  });
}
/* ¿Hay con qué pararlo? 2.2.2 admite el mecanismo en CUALQUIER punto de la página,
   así que se busca en toda ella, no solo junto a lo que se mueve. El léxico va en
   varios idiomas por el mismo motivo que el de la ayuda: un sitio chino no dice
   «pausa». */
function __controlesDePausa(){
  var RE = /(pausa|pausar|pause|detener|parar|stop|reproducir|play|暂停|暫停|停止|播放)/i;
  var out = [];
  Array.prototype.forEach.call(document.querySelectorAll('button,[role=button],a[href],input[type=button],input[type=image],video,audio'), function(el){
    if (out.length >= 6) return;
    var t = el.tagName.toLowerCase();
    if (t==='video' || t==='audio') {
      if (el.hasAttribute('controls') && __visible(el)) out.push({ loc:__loc(el), motivo:'controles nativos de <'+t+'>' });
      return;
    }
    var cls = (el.className && typeof el.className==='string') ? el.className : '';
    var txt = (el.getAttribute('aria-label')||'')+' '+(el.getAttribute('title')||'')+' '+(el.textContent||'')+' '+cls+' '+(el.id||'');
    if (RE.test(txt) && __visible(el)) out.push({ loc:__loc(el), motivo:(el.getAttribute('aria-label')||el.textContent||cls||'').trim().replace(/\\s+/g,' ').slice(0,40) });
  });
  return out;
}
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

    /* 0) OBSERVAR sin tocar: ¿se mueve algo por su cuenta?
     *
     * Va PRIMERO y antes de armar el cortafuegos, porque tiene que ver la página
     * como la ve quien llega: si se observa después de tabular, de pulsar y de
     * enviar formularios, lo que se mida puede ser consecuencia de la propia sonda,
     * y entonces no vale para 2.2.2. Cuesta unos segundos de reloj por página; se
     * apaga con `movimientoMs: 0`. */
    const movimientoMs = opts.movimientoMs == null ? 8000 : opts.movimientoMs;
    const movimiento = movimientoMs > 0
      ? await fase("movimiento", function () { return evalIn(page, "return __observarMovimiento(__arg);", movimientoMs); }, null)
      : null;
    if (movimiento && movimiento.error) {
      avisos.push("No se pudo observar el movimiento automático de la página (" + movimiento.error +
        "): 2.2.2 se queda con lo que declare el CSS, que no ve los carruseles hechos con JavaScript.");
    }

    // 1) Tabulación real
    const focusables = await fase("focusables", function () { return evalIn(page, "return __focusables();"); }, []);
    const needed = (focusables.length || 0) + 10;
    const cap = opts.maxTabs || 300;
    const maxTabs = Math.min(needed, cap);
    const exhausted = maxTabs < needed; // el tope recortó lo que hacía falta

    // Los controles interactivos que NO son enfocables se enumeran aparte: son el
    // 2.1.1 que `__focusables` no puede ver, porque enumera lo que ya lo es.
    const interactivosNoEnf = await fase("interactivos", function () {
      return evalIn(page, "return __interactivosNoEnfocables();");
    }, null);

    const reached = []; let trapped = false;
    let atrapadoEn = null;
    /* `tabulacionMedida` distingue «he tabulado y no llegué» de «no he tabulado».
     * Si la fase lanza —la página se cierra, un timeout de CDP, una navegación
     * abortada—, `reached` se queda vacío y el análisis emitía `falla` GRAVE para
     * TODOS los enfocables: en una página con cinco controles perfectamente
     * operables, cinco barreras graves inventadas por un error de la sonda. */
    let tabulacionMedida = false;
    await fase("tabulación", async function () {
      armar();
      await page.evaluate(function () { var b = document.body || document.documentElement; if (b && b.focus) b.focus(); });
      let sameCount = 0, last = null;
      const seen = new Set();
      const ciclo = [];
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
        if (k && !seen.has(k)) { seen.add(k); reached.push(cur); ciclo.length = 0; }
        else if (k) {
          /* Trampa CÍCLICA, que es como son las trampas de verdad.
           *
           * Solo se detectaba el caso degenerado: el MISMO control tres veces
           * seguidas. Una trampa real no repite un control, cicla entre los del
           * modal —Cerrar, Aceptar, Cerrar, Aceptar—, así que `sameCount` no subía
           * nunca y `trapped` se quedaba en `false`. Y como `dynamic.js` es el único
           * sitio del motor que emite 2.1.2, el criterio no se evaluaba en ninguna
           * parte: la trampa salía reetiquetada como un 2.1.1 de los controles de
           * fuera, que es un diagnóstico equivocado del mismo síntoma.
           *
           * Lo que define el ciclo: se vuelve a pisar terreno ya visitado, sin
           * añadir ninguno nuevo, mientras quedan controles sin alcanzar. Con dos
           * vueltas completas sin novedad, ya no es que el recorrido sea largo. */
          ciclo.push(k);
          const vuelta = seen.size;
          if (vuelta > 1 && ciclo.length >= vuelta * 2 && seen.size < focusables.length) {
            trapped = true;
            atrapadoEn = reached.slice(-vuelta).map(function (r) { return r.locator; });
            break;
          }
        }
      }
      tabulacionMedida = true;
      desarmar();
    });
    desarmar();
    const tabFindings = analyzeTabTrace({
      focusables: focusables, reached: reached, trapped: trapped, exhausted: exhausted, tabs: maxTabs,
      medida: tabulacionMedida,
      atrapadoEn: atrapadoEn,
      // Los interactivos que no son enfocables: el 2.1.1 que nadie enumeraba.
      interactivos: interactivosNoEnf
    });

    /* 1 bis) 3.2.1 / 3.2.2: ¿enfocar o cambiar un valor mueve el suelo?
     *
     * Los dos criterios estaban enteros en «evaluación humana» y son medibles
     * con lo que esta capa ya hace. Las tres señales de un cambio de contexto
     * son observables: la URL, dónde queda el foco y una huella del contenido
     * visible. El cortafuegos de red sigue armado, así que una navegación se
     * DETECTA sin llegar a ocurrir. */
    const ctxEventos = [], noSondados = [];
    let recargasContexto = 0;
    let ctxCenso = null;   // { total, sondados }: el tope del sondeo se dice y baja el veredicto
    await fase("cambio de contexto", async function () {
      armar();
      /* El tope se DICE, y cambia el veredicto.
       *
       * `slice(0, 20)` recortaba la lista de candidatos dentro del navegador, así
       * que el análisis no llegaba a saber que había más: en una página de sesenta
       * controles sondaba veinte y emitía 3.2.1 `pasa`, que `esConforme()` da por
       * conformidad. Cuarenta controles sin tocar y el criterio exportado como
       * conforme. Ahora se devuelve también el total, y con él el veredicto baja a
       * `cumple-parcial`, que es lo que significa: la parte que se miró está bien.
       *
       * Y los que no pueden recibir el foco quedan fuera del sondeo: `[inert]` y el
       * `disabled` heredado de un `<fieldset disabled>` (la propiedad `.disabled`
       * del input vale `false` ahí, así que el filtro de antes los dejaba pasar).
       * 3.2.1 habla de componentes que PUEDEN recibir el foco; sondar uno que no
       * puede solo produce sospechas falsas, porque `el.focus()` no mueve el foco y
       * la sonda lo lee como «el foco salta a otro sitio». */
      const ctxTope = opts.maxContexto == null ? 20 : opts.maxContexto;
      const censo = await evalIn(page,
        "var todos = Array.prototype.slice.call(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]'))" +
        ".filter(function(e){ return __visible(e) && !e.disabled && !e.closest('[inert]') && !(e.matches && e.matches(':disabled')); });" +
        "return { total: todos.length, uids: todos.slice(0," + ctxTope + ").map(__uid) };");
      const uids = (censo && censo.uids) || [];
      ctxCenso = { total: (censo && censo.total) || uids.length, sondados: uids.length };
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
    const ctxFindings = analyzeContextChange(ctxEventos, noSondados.length, ctxCenso);
    if (recargasContexto) avisos.push("Durante la prueba de 3.2.1/3.2.2 hubo que recargar la página " + recargasContexto + " vez/veces: algún control se la llevaba por delante al enfocarlo o al cambiarlo. El cortafuegos impidió que la navegación saliera a la red.");

    // 2) Disclosure / expandibles — resueltos por uid, no por índice: el DOM
    //    cambia al abrir un acordeón y el índice i deja de apuntar al mismo nodo.
    const discEvents = [];
    const estadoEventos = [];
    const estadoCenso = { expandibles: null, regiones: null };
    await fase("disclosure", async function () {
      armar();  // pulsar un expandible puede lanzar fetch/XHR: ver el cortafuegos
      const uids = await evalIn(page, "return Array.prototype.slice.call(document.querySelectorAll('[aria-expanded]')).slice(0," + (opts.maxWidgets || 15) + ").map(__uid);");
      estadoCenso.expandibles = (uids || []).length;
      estadoCenso.regiones = await evalIn(page, "return document.querySelectorAll('[role=alert],[role=status],[role=log],[role=progressbar],[aria-live]').length;");
      for (const uid of uids) {
        const before = await evalIn(page, "var el=__el(__arg); if(!el) return null; var c=el.getAttribute('aria-controls'); var tgt=c?document.getElementById(c.split(/\\s+/)[0]):null; return { locator:__loc(el), name:(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,40), expanded: el.getAttribute('aria-expanded'), shown: tgt?__visible(tgt):null };", uid);
        if (!before) continue;
        const estadoAntes = await evalIn(page, "return __censoEstado();");
        let clicked = true, reason = null;
        armar();
        try { await page.locator(uid).first().click({ timeout: 2000 }); }
        catch (e) { clicked = false; reason = (e && e.message ? String(e.message).split("\n")[0] : "clic no realizado"); }
        desarmar();
        /* 4.1.3: ¿apareció texto nuevo FUERA del panel que este control gobierna?
         *
         * Lo que revela un `[aria-expanded]` dentro de su propio panel es contenido,
         * no un mensaje de estado, y acusarlo convertiría cualquier acordeón correcto
         * en una barrera. Así que el texto del panel que el control declara con
         * `aria-controls` —y el del propio control— se descuenta; lo que aparece en
         * OTRO sitio de la página al pulsar es el candidato a mensaje de estado.
         *
         * El texto se compara por elemento, con su propia cadena: un reajuste de
         * maquetación no inventa texto nuevo.
         */
        if (clicked) {
          const estadoDespues = await evalIn(page, "return __censoEstado();");
          const antesSet = {};
          (estadoAntes.fuera || []).forEach(function (t) { antesSet[t] = true; });
          const ambito = await evalIn(page,
            "var el=__el(__arg); if(!el) return null; var c=el.getAttribute('aria-controls');" +
            "var tgt=c?document.getElementById(c.split(/\\s+/)[0]):null;" +
            "return { control: __uid(el), panel: tgt?__uid(tgt):null };", uid);
          const dentroDe = function (uidTexto, raiz) { return !!raiz && uidTexto.indexOf(raiz) === 0; };
          const nuevos = (estadoDespues.fuera || []).filter(function (t) {
            if (antesSet[t]) return false;
            const u = t.split(" \u0000 ")[0];
            if (ambito && (dentroDe(u, ambito.panel) || dentroDe(u, ambito.control))) return false;
            return true;
          }).slice(0, 4);
          /* También se anota cuando lo que cambió fue una REGIÓN LIVE.
           *
           * El censo mete el texto de dentro de las regiones live en su propio saco,
           * así que un sitio que hace lo correcto —meter «3 resultados encontrados»
           * en un `role="status"`— no producía ningún texto nuevo «fuera» y por tanto
           * ningún evento: el informe volvía a quedarse callado sobre 4.1.3, que es
           * justo el defecto que se acaba de arreglar en 2.2.2. Ahora el acierto
           * también se anota, y se cuenta como anunciado. */
          const liveCambio = (estadoAntes.live || "") !== (estadoDespues.live || "");
          if (nuevos.length || liveCambio) {
            estadoEventos.push({
              locator: before.locator, name: before.name,
              textos: nuevos.map(function (t) { return t.split(" \u0000 ")[1]; }),
              uids: nuevos.map(function (t) { return t.split(" \u0000 ")[0]; }),
              liveCambio: liveCambio,
              // El foco «dentro» se decide por prefijo de la ruta, que es lo que hay
              // desde fuera: la ruta de un descendiente empieza por la del ancestro.
              focoDentro: nuevos.some(function (t) { return dentroDe(String(estadoDespues.foco || ""), t.split(" \u0000 ")[0]); }),
              regiones: estadoDespues.regiones
            });
          }
        }
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

    /* 2.1.4: teclas sueltas, con el foco en el cuerpo del documento.
     *
     * Va con el cortafuegos armado, como el resto de la interacción: un atajo de un
     * carácter puede disparar una petición con efecto igual que un clic, y el
     * cortafuegos es lo que impide que llegue al servidor del cliente.
     *
     * Las teclas son las que los sitios usan de verdad como atajo global —la barra y
     * la interrogación para buscar, y las letras de navegación tipo j/k/n/p/g—. No se
     * prueban todas: no es un barrido exhaustivo y el informe lo dice. */
    const TECLAS = (opts.teclas || ["/", "?", "s", "f", "j", "k", "n", "p", "g", "1"]);
    let teclado = null;
    if (opts.teclas !== false) {
      teclado = await fase("teclas de un carácter", async function () {
        armar();
        const activas = [], probadas = [];
        for (const tecla of TECLAS) {
          await evalIn(page, "return __focoAlCuerpo();");
          const antes = await evalIn(page, "return __huellaTeclado();");
          const blqAntes = bloqueadas.length;
          await page.keyboard.press(tecla);
          await page.waitForTimeout(260);
          const despues = await evalIn(page, "return __huellaTeclado();");
          probadas.push(tecla);
          const cambios = [];
          if (antes.url !== despues.url) cambios.push("navega a otra página");
          if (bloqueadas.length > blqAntes) cambios.push("lanza una petición con efecto (abortada por el cortafuegos)");
          if (antes.foco !== despues.foco) cambios.push("mueve el foco a «" + (despues.foco || "?") + "»");
          if (Math.abs(antes.y - despues.y) > 8) cambios.push("desplaza la página " + Math.round(despues.y - antes.y) + " px");
          if (antes.visibles !== despues.visibles) cambios.push("cambia qué se ve (" + (despues.visibles - antes.visibles > 0 ? "+" : "") + (despues.visibles - antes.visibles) + " elemento(s) visibles)");
          else if (Math.abs(antes.texto - despues.texto) > 20) cambios.push("cambia el texto de la página");
          if (cambios.length) {
            activas.push({ tecla: tecla, cambios: cambios });
            // Se intenta dejar la página como estaba antes de seguir.
            try { await page.keyboard.press("Escape"); await page.waitForTimeout(120); } catch (e) {}
            try { await page.evaluate(function (y) { window.scrollTo(0, y); }, antes.y); } catch (e) {}
          }
        }
        return { probadas: probadas, activas: activas };
      }, null);
    }

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

        /* Antes de enviar: foto de las regiones live y del texto que rodea a cada
         * campo. Las dos cosas hacen falta para no afirmar lo que no se ha visto.
         *
         *  - Las regiones de estado: `hasAlert` era la simple EXISTENCIA de un
         *    `[role=alert]` o `[aria-live]` en cualquier parte del documento, vacío
         *    o no. Con eso se emitía «los errores … se anuncian». Un contenedor no
         *    es un anuncio; lo que lo demuestra es que su contenido cambie al
         *    enviar, y eso solo se sabe comparando antes y después.
         *  - El texto alrededor del campo: la técnica G83 satisface 3.3.1 con texto
         *    de error visible junto al campo, sin asociación ARIA. Mirando solo
         *    `aria-describedby` se emitía un `falla` grave sobre formularios que
         *    hacen exactamente lo que G83 manda. Lo que cuenta como descripción del
         *    error es el texto que aparece DESPUÉS de enviar, así que se guarda el
         *    de antes para quedarse solo con la diferencia. */
        const antesDeEnviar = await evalIn(page, `
          var f = __el(__arg); if (!f) return null;
          function vis(el){ if(!el||!el.getClientRects||!el.getClientRects().length) return false;
            var cs=getComputedStyle(el); return cs.visibility!=='hidden'&&cs.display!=='none'; }
          function txt(el){ return vis(el) ? (el.innerText||el.textContent||'').replace(/[\\s\\u00a0]+/g,' ').trim() : ''; }
          // Entorno del campo: hasta tres antepasados, sin salirse del formulario.
          function entorno(el){
            var partes=[], n=el.parentElement, saltos=0;
            while(n && n!==f && saltos<3){ partes.push(txt(n)); n=n.parentElement; saltos++; }
            return partes.join(' § ');
          }
          var live=Array.prototype.slice.call(document.querySelectorAll('[role=alert],[role=status],[aria-live]'))
            .map(function(r){ return __loc(r)+'='+txt(r); }).join(' | ');
          var campos={};
          Array.prototype.forEach.call(f.querySelectorAll('input:not([type=hidden]),textarea,select'), function(el){
            campos[__loc(el)]=entorno(el);
          });
          return { live: live, campos: campos, regiones: document.querySelectorAll('[role=alert],[role=status],[aria-live]').length };
        `, cand.uid);

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
          var f=__el(__arg.uid); if(!f) return null;
          var previo=__arg.antes||{ live:'', campos:{} };
          function vis(el){ if(!el||!el.getClientRects||!el.getClientRects().length) return false;
            var cs=getComputedStyle(el); return cs.visibility!=='hidden'&&cs.display!=='none'; }
          function txt(el){ return vis(el) ? (el.innerText||el.textContent||'').replace(/[\\s\\u00a0]+/g,' ').trim() : ''; }
          function entorno(el){
            var partes=[], n=el.parentElement, saltos=0;
            while(n && n!==f && saltos<3){ partes.push(txt(n)); n=n.parentElement; saltos++; }
            return partes.join(' § ');
          }
          /* Lo NUEVO que hay alrededor del campo después de enviar. Se compara
             palabra a palabra contra la foto de antes y se queda con lo añadido:
             así el texto que ya estaba —la etiqueta, una pista de ayuda— no se
             confunde con una descripción de error que nadie ha escrito. */
          function nuevo(despues, antes){
            var ya={}; String(antes||'').split(' ').forEach(function(w){ ya[w]=(ya[w]||0)+1; });
            var res=[];
            String(despues||'').split(' ').forEach(function(w){
              if(ya[w]) { ya[w]--; return; }
              res.push(w);
            });
            return res.join(' ').replace(/[\\s§]+/g,' ').trim();
          }
          var fields=Array.prototype.slice.call(f.querySelectorAll('input:not([type=hidden]),textarea,select')).map(function(el){
            var k=__loc(el);
            var d=el.getAttribute('aria-describedby'); var dt='';
            if(d){ d.split(/\\s+/).forEach(function(id){ var r=document.getElementById(id); if(r) dt+=' '+(r.textContent||''); }); }
            var emt='';
            var em=el.getAttribute('aria-errormessage'); if(em){ var r2=document.getElementById(em); if(r2) emt+=' '+(r2.textContent||''); }
            return { locator:k, name:(el.getAttribute('aria-label')||el.getAttribute('name')||'').slice(0,40),
                     required: el.hasAttribute('required')||el.getAttribute('aria-required')==='true',
                     invalid: el.getAttribute('aria-invalid')==='true',
                     describedbyText: dt.trim(),
                     errormessageText: emt.trim(),
                     // G83: texto de error visible junto al campo, sin asociar.
                     errorCercaText: nuevo(entorno(el), previo.campos[k]) };
          });
          var regiones=Array.prototype.slice.call(document.querySelectorAll('[role=alert],[role=status],[aria-live]'));
          var liveAhora=regiones.map(function(r){ return __loc(r)+'='+txt(r); }).join(' | ');
          return { submitted:true, fields:fields,
                   hasAlert: regiones.length>0,
                   // Que el ANUNCIO se haya producido, no que exista el contenedor.
                   liveCambio: liveAhora !== (previo.live||''),
                   liveAntes: (previo.live||'').slice(0,300), liveDespues: liveAhora.slice(0,300) };`,
          { uid: cand.uid, antes: antesDeEnviar });

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

    const movFindings = analyzeAutoMovement(movimiento);
    const teclaFindings = analyzeCharKeyShortcuts(teclado);
    const estadoFindings = analyzeStatusMessages(estadoEventos, estadoCenso);
    const findings = [].concat(movFindings, teclaFindings, estadoFindings, tabFindings, ctxFindings, discFindings, tabWidgetFindings, errFindings);
    return {
      url: target.url || null,
      findings: findings,
      bloqueadas: bloqueadas,
      trace: {
        focusables: focusables.length, reached: reached.length, trapped: trapped,
        tabsPresupuesto: maxTabs, tabsAgotado: exhausted,
        contextoProbados: ctxEventos.length,
        disclosures: discEvents.length, disclosuresSinClic: discEvents.filter(function (e) { return e.clicked === false; }).length,
        tabs: tabEvents.length, formulario: formInfo,
        movimiento: movimiento ? { ms: movimiento.ms, movidos: (movimiento.movidos || []).length, controlesDePausa: (movimiento.controles || []).length } : null,
        teclas: teclado ? { probadas: teclado.probadas.length, activas: teclado.activas.length } : null,
        mensajesDeEstado: estadoEventos.length,
        expandibles: estadoCenso.expandibles, regionesDeEstado: estadoCenso.regiones
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
