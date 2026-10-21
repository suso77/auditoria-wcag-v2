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

/**
 * ¿Hay un Chromium lanzable? Devuelve `{ ok, motivo, launchOptions }` sin lanzar
 * excepción.
 *
 * `launchOptions` SON LAS OPCIONES CON LAS QUE ESTA SONDA LO HA LANZADO, y
 * devolverlas no es comodidad: seis sitios ya las leían como `sonda.launchOptions`
 * y aquí no se devolvían nunca, así que valían `undefined`. Los que la pasaban
 * por `launchOptions(...)` se salvaban por el camino largo; `hojas-externas`
 * lanzaba el navegador con `{}`, ignorando `PW_CHROMIUM`, y quedaba en rojo
 * permanente —apuntado como «el test lanza el navegador sin pasar por este
 * módulo», cuando el defecto estaba en este módulo—. Un rojo permanente es peor
 * que un test de menos: tapa los rojos de verdad del fichero.
 */
export async function chromiumDisponible(opts) {
  const o = launchOptions(opts);
  try {
    const { chromium } = await import("playwright");
    const b = await chromium.launch(o);
    await b.close();
    return { ok: true, motivo: "", launchOptions: o };
  } catch (e) {
    return { ok: false, motivo: (e && e.message) || String(e), launchOptions: o };
  }
}
