/**
 * Lo que corre DENTRO de la página que se audita.
 *
 * Se inyecta junto a `motor.js` (generado desde src/) y expone unas pocas
 * funciones que el popup invoca. Todo lo que dictamina sale del mismo núcleo que
 * usan el CLI y el artifact: aquí no hay reglas propias.
 *
 * ── Lo que la extensión SÍ puede hacer y un navegador sin sesión no ─────────
 * Audita la página **real**, con la sesión iniciada, el JavaScript ejecutado y
 * la SPA renderizada. Eso es justamente lo que no alcanza un rastreador externo:
 * el área privada, el paso 3 de un formulario, el estado después de filtrar.
 *
 * ── Lo que NO puede, y por qué se dice ─────────────────────────────────────
 * Una extensión no puede cambiar el tamaño del viewport, así que **1.4.10
 * Reflujo no se mide aquí**: estrechar `documentElement` no reevalúa las media
 * queries, y dar por bueno ese sucedáneo sería mentir. Se declara como no
 * cubierto en vez de dar un número que no significa nada.
 */
(function () {
  "use strict";
  if (window.__a11yAgente) return;   // ya inyectado: no duplicar estado

  const NS = window.A11Y;
  const estado = { sondas: [], previos: new Map(), temporizador: null };

  function locator(el) {
    const t = el.tagName.toLowerCase();
    if (el.id) return t + "#" + el.id;
    const c = (el.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)[0];
    return c ? t + "." + c : t;
  }
  function uid(el) {
    const p = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const t = n.tagName.toLowerCase();
      if (t === "html" || t === "body") break;
      const pa = n.parentElement;
      if (!pa) { p.unshift(t); break; }
      let i = 1, s = pa.firstElementChild;
      while (s && s !== n) { if (s.tagName === n.tagName) i++; s = s.nextElementSibling; }
      p.unshift(t + ":nth-of-type(" + i + ")");
      n = pa;
    }
    return p.length ? "html > body > " + p.join(" > ") : "body";
  }
  function textoPropio(el) {
    let s = "";
    const k = el.childNodes || [];
    for (let i = 0; i < k.length; i++) if (k[i].nodeType === 3) s += k[i].nodeValue || "";
    return s.replace(/\s+/g, " ").trim();
  }
  function pintado(el) {
    if (!el.getClientRects || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity || "1") > 0;
  }

  /* ── Análisis principal ─────────────────────────────────────────────────── */

  function analizar(opts) {
    opts = opts || {};
    const aviso = [];
    const findings = [];

    // 1) Motor semántico sobre el DOM YA RENDERIZADO (post-JS, con sesión).
    let modelo = null, analisis = null;
    try {
      modelo = NS.understand(document.body ? document.body.innerHTML : "");
      analisis = modelo ? NS.analyze(modelo) : null;
      if (analisis) analisis.findings.forEach(function (f) { findings.push(f); });
    } catch (e) { aviso.push("El motor semántico falló: " + (e && e.message)); }

    // 2) Ámbito de página.
    try {
      NS.auditPageDoc(document).forEach(function (f) { findings.push(f); });
    } catch (e) { aviso.push("La auditoría de página falló: " + (e && e.message)); }

    // 3) Medición sobre estilos y layout reales.
    let mediciones = [];
    try {
      mediciones = NS.runChecksReal(document, window, opts.limite || 400);
      mediciones.filter(function (m) { return m.crit !== "__meta"; }).forEach(function (m) {
        findings.push({
          c: { n: m.crit, t: m.label, lvl: "AA" },
          verdict: m.verdict,
          sev: m.verdict === "falla" ? (m.crit === "2.1.1" ? "crítica" : "grave") : null,
          nodes: [{ locator: m.node, name: "" }],
          evid: [m.node + ": " + m.detail],
          scope: "render", origen: "medición"
        });
      });
      mediciones.filter(function (m) { return m.crit === "__meta"; }).forEach(function (m) { aviso.push(m.detail); });
    } catch (e) { aviso.push("La medición falló: " + (e && e.message)); }

    // 4) Adaptación del contenido, en lo que una extensión puede hacer de verdad.
    try {
      Array.prototype.push.apply(findings, adaptacion());
    } catch (e) { aviso.push("La prueba de adaptación falló: " + (e && e.message)); }
    aviso.push("1.4.10 Reflujo no se comprueba desde la extensión: cambiar el ancho del documento no reevalúa las media queries, y un sucedáneo daría un número sin significado. Úsalo con el modo responsive del navegador o con la auditoría desde Node.");

    const cuenta = {};
    findings.forEach(function (f) { cuenta[f.verdict] = (cuenta[f.verdict] || 0) + 1; });

    return {
      url: location.href,
      titulo: document.title,
      findings: findings,
      huella: NS.fingerprintPage(document, location.href, window),
      avisos: aviso,
      resumen: {
        falla: cuenta.falla || 0, revisar: cuenta.revisar || 0, humano: cuenta.humano || 0,
        "cumple-parcial": cuenta["cumple-parcial"] || 0, pasa: cuenta.pasa || 0, cumple: cuenta.cumple || 0,
        criterios: new Set(findings.map(function (f) { return f.c.n; })).size
      },
      procedencia: {
        fecha: new Date().toISOString(),
        objetivo: location.href,
        agente: "extensión de Chrome",
        navegador: navigator.userAgent,
        viewport: window.innerWidth + "×" + window.innerHeight + " (dpr " + (window.devicePixelRatio || 1) + ")",
        nota: "Medido sobre la página real con la sesión del usuario; 1.4.10 fuera de alcance en la extensión."
      }
    };
  }

  /* ── 1.4.4 y 1.4.12: aplicar el cambio y medir qué se rompe ─────────────── */

  function cajas(max) {
    const out = [], vistos = new Set();
    const todos = document.body ? document.body.querySelectorAll("*") : [];
    for (let i = 0; i < todos.length && out.length < max; i++) {
      const el = todos[i];
      if (!textoPropio(el) || !pintado(el)) continue;
      // El contenedor que recorta primero: es quien produce el hallazgo útil.
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (cs.overflowY === "hidden" || cs.overflowY === "clip" || cs.overflowX === "hidden" || cs.overflowX === "clip") {
          if (!vistos.has(p)) { vistos.add(p); out.push(p); }
          break;
        }
        p = p.parentElement;
      }
      if (!vistos.has(el)) { vistos.add(el); out.push(el); }
    }
    return out;
  }
  function instantanea(els) {
    return els.map(function (el) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const ocultoY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      const ocultoX = cs.overflowX === "hidden" || cs.overflowX === "clip";
      return {
        uid: uid(el), locator: locator(el),
        sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth,
        ocultoY: ocultoY, ocultoX: ocultoX,
        recortado: (ocultoY && el.scrollHeight > el.clientHeight + 2) || (ocultoX && el.scrollWidth > el.clientWidth + 2),
        top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right)
      };
    });
  }
  function diff(antes, despues) {
    const A = {};
    antes.forEach(function (c) { A[c.uid] = c; });
    const recortados = [], previos = [];
    const detalle = function (d) {
      const exY = d.sh - d.ch, exX = d.sw - d.cw;
      return (d.ocultoY && exY > 2 ? exY + " px de alto ocultos" : "") +
        (d.ocultoX && exX > 2 ? (d.ocultoY && exY > 2 ? "; " : "") + exX + " px de ancho ocultos" : "");
    };
    despues.forEach(function (d) {
      const a = A[d.uid];
      if (!a || !d.recortado) return;
      (a.recortado ? previos : recortados).push({ locator: d.locator, detalle: detalle(a.recortado ? a : d) });
    });
    return { aplicado: true, revisados: antes.length, recortados: recortados, solapados: [], previos: previos };
  }
  function conEstilo(css, fn) {
    const s = document.createElement("style");
    s.id = "__a11y-agente-tmp";
    s.textContent = css;
    document.head.appendChild(s);
    try { return fn(); } finally { s.remove(); }
  }
  function adaptacion() {
    const els = cajas(300);
    const antes = instantanea(els);
    const resize = conEstilo("html { font-size: 200% !important; }", function () { return instantanea(els); });
    const espaciado = conEstilo(
      "*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }" +
      "p, li, dd, blockquote { margin-block-end: 2em !important; }",
      function () { return instantanea(els); });

    const titles = Array.prototype.slice.call(document.querySelectorAll("[title]"))
      .filter(function (el) {
        const t = el.tagName.toLowerCase();
        return t !== "iframe" && t !== "frame" && pintado(el) && (el.getAttribute("title") || "").trim();
      })
      .slice(0, 40)
      .map(function (el) { return { locator: locator(el), texto: (el.getAttribute("title") || "").trim() }; });

    const guion = Array.prototype.slice.call(document.querySelectorAll("script:not([src])"))
      .map(function (s) { return s.textContent || ""; }).join("");

    return [].concat(
      NS.analyzeResize(diff(antes, resize)),
      NS.analyzeTextSpacing(diff(antes, espaciado)),
      NS.analyzeHoverContent({ titles: titles, hovers: [] }),
      NS.analyzeOrientation({
        bloqueoJS: /screen\s*\.\s*orientation\s*\.\s*lock\s*\(|lockOrientation\s*\(/.test(guion),
        mediaBloqueante: []
      })
    );
  }

  /* ── Contraste por píxeles: preparar, pintar sondas, restaurar ──────────── */

  function fondoNoMedible(el) {
    let p = el;
    while (p && p.nodeType === 1) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
      const m = (cs.backgroundColor || "").match(/rgba?\(([^)]+)\)/);
      if (m) {
        const parts = m[1].replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
        const a = parts[3] == null ? 1 : parseFloat(parts[3]);
        if (a >= 1) return false;
      }
      p = p.parentElement;
    }
    return false;
  }

  /**
   * Candidatos a medir por píxeles. Solo los que están DENTRO del viewport: la
   * captura de la extensión es de lo visible, y recortar un rectángulo que no se
   * ve daría píxeles de otra cosa. Los de fuera se cuentan y se dicen.
   */
  function prepararPixeles(max) {
    const cand = [], fuera = [];
    const todos = document.body ? document.body.querySelectorAll("*") : [];
    for (let i = 0; i < todos.length && cand.length < (max || 12); i++) {
      const el = todos[i];
      if (!textoPropio(el) || !pintado(el) || !fondoNoMedible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) { fuera.push(locator(el)); continue; }
      const cs = getComputedStyle(el);
      cand.push({
        uid: uid(el), locator: locator(el), color: cs.color,
        size: parseFloat(cs.fontSize) || 16, weight: parseInt(cs.fontWeight, 10) || 400,
        texto: textoPropio(el).slice(0, 40),
        rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(r.width, window.innerWidth - r.left), h: Math.min(r.height, window.innerHeight - r.top) }
      });
    }
    estado.sondas = cand;
    return { candidatos: cand, fueraDeVista: fuera, dpr: window.devicePixelRatio || 1 };
  }

  function pintarSondas(color) {
    estado.sondas.forEach(function (c) {
      const el = document.querySelector(c.uid);
      if (!el) return;
      // La clave es el ELEMENTO. Antes era el selector `nth-of-type`, y basta un
      // carrusel, un lazy-load o un re-render entre el pintado y la restauración
      // para que esa ruta apunte a otro nodo: se restauraba el equivocado y el
      // bueno se quedaba pintado de magenta —o transparente— en la web del
      // cliente, con su sesión iniciada.
      if (!estado.previos.has(el)) {
        estado.previos.set(el, {
          color: el.style.getPropertyValue("color"),
          prioridad: el.style.getPropertyPriority("color"),
          relleno: el.style.getPropertyValue("-webkit-text-fill-color"),
          sombra: el.style.getPropertyValue("text-shadow")
        });
      }
      el.style.setProperty("color", color, "important");
      // -webkit-text-fill-color pisa a color en Chromium: sin esto, el repintado
      // no tiene efecto donde el sitio lo use.
      el.style.setProperty("-webkit-text-fill-color", color, "important");
      el.style.setProperty("text-shadow", "none", "important");
      el.setAttribute("data-a11y-prev", "1");
    });
    /* Red de seguridad.
     *
     * Un popup de MV3 muere en cuanto pierde el foco (Esc, un clic fuera, cambiar
     * de pestaña), y con él las promesas pendientes: el `finally` que restauraba
     * no llegaba a ejecutarse y la página del cliente se quedaba con el texto
     * pintado de magenta — o, si el cierre caía en la tercera captura, con el
     * texto TRANSPARENTE, invisible en su propia web.
     *
     * Esto vive en la PÁGINA, no en el popup, así que sobrevive a su muerte. Se
     * re-arma en cada pintado: mientras el popup siga trabajando, nunca salta.
     */
    if (estado.temporizador) clearTimeout(estado.temporizador);
    estado.temporizador = setTimeout(function () { try { restaurarSondas(); } catch (e) {} }, 8000);
    return estado.sondas.length;
  }

  function restaurarSondas() {
    if (estado.temporizador) { clearTimeout(estado.temporizador); estado.temporizador = null; }
    estado.previos.forEach(function (p, el) {
      if (!el || !el.style) return;
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("text-shadow");
      if (p.color) el.style.setProperty("color", p.color, p.prioridad || "");
      if (p.relleno) el.style.setProperty("-webkit-text-fill-color", p.relleno);
      if (p.sombra) el.style.setProperty("text-shadow", p.sombra);
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    estado.previos.clear();
    // Barrido de seguridad: cualquier nodo que quedara marcado y no esté en el
    // mapa (otra pasada, un clon del DOM) se limpia igualmente.
    Array.prototype.forEach.call(document.querySelectorAll("[data-a11y-prev]"), function (el) {
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("text-shadow");
      el.removeAttribute("data-a11y-prev");
      if (!el.getAttribute("style")) el.removeAttribute("style");
    });
    return true;
  }

  window.__a11yAgente = {
    version: "0.19.3",
    analizar: analizar,
    prepararPixeles: prepararPixeles,
    pintarSondas: pintarSondas,
    restaurarSondas: restaurarSondas
  };
})();
