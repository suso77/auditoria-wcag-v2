/**
 * Rastreo del sitio para construir la muestra (WCAG-EM, paso 3).
 *
 * Recorre el sitio con UN navegador, extrae de cada página las señales que
 * necesita la selección (plantilla, categoría, tipos de contenido) y devuelve las
 * candidatas. La selección en sí es pura y vive en sampling.js.
 *
 * ── CORTESÍA Y SEGURIDAD ───────────────────────────────────────────────────
 * Esto visita un sitio que no es nuestro, así que:
 *
 *  1. **Se respeta robots.txt.** No porque nos obligue —una auditoría contratada
 *     tiene permiso— sino porque las rutas que un sitio marca como prohibidas
 *     suelen ser justo las que no hay que tocar: carritos, paneles, endpoints de
 *     acción. `robots: "ignorar"` lo desactiva y exige decisión explícita.
 *  2. **Solo GET y solo el mismo host.** Nada de formularios, nada de salir del
 *     dominio, nada de descargar binarios: los PDF y demás se anotan como señal
 *     de contenido, no se abren.
 *  3. **Nada que suene a acción destructiva.** Cerrar sesión, borrar, cancelar,
 *     darse de baja: ni se visitan ni se cuentan. Un rastreador que pulsa
 *     «cerrar sesión» invalida el resto del rastreo; uno que pulsa «eliminar»
 *     hace daño.
 *  4. **Ritmo.** Una página cada vez y una pausa entre peticiones, con tope de
 *     páginas y de profundidad. Auditar no puede parecerse a un ataque.
 */
import { launchOptions } from "./playwright-launch.js";
import { seleccionarMuestra, justificarMuestra } from "./sampling.js";

/**
 * Lo que no se visita jamás, ni con robots.txt permisivo.
 *
 * Van separadas la RUTA y el TEXTO del enlace a propósito. En el texto, «Salir»
 * o «Eliminar» son inequívocos. En una ruta no: `/como-salir-de-dudas` o
 * `/borradores` son páginas legítimas, y bloquearlas deja agujeros en la muestra
 * sin que nadie se entere. Por eso la de rutas exige término delimitado y deja
 * fuera las palabras demasiado genéricas.
 */
export const NO_VISITAR = /(?:^|[^a-z0-9áéíóúñ])(logout|log-?out|sign-?out|signout|cerrar-?sesi[oó]n|cerrar-?sesion|desconectar|delete|eliminar|borrar|anular|revocar|vaciar|destroy|cancelar-?cuenta|darse-?de-?baja|unsubscribe|vaciar-?carrito)(?:[^a-z0-9áéíóúñ]|$)/i;
/**
 * Texto del enlace. Dos grados, porque no todas las palabras son igual de claras:
 *
 *  - EXACTAS: la palabra tiene que ser el nombre entero del enlace. «Salir» a
 *    secas es inequívoco; «Cómo salir de dudas» es un artículo, y bloquearlo
 *    deja un agujero en la muestra sin que nadie se entere.
 *  - FRASES: se pueden buscar dentro del nombre, porque no aparecen por azar.
 */
const TEXTO_EXACTO = /^(salir|desconectar|eliminar|borrar|vaciar|anular|logout|log out|sign out)$/i;
const TEXTO_FRASE = /(cerrar (la )?sesi[oó]n|darse de baja|eliminar (mi )?cuenta|borrar (la )?cuenta|vaciar (el )?carrito|cerrar sesion)/i;
export function noVisitarPorTexto(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return TEXTO_EXACTO.test(t) || TEXTO_FRASE.test(t);
}
/** Se conserva por compatibilidad; la decisión la toma `noVisitarPorTexto`. */
export const NO_VISITAR_TEXTO = TEXTO_FRASE;
// Extensiones que no son páginas: se anotan como señal, no se abren.
const NO_HTML = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|gz|tar|csv|jpe?g|png|gif|webp|avif|svg|ico|mp4|webm|mp3|wav|ogg|woff2?|ttf|eot|exe|dmg|pkg|apk)(\?|#|$)/i;

/* ── robots.txt ──────────────────────────────────────────────────────────── */

/**
 * Parser de robots.txt para `User-agent: *` (y el nuestro si aparece).
 * Devuelve `{ permite(ruta) }`. Sin reglas, permite todo.
 */
export function parseRobots(texto, agente) {
  const reglas = [];
  let aplicando = false;
  String(texto || "").split(/\r?\n/).forEach(function (linea) {
    const l = linea.replace(/#.*$/, "").trim();
    if (!l) return;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l);
    if (!m) return;
    const clave = m[1].toLowerCase(), valor = m[2].trim();
    if (clave === "user-agent") {
      const ua = valor.toLowerCase();
      aplicando = (ua === "*" || (agente && ua === String(agente).toLowerCase()));
      return;
    }
    if (!aplicando) return;
    if (clave === "disallow" || clave === "allow") {
      if (clave === "disallow" && valor === "") return; // "Disallow:" vacío = permite todo
      reglas.push({ permitir: clave === "allow", patron: valor });
    }
  });
  // La regla más específica gana; a igualdad, Allow sobre Disallow (como Google).
  return {
    reglas: reglas,
    permite: function (ruta) {
      let mejor = null;
      reglas.forEach(function (r) {
        if (!coincide(ruta, r.patron)) return;
        const peso = r.patron.replace(/\*/g, "").length;
        if (!mejor || peso > mejor.peso || (peso === mejor.peso && r.permitir)) mejor = { peso: peso, permitir: r.permitir };
      });
      return mejor ? mejor.permitir : true;
    }
  };
}
function coincide(ruta, patron) {
  if (!patron) return false;
  const finExacto = /\$$/.test(patron);
  const p = patron.replace(/\$$/, "");
  const partes = p.split("*");
  let i = 0;
  for (let k = 0; k < partes.length; k++) {
    const seg = partes[k];
    if (!seg) continue;
    const j = ruta.indexOf(seg, i);
    if (k === 0 ? j !== 0 : j === -1) return false;
    i = j + seg.length;
  }
  return finExacto ? i === ruta.length : true;
}

/* ── Extracción de señales, dentro de la página ──────────────────────────── */

const EXTRAER = `
function __vis(el){ if(!el||!el.getClientRects||!el.getClientRects().length) return false; var cs=getComputedStyle(el); return cs.visibility!=='hidden'&&cs.display!=='none'; }
function __cls(el){ var c=(el.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean)[0]; return c||''; }
/* Firma de PLANTILLA: la forma de la MAQUETACIÓN, no del contenido.
   Landmarks en orden + la clase de body y de main + las clases de los bloques de
   primer nivel + cuántos enlaces tiene la navegación.

   La clave está en contar SOLO los elementos con clase propia. Las clases las
   pone la plantilla; las etiquetas sueltas (<p>, <table>, <video>) las pone el
   contenido. Mezclándolas, dos fichas del mismo diseño —una con tabla y otra con
   vídeo— salían como plantillas distintas, y en un sitio real cada artículo
   habría parecido una plantilla propia: la muestra estructurada se dispararía. */
function __plantilla(){
  var marcas=[];
  Array.prototype.forEach.call(document.querySelectorAll('header,nav,main,aside,footer,[role=banner],[role=navigation],[role=main],[role=complementary],[role=contentinfo],[role=search]'), function(el){
    if(!__vis(el)) return;
    var r=(el.getAttribute('role')||'').split(/\\s+/)[0] || el.tagName.toLowerCase();
    marcas.push(r);
  });
  var main=document.querySelector('main,[role=main]')||document.body;
  var bloques=[];
  if(main) Array.prototype.forEach.call(main.children, function(el){
    if(!__vis(el)) return;
    var c=__cls(el); if(!c) return;             // sin clase = contenido, no plantilla
    bloques.push(el.tagName.toLowerCase()+'.'+c);
  });
  var nav=document.querySelector('nav,[role=navigation]');
  var nItems=nav?nav.querySelectorAll('a[href]').length:0;
  var raiz=(document.body?__cls(document.body):'')+'/'+(main?__cls(main):'');
  return marcas.join('>')+'|'+raiz+'|'+bloques.slice(0,12).join(',')+'|nav:'+nItems;
}
function __enlaces(){
  var out=[];
  Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function(a){
    var h=a.getAttribute('href'); if(!h) return;
    out.push({ href: h, texto: (a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80), rel: (a.getAttribute('rel')||'') });
  });
  return out;
}
function __señales(){
  var q=function(s){ return !!document.querySelector(s); };
  var forms=Array.prototype.slice.call(document.querySelectorAll('form'));
  var tienePass=q('input[type=password]');
  var tablas=Array.prototype.slice.call(document.querySelectorAll('table')).filter(function(t){
    return t.querySelectorAll('th').length>0 || t.querySelectorAll('tr').length>2;  // tabla de datos, no de maquetación
  });
  var svgComplejo=Array.prototype.slice.call(document.querySelectorAll('svg')).some(function(s){ return s.querySelectorAll('*').length>20; });
  var pdf=Array.prototype.some.call(document.querySelectorAll('a[href]'), function(a){ return /\\.pdf(\\?|#|$)/i.test(a.getAttribute('href')||''); });
  var textoProceso=/(paso\\s*\\d|step\\s*\\d|de\\s*\\d+\\s*pasos|checkout|carrito|finalizar (compra|pedido)|siguiente paso)/i;
  var cuerpo=(document.body?document.body.innerText:'').slice(0,4000);
  return {
    tieneFormulario: forms.length>0,
    tieneAcceso: tienePass,
    tieneBusqueda: q('input[type=search],[role=search]'),
    esProceso: textoProceso.test(cuerpo) || !!document.querySelector('[role=progressbar],ol.pasos,.breadcrumb-steps,[aria-current=step]'),
    video: q('video,iframe[src*="youtube"],iframe[src*="vimeo"]'),
    audio: q('audio'),
    tabla: tablas.length>0,
    iframe: q('iframe'),
    canvas: q('canvas') || svgComplejo,
    pdf: pdf,
    mapa: q('iframe[src*="maps"],[class*="map"],[id*="map"]') && q('iframe,canvas'),
    widget: q('[role=tablist],[role=dialog],[aria-expanded],details,[role=menu]'),
    carrusel: q('[class*="carousel"],[class*="slider"],[class*="swiper"],[aria-roledescription=carousel]'),
    esInicio: false
  };
}
return { titulo: (document.title||'').trim(), lang: (document.documentElement.getAttribute('lang')||''), plantilla: __plantilla(), enlaces: __enlaces(), señales: __señales() };
`;

/* ── Rastreo ─────────────────────────────────────────────────────────────── */

function mismaRaiz(u, raiz) {
  return u.host === raiz.host;
}

/**
 * Rastrea un sitio y devuelve las candidatas para la muestra.
 *
 * @param {string} inicio  URL de partida
 * @param {{ max?:number, profundidad?:number, pausaMs?:number, robots?:"respetar"|"ignorar",
 *           timeout?:number, waitMs?:number, launchOptions?, onPagina?:(p)=>void }} [opts]
 */
export async function crawlSite(inicio, opts) {
  opts = opts || {};
  const max = opts.max || 60;
  const maxProf = opts.profundidad != null ? opts.profundidad : 3;
  const pausa = opts.pausaMs != null ? opts.pausaMs : 250;
  const raiz = new URL(inicio);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(launchOptions(opts.launchOptions));
  const avisos = [];
  const errores = [];

  try {
    const page = await browser.newPage();

    // robots.txt
    let robots = { permite: function () { return true; }, reglas: [] };
    if (opts.robots !== "ignorar") {
      try {
        const r = await page.context().request.get(raiz.origin + "/robots.txt", { timeout: 8000 });
        if (r.ok()) {
          robots = parseRobots(await r.text(), "a11y-motor");
          if (robots.reglas.length) avisos.push("robots.txt aplicado: " + robots.reglas.length + " regla(s).");
        }
      } catch (e) { avisos.push("No se pudo leer robots.txt (" + ((e && e.message) || e) + "): se rastrea sin restricciones declaradas."); }
    } else {
      avisos.push("robots.txt IGNORADO por configuración explícita.");
    }

    const vistas = new Set();
    const candidatas = [];
    const cola = [{ url: raiz.href, prof: 0 }];
    const saltadas = { robots: 0, destructiva: 0, externa: 0, noHtml: 0 };

    while (cola.length && candidatas.length < max) {
      const actual = cola.shift();
      let u;
      try { u = new URL(actual.url); } catch (e) { continue; }
      u.hash = "";
      const clave = u.host + u.pathname.replace(/\/+$/, "") + u.search;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      if (NO_VISITAR.test(u.pathname + u.search)) { saltadas.destructiva++; continue; }
      if (!robots.permite(u.pathname)) { saltadas.robots++; continue; }

      let datos = null;
      try {
        const resp = await page.goto(u.href, { waitUntil: opts.waitUntil || "load", timeout: opts.timeout || 20000 });
        if (resp && !resp.ok()) { errores.push({ url: u.href, error: "HTTP " + resp.status() }); continue; }
        const ct = resp ? (resp.headers()["content-type"] || "") : "";
        if (ct && ct.indexOf("html") === -1) { saltadas.noHtml++; continue; }
        if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
        datos = await page.evaluate(new Function(EXTRAER));
      } catch (e) {
        errores.push({ url: u.href, error: (e && e.message) || String(e) });
        continue;
      }

      const ruta = u.pathname + (u.search || "");
      datos["señales"].esInicio = (u.pathname === "/" || u.pathname === "");
      candidatas.push({
        url: u.href, ruta: ruta, titulo: datos.titulo, lang: datos.lang,
        plantilla: datos.plantilla, "señales": datos["señales"], profundidad: actual.prof
      });
      if (opts.onPagina) opts.onPagina(candidatas[candidatas.length - 1]);

      if (actual.prof < maxProf) {
        (datos.enlaces || []).forEach(function (e) {
          let d;
          try { d = new URL(e.href, u.href); } catch (err) { return; }
          if (d.protocol !== "http:" && d.protocol !== "https:") return;
          if (!mismaRaiz(d, raiz)) { saltadas.externa++; return; }
          if (NO_HTML.test(d.pathname)) { saltadas.noHtml++; return; }
          if (NO_VISITAR.test(d.pathname + d.search) || noVisitarPorTexto(e.texto)) { saltadas.destructiva++; return; }
          d.hash = "";
          cola.push({ url: d.href, prof: actual.prof + 1 });
        });
      }
      if (pausa) await page.waitForTimeout(pausa);
    }

    if (candidatas.length >= max) avisos.push("Se alcanzó el tope de " + max + " páginas rastreadas: puede haber más sitio sin explorar.");
    return {
      inicio: raiz.href,
      candidatas: candidatas,
      saltadas: saltadas,
      avisos: avisos,
      errores: errores,
      procedencia: {
        fecha: new Date().toISOString(),
        origen: raiz.origin,
        maxPaginas: max, profundidad: maxProf, pausaMs: pausa,
        robots: opts.robots === "ignorar" ? "ignorado" : "respetado",
        navegador: "Chromium " + browser.version()
      }
    };
  } finally {
    await browser.close();
  }
}

/**
 * Rastrea y selecciona la muestra de una vez. Devuelve lo que hace falta para
 * documentarla en el IRA: la muestra con su motivo, la cobertura y la prosa.
 */
export async function muestrearSitio(inicio, opts) {
  opts = opts || {};
  const r = await crawlSite(inicio, opts);
  const sel = seleccionarMuestra(r.candidatas, {
    max: opts.tamañoMuestra || opts.tamanoMuestra || 20,
    semilla: opts.semilla || new URL(inicio).host,
    porcentajeAleatorio: opts.porcentajeAleatorio
  });
  return Object.assign({}, sel, {
    rastreo: { candidatas: r.candidatas.length, saltadas: r.saltadas, avisos: r.avisos, errores: r.errores },
    procedencia: r.procedencia,
    justificacion: justificarMuestra(sel),
    avisos: (sel.avisos || []).concat(r.avisos)
  });
}
