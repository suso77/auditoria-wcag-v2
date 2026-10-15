/**
 * Driver de adaptación del contenido (Playwright).
 *
 * Aplica sobre la página real los mismos cambios que haría una persona auditora
 * y mide qué se rompe. La interpretación vive en viewport.js, que es pura.
 *
 * Método ANTES/DESPUÉS: no basta con mirar el estado final. Una caja que ya venía
 * recortada de serie no es culpa del espaciado. Se fotografía cada bloque de
 * texto antes del cambio, se aplica, se vuelve a medir, y solo cuenta lo que
 * EMPEORA. Así el hallazgo señala la causa y no el ruido de fondo.
 *
 * Y una distinción que importa: desbordar con barra de desplazamiento NO es una
 * pérdida de contenido —sigue siendo alcanzable—; desbordar con `overflow:hidden`
 * sí lo es. Solo lo segundo cuenta como recorte.
 */
import { analyzeViewport } from "./viewport.js";
import { launchOptions } from "./playwright-launch.js";

// 320×256 px CSS: el tamaño que exige 1.4.10 (equivale al 400 % sobre 1280×1024).
export const REFLUJO_W = 320, REFLUJO_H = 256;

/* El espaciado EXACTO que fija 1.4.12, y solo ese.
 *
 * El criterio enumera cuatro valores, y el cuarto es «espaciado después de los
 * PÁRRAFOS de al menos 2 veces el tamaño de letra». Solo párrafos. Aplicando ese
 * margen también a `li`, `dd` y `blockquote` se provocaba un recorte que el
 * criterio no provoca: medido, un menú de alto fijo con seis `li` no pierde nada
 * con lo que exige 1.4.12 y perdía 126 px con lo que aplicaba el motor — un `falla`
 * GRAVE inventado sobre contenido conforme.
 *
 * Es también lo que hace el bookmarklet de Text Spacing de la Guía Técnica del OAW,
 * que es la herramienta con la que se comprueba esto a mano. */
export const CSS_ESPACIADO =
  "*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }" +
  "p { margin-block-end: 2em !important; }";

const HELPERS = `
function __loc(el){ if(!el||el.nodeType!==1) return null; var t=el.tagName.toLowerCase(); if(el.id) return t+'#'+el.id; var c=(el.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean)[0]; if(c) return t+'.'+c; return t; }
function __uid(el){ var p=[],n=el,t; while(n&&n.nodeType===1){ t=n.tagName.toLowerCase(); if(t==='html'||t==='body') break; var pa=n.parentElement; if(!pa){p.unshift(t);break;} var i=1,s=pa.firstElementChild; while(s&&s!==n){ if(s.tagName===n.tagName) i++; s=s.nextElementSibling; } p.unshift(t+':nth-of-type('+i+')'); n=pa; } return p.length?'html > body > '+p.join(' > '):'body'; }
function __texto(el){ var s='',k=el.childNodes||[]; for(var i=0;i<k.length;i++) if(k[i].nodeType===3) s+=k[i].nodeValue||''; return s.replace(/\\s+/g,' ').trim(); }
/* «Pintado» tiene que mirar también la OPACIDAD, y la acumulada.
   Esta funcion miraba visibility y display y no opacity, al contrario que su gemela
   de la capa de pixeles. Una sola propiedad CSS cambiaba el informe entero, medido en
   Chromium con dos paginas identicas salvo esa propiedad:
     · un emergente revelado con opacity 0 a 1 no se observaba NUNCA (1 disparador, 0
       hovers) y 1.4.13 salia «cumple» diciendo «se ha pasado el puntero por 1
       disparador y no ha aparecido ninguno problematico» — las dos mitades falsas;
       el mismo emergente con display none a block salia «falla» grave.
     · un bloque con opacity 0 y texto recortado producia una falla GRAVE de 1.4.10
       sobre 564 px de texto que nadie puede ver; con visibility hidden, nada.
   Y la opacidad tiene que ser la ACUMULADA: getComputedStyle(el).opacity es la del
   propio elemento, asi que los HIJOS de un opacity 0 tambien pasaban el filtro.
   (Sin comillas invertidas en este comentario: vive dentro de una plantilla.) */
function __opacidadAcum(el){
  var o = 1, n = el;
  while (n && n.nodeType === 1) {
    var v = parseFloat(getComputedStyle(n).opacity);
    if (!isNaN(v)) o *= v;
    if (o === 0) return 0;
    n = n.parentElement;
  }
  return o;
}
function __pintado(el){ if(!el.getClientRects||!el.getClientRects().length) return false; var cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') return false; return __opacidadAcum(el) > 0; }
/* OCULTO A LA VISTA PERO LEÍDO: el idioma de .sr-only y del enlace de salto.
   Es la clase de elemento que existe para que un lector de pantalla lo anuncie y
   nadie lo vea: caja de 1x1 con overflow:hidden, recortado con clip a cero, o
   puesto fuera de la pantalla con left:-9999px. Tailwind .sr-only es exactamente
   lo primero.
   Esto NO es contenido visible, así que no puede perderse al reflujo ni al
   cambiar el espaciado — y medido contra un sitio real conforme, no distinguirlo
   producía ONCE falsas barreras de 1.4.10 de cuarenta y seis acusaciones: el
   agente denunciaba los propios recursos de accesibilidad del sitio por
   «recortar 179 px con overflow:hidden», que es literalmente lo que hace el
   idioma. Once de cuarenta y seis es la cuarta parte del informe.
   Se decide con CSS calculado y geometría REAL, no por el nombre de la clase:
   «sr-only» es una convención, no una garantía, y un informe con efectos legales
   no se apoya en una convención de nombres.
   Y no puede esconder una barrera de verdad: una pérdida de información por
   reflujo es texto VISIBLE que se corta, y eso vive en una caja de tamaño
   normal, nunca en una de un píxel ni fuera de la pantalla.
   (Sin comillas invertidas en este comentario: vive dentro de una plantilla.) */
function __ocultoALaVista(el){
  var cs=getComputedStyle(el), r=el.getBoundingClientRect();
  if (r.width <= 4 || r.height <= 4) return 'caja de ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' px';
  var cl=String(cs.clip||'').replace(/\\s+/g,'');
  if (/^rect\\((0(px)?,){3}0(px)?\\)$/.test(cl) || /^rect\\((1px,){3}1px\\)$/.test(cl)) return 'recortado con clip a cero';
  var cp=String(cs.clipPath||'').replace(/\\s+/g,'');
  if (/^inset\\((50|100)%\\)$/.test(cp)) return 'recortado con clip-path';
  if (r.right <= 0 || r.bottom <= 0) return 'fuera de la pantalla';
  return null;
}
/* Qué medir. Dos familias, y las dos hacen falta:
   1. Los elementos que pintan texto propio: son los que crecen al cambiar el
      espaciado o el tamaño.
   2. Sus CONTENEDORES con overflow oculto: son los que de verdad recortan. El
      caso típico —una tarjeta de alto fijo con overflow:hidden y un <p> dentro—
      no lo detecta ninguna de las dos por separado: el <p> crece pero no recorta,
      y la tarjeta recorta pero no tiene texto propio.
   Medir TODOS los elementos sería ruido; estas dos familias son justo lo que mira
   una persona con el bookmarklet. */
function __bloques(max){
  var out=[], vistos=new Set(), all=document.body?document.body.querySelectorAll('*'):[];
  function add(el){ if(!el||vistos.has(el)) return; if(out.length>=max) return; vistos.add(el); out.push(el); }
  for(var i=0;i<all.length && out.length<max;i++){
    var el=all[i];
    if(!__texto(el) || !__pintado(el)) continue;
    // El contenedor que recorta, primero: es el que produce el hallazgo útil.
    var p=el.parentElement;
    while(p && p!==document.body && p.nodeType===1){
      var cs=getComputedStyle(p);
      if(cs.overflowY==='hidden'||cs.overflowY==='clip'||cs.overflowX==='hidden'||cs.overflowX==='clip'){ add(p); break; }
      p=p.parentElement;
    }
    add(el);
  }
  return out;
}
/* Instantánea de una caja. \`oculto\` = el desbordamiento NO deja ver el contenido
   (overflow hidden/clip). Con auto/scroll el texto sigue alcanzable. */
function __caja(el){
  var cs=getComputedStyle(el), r=el.getBoundingClientRect();
  var ocultoY=(cs.overflowY==='hidden'||cs.overflowY==='clip');
  var ocultoX=(cs.overflowX==='hidden'||cs.overflowX==='clip');
  return { uid:__uid(el), locator:__loc(el),
    sh:el.scrollHeight, ch:el.clientHeight, sw:el.scrollWidth, cw:el.clientWidth,
    ocultoY:ocultoY, ocultoX:ocultoX,
    /* El idioma de .sr-only tambien llega aqui, y por 1.4.4 y 1.4.12: salia como
       bloque que YA venia recortado, con los px de un texto que nadie ve. */
    ocultoVista: !!__ocultoALaVista(el),
    recortado: (ocultoY && el.scrollHeight>el.clientHeight+2) || (ocultoX && el.scrollWidth>el.clientWidth+2),
    top:Math.round(r.top), bottom:Math.round(r.bottom), left:Math.round(r.left), right:Math.round(r.right) };
}
function __instantanea(max){ return __bloques(max||300).map(__caja); }
// Cuántos bloques había en total, para saber si el tope recortó. Sin esto, con
// 400 párrafos por delante la tarjeta que se recorta quedaba fuera del barrido y
// 1.4.4 / 1.4.12 pasaban de «falla» a «cumple» sin una sola nota.
/* Disparadores de contenido emergente por puntero o foco.
   Se leen las reglas CSS que combinan :hover / :focus con una declaracion que
   MUESTRA algo (display, visibility, opacity), y se toma la parte del selector
   que lleva la pseudoclase: ese es el elemento sobre el que hay que pasar el
   raton. Mismo recorrido del CSSOM que usa 2.4.7, con sus dos trampas: en Chrome
   moderno una CSSStyleRule TAMBIEN tiene cssRules (anidado), y en Tailwind los
   dos puntos van dentro del nombre de clase, escapados. */
function __disparadoresEmergentes(max){
  var out=[], vistos=new Set(), hojas=document.styleSheets||[], bloqueadas=0;
  var MUESTRA=/(display\\s*:\\s*(?!none)|visibility\\s*:\\s*visible|opacity\\s*:\\s*(0?\\.[1-9]|1))/i;
  for(var i=0;i<hojas.length;i++){
    var reglas=null;
    try{ reglas=hojas[i].cssRules; }catch(e){ bloqueadas++; continue; }
    if(!reglas) continue;
    var pila=[reglas];
    while(pila.length){
      var lista=pila.pop();
      for(var j=0;j<lista.length;j++){
        var r=lista[j], sel=r.selectorText;
        if(sel && /:hover|:focus(-within)?/i.test(sel) && r.style && MUESTRA.test(r.style.cssText||"")){
          sel.split(",").forEach(function(parte){
            /* Recorte caracter a caracter respetando los escapes: en
               .g\\:x:hover los dos puntos estan DENTRO del nombre de clase. */
            var p=parte.trim(), corte=-1, k=0;
            while(k<p.length){
              if(p[k]==="\\\\"){ k+=2; continue; }
              if(p[k]===":" && /^:(hover|focus(-within)?)\\b/.test(p.slice(k))){ corte=k; break; }
              k++;
            }
            if(corte<=0) return;
            var trigger=p.slice(0,corte).trim();
            if(!trigger) return;
            try{
              Array.prototype.forEach.call(document.querySelectorAll(trigger), function(el){
                if(out.length>=max || vistos.has(el) || !__pintado(el)) return;
                vistos.add(el);
                out.push({ locator:__loc(el), uid:__uidVp(el), regla:p.slice(0,80) });
              });
            }catch(e){}
          });
        }
        if(r.cssRules && r.cssRules.length) pila.push(r.cssRules);
      }
    }
  }
  return { disparadores: out, hojasBloqueadas: bloqueadas };
}
function __uidVp(el){
  var p=[],n=el,t;
  while(n && n.nodeType===1){
    t=n.tagName.toLowerCase();
    if(t==='html'||t==='body') break;
    var pa=n.parentElement; if(!pa){ p.unshift(t); break; }
    var i=1,s=pa.firstElementChild;
    while(s&&s!==n){ if(s.tagName===n.tagName) i++; s=s.nextElementSibling; }
    p.unshift(t+':nth-of-type('+i+')'); n=pa;
  }
  return p.length ? 'html > body > '+p.join(' > ') : 'body';
}
/* Huella de lo VISIBLE, para ver que aparece al pasar el puntero. */
function __visibleHuella(){
  var out=[];
  Array.prototype.forEach.call(document.querySelectorAll('body *'), function(el){
    if(!__pintado(el)) return;
    var r=el.getBoundingClientRect();
    if(r.width<1||r.height<1) return;
    out.push(__uidVp(el)+'@'+Math.round(r.x)+','+Math.round(r.y)+','+Math.round(r.width)+','+Math.round(r.height));
  });
  return out;
}
function __coberturaBloques(max){ var t=__bloques(1e9).length, m=Math.min(t, max||300); return { total:t, medidos:m, truncado: m<t }; }
`;

function evalIn(page, body, arg) {
  return page.evaluate(new Function("__arg", HELPERS + "\nreturn (async function(){" + body + "})();"), arg === undefined ? null : arg);
}

// Compara dos instantáneas y devuelve lo que EMPEORA: recortes nuevos y solapes nuevos.
/* EL SELECTOR YA ESTABA AQUÍ Y NO SALÍA DEL FICHERO.
 *
 * `__caja` guarda `uid:__uid(el)`, que es la ruta canónica —la misma forma que
 * usa la capa de medición—, y se usaba solo para emparejar el antes con el
 * después. Los hallazgos salían con el `locator`, que se LEE pero no identifica:
 * `div.list_item`.
 *
 * Medido sobre una auditoría real de diez páginas: de 522 filas, 62 —el 12 %—
 * salían con la columna «Selector» vacía, todas de esta capa (1.4.4, 1.4.10,
 * 1.4.12). Y eso tiene dos consecuencias que se notan: la guía de capturas
 * resalta el elemento POR SELECTOR, así que esas 62 barreras no podían llevar
 * evidencia visual; y el cotejo entre dos pasadas identifica la barrera por
 * criterio, página y selector, con lo que diez filas de una página se fundían en
 * una y los cambios de dentro no se veían.
 *
 * No hacía falta calcular nada nuevo: solo dejar de tirarlo. */
function diffCajas(antes, despues) {
  const A = {};
  (antes || []).forEach(function (c) { A[c.uid] = c; });
  const recortados = [], solapados = [], previos = [];
  function detalle(d) {
    const exY = d.sh - d.ch, exX = d.sw - d.cw;
    return (d.ocultoY && exY > 2 ? exY + " px de alto ocultos" : "") +
      (d.ocultoX && exX > 2 ? (d.ocultoY && exY > 2 ? "; " : "") + exX + " px de ancho ocultos" : "");
  }
  let descontados = 0;
  (despues || []).forEach(function (d) {
    const a = A[d.uid];
    if (!a) return;
    if (!d.recortado) return;
    /* Oculto a la vista: no es contenido que se vea, así que ni lo recorta el
     * cambio ni «ya venía recortado». Medido contra un sitio real conforme, esto
     * metía `a.skip-link`, `span.sr-only` y `caption.sr-only` en la lista de
     * bloques recortados de 1.4.4 y 1.4.12, con los píxeles de un texto que nadie
     * ve nunca. */
    if (d.ocultoVista) { descontados++; return; }
    // Solo cuenta como falla del cambio lo que EMPEORA con él.
    if (!a.recortado) { recortados.push({ locator: d.locator, uid: d.uid, detalle: detalle(d) }); return; }
    // Lo que ya venía recortado no lo causa el cambio, pero es pérdida de
    // contenido igualmente: se informa aparte en vez de tragárselo.
    previos.push({ locator: d.locator, uid: d.uid, detalle: detalle(a) });
  });
  // Solape: dos bloques hermanos que antes no se pisaban y ahora sí.
  const porTop = (despues || []).slice().sort(function (x, y) { return x.top - y.top; });
  for (let i = 1; i < porTop.length; i++) {
    const p = porTop[i - 1], q = porTop[i];
    if (p.uid === q.uid) continue;
    if (q.uid.indexOf(p.uid) === 0 || p.uid.indexOf(q.uid) === 0) continue; // anidados: no es solape
    if (p.ocultoVista || q.ocultoVista) continue;   // un elemento que no se ve no se solapa con nada
    const solapaAhora = q.top < p.bottom - 2 && q.left < p.right - 2 && q.right > p.left + 2;
    if (!solapaAhora) continue;
    const pa = (antes || []).find(function (c) { return c.uid === p.uid; });
    const qa = (antes || []).find(function (c) { return c.uid === q.uid; });
    if (pa && qa && qa.top < pa.bottom - 2 && qa.left < pa.right - 2 && qa.right > pa.left + 2) continue; // ya se pisaban antes
    solapados.push({ locator: q.locator, uid: q.uid, detalle: "se solapa con " + p.locator });
  }
  return { recortados: recortados, solapados: solapados.slice(0, 20), previos: previos, descontados: descontados };
}

/**
 * @param {{url?:string, html?:string}} target
 * @param {{ launchOptions?, waitUntil?, timeout?, waitMs?, maxBloques?, baseW?, baseH? }} [opts]
 */
export async function viewportAnalyze(target, opts) {
  opts = opts || {};
  const maxBloques = opts.maxBloques || 300;
  const baseW = opts.baseW || 1280, baseH = opts.baseH || 1024;
  const prestada = !!opts.page;
  const { chromium } = prestada ? {} : await import("playwright");
  const browser = prestada ? null : await chromium.launch(launchOptions(opts.launchOptions));
  const errores = [];
  async function fase(nombre, fn, fallback) {
    try { return await fn(); }
    catch (e) { errores.push({ fase: nombre, error: (e && e.message) || String(e) }); return fallback; }
  }
  async function abrir(page) {
    if (target.url) await page.goto(target.url, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 30000 });
    else if (target.html != null) await page.setContent('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>' + target.html + "</body></html>", { waitUntil: "load" });
    else throw new Error("viewportAnalyze necesita { url } o { html }");
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
  }

  try {
    const page = opts.page || await browser.newPage({ viewport: { width: baseW, height: baseH } });
    if (opts.page) await page.setViewportSize({ width: baseW, height: baseH });

    /* El bloqueo de orientación se OBSERVA, no se busca en el texto de los scripts.
     *
     * La detección leía solo `script:not([src])` y con una expresión literal
     * (`screen.orientation.lock(`), así que no veía nada de lo habitual: la llamada
     * en un bundle externo, una referencia intermedia (`var o = screen.orientation;
     * o.lock(…)`), un módulo, un minificador que renombre. Y con eso `viewport.js`
     * emitía `cumple` afirmando «y no hay bloqueo de orientación»: una afirmación
     * sobre un JavaScript que nadie había leído. Comprobado con las dos formas: las
     * dos salían conformes.
     *
     * Envolviendo la API antes de que cargue la página, da igual dónde esté escrita
     * la llamada ni cómo: si se llama, se anota. Se envuelve también la API antigua
     * (`lockOrientation` y sus prefijos), y la llamada se deja pasar al original
     * —envuelta, no bloqueada— para no cambiar el comportamiento de la página. */
    await page.addInitScript(function () {
      window.__a11yOrientacion = { llamadas: [] };
      var anota = function (api, args) {
        try { window.__a11yOrientacion.llamadas.push(api + "(" + Array.prototype.slice.call(args).join(", ") + ")"); } catch (e) {}
      };
      try {
        var SO = window.ScreenOrientation && window.ScreenOrientation.prototype;
        if (SO && SO.lock) {
          var origLock = SO.lock;
          SO.lock = function () { anota("screen.orientation.lock", arguments); return origLock.apply(this, arguments); };
        }
      } catch (e) {}
      ["lockOrientation", "mozLockOrientation", "msLockOrientation"].forEach(function (m) {
        try {
          if (window.screen && typeof window.screen[m] === "function") {
            var orig = window.screen[m];
            window.screen[m] = function () { anota("screen." + m, arguments); return orig.apply(this, arguments); };
          }
        } catch (e) {}
      });
      /* 2.2.1 Tiempo ajustable: los temporizadores LARGOS, anotados al programarse.
       *
       * El único caso que se miraba era `<meta http-equiv="refresh">`, que es el
       * fallo de libro y hoy casi nadie usa. El límite de tiempo de verdad lo pone
       * JavaScript: `setTimeout(cerrarSesion, 900000)`. Eso no está en el marcado ni
       * se puede leer desde fuera — pero sí se puede anotar envolviendo la API antes
       * de que cargue la página, igual que con el bloqueo de orientación.
       *
       * Se anota el retardo y de dónde sale la llamada (la primera línea de pila que
       * no es esta envoltura), que es lo que permite ir a buscarla. El umbral son 20
       * segundos: por debajo no hay límite de tiempo que ajustar, y encima 20 s es el
       * umbral que el propio criterio usa para el aviso de prórroga.
       *
       * La llamada se deja pasar al original: anotar no es bloquear. */
      window.__a11yTemporizadores = { largos: [], total: 0 };
      var UMBRAL = 20000;
      /* De dónde sale la llamada: la primera línea de pila que pertenezca a la
       * PÁGINA, no a esta envoltura.
       *
       * Filtrar por nombre no sirve —la envoltura es anónima, y la primera versión de
       * esto devolvía su propio marco («at deDonde (<anonymous>:40:29)») en todos los
       * casos: un dato inútil presentado como la procedencia del temporizador—. Lo
       * que distingue los marcos es el origen: el código de este script inyectado no
       * tiene URL, y el de la página sí (la del documento si es un script en línea, o
       * la del bundle). Así que se devuelve el primer marco con URL. */
      var deDonde = function () {
        try {
          var pila = String(new Error().stack || "").split("\n").slice(1);
          for (var i = 0; i < pila.length; i++) {
            var l = pila[i].trim();
            if (l && /(https?:\/\/|\.m?js[:)])/.test(l)) return l.slice(0, 120);
          }
        } catch (e) {}
        return null;
      };
      ["setTimeout", "setInterval"].forEach(function (api) {
        try {
          var orig = window[api];
          if (typeof orig !== "function") return;
          window[api] = function (fn, ms) {
            try {
              window.__a11yTemporizadores.total++;
              var n = Number(ms);
              if (isFinite(n) && n >= UMBRAL && window.__a11yTemporizadores.largos.length < 20) {
                window.__a11yTemporizadores.largos.push({ api: api, ms: n, origen: deDonde() });
              }
            } catch (e) {}
            return orig.apply(this, arguments);
          };
        } catch (e) {}
      });
    });

    await abrir(page);

    // ── 1.4.10 Reflujo: estrechar a 320 px y buscar desplazamiento horizontal ──
    const reflow = await fase("reflujo", async function () {
      await page.setViewportSize({ width: REFLUJO_W, height: REFLUJO_H });
      await page.waitForTimeout(300);
      return await evalIn(page, `
        var de=document.documentElement;
        var cw=de.clientWidth, sw=Math.max(de.scrollWidth, document.body?document.body.scrollWidth:0);
        var offenders=[], descontados=0;
        if (sw > cw+2) {
          var all=document.body?document.body.querySelectorAll('*'):[];
          for (var i=0;i<all.length && offenders.length<25;i++){
            var el=all[i]; if(!__pintado(el)) continue;
            if (__ocultoALaVista(el)) { descontados++; continue; }
            var r=el.getBoundingClientRect();
            if (r.width<=0) continue;
            if (r.right <= cw+2) continue;
            // Solo el desbordante MÁS EXTERNO: si el padre ya desborda, el hijo es consecuencia.
            var p=el.parentElement, cubierto=false;
            while(p && p!==document.body){ var pr=p.getBoundingClientRect(); if(pr.right>cw+2){ cubierto=true; break; } p=p.parentElement; }
            if (cubierto) continue;
            offenders.push({ locator:__loc(el), uid:__uid(el), tag:el.tagName.toLowerCase(),
              role:(el.getAttribute('role')||'').split(/\\s+/)[0],
              detalle: Math.round(r.right-cw)+' px fuera' });
          }
        }
        /* Y el contenido RECORTADO, que es la otra mitad del criterio.
         *
         * Dictaminando solo por \`scrollWidth > clientWidth\`, un desbordamiento
         * escondido con \`overflow:hidden\` no produce barra, \`scrollWidth\` no crece,
         * y 1.4.10 salía «cumple» con 580 px de texto oculto e inalcanzable a 320 px
         * CSS. Pero el criterio no habla de barras: habla de que no haya pérdida de
         * información ni de funcionalidad. Un contenedor que esconde lo que no le
         * cabe, y sin forma de desplazarlo, es pérdida de información — y es PEOR
         * que la barra horizontal, porque ni se ve que falte algo.
         *
         * Se mira lo que ya se sabía mirar: contenedores cuyo contenido no cabe y
         * que no se pueden desplazar en ninguna de las dos direcciones. */
        var recortados=[];
        var cand=document.body?document.body.querySelectorAll('*'):[];
        for (var j=0;j<cand.length && recortados.length<25;j++){
          var e2=cand[j]; if(!__pintado(e2)) continue;
          /* El idioma de ocultacion visual, fuera: no es contenido que se vea, asi
             que no puede perderse. Se cuenta cuantos se descuentan, porque un
             descuento silencioso tampoco informa. */
          var porQue=__ocultoALaVista(e2);
          if (porQue) { descontados++; continue; }
          var cs2=getComputedStyle(e2);
          var ox=cs2.overflowX, oy=cs2.overflowY;
          var esconde = (ox==='hidden'||ox==='clip');
          if(!esconde) continue;
          var exceso = e2.scrollWidth - e2.clientWidth;
          if (exceso <= 2) continue;
          // ¿Se puede llegar a lo que sobra? Con \`hidden\` el scroll programático
          // existe pero no hay forma humana de usarlo; con \`clip\` ni eso.
          /* ¿Se puede llegar a lo que sobra?
           *
           * Con \`overflow:hidden\` el desplazamiento por programa existe, pero eso no
           * es una forma HUMANA de leer el texto: no hay barra ni gesto. La única vía
           * real es el foco del teclado, que arrastra el contenedor al enfocar algo de
           * dentro. Así que lo que decide es si hay algo enfocable ahí: con texto
           * plano, esos píxeles no se pueden leer de ninguna manera y es pérdida de
           * información; con controles dentro, el teclado llega y queda por comprobar
           * si el ratón y la vista también. */
          var conFoco = !!e2.querySelector('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
          var scrollProgramatico = false;
          if (ox === 'hidden') {
            var antes = e2.scrollLeft;
            e2.scrollLeft = exceso;
            scrollProgramatico = e2.scrollLeft > antes + 1;
            e2.scrollLeft = antes;
          }
          var alcanzable = conFoco && scrollProgramatico;
          var r2=e2.getBoundingClientRect();
          if (r2.width<=0||r2.height<=0) continue;
          var txt=(e2.innerText||e2.textContent||'').replace(/[\\s\\u00a0]+/g,' ').trim();
          if(!txt) continue;   // sin texto dentro, no hay información que perder
          recortados.push({ locator:__loc(e2), uid:__uid(e2), px:Math.round(exceso), overflow:ox,
            alcanzable: alcanzable, conFoco: conFoco, muestra: txt.slice(-60) });
        }
        return { w:cw, h:de.clientHeight, scrollWidth:sw, clientWidth:cw, offenders:offenders, recortados:recortados, descontados:descontados };`);
    }, null);

    // ── 1.4.4 Redimensionar el texto al 200 % ──
    const resize = await fase("redimensionar", async function () {
      await page.setViewportSize({ width: baseW, height: baseH });
      await abrir(page);
      const cobertura = await evalIn(page, "return __coberturaBloques(" + maxBloques + ");");
      const antes = await evalIn(page, "return __instantanea(" + maxBloques + ");");
      /* El 200 % hay que APLICARLO de verdad, y comprobar que se aplicó.
       *
       * `html { font-size: 200% }` no toca nada cuando los tamaños están en `px`,
       * que es lo normal. El código no lo comprobaba en ningún momento: devolvía
       * `aplicado: true` y el criterio salía «cumple · con el texto al 200 % no se
       * recorta ni se solapa ningún bloque». Medido: la fuente seguía en 14px antes
       * y después, y con el texto duplicado DE VERDAD se ocultaban 116 px de una
       * tarjeta de alto fijo. Un «cumple» sobre una medición de efecto nulo.
       *
       * Así que primero se prueba la vía del navegador, se comprueba en la propia
       * página si ha surtido efecto, y si no —el caso habitual— se escala el tamaño
       * y el interlineado COMPUTADOS de cada elemento con texto, que es lo que hace
       * el zoom de texto de un navegador. Se guarda lo que había para devolver la
       * página como estaba. */
      const efecto = await evalIn(page, `
        function conTexto(){
          var out=[];
          Array.prototype.forEach.call(document.querySelectorAll('body *'), function(el){
            if(!__pintado(el)) return;
            var propio='';
            var k=el.childNodes||[];
            for(var i=0;i<k.length;i++) if(k[i].nodeType===3) propio+=k[i].nodeValue||'';
            if(!propio.replace(/[\\s\\u00a0]+/g,'').length) return;
            out.push(el);
          });
          return out;
        }
        var muestra=conTexto();
        var antesFS=muestra.map(function(el){ return parseFloat(getComputedStyle(el).fontSize)||0; });

        var s=document.createElement('style'); s.id='__a11y-resize';
        s.textContent='html { font-size: 200% !important; }';
        document.head.appendChild(s);
        var despuesFS=muestra.map(function(el){ return parseFloat(getComputedStyle(el).fontSize)||0; });
        var crecio=0;
        for(var i=0;i<muestra.length;i++) if(despuesFS[i] > antesFS[i]+0.5) crecio++;

        // ¿Ha servido de algo? Si no, se hace el zoom de texto a mano.
        var via='raiz', escalados=0;
        if (crecio < muestra.length) {
          window.__a11yResizePrevios=[];
          muestra.forEach(function(el, i){
            var cs=getComputedStyle(el);
            var fs=parseFloat(cs.fontSize)||0;
            var lh=cs.lineHeight;
            window.__a11yResizePrevios.push({ el: el, fs: el.style.fontSize, lh: el.style.lineHeight });
            el.style.setProperty('font-size', (antesFS[i]*2)+'px', 'important');
            if (lh && lh !== 'normal') {
              var lhn=parseFloat(lh)||0;
              if (lhn) el.style.setProperty('line-height', (lhn*2)+'px', 'important');
            }
            escalados++;
          });
          via = crecio ? 'mixta' : 'por elemento';
        }
        return { via: via, muestra: muestra.length, crecioConLaRaiz: crecio, escalados: escalados };`);
      await page.waitForTimeout(350);
      const despues = await evalIn(page, "return __instantanea(" + maxBloques + ");");
      await evalIn(page, `
        var s=document.getElementById('__a11y-resize'); if(s) s.remove();
        (window.__a11yResizePrevios||[]).forEach(function(p){
          if(p.fs) p.el.style.setProperty('font-size', p.fs); else p.el.style.removeProperty('font-size');
          if(p.lh) p.el.style.setProperty('line-height', p.lh); else p.el.style.removeProperty('line-height');
        });
        delete window.__a11yResizePrevios;
        return true;`);
      return Object.assign({ aplicado: true, revisados: antes.length, cobertura: cobertura, efecto: efecto },
        diffCajas(antes, despues));
    }, { aplicado: false, motivo: "no se pudo medir el 200 %" });

    // ── 1.4.12 Espaciado del texto ──
    const spacing = await fase("espaciado", async function () {
      await abrir(page);
      const cobertura = await evalIn(page, "return __coberturaBloques(" + maxBloques + ");");
      const antes = await evalIn(page, "return __instantanea(" + maxBloques + ");");
      await evalIn(page, `
        var s=document.createElement('style'); s.id='__a11y-spacing';
        s.textContent=__arg; document.head.appendChild(s); return true;`, CSS_ESPACIADO);
      await page.waitForTimeout(350);
      const despues = await evalIn(page, "return __instantanea(" + maxBloques + ");");
      await evalIn(page, "var s=document.getElementById('__a11y-spacing'); if(s) s.remove(); return true;");
      return Object.assign({ aplicado: true, revisados: antes.length, cobertura: cobertura }, diffCajas(antes, despues));
    }, { aplicado: false, motivo: "no se pudo aplicar el CSS de espaciado" });

    // ── 1.3.4 Orientación ──
    const orientation = await fase("orientación", async function () {
      await abrir(page);
      const bloqueo = await evalIn(page, `
        var src='';
        Array.prototype.forEach.call(document.querySelectorAll('script:not([src])'), function(s){ src += s.textContent||''; });
        var media=[], ilegibles=0;
        Array.prototype.forEach.call(document.styleSheets, function(ss){
          /* Una hoja de otro origen lanza al tocar cssRules. Se CUENTA: si se
             descartara en silencio, 1.3.4 podría decir "no hay bloqueo de
             orientación" sobre un CSS que nunca se ha podido leer. */
          var rules=null; try { rules=ss.cssRules; } catch(e) { ilegibles++; return; }
          if(!rules) return;
          Array.prototype.forEach.call(rules, function(r){
            if(r.type===4 && /orientation/i.test(r.conditionText||r.media&&r.media.mediaText||'')){
              var txt=Array.prototype.map.call(r.cssRules||[], function(x){ return x.cssText; }).join(' ');
              if(/display\\s*:\\s*none|visibility\\s*:\\s*hidden|transform\\s*:\\s*rotate/i.test(txt)) media.push(r.conditionText||r.media.mediaText);
            }
          });
        });
        /* La detección de verdad viene de la API envuelta (window.__a11yOrientacion),
           que ve la llamada venga de donde venga. La búsqueda en el texto de los
           scripts en línea se queda como PISTA para la evidencia, no como veredicto:
           sirve para decirle al auditor dónde mirar cuando sí está escrita ahí. */
        var observado = (window.__a11yOrientacion && window.__a11yOrientacion.llamadas) || [];
        var enTexto = /screen\\s*\\.\\s*orientation\\s*\\.\\s*lock\\s*\\(|lockOrientation\\s*\\(/.test(src);
        return { bloqueoJS: observado.length > 0, llamadas: observado.slice(0, 6),
                 enScriptEnLinea: enTexto, mediaBloqueante: media, hojasIlegibles: ilegibles };`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      const vert = await evalIn(page, "return (document.body?document.body.innerText:'').replace(/\\s+/g,' ').trim().length;");
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(250);
      const horiz = await evalIn(page, "return (document.body?document.body.innerText:'').replace(/\\s+/g,' ').trim().length;");
      return Object.assign(bloqueo, { textoVertical: vert, textoHorizontal: horiz });
    }, null);

    // ── 1.4.13 Contenido al recibir foco o puntero ──
    const hover = await fase("emergentes", async function () {
      await page.setViewportSize({ width: baseW, height: baseH });
      await abrir(page);
      const base = await evalIn(page, `
        var titles=[];
        Array.prototype.forEach.call(document.querySelectorAll('[title]'), function(el){
          var t=el.tagName.toLowerCase();
          if(t==='iframe'||t==='frame') return;        // ahí title es el nombre del marco
          if(!__pintado(el)) return;
          var v=(el.getAttribute('title')||'').trim(); if(!v) return;
          titles.push({ locator:__loc(el), texto:v });
        });
        return { titles: titles.slice(0,40), titlesTotal: titles.length };`);

      // Sonda de puntero de verdad: por cada disparador, pasar el ratón, ver qué
      // APARECE, probar Esc y comprobar si el emergente se puede señalar (que el
      // puntero pueda viajar hasta él sin que desaparezca por el camino).
      const maxHover = opts.maxHover == null ? 12 : opts.maxHover;
      const disp = await evalIn(page, "return __disparadoresEmergentes(" + maxHover + ");");
      const hovers = [];
      for (const d of ((disp && disp.disparadores) || [])) {
        try {
          /* Lo que APARECE se compara por elemento, no por elemento-y-rectángulo.
           *
           * `__visibleHuella()` devuelve `uid@x,y,ancho,alto`, y la comparación usaba
           * la cadena entera. Con eso, cualquier reajuste de maquetación cuenta como
           * contenido nuevo: al desplegarse una pista, el bloque de debajo baja treinta
           * píxeles, cambia su clave y pasa por «emergente». Medido: el viaje del
           * puntero se iba al centro de un bloque desplazado —no al emergente— y de
           * ahí salía un «desaparece al llevar el puntero encima» sobre una pista que
           * se comporta perfectamente.
           *
           * Y al revés, lo que SIGUE visible también se comparaba por la cadena
           * entera: un emergente que se queda abierto tras el Esc pero se mueve un
           * píxel parecía haberse cerrado, y el criterio lo daba por descartable. Esa
           * era la peligrosa: absolvía sin haber comprobado nada. */
          const soloUid = function (x) { return String(x).split("@")[0]; };
          const antes = await evalIn(page, "return __visibleHuella();");
          const antesUid = {};
          antes.forEach(function (x) { antesUid[soloUid(x)] = true; });
          await page.hover(d.uid, { timeout: 1500 });
          await page.waitForTimeout(220);
          const durante = await evalIn(page, "return __visibleHuella();");
          const nuevos = durante.filter(function (x) { return !antesUid[soloUid(x)]; });
          if (!nuevos.length) { await page.mouse.move(0, 0); continue; }
          const nuevosUid = nuevos.map(soloUid);
          const sigueVisible = function (lista) {
            const vis = {};
            lista.forEach(function (x) { vis[soloUid(x)] = true; });
            return nuevosUid.filter(function (u) { return vis[u]; });
          };


          /* ¿TAPA algo? La condición está en el propio criterio y no se miraba.
           *
           * El requisito de «descartable» de 1.4.13 lleva su excepción escrita:
           * «except when the additional content ... does not obscure or replace other
           * content». Un tooltip que aparece en un hueco reservado debajo de un campo
           * no tapa nada y no necesita Esc; un submenú desplegable sí tapa, y
           * entonces Esc es obligatorio. Sin esta cuenta, cualquier emergente hecho
           * con `:hover` en CSS —que por definición no responde a Esc— salía como
           * falla grave, incluido el que la excepción exime.
           *
           * Se mide donde se puede medir: fuera del flujo (absolute/fixed/sticky, que
           * es lo que permite solapar) y con algo pintado DEBAJO de su centro que no
           * sea suyo ni el propio disparador.
           *
           * Va DESPUÉS del Esc a propósito, y es seguro: si el Esc cerró el emergente
           * aquí no hay nada que medir, pero tampoco hace falta —«descartable» ya se
           * cumple—; y si no lo cerró, sigue abierto y se mide bien. Donde `tapa`
           * importa, el emergente está delante. */
          const tapa = await evalIn(page, `
            var uids=__arg.nuevos.map(function(s){ return s.split('@')[0]; });
            var t=document.querySelector(__arg.uid);
            for(var i=0;i<uids.length;i++){
              var e=document.querySelector(uids[i]); if(!e) continue;
              var fuera=false, n=e;
              while(n && n.nodeType===1){
                var p=getComputedStyle(n).position;
                if(p==='absolute'||p==='fixed'||p==='sticky'){ fuera=true; break; }
                n=n.parentElement;
              }
              if(!fuera) continue;
              var r=e.getBoundingClientRect();
              if(r.width<4||r.height<4) continue;
              var cx=Math.min(Math.max(r.left+r.width/2,1), innerWidth-1);
              var cy=Math.min(Math.max(r.top+r.height/2,1), innerHeight-1);
              var pila=[];
              try{ pila=document.elementsFromPoint(cx,cy)||[]; }catch(err){ pila=[]; }
              for(var k=0;k<pila.length;k++){
                var o=pila[k];
                if(o===e||e.contains(o)||o.contains(e)) continue;
                if(o===document.body||o===document.documentElement) continue;
                if(t && (o===t||t.contains(o))) continue;
                var txt=(o.textContent||'').trim();
                if(txt || o.getClientRects().length) return true;
              }
            }
            return false;`, { uid: d.uid, nuevos: nuevos.slice(0, 8) });

          /* ¿Se puede SEÑALAR? Se mueve el puntero de verdad, paso a paso.
           *
           * Esto era aritmética de rectángulos: valía si el emergente tocaba al
           * disparador o era descendiente suyo. Lo segundo es falso de una forma que
           * la sonda cazó en el primer montaje: un globo `position:absolute` colocado
           * 40 px por debajo de su disparador ES descendiente suyo, así que el atajo
           * `t.contains(e)` lo daba por alcanzable — y no lo es, porque al cruzar el
           * hueco el puntero no está sobre ninguno de los dos, el `:hover` se cae y el
           * globo desaparece antes de llegar. Es el fallo clásico de 1.4.13 y el atajo
           * lo absolvía.
           *
           * Ahora se viaja: se vuelve a abrir el emergente y se mueve el ratón hasta
           * su centro en pasos intermedios, como lo movería una mano. Si al llegar
           * sigue visible, se puede señalar. Eso no es una heurística: es la prueba. */
          let senalable = null;
          try {
            await page.hover(d.uid, { timeout: 1500 });
            await page.waitForTimeout(180);
            /* Se entra por el punto del emergente MÁS CERCANO al disparador, no por
             * su centro.
             *
             * Apuntar al centro traza una diagonal, y una diagonal se sale del
             * disparador por el lado antes de entrar en el emergente. Medido paso a
             * paso en Chromium sobre un globo que pega perfectamente con su
             * disparador (`top:100%`, tocándose en y=36): al tercer paso el puntero
             * iba por (101,34) —todavía a la altura del disparador pero 1 px pasado su
             * borde derecho—, el `:hover` se caía y el globo desaparecía. Un emergente
             * impecable salía como «no se puede señalar».
             *
             * Una mano no hace eso: baja al emergente y luego se mueve por dentro. Así
             * que primero se entra por el punto más próximo (el centro del disparador
             * recortado dentro del rectángulo del emergente) y después, ya dentro, se
             * va al centro. */
            const destino = await evalIn(page, `
              var t=document.querySelector(__arg.uid);
              var tr=t?t.getBoundingClientRect():null;
              var uids=__arg.nuevos.map(function(s){ return s.split('@')[0]; });
              for(var i=0;i<uids.length;i++){
                var e=document.querySelector(uids[i]); if(!e) continue;
                var r=e.getBoundingClientRect();
                if(r.width<4||r.height<4) continue;
                if(r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth) continue;
                var ox=tr?tr.left+tr.width/2:r.left+r.width/2;
                var oy=tr?tr.top+tr.height/2:r.top+r.height/2;
                var ins=Math.min(3, r.width/3, r.height/3);
                var clamp=function(v,a,b){ return Math.min(Math.max(v,a),b); };
                return { uid: uids[i],
                  ex: clamp(clamp(ox, r.left+ins, r.right-ins), 1, innerWidth-1),
                  ey: clamp(clamp(oy, r.top+ins, r.bottom-ins), 1, innerHeight-1),
                  cx: clamp(r.left+r.width/2, 1, innerWidth-1),
                  cy: clamp(r.top+r.height/2, 1, innerHeight-1) };
              }
              return null;`, { uid: d.uid, nuevos: nuevos.slice(0, 8) });
            if (destino) {
              await page.mouse.move(destino.ex, destino.ey, { steps: 10 });
              await page.waitForTimeout(140);
              let vivo = sigueVisible(await evalIn(page, "return __visibleHuella();")).length > 0;
              if (vivo) {
                // Ya dentro: moverse por el emergente no debería cerrarlo.
                await page.mouse.move(destino.cx, destino.cy, { steps: 6 });
                await page.waitForTimeout(140);
                vivo = sigueVisible(await evalIn(page, "return __visibleHuella();")).length > 0;
              }
              senalable = vivo;
            }
          } catch (e) { senalable = null; }

          /* Y el Esc va DESPUÉS del viaje, reabriendo el emergente.
           *
           * Estaba al revés, y el orden importaba: hay sitios cuyo manejador de Esc
           * deja el emergente cerrado con una clase («.cerrado .b{display:none}»), así
           * que después del Esc ya no se puede volver a abrir y el viaje del puntero
           * no se podía hacer — quedaba sin comprobar justo en los emergentes que SÍ
           * se portan bien con el teclado. Haciendo el viaje primero y reabriendo
           * después, las dos condiciones se miden sobre un emergente recién abierto.
           *
           * El Esc se prueba sin mover el puntero desde que el emergente aparece, que
           * es lo que pide el criterio: «without moving pointer hover or keyboard
           * focus». Si no se consigue reabrir, no se afirma nada: `null`. */
          let descartable = null;
          try {
            await page.mouse.move(0, 0);
            await page.waitForTimeout(140);
            await page.hover(d.uid, { timeout: 1500 });
            await page.waitForTimeout(200);
            const reabierto = sigueVisible(await evalIn(page, "return __visibleHuella();"));
            if (reabierto.length) {
              await page.keyboard.press("Escape");
              await page.waitForTimeout(180);
              descartable = sigueVisible(await evalIn(page, "return __visibleHuella();")).length === 0;
            }
          } catch (e) { descartable = null; }

          hovers.push({
            locator: d.locator, uid: d.uid, regla: d.regla,
            aparece: nuevos.length, descartableConEsc: descartable,
            // `null` es «no se pudo viajar»: no se afirma ni que sí ni que no.
            senalable: senalable === null ? null : senalable === true,
            tapa: tapa === true
          });
          await page.mouse.move(0, 0);
          await page.waitForTimeout(120);
        } catch (e) { /* un disparador que no se deja señalar no tumba la fase */ }
      }
      return Object.assign(base, {
        hovers: hovers,
        hoverProbado: true,
        disparadores: ((disp && disp.disparadores) || []).length,
        hojasBloqueadas: (disp && disp.hojasBloqueadas) || 0
      });
    }, null);

    /* 2.2.1: lo que la API envuelta anotó mientras la página cargaba y se medía. */
    const tiempos = await fase("temporizadores", function () {
      return page.evaluate(function () {
        var t = window.__a11yTemporizadores || null;
        return t ? { largos: t.largos || [], total: t.total || 0 } : null;
      });
    }, null);

    const findings = analyzeViewport({ reflow: reflow, resize: resize, spacing: spacing, orientation: orientation, hover: hover, tiempos: tiempos });
    return {
      url: target.url || null,
      findings: findings,
      trazas: { reflow: reflow, resize: resize, spacing: spacing, orientation: orientation, hover: hover, tiempos: tiempos },
      errores: errores,
      summary: {
        falla: findings.filter(function (f) { return f.verdict === "falla"; }).length,
        revisar: findings.filter(function (f) { return f.verdict === "revisar"; }).length,
        cumple: findings.filter(function (f) { return f.verdict === "cumple"; }).length
      }
    };
  } finally {
    if (browser) await browser.close();
    else if (opts.page) {
      // Devolvemos la página prestada como nos la dieron: tamaño base y recargada.
      try { await opts.page.setViewportSize({ width: baseW, height: baseH }); await abrir(opts.page); } catch (e) { /* la cierra quien la abrió */ }
    }
  }
}
