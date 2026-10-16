import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs"; // inyecta el DOMParser en el motor
import {
  compareAnnouncement, verifyWithScreenReader, bridge, apagarLector,
  normalize, spokenHasRole, stripReaderNoise
} from "../src/index.js";

test("normalize: minúsculas sin acentos", () => {
  assert.equal(normalize("Botón  ENVIAR"), "boton enviar");
});

test("spokenHasRole: reconoce el rol en ES y EN", () => {
  assert.ok(spokenHasRole("Cerrar, botón", "button"));
  assert.ok(spokenHasRole("link Saltar al contenido", "link"));
  assert.ok(spokenHasRole("Correo, área de texto", "textbox"));
  assert.ok(!spokenHasRole("Cerrar, botón", "link"));
});

test("stripReaderNoise: recorta ayudas y estado de VoiceOver", () => {
  const s = "link Saltar al contenido. Estás en un elemento de tipo link, dentro del contenido web. Para hacer clic en este enlace, pulsa Control-Opción-Espacio.";
  const c = stripReaderNoise(s);
  assert.ok(/Saltar al contenido/.test(c));
  assert.ok(!/Estás en un elemento/.test(c));
});

test("compareAnnouncement: nombre + rol presentes → confirmado", () => {
  const r = compareAnnouncement({ name: "Cerrar", role: "button" }, "Cerrar, botón");
  assert.equal(r.verdict, "confirmado");
  assert.equal(r.nameFound, true);
  assert.equal(r.roleFound, true);
});

test("compareAnnouncement: frase real de VoiceOver (enlace)", () => {
  const spoken = "link Saltar al contenido. Estás en un elemento de tipo link, dentro del contenido web.";
  const r = compareAnnouncement({ name: "Saltar al contenido", role: "link" }, spoken);
  assert.equal(r.verdict, "confirmado");
});

test("compareAnnouncement: control sin nombre y el lector solo dice el rol → barrera confirmada", () => {
  const r = compareAnnouncement({ name: "", role: "button" }, "botón");
  assert.equal(r.verdict, "barrera-confirmada");
});

test("compareAnnouncement: motor previó sin nombre pero el lector sí nombra → divergente", () => {
  const r = compareAnnouncement({ name: "", role: "button" }, "Cerrar, botón");
  assert.equal(r.verdict, "divergente");
});

test("compareAnnouncement: el lector dice otro nombre → divergente", () => {
  const r = compareAnnouncement({ name: "Guardar", role: "button" }, "Enviar, botón");
  assert.equal(r.verdict, "divergente");
});

test("compareAnnouncement: nombre sí, rol no reconocible → parcial", () => {
  const r = compareAnnouncement({ name: "Perfil", role: "tab" }, "Perfil");
  assert.equal(r.verdict, "parcial");
});

// Lector simulado con el API de @guidepup/guidepup (next / lastSpokenPhrase)
function mockVO(phrases) {
  let i = -1;
  return {
    next: async () => { i++; },
    lastSpokenPhrase: async () => (i < phrases.length ? phrases[i] : "")
  };
}

test("verifyWithScreenReader: recorre y captura frases únicas", async () => {
  const vo = mockVO(["Enviar, botón", "Enviar, botón", "Cerrar, botón", ""]);
  const out = await verifyWithScreenReader({ voiceOver: vo, steps: 4, sleepMs: 0 });
  assert.equal(out.length, 2); // deduplica la repetida y descarta la vacía
  assert.match(out[0].spoken, /Enviar/);
  assert.match(out[1].spoken, /Cerrar/);
});

test("bridge: alinea nodos previstos con las frases reales y dictamina", async () => {
  const html = '<button>Enviar formulario</button><button aria-label="Cerrar"></button>';
  const capture = async () => [
    { spoken: "Enviar formulario, botón" },
    { spoken: "Cerrar, botón" }
  ];
  const out = await bridge(html, { capture });
  assert.equal(out.results.length, 2);
  assert.ok(out.results.every((r) => r.verdict === "confirmado"));
  assert.equal(out.summary.confirmado, 2);
});

test("bridge: un icono sin nombre que el lector solo lee como «botón» → barrera confirmada", async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>';
  const capture = async () => [{ spoken: "botón" }];
  const out = await bridge(html, { capture });
  assert.ok(out.results.some((r) => r.verdict === "barrera-confirmada"));
});

test("bridge: exige un capture", async () => {
  await assert.rejects(() => bridge("<button>x</button>", {}), /capture/);
});

test("un nodo que el lector no visitó dice CUÁL es", async () => {
  // El veredicto `no-encontrado` salía sin `locator`, y en el informe aparecía
  // como «no-encontrado undefined»: sabías que algo no se verificó, pero no
  // qué. Visto en una ejecución real de NVDA en CI, con los cuatro nodos así.
  const html = '<button aria-label="Cerrar"></button><a href="/x">Inicio</a>';
  const out = await bridge(html, { capture: async () => [] });
  assert.equal(out.results.length, 2);
  assert.ok(out.results.every((r) => r.verdict === "no-encontrado"));
  assert.deepEqual(out.results.map((r) => r.locator).filter(Boolean).length, 2,
    "los dos tienen que llevar su locator: " + JSON.stringify(out.results.map((r) => r.locator)));
});

test("el emparejamiento no casa «al» con «real»: palabra entera, no subcadena", async () => {
  // Visto en la primera sesión real de NVDA que leyó la página: el enlace
  // «Saltar al contenido» salió emparejado con «main landmark, heading, level
  // 1, Verificación con lector real», porque «al» está dentro de «real».
  const html = '<a href="#c">Saltar al contenido</a><h1>Verificación con lector real</h1>';
  const out = await bridge(html, {
    capture: async () => [{ step: 0, spoken: "main landmark, heading, level 1, Verificación con lector real" }]
  });
  const enlace = out.results.find((r) => r.locator === "a");
  assert.equal(enlace.verdict, "no-encontrado",
    "el enlace no debería casar con el encabezado: " + JSON.stringify(enlace.spoken));
  const h = out.results.find((r) => r.locator === "h1");
  assert.equal(h.verdict, "confirmado", "y el encabezado sí, que es de quien es la frase");
});

test("rescata del registro del lector lo que el bucle se dejó", async () => {
  // Preguntar «¿qué acabas de decir?» tras cada paso pierde frases cuando el
  // lector dice dos cosas seguidas. El registro completo las trae todas.
  const dicho = ["Enviar formulario button", "Saltar al contenido link"];
  const vo = {
    next: async () => {},
    lastSpokenPhrase: async () => "Saltar al contenido link",  // el bucle solo ve la última
    spokenPhraseLog: async () => dicho
  };
  const out = await verifyWithScreenReader({ voiceOver: vo, steps: 2, sleepMs: 0 });
  const frases = out.map((p) => p.spoken);
  assert.ok(frases.some((f) => /Enviar formulario/.test(f)), "falta la que se perdió: " + JSON.stringify(frases));
  assert.equal(frases.filter((f) => /Saltar al contenido/.test(f)).length, 1, "y sin duplicar la que sí vio");
});

test("el botón sin nombre NO se queda con la frase del botón que sí lo tiene", async () => {
  // El caso exacto del componente de prueba contra NVDA: dos botones, uno sin
  // nombre accesible. Las dos frases puntúan por el rol, y emparejando nodo a
  // nodo por orden el primero (el mudo) se llevaba «button, Enviar formulario».
  // Resultado: un 4.1.2 real absuelto porque «el lector sí pronuncia un nombre».
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button><button>Enviar formulario</button>';
  const out = await bridge(html, {
    lector: "nvda",
    capture: async () => [
      { step: 0, spoken: "button" },
      { step: 1, spoken: "button, Enviar formulario" }
    ]
  });
  assert.equal(out.summary["barrera-confirmada"], 1, JSON.stringify(out.results.map((r) => [r.verdict, r.spoken])));
  assert.equal(out.summary.confirmado, 1);
});

test("y da igual el orden en que el lector las diga", async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button><button>Enviar formulario</button>';
  const out = await bridge(html, {
    lector: "nvda",
    capture: async () => [
      { step: 0, spoken: "button, Enviar formulario" },
      { step: 1, spoken: "button" }
    ]
  });
  assert.equal(out.summary["barrera-confirmada"], 1, JSON.stringify(out.results.map((r) => [r.verdict, r.spoken])));
  assert.equal(out.summary.confirmado, 1);
});

test("el recorrido completo del componente de prueba, con NVDA en inglés", async () => {
  // Las frases son las que NVDA dijo de verdad en el runner, ya separadas por
  // paso: es lo que debería salir al vaciar el registro antes del recorrido.
  const html = [
    '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>',
    "<button>Enviar formulario</button>",
    '<a href="#contenido">Saltar al contenido</a>',
    '<main id="contenido"><h1>Verificación con lector real</h1><p>Fin del recorrido.</p></main>'
  ].join("\n");
  const out = await bridge(html, {
    lector: "nvda",
    capture: async () => [
      { step: 0, spoken: "button" },
      { step: 1, spoken: "button, Enviar formulario" },
      { step: 2, spoken: "same page, link, Saltar al contenido" },
      { step: 3, spoken: "main landmark, heading, level 1, Verificación con lector real" },
      { step: 4, spoken: "Fin del recorrido." }
    ]
  });
  const porLoc = {};
  out.results.forEach((r) => { porLoc[r.locator] = r.verdict; });
  assert.equal(out.summary["barrera-confirmada"], 1, "el botón de icono sin nombre: " + JSON.stringify(porLoc));
  assert.equal(out.summary.confirmado, 3, "los otros tres: " + JSON.stringify(porLoc));
  assert.equal(out.summary["no-encontrado"], 0);
});

/* ── Regresión: el nombre se compara por PALABRA, no por subcadena ──────────
 *
 * El arreglo por palabra completa se hizo en `alignPredictedToSpoken` y no se
 * trajo a `compareAnnouncement`, que seguía usando `indexOf` sobre las cadenas
 * normalizadas. Así, «Ver» casaba dentro de «Verificar mis datos» y el puente
 * devolvía `confirmado` con la nota «el lector anuncia el nombre y el rol
 * previstos» sobre un elemento que el lector anuncia con OTRO nombre.
 *
 * Es el peor error posible en este módulo: no un fallo de detección, sino una
 * evidencia falsa escrita por nosotros. El puente existe para que un 4.1.2 deje
 * de ser una hipótesis; si confirma lo que no ha comprobado, no sirve para nada.
 */
test("regresión: un nombre que es prefijo de otra palabra NO se da por confirmado", () => {
  [["Ver", "botón, Verificar mis datos", "button"],
   ["Ir", "enlace, Iribarren", "link"],
   ["Alta", "botón, Altavoz", "button"],
   ["Envío", "botón, Envíos internacionales pendientes", "button"]
  ].forEach(([name, spoken, role]) => {
    const r = compareAnnouncement({ name, role }, spoken, "voiceover");
    assert.equal(r.verdict, "divergente", "«" + name + "» dentro de «" + spoken + "» no es el mismo nombre");
    assert.equal(r.nameFound, false);
  });
});

test("y el nombre que sí está, como secuencia de palabras, sigue confirmándose", () => {
  [["Ver", "botón, Ver", "button"],
   ["Ver más", "botón, Ver más tarde", "button"],
   ["Ir a", "enlace, Ir a", "link"],
   ["Enviar formulario", "button, Enviar formulario", "button"],
   ["Envíos", "botón, Envíos internacionales", "button"]
  ].forEach(([name, spoken, role]) => {
    const r = compareAnnouncement({ name, role }, spoken, "voiceover");
    assert.equal(r.verdict, "confirmado", "«" + name + "» sí está en «" + spoken + "»");
  });
});

test("regresión: un nodo SIN nombre no se queda con el nombre del vecino", async () => {
  /* El emparejamiento descartaba los tokens de dos letras por no distinguir, y con
   * eso un nombre hecho solo de palabras cortas —«Ir a»— no puntuaba por nombre.
   * Empataba con el nodo sin nombre (los dos puntúan solo por el rol) y el
   * desempate por orden se la llevaba el que NO tiene nombre: el enlace-imagen sin
   * `alt` salía nombrado «Ir a», y su 4.1.2 como «posible falso positivo del
   * motor». La absolución exacta que este emparejamiento existe para impedir. */
  const html = '<div><a href="/x"><img src="i.png"></a></div>\n<div><a href="/y">Ir a</a></div>';
  const out = await bridge(html, {
    lector: "voiceover",
    capture: async () => [{ step: 0, spoken: "enlace, Ir a" }, { step: 1, spoken: "enlace" }]
  });
  const sinNombre = out.results.find((r) => !r.predicted.name);
  const conNombre = out.results.find((r) => r.predicted.name === "Ir a");
  assert.equal(sinNombre.spoken, "enlace", "la frase sin nombre es la que le toca");
  assert.equal(sinNombre.verdict, "barrera-confirmada");
  assert.equal(conNombre.spoken, "enlace, Ir a");
  assert.equal(conNombre.verdict, "confirmado");
  assert.equal(out.summary["barrera-confirmada"], 1);
  assert.equal(out.summary.divergente, 0);
});

/* ── Regresión: el léxico de estado se comía nombres y absolvía barreras ─────
 *
 * Tres fallos del mismo módulo, los tres reproducidos antes de tocar nada.
 */

test("regresión: un nombre que coincide con una palabra de estado se confirma igual", () => {
  /* El nombre previsto se buscaba en la frase ya RECORTADA, y el recorte quita
   * estados y posiciones —«nivel 2», «3 de 10», «marcado», «requerido»—, que no se
   * pueden distinguir de un nombre que diga lo mismo. Un enlace llamado «Nivel 2»
   * salía `divergente` porque el filtro se comía justo su nombre.
   *
   * Aquí la ambigüedad SÍ se puede resolver, porque el motor dice qué nombre espera. */
  [["Nivel 2", "enlace, Nivel 2", "link"],
   ["Página 3 de 10", "enlace, Página 3 de 10", "link"],
   ["Texto marcado como leído", "encabezado, Texto marcado como leído", "heading"],
   ["Requerido para continuar", "botón, Requerido para continuar", "button"],
   ["Fila 4 del listado", "enlace, Fila 4 del listado", "link"]
  ].forEach(([name, spoken, role]) => {
    const r = compareAnnouncement({ name, role }, spoken, "nvda");
    assert.equal(r.verdict, "confirmado", "«" + name + "» está en «" + spoken + "» y salió " + r.verdict);
  });
});

test("regresión: las palabras de estado se recortan para los DOS lectores", () => {
  /* Estaban solo en la lista de NVDA, y `stripReaderNoise` aplica una sola lista
   * cuando se le pasa el lector. Con `lector: "voiceover"` —que es lo que hacen los
   * adaptadores reales— sobrevivían, y con ese residuo un control SIN nombre dejaba
   * de ser `barrera-confirmada` y pasaba a «divergente: el lector sí pronuncia un
   * nombre… revisar posible falso positivo»: un 4.1.2 real degradado a sospecha de
   * falso positivo nuestro, por una palabra que no es un nombre. */
  [["botón, contraído", "button"], ["casilla, marcada", "checkbox"], ["enlace, visitado", "link"],
   ["botón, pulsado", "button"], ["botón, atenuado", "button"], ["casilla, no marcada", "checkbox"]
  ].forEach(([spoken, role]) => {
    ["voiceover", "nvda", undefined].forEach((lector) => {
      const r = compareAnnouncement({ name: "", role }, spoken, lector);
      assert.equal(r.verdict, "barrera-confirmada",
        "«" + spoken + "» con lector=" + lector + " → " + r.verdict + " (" + r.note + ")");
    });
  });
});

test("regresión: la deduplicación de frases no borra elementos distintos", async () => {
  /* La clave era la frase RECORTADA, así que dos elementos cuya diferencia estaba
   * justo en lo que el filtro borra quedaban con la misma clave y el segundo se
   * descartaba en silencio; su nodo acababa `no-encontrado`, o sea sin verificar,
   * por un artefacto del recorte. */
  const frases = ["casilla, Recibir novedades, no marcada", "casilla, Recibir novedades, marcada",
                  "enlace, Descargar informe, visitado", "enlace, Descargar informe"];
  let i = 0;
  const out = await verifyWithScreenReader({
    voiceOver: { next: async () => {}, lastSpokenPhrase: async () => frases[i++] || "" },
    steps: frases.length, sleepMs: 0
  });
  assert.equal(out.length, 4, "las cuatro frases son de elementos distintos: " + JSON.stringify(out.map((x) => x.spoken)));
  // Y lo que sí es repetición literal se sigue deduplicando.
  let j = 0;
  const repes = ["botón, Enviar", "botón, Enviar", "botón, Enviar"];
  const out2 = await verifyWithScreenReader({
    voiceOver: { next: async () => {}, lastSpokenPhrase: async () => repes[j++] || "" },
    steps: 3, sleepMs: 0
  });
  assert.equal(out2.length, 1, "el recorrido quieto sigue colapsando");
});

/* ── El recorrido y el apagado (v0.64.0) ─────────────────────────────────────
 *
 * Los dos defectos reportados desde la primera sesión real de VoiceOver en este
 * Mac: «se conecta pero no lee la página entera ni se apaga». Y el tercero, que
 * era mío de antes: lo que se guardaba como «transcripción en bruto» era la lista
 * ya deduplicada, o sea ni en bruto ni una transcripción.
 */

/** Lector simulado que se queda QUIETO al llegar al final, como VoiceOver. */
function mockVOFinito(phrases) {
  let i = -1;
  return {
    next: async () => { i++; },
    // Pasado el último elemento, el cursor no avanza: repite la última frase.
    lastSpokenPhrase: async () => phrases[Math.min(i, phrases.length - 1)] || ""
  };
}

test("recorrido: se para al final de la página, no a los quince pasos", async () => {
  /* Veinte elementos y un techo de 400: antes se leían los primeros 12/14/15 y
   * el resto salía `no-encontrado`, que en este puente significa «sin verificar».
   * Un tope escondido dejaba filas sin confirmar por el tope y no por la página. */
  const veinte = Array.from({ length: 20 }, (_, k) => "elemento " + (k + 1) + ", botón");
  const detalle = {};
  const out = await verifyWithScreenReader({ voiceOver: mockVOFinito(veinte), sleepMs: 0, detalle: detalle });
  assert.equal(out.length, 20, "tiene que capturar los veinte: " + JSON.stringify(out.map((p) => p.spoken)));
  assert.ok(detalle.pasos >= 20 && detalle.pasos <= 24, "pasos: " + detalle.pasos);
  assert.equal(detalle.completo, true);
  assert.match(detalle.motivoFin, /dejó de avanzar/);
});

test("recorrido: si se agota el techo, la lectura se declara INCOMPLETA", async () => {
  /* La regla de oro, aplicada al lector: lo que no se leyó no está verificado, y
   * no verificado no es correcto. */
  const muchos = Array.from({ length: 50 }, (_, k) => "elemento " + (k + 1));
  const detalle = {};
  await verifyWithScreenReader({ voiceOver: mockVOFinito(muchos), steps: 10, sleepMs: 0, detalle: detalle });
  assert.equal(detalle.completo, false);
  assert.match(detalle.motivoFin, /se agotó el techo de 10 pasos SIN llegar al final/);
});

test("recorrido: dos elementos que suenan IGUAL no son el final de la página", async () => {
  /* La parada mira la repetición CONSECUTIVA y no el duplicado global, porque dos
   * botones sin nombre dicen «botón» los dos y eso no es haber llegado al final.
   * Con el duplicado global, el recorrido se habría cortado en el segundo. */
  const conGemelos = ["botón", "botón", "Enviar, botón", "Cerrar, botón", "final"];
  const detalle = {};
  const out = await verifyWithScreenReader({ voiceOver: mockVOFinito(conGemelos), sleepMs: 0, detalle: detalle });
  // La transcripción en bruto los tiene los dos; la lista única, uno.
  const brutas = detalle.transcripcion.map((t) => t.spoken);
  assert.equal(brutas.filter((x) => x === "botón").length >= 2, true, JSON.stringify(brutas));
  assert.ok(out.some((p) => p.spoken === "Enviar, botón"), "no llegó al tercero: " + JSON.stringify(out));
  assert.ok(out.some((p) => p.spoken === "final"), "no llegó al final: " + JSON.stringify(out));
});

test("transcripción: en bruto, en orden y CON repeticiones", async () => {
  const detalle = {};
  await verifyWithScreenReader({ voiceOver: mockVOFinito(["uno", "uno", "dos"]), sleepMs: 0, detalle: detalle });
  const brutas = detalle.transcripcion.map((t) => t.spoken);
  assert.deepEqual(brutas.slice(0, 3), ["uno", "uno", "dos"]);
  // Y los pasos van numerados en orden, que es lo que la hace una transcripción.
  assert.deepEqual(detalle.transcripcion.slice(0, 3).map((t) => t.paso), [0, 1, 2]);
});

/* ── La escalera de apagado ───────────────────────────────────────────────── */

/** Ejecutor simulado: dice si VoiceOver sigue vivo y apunta lo que se le pide. */
function mockEjec(guion) {
  const hechos = [];
  return {
    hechos,
    ejec: async (cmd) => {
      hechos.push(cmd);
      if (/pgrep/.test(cmd)) return { stdout: guion.vivo() ? "1234\n" : "" };
      if (guion.falla && guion.falla.test(cmd)) throw new Error("no se pudo");
      guion.aplica(cmd);
      return { stdout: "" };
    }
  };
}

test("apagado: si `stop()` ya lo apaga, no se toca nada más", async () => {
  let vivo = true;
  const m = mockEjec({ vivo: () => vivo, aplica: () => {} });
  const r = await apagarLector({ stop: async () => { vivo = false; } }, m.ejec);
  assert.equal(r.vivo, false);
  assert.equal(r.aviso, null);
  assert.equal(m.hechos.filter((c) => /osascript|killall/.test(c)).length, 0, JSON.stringify(m.hechos));
});

test("apagado: si `stop()` falla, no se traga el error y sigue bajando la escalera", async () => {
  /* El defecto exacto: el `catch` estaba vacío, así que un `stop()` que fallara
   * dejaba VoiceOver hablando en la máquina y el programa decía que todo bien. */
  let vivo = true;
  const m = mockEjec({ vivo: () => vivo, aplica: (cmd) => { if (/quit/.test(cmd)) vivo = false; } });
  const r = await apagarLector({ stop: async () => { throw new Error("API rota"); } }, m.ejec);
  assert.equal(r.vivo, false);
  assert.equal(r.pasos[0].ok, false);
  assert.match(r.pasos[0].error, /API rota/);
  assert.ok(m.hechos.some((c) => /osascript/.test(c)), JSON.stringify(m.hechos));
});

test("apagado: si ni AppleScript lo cierra, se llega a `killall`", async () => {
  let vivo = true;
  const m = mockEjec({ vivo: () => vivo, falla: /osascript/, aplica: (cmd) => { if (/killall/.test(cmd)) vivo = false; } });
  const r = await apagarLector({ stop: async () => {} }, m.ejec);
  assert.equal(r.vivo, false);
  assert.deepEqual(r.pasos.map((x) => x.via), ["guidepup.stop()", "osascript quit", "killall"]);
});

test("apagado: si sigue vivo, se DICE, con la tecla para apagarlo a mano", async () => {
  const m = mockEjec({ vivo: () => true, aplica: () => {} });
  const r = await apagarLector({ stop: async () => {} }, m.ejec);
  assert.equal(r.vivo, true);
  assert.match(r.aviso, /SIGUE ENCENDIDO/);
  assert.match(r.aviso, /Cmd\+F5/);
});

test("apagado: no poder comprobarlo NO es haberlo apagado", async () => {
  /* `pgrep` que revienta: la respuesta honesta es «no lo sé», no «apagado». */
  const r = await apagarLector({ stop: async () => {} }, async () => { throw new Error("sin shell"); });
  assert.equal(r.vivo, null);
  assert.match(r.aviso, /No he podido comprobar/);
  assert.match(r.aviso, /Cmd\+F5/);
});
