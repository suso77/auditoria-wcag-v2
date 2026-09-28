/**
 * Núcleo de medición sobre render REAL.
 *
 * La matemática de contraste (WCAG + APCA, con composición alfa) se escribe una
 * sola vez como funciones puras, testeables en Node. Las funciones que dependen
 * del DOM (getComputedStyle / getBoundingClientRect) se escriben aparte y se
 * serializan a un string inyectable (`MEASURE_SRC`) que corre dentro de la página
 * real —vía Playwright, o vía la extensión de Chrome— para medir con estilos y
 * layout de verdad, no sobre un fragmento aislado.
 */

/* ── Matemática pura (unit-testable en Node) ── */

/**
 * Resuelve cualquier notación de color a rgba(), usando el propio navegador.
 *
 * `parseColor` solo entiende rgb()/rgba(), y Chromium NO serializa a rgb() los
 * colores en `oklch()`, `lab()`, `color(srgb …)` ni `color-mix()`: los devuelve
 * tal cual. Antes eso hacía que el fondo se degradara a blanco y un texto
 * ilegible saliera conforme; luego pasó a declararse «no medible». Pero el
 * navegador sí sabe resolverlos: basta pintarlo en un canvas de 1×1 y leer el
 * píxel. Así se mide de verdad, y lo que venga después (lch, color-contrast…)
 * funciona sin tocar nada.
 *
 * Solo existe dentro de la página; en Node no hay canvas y se devuelve null,
 * que es lo que activa la vía honesta de «no medible».
 */
function resolverColor(css, doc) {
  const str = String(css || "").trim();
  if (!str || str === "none") return null;
  const directo = parseColor(str);
  if (directo) return directo;
  try {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || !d.createElement) return null;
    if (!resolverColor._ctx) {
      const cv = d.createElement("canvas");
      cv.width = 1; cv.height = 1;
      resolverColor._ctx = cv.getContext("2d", { willReadFrequently: true });
    }
    const ctx = resolverColor._ctx;
    if (!ctx) return null;
    // Si el navegador no entiende el valor, `fillStyle` conserva el anterior:
    // se pone un centinela antes para distinguir «no entendido» de «negro».
    ctx.fillStyle = "#000";
    ctx.fillStyle = str;
    if (ctx.fillStyle === "#000000" && !/^#0{3,8}$|black|rgba?\(0[,\s]/i.test(str)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const px = ctx.getImageData(0, 0, 1, 1).data;
    return { r: px[0], g: px[1], b: px[2], a: px[3] / 255 };
  } catch (e) { return null; }
}
export function parseColor(s) {
  if (!s) return null;
  // rgb()/rgba() con comas o con espacios (getComputedStyle moderno) y / alfa
  const m = String(s).match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean).map(function (x) {
    return x.indexOf("%") !== -1 ? parseFloat(x) * 2.55 : parseFloat(x);
  });
  if (parts.length < 3) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: (parts[3] == null ? 1 : parts[3]) };
}
export function over(src, dst) {
  const a = src.a == null ? 1 : src.a;
  return { r: src.r * a + dst.r * (1 - a), g: src.g * a + dst.g * (1 - a), b: src.b * a + dst.b * (1 - a), a: 1 };
}
export function lum(c) {
  const f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
export function contrastRatio(a, b) {
  const L1 = lum(a), L2 = lum(b), hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
export function rgbStr(c) { return "rgb(" + Math.round(c.r) + " " + Math.round(c.g) + " " + Math.round(c.b) + ")"; }
export function apcaContrast(fg, bg) {
  const sY = function (c) { const j = function (v) { return Math.pow(v / 255, 2.4); }; return 0.2126729 * j(c.r) + 0.7151522 * j(c.g) + 0.0721750 * j(c.b); };
  let Ytxt = sY(fg), Ybg = sY(bg);
  const blkThrs = 0.022, blkClmp = 1.414, soft = function (Y) { return Y < blkThrs ? Y + Math.pow(blkThrs - Y, blkClmp) : Y; };
  Ytxt = soft(Ytxt); Ybg = soft(Ybg);
  if (Math.abs(Ybg - Ytxt) < 0.0005) return 0;
  let SAPC, out;
  if (Ybg > Ytxt) { SAPC = (Math.pow(Ybg, 0.56) - Math.pow(Ytxt, 0.57)) * 1.14; out = SAPC < 0.1 ? 0 : SAPC - 0.027; }
  else { SAPC = (Math.pow(Ybg, 0.65) - Math.pow(Ytxt, 0.62)) * 1.14; out = SAPC > -0.1 ? 0 : SAPC + 0.027; }
  return out * 100;
}
export function apcaMin(size, weight) {
  if (size >= 24 || (size >= 18.66 && weight >= 700)) return 60;
  if (size >= 16 && weight >= 400) return 75;
  return 90;
}

/* ── Funciones que corren en la página real (serializadas a MEASURE_SRC) ── */

/**
 * Opacidad acumulada de toda la ascendencia.
 *
 * Va aparte del recorrido de fondos a propósito: aquel se PARA en el primer
 * fondo opaco, y la opacidad de un antepasado por encima de ese punto sigue
 * afectando a lo que se ve. Con el cálculo metido en el mismo bucle, un
 * `<div style="opacity:.25"><p style="background:#fff">` se paraba en el <p> y
 * la opacidad del div no se contaba: 21:1 medido sobre un glifo que en pantalla
 * es gris claro.
 */
function opacidadAcumulada(el, win) {
  let p = el, acc = 1;
  while (p && p.nodeType === 1) {
    const op = parseFloat(win.getComputedStyle(p).opacity);
    if (!isNaN(op) && op < 1) acc *= op;
    p = p.parentElement;
  }
  return acc;
}
function bgBehind(el, win) {
  let p = el, image = false, desconocido = false; const layers = [];
  let base = { r: 255, g: 255, b: 255, a: 1 };
  while (p && p.nodeType === 1) {
    const cs = win.getComputedStyle(p);
    if (cs.backgroundImage && cs.backgroundImage !== "none") image = true;
    const crudo = cs.backgroundColor;
    const b = resolverColor(crudo, el.ownerDocument);
    if (!b && crudo && crudo !== "transparent" && crudo !== "none") {
      // `oklch()`, `lab()`, `color(srgb …)`, `color-mix()`: Chromium NO los
      // serializa a rgb(). Antes se seguía subiendo y se acababa midiendo contra
      // un blanco inventado — texto ilegible declarado conforme.
      desconocido = true;
      break;
    }
    if (b && b.a > 0) { if (b.a >= 1) { base = b; break; } layers.push(b); }
    p = p.parentElement;
  }
  let outc = { r: base.r, g: base.g, b: base.b, a: 1 };
  for (let i = layers.length - 1; i >= 0; i--) outc = over(layers[i], outc);
  outc.image = image;
  outc.desconocido = desconocido;
  outc.opacidad = opacidadAcumulada(el, win);
  return outc;
}
/**
 * Texto PROPIO del elemento: solo sus nodos de texto directos.
 *
 * `textContent` incluye el de los descendientes, así que medíamos el `color` del
 * contenedor contra un texto que en realidad pinta un hijo con otro color. De ahí
 * salían tanto falsos positivos como falsos negativos de 1.4.3. El contraste se
 * mide donde de verdad hay texto.
 */
function ownText(el) {
  let s = "";
  const kids = el.childNodes || [];
  for (let i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) s += kids[i].nodeValue || "";
  return s.replace(/\s+/g, " ").trim(); // \s ya incluye U+00A0
}
function contrastOf(el, win) {
  const txt = ownText(el); if (!txt) return null;
  const cs = win.getComputedStyle(el);
  if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) return null;
  const size0 = parseFloat(cs.fontSize) || 16, weight0 = parseInt(cs.fontWeight, 10) || 400;
  const large0 = size0 >= 24 || (size0 >= 18.66 && weight0 >= 700);
  let fg = resolverColor(cs.color, el.ownerDocument);
  // Un color de TEXTO que no se sabe leer tampoco puede desaparecer en silencio:
  // antes se devolvía `null` y el elemento no salía ni como pendiente.
  if (!fg) return { undetermined: true, large: large0, motivo: "el color del texto está en una notación que esta medición no sabe leer (" + String(cs.color).slice(0, 40) + ")" };
  const bg = bgBehind(el, win);
  const size = size0, weight = weight0;
  const large = large0;
  if (bg.desconocido) return { undetermined: true, large: large, motivo: "el fondo está en una notación que esta medición no sabe leer (oklch, lab, color-mix…)" };
  if (bg.opacidad < 1) return { undetermined: true, large: large, motivo: "hay opacidad (" + bg.opacidad.toFixed(2) + ") en la cadena de antepasados: lo que se ve pintado no es este color" };
  if (bg.image) return { undetermined: true, large: large };
  if (fg.a != null && fg.a < 1) fg = over(fg, bg);
  return { ratio: contrastRatio(fg, bg), fg: rgbStr(fg), bg: rgbStr(bg), large: large, lc: apcaContrast(fg, bg), lcMin: apcaMin(size, weight) };
}
/**
 * 1.4.11 Contraste no textual: el LÍMITE del control contra lo que tiene detrás.
 *
 * Solo tiene sentido si el control pinta un relleno propio; si lo dibuja el
 * navegador (un <input> con estilo de UA) o el fondo lleva imagen, no es medible.
 */
function boundaryContrastOf(el, win) {
  const own = resolverColor(win.getComputedStyle(el).backgroundColor, el.ownerDocument);
  if (!own || own.a === 0) return null;
  const bg = bgBehind(el.parentElement || el, win);
  if (bg.image) return null;
  const front = own.a < 1 ? over(own, bg) : own;
  const ratio = contrastRatio(front, bg);
  if (!(ratio > 1.001)) return null; // mismo color que el fondo: no hay límite que medir
  return { ratio: ratio, fg: rgbStr(front), bg: rgbStr(bg) };
}
const NATIVOS = ["a", "button", "input", "select", "textarea", "summary"];
function isInteractiveM(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "a" || tag === "area") return el.hasAttribute("href");
  if (["button", "select", "textarea", "summary"].indexOf(tag) !== -1) return true;
  if (tag === "input") return (el.getAttribute("type") || "").toLowerCase() !== "hidden";
  const role = (el.getAttribute("role") || "").split(/\s+/)[0];
  const IR = ["button", "link", "checkbox", "radio", "textbox", "searchbox", "combobox", "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "switch", "option", "treeitem"];
  if (role && IR.indexOf(role) !== -1) return true;
  const ti = el.getAttribute("tabindex");
  return el.hasAttribute("onclick") || (ti != null && parseInt(ti, 10) >= 0);
}
/**
 * ¿Hay una regla CSS de foco que se aplique a este elemento y pinte un indicador?
 *
 * Es la salida cuando el documento NO tiene el foco del sistema. Se descubrió
 * probando sobre un sitio real desde un panel de navegador: con el panel abierto
 * el documento pierde el foco, `:focus` deja de aplicar y la comparación de
 * estilos daba «sin cambio medible» en TODOS los controles — un falso 2.4.7 por
 * cada elemento de la página. En Playwright no aparecía nunca, porque allí la
 * página siempre tiene el foco.
 */
const PROP_INDICADOR = ["outline", "outline-width", "outline-style", "outline-color",
  "box-shadow", "border", "border-color", "border-width", "background", "background-color", "text-decoration"];
// Palabras que NO pintan nada. `outline: none` es el borrador de indicadores más
// extendido que hay: si contase como indicador, la regla `*:focus{outline:none}`
// —que es justo la que quita el foco visible— daría «cumple-parcial» en toda la
// página. `outline-offset` no está en la lista de arriba por lo mismo: desplaza
// un contorno, no lo dibuja.
const NULOS = ["none", "hidden", "0", "0px", "transparent", "initial", "unset", "revert", "medium", "currentcolor"];
// Hacia ABAJO, siempre. Con `toFixed(2)`, un 4.4995 se imprimía «4.50:1 (mín
// 4.5:1)» junto al veredicto «revisar»: una contradicción en el informe que
// invita a que el revisor lo suba a conforme.
function ratioTxt(x) { return (Math.floor(x * 100) / 100).toFixed(2); }
function pinta(valor) {
  const t = String(valor || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!t.length) return false;
  for (let i = 0; i < t.length; i++) if (NULOS.indexOf(t[i]) === -1) return true;
  return false;
}
function reglasDeFoco(el, doc) {
  let encontradas = 0, bloqueadas = 0, conIndicador = 0;
  const ejemplos = [];
  const hojas = doc.styleSheets || [];
  for (let i = 0; i < hojas.length; i++) {
    let reglas = null;
    try { reglas = hojas[i].cssRules; } catch (e) { bloqueadas++; continue; }
    if (!reglas) continue;
    const pila = [reglas];
    while (pila.length) {
      const lista = pila.pop();
      for (let j = 0; j < lista.length; j++) {
        const r = lista[j];
        // OJO: en Chrome moderno una CSSStyleRule TAMBIÉN tiene `cssRules` (CSS
        // anidado). Con un `if (r.cssRules) { bajar; continue; }` se saltarían
        // todas las reglas normales sin dar ningún error.
        const sel = r.selectorText;
        if (sel && /:focus/i.test(sel) && coincideSinFoco(el, sel)) {
          encontradas++;
          for (let k = 0; k < PROP_INDICADOR.length; k++) {
            if (r.style && pinta(r.style.getPropertyValue(PROP_INDICADOR[k]))) {
              conIndicador++;
              if (ejemplos.length < 2) ejemplos.push(sel.trim().slice(0, 80));
              break;
            }
          }
        }
        if (r.cssRules && r.cssRules.length) pila.push(r.cssRules);
      }
    }
  }
  return { encontradas: encontradas, conIndicador: conIndicador, hojasBloqueadas: bloqueadas, ejemplos: ejemplos };
}
/**
 * ¿El selector, quitándole las pseudoclases de foco, alcanza a este elemento?
 *
 * El recorte va carácter a carácter y no con una expresión regular porque en
 * Tailwind el propio nombre de clase lleva el prefijo escapado
 * (`.focus-visible\:outline-2:focus-visible`): una regex ingenua destroza la
 * clase y el selector deja de coincidir con nada.
 */
function sinPseudoFoco(sel) {
  let out = "", i = 0;
  while (i < sel.length) {
    const c = sel[i];
    if (c === "\\") { out += sel[i] + (sel[i + 1] || ""); i += 2; continue; }
    if (c === ":") {
      const resto = sel.slice(i);
      const m = /^:focus(-visible|-within)?/.exec(resto);
      if (m) { i += m[0].length; continue; }
    }
    out += c; i++;
  }
  return out;
}
function coincideSinFoco(el, sel) {
  const partes = sinPseudoFoco(sel).split(",");
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i].trim();
    // Vacío = el selector era SOLO la pseudoclase, o sea universal. Chrome
    // normaliza `*:focus` a `:focus` en `selectorText`, así que descartar los
    // vacíos dejaba fuera precisamente las reglas que alcanzan a toda la página.
    if (!p) return true;
    try { if (el.matches(p)) return true; } catch (e) {}
  }
  return false;
}
/**
 * Ruta CSS única, en el mismo formato que usan la capa dinámica, la de píxeles y
 * el motor. El nombre legible (`locatorM`) no identifica: dos botones sin id ni
 * clase son los dos «button», y el informe no puede decir a cuál se refiere.
 */
function rutaM(el) {
  const parts = [];
  let n = el;
  while (n && n.nodeType === 1) {
    const t = n.tagName.toLowerCase();
    if (t === "html" || t === "body") break;
    const p = n.parentElement;
    if (!p) { parts.unshift(t); break; }
    let i = 1, sib = p.firstElementChild;
    while (sib && sib !== n) { if (sib.tagName === n.tagName) i++; sib = sib.nextElementSibling; }
    parts.unshift(t + ":nth-of-type(" + i + ")");
    n = p;
  }
  return parts.length ? "html > body > " + parts.join(" > ") : "body";
}
/**
 * 1.4.1 Uso del color: un enlace dentro de un párrafo distinguido SOLO por color.
 *
 * Es el caso clásico del criterio y es perfectamente medible: si un `<a>` va
 * embebido en texto corrido y lo único que lo separa de ese texto es el color
 * —sin subrayado, sin negrita, sin borde, sin fondo, sin icono—, quien no
 * distingue ese color no ve que hay un enlace. Se compara contra el texto que lo
 * rodea, que es exactamente lo que mira una persona auditando.
 *
 * Lo que esta comprobación NO decide: si el color es el único medio en una
 * leyenda, un gráfico o un estado de formulario. Eso sigue siendo juicio humano,
 * y el veredicto lo dice en vez de callarlo.
 */
function distintivoDeEnlace(a, win) {
  const cs = win.getComputedStyle(a);
  const dec = String(cs.textDecorationLine || cs.textDecoration || "");
  if (dec.indexOf("underline") !== -1 || dec.indexOf("line-through") !== -1 || dec.indexOf("overline") !== -1) return "subrayado";
  const padre = a.parentElement;
  if (!padre) return null;
  const pcs = win.getComputedStyle(padre);
  const num = function (v) { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
  if (num(cs.fontWeight) >= num(pcs.fontWeight) + 100) return "grosor de letra";
  if (cs.fontStyle !== pcs.fontStyle) return "cursiva";
  if (cs.fontFamily !== pcs.fontFamily) return "otra tipografía";
  if (num(cs.fontSize) !== num(pcs.fontSize)) return "otro tamaño";
  if (pinta(cs.borderBottomWidth) && cs.borderBottomStyle !== "none") return "borde inferior";
  if (pinta(cs.backgroundColor) && cs.backgroundColor !== pcs.backgroundColor) return "fondo propio";
  if (cs.backgroundImage && cs.backgroundImage !== "none") return "imagen de fondo (¿subrayado dibujado?)";
  if (pinta(cs.outlineWidth) && cs.outlineStyle !== "none") return "contorno";
  if (pinta(cs.boxShadow)) return "sombra";
  if (a.querySelector && a.querySelector("img,svg,[class*=icon],[class*=icono]")) return "icono";
  return null;
}
/** ¿El <a> va DENTRO de texto corrido, o es un enlace suelto (menú, botón, tarjeta)? */
function enTextoCorrido(a) {
  const padre = a.parentElement;
  if (!padre) return false;
  const BLOQUES = ["p", "li", "td", "th", "dd", "dt", "blockquote", "figcaption", "caption", "div", "span", "section"];
  if (BLOQUES.indexOf(padre.tagName.toLowerCase()) === -1) return false;
  // Tiene que haber texto del PADRE alrededor: si el enlace es todo el contenido
  // (un menú, una tarjeta), no hay texto del que distinguirlo y el criterio no
  // aplica por esta vía.
  let alrededor = "";
  const kids = padre.childNodes || [];
  for (let i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) alrededor += kids[i].nodeValue || "";
  return alrededor.replace(/\s+/g, " ").trim().length >= 10;
}
/**
 * 2.4.11 Foco no oscurecido: ¿tapa algo al elemento que acaba de recibir el foco?
 *
 * Es el criterio nuevo de WCAG 2.2 que más se incumple sin querer: una cabecera
 * `position:sticky`, una barra de cookies fija al pie o un chat flotante tapan el
 * control enfocado cuando llegas a él tabulando, y nadie se entera porque con el
 * ratón nunca pasa. Se mide con lo que ya hay: el rect del elemento enfocado
 * contra los rects de lo que está fijo, comprobando además que de verdad se pinta
 * por encima.
 */
function elementosFlotantes(doc, win) {
  const out = [];
  const todos = doc.querySelectorAll("body *");
  for (let i = 0; i < todos.length && out.length < 30; i++) {
    const el = todos[i];
    const cs = win.getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity || "1") === 0) continue;
    if (cs.pointerEvents === "none") continue;   // decorativo: no tapa de verdad
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    out.push({ el: el, rect: r, z: parseInt(cs.zIndex, 10) || 0, loc: locatorM(el) });
  }
  return out;
}
/** Cuánto del rect del control queda tapado por un flotante, de 0 a 1. */
function fraccionTapada(rc, flot) {
  const area = Math.max(1, rc.width * rc.height);
  const x = Math.max(0, Math.min(rc.right, flot.right) - Math.max(rc.left, flot.left));
  const y = Math.max(0, Math.min(rc.bottom, flot.bottom) - Math.max(rc.top, flot.top));
  return (x * y) / area;
}
/**
 * 2.2.2 Poner en pausa, detener u ocultar.
 *
 * El criterio habla de contenido que se mueve, parpadea o se desplaza **más de
 * cinco segundos** y arranca solo. Eso es medible: una animación CSS con
 * `animation-iteration-count: infinite`, un `<marquee>`, o un vídeo con
 * `autoplay loop`. Lo que NO se puede medir desde aquí es si existe un botón de
 * pausa en algún sitio de la página, así que el veredicto es `revisar` con los
 * elementos señalados — salvo el `<marquee>`, que no tiene control posible.
 *
 * Se respeta `prefers-reduced-motion`: si la animación ya está desactivada en la
 * medición, no se reporta. Para eso la medición corre sin esa preferencia.
 */
function animacionesPersistentes(doc, win, limite) {
  const out = [];
  const todos = doc.querySelectorAll("body *");
  for (let i = 0; i < todos.length && out.length < (limite || 25); i++) {
    const el = todos[i];
    if (!renderedM(el, win)) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "marquee" || tag === "blink") {
      out.push({ loc: locatorM(el), ruta: rutaM(el), motivo: "<" + tag + ">", control: false });
      continue;
    }
    const cs = win.getComputedStyle(el);
    const nombre = String(cs.animationName || "none");
    if (nombre === "none" || !nombre) continue;
    const iter = String(cs.animationIterationCount || "1");
    const dur = String(cs.animationDuration || "0s").split(",")[0];
    const seg = parseFloat(dur) * (/ms$/.test(dur.trim()) ? 0.001 : 1);
    const play = String(cs.animationPlayState || "running");
    if (play === "paused") continue;
    const infinita = iter.split(",").some(function (x) { return x.trim() === "infinite"; });
    // Infinita, o una sola pasada que ya dura más de 5 s: los dos casos del
    // criterio. Una transición corta de hover no entra aquí.
    const total = infinita ? Infinity : seg * (parseFloat(iter) || 1);
    if (!infinita && !(total > 5)) continue;
    out.push({
      loc: locatorM(el), ruta: rutaM(el),
      motivo: "animación «" + nombre.split(",")[0] + "» " + (infinita ? "infinita" : "de " + total.toFixed(1) + " s"),
      control: null
    });
  }
  // Vídeos que arrancan solos y se repiten: se mueven más de 5 s por definición.
  Array.prototype.forEach.call(doc.querySelectorAll("video[autoplay]"), function (v) {
    if (!renderedM(v, win)) return;
    if (!v.hasAttribute("loop")) return;
    out.push({ loc: locatorM(v), ruta: rutaM(v), motivo: "vídeo con autoplay y loop", control: v.hasAttribute("controls") });
  });
  return out;
}
function locatorM(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return tag + "#" + el.id;
  const cls = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
  if (cls) return tag + "." + cls;
  return tag;
}
// ¿Está pintado? Sin caja ni visibilidad no hay nada que medir (ni que enfocar).
function renderedM(el, win) {
  if (!el.getClientRects || !el.getClientRects().length) return false;
  const cs = win.getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
}
// Deshabilitado de verdad: no es un fallo de teclado que no reciba el foco.
function disabledM(el) {
  if (el.disabled === true || el.hasAttribute("disabled")) return true;
  if (el.closest && el.closest("fieldset[disabled],[inert]")) return true;
  return false;
}
/**
 * Elemento gestionado por un widget compuesto (tabs, listbox, menu, tree, grid,
 * radiogroup, toolbar). Ahí `tabindex="-1"` es el patrón CORRECTO de foco móvil
 * (roving tabindex): el contenedor recibe Tab y las flechas mueven el foco. Marcar
 * 2.1.1 falla en esos hijos era un falso positivo sistemático.
 */
const MANAGED_PARENT = "[role=tablist],[role=listbox],[role=menu],[role=menubar],[role=tree],[role=grid],[role=treegrid],[role=radiogroup],[role=toolbar],[role=combobox]";
function managedM(el) {
  const role = (el.getAttribute("role") || "").split(/\s+/)[0];
  const MI = ["tab", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem", "row", "gridcell", "radio"];
  if (MI.indexOf(role) !== -1 && el.closest && el.closest(MANAGED_PARENT)) return true;
  return false;
}
// Dónde hay texto de verdad dentro de un control: él mismo, o sus descendientes
// con texto propio (un <button><span>Guardar</span></button> pinta en el span).
function textTargets(el) {
  if (ownText(el)) return [el];
  const out = [];
  const kids = el.querySelectorAll ? el.querySelectorAll("*") : [];
  for (let i = 0; i < kids.length && out.length < 3; i++) if (ownText(kids[i])) out.push(kids[i]);
  return out;
}
function runChecksReal(doc, win, limit) {
  limit = limit || 400;
  const res = [];
  const sel = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[role],[tabindex],[onclick]';
  // Filtrar ANTES de recortar: con `.slice(0, limit)` primero, un encabezado con
  // role= o cien divs con tabindex consumían el cupo y los controles reales se
  // quedaban fuera de la medición sin que nadie se enterase.
  const candidatos = Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(isInteractiveM);
  const all = candidatos.slice(0, limit);
  const truncado = candidatos.length > all.length;
  const focusables = [];
  // Deduplicación por IDENTIDAD del elemento, no por el texto del locator: el
  // mismo <span> se nombra «button › span» en la pasada de controles y «span» en
  // la de texto, y con claves de texto se medía dos veces.
  const medidos = new Set();
  // Si el documento no tiene el foco del sistema, `:focus` NO se aplica por mucho
  // que `el.focus()` mueva `activeElement`: la comparación de estilos sale igual
  // siempre. Se decide una sola vez para toda la pasada y 2.4.7 cambia de vía.
  let docEnfocado = true;
  try { if (typeof doc.hasFocus === "function") docEnfocado = doc.hasFocus(); } catch (e) {}
  let porCss = 0, sinRegla = 0, hojasBloqueadas = 0;
  // Lo que flota por encima, una sola vez: se consulta por cada control enfocado.
  const flotantes = elementosFlotantes(doc, win);
  all.forEach(function (el) {
    const loc = locatorM(el);
    // Se sella al final del bloque en vez de repetir `path:` en las quince
    // inserciones de este bucle: menos sitios donde olvidarlo.
    const desde = res.length, ruta = rutaM(el);
    const pintado = renderedM(el, win);
    const deshabilitado = disabledM(el);
    const gestionado = managedM(el);
    const tiRaw = el.getAttribute("tabindex");
    const ti = tiRaw == null ? 0 : parseInt(tiRaw, 10);

    // 2.1.1 solo tiene sentido sobre controles operables y presentes.
    if (!pintado) {
      // `revisar`, no `pasa`: el propio texto dice «fuera del alcance». Los
      // controles de un menú, un modal o un acordeón cerrados al cargar son lo
      // normal, y declararlos conformes daba 2.1.1 por comprobado sin tabular.
      res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "revisar", detail: "no está renderizado ahora mismo (menú, modal o acordeón cerrado): esta medición no lo alcanza. Ábrelo y vuelve a medir, o compruébalo a mano" });
    } else if (deshabilitado) {
      res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "deshabilitado: no debe recibir el foco" });
    } else if (ti < 0) {
      // OJO: `el.focus()` SÍ enfoca un tabindex="-1" — es foco programático. Si se
      // usara la sonda de foco aquí, 2.1.1 saldría «pasa» sobre un control que el
      // tabulador no alcanza jamás. El atributo manda antes que la sonda.
      if (gestionado) {
        res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "hijo de un widget compuesto con foco móvil (roving tabindex): lo gobierna el contenedor, verifica las flechas" });
      } else {
        res.push({ crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "revisar", detail: "tabindex=\"-1\": solo foco programático, el tabulador no lo alcanza. Comprueba que haya otra forma de operarlo con teclado" });
      }
    } else {
      const csBase = win.getComputedStyle(el);
      const base = csBase.outlineStyle + "|" + csBase.outlineWidth + "|" + csBase.outlineColor + "||" + csBase.boxShadow + "||" + csBase.borderColor;
      let focusable = false, foc = null;
      try {
        el.focus({ preventScroll: true });
        focusable = (doc.activeElement === el);
        const c2 = win.getComputedStyle(el);
        foc = c2.outlineStyle + "|" + c2.outlineWidth + "|" + c2.outlineColor + "||" + c2.boxShadow + "||" + c2.borderColor;
        if (el.blur) el.blur();
      } catch (e) {}
      res.push(focusable
        ? { crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "pasa", detail: "recibe el foco" }
        : { crit: "2.1.1", label: "Enfocable con teclado", node: loc, verdict: "falla", detail: "no recibe foco con Tab" });
      if (focusable) {
        focusables.push({ loc: loc, ti: ti, path: ruta });
        // 2.4.11: con el foco puesto, ¿lo tapa algo fijo?
        if (flotantes.length) {
          const rc = el.getBoundingClientRect();
          if (rc.width > 0 && rc.height > 0) {
            let peor = null, frac = 0;
            flotantes.forEach(function (f) {
              if (f.el === el || f.el.contains(el)) return;   // está DENTRO del flotante: no lo tapa
              const t = fraccionTapada(rc, f.rect);
              if (t > frac) { frac = t; peor = f; }
            });
            if (peor && frac >= 0.999) {
              res.push({ crit: "2.4.11", label: "Foco no oscurecido", node: loc, path: ruta, verdict: "falla",
                detail: "al recibir el foco queda COMPLETAMENTE tapado por «" + peor.loc + "» (" + win.getComputedStyle(peor.el).position + "): tabulando hasta aquí no se ve dónde está el foco" });
            } else if (peor && frac > 0.02) {
              res.push({ crit: "2.4.11", label: "Foco no oscurecido", node: loc, path: ruta, verdict: "revisar",
                detail: "al recibir el foco queda tapado un " + Math.round(frac * 100) + " % por «" + peor.loc + "» (" + win.getComputedStyle(peor.el).position + "). El mínimo de 2.4.11 solo exige que no se oculte por completo, pero compruébalo" });
            }
          }
        }
        const changed = !!(foc && foc !== base);
        if (docEnfocado || changed) {
          // Con el documento enfocado la medición vale. Y si aun sin foco de
          // sistema SÍ hubo cambio, el cambio es real: no hay por qué dudarlo.
          res.push({ crit: "2.4.7", label: "Foco visible", node: loc, verdict: changed ? "pasa" : "revisar", detail: changed ? "cambio visible al enfocar" : "sin cambio medible (revisar a ojo / :focus-visible)" });
        } else {
          const rf = reglasDeFoco(el, doc);
          hojasBloqueadas = Math.max(hojasBloqueadas, rf.hojasBloqueadas);
          const aviso = rf.hojasBloqueadas ? " Además, " + rf.hojasBloqueadas + " hoja(s) de estilo de otro origen no se han podido leer, así que puede haber reglas de foco fuera de alcance." : "";
          if (rf.conIndicador) {
            porCss++;
            res.push({
              crit: "2.4.7", label: "Foco visible", node: loc, verdict: "cumple-parcial",
              detail: "el documento no tiene el foco del sistema, así que :focus no se aplica y no se ha podido medir el render. En el CSS sí hay " + rf.conIndicador + " regla(s) de foco que alcanzan a este elemento y pintan indicador" + (rf.ejemplos.length ? " (" + rf.ejemplos.join(" ; ") + ")" : "") + ": la presencia está, falta comprobar a ojo que se vea y contraste lo suficiente." + aviso
            });
          } else {
            sinRegla++;
            res.push({
              crit: "2.4.7", label: "Foco visible", node: loc, verdict: "revisar",
              detail: "el documento no tiene el foco del sistema, así que :focus no se aplica y no se ha podido medir el render; tampoco se ha encontrado ninguna regla CSS de foco que alcance a este elemento. Compruébalo a ojo tabulando." + aviso
            });
          }
        }
      }
    }

    if (pintado) {
      const r = el.getBoundingClientRect(), w = r.width, h = r.height;
      if (w > 0 && h > 0 && !deshabilitado) {
        // Sobre el valor CRUDO: con `Math.round`, un objetivo de 23.59 px salía
        // «24×24 px (≥ 24×24) pasa» — un aprobado con una medida inventada.
        const ok = (w >= 24 && h >= 24);
        const fmt = function (n) { return (Math.round(n * 100) / 100) + ""; };
        res.push({ crit: "2.5.8", label: "Tamaño del objetivo", node: loc, verdict: ok ? "pasa" : "revisar", detail: fmt(w) + "×" + fmt(h) + " px" + (ok ? " (≥ 24×24)" : " (< 24×24)") });
      }
      textTargets(el).forEach(function (t) {
        const c = contrastOf(t, win);
        if (!c) return;
        const tl = (t === el) ? loc : loc + " › " + locatorM(t);
        const rt = rutaM(t);
        if (medidos.has(t)) return;
        medidos.add(t);
        if (c.undetermined) {
          res.push({ crit: "1.4.3", label: "Contraste del texto", node: tl, path: rt, verdict: "revisar", detail: c.motivo || "fondo con imagen o degradado: no medible automáticamente" });
        } else {
          const min = c.large ? 3 : 4.5, ok = c.ratio >= min, lc = Math.round(Math.abs(c.lc));
          const apca = " · APCA Lc " + lc + (lc >= c.lcMin ? " (≥ " + c.lcMin + ", ok en el borrador de WCAG 3)" : " (< " + c.lcMin + ", orientativo)");
          res.push({
            crit: "1.4.3", label: "Contraste del texto", node: tl, path: rt,
            verdict: ok ? "pasa" : (c.ratio >= min - 1 ? "revisar" : "falla"),
            detail: "ratio " + ratioTxt(c.ratio) + ":1" + (c.large ? " (texto grande, mín 3:1)" : " (mín 4.5:1)") + apca + " — " + c.fg + " sobre " + c.bg
          });
        }
      });
      // 1.4.11 solo para controles personalizados: en los nativos el límite lo
      // pinta el navegador y medirlo sobre el render no dice nada útil.
      if (NATIVOS.indexOf(el.tagName.toLowerCase()) === -1 && !deshabilitado) {
        const nc = boundaryContrastOf(el, win);
        if (nc) res.push({ crit: "1.4.11", label: "Contraste no textual", node: loc, verdict: nc.ratio >= 3 ? "pasa" : "revisar", detail: "límite del control " + nc.ratio.toFixed(2) + ":1 (mín 3:1) — " + nc.fg + " sobre " + nc.bg });
      }
    }
    for (let k = desde; k < res.length; k++) if (!res[k].path) res[k].path = ruta;
  });
  /* ── 2.2.2 Poner en pausa, detener u ocultar ── */
  const animadas = animacionesPersistentes(doc, win, 25);
  animadas.forEach(function (a) {
    res.push(a.control === false && /marquee|blink/.test(a.motivo)
      ? { crit: "2.2.2", label: "Poner en pausa, detener, ocultar", node: a.loc, path: a.ruta, verdict: "falla",
          detail: a.motivo + " se desplaza solo y no ofrece ningún mecanismo para pararlo: el elemento no admite controles" }
      : { crit: "2.2.2", label: "Poner en pausa, detener, ocultar", node: a.loc, path: a.ruta, verdict: "revisar",
          detail: a.motivo + ", arranca sola y dura más de 5 s" + (a.control === true ? ", aunque el elemento ofrece controles" : "") +
            ". 2.2.2 exige un mecanismo para pausarla, detenerla u ocultarla; desde aquí no se puede saber si existe en otro punto de la página" });
  });

  /* ── 1.4.1 Uso del color: enlaces en texto distinguidos solo por color ── */
  const enlacesEnTexto = Array.prototype.slice.call(doc.querySelectorAll("a[href]"))
    .filter(function (a) { return renderedM(a, win) && ownText(a) && enTextoCorrido(a); })
    .slice(0, limit);
  const soloColor = [], conDistintivo = [];
  enlacesEnTexto.forEach(function (a) {
    const d = distintivoDeEnlace(a, win);
    (d ? conDistintivo : soloColor).push({ loc: locatorM(a), ruta: rutaM(a), texto: ownText(a).slice(0, 40), distintivo: d });
  });
  soloColor.slice(0, 25).forEach(function (x) {
    res.push({
      crit: "1.4.1", label: "Uso del color", node: x.loc, path: x.ruta, verdict: "falla",
      detail: "enlace «" + x.texto + "» dentro de texto corrido sin ningún distintivo salvo el color: ni subrayado, ni grosor, ni borde, ni fondo, ni icono. Quien no distinga ese color no ve que hay un enlace"
    });
  });
  if (!soloColor.length && enlacesEnTexto.length) {
    res.push({
      crit: "1.4.1", label: "Uso del color", node: enlacesEnTexto.length + " enlaces en texto", verdict: "cumple-parcial",
      detail: "los " + enlacesEnTexto.length + " enlaces embebidos en texto llevan otro distintivo además del color (" +
        Array.from(new Set(conDistintivo.map(function (x) { return x.distintivo; }))).join(", ") +
        "). Falta comprobar a ojo el resto del criterio: leyendas, gráficos, estados y cualquier instrucción que dependa del color"
    });
  }

  // 1.4.3 aplica a TODO el texto, no solo al de los controles. El barrido de
  // arriba solo recorre elementos interactivos, así que un párrafo gris claro se
  // colaba sin medir —lo pillaba axe y nosotros no—. Segunda pasada sobre los
  // bloques de texto de la página.
  const conTexto = Array.prototype.slice.call(doc.querySelectorAll("body *")).filter(function (el) { return ownText(el); });
  const textoLim = Math.min(conTexto.length, limit);
  for (let i = 0; i < textoLim; i++) {
    const el = conTexto[i];
    const loc = locatorM(el), ruta = rutaM(el);
    if (medidos.has(el)) continue;
    if (!renderedM(el, win)) continue;
    const c = contrastOf(el, win);
    if (!c) continue;
    medidos.add(el);
    if (c.undetermined) {
      res.push({ crit: "1.4.3", label: "Contraste del texto", node: loc, path: ruta, verdict: "revisar", detail: c.motivo || "fondo con imagen o degradado: no medible automáticamente" });
    } else {
      const min = c.large ? 3 : 4.5, ok = c.ratio >= min, lc = Math.round(Math.abs(c.lc));
      const apca = " · APCA Lc " + lc + (lc >= c.lcMin ? " (≥ " + c.lcMin + ", ok en el borrador de WCAG 3)" : " (< " + c.lcMin + ", orientativo)");
      res.push({
        crit: "1.4.3", label: "Contraste del texto", node: loc, path: ruta,
        verdict: ok ? "pasa" : (c.ratio >= min - 1 ? "revisar" : "falla"),
        detail: "ratio " + ratioTxt(c.ratio) + ":1" + (c.large ? " (texto grande, mín 3:1)" : " (mín 4.5:1)") + apca + " — " + c.fg + " sobre " + c.bg
      });
    }
  }
  if (conTexto.length > textoLim) {
    res.push({ crit: "__meta", label: "Cobertura del contraste", node: textoLim + "/" + conTexto.length, verdict: "revisar", detail: "se midió el contraste de " + textoLim + " de " + conTexto.length + " bloques de texto (límite): el resto NO está comprobado" });
  }

  if (focusables.length > 1) {
    const positive = focusables.some(function (f) { return f.ti > 0; });
    // La SECUENCIA concreta, no solo el veredicto: es lo que permite comprobar de
    // un vistazo si el orden de tabulación sigue el orden visual.
    const ordenados = focusables.slice().sort(function (a, b) {
      const at = a.ti > 0 ? a.ti : Infinity, bt = b.ti > 0 ? b.ti : Infinity;
      return at - bt;
    }).slice(0, 25);
    const seq = ordenados.map(function (f) { return f.loc; });
    const cola = seq.join(" → ") + (focusables.length > 25 ? " → …" : "");
    res.push({
      crit: "2.4.3", label: "Orden de foco", node: focusables.length + " controles",
      verdict: positive ? "revisar" : "pasa",
      detail: (positive ? "un tabindex positivo altera el orden natural → " : "sigue el orden del DOM: ") + cola,
      // Este hallazgo no es de UN elemento, así que no lleva `path`: lleva la
      // secuencia de rutas. El nombre legible se repite («a → a → a») y por sí
      // solo no deja comprobar el orden; con las rutas sí.
      rutas: ordenados.map(function (f) { return f.path; })
    });
  }
  if (truncado) {
    res.push({ crit: "__meta", label: "Cobertura de los controles", node: all.length + "/" + candidatos.length, verdict: "revisar", detail: "se midieron " + all.length + " de " + candidatos.length + " controles (límite): el resto NO está comprobado" });
  }
  if (!docEnfocado && (porCss || sinRegla)) {
    res.push({
      crit: "__meta", label: "Foco visible sin foco del sistema", node: (porCss + sinRegla) + " controles", verdict: "revisar",
      detail: "el documento NO tenía el foco del sistema durante la medición (ventana en segundo plano, panel lateral o popup de extensión abierto): «:focus» no se aplica y el indicador de foco no se puede medir sobre el render. Se ha caído al CSS: " + porCss + " control(es) con regla de foco con indicador y " + sinRegla + " sin ninguna" + (hojasBloqueadas ? ", con " + hojasBloqueadas + " hoja(s) de otro origen ilegibles" : "") + ". Para medir 2.4.7 de verdad, haz clic en la página y vuelve a analizar con la ventana en primer plano."
    });
  }
  return res;
}

const FNS = [parseColor, over, lum, contrastRatio, rgbStr, apcaContrast, apcaMin,
  animacionesPersistentes, distintivoDeEnlace, enTextoCorrido, elementosFlotantes, fraccionTapada, ratioTxt, resolverColor, ownText, opacidadAcumulada, bgBehind, contrastOf, boundaryContrastOf, isInteractiveM, locatorM, rutaM, renderedM, disabledM, managedM, textTargets,
  pinta, sinPseudoFoco, coincideSinFoco, reglasDeFoco, runChecksReal];
const FN_SRC = "var MANAGED_PARENT = " + JSON.stringify(MANAGED_PARENT) + ";\nvar NATIVOS = " + JSON.stringify(NATIVOS) + ";\n" +
  "var PROP_INDICADOR = " + JSON.stringify(PROP_INDICADOR) + ";\nvar NULOS = " + JSON.stringify(NULOS) + ";\n" +
  FNS.map(function (f) { return f.toString(); }).join("\n");

/**
 * Cuerpo para `page.evaluate(new Function("lim", MEASURE_BODY))`.
 *
 * Esta es la vía preferente en Playwright: la evaluación por CDP NO está sujeta a
 * la CSP de la página, mientras que `addScriptTag` sí — con una CSP restrictiva la
 * etiqueta se descartaba en silencio y `window.__a11yMeasure` no existía, así que
 * la medición fallaba sin decir por qué.
 */
export const MEASURE_BODY = FN_SRC + "\nreturn runChecksReal(document, window, lim || 400);";

/**
 * Fuentes DESNUDAS de las funciones, sin envoltura ni asignación a `window`.
 *
 * Es lo que embebe el artifact: su capa de medición vive ya dentro de su propio
 * IIFE y llama a `runChecksReal(idoc, idoc.defaultView, 60)` directamente, así que
 * necesita las funciones en su ámbito, no escondidas dentro de otra IIFE.
 */
export const MEASURE_FNS = FN_SRC;

/**
 * String inyectable para la extensión de Chrome (o un `<script>`). Va envuelto en
 * una IIFE: los nombres auxiliares (`over`, `lum`, `parseColor`…) son genéricos y
 * sueltos en el global colisionaban con los de la propia página auditada.
 */
export const MEASURE_SRC = "(function(){\n" + FN_SRC +
  "\nwindow.__a11yMeasure = function(limit){ return runChecksReal(document, window, limit||400); };\n})();";

// También exportamos las funciones DOM para pruebas con un DOM simulado si se desea.
export { animacionesPersistentes, distintivoDeEnlace, enTextoCorrido, elementosFlotantes, fraccionTapada, ratioTxt, resolverColor, opacidadAcumulada, ownText, bgBehind, contrastOf, boundaryContrastOf, runChecksReal, renderedM, disabledM, managedM, textTargets, rutaM,
  sinPseudoFoco, coincideSinFoco, reglasDeFoco, pinta };
