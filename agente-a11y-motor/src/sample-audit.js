/**
 * Muestreo de sitio (estilo WCAG-EM).
 *
 * Dada una muestra de páginas, agrega los hallazgos por criterio: un criterio
 * "falla" para el sitio si falla en ALGUNA página de la muestra. Produce el
 * veredicto de conformidad agregado y en qué páginas aparece cada problema.
 *
 * `rollupSample(pages)` es puro y testeable. `auditSample(targets, {analyze})`
 * corre un analizador inyectable por página (en real, uno que combine el motor
 * sobre render real + la auditoría de página) y agrega.
 */
import { cmpSC } from "./engine.js";
import { worseOf, esConforme, esNoAplica } from "./verdicts.js";

export function rollupSample(pages) {
  const byCrit = {};
  // Una página sin hallazgos NO es una página sin barreras: casi siempre es una
  // página que no se llegó a analizar (falló la carga, se cayó una capa). Antes
  // las dos se contaban igual y una muestra con dos tercios sin auditar salía
  // «Sin barreras deterministas en la muestra».
  /* Y el «sin hallazgos» es solo el último recurso.
   *
   * Es un indicio, no un dato: sirve cuando el analizador no dice nada más, pero
   * se apaga en cuanto alguien añade hallazgos de SITIO a cada página —la
   * coherencia entre páginas, el cuaderno de la muestra—, porque entonces
   * ninguna lista está vacía y una página muerta pasa por analizada. Eso es lo
   * que hacía `auditSite`: con dos de tres páginas caídas, el rollup decía
   * «3 de 3 analizadas» y la conformidad salía «Requiere revisión manual» en vez
   * de «Incompleta». Quien rellena `pages` puede decirlo explícitamente con
   * `analizada`, y entonces manda eso. */
  const sinAnalizar = (pages || []).filter(function (p) {
    if (!p) return true;
    if (p.error) return true;
    if (p.analizada === false) return true;
    if (p.analizada === true) return false;
    return !(p.findings || []).length;
  }).map(function (p) {
    return { url: (p && p.url) || "(sin url)", error: (p && p.error) || "no se obtuvo ningún hallazgo" };
  });
  (pages || []).forEach(function (p) {
    (p.findings || []).forEach(function (f) {
      const n = f.c.n;
      if (!byCrit[n]) byCrit[n] = { n: n, lvl: f.c.lvl, t: f.c.t, worst: null, enPaginas: {} };
      byCrit[n].worst = worseOf(byCrit[n].worst, f.verdict);
      if (f.verdict !== "cumple" && f.verdict !== "pasa") {
        byCrit[n].enPaginas[f.verdict] = byCrit[n].enPaginas[f.verdict] || [];
        if (byCrit[n].enPaginas[f.verdict].indexOf(p.url) === -1) byCrit[n].enPaginas[f.verdict].push(p.url);
      }
    });
  });
  const criterios = Object.keys(byCrit).map(function (k) { return byCrit[k]; }).sort(function (a, b) { return cmpSC(a.n, b.n); });
  const fallan = criterios.filter(function (c) { return c.worst === "falla"; });
  // «No aplica» es una decisión, no una duda: el criterio no viene al caso en
  // ninguna página de la muestra. Sale de la cuenta de pendientes —si no, el
  // auditor recibe trabajo que no existe— pero tampoco cuenta como conforme.
  const noAplican = criterios.filter(function (c) { return esNoAplica(c.worst); });
  // Todo lo que no falla, no queda fuera de alcance NI está determinado como
  // conforme queda pendiente de persona: `revisar`, `humano`, `cumple-parcial`
  // y cualquier veredicto no reconocido.
  const revisar = criterios.filter(function (c) { return c.worst !== "falla" && !esNoAplica(c.worst) && !esConforme(c.worst); });
  const conformes = criterios.filter(function (c) { return esConforme(c.worst); });
  const conformidad = fallan.length
    ? "No conforme"
    : sinAnalizar.length
      ? "Incompleta: " + sinAnalizar.length + " de " + (pages || []).length + " página(s) de la muestra no se han analizado"
      : (revisar.length ? "Requiere revisión manual" : "Sin barreras deterministas en la muestra");
  return {
    paginas: (pages || []).length,
    paginasAnalizadas: (pages || []).length - sinAnalizar.length,
    sinAnalizar: sinAnalizar,
    criterios: criterios,
    resumen: { fallan: fallan.length, revisar: revisar.length, conformes: conformes.length, noAplican: noAplican.length },
    conformidad: conformidad
  };
}

/**
 * @param {Array<{url?:string, html?:string}>} targets
 * @param {{ analyze:(target)=>Promise<{url:string, findings:Array}>, onPage?:(r)=>void }} opts
 */
export async function auditSample(targets, opts) {
  if (!opts || typeof opts.analyze !== "function") {
    throw new Error("auditSample necesita opts.analyze(target) → { url, findings }");
  }
  const pages = [];
  for (const t of (targets || [])) {
    const r = await opts.analyze(t);
    pages.push(r);
    if (opts.onPage) opts.onPage(r);
  }
  return { pages: pages, rollup: rollupSample(pages) };
}
