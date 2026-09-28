import { test } from "node:test";
import assert from "node:assert/strict";
import { rank, worseOf, worstOf, esConforme, esIndeterminado, VERDICTS } from "../src/verdicts.js";

test("el orden de gravedad cubre TODO el vocabulario", () => {
  const rangos = VERDICTS.map(rank);
  assert.deepEqual(rangos, [...rangos].sort((a, b) => b - a), "de peor a mejor sin empates mal puestos");
  assert.equal(new Set(rangos).size, VERDICTS.length, "sin rangos repetidos");
});

test("un veredicto DESCONOCIDO nunca vale como conforme", () => {
  assert.ok(rank("inventado") > rank("cumple"));
  assert.ok(rank("inventado") > rank("cumple-parcial"));
  assert.equal(worseOf("cumple", "inventado"), "inventado");
  assert.equal(esConforme("inventado"), false);
});

test("humano y cumple-parcial pesan más que cumple", () => {
  assert.equal(worseOf("cumple", "humano"), "humano");
  assert.equal(worseOf("pasa", "cumple-parcial"), "cumple-parcial");
  assert.equal(worstOf(["cumple", "pasa", "humano", "cumple"]), "humano");
});

test("falla domina siempre; lista vacía → null (nada evaluado)", () => {
  assert.equal(worstOf(["cumple", "revisar", "falla", "humano"]), "falla");
  assert.equal(worstOf([]), null);
});

test("esConforme solo acepta cumple y pasa", () => {
  assert.deepEqual(VERDICTS.filter(esConforme), ["pasa", "cumple"]);
  assert.deepEqual(VERDICTS.filter(esIndeterminado), ["revisar", "humano", "cumple-parcial"]);
});
