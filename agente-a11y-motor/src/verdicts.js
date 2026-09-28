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
