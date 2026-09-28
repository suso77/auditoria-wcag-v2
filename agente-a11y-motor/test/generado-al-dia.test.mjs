import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Lo generado tiene que estar al día. Y hasta ahora nadie lo comprobaba.
 *
 * `web/agente-a11y.html` y `extension/motor.js` se generan desde `src/`, pero
 * ninguna prueba de `npm test` verificaba que lo que hay en disco corresponda a
 * las fuentes actuales. Bastaba tocar `src/engine.js` y olvidar el build para
 * entregar un artifact o una extensión que dictaminan distinto que la librería —
 * con los 377 tests en verde, porque los tests miran `src/`.
 *
 * La comprobación es la evidente: regenerar y comparar. Se hace sobre una copia
 * del fichero y se restaura siempre, así que ejecutar los tests no cambia nada.
 */

const aqui = dirname(fileURLToPath(import.meta.url));
const ROOT = join(aqui, "..");

function regeneraYCompara(script, destino) {
  const antes = readFileSync(join(ROOT, destino), "utf8");
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", script)], { cwd: ROOT, stdio: "pipe" });
    const despues = readFileSync(join(ROOT, destino), "utf8");
    return { antes, despues, iguales: antes === despues };
  } finally {
    // Pase lo que pase, el fichero del repositorio queda como estaba.
    writeFileSync(join(ROOT, destino), antes, "utf8");
  }
}

function primeraDiferencia(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return "línea " + (i + 1) + "\n  en disco: " + String(la[i]).slice(0, 120) +
        "\n  regenerado: " + String(lb[i]).slice(0, 120);
    }
  }
  return "(mismo contenido, distinta longitud)";
}

test("web/agente-a11y.html está regenerado desde src/", () => {
  const r = regeneraYCompara("build-artifact.mjs", "web/agente-a11y.html");
  assert.ok(r.iguales, "el artifact NO corresponde a las fuentes actuales. Ejecuta `npm run build:artifact`.\n" +
    primeraDiferencia(r.antes, r.despues));
});

test("extension/motor.js está regenerado desde src/", () => {
  const r = regeneraYCompara("build-extension.mjs", "extension/motor.js");
  assert.ok(r.iguales, "el bundle de la extensión NO corresponde a las fuentes actuales. Ejecuta `npm run build:extension`.\n" +
    primeraDiferencia(r.antes, r.despues));
});

test("no queda ninguna copia a mano de la capa de CSV fuera de la región generada", () => {
  // `csvCell` vivía a mano en el artifact, fuera de los marcadores y por tanto de
  // las guardas del build, y ya había divergido: emitía una fila por hallazgo
  // uniendo elementos con " | " donde la librería emite una por elemento.
  const html = readFileSync(join(ROOT, "web", "agente-a11y.html"), "utf8");
  const dentro = html.slice(html.indexOf("/* CSV:START"), html.indexOf("/* CSV:END */"));
  const fuera = html.replace(dentro, "");
  assert.ok(dentro.indexOf("function csvCell") !== -1, "csvCell tiene que estar DENTRO de la región generada");
  assert.equal(fuera.indexOf("function csvCell"), -1, "hay otra csvCell a mano fuera de la región");
  assert.equal(fuera.indexOf("function buildBarrierCSV"), -1, "hay otro buildBarrierCSV a mano fuera de la región");
});

test("los tres pares de marcadores siguen siendo exactamente uno cada uno", () => {
  const html = readFileSync(join(ROOT, "web", "agente-a11y.html"), "utf8");
  const cuenta = (s) => html.split(s).length - 1;
  [["/* ENGINE:START", "/* ENGINE:END */"], ["/* MEASURE:START", "/* MEASURE:END */"], ["/* CSV:START", "/* CSV:END */"]]
    .forEach(([ini, fin]) => {
      assert.equal(cuenta(ini), 1, "marcador repetido o ausente: " + ini);
      assert.equal(cuenta(fin), 1, "marcador repetido o ausente: " + fin);
    });
});

test("los scripts de npm no dependen de que el shell expanda comodines", async () => {
  // `npm test` era `node --test test/*.test.mjs`. Quien expande el `*` es el
  // shell, y npm usa `cmd.exe` en Windows, que no expande nada: Node recibe el
  // patrón tal cual y responde «Could not find 'test/*.test.mjs'». Se vio en la
  // primera ejecución del workflow de NVDA, con las 478 pruebas cayendo en
  // bloque antes de tocar el lector. Node 22 expande el patrón él mismo, así que
  // en local no se notaba: el fallo solo aparecía en el runner.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const conComodin = Object.keys(pkg.scripts || {})
    .filter((k) => /[*?]|\[[^\]]+\]/.test(pkg.scripts[k]))
    .map((k) => k + ": " + pkg.scripts[k]);
  assert.deepEqual(conComodin, [], "estos scripts fallarán en Windows (cmd.exe no expande comodines)");
});

test("toda batería de integración comprueba el navegador ARRANCANDO uno", async () => {
  // Que `playwright` importe no quiere decir que haya un Chromium descargado.
  // Una batería que se guarda con `try { await import("playwright") }` no se
  // salta en esa máquina: se cae, y trece fallos rojos que solo dicen
  // «Executable doesn't exist» tapan los fallos que sí importan.
  const { readdirSync } = await import("node:fs");
  const dir = join(ROOT, "test", "integration");
  const malas = readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).filter((f) => {
    const s = readFileSync(join(dir, f), "utf8");
    if (s.indexOf("chromiumDisponible") !== -1 || s.indexOf("chromium.launch") !== -1) return false;
    // Una batería puede no necesitar navegador (la de VoiceOver, por ejemplo).
    return s.indexOf('import("playwright")') !== -1 || s.indexOf("from \"playwright\"") !== -1;
  });
  assert.deepEqual(malas, [], "estas baterías comprueban el navegador sin arrancarlo");
});

test("el README no promete más cobertura de la que hay", async () => {
  // El número de criterios que nadie mide es el dato que más se cita del motor
  // y el más fácil de dejar obsoleto: se añade una capa, se olvida el README y
  // la documentación empieza a vender cobertura que no existe. Se comprueba
  // contra el motor, no contra una constante escrita al lado.
  const { WCAG22, capaQueMide } = await import("../src/engine.js");
  const huerfanos = WCAG22.filter((c) => c.det !== "auto" && !capaQueMide(c.n));
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const m = readme.match(/\*\*([A-Za-zÁÉÍÓÚáéíóú]+) criterios de evaluación humana\*\*/);
  assert.ok(m, "el README tiene que decir cuántos criterios quedan sin capa");
  const PALABRA = { Cero: 0, Un: 1, Dos: 2, Tres: 3, Cuatro: 4, Cinco: 5, Seis: 6, Siete: 7, Ocho: 8, Nueve: 9, Diez: 10, Once: 11, Doce: 12, Trece: 13, Catorce: 14, Quince: 15, Dieciséis: 16, Diecisiete: 17, Dieciocho: 18, Diecinueve: 19, Veinte: 20 };
  const dicho = PALABRA[m[1]];
  assert.notEqual(dicho, undefined, "número en letra no reconocido: " + m[1]);
  assert.equal(dicho, huerfanos.length,
    "el README dice " + dicho + " y el motor tiene " + huerfanos.length + ": " + huerfanos.map((c) => c.n).join(", "));
  // Y los tiene que nombrar uno a uno: un recuento sin la lista no se puede auditar.
  const pendientes = readme.slice(readme.indexOf("criterios de evaluación humana"));
  huerfanos.forEach((c) => {
    assert.ok(pendientes.indexOf(c.n) !== -1, "el README no menciona el criterio pendiente " + c.n);
  });
});

test("el bundle de la extensión no lleva caracteres que Chrome rechace", () => {
  // Un U+FFFF literal en un rango de `engine.js` hacía que Chrome se negara a
  // inyectar el fichero («It isn't UTF-8 encoded») y la extensión no cargaba.
  const s = readFileSync(join(ROOT, "extension", "motor.js"), "utf8");
  const malos = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i);
    if (c === 0xFFFE || c === 0xFFFF || (c >= 0xFDD0 && c <= 0xFDEF)) {
      malos.push("U+" + c.toString(16).toUpperCase() + " en la línea " + (s.slice(0, i).split("\n").length));
    }
  }
  assert.deepEqual(malos, []);
});
