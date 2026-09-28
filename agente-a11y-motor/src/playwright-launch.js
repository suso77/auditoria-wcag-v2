/**
 * Opciones de lanzamiento de Chromium, unificadas.
 *
 * Cada driver (axe, render real, prueba dinámica) hacía `chromium.launch(opts)`
 * por su cuenta, así que `PW_CHROMIUM` —la variable que apunta a un Chromium ya
 * instalado— funcionaba en unos sitios y en otros no, y las pruebas se saltaban
 * en silencio creyendo que no había navegador. Ahora hay un solo sitio donde se
 * decide.
 */
export function launchOptions(opts) {
  const o = Object.assign({}, opts || {});
  const env = (typeof process !== "undefined" && process.env) ? process.env : {};
  if (!o.executablePath && env.PW_CHROMIUM) o.executablePath = env.PW_CHROMIUM;
  return o;
}

/** ¿Hay un Chromium lanzable? Devuelve `{ ok, motivo }` sin lanzar excepción. */
export async function chromiumDisponible(opts) {
  try {
    const { chromium } = await import("playwright");
    const b = await chromium.launch(launchOptions(opts));
    await b.close();
    return { ok: true, motivo: "" };
  } catch (e) {
    return { ok: false, motivo: (e && e.message) || String(e) };
  }
}
