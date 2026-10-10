/**
 * Vocabulario ÚNICO de veredictos y su orden de gravedad.
 *
 * Varios módulos (muestreo, export OAW, resumen) agregaban veredictos con su
 * propia tabla `RANK` parcial. Cualquier veredicto ausente de esa tabla caía a 0
 * —es decir, a «cumple»— y acababa exportado como «Correcto» en un IRA. Eso es
 * un error de entregable legal: un criterio que NUNCA se ha evaluado no puede
 * declararse conforme.
 *
 * Aquí está la tabla completa, y `rank()` trata cualquier veredicto DESCONOCIDO
 * como «no se puede comprobar», nunca como conforme. Es la política de fallo
 * seguro: ante la duda, el informe pide revisión humana.
 */

/** Veredictos que produce el agente, de peor a mejor. */
export const VERDICTS = ["falla", "revisar", "humano", "cumple-parcial", "pasa", "cumple", "no-aplica"];

const RANK = {
  falla: 5,            // barrera determinista
  revisar: 4,          // semi-determinable: el motor sospecha, decide una persona
  humano: 3,           // no determinable por máquina: evaluación humana obligatoria
  "cumple-parcial": 2, // la parte automatizable cumple; la calidad exige juicio
  pasa: 1,             // medido sobre render real y correcto
  cumple: 0,           // determinable automáticamente y correcto
  /* «No aplica» NO es conformidad, y tampoco es una duda: es que en esta página
   * no hay nada a lo que el criterio se refiera. Sin vídeo ni audio, 1.2.5 no se
   * cumple ni se incumple — no viene al caso, y el IRA tiene esa casilla.
   *
   * Va por debajo de `cumple` a propósito. Así, en cuanto UNA página de la
   * muestra aporta cualquier otro veredicto, ese otro gana: si una página no
   * tiene vídeo y otra sí, el criterio del sitio es el de la que lo tiene. Un
   * «no aplica» nunca puede tapar un hallazgo de otra página. */
  "no-aplica": -1
};

/** Rango de gravedad. Un veredicto desconocido NUNCA vale como conforme. */
export function rank(v) {
  const r = RANK[v];
  return r == null ? RANK.revisar : r;
}

/** Peor de dos veredictos. `null`/`undefined` se ignoran. */
export function worseOf(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return rank(a) >= rank(b) ? a : b;
}

/** Agrega una lista de veredictos al peor. Lista vacía → null (nada evaluado). */
export function worstOf(list) {
  let w = null;
  (list || []).forEach(function (v) { w = worseOf(w, v); });
  return w;
}

/** ¿Este veredicto permite declarar conformidad? Solo `cumple` y `pasa`. */
export function esConforme(v) {
  return v === "cumple" || v === "pasa";
}

/** ¿El criterio no viene al caso en este ámbito? */
export function esNoAplica(v) {
  return v === "no-aplica";
}

/**
 * ¿Queda sin determinar (necesita persona)?
 *
 * `no-aplica` NO está sin determinar: está decidido, y la decisión es que el
 * criterio no viene al caso. Meterlo en el montón de «pendiente de revisión»
 * inflaría el trabajo del auditor con criterios que no tiene nada que mirar.
 */
export function esIndeterminado(v) {
  return !esConforme(v) && !esNoAplica(v) && v !== "falla";
}

/**
 * Las notas de cobertura ATAN los veredictos de los criterios que limitan.
 *
 * La medición emite notas `__meta` cuando sabe que no ha llegado a mirar todo:
 * un velo a pantalla completa, un shadow DOM cerrado, marcos que se auditan
 * aparte, el límite de bloques de texto, el límite de controles, la ventana sin
 * el foco del sistema, sondas de color sin restaurar. Hasta aquí esas notas
 * viajaban a la lista de `avisos` del informe —prosa al final— y NO tocaban
 * ningún veredicto: 2.4.3 podía salir `pasa` habiendo medido 20 de 500
 * controles, y el aviso que lo decía estaba a cuatro páginas de distancia.
 *
 * La capa de adaptación ya hacía lo correcto con su propio recorte
 * (`informeRecorte` baja a `revisar` cuando `cobertura.truncado`). Esto es la
 * misma política, aplicada a la capa de render: un criterio cuya medición está
 * incompleta no puede declararse conforme. Solo baja; nunca sube, nunca toca un
 * `falla` —una barrera encontrada en la parte medida sigue siendo una barrera—
 * y nunca toca un `no-aplica`, que es una afirmación sobre lo que HAY en la
 * página, no sobre lo que se ha medido en ella.
 *
 * @param {Array<{c:{n:string}, verdict:string, evid?:Array<string>}>} findings
 * @param {Array<{crit?:string, label?:string, detail?:string, limita?:Array<string>}>} coberturas
 * @returns {{findings:Array, atados:Array<{n:string, de:string, por:string}>}}
 */
export function aplicaCoberturas(findings, coberturas) {
  const limites = {};   // criterio → [etiqueta de la nota]
  (coberturas || []).forEach(function (c) {
    (c && c.limita || []).forEach(function (n) {
      (limites[n] = limites[n] || []).push({ label: c.label || "cobertura", detail: c.detail || "" });
    });
  });
  /* «No aplica» es tan afirmación como «cumple», y hasta aquí no la tocaba nadie.
   *
   * El trato con `limita` es por criterio y se afina midiendo, porque atar de más
   * entierra barreras. Pero hay notas que no limitan la medición de unos cuantos
   * criterios: dicen que una PARTE DEL CONTENIDO de la página no se ha podido
   * inventariar —un shadow root cerrado es el caso puro—. Y entonces cualquier
   * «no aplica» de esa página es una afirmación sobre lo que no se vio.
   *
   * Medido: una página con un `<video>` dentro de un shadow root cerrado daba
   * 1.2.5 «no aplica · La página no tiene ningún vídeo ni marco embebido de
   * ninguna clase: no hay nada que audiodescribir» — mientras el propio informe,
   * tres líneas más abajo, decía que había un shadow root cerrado sin explorar.
   * El agente se contradecía a sí mismo en el mismo informe, y la plantilla del
   * IRA se queda con el «No aplica», que es la casilla que cierra el criterio.
   *
   * `ocultaContenido` solo lo pone quien de verdad esconde contenido a TODAS las
   * pasadas. Los marcos no: cada marco se mide en su propia pasada y el cuaderno
   * ya los cuenta como reproductores posibles. */
  const ocultan = (coberturas || []).filter(function (c) { return c && c.ocultaContenido; });
  const atados = [];
  const out = (findings || []).map(function (f) {
    const n = f && f.c && f.c.n;
    const notas = n && limites[n];
    if (notas && esConforme(f.verdict)) {
      atados.push({ n: n, de: f.verdict, por: notas.map(function (x) { return x.label; }).join(" · ") });
      return Object.assign({}, f, {
        verdict: "revisar",
        evid: (f.evid || []).concat(notas.map(function (x) {
          return "La medición de este criterio está INCOMPLETA (" + x.label + "), así que lo medido no basta para declararlo conforme: " + x.detail;
        }))
      });
    }
    if (ocultan.length && f && f.verdict === "no-aplica") {
      atados.push({ n: n, de: "no-aplica", por: ocultan.map(function (x) { return x.label || "cobertura"; }).join(" · ") });
      return Object.assign({}, f, {
        verdict: "revisar",
        evid: (f.evid || []).concat(ocultan.map(function (x) {
          return "Pero parte del contenido de la página NO se ha podido inventariar (" + (x.label || "cobertura") +
            "), así que «no aplica» es una afirmación sobre lo que no se ha visto: " + (x.detail || "");
        }))
      });
    }
    return f;
  });
  return { findings: out, atados: atados };
}
