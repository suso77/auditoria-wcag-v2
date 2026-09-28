/**
 * Popup de la extensión: orquesta el análisis y presenta el resultado.
 *
 * Dos cosas que solo puede hacer aquí y no en la página:
 *
 *  - **Las capturas.** `chrome.tabs.captureVisibleTab` vive en la extensión, no
 *    en el content script. Se capturan TRES veces el viewport entero —con la
 *    sonda magenta, con la verde y con el texto transparente— y luego se recorta
 *    el rectángulo de cada elemento. Tres capturas para todos los elementos, no
 *    tres por elemento: en la versión de Node era lo segundo.
 *  - **La muestra.** La coherencia entre páginas (3.2.3 / 3.2.4 / 3.2.6 / 2.4.5)
 *    necesita varias páginas. Aquí se van acumulando las huellas de las páginas
 *    que visitas —con tu sesión— y el veredicto sale en cuanto hay dos.
 */
"use strict";

const $ = (s) => document.querySelector(s);
const estado = $("#estado");
let ultimo = null;

function decir(msg) { estado.textContent = msg || ""; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function limpiarHtml(s) { return String(s || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }

async function pestaña() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!t) throw new Error("no hay pestaña activa");
  if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(t.url || "")) {
    throw new Error("esta página del navegador no se puede auditar: prueba en una web normal");
  }
  return t;
}

async function inyectar(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["motor.js", "analizar.js"] });
}
function enPagina(tabId, fn, args) {
  return chrome.scripting.executeScript({ target: { tabId }, func: fn, args: args || [] })
    .then((r) => (r && r[0] ? r[0].result : null));
}

/* ── Contraste por píxeles ───────────────────────────────────────────────── */

async function aImagen(dataUrl) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { canvas: c, ctx, width: bitmap.width, height: bitmap.height };
}
function recortar(img, rect, dpr) {
  const x = Math.round(rect.x * dpr), y = Math.round(rect.y * dpr);
  const w = Math.max(1, Math.round(rect.w * dpr)), h = Math.max(1, Math.round(rect.h * dpr));
  const d = img.ctx.getImageData(x, y, Math.min(w, img.width - x), Math.min(h, img.height - y));
  return { width: d.width, height: d.height, data: d.data };
}

async function medirPixeles(tab) {
  const prep = await enPagina(tab.id, () => window.__a11yAgente.prepararPixeles(12));
  if (!prep || !prep.candidatos.length) return { mediciones: [], avisos: [] };

  const capturar = async (color) => {
    await enPagina(tab.id, (c) => window.__a11yAgente.pintarSondas(c), [color]);
    // Un respiro para que el repintado llegue a la captura.
    await new Promise((r) => setTimeout(r, 60));
    return chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  };

  let sondaA, sondaB, fondo;
  try {
    sondaA = await aImagen(await capturar("rgb(255,0,255)"));
    sondaB = await aImagen(await capturar("rgb(0,255,0)"));
    fondo = await aImagen(await capturar("transparent"));
  } finally {
    // Restaurar SIEMPRE: la página se queda como estaba tras cerrar el popup.
    await enPagina(tab.id, () => window.__a11yAgente.restaurarSondas()).catch(() => {});
  }

  const dpr = prep.dpr || 1;
  const mediciones = prep.candidatos.map((c) => {
    const fg = A11Y.parseColor(c.color);
    if (!fg) return null;
    const r = A11Y.analizarPixeles(
      { sondaA: recortar(sondaA, c.rect, dpr), sondaB: recortar(sondaB, c.rect, dpr), fondo: recortar(fondo, c.rect, dpr) },
      fg,
      { grande: c.size >= 24 || (c.size >= 18.66 && c.weight >= 700), size: c.size, weight: c.weight }
    );
    const fgStr = "rgb(" + Math.round(fg.r) + " " + Math.round(fg.g) + " " + Math.round(fg.b) + ")";
    return {
      c: { n: "1.4.3", t: "Contraste (mínimo)", lvl: "AA" },
      verdict: r.determinado ? r.verdict : "revisar",
      sev: r.determinado && r.verdict === "falla" ? "grave" : null,
      nodes: [{ locator: c.locator, name: c.texto }],
      evid: [c.locator + (c.texto ? " «" + c.texto + "»" : "") + ": " + A11Y.detallePixeles(r, fgStr)],
      scope: "render", origen: "píxeles"
    };
  }).filter(Boolean);

  const avisos = [];
  if (prep.fueraDeVista.length) {
    avisos.push(prep.fueraDeVista.length + " texto(s) sobre degradado o imagen quedan fuera de la parte visible y no se han medido por píxeles (la captura solo alcanza lo que se ve): " + prep.fueraDeVista.slice(0, 4).join(", ") + ". Desplázate y vuelve a analizar.");
  }
  return { mediciones, avisos };
}

/* ── Análisis completo ───────────────────────────────────────────────────── */

async function analizar() {
  $("#analizar").disabled = true;
  decir("Analizando la página…");
  try {
    const tab = await pestaña();
    await inyectar(tab.id);
    const base = await enPagina(tab.id, () => window.__a11yAgente.analizar({ limite: 400 }));
    if (!base) throw new Error("el análisis no devolvió resultados");

    decir("Midiendo el contraste sobre los píxeles…");
    const px = await medirPixeles(tab);

    // Lo resuelto por píxeles sustituye al «no medible» de la medición normal.
    const tratados = new Set(px.mediciones.map((m) => m.nodes[0].locator));
    const findings = base.findings.filter((f) => {
      if (f.c.n !== "1.4.3" || f.verdict !== "revisar") return true;
      if (!/imagen o degradado: no medible autom/.test(f.evid.join(" "))) return true;
      return !tratados.has(String(f.nodes && f.nodes[0] ? f.nodes[0].locator : "").split(" › ").pop());
    }).concat(px.mediciones);

    ultimo = Object.assign({}, base, { findings, avisos: base.avisos.concat(px.avisos) });
    pintar(ultimo);
    await pintarSitio();
    decir("");
  } catch (e) {
    decir("No se pudo analizar: " + (e && e.message ? e.message : e));
  } finally {
    $("#analizar").disabled = false;
  }
}

/* ── Muestra acumulada y criterios de sitio ──────────────────────────────── */

async function huellas() {
  const { huellas } = await chrome.storage.local.get({ huellas: [] });
  return huellas;
}
async function añadirAMuestra() {
  try {
    const tab = await pestaña();
    await inyectar(tab.id);
    const h = ultimo && ultimo.url === tab.url
      ? ultimo.huella
      : await enPagina(tab.id, () => window.A11Y.fingerprintPage(document, location.href, window));
    if (!h) throw new Error("no se pudo tomar la huella");
    const lista = (await huellas()).filter((x) => x.url !== h.url);
    lista.push(h);
    await chrome.storage.local.set({ huellas: lista });
    decir("Muestra: " + lista.length + " página(s).");
    await pintarSitio();
  } catch (e) {
    decir("No se pudo añadir: " + (e && e.message ? e.message : e));
  }
}
async function pintarSitio() {
  const lista = await huellas();
  const sec = $("#sitio");
  if (lista.length < 2) {
    sec.hidden = lista.length === 0;
    if (lista.length === 1) {
      $("#nota-sitio").textContent = "1 página en la muestra. Navega a otra y vuelve a pulsar «Añadir a la muestra»: con dos ya se pueden comparar la navegación, los nombres y la ayuda.";
      $("#lista-sitio").innerHTML = "";
    }
    return;
  }
  const f = A11Y.analyzeCoherence(lista);
  $("#nota-sitio").textContent = lista.length + " páginas en la muestra, comparadas entre sí.";
  $("#lista-sitio").innerHTML = f.map(itemHtml).join("");
  sec.hidden = false;
}

/* ── Presentación ────────────────────────────────────────────────────────── */

function itemHtml(f) {
  const ev = limpiarHtml((f.evid || [])[0] || "");
  return '<li class="item ' + esc(f.verdict) + '"><div class="it-top">' +
    '<span class="cod">' + esc(f.c.n) + "</span><b>" + esc(f.c.t) + "</b>" +
    (f.sev ? '<span class="sev">' + esc(f.sev) + "</span>" : "") +
    "</div>" +
    '<p class="ev">' + esc(ev.slice(0, 300)) + (ev.length > 300 ? "…" : "") + "</p>" +
    (f.origen ? '<span class="orig">' + esc(f.origen) + "</span>" : "") +
    "</li>";
}

function pintar(r) {
  const s = r.resumen;
  $("#cifras").innerHTML =
    '<div class="cifra f"><b>' + s.falla + "</b><span>barreras</span></div>" +
    '<div class="cifra r"><b>' + (s.revisar + s.humano) + "</b><span>a revisar</span></div>" +
    '<div class="cifra c"><b>' + (s.cumple + s.pasa + s["cumple-parcial"]) + "</b><span>cumplen</span></div>" +
    '<div class="cifra"><b>' + s.criterios + "</b><span>criterios</span></div>";
  $("#resumen").hidden = false;

  const fallas = r.findings.filter((f) => f.verdict === "falla");
  $("#lista-barreras").innerHTML = fallas.length
    ? fallas.map(itemHtml).join("")
    : '<li class="item cumple"><p class="ev">Sin barreras deterministas en esta página. No es un aprobado: mira lo que requiere comprobación.</p></li>';
  $("#barreras").hidden = false;

  const pend = r.findings.filter((f) => f.verdict === "revisar");
  $("#lista-pendientes").innerHTML = pend.slice(0, 25).map(itemHtml).join("");
  $("#pendientes").hidden = !pend.length;

  $("#lista-avisos").innerHTML = (r.avisos || []).map((a) => "<li>" + esc(a) + "</li>").join("");
  $("#avisos").hidden = !(r.avisos || []).length;

  $("#csv").disabled = !fallas.length;
}

/* ── Exportación ─────────────────────────────────────────────────────────── */

async function exportar() {
  if (!ultimo) return;
  const conUrl = ultimo.findings.map((f) => Object.assign({ url: ultimo.url }, f));
  const lista = await huellas();
  const todo = lista.length >= 2 ? conUrl.concat(A11Y.analyzeCoherence(lista)) : conUrl;
  const out = A11Y.oawExport(todo, { url: ultimo.url });
  const blob = new Blob([out.csv.barreras], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const nombre = "barreras-" + new URL(ultimo.url).hostname + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  await chrome.downloads.download({ url, filename: nombre }).catch(async () => {
    // Sin permiso de descargas: al menos se deja en el portapapeles.
    await navigator.clipboard.writeText(out.csv.barreras);
    decir("Sin permiso de descarga: el CSV está en el portapapeles.");
  });
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$("#analizar").addEventListener("click", analizar);
$("#muestra").addEventListener("click", añadirAMuestra);
$("#csv").addEventListener("click", exportar);
$("#limpiar").addEventListener("click", async () => {
  await chrome.storage.local.set({ huellas: [] });
  $("#sitio").hidden = true;
  decir("Muestra vaciada.");
});
pintarSitio();
