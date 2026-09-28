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
