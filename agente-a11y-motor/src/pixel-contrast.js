/**
 * Contraste del texto sobre degradados e imágenes, midiendo píxeles.
 *
 * Es el último hueco de 1.4.3. Cuando el fondo es un degradado o una imagen no
 * existe un «color de fondo» que consultar, así que el agente lo marcaba
 * `revisar` — honrado, pero es de los «revisar» que más trabajo manual generan en
 * una auditoría real, porque los hero con foto están en todas partes.
 *
 * ── Cómo se aíslan las letras ──────────────────────────────────────────────
 * El primer intento fue capturar con el texto y sin él, y quedarse con los
 * píxeles que cambian. Tiene un fallo de fondo: el caso que MÁS importa —texto
 * blanco sobre un fondo casi blanco, que es justo el que no se lee— es aquel en
 * el que la diferencia entre las dos capturas es mínima. El método se quedaba
 * ciego precisamente donde hacía falta.
 *
 * Así que el texto se repinta con dos colores conocidos y opuestos:
 *
 *   1. Captura con el texto en magenta puro.
 *   2. Captura con el texto en verde puro.
 *   3. Captura con el texto transparente.
 *
 * La diferencia entre (1) y (2) no depende del color real del texto ni del fondo:
 * es siempre máxima donde hay letra. Del canal rojo sale la COBERTURA exacta de
 * cada píxel (α = (magenta − verde) / 255), y con ella se descartan los bordes
 * antialiasados quedándose solo con α ≈ 1. La captura (3) da el fondo real bajo
 * esas mismas posiciones, y el color del texto lo da `getComputedStyle`.
 *
 * Dos cuidados que evitan mentir con números:
 *
 *   - **Los bordes antialiasados no cuentan.** Un píxel de borde es una mezcla
 *     parcial de texto y fondo; medirlo da contrastes falsos, casi siempre peores
 *     que los reales. Con la cobertura exacta se excluyen sin margen de duda.
 *   - **Si no se puede aislar el texto, se dice.** Con `background-clip: text` o
 *     con texto pintado en un canvas, repintar el color no cambia nada: la máscara
 *     sale vacía y el veredicto sigue siendo `revisar`, no un aprobado por falta
 *     de datos.
 */
/* NODE-ONLY:START */
import { decodePNG } from "./png.js";
/* NODE-ONLY:END */
import { contrastRatio, apcaContrast, apcaMin, parseColor } from "./measure.browser.js";

/** Los dos colores de sonda. Opuestos en los tres canales y saturados. */
export const SONDA_A = { r: 255, g: 0, b: 255 };   // magenta
export const SONDA_B = { r: 0, g: 255, b: 0 };     // verde
/** Cobertura mínima para considerar un píxel «núcleo de glifo» y no borde. */
export const MIN_COBERTURA = 0.9;
/** Por debajo de esto no hay muestra suficiente para dictaminar. */
export const MIN_PIXELES = 24;

/**
 * Cobertura de texto por píxel, a partir de las dos capturas de sonda.
 * Devuelve un Float32Array con α ∈ [0,1].
 */
export function coberturaGlifos(sondaA, sondaB) {
  const A = sondaA.data, B = sondaB.data;
  const n = A.length / 4;
  const alfa = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // Canal rojo: magenta=255, verde=0 → la diferencia ES la cobertura.
    // Se corrobora con el verde (magenta=0, verde=255) para no fiarlo todo a uno.
    const aR = (A[p] - B[p]) / 255;
    const aG = (B[p + 1] - A[p + 1]) / 255;
    const v = (aR + aG) / 2;
    alfa[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
  }
  return alfa;
}

/**
 * Compara las tres capturas y dictamina.
 *
 * @param {{ sondaA, sondaB, fondo }} capturas  las tres imágenes ya decodificadas
 * @param {{r,g,b,a?}} fg                       color real del texto (getComputedStyle)
 * @param {{ grande?:boolean, size?:number, weight?:number, minCobertura?:number, minPixeles?:number }} [opts]
 */
export function analizarPixeles(capturas, fg, opts) {
  opts = opts || {};
  const minCob = opts.minCobertura != null ? opts.minCobertura : MIN_COBERTURA;
  const minPx = opts.minPixeles != null ? opts.minPixeles : MIN_PIXELES;
  const c = capturas || {};
  if (!c.sondaA || !c.sondaB || !c.fondo) return { determinado: false, motivo: "faltan capturas" };

  const dims = [c.sondaA, c.sondaB, c.fondo].map(function (i) { return i.width + "x" + i.height; });
  if (dims[0] !== dims[1] || dims[0] !== dims[2]) {
    return { determinado: false, motivo: "las capturas no coinciden en tamaño (" + dims.join(", ") + "): el layout cambió al repintar el texto" };
  }

  const alfa = coberturaGlifos(c.sondaA, c.sondaB);
  const F = c.fondo.data;
  const cuentas = new Map();
  let nucleo = 0, conAlgo = 0;
  for (let i = 0; i < alfa.length; i++) {
    if (alfa[i] > 0.05) conAlgo++;
    if (alfa[i] < minCob) continue;
    nucleo++;
    const p = i * 4;
    const clave = (F[p] << 16) | (F[p + 1] << 8) | F[p + 2];
    cuentas.set(clave, (cuentas.get(clave) || 0) + 1);
  }

  if (!conAlgo) {
    return { determinado: false, motivo: "repintar el texto no cambió ni un píxel: puede estar pintado con background-clip:text, en un canvas o como imagen" };
  }
  if (nucleo < minPx) {
    return { determinado: false, motivo: "solo " + nucleo + " píxel(es) de texto con cobertura completa (mínimo " + minPx + "): texto muy fino o demasiado antialiasado" };
  }

  // El color del texto tiene que ser conocido. Si `getComputedStyle` dice
  // `transparent`, lo está pintando otra cosa —`background-clip: text`, un
  // `-webkit-text-fill-color` con degradado— y su color real no es consultable:
  // medir contra el negro por omisión daría un veredicto inventado.
  const alfaTexto = (fg && fg.a != null) ? fg.a : 1;
  if (alfaTexto <= 0) {
    return { determinado: false, motivo: "el color del texto es <code>transparent</code>: lo pinta background-clip o -webkit-text-fill-color, y su color real no es consultable" };
  }

  const grande = !!opts.grande;
  const min = grande ? 3 : 4.5;
  const lcMin = apcaMin(opts.size || 16, opts.weight || 400);

  let peor = Infinity, peorBg = null, mejor = 0, suma = 0, fallan = 0;
  cuentas.forEach(function (n, clave) {
    const bg = { r: (clave >> 16) & 255, g: (clave >> 8) & 255, b: clave & 255 };
    // Texto translúcido: el color efectivo es la composición sobre ESE fondo, y
    // cambia con cada píxel. Componerlo aquí es más exacto que hacerlo una vez.
    const frente = alfaTexto < 1
      ? { r: fg.r * alfaTexto + bg.r * (1 - alfaTexto), g: fg.g * alfaTexto + bg.g * (1 - alfaTexto), b: fg.b * alfaTexto + bg.b * (1 - alfaTexto) }
      : fg;
    const ratio = contrastRatio(frente, bg);
    if (ratio < peor) { peor = ratio; peorBg = bg; }
    if (ratio > mejor) mejor = ratio;
    suma += ratio * n;
    if (ratio < min) fallan += n;
  });
  const medio = suma / nucleo;
  const pctFallan = fallan / nucleo;

  // El criterio es por texto, no «de media»: si una parte del texto no llega, el
  // texto no cumple. Se tolera un 2 % por el ruido de remuestreo y compresión.
  const verdict = pctFallan <= 0.02 ? "pasa" : "falla";
  const frentePeor = alfaTexto < 1
    ? { r: fg.r * alfaTexto + peorBg.r * (1 - alfaTexto), g: fg.g * alfaTexto + peorBg.g * (1 - alfaTexto), b: fg.b * alfaTexto + peorBg.b * (1 - alfaTexto) }
    : fg;
  const lc = Math.round(Math.abs(apcaContrast(frentePeor, peorBg)));

  return {
    determinado: true,
    verdict: verdict,
    peor: peor, mejor: mejor, medio: medio,
    peorFondo: peorBg,
    pixeles: nucleo,
    fondosDistintos: cuentas.size,
    porcentajeQueFalla: pctFallan,
    minExigido: min,
    lcPeor: lc, lcMin: lcMin, grande: grande
  };
}

/** Texto de evidencia, en el formato del resto de mediciones. */
export function detallePixeles(r, fgStr) {
  if (!r.determinado) return "fondo con imagen o degradado: " + r.motivo;
  const pc = Math.round(r.porcentajeQueFalla * 100);
  const rango = r.peor.toFixed(2) + ":1 en el peor punto" + (r.fondosDistintos > 1 ? " y " + r.mejor.toFixed(2) + ":1 en el mejor" : "");
  const fondo = "rgb(" + r.peorFondo.r + " " + r.peorFondo.g + " " + r.peorFondo.b + ")";
  return "medido sobre los píxeles del fondo real (" + r.pixeles + " px de texto, " + r.fondosDistintos + " tono(s) de fondo): " +
    rango + " (mín " + r.minExigido + ":1) · APCA Lc " + r.lcPeor + " — " + fgStr + " sobre " + fondo +
    (r.verdict === "pasa" ? " · todo el texto llega al mínimo" : " · el " + (pc < 1 ? "<1" : pc) + " % del texto no llega al mínimo");
}

/* NODE-ONLY:START */
/* ── Driver Node (Playwright): capturar y resolver sobre una página viva ── */

const LOCALIZAR = `
function __uid(el){
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
/* Mismo nombre legible que usa la capa de medición (locatorM). Si cada capa
   nombra el elemento a su manera, el informe no puede saber que hablan del
   mismo y acaba con el «no medible» y la medición por píxeles a la vez. */
function __loc(el){
  var t=el.tagName.toLowerCase();
  if(el.id) return t+'#'+el.id;
  var c=(el.getAttribute('class')||'').trim().split(/\\s+/).filter(Boolean)[0];
  return c ? t+'.'+c : t;
}
function __propio(el){ var s='',k=el.childNodes||[]; for(var i=0;i<k.length;i++) if(k[i].nodeType===3) s+=k[i].nodeValue||''; return s.replace(/\\s+/g,' ').trim(); }
function __pintado(el){ if(!el.getClientRects||!el.getClientRects().length) return false; var cs=getComputedStyle(el); return cs.visibility!=='hidden'&&cs.display!=='none'&&parseFloat(cs.opacity||'1')>0; }
/* ¿Hay imagen o degradado detrás? Es la condición exacta que deja 1.4.3 sin
   dictaminar con getComputedStyle. */
function __fondoNoMedible(el){
  var p=el;
  while(p && p.nodeType===1){
    var cs=getComputedStyle(p);
    if(cs.backgroundImage && cs.backgroundImage!=='none') return true;
    var bg=cs.backgroundColor||'';
    var m=bg.match(/rgba?\\(([^)]+)\\)/);
    if(m){ var parts=m[1].replace(/\\//g,' ').split(/[\\s,]+/).filter(Boolean); var a=parts[3]==null?1:parseFloat(parts[3]); if(a>=1) return false; }
    p=p.parentElement;
  }
  return false;
}
return Array.prototype.slice.call(document.querySelectorAll('body *'))
  .filter(function(el){ return __propio(el) && __pintado(el) && __fondoNoMedible(el); })
  .slice(0, __arg || 12)
  .map(function(el){
    var cs=getComputedStyle(el), r=el.getBoundingClientRect();
    return { uid:__uid(el), locator:__loc(el), color:cs.color,
             size:parseFloat(cs.fontSize)||16, weight:parseInt(cs.fontWeight,10)||400,
             ancho:Math.round(r.width), alto:Math.round(r.height),
             texto:__propio(el).slice(0,40) };
  })
  .filter(function(c){ return c.ancho>0 && c.alto>0; });
`;

/**
 * Resuelve por píxeles los textos cuyo fondo no es medible con getComputedStyle.
 *
 * @param {import("playwright").Page} page  página ya abierta
 * @param {{ max?:number, umbral?:number }} [opts]
 * @returns {Promise<Array>} mediciones con la misma forma que las de measure.browser
 */
export async function resolverContrastePorPixeles(page, opts) {
  opts = opts || {};
  const max = opts.max || 12;
  const candidatos = await page.evaluate(new Function("__arg", LOCALIZAR), max);
  const out = [];

  // Repintar SOLO el color del texto, sin tocar el layout: si cambiara el tamaño
  // del elemento, las tres capturas no se podrían comparar.
  const pintar = function (uid, color) {
    return page.evaluate(function (arg) {
      const el = document.querySelector(arg.uid);
      if (!el) return false;
      if (!el.hasAttribute("data-a11y-prev")) {
        el.setAttribute("data-a11y-prev", JSON.stringify({
          color: el.style.getPropertyValue("color"),
          prioridad: el.style.getPropertyPriority("color"),
          relleno: el.style.getPropertyValue("-webkit-text-fill-color"),
          sombra: el.style.getPropertyValue("text-shadow")
        }));
      }
      el.style.setProperty("color", arg.color, "important");
      // -webkit-text-fill-color pisa a color en Chromium: hay que ponerlo también
      // o el repintado no tiene efecto donde el sitio lo use.
      el.style.setProperty("-webkit-text-fill-color", arg.color, "important");
      el.style.setProperty("text-shadow", "none", "important");
      return true;
    }, { uid: uid, color: color });
  };
  // OJO: re-resolver el selector al restaurar es frágil — si el DOM cambió entre
  // el pintado y la restauración (carrusel, lazy-load, re-render de SPA), esa
  // ruta apunta a OTRO nodo: se restaura el equivocado y el bueno se queda
  // pintado. Y como la capa de píxeles corre antes que viewport y dynamic sobre
  // la misma página, eso contamina todas las mediciones posteriores. Por eso,
  // además de restaurar por el selector, se barre al final todo lo que quedara
  // marcado con `data-a11y-prev`.
  const restaurar = function (uid) {
    return page.evaluate(function (arg) {
      const el = document.querySelector(arg.uid);
      if (!el) return;
      let p = {};
      try { p = JSON.parse(el.getAttribute("data-a11y-prev") || "{}"); } catch (e) {}
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("text-shadow");
      if (p.color) el.style.setProperty("color", p.color, p.prioridad || "");
      if (p.relleno) el.style.setProperty("-webkit-text-fill-color", p.relleno);
      if (p.sombra) el.style.setProperty("text-shadow", p.sombra);
      el.removeAttribute("data-a11y-prev");
    }, { uid: uid }).catch(function () {});
  };
  /** Barrido final: nada puede quedar pintado en la página del cliente. */
  const barrer = function () {
    return page.evaluate(function () {
      let n = 0;
      document.querySelectorAll("[data-a11y-prev]").forEach(function (el) {
        n++;
        let p = {};
        try { p = JSON.parse(el.getAttribute("data-a11y-prev") || "{}"); } catch (e) {}
        el.style.removeProperty("color");
        el.style.removeProperty("-webkit-text-fill-color");
        el.style.removeProperty("text-shadow");
        if (p.color) el.style.setProperty("color", p.color, p.prioridad || "");
        if (p.relleno) el.style.setProperty("-webkit-text-fill-color", p.relleno);
        if (p.sombra) el.style.setProperty("text-shadow", p.sombra);
        el.removeAttribute("data-a11y-prev");
        if (!el.getAttribute("style")) el.removeAttribute("style");
      });
      return n;
    }).catch(function () { return 0; });
  };

  const rgb = function (c) { return "rgb(" + c.r + "," + c.g + "," + c.b + ")"; };

  for (const c of candidatos) {
    const fg = parseColor(c.color);
    if (!fg) continue;
    const loc = page.locator(c.uid).first();
    const cap = {};
    let motivo = null;
    try {
      await pintar(c.uid, rgb(SONDA_A));
      cap.sondaA = decodePNG(await loc.screenshot({ timeout: 5000, animations: "disabled" }));
      await pintar(c.uid, rgb(SONDA_B));
      cap.sondaB = decodePNG(await loc.screenshot({ timeout: 5000, animations: "disabled" }));
      await pintar(c.uid, "transparent");
      cap.fondo = decodePNG(await loc.screenshot({ timeout: 5000, animations: "disabled" }));
    } catch (e) {
      motivo = "no se pudo capturar el elemento (" + String((e && e.message) || e).split("\n")[0] + ")";
    } finally {
      // Restaurar SIEMPRE: la página se sigue usando para el resto de medidas.
      await restaurar(c.uid);
    }

    const grande = c.size >= 24 || (c.size >= 18.66 && c.weight >= 700);
    const r = motivo
      ? { determinado: false, motivo: motivo }
      : analizarPixeles(cap, fg, { grande: grande, size: c.size, weight: c.weight, minCobertura: opts.minCobertura });
    const fgStr = "rgb(" + Math.round(fg.r) + " " + Math.round(fg.g) + " " + Math.round(fg.b) + ")";
    out.push({
      crit: "1.4.3", label: "Contraste del texto",
      node: c.locator + (c.texto ? " «" + c.texto + "»" : ""),
      locator: c.locator,
      uid: c.uid,
      verdict: r.determinado ? r.verdict : "revisar",
      detail: detallePixeles(r, fgStr),
      origen: "píxeles",
      pixeles: r
    });
  }
  // Antes de devolver nada: la página del cliente no se queda pintada. Si el
  // barrido encuentra algo, es que una restauración por selector falló — se dice.
  const quedaban = await barrer();
  if (quedaban) out.push({ crit: "__meta", label: "Sondas de color", node: quedaban + " elemento(s)", verdict: "revisar",
    detail: "la restauración por selector no alcanzó " + quedaban + " elemento(s) (el DOM cambió durante la captura: carrusel, lazy-load o re-render). El barrido final los ha devuelto a su estado, pero revisa las mediciones posteriores de esta página." });
  return out;
}
/* NODE-ONLY:END */
