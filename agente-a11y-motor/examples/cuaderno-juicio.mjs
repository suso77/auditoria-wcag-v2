#!/usr/bin/env node
/**
 * Cuaderno de juicio de una página o de una muestra.
 *
 *   node examples/cuaderno-juicio.mjs https://ejemplo.es/
 *   node examples/cuaderno-juicio.mjs pagina.html
 *   node examples/cuaderno-juicio.mjs https://ejemplo.es/paso-1 https://ejemplo.es/paso-2
 *
 * Con una sola dirección monta el cuaderno de esa página. Con varias monta el de
 * la MUESTRA, que no es lo mismo: un criterio aplica al sitio si aplica en una
 * sola de las páginas, y 3.3.7 se cruza entre ellas para ver el dato que se pide
 * en el paso 1 y otra vez en el paso 3 — que es justo lo que no se ve mirando
 * ninguno de los dos pasos por separado.
 *
 * Deja dos ficheros: el cuaderno en texto (para leerlo o imprimirlo) y el mismo
 * en JSON (para registrar decisiones encima y que entren en el informe).
 *
 * Lo que hace es lo que el agente PUEDE hacer con los once criterios que no
 * dictamina: apartar los que no vienen al caso y montar el expediente de los que
 * sí. Decidir, decide una persona — y con `registrarJuicio` firma.
 */
import { readFile, writeFile } from "fs/promises";
import { DOMParser } from "linkedom";
import { cuadernoDeJuicio, cuadernoDeMuestra, cuadernoTexto, pendientesDeJuicio } from "../src/cuaderno.js";

const destinos = process.argv.slice(2);
if (!destinos.length) {
  console.error("Uso: node examples/cuaderno-juicio.mjs <url | fichero.html> [más urls…]");
  process.exit(2);
}

// El navegador se abre UNA vez para todas las páginas: levantarlo por cada una
// multiplica el tiempo de una muestra de veinte por nada.
let navegador = null;
async function abre() {
  if (navegador) return navegador;
  const { chromium } = await import("playwright");
  const { launchOptions } = await import("../src/playwright-launch.js");
  navegador = await chromium.launch(launchOptions());
  return navegador;
}

async function trae(destino) {
  if (!/^https?:\/\//i.test(destino)) {
    console.log("→ " + destino + " (fichero local: sin CSS externo, 2.3.1 solo ve el <style> en línea)");
    return { html: await readFile(destino, "utf8"), url: null, css: "" };
  }
  const b = await abre();
  const p = await b.newPage();
  try {
    await p.goto(destino, { waitUntil: "load", timeout: 30000 });
    const html = await p.content();
    // El CSS ya resuelto: 2.3.1 lo necesita para ver las animaciones que no
    // están en un <style> en línea.
    const css = await p.evaluate(() => Array.from(document.styleSheets).map((s) => {
      try { return Array.from(s.cssRules).map((r) => r.cssText).join("\n"); } catch (e) { return ""; }
    }).join("\n"));
    console.log("→ " + destino);
    return { html: html, url: destino, css: css };
  } finally {
    await p.close();
  }
}

const cuadernos = [];
try {
  for (const d of destinos) {
    const { html, url, css } = await trae(d);
    const doc = new DOMParser().parseFromString(html, "text/html");
    cuadernos.push(cuadernoDeJuicio(doc, { url: url || d, css: css }));
  }
} catch (e) {
  console.error("✗ No se ha podido cargar alguna página: " + ((e && e.message) || e));
  console.error("  Sin navegador no se puede resolver el CSS, y 2.3.1 se quedaría corto. Aborto.");
  process.exit(1);
} finally {
  if (navegador) await navegador.close();
}

const cuaderno = cuadernos.length > 1 ? cuadernoDeMuestra(cuadernos) : cuadernos[0];
const texto = cuadernoTexto(cuaderno);
await writeFile("cuaderno-juicio.txt", texto + "\n", "utf8");
await writeFile("cuaderno-juicio.json", JSON.stringify(cuaderno, null, 2) + "\n", "utf8");

console.log("\n" + texto);
const r = cuaderno.resumen;
console.log("── " + r.noAplican + " de " + r.total + " criterios de juicio no vienen al caso" +
  (cuadernos.length > 1 ? " en ninguna de las " + cuadernos.length + " páginas." : " aquí."));
console.log("   Quedan " + r.pendientes + " por decidir, con " + r.elementos + " elemento(s) ya localizados.");
pendientesDeJuicio(cuaderno).forEach(function (c) {
  console.log("   · " + c.criterio + " " + c.nombre + " (" + (c.queMirar || []).length + " elemento/s)");
});
console.log("\n   cuaderno-juicio.txt · cuaderno-juicio.json");
console.log("   Para firmar una decisión: registrarJuicio(cuaderno, { criterio, veredicto, motivo, auditor }).");
