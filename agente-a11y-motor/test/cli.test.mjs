import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, "..", "bin", "a11y-motor.mjs");

function run(args, stdin) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [BIN, ...args], (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
    if (stdin != null) { child.stdin.write(stdin); child.stdin.end(); }
  });
}

test("CLI: informe legible desde stdin y salida 1 con barreras", async () => {
  const r = await run([], '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>');
  assert.equal(r.code, 1); // hay barreras
  assert.match(r.stdout, /4\.1\.2/);
  assert.match(r.stdout, /barrera/i);
});

test("CLI: --json emite un informe estructurado", async () => {
  const r = await run(["--json"], '<div class="btn" onclick="x()">Enviar</div>');
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.summary.falla >= 1);
  assert.ok(Array.isArray(parsed.barreras) && parsed.barreras.length >= 1);
  assert.ok(parsed.barreras[0].criterio);
});

test("CLI: salida 0 cuando no hay barreras", async () => {
  const r = await run([], '<button type="button" aria-label="Cerrar">x</button>');
  assert.equal(r.code, 0);
});

test("CLI: fragmento sin elemento analizable → salida 2", async () => {
  const r = await run([], "<span>hola</span>");
  assert.equal(r.code, 2);
});

/* Los códigos de salida de abajo salen de un accidente: al reconstruir la copia
 * de trabajo en el contenedor olvidé meter `bin/` en el tarball, así que el CLI
 * no existía y los cuatro tests de arriba corrieron contra un
 * MODULE_NOT_FOUND. Tres se pusieron rojos. El primero NO: su `assert.equal(
 * r.code, 1)` pasó, porque Node sale con 1 ante una excepción no capturada y ese
 * era también el código de «hay barreras». Una aserción que no podía fallar en la
 * dirección para la que estaba escrita, y detrás de ella un CLI en el que un
 * fallo era indistinguible de un veredicto. */
test("CLI: una entrada ilegible NO se parece a «hay barreras» (salida 3)", async () => {
  const r = await run(["/tmp/no-existe-jamas-" + Date.now() + ".html"]);
  assert.equal(r.code, 3, "3 es «no pude leer», que no es 1 («hay barreras») ni 0");
  assert.match(r.stderr, /No pude leer/);
  assert.match(r.stderr, /no existe/);
  assert.equal(r.stdout, "", "en modo legible el informe va a stdout; si no hay informe, stdout va vacío");
});

test("CLI: --json sobre una entrada ilegible da un objeto SIN barreras ni summary", async () => {
  const r = await run(["--json", "/tmp/no-existe-jamas-" + Date.now() + ".html"]);
  assert.equal(r.code, 3);
  // Parseable, porque un script que parsea no debe reventar...
  const parsed = JSON.parse(r.stdout);
  assert.ok(parsed.error, "...pero lo que recibe dice que hubo un error");
  // ...y sobre todo: nada que se pueda leer como «no hay barreras».
  assert.equal(parsed.barreras, undefined, "una lista vacía de barreras se leería como página limpia");
  assert.equal(parsed.summary, undefined, "un summary a cero se leería como página limpia");
  assert.equal(parsed.veredicto, null);
});

test("CLI: un directorio en vez de un fichero también es salida 3", async () => {
  const r = await run(["/tmp"]);
  assert.equal(r.code, 3);
  assert.match(r.stderr, /directorio/);
});

test("CLI: --help enumera los códigos de salida y distingue fallo de veredicto", async () => {
  const r = await run(["--help"]);
  assert.equal(r.code, 0);
  ["0", "1", "2", "3", "4"].forEach((c) => assert.match(r.stdout, new RegExp("\\n\\s*" + c + "\\s", "m"), "falta el código " + c));
  assert.match(r.stdout, /NO hay veredicto/i);
});
