#!/usr/bin/env node
/**
 * MEDIR LA CALIDAD DEL INFORME, NO SOLO LOS VEREDICTOS.
 *
 *   node scripts/medir-informe.mjs antes.json [despues.json]
 *
 * Las barreras pueden estar bien encontradas y el informe ser malo de usar, y
 * eso no lo dice ningún veredicto. Esto cuenta las cuatro cosas que se vieron
 * midiendo una auditoría real de diez páginas, cada una con su consecuencia:
 *
 *  · filas sin selector — la guía de capturas resalta el elemento POR selector,
 *    así que una barrera sin él no puede llevar evidencia visual, y el cotejo
 *    entre dos pasadas tampoco la puede seguir. Eran 62 de 522.
 *  · filas indistinguibles — mismo criterio, misma página, mismo elemento y
 *    mismo párrafo que otra fila: quien lee una no sabe cuál es la suya. Eran
 *    320 de 522.
 *  · avisos de CSS ilegible — cada uno limita 2.3.1, 1.3.4, 1.4.1 y 2.4.7, que
 *    entonces no pueden declararse conformes. Eran 20.
 *  · barreras distinguibles — cuántas filas tienen identidad propia
 *    (criterio + página + selector). Si es menor que el número de filas, el
 *    cotejo elemento a elemento está ciego en la diferencia.
 *
 * Con dos ficheros compara las dos pasadas, que es como se comprueba que un
 * arreglo ha servido de algo en el sitio de verdad y no solo en un test.
 */
import { readFile } from "node:fs/promises";

const ADAPTACION = ["1.4.4", "1.4.10", "1.4.12"];

const mide = async function (f) {
  let j;
  try { j = JSON.parse(await readFile(f, "utf8")); }
  catch (e) {
    console.error("✕ No puedo leer " + f + ": " + ((e && e.message) || e));
    process.exit(2);
  }
  if (!Array.isArray(j.barreras)) {
    console.error("✕ " + f + " no parece un informe del agente: no trae la lista `barreras`.");
    process.exit(2);
  }
  const B = j.barreras;
  const sinSel = B.filter(function (b) { return !String(b.selector || "").trim(); });
  const porFila = {};
  B.forEach(function (b) {
    const k = [b.criterio, b.pagina, b.elemento || "", b.evidencia || ""].join("|");
    porFila[k] = (porFila[k] || 0) + 1;
  });
  const indistinguibles = Object.keys(porFila).reduce(function (a, k) {
    return a + (porFila[k] > 1 ? porFila[k] - 1 : 0);
  }, 0);
  const avisos = (j.avisos || []).filter(function (a) {
    return /ilegible|otro origen/i.test(JSON.stringify(a));
  }).length;
  const identidad = function (b) {
    return [b.criterio, b.pagina, String(b.selector || "").trim() || String(b.elemento || "").trim()].join("|");
  };
  /* Y cuántas FAMILIAS hay detrás de esas filas: mismo criterio, misma página,
   * misma medida. Es el número de barreras de verdad, frente al de instancias. */
  const familia = function (b) { return [b.criterio, b.pagina, b.evidencia || ""].join("|"); };
  return {
    filas: B.length,
    familias: new Set(B.map(familia)).size,
    sinSelector: sinSel.length,
    sinSelectorEnAdaptacion: sinSel.filter(function (b) { return ADAPTACION.indexOf(b.criterio) !== -1; }).length,
    filasIndistinguibles: indistinguibles,
    avisosDeCssIlegible: avisos,
    barrerasDistinguibles: new Set(B.map(identidad)).size
  };
};

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Uso: node scripts/medir-informe.mjs antes.json [despues.json]");
  process.exit(2);
}
const A = await mide(args[0]);
const B = args[1] ? await mide(args[1]) : null;
console.log("".padEnd(28) + "   ANTES" + (B ? "  DESPUÉS" : ""));
Object.keys(A).forEach(function (k) {
  console.log("  " + (k + ":").padEnd(28) + String(A[k]).padStart(6) + (B ? String(B[k]).padStart(8) : ""));
});
if (B) {
  /* Solo son «peor» las que tienen una dirección mala clara. `filas` y
   * `familias` no la tienen —más familias puede ser que la evidencia distinga
   * mejor, que es justo lo que se buscaba— y `barrerasDistinguibles` sube
   * cuando mejora. Avisar de un cambio neutro es el mismo error que un aviso
   * que salta donde no hay nada: enseña a no leerlos. */
  const MALO_SI_SUBE = ["sinSelector", "sinSelectorEnAdaptacion", "filasIndistinguibles", "avisosDeCssIlegible"];
  const peor = MALO_SI_SUBE.filter(function (k) { return B[k] > A[k]; });
  if (peor.length) console.log("\n⚠ Ha EMPEORADO en: " + peor.join(", "));
  if (B.barrerasDistinguibles < A.barrerasDistinguibles) console.log("\n⚠ Hay menos barreras distinguibles que antes.");
}
