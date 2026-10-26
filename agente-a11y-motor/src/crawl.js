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
  // Las líneas User-agent CONSECUTIVAS forman un solo grupo (RFC 9309 §2.2.1), y
  // sus reglas valen para todos los agentes nombrados. Antes cada línea
  // sobreescribía a la anterior, así que en
  //     User-agent: *
  //     User-agent: Googlebot
  //     Disallow: /panel
  // la última línea ponía `aplicando` en falso y el Disallow se perdía: el
  // rastreador entraba en /panel, que es justo lo que robots.txt estaba pidiendo
  // que no tocara. Mientras se encadenan User-agent, el grupo solo suma.
  let enCabecera = false;
  String(texto || "").split(/\r?\n/).forEach(function (linea) {
    const l = linea.replace(/#.*$/, "").trim();
    if (!l) return;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(l);
    if (!m) return;
    const clave = m[1].toLowerCase(), valor = m[2].trim();
    if (clave === "user-agent") {
      const ua = valor.toLowerCase();
      const nos = (ua === "*" || (agente && ua === String(agente).toLowerCase()));
      aplicando = enCabecera ? (aplicando || nos) : nos;
      enCabecera = true;
      return;
    }
    enCabecera = false;
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

/**
 * LA LECTURA QUE HACE EL RASTREO, EXPORTADA A PROPÓSITO.
 *
 * Se exporta para que los instrumentos de medir usen ESTA y no una copia. Ya
 * pasó una vez en este proyecto: una sonda escrita a mano con una regla más
 * débil que la del agente «encontró» un falso negativo que no existía. Un
 * instrumento que reimplementa lo que mide no mide nada.
 */
export const EXTRAER = `
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
function __vis(el){ if(!el||!el.getClientRects||!el.getClientRects().length) return false; var cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') return false; return __opacidadAcum(el) > 0; }
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

/**
 * Qué cambió entre la primera lectura de una página y la segunda.
 *
 * Vive fuera del bucle del rastreo y se exporta A PROPÓSITO: la comparación es
 * la pieza que decide si una señal es de fiar, y dentro del `page.evaluate` solo
 * se podía probar con navegador. Los tests con navegador se SALTAN donde no lo
 * hay, y un test que se salta en silencio es el verde falso que este proyecto
 * persigue. Así que la lógica se prueba pura y aparte.
 *
 * Devuelve las claves que cambiaron, en orden estable: `plantilla` primero si
 * cambió, luego las señales por nombre, luego `enlaces`. Vacío = la primera
 * lectura ya era estable.
 */
export function diferenciaDeLectura(primera, segunda) {
  if (!primera || !segunda) return [];
  const cambio = [];
  if (segunda.plantilla !== primera.plantilla) cambio.push("plantilla");
  const a = primera["señales"] || {}, b = segunda["señales"] || {};
  Object.keys(b).sort().forEach(function (k) { if (String(a[k]) !== String(b[k])) cambio.push(k); });
  if ((segunda.enlaces || []).length !== (primera.enlaces || []).length) cambio.push("enlaces");
  return cambio;
}

/* ── Rastreo ─────────────────────────────────────────────────────────────── */

function mismaRaiz(u, raiz) {
  return u.host === raiz.host;
}

/**
 * Rastrea un sitio y devuelve las candidatas para la muestra.
 *
 * @param {string} inicio  URL de partida
 * @param {{ max?:number, profundidad?:number, pausaMs?:number, robots?:"respetar"|"ignorar",
 *           timeout?:number, waitMs?:number, asentarMs?:number, launchOptions?, onPagina?:(p)=>void }} [opts]
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
  // Páginas que hicieron falta DOS intentos: dato del informe, no ruido. Un
  // sitio donde hay que reintentar es un sitio lento, y eso explica por qué una
  // pasada puede no ver lo mismo que la siguiente.
  const reintentadas = [];

  /* ── EL SUELO DE ESPERA NO SE ADIVINA: SE MIDE EN EL SITIO ────────────────
   *
   * La convergencia con suelo fijo de 1 s se midió en montajes locales y el
   * sitio del autor la desmintió. Reproducido aquí de forma determinista, con
   * una página que muta a los 1400 ms:
   *
   *     suelo 1000 → …|div.min-h-screen|nav:1   asentado=null  sinAsentar=null
   *     suelo 2250 → …|div.bg-white|nav:2       asentado=["plantilla","enlaces"]
   *
   * O sea: con el suelo corto se lee la página ANTES de hidratarse, con un
   * enlace menos, Y NO SE DICE NADA. Dos lecturas iguales a 500 y 1000 ms no
   * son una página acabada, y es exactamente lo que salió en jesusaccesible.com:
   * `div.min-h-screen` en una pasada y `div.bg-white` en las otras cuatro, con
   * 117 candidatas contra 124 y cero errores de carga.
   *
   * Cualquier constante que yo ponga aquí es un número elegido en otra máquina y
   * otra red. Así que el rastreo CALIBRA: en la primera página —y cada N— se
   * observa hasta el techo SIN salida anticipada, se mira en qué milisegundo
   * ocurrió la última mutación, y el suelo pasa a ser eso más un margen. Se paga
   * el techo entero en esas páginas y el suelo medido en las demás.
   *
   * Y lo que se midió SE DICE, con el número: un suelo que el agente se puso
   * solo es un dato del informe, no un detalle de implementación. */
  const reposoBase = opts.asentarMs != null ? opts.asentarMs : 500;
  const techoBase = opts.asentarTechoMs != null ? opts.asentarTechoMs : 4000;
  const margenAsentar = opts.asentarMargenMs != null ? opts.asentarMargenMs : 500;
  const sueloBase = opts.asentarSueloMs != null ? opts.asentarSueloMs : 1000;
  let sueloEfectivo = sueloBase;
  /* UN TOPE AL SUELO QUE LA CALIBRACIÓN PUEDE PEDIR.
   *
   * Sale de una pasada real que acabó en 25 HORAS. El portátil del autor se
   * suspendió a mitad del rastreo, y como la convergencia mide con el reloj de
   * pared, el hueco del sueño entró en la medición: la calibración «midió» que
   * la página mutaba a los 925 597 ms y puso el suelo en 926 250 ms —quince
   * minutos por página—. 124 páginas a ese ritmo son treinta horas.
   *
   * Una medición que pide más que el tope no es una medición: es una máquina
   * parada o una página patológica. Así que no se adopta, y SE DICE. */
  const topeSuelo = opts.asentarSueloTopeMs != null ? opts.asentarSueloTopeMs : 5000;
  /* Y LA DETECCIÓN DEL SALTO. Si un ciclo de «espera y lee» tarda un orden de
   * magnitud más de lo que debería, no es que el sitio vaya lento: es que este
   * proceso ha estado parado. Esa lectura no vale para calibrar ni para decir
   * que la página se asentó. */
  const saltoReloj = opts.saltoRelojMs != null ? opts.saltoRelojMs : 10000;
  const relojSaltado = [];
  const calibrar = opts.calibrarAsentado !== false && reposoBase > 0;
  const calibrarCada = opts.calibrarCada != null ? opts.calibrarCada : 10;
  const calibraciones = [];
  // Huellas de plantilla ya observadas largo: la primera página de cada una paga
  // el techo, y las demás de esa plantilla van con el suelo ya medido.
  const huellasVistas = new Set();
  let leidas = 0;

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
    /* QUÉ se saltó, no solo cuántas. La regla de rutas destructivas es —y debe
       seguir siendo— conservadora: visitar un GET que borra algo hace daño de
       verdad, mientras que saltarse una página solo encoge la muestra. Pero
       medido sobre rutas corrientes, se salta también `/consejos/como-eliminar-
       manchas` o `/blog/borrar-el-pasado`, y antes eso solo se veía como un
       número en un contador que nadie lee. Lo mismo con robots.txt, que puede
       esconder una sección entera del sitio. Ahora se nombran, con tope para no
       inundar el informe. */
    const detalle = { robots: [], destructiva: [] };
    const TOPE_DETALLE = 25;
    const anotar = function (tipo, url) {
      saltadas[tipo]++;
      if (detalle[tipo] && detalle[tipo].length < TOPE_DETALLE && detalle[tipo].indexOf(url) === -1) detalle[tipo].push(url);
    };

    while (cola.length && candidatas.length < max) {
      const actual = cola.shift();
      let u;
      try { u = new URL(actual.url); } catch (e) { continue; }
      u.hash = "";
      const clave = u.host + u.pathname.replace(/\/+$/, "") + u.search;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      if (NO_VISITAR.test(u.pathname + u.search)) { anotar("destructiva", u.href); continue; }
      if (!robots.permite(u.pathname)) { anotar("robots", u.href); continue; }

      /* UN SEGUNDO INTENTO, porque perder una página del censo descuadra la
       * muestra entera.
       *
       * Medido en el sitio del autor, dos muestreos SEGUIDOS a dos minutos uno
       * del otro: el primero rastreó 123 páginas y el segundo 124. La diferencia
       * era un único error —«page.goto: Timeout 20000ms exceeded» en una página—
       * y de ahí se desmoronó todo lo demás: una plantilla distinta, una página
       * estructurada menos, otro recorte y, al final, otras dos páginas
       * aleatorias. La muestra va dentro del IRA, así que eso impide defender el
       * informe como reproducible.
       *
       * Un timeout en un sitio que pinta en el cliente es transitorio y cuesta
       * una página del censo, así que se reintenta UNA vez con más plazo. Si el
       * segundo también falla, el error se anota Y SE DICE EN LOS AVISOS: una
       * página que no cargó, callada, se lee como «el sitio tiene 123 páginas». */
      /* CUÁNTO TARDÓ ESTA PÁGINA.
       *
       * Esto sale de una pasada real en el sitio del autor: con el mismo suelo y
       * el mismo censo, una pasada tardó 1390 s y la siguiente 341 —cuatro veces
       * más— con CERO errores y una sola página reintentada. En el JSON eso era
       * invisible: no se guardaba un solo tiempo, así que «el sitio iba cuatro
       * veces más lento» no se podía ni preguntar, y es justo la condición en la
       * que la pasada siguiente pierde una página por tiempo de espera. Un sitio
       * lento y callado está a un timeout de mover la muestra. */
      const tPagina = Date.now();
      let datos = null, errorUlt = null, noEsHtml = false, intentosUsados = 0;
      /* OJO A LA CONDICIÓN: no puede llevar `errorUlt === null`. La escribí así
       * y el segundo intento no se ejecutaba NUNCA, porque la condición se
       * evalúa antes del cuerpo y el error del primer intento ya estaba puesto.
       * Un reintento que no reintenta es peor que no tenerlo: parece arreglado. */
      for (let intento = 1; intento <= 2 && datos === null && !noEsHtml; intento++) {
        intentosUsados = intento;
        errorUlt = null;
        try {
          /* EL SEGUNDO INTENTO SE HACE DESDE CERO, y las dos cosas de aquí son
           * arreglos de la primera versión de este reintento:
           *
           *  · se va antes a `about:blank`. Sin eso, la navegación del primer
           *    `goto` sigue PENDIENTE y el segundo se engancha a ella en vez de
           *    pedir de nuevo: medido en el Mac del autor, el servidor de prueba
           *    recibía UNA sola petición y el reintento no reintentaba. En el
           *    contenedor sí pedía dos veces, así que el defecto solo salía en
           *    una de las dos máquinas — y el test lo cazó;
           *  · y espera la mitad más. Esto YA ESTABA ESCRITO en el instalador
           *    como si estuviera hecho y no lo estaba: mi reemplazo no casó y no
           *    lo comprobé. Insistir con el mismo plazo es insistir en lo mismo. */
          if (intento > 1) {
            try { await page.goto("about:blank", { timeout: 5000 }); } catch (e0) {}
          }
          const plazo = Math.round((opts.timeout || 20000) * (intento === 1 ? 1 : 1.5));
          const resp = await page.goto(u.href, { waitUntil: opts.waitUntil || "load", timeout: plazo });
          if (resp && !resp.ok()) { errorUlt = "HTTP " + resp.status(); break; }
          const ct = resp ? (resp.headers()["content-type"] || "") : "";
          if (ct && ct.indexOf("html") === -1) { noEsHtml = true; break; }
          if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
          datos = await page.evaluate(new Function(EXTRAER));
          /* ── UNA SOLA CAPTURA NO BASTA EN UN SITIO QUE PINTA EN EL CLIENTE ──
           *
           * El rastreo iba con `waitUntil: "load"` y SIN espera añadida, mientras
           * la auditoría va con `load` + 400 ms. En un SPA con enrutado en cliente
           * —React, Vue, Svelte— a `load` la ruta puede no haberse pintado todavía,
           * así que lo que se leía era el armazón compartido o menos.
           *
           * Medido, y es el defecto más caro que ha dado este banco: en la pasada
           * `ja4` de jesusaccesible.com, `/contacto` salió con
           * `tieneFormulario: false` —tiene cuatro campos y un botón de envío— y la
           * cobertura de la muestra quedó con `formulario: false`. Eso va al
           * `muestra.json` y de ahí al IRA: la justificación de la muestra decía
           * «No se ha encontrado ninguna página de la categoría "Página con
           * formulario": compruébalo a mano» con la página del formulario DENTRO de
           * la muestra. Una afirmación falsa en el documento que sostiene la
           * auditoría, y encima mandando al auditor a buscar algo que ya tenía.
           *
           * Las huellas lo delataban: cuatro páginas con la MISMA huella —el
           * armazón— y una con `main|…|nav:0`, sin header ni footer. Dos momentos
           * de pintado distintos en la misma pasada no son marcado estable, son una
           * carrera.
           *
           * Así que se lee DOS VECES con un reposo entre medias y se comparan. Si
           * cambia algo, la primera lectura era prematura: vale la segunda y se
           * anota qué cambió, porque un sitio donde hay que reposar es un dato que
           * el informe tiene que dar. Si no cambia nada, el coste es una
           * evaluación más y no se anota nada. No es una espera a ciegas: es una
           * medición de si hacía falta esperar. */
          /* ── UNA SOLA RELECTURA TAMPOCO BASTA: HAY QUE ESPERAR A QUE CONVERJA ──
           *
           * Esto leía dos veces con 500 ms entre medias y se quedaba con la
           * segunda. Si la página sigue pintando a los 500 ms, la «segunda»
           * también es prematura, y entonces la huella de plantilla sale distinta
           * de una pasada a otra.
           *
           * Medido en el sitio del autor, CINCO muestreos seguidos con el censo
           * estable —124 páginas y 0 errores en las cinco—:
           *
           *     plantillas detectadas:  9 / 8 / 9 / 8 / 9
           *     muestra final:          cambió en 4 de las 5
           *
           * Y la huella guardada decía exactamente qué pasaba. `/blog/wcag-3-1-5`,
           * la misma página, en dos pasadas:
           *
           *     header>navigation>nav>main>contentinfo>nav>nav>nav
           *     header>navigation>nav>main>main>aside>navigation>contentinfo>nav>nav>nav
           *
           * Un segundo `main`, un `aside` y un `navigation` que aparecen tarde.
           * Eso cambiaba el recuento de plantillas y con él la muestra que va al
           * IRA. (De paso: ese segundo `<main>` es la barrera 1.3.1 que el agente
           * ya acusa en esa página, así que la lectura completa es la correcta.)
           *
           * Ahora se relee hasta que DOS LECTURAS SEGUIDAS COINCIDAN, con techo.
           * Una página estable cuesta lo mismo que antes —una espera y una
           * lectura—; solo las que siguen pintando cuestan más. Es la misma idea
           * que `esperarAsentado` usa en la auditoría desde v0.73.0, donde ya se
           * había aprendido que medir una página inquieta no es medir.
           *
           * Y SI NO CONVERGE DENTRO DEL TECHO, SE DICE. Quedarse con la última
           * lectura y callar es justo lo que hacía que dos pasadas no coincidieran
           * sin que nadie se enterara. */
          const reposo = reposoBase;
          /* EL TECHO SOLO SE LEVANTA SI LA CALIBRACIÓN SUBIÓ EL SUELO.
           *
           * La primera versión de esto hacía `max(techo, suelo+...)` siempre, y
           * así un techo puesto A MANO por debajo del suelo quedaba ignorado en
           * silencio: la guardia que comprueba que una página sin estabilizar SE
           * DICE pasó a verde en falso, porque con el techo levantado la página
           * sí se estabilizaba. Un parámetro que el agente se salta sin avisar es
           * el mismo defecto que esta entrega persigue, cometido en el arreglo.
           *
           * Levantarlo cuando la calibración sube el suelo sí hace falta: con un
           * suelo mayor que el techo, ninguna página podría cumplirlo y TODAS
           * saldrían «sin asentar», que es un aviso que al salir siempre deja de
           * leerse. */
          const techoAsentar = sueloEfectivo > sueloBase
            ? Math.max(techoBase, sueloEfectivo + reposo + margenAsentar)
            : techoBase;
          // Calibra en la primera página leída y cada `calibrarCada` desde ahí.
          let esCalibracion = calibrar && (leidas % calibrarCada === 0);
          if (reposo > 0) {
            /* Y UN SUELO, porque dos lecturas iguales NO son una página acabada.
             *
             * La primera versión de esta convergencia aceptaba la estabilidad en
             * cuanto dos lecturas seguidas coincidían, y eso se le escapa a una
             * página que está quieta a los 500 ms y cambia a los 900. Medido con
             * un montaje así: la huella salía incompleta y la convergencia la daba
             * por buena. Es el mismo error que el testigo de 2.1.4 —una ventana
             * quieta no es una página asentada— y lo cometí otra vez.
             *
             * No hay espera finita que garantice que una página ha terminado. Lo
             * que sí se puede hacer es no creerse el primer silencio y DECIR
             * cuándo no se llegó a estabilizar. */
            /* EN UNA PÁGINA DE CALIBRACIÓN NO HAY SALIDA ANTICIPADA: se observa
             * hasta el techo y se apunta CUÁNDO fue la última mutación. Eso es
             * lo que da el suelo, en vez de la constante que yo elegí en otra
             * máquina. En las demás páginas se sale en cuanto dos lecturas
             * seguidas coinciden y el suelo está cumplido. */
            const sueloAsentar = sueloEfectivo;
            const primera = datos;
            let previa = datos, ultima = null, estable = false, lecturas = 0;
            let ultimoCambio = 0;
            let salto = 0;
            const t0 = Date.now();
            while (Date.now() - t0 < techoAsentar) {
              const tCiclo = Date.now();
              await page.waitForTimeout(reposo);
              try { ultima = await page.evaluate(new Function(EXTRAER)); } catch (e2) { ultima = null; }
              lecturas++;
              // ¿Ha estado este proceso parado entre dos lecturas? Entonces el
              // reloj de pared no mide el pintado de la página: mide el parón.
              const ciclo = Date.now() - tCiclo;
              if (ciclo > reposo + saltoReloj) { salto = ciclo; break; }
              if (!ultima) break;
              const igual = !diferenciaDeLectura(previa, ultima).length;
              if (!igual) ultimoCambio = Date.now() - t0;
              previa = ultima;
              // Dos iguales Y el suelo cumplido: antes del suelo no se cree el silencio.
              if (!esCalibracion && igual && Date.now() - t0 >= sueloAsentar) { estable = true; break; }
            }
            /* ── Y LA PRIMERA PÁGINA DE CADA PLANTILLA TAMBIÉN SE OBSERVA LARGO
             *
             * Calibrar una de cada diez deja un hueco, y se vio en el banco: en
             * un montaje donde la portada está quieta y la página interior se
             * hidrata a los 1400 ms, la portada calibró 1000 ms y la interior se
             * leyó temprana sin que nada lo dijera. Mirar una página de cada diez
             * no cubre una plantilla que solo tiene una página.
             *
             * Las plantillas son justo lo que agrupa la muestra, así que la
             * primera página de cada huella nueva se observa hasta el techo. Y
             * como se observa estando en ella, lo que aparezca tarde no solo sube
             * el suelo: corrige SU PROPIA lectura, que es lo que no se podía
             * hacer con una calibración a posteriori. */
            const huellaVista = (ultima || primera || {}).plantilla || "";
            const esHuellaNueva = calibrar && huellaVista && !huellasVistas.has(huellaVista);
            if (esHuellaNueva && !esCalibracion && ultima) {
              esCalibracion = true;
              while (Date.now() - t0 < techoAsentar) {
                await page.waitForTimeout(reposo);
                let otra = null;
                try { otra = await page.evaluate(new Function(EXTRAER)); } catch (e3) { otra = null; }
                lecturas++;
                if (!otra) break;
                if (diferenciaDeLectura(previa, otra).length) ultimoCambio = Date.now() - t0;
                previa = otra;
                ultima = otra;
              }
            }
            const transcurrido = Date.now() - t0;
            if (huellaVista) huellasVistas.add(huellaVista);
            if (ultima && ultima.plantilla) huellasVistas.add(ultima.plantilla);
            if (salto) {
              /* Lectura inservible: ni se calibra con ella ni se declara
               * asentada. Y se nombra la página, porque un rastreo hecho con el
               * ordenador suspendiéndose no es una medición del sitio. */
              relojSaltado.push({ ruta: u.pathname + (u.search || ""), ms: salto });
              esCalibracion = false;
              estable = false;
            }
            if (esCalibracion && ultima) {
              /* «Asentada» en una calibración significa que al final hubo un
               * tramo de silencio de al menos el margen. Si la última mutación
               * fue pegada al techo, no se sabe si había más: eso es `sinAsentar`
               * y lo dice el aviso. */
              estable = (transcurrido - ultimoCambio) >= margenAsentar;
              /* REDONDEADO A 250 ms, y no es cosmética: medido dos veces el
               * mismo sitio, la calibración dio 2018 y 2020 ms. Un suelo que
               * cambia de una pasada a otra hace que dos pasadas no sean
               * comparables —y el comparador, con razón, lo avisaba— cuando lo
               * que cambió fue el reloj y no el sitio. */
              const bruto = ultimoCambio ? Math.ceil((ultimoCambio + margenAsentar) / 250) * 250 : 0;
              // El tope: lo que pida más que esto no se adopta, y queda anotado
              // con su valor bruto para que el aviso lo pueda decir.
              const pedido = Math.min(bruto, topeSuelo);
              calibraciones.push({ ruta: u.pathname + (u.search || ""), ultimoCambio: ultimoCambio,
                                   observado: transcurrido, sueloAntes: sueloEfectivo,
                                   pedido: bruto, topado: bruto > topeSuelo || undefined,
                                   sueloDespues: Math.max(sueloEfectivo, pedido) });
              if (pedido > sueloEfectivo) sueloEfectivo = pedido;
            }
            if (ultima) {
              const cambio = diferenciaDeLectura(primera, ultima);
              datos = ultima;
              if (cambio.length) datos.asentado = cambio;
              if (!estable) datos.sinAsentar = { lecturas: lecturas, ms: transcurrido };
              // Con qué suelo se leyó ESTA página. Si la calibración lo sube más
              // tarde, esto es lo que permite decir cuáles se leyeron con menos.
              datos.sueloUsado = sueloAsentar;
              datos.calibrada = esCalibracion || undefined;
            }
          }
        } catch (e) {
          errorUlt = (e && e.message) || String(e);
          // La pausa también después de un error. Sin esto, un sitio que responde
          // 500 o agota el tiempo se recorría a toda velocidad —justo cuando menos
          // conviene insistir— y el rastreo dejaba de parecer una auditoría.
          if (pausa) await page.waitForTimeout(pausa);
        }
      }
      if (noEsHtml) { saltadas.noHtml++; continue; }
      if (datos === null) {
        errores.push({ url: u.href, error: errorUlt || "sin datos", intentos: intentosUsados });
        continue;
      }
      if (intentosUsados > 1) reintentadas.push(u.pathname + (u.search || ""));

      const ruta = u.pathname + (u.search || "");
      /* La portada no siempre vive en «/». Muchísimos sitios arrancan en /es/ o
         /es/index.html, y con la comprobación de antes NINGUNA página quedaba
         marcada como inicio: la categoría «Página de inicio» —esencial en
         WCAG-EM— se declaraba ausente en un sitio que obviamente la tiene, y la
         muestra salía sin portada. La URL de arranque de la auditoría ES la
         portada a estos efectos. */
      const esArranque = (u.href === raiz.href) ||
        (u.host === raiz.host && u.pathname.replace(/\/+$/, "") === raiz.pathname.replace(/\/+$/, "") && !u.search);
      datos["señales"].esInicio = (u.pathname === "/" || u.pathname === "" || esArranque);
      candidatas.push({
        url: u.href, ruta: ruta, titulo: datos.titulo, lang: datos.lang,
        plantilla: datos.plantilla, "señales": datos["señales"], profundidad: actual.prof,
        // Qué cambió entre la primera lectura y la segunda. Vacío = nada: lo que
        // se leyó a `load` ya era estable.
        asentado: datos.asentado || null,
        // El suelo con que se leyó, y si fue una de las páginas de calibración.
        sueloUsado: datos.sueloUsado != null ? datos.sueloUsado : null,
        calibrada: !!datos.calibrada,
        // Y si NO llegó a estabilizarse, también viaja: el aviso lo nombra y el
        // JSON lo guarda, porque es la explicación de por qué su plantilla puede
        // salir distinta en la pasada siguiente.
        sinAsentar: datos.sinAsentar || null,
        // Lo que tardó, de `goto` a lectura asentada. Es el dato que faltaba
        // para distinguir «el sitio va lento hoy» de «el sitio va igual».
        ms: Date.now() - tPagina
      });
      // Se cuenta DESPUÉS de leer con éxito: así la primera página que de verdad
      // se leyó es la que calibra, y no una que falló.
      leidas++;
      if (opts.onPagina) opts.onPagina(candidatas[candidatas.length - 1]);

      if (actual.prof < maxProf) {
        (datos.enlaces || []).forEach(function (e) {
          let d;
          try { d = new URL(e.href, u.href); } catch (err) { return; }
          if (d.protocol !== "http:" && d.protocol !== "https:") return;
          if (!mismaRaiz(d, raiz)) { saltadas.externa++; return; }
          if (NO_HTML.test(d.pathname)) { saltadas.noHtml++; return; }
          if (NO_VISITAR.test(d.pathname + d.search) || noVisitarPorTexto(e.texto)) { anotar("destructiva", d.href); return; }
          d.hash = "";
          cola.push({ url: d.href, prof: actual.prof + 1 });
        });
      }
      if (pausa) await page.waitForTimeout(pausa);
    }

    const nombrar = function (urls, total) {
      return urls.slice(0, 8).map(function (x) { return x; }).join(", ") + (total > urls.length ? " … (y " + (total - urls.length) + " más)" : (urls.length > 8 ? ", …" : ""));
    };
    if (saltadas.destructiva) {
      avisos.push("No se han visitado " + saltadas.destructiva + " URL por parecer acciones destructivas (cerrar sesión, borrar, anular): " +
        nombrar(detalle.destructiva, saltadas.destructiva) + ". La regla es deliberadamente prudente, así que puede haber ahí páginas de contenido: " +
        "si alguna lo es, añádela a la muestra a mano.");
    }
    if (saltadas.robots) {
      avisos.push("robots.txt ha dejado fuera " + saltadas.robots + " URL: " + nombrar(detalle.robots, saltadas.robots) +
        ". Esa parte del sitio NO está auditada; si entra en el alcance, hay que rastrearla con robots: \"ignorar\" y decirlo en el informe.");
    }
    if (candidatas.length >= max) avisos.push("Se alcanzó el tope de " + max + " páginas rastreadas: puede haber más sitio sin explorar.");
    /* UNA PÁGINA QUE NO CARGÓ CAMBIA LA MUESTRA, Y ESO HAY QUE DECIRLO ARRIBA.
     *
     * Los errores se guardaban en el JSON y NO salían en los avisos, así que la
     * justificación de la muestra seguía diciendo «semilla reproducible» con una
     * página menos en el censo. Medido en el sitio del autor: dos muestreos
     * seguidos, 123 candidatas y 124, por un único timeout, y la muestra final
     * cambió dos páginas. La muestra va dentro del IRA; afirmar reproducibilidad
     * sobre un censo que perdió una página es afirmar lo que no se sabe.
     *
     * Es la regla de oro del proyecto aplicada al rastreo: el silencio sobre una
     * página que no cargó se lee como «el sitio no tiene esa página». */
    /* LAS QUE NO LLEGARON A ESTABILIZARSE, dichas por su nombre.
     *
     * Una página que sigue cambiando cuando se agota el techo se ha leído en un
     * instante cualquiera de su pintado, y su huella de plantilla puede salir
     * distinta en la pasada siguiente. Eso mueve el recuento de plantillas y con
     * él la muestra. Callarlo es dejar que el informe diga «reproducible» sobre
     * una lectura que no lo es. */
    const inquietas = candidatas.filter(function (c) { return c.sinAsentar; });
    if (inquietas.length) {
      avisos.push("NO SE ESTABILIZARON " + inquietas.length + " de " + candidatas.length +
        " página(s) dentro del techo de espera: " + nombrar(inquietas.map(function (c) { return c.ruta; }), inquietas.length) +
        ". Se ha usado la última lectura, pero una página que sigue pintando se lee distinta en cada pasada, " +
        "así que su plantilla —y con ella la muestra— puede cambiar de una auditoría a la siguiente. " +
        "Si el recuento de plantillas baila entre pasadas, sube el techo con `asentarTechoMs` y dilo en el informe.");
    }
    if (errores.length) {
      avisos.push("NO SE PUDIERON LEER " + errores.length + " página(s), así que NO están en el censo ni pueden entrar en la muestra: " +
        errores.slice(0, 5).map(function (e) { return (e.url || "") + " (" + String(e.error || "").split("\n")[0].slice(0, 70) + ")"; }).join(" · ") +
        (errores.length > 5 ? " y " + (errores.length - 5) + " más" : "") +
        ". Cada una se intentó dos veces. IMPORTANTE para el informe: con una página fuera del censo, la muestra NO es la que " +
        "saldría con el sitio entero, así que la reproducibilidad por semilla vale para ESTE censo y no para otro. " +
        "Vuelve a rastrear antes de dar la muestra por buena, y si el error persiste, dilo en el informe.");
    }
    if (reintentadas.length) {
      avisos.push(reintentadas.length + " página(s) necesitaron un SEGUNDO intento para cargar (" +
        nombrar(reintentadas, reintentadas.length) + "). Cargaron, así que están en el censo, pero un sitio que necesita " +
        "reintentos es un sitio lento: es lo que hace que dos pasadas puedan no ver lo mismo.");
    }
    /* Un sitio donde hubo que reposar para leer bien ES UN DATO, y va arriba.
     * Si alguna página cambió entre la primera lectura y la segunda, las señales
     * de ESTE rastreo eran propensas a la carrera, y cualquier «no se ha
     * encontrado ninguna página de la categoría X» que salga después hay que
     * leerlo sabiéndolo. Se dice qué páginas y qué cambió en cada una. */
    const reposadas = candidatas.filter(function (c) { return c.asentado && c.asentado.length; });
    if (reposadas.length) {
      avisos.push("ESTE SITIO PINTA EN EL CLIENTE: " + reposadas.length + " de " + candidatas.length +
        " página(s) cambiaron entre la primera lectura y la segunda, así que lo que se ve a «load» no es la página. " +
        "Vale la segunda lectura. Lo que cambió: " +
        reposadas.slice(0, 5).map(function (c) { return c.ruta + " (" + c.asentado.join(", ") + ")"; }).join(" · ") +
        (reposadas.length > 5 ? " · …" : "") +
        ". Importa porque las categorías de la muestra salen de estas señales: un «no se ha encontrado ninguna página de la categoría X» en un sitio así puede ser un hueco de LECTURA del agente y no del sitio." +
        /* Y SI LO QUE LLEGÓ TARDE FUERON LOS ENLACES, EL CENSO MISMO ESTÁ EN
         * DUDA, no solo las señales. Esto sale de una medición en el sitio del
         * autor que desmintió mi propia explicación: cinco pasadas seguidas, y
         * la primera dio 117 candidatas contra 124 de las otras cuatro CON CERO
         * ERRORES de carga. El mensaje de v0.80.0 atribuía el censo corto a los
         * timeouts, y con esto queda claro que no hace falta ningún error: basta
         * leer la portada antes de que pinte sus enlaces para que falten siete
         * páginas. Un censo corto sin un solo error es precisamente el silencio
         * que este proyecto persigue: el informe diría «reproducible» sobre un
         * sitio al que le faltan páginas que nadie declaró. */
        ((function () {
          const conEnlaces = reposadas.filter(function (c) {
            return c.asentado.indexOf("enlaces") !== -1;
          });
          if (!conEnlaces.length) return "";
          /* LA DUDA SOBRE EL CENSO SOLO SE SIEMBRA SI HAY MOTIVO, y esto es un
           * arreglo de la primera versión de este aviso. En la auditoría `ja9`
           * decía «este censo puede no ser el del sitio entero» sobre un censo
           * de 124 páginas que se había repetido idéntico cinco veces: cierto en
           * general, falso aquí, y en un informe de cliente eso se lee como que
           * el agente no sabe si vio el sitio. Que los enlaces lleguen tarde es
           * un DATO —se esperó y se leyeron—; lo que pone el censo en duda es
           * que alguna página no llegara a asentarse, que el suelo subiera a
           * mitad del rastreo, o que una página no cargara. */
          const dudoso = candidatas.some(function (c) { return c.sinAsentar; }) ||
            candidatas.some(function (c) { return c.sueloUsado != null && c.sueloUsado < sueloEfectivo && !c.calibrada; }) ||
            errores.length > 0;
          return " LOS ENLACES TAMBIÉN LLEGAN TARDE, en " + conEnlaces.length + " página(s) (" +
            nombrar(conEnlaces.map(function (c) { return c.ruta; }), conEnlaces.length) +
            "), y el censo se construye con los enlaces leídos: una página leída antes de pintar los suyos deja " +
            "fuera del censo las páginas a las que apunta, sin un solo error que lo delate —medido, una pasada " +
            "dio 117 candidatas y las siguientes 124 con 0 errores—. " +
            (dudoso
              ? "Y EN ESTE RASTREO HAY MOTIVO PARA DUDAR (hay páginas sin asentar, leídas con menos margen o que " +
                "no cargaron, según los avisos de arriba), así que este censo puede no ser el del sitio entero y " +
                "la reproducibilidad por semilla vale para ESTE censo."
              : "Aquí se esperó a que se asentaran y ninguna página quedó sin asentar, así que el censo es el de " +
                "las páginas ya hidratadas. Compruébalo igual contra el número de páginas que esperas del sitio.");
        })()));
    }
    /* LO QUE LA CALIBRACIÓN MIDIÓ, DICHO CON EL NÚMERO.
     *
     * Un suelo que el agente se pone solo es un dato del informe: explica por qué
     * esta pasada tardó lo que tardó y con qué margen se leyeron las páginas. Y
     * si el suelo SUBIÓ a mitad del rastreo, las páginas anteriores se leyeron
     * con menos: eso hay que decirlo y no dejar que el informe presuma de una
     * lectura que no tuvieron. */
    /* EL RITMO DEL SITIO, DICHO CON NÚMEROS.
     *
     * Medido en el sitio del autor: dos pasadas seguidas con el mismo suelo y el
     * mismo censo, 1390 s y 341 s. Sin tiempos en el JSON, las dos pasadas se
     * veían idénticas —124 candidatas, 0 errores— y la de 1390 s llevaba además
     * una página reintentada. Que un rastreo tarde cuatro veces más es un dato
     * del informe: explica por qué una pasada puede perder una página que la
     * anterior leyó, y si se degrada un poco más eso es exactamente lo que pasa. */
    const tiempos = candidatas.map(function (c) { return c.ms || 0; }).filter(function (x) { return x > 0; })
      .sort(function (x, y) { return x - y; });
    let ritmo = null;
    if (tiempos.length >= 3) {
      const mediana = tiempos[Math.floor(tiempos.length / 2)];
      const max = tiempos[tiempos.length - 1];
      const lentas = candidatas.filter(function (c) { return c.ms; })
        .sort(function (a, b) { return b.ms - a.ms; }).slice(0, 5)
        .map(function (c) { return { ruta: c.ruta, ms: c.ms }; });
      ritmo = { mediana: mediana, min: tiempos[0], max: max, lentas: lentas,
                totalMs: tiempos.reduce(function (x, y) { return x + y; }, 0) };
      /* El umbral es una RELACIÓN, no un tiempo absoluto: un sitio lento de por
       * sí es asunto del sitio, pero una página que tarda un orden de magnitud
       * más que la mediana de SU PROPIO sitio es un tropiezo, y es la que se
       * cae del censo en la pasada siguiente. */
      if (max >= Math.max(6 * mediana, 5000)) {
        avisos.push("EL SITIO NO RESPONDIÓ A RITMO CONSTANTE: la página más lenta tardó " +
          Math.round(max / 1000) + " s contra una mediana de " + (mediana / 1000).toFixed(1) +
          " s (" + ritmo.lentas.slice(0, 3).map(function (l) { return l.ruta + ": " + Math.round(l.ms / 1000) + " s"; }).join(" · ") +
          "). Importa para la muestra: una página que hoy tarda mucho es la que mañana agota el plazo y " +
          "se cae del censo, y con ella cambia la muestra. Si se repite, rastrea con el sitio menos cargado " +
          "o sube `timeout`, y dilo en el informe.");
      }
    }
    const medidas = calibraciones.filter(function (c) { return c.ultimoCambio > 0; });
    if (calibraciones.length && medidas.length) {
      const peor = medidas.reduce(function (m, c) { return Math.max(m, c.ultimoCambio); }, 0);
      /* El titular dice lo que se midió, no una alarma. La primera versión
       * gritaba «ESTE SITIO SE ASIENTA TARDE» con 512 ms medidos, que no es
       * tarde para nada, y un aviso que exagera se acaba leyendo como ruido. */
      const topados = calibraciones.filter(function (c) { return c.topado; });
      avisos.push("CUÁNDO SE ASIENTA ESTE SITIO, medido en " + calibraciones.length +
        " página(s) de calibración: la última mutación tras «load» llegó hasta " + peor + " ms (" +
        medidas.slice(0, 4).map(function (c) { return c.ruta + ": " + c.ultimoCambio + " ms"; }).join(" · ") +
        "). El suelo de espera se ha puesto en " + sueloEfectivo + " ms (de partida, " + sueloBase +
        "), y con eso se ha leído el sitio. Va en el informe porque con un suelo por debajo de lo medido la " +
        "página se lee antes de hidratarse —otra huella de plantilla y, si lo que falta son enlaces, otro censo—." +
        (topados.length
          ? " OJO: en " + topados.length + " página(s) la observación pidió hasta " +
            topados.reduce(function (m, c) { return Math.max(m, c.pedido || 0); }, 0) +
            " ms, por encima del tope de " + topeSuelo + " ms, y NO se ha adoptado. Un suelo así no es una " +
            "medición del sitio: suele ser el ordenador suspendido o una página que no para de moverse. " +
            "Mira el aviso del reloj y vuelve a rastrear antes de dar la muestra por buena."
          : ""));
    }
    /* UNA PÁGINA CALIBRADA NO SE LEYÓ «CON MENOS MARGEN»: se observó hasta el
     * techo, que es más de lo que pide cualquier suelo. Contarla era un falso
     * positivo, y en `ja9` producía el aviso entero sobre la portada, que es
     * justo la que se había mirado largo. */
    const conSueloMenor = candidatas.filter(function (c) {
      return c.sueloUsado != null && c.sueloUsado < sueloEfectivo && !c.calibrada;
    });
    if (conSueloMenor.length) {
      avisos.push("EL SUELO DE ESPERA SUBIÓ A MITAD DEL RASTREO (de " + sueloBase + " a " + sueloEfectivo +
        " ms), así que " + conSueloMenor.length + " de " + candidatas.length +
        " página(s) se leyeron con menos margen del que este sitio pide: " +
        // `nombrar(urls, total)`: el segundo argumento es el TOTAL, no un tope.
        // Pasarle 6 hacía que el aviso dijera «1 de 124 página(s)» y acto
        // seguido «/ … (y 5 más)». Dos números que se contradicen en el mismo
        // aviso destruyen la confianza en todos los demás.
        nombrar(conSueloMenor.map(function (c) { return c.ruta; }), conSueloMenor.length) +
        ". Su huella puede ser la de antes de hidratarse. Para dar la muestra por buena, vuelve a rastrear " +
        "con `asentarSueloMs: " + sueloEfectivo + "` desde el principio.");
    }
    /* EL RELOJ, que es lo que convirtió una pasada en veinticinco horas.
     *
     * Medido: el portátil del autor se suspendió a mitad de un rastreo, el hueco
     * del sueño entró en la medición del asentamiento, la calibración «midió»
     * 925 597 ms y puso el suelo en quince minutos por página. La pasada acabó
     * en 90 437 s, y en el JSON no había nada que dijera que la máquina había
     * estado parada: solo una huella distinta y una muestra movida. */
    if (relojSaltado.length) {
      const peorSalto = relojSaltado.reduce(function (m, x) { return Math.max(m, x.ms); }, 0);
      avisos.push("ESTE PROCESO ESTUVO PARADO DURANTE EL RASTREO: entre dos lecturas de la misma página " +
        "pasaron hasta " + Math.round(peorSalto / 1000) + " s cuando debían pasar menos de un segundo, en " +
        relojSaltado.length + " página(s) (" + nombrar(relojSaltado.map(function (x) { return x.ruta; }), relojSaltado.length) +
        "). Eso no mide el sitio: mide el parón —el ordenador suspendido, o esta máquina sin CPU—. Esas " +
        "páginas NO se han usado para calibrar y no se declaran asentadas, pero su lectura puede ser " +
        "cualquiera: NO des esta muestra por buena, vuelve a rastrear con el ordenador despierto.");
    }
    const calibSinAsentar = candidatas.filter(function (c) { return c.calibrada && c.sinAsentar; });
    if (calibSinAsentar.length) {
      avisos.push("UNA PÁGINA DE CALIBRACIÓN SEGUÍA CAMBIANDO AL LLEGAR AL TECHO (" +
        nombrar(calibSinAsentar.map(function (c) { return c.ruta; }), 4) +
        "), así que el suelo medido es un SUELO MÍNIMO y no la medida: puede que el sitio se asiente " +
        "más tarde de lo que se ha podido observar. Sube `asentarTechoMs` y vuelve a medir antes de " +
        "defender la muestra como reproducible.");
    }
    return {
      reposadas: reposadas.map(function (c) { return { ruta: c.ruta, cambio: c.asentado }; }),
      /* La calibración, en el JSON: el aviso lo lee una persona y esto lo lee el
       * cotejo entre pasadas. Dos pasadas con suelos distintos no son
       * comparables, y sin este dato no hay forma de saberlo. */
      // Cuánto tardó cada página y cuáles fueron las peores: dos pasadas que se
      // ven iguales en el censo pueden no haberse corrido en el mismo sitio.
      ritmo: ritmo,
      calibracion: { suelo: sueloEfectivo, sueloBase: sueloBase, techo: techoBase,
                     margen: margenAsentar, cada: calibrarCada, tope: topeSuelo,
                     medidas: calibraciones, relojSaltado: relojSaltado },
      inicio: raiz.href,
      candidatas: candidatas,
      saltadas: saltadas,
      saltadasDetalle: detalle,
      avisos: avisos,
      errores: errores, reintentadas: reintentadas,
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
    rastreo: { candidatas: r.candidatas.length, saltadas: r.saltadas, saltadasDetalle: r.saltadasDetalle,
               // Dato, no solo prosa: qué páginas hubo que reposar y qué cambió.
               reposadas: r.reposadas || [],
               // `reintentadas` también: el JSON del rastreo es lo que sostiene
               // la muestra en el IRA, y «esta página necesitó dos intentos» es
               // parte de por qué dos pasadas pueden no coincidir.
               reintentadas: r.reintentadas || [],
               /* LA HUELLA DE PLANTILLA DE CADA PÁGINA, no solo de las
                * muestreadas. Dos pasadas del mismo sitio con las MISMAS 124
                * candidatas dieron 9 plantillas y 8, y eso cambió la muestra.
                * Sin las huellas guardadas no hay forma de saber qué página se
                * leyó distinto, así que la pregunta no se podía ni plantear.
                * Y sirven para el IRA: la justificación dice «N páginas
                * comparten esta plantilla» y aquí está el porqué. */
               huellas: (r.candidatas || []).map(function (c) {
                 return { ruta: c.ruta, huella: String(c.plantilla || "") };
               }),
               /* Y LAS QUE NO SE ESTABILIZARON, como dato y no solo como prosa.
                * El aviso las nombra, pero el aviso lo lee una persona y el
                * JSON lo lee el cotejo entre pasadas: si la huella de una
                * página baila, lo primero que hay que poder preguntar es si esa
                * página llegó a asentarse. Dejarlo solo en el texto es la misma
                * media verdad que tenía el error de carga antes de v0.81.0. */
               // La calibración del asentamiento: con qué suelo se leyó este
               // sitio y qué se midió para elegirlo. Dos pasadas con suelos
               // distintos no son comparables, y esto es lo que lo dice.
               calibracion: r.calibracion || null,
               // El ritmo, también en el JSON del muestreo: una pasada cuatro
               // veces más lenta que otra no es la misma medición.
               ritmo: r.ritmo || null,
               inquietas: (r.candidatas || []).filter(function (c) { return c.sinAsentar; })
                 .map(function (c) {
                   return { ruta: c.ruta, lecturas: c.sinAsentar.lecturas, ms: c.sinAsentar.ms };
                 }),
               avisos: r.avisos, errores: r.errores },
    procedencia: r.procedencia,
    justificacion: justificarMuestra(sel),
    avisos: (sel.avisos || []).concat(r.avisos)
  });
}
