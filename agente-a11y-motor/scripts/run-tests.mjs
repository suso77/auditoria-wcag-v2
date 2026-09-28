#!/usr/bin/env node
/**
 * Lanza las pruebas de una carpeta, sin depender del shell.
 *
 *   node scripts/run-tests.mjs test
 *   node scripts/run-tests.mjs test/integration
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `npm test` era `node --test test/*.test.mjs`, y eso **no es portable**: quien
 * expande el `*` es el shell, y npm ejecuta los scripts con `cmd.exe` en
 * Windows, que no expande nada. Node recibe el patrón tal cual y responde
 * «Could not find 'test/*.test.mjs'» con código de salida 1.
 *
 * Se vio en la primera ejecución del workflow de NVDA: `windows-latest`,
 * dependencias instaladas, y las 478 pruebas fallando en bloque antes de tocar
 * el lector. Con Node 22 no pasa —expande el patrón él mismo— pero con Node 20
 * sí, y no tiene sentido que la suite dependa de qué shell y qué versión de Node
 * haya debajo.
 *
 * Aquí los ficheros se buscan con `fs` y se le pasan a `node --test` uno a uno.
 * La búsqueda NO es recursiva a propósito: `test/` es la suite unitaria y
 * `test/integration/` la de navegador, y meterlas juntas convertiría `npm test`
 * en algo que necesita Chromium.
 */
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpeta = process.argv[2] || "test";
const extra = process.argv.slice(3);

const dir = resolve(ROOT, carpeta);
if (!existsSync(dir)) {
  console.error("✗ No existe la carpeta de pruebas: " + carpeta);
  process.exit(2);
}

const ficheros = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.test\.mjs$/.test(d.name))
  .map((d) => join(dir, d.name))
  .sort();

if (!ficheros.length) {
  // Silencio verde sería peor que un fallo: «0 pruebas» no es «todo bien».
  console.error("✗ No hay ninguna prueba en " + carpeta + ". Eso no es una suite en verde, es una suite vacía.");
  process.exit(2);
}

const r = spawnSync(process.execPath, ["--test"].concat(extra, ficheros), { cwd: ROOT, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
