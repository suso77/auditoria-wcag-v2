import { test } from "node:test";
import assert from "node:assert/strict";
import { launchOptions, chromiumDisponible } from "../src/playwright-launch.js";

/**
 * Un solo sitio decide cómo se lanza Chromium. Este módulo existe porque cada
 * driver lo lanzaba por su cuenta y `PW_CHROMIUM` funcionaba en unos sitios y en
 * otros no: las pruebas se saltaban en silencio creyendo que no había navegador.
 */

test("launchOptions respeta PW_CHROMIUM y no pisa lo que ya venía puesto", () => {
  const antes = process.env.PW_CHROMIUM;
  try {
    process.env.PW_CHROMIUM = "/opt/chromium/chrome";
    assert.equal(launchOptions({}).executablePath, "/opt/chromium/chrome");
    assert.equal(launchOptions().executablePath, "/opt/chromium/chrome");
    assert.equal(launchOptions({ executablePath: "/otro/chrome" }).executablePath, "/otro/chrome",
      "lo que pide quien llama manda sobre la variable de entorno");
    delete process.env.PW_CHROMIUM;
    assert.equal(launchOptions({}).executablePath, undefined);
  } finally {
    if (antes == null) delete process.env.PW_CHROMIUM; else process.env.PW_CHROMIUM = antes;
  }
});

test("launchOptions no muta el objeto que recibe", () => {
  const antes = process.env.PW_CHROMIUM;
  try {
    process.env.PW_CHROMIUM = "/opt/chromium/chrome";
    const mio = { args: ["--no-sandbox"] };
    launchOptions(mio);
    assert.equal(mio.executablePath, undefined, "quien llama no esperaba que le tocaran su objeto");
  } finally {
    if (antes == null) delete process.env.PW_CHROMIUM; else process.env.PW_CHROMIUM = antes;
  }
});

/**
 * LA SONDA DEVUELVE LAS OPCIONES CON LAS QUE HA LANZADO.
 *
 * Seis sitios las leían como `sonda.launchOptions` y aquí no se devolvían:
 * valían `undefined`. Los que las pasaban por `launchOptions(...)` se salvaban
 * por el camino largo; `test/integration/hojas-externas.test.mjs` lanzaba el
 * navegador con `{}`, ignorando `PW_CHROMIUM`, y quedaba en rojo permanente. Lo
 * teníamos apuntado como «ese test lanza el navegador sin pasar por este
 * módulo», y el defecto estaba en este módulo. Un rojo permanente es peor que un
 * test de menos: tapa los rojos de verdad del fichero en el que está.
 */
test("chromiumDisponible devuelve las opciones que ha usado", async () => {
  const antes = process.env.PW_CHROMIUM;
  process.env.PW_CHROMIUM = "/ruta/que/no/existe/chrome";
  try {
    const s = await chromiumDisponible();
    assert.ok(s.launchOptions, "tiene que devolver las opciones, salga ok o no");
    assert.equal(s.launchOptions.executablePath, "/ruta/que/no/existe/chrome");
    assert.equal(s.ok, false, "con una ruta inventada no puede decir que sí");
    assert.ok(s.motivo, "y tiene que decir por qué");
  } finally {
    if (antes == null) delete process.env.PW_CHROMIUM; else process.env.PW_CHROMIUM = antes;
  }
});
