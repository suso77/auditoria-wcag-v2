#!/usr/bin/env node
/**
 * Convierte el informe de una ejecución real de NVDA en el fixture del repo.
 *
 *   node scripts/fixture-nvda.mjs verificacion-nvda.json
 *
 * El informe lo produce `examples/verificar-nvda.mjs` sobre Windows, que en la
 * práctica significa el workflow `.github/workflows/nvda.yml`: se lanza desde
 * Actions y deja el JSON como artefacto. Este script lo copia a
 * `test/fixtures/nvda-es-real.json` **sin tocar ni una frase**.
 *
 * Que no se editen las frases es el punto entero del fixture. Una transcripción
 * retocada para que los tests pasen ya no prueba lo que dice NVDA: prueba lo que
 * queríamos que dijera. Por eso este script solo reordena campos y comprueba que
 * el informe es de verdad —de NVDA, de Windows y con transcripción— antes de
 * escribirlo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { idiomaDelLector } from "../src/reader-lexicon.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(aqui, "..", "test", "fixtures");

const entrada = process.argv[2];
if (!entrada) {
  console.error("Uso: node scripts/fixture-nvda.mjs <verificacion-nvda.json>");
  process.exit(2);
}
if (!existsSync(entrada)) {
  console.error("✗ No existe: " + entrada);
  process.exit(2);
}

const inf = JSON.parse(readFileSync(entrada, "utf8"));

/* El nombre del fichero lo decide el IDIOMA en que habló el lector.
 *
 * El runner de GitHub es una máquina en inglés: su NVDA dice «button» y
 * «heading, level 1». Esa transcripción vale —verifica el mecanismo y las
 * palabras inglesas del léxico— pero guardarla como `nvda-es-real.json` sería
 * el peor fixture posible: uno que parece probar el español y no lo prueba.
 * Así que cada idioma va a su fichero, y el español solo lo escribe una sesión
 * que de verdad haya hablado español. */
const frases = (inf.transcripcion || []).map(function (t) { return typeof t === "string" ? t : t.spoken; });
const idioma = inf.idioma || idiomaDelLector(frases);

const problemas = [];
if (inf.lector !== "nvda") problemas.push("el informe no dice `lector: \"nvda\"` (¿es de VoiceOver?)");
if (inf.plataforma !== "win32") problemas.push("el informe no se generó en Windows (plataforma: " + inf.plataforma + ")");
if (!Array.isArray(inf.transcripcion) || !inf.transcripcion.length) problemas.push("no trae transcripción");
if (!inf.html) problemas.push("no trae el HTML del componente recorrido");
const utiles = (inf.resultados || []).filter((r) => r.veredicto !== "sin-captura" && r.veredicto !== "no-encontrado");
if (!utiles.length) problemas.push("ninguna captura sirvió: guardar esto como fixture sería guardar una sesión fallida");
if (!idioma) problemas.push("no se reconoce el idioma del lector en la transcripción: no se puede archivar sin saber qué prueba");
if (problemas.length) {
  console.error("✗ Este informe no vale como fixture:");
  problemas.forEach((p) => console.error("  – " + p));
  process.exit(1);
}

const DESTINO = join(FIXTURES, "nvda-" + idioma + "-real.json");
const fixture = {
  origen: "GitHub Actions · workflow «NVDA (Windows)» sobre windows-latest · " + (inf.creado || "").slice(0, 10) +
    " · navegador " + (inf.navegador || "?"),
  nota: "Frases TAL CUAL las devolvió NVDA. No se editan: el valor del fixture es que no son inventadas.",
  lector: "nvda",
  idioma: idioma,
  plataforma: inf.plataforma,
  navegador: inf.navegador || null,
  html: inf.html,
  resumen: inf.resumen,
  resultados: inf.resultados,
  spokenPhraseLog: inf.transcripcion.map((t) => (typeof t === "string" ? t : t.spoken))
};

writeFileSync(DESTINO, JSON.stringify(fixture, null, 2) + "\n", "utf8");
console.log("✓ " + DESTINO);
console.log("  " + fixture.spokenPhraseLog.length + " frase(s) · " + JSON.stringify(fixture.resumen));
if (idioma === "es") {
  console.log("  Ahora `npm test` deja de saltarse test/nvda-real-fixture.test.mjs.");
} else {
  console.log("  Idioma: " + idioma + ". Verifica el mecanismo y las palabras de ese idioma;");
  console.log("  el léxico ESPAÑOL sigue sin transcripción real, y los tests que lo comprueban siguen saltándose.");
}
