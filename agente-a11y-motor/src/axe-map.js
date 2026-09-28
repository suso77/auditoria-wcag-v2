/**
 * Mapeo de resultados de axe-core a criterios WCAG.
 *
 * axe etiqueta cada regla con tags del tipo `wcag412`, `wcag143`, `wcag1410`…
 * de los que se deriva el número de criterio sin necesidad de una tabla manual.
 * Los tags de nivel (`wcag2a`, `wcag2aa`, `wcag21aa`…) y de categoría se ignoran.
 */

// "wcag412" → "4.1.2" · "wcag1410" → "1.4.10" · "wcag2a" → null (nivel, no criterio)
export function scFromAxeTag(tag) {
  const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  if (!m) return null;
  return m[1] + "." + m[2] + "." + m[3];
}

// Todos los criterios WCAG referenciados por los tags de una regla de axe.
export function scFromAxeTags(tags) {
  const out = [];
  (tags || []).forEach(function (t) {
    const sc = scFromAxeTag(t);
    if (sc && out.indexOf(sc) === -1) out.push(sc);
  });
  return out;
}

/**
 * Indexa las violaciones de axe por criterio WCAG.
 * Devuelve un Map: SC → { sc, rules: [{ id, impact, help, sc, nodes }] }.
 */
export function axeViolationsBySC(violations) {
  const bySC = new Map();
  (violations || []).forEach(function (v) {
    const scs = scFromAxeTags(v.tags);
    scs.forEach(function (sc) {
      if (!bySC.has(sc)) bySC.set(sc, { sc: sc, rules: [] });
      bySC.get(sc).rules.push({
        id: v.id,
        impact: v.impact || null,
        help: v.help || "",
        sc: sc,
        nodes: (v.nodes || []).length
      });
    });
  });
  return bySC;
}
