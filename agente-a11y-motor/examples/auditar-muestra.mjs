/**
 * Auditoría de una muestra DADA: las URLs las pone quien audita, no el rastreo.
 *
 *   node examples/auditar-muestra.mjs muestra.txt
 *   node examples/auditar-muestra.mjs --salida informe-e123 muestra.txt
 *   node examples/auditar-muestra.mjs https://a.es/ https://a.es/contacto
 *
 * `auditar-sitio.mjs` rastrea y elige la muestra con WCAG-EM, y eso es lo correcto
 * cuando la muestra hay que justificarla. Pero muchas veces la muestra ya está
 * decidida —viene en el pliego, la fijó el cliente, o es la misma de una auditoría
 * anterior para poder comparar— y entonces lo que hace falta es auditar EXACTAMENTE
 * esas páginas, sin que nadie las sustituya por otras.
 *
 * Corren todas las capas: motor sobre el DOM ejecutado, auditoría de página,
 * medición sobre el render real, píxeles, adaptación del contenido, prueba dinámica,
 * axe-core como segunda fuente, criterios de sitio y cuaderno de juicio.
 *
 * El fichero de muestra es una URL por línea; las líneas vacías y las que empiezan
 * por `#` se ignoran, y las URLs repetidas se auditan UNA vez (auditar dos veces la
 * misma página no añade cobertura y sí infla el recuento de barreras).
 *
 * Requiere Chromium de Playwright (o PW_CHROMIUM apuntando a uno ya instalado).
 */
import { readFile, writeFile } from "fs/promises";
import { auditSite, oawExport, cuadernoTexto, pendientesDeJuicio } from "../src/index.js";
import { chromiumDisponible } from "../src/playwright-launch.js";

const args = process.argv.slice(2);
const flag = function (n, def) { const i = args.indexOf("--" + n); return i !== -1 ? args[i + 1] : def; };
const sinDinamico = args.includes("--sin-dinamico");
const prefijo = flag("salida", "auditoria");

/* De dónde salen las URLs: de un fichero o de la línea de órdenes. */
const sueltas = args.filter(function (a) { return /^https?:\/\//.test(a); });
const fichero = args.find(function (a) { return !/^https?:\/\//.test(a) && !a.startsWith("--") && args.indexOf(a) !== args.indexOf(flag("salida", "\u0000")); });
let urls = sueltas;
if (!urls.length && fichero) {
  const txt = await readFile(fichero, "utf8");
  urls = txt.split("\n").map(function (l) { return l.trim(); })
    .filter(function (l) { return l && !l.startsWith("#"); });
}
if (!urls.length) {
  console.error("Uso: node examples/auditar-muestra.mjs [--salida PREFIJO] [--sin-dinamico] <muestra.txt | url…>");
  process.exit(2);
}

/* Repetidas fuera, y se dice. Una muestra con la portada dos veces no cubre once
 * páginas: cubre diez, y el recuento de barreras saldría inflado. */
const vistas = new Set();
const muestra = [];
const repetidas = [];
urls.forEach(function (u) {
  const clave = u.replace(/#.*$/, "").replace(/\/$/, "/");
  if (vistas.has(clave)) { repetidas.push(u); return; }
  vistas.add(clave);
  muestra.push(u);
});

console.log("\n── MUESTRA ──");
muestra.forEach(function (u, i) { console.log("  " + String(i + 1).padStart(2) + ". " + u); });
if (repetidas.length) {
  console.log("\n  ⚠ " + repetidas.length + " URL(s) repetida(s) en la lista, se auditan una vez: " + repetidas.join(", "));
}

/* El navegador se comprueba UNA vez, antes de empezar.
 *
 * Sin esto, una instalación sin Chromium falla en cada página y estampa el mismo
 * error de Playwright tantas veces como páginas tenga la muestra —diez paredes de
 * texto idénticas— y encima el informe sale con los 55 subcriterios «No evaluado»,
 * que es correcto pero no explica nada. Una muestra sin navegador no es una
 * auditoría incompleta: es una auditoría que no ha empezado, y eso se dice antes
 * de gastar diez arranques. */
const nav = await chromiumDisponible();
if (!nav.ok) {
  console.error("\n✗ No hay un Chromium lanzable, así que no se puede auditar nada.");
  console.error("  " + String(nav.motivo).split("\n")[0]);
  console.error("\n  Instálalo:      npx playwright install chromium");
  console.error("  O apunta a uno: PW_CHROMIUM=/ruta/al/chromium node examples/auditar-muestra.mjs …");
  console.error("\n  No se escribe ningún entregable: un informe de cero páginas no es un informe.\n");
  process.exit(2);
}

const t0 = Date.now();
console.error("\nAuditando " + muestra.length + " página(s). Cada una abre un navegador y corre todas las capas; esto tarda.\n");

const sitio = await auditSite(muestra.map(function (u) { return { url: u }; }), {
  waitMs: 500,
  capas: { render: true, viewport: true, axe: true, dynamic: !sinDinamico },
  onPage: function (r) {
    const fallan = (r.findings || []).filter(function (f) { return f.verdict === "falla"; }).length;
    process.stderr.write("  · " + (r.error ? "✗ " : "") + r.url + " — " +
      (r.error ? "NO SE PUDO AUDITAR: " + r.error : fallan + " barrera(s)") + "\n");
  }
});

const out = oawExport(sitio.findings, { muestra: sitio.rollup });
await writeFile(prefijo + "-barreras.csv", out.csv.barreras, "utf8");
await writeFile(prefijo + "-seguimiento.csv", out.csv.seguimiento, "utf8");
if (sitio.cuaderno) await writeFile(prefijo + "-cuaderno.txt", cuadernoTexto(sitio.cuaderno), "utf8");

/* El JSON lleva TODO, y es el que permite comparar dos ejecuciones o contrastar
 * con un informe hecho a mano: por criterio, qué veredicto y en qué páginas. */
await writeFile(prefijo + ".json", JSON.stringify({
  muestra: muestra,
  repetidasEnLaLista: repetidas,
  procedencia: sitio.procedencia,
  rollup: sitio.rollup,
  coherencia: sitio.coherencia,
  cuaderno: sitio.cuaderno,
  paginasFallidas: sitio.paginasFallidas,
  errores: sitio.errores,
  avisos: sitio.avisos,
  barreras: out.barreras,
  seguimiento: out.seguimiento,
  fueraDeEN: out.fueraDeEN,
  // Por página: el resumen y los criterios que fallan, para poder ir al detalle.
  porPagina: (sitio.paginas || []).map(function (p) {
    return {
      url: p.url, error: p.error || null, summary: p.summary || null,
      fallan: (p.findings || []).filter(function (f) { return f.verdict === "falla"; })
        .map(function (f) {
          return { criterio: f.c.n, nivel: f.c.lvl, sev: f.sev, origen: f.origen || f.scope,
            evid: (f.evid || []).slice(0, 3),
            elementos: (f.nodes || []).slice(0, 12).map(function (n) { return n.path || n.locator; }) };
        }),
      /* La evidencia ENTERA, no solo la primera línea.
       *
       * Guardaba `evid[0]` y punto, y varias capas ponen en la segunda y la tercera
       * línea justo lo que permite cerrar el criterio: el arreglo concreto, lo que
       * queda fuera de la medición, o que un temporizador largo sale de una etiqueta
       * de analítica y se puede descartar. Nada de eso llegaba al JSON, así que el
       * dato existía en el motor y no en el informe. */
      revisar: (p.findings || []).filter(function (f) { return f.verdict === "revisar" || f.verdict === "cumple-parcial"; })
        .map(function (f) { return { criterio: f.c.n, veredicto: f.verdict, evid: (f.evid || []).slice(0, 4) }; })
    };
  })
}, null, 2), "utf8");

/* ── Lo que se ve en la consola ───────────────────────────────────────────── */

console.log("\n── CONFORMIDAD ──");
console.log("  " + sitio.rollup.conformidad.toUpperCase());
console.log("  " + sitio.rollup.paginasAnalizadas + " de " + sitio.rollup.paginas + " página(s) analizadas");
console.log("  " + sitio.rollup.resumen.fallan + " criterios fallan · " + sitio.rollup.resumen.revisar +
  " sin determinar · " + sitio.rollup.resumen.conformes + " conformes · " + sitio.rollup.resumen.noAplican + " no aplican");

const fallan = sitio.rollup.criterios.filter(function (c) { return c.worst === "falla"; });
if (fallan.length) {
  console.log("\n── CRITERIOS QUE FALLAN ──");
  fallan.forEach(function (c) {
    const paginas = Object.keys(c.enPaginas).reduce(function (a, k) { return a.concat(c.enPaginas[k]); }, []);
    const filas = out.barreras.filter(function (b) { return b.criterio === c.n; }).length;
    console.log("  " + c.n.padEnd(7) + c.lvl.padEnd(3) + filas + " fila(s) · " +
      new Set(paginas).size + " página(s) · " + c.t);
  });
}

const revisar = sitio.rollup.criterios.filter(function (c) {
  return c.worst !== "falla" && c.worst !== "cumple" && c.worst !== "pasa" && c.worst !== "no-aplica";
});
if (revisar.length) {
  console.log("\n── SIN DETERMINAR (necesitan a una persona) ──");
  console.log("  " + revisar.map(function (c) { return c.n; }).join(", "));
}

if (sitio.cuaderno) {
  const p = pendientesDeJuicio(sitio.cuaderno);
  console.log("\n── CUADERNO DE JUICIO ──");
  console.log("  " + sitio.cuaderno.resumen.noAplican + " no aplican · " + p.length + " pendientes de decidir");
  if (p.length) console.log("  " + p.map(function (c) { return c.criterio; }).join(", "));
}

if (sitio.paginasFallidas.length) {
  console.log("\n── PÁGINAS QUE NO SE PUDIERON AUDITAR ──");
  sitio.paginasFallidas.forEach(function (f) { console.log("  ✗ " + f.url + " — " + f.error); });
}

const avisos = (sitio.avisos || []);
if (avisos.length) {
  console.log("\n── LO QUE EL AGENTE DICE QUE NO HA COMPROBADO ──");
  avisos.slice(0, 25).forEach(function (a) { console.log("  ⚠ " + String(a).replace(/\s+/g, " ").slice(0, 200)); });
  if (avisos.length > 25) console.log("  … y " + (avisos.length - 25) + " aviso(s) más (están en el JSON)");
}

console.log("\n✓ Entregables:");
console.log("  " + prefijo + "-barreras.csv     — " + out.barreras.length + " fila(s), una por elemento afectado");
console.log("  " + prefijo + "-seguimiento.csv  — " + out.seguimiento.length + " subcriterio(s) EN con resultado agregado");
if (sitio.cuaderno) console.log("  " + prefijo + "-cuaderno.txt     — el expediente de los once criterios de juicio");
console.log("  " + prefijo + ".json            — todo junto, por criterio y por página");
console.log("\n  " + Math.round((Date.now() - t0) / 1000) + " s\n");
