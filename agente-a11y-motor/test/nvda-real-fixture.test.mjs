/**
 * El léxico de NVDA, contra frases REALES — cuando las haya.
 *
 * El gemelo de `voiceover-real-fixture.test.mjs`. Aquel se pudo escribir porque
 * había transcripciones de verdad; aquí todavía no, y **no se inventan**: un
 * fixture escrito a mano no verifica el léxico, verifica lo que uno creía que
 * dice NVDA, que es justo el error que el fixture existe para evitar.
 *
 * Así que esta batería se salta sola mientras el fichero no esté, diciendo cómo
 * producirlo, y empieza a comprobar de verdad en cuanto alguien lo deje ahí. Lo
 * produce `.github/workflows/nvda.yml` sobre `windows-latest`:
 *
 *   1. Lanza el workflow «NVDA (Windows)» a mano desde Actions.
 *   2. Baja el artefacto `verificacion-nvda`.
 *   3. `node scripts/fixture-nvda.mjs verificacion-nvda.json`
 *
 * Mientras tanto, lo que sí está probado sin Windows es el vocabulario y el
 * recorte del estado: `test/nvda-lexicon.test.mjs`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compareAnnouncement, bridge } from "../src/guidepup-bridge.js";
import { stripReaderNoise, esRuidoDeEscritorio } from "../src/reader-lexicon.js";
import "./helpers.mjs"; // inyecta el DOMParser

const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA = join(aqui, "fixtures", "nvda-es-real.json");
const hay = existsSync(RUTA);
const skip = hay ? false : "sin transcripción real de NVDA todavía: lanza el workflow «NVDA (Windows)» y guarda el artefacto con scripts/fixture-nvda.mjs";
const FIXTURE = hay ? JSON.parse(readFileSync(RUTA, "utf8")) : null;

test("el fixture es una captura real, no algo escrito a mano", { skip }, () => {
  assert.equal(FIXTURE.lector, "nvda");
  assert.equal(FIXTURE.plataforma, "win32");
  assert.ok(Array.isArray(FIXTURE.spokenPhraseLog) && FIXTURE.spokenPhraseLog.length,
    "el fixture tiene que traer la transcripción literal");
  assert.ok(FIXTURE.origen && /workflow|windows|actions/i.test(FIXTURE.origen),
    "y decir de dónde salió");
});

test("ninguna frase real se queda sin recortar el estado", { skip }, () => {
  // Si NVDA dice algo de estado que el léxico no conoce, sobrevive al recorte y
  // acaba haciéndose pasar por el nombre de un control. Que salte aquí.
  const SOBRANTES = /\b(no marcad[oa]|marcad[oa]|contra[ií]do|expandido|visitado|clic?able|\d+ de \d+|nivel \d+)\b/i;
  const sucias = FIXTURE.spokenPhraseLog.filter((s) => SOBRANTES.test(stripReaderNoise(s, "nvda")));
  assert.deepEqual(sucias, [], "quedan estados de NVDA sin recortar");
});

test("el icono sin nombre del componente de prueba sale como barrera confirmada", { skip }, () => {
  // El componente que recorre el workflow lleva a propósito un botón de icono
  // sin nombre accesible. Si NVDA no lo confirma, o el léxico falla o el motor
  // está prediciendo mal: las dos cosas hay que mirarlas.
  const r = (FIXTURE.resultados || []).find((x) => x.previsto && !x.previsto.name);
  assert.ok(r, "el informe tiene que traer el botón sin nombre");
  assert.equal(r.veredicto, "barrera-confirmada", r.nota);
});

test("el puente, alimentado con la transcripción real, confirma los controles nombrados", { skip }, async () => {
  const out = await bridge(FIXTURE.html, {
    lector: "nvda",
    capture: async () => FIXTURE.spokenPhraseLog.map((s, i) => ({ step: i, spoken: s }))
  });
  assert.ok(out.summary.confirmado >= 1, "al menos el botón con texto: " + JSON.stringify(out.summary));
});

test("y el ruido del escritorio de Windows no absuelve a nadie", { skip }, () => {
  const delEscritorio = FIXTURE.spokenPhraseLog.filter((s) => esRuidoDeEscritorio(s, "nvda"));
  delEscritorio.forEach((s) => {
    const r = compareAnnouncement({ name: "", role: "button" }, s, "nvda");
    assert.equal(r.verdict, "sin-captura", "una frase del escritorio le puso nombre a un control: " + s.slice(0, 80));
  });
});
