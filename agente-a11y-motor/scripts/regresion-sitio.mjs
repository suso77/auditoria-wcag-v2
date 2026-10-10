#!/usr/bin/env node
/**
 * ANCLA DE REGRESIÓN DEL ENTREGABLE COMPLETO.
 *
 * Ninguna suite de unidades responde a la pregunta que de verdad importa:
 * *¿sigue saliendo el mismo informe?* Cada refactor de los últimos meses se ha
 * comprobado a mano, ejecutando la auditoría de un sitio de prueba y contando
 * barreras y subcriterios con un ojo puesto en la consola. Eso se olvida, y lo
 * que se olvida no protege nada. Esto lo deja fijo:
 *
 *   node scripts/regresion-sitio.mjs <carpeta-del-sitio> [--esperadas N]
 *
 * Levanta el sitio en un puerto libre, lo audita entero con todas las capas y
 * escribe tres números que no deben moverse sin que alguien lo decida:
 *
 *   1. BARRERAS: cuántas hay y en qué criterios.
 *   2. SUBCRITERIOS CON VEREDICTO: cuántos de los 55 tienen algo dicho. Un
 *      subcriterio sin veredicto es un «No evaluado» en el informe, y en un
 *      informe el silencio y la conformidad se parecen demasiado.
 *   3. CONFORMIDAD DECLARADA: lo que diría el IRA.
 *
 * Con `--esperadas N` sale con código 1 si el número de barreras cambió, que es
 * lo que hace falta para meterlo en CI.
 */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromiumDisponible, launchOptions } from "../src/playwright-launch.js";
import { auditSite } from "../src/audit-run.js";
import { WCAG22 } from "../src/engine.js";

const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json" };

const args = process.argv.slice(2);
const carpeta = resolve(args.find((a) => !a.startsWith("-")) || "../sitio2");
const iEsp = args.indexOf("--esperadas");
const esperadas = iEsp !== -1 ? Number(args[iEsp + 1]) : null;

const sonda = await chromiumDisponible();
if (!sonda.ok) {
  console.error("Sin navegador: " + sonda.motivo);
  process.exit(2);
}

const server = createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url || "/").split("?")[0]);
  const fichero = join(carpeta, ruta === "/" ? "/index.html" : ruta);
  try {
    const buf = await readFile(fichero);
    res.writeHead(200, { "content-type": TIPOS[extname(fichero).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  } catch (e) { res.writeHead(404); res.end("no"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port + "/";

const paginas = (await readdir(carpeta)).filter((f) => f.toLowerCase().endsWith(".html")).sort();
console.log("Sitio: " + carpeta + "\nPáginas: " + paginas.length + " (" + paginas.join(", ") + ")\n");

try {
  /* `auditSite`, no `auditRun` por página: los criterios de SITIO —la coherencia
     entre páginas (2.4.5, 3.2.3, 3.2.4, 3.2.6) y el cuaderno de juicio (2.1.4,
     2.2.2, 4.1.3)— solo existen cruzando la muestra. Midiendo página a página
     esos siete salían «sin veredicto» y el número de cobertura mentía por abajo. */
  const r = await auditSite(paginas.map((p) => ({ url: base + p })), {
    waitMs: 150,
    onPage: (p) => {
      const f = (p.findings || []).filter((x) => x.verdict === "falla").length;
      console.log("  " + (p.error ? "✕" : "·") + " " + String(p.url || "").replace(base, "") +
        (p.error ? "  NO AUDITADA: " + p.error : "  " + f + " barrera(s), " + p.findings.length + " criterios"));
    }
  });

  const todos = r.findings;
  const fallas = todos.filter((f) => f.verdict === "falla");
  const porCrit = {};
  fallas.forEach((f) => { const n = f.c && f.c.n; if (n) porCrit[n] = (porCrit[n] || 0) + 1; });
  const conVeredicto = new Set(todos.filter((f) => f.c && f.c.n && f.verdict).map((f) => f.c.n));
  const todosLosCrit = WCAG22.map((c) => c.n);
  const sinVeredicto = todosLosCrit.filter((n) => !conVeredicto.has(n));

  console.log("\n── BARRERAS ──");
  console.log(Object.keys(porCrit).length + " criterio(s) con barrera, " + fallas.length + " hallazgo(s) en total:");
  Object.keys(porCrit).sort().forEach((n) => console.log("   " + n + "  ×" + porCrit[n]));

  console.log("\n── COBERTURA ──");
  console.log(conVeredicto.size + " de " + todosLosCrit.length + " subcriterios con veredicto.");
  if (sinVeredicto.length) console.log("   SIN VEREDICTO (saldrían «No evaluado»): " + sinVeredicto.join(", "));
  else console.log("   Ninguno queda en silencio.");

  console.log("\n── CONFORMIDAD ──");
  console.log("   " + (r.rollup.conformidad || "(sin dictamen)"));
  if (r.paginasFallidas && r.paginasFallidas.length) {
    console.log("   " + r.paginasFallidas.length + " página(s) sin auditar — la muestra está incompleta.");
  }
  if (r.avisos && r.avisos.length) {
    console.log("\n── AVISOS (" + r.avisos.length + ") ──");
    r.avisos.slice(0, 12).forEach((a) => console.log("   · " + String(a).slice(0, 220)));
    if (r.avisos.length > 12) console.log("   … y " + (r.avisos.length - 12) + " más");
  }

  if (esperadas != null && Object.keys(porCrit).length !== esperadas) {
    console.error("\n✕ REGRESIÓN: se esperaban " + esperadas + " criterios con barrera y hay " + Object.keys(porCrit).length + ".");
    process.exitCode = 1;
  } else if (esperadas != null) {
    console.log("\n✓ " + esperadas + " criterios con barrera, como se esperaba.");
  }
} finally {
  await new Promise((r) => server.close(r));
}
