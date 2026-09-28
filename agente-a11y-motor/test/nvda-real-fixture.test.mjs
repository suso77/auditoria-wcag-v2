/**
 * El léxico de NVDA, contra frases REALES — cuando las haya.
 *
 * El gemelo de `voiceover-real-fixture.test.mjs`. Aquel se pudo escribir porque
 * había transcripciones de verdad; aquí se van produciendo por CI, y **no se
 * inventan**: un fixture escrito a mano no verifica el léxico, verifica lo que
 * uno creía que dice NVDA, que es justo el error que el fixture existe para
 * evitar.
 *
 * ── Un fichero por idioma, y no es un detalle ──────────────────────────────
 * El runner de GitHub es una máquina en inglés: su NVDA dice «button» y
 * «heading, level 1». Esa transcripción vale para comprobar el mecanismo y las
 * palabras inglesas del léxico, pero NO comprueba el español, que es el que
 * hace falta para auditar aquí. Por eso cada idioma tiene su fichero y sus
 * comprobaciones, y las del español solo corren con una sesión que de verdad
 * haya hablado español.
 *
 * Cómo se producen:
 *   1. Lanza el workflow «NVDA (Windows)» desde Actions.
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
import { stripReaderNoise, esRuidoDeEscritorio, idiomaDelLector } from "../src/reader-lexicon.js";
import "./helpers.mjs"; // inyecta el DOMParser

const aqui = dirname(fileURLToPath(import.meta.url));
const ruta = (idioma) => join(aqui, "fixtures", "nvda-" + idioma + "-real.json");
const cargar = (idioma) => (existsSync(ruta(idioma)) ? JSON.parse(readFileSync(ruta(idioma), "utf8")) : null);
const falta = (idioma) =>
  "sin transcripción real de NVDA en «" + idioma + "»: lanza el workflow «NVDA (Windows)» y guarda el artefacto con scripts/fixture-nvda.mjs";

/* ── Comprobaciones que valen en cualquier idioma ─────────────────────────── */

["es", "en"].forEach((idioma) => {
  const F = cargar(idioma);
  const skip = F ? false : falta(idioma);

  test("[" + idioma + "] el fixture es una captura real, no algo escrito a mano", { skip }, () => {
    assert.equal(F.lector, "nvda");
    assert.equal(F.plataforma, "win32");
    assert.equal(F.idioma, idioma, "el fichero y el idioma declarado tienen que coincidir");
    assert.ok(Array.isArray(F.spokenPhraseLog) && F.spokenPhraseLog.length, "tiene que traer la transcripción literal");
    assert.ok(F.origen && /workflow|windows|actions/i.test(F.origen), "y decir de dónde salió");
    assert.equal(idiomaDelLector(F.spokenPhraseLog), idioma,
      "las frases tienen que ser de ese idioma: un fixture mal etiquetado no prueba lo que dice probar");
  });

  test("[" + idioma + "] el icono sin nombre sale como barrera confirmada", { skip }, () => {
    // El componente que recorre el workflow lleva a propósito un botón de icono
    // sin nombre accesible. Si NVDA no lo confirma, o el léxico falla o el motor
    // predice mal: las dos cosas hay que mirarlas.
    const r = (F.resultados || []).find((x) => x.previsto && !x.previsto.name);
    assert.ok(r, "el informe tiene que traer el botón sin nombre");
    assert.equal(r.veredicto, "barrera-confirmada", r.nota);
  });

  test("[" + idioma + "] el puente, sobre la transcripción real, confirma los controles nombrados", { skip }, async () => {
    const out = await bridge(F.html, {
      lector: "nvda",
      capture: async () => F.spokenPhraseLog.map((s, i) => ({ step: i, spoken: s }))
    });
    assert.ok(out.summary.confirmado >= 1, "al menos el botón con texto: " + JSON.stringify(out.summary));
  });

  test("[" + idioma + "] el ruido del escritorio de Windows no absuelve a nadie", { skip }, () => {
    (F.spokenPhraseLog || []).filter((s) => esRuidoDeEscritorio(s, "nvda")).forEach((s) => {
      const r = compareAnnouncement({ name: "", role: "button" }, s, "nvda");
      assert.equal(r.verdict, "sin-captura", "una frase del escritorio le puso nombre a un control: " + s.slice(0, 80));
    });
  });
});

/* ── Y lo que solo tiene sentido en español ───────────────────────────────── */

const ES = cargar("es");
const skipEs = ES ? false : falta("es");

test("[es] ninguna frase real se queda sin recortar el estado", { skip: skipEs }, () => {
  // Si NVDA dice algo de estado que el léxico no conoce, sobrevive al recorte y
  // acaba haciéndose pasar por el nombre de un control. Que salte aquí.
  const SOBRANTES = /\b(no marcad[oa]|marcad[oa]|contra[ií]do|expandido|visitado|clic?able|\d+ de \d+|nivel \d+)\b/i;
  const sucias = ES.spokenPhraseLog.filter((s) => SOBRANTES.test(stripReaderNoise(s, "nvda")));
  assert.deepEqual(sucias, [], "quedan estados de NVDA sin recortar");
});
