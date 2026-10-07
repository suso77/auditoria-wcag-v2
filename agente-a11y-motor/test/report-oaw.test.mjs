import { test } from "node:test";
import assert from "node:assert/strict";
import { oawExport, barreras, seguimiento } from "../src/index.js";

const F = (n, lvl, verdict, sev, nodes, evid) => ({ c: { n, lvl, t: n }, verdict, sev, nodes, evid });

test("barreras: mapea el criterio WCAG a subcriterio EN 9.X.Y.Z", () => {
  const rows = barreras([F("4.1.2", "A", "falla", "crítica", [{ locator: "button.icon" }], ["<b>sin nombre</b>"])], { url: "/home" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subcriterio, "9.4.1.2");
  assert.equal(rows[0].enEN, true);
  assert.equal(rows[0].criterio, "4.1.2");
  assert.equal(rows[0].gravedad, "Crítica");
  assert.equal(rows[0].pagina, "/home");
  assert.equal(rows[0].elemento, "button.icon");
  assert.equal(rows[0].evidencia, "sin nombre"); // sin etiquetas HTML
});

test("barreras: un criterio nuevo de 2.2 (2.5.8) no está en la EN → enEN false", () => {
  const out = oawExport([F("2.5.8", "AA", "falla", "moderada", [], ["objetivo pequeño"])], { url: "/x" });
  assert.equal(out.barreras[0].enEN, false);
  assert.equal(out.barreras[0].subcriterio, "");
  assert.ok(out.fueraDeEN.includes("2.5.8"));
});

test("seguimiento: resultado agregado por subcriterio (peor veredicto)", () => {
  const rows = seguimiento([
    F("1.4.3", "AA", "cumple"), F("1.4.3", "AA", "falla"),
    F("2.4.1", "A", "revisar"),
    F("2.4.2", "A", "cumple")
  ]);
  const c143 = rows.find((r) => r.criterio === "1.4.3");
  const c241 = rows.find((r) => r.criterio === "2.4.1");
  const c242 = rows.find((r) => r.criterio === "2.4.2");
  assert.equal(c143.resultado, "Falla");
  assert.equal(c143.num_barreras, 1);
  assert.match(c241.resultado, /No se puede comprobar/);
  assert.equal(c242.resultado, "Correcto");
});

test("oawExport: CSV con BOM, separador ; y cabecera", () => {
  const out = oawExport([F("4.1.2", "A", "falla", "grave", [{ locator: "a" }], ["x"])], { url: "/" });
  assert.ok(out.csv.barreras.startsWith("﻿"));
  assert.match(out.csv.barreras.split("\r\n")[0], /Subcriterio EN.*;.*Criterio WCAG/);
  assert.match(out.csv.seguimiento, /9\.4\.1\.2/);
});

/* ── La hoja de Seguimiento declara su cobertura (v0.37.0) ──────────────────── */
test("con la muestra incompleta, nada se exporta como «Correcto»", () => {
  const f = (n, v) => ({ c: { n, lvl: "A", t: "x" }, verdict: v });
  const findings = [f("1.1.1", "cumple"), f("1.3.1", "falla"), f("2.4.4", "no-aplica")];
  const res = (m) => {
    const o = {};
    seguimiento(findings, { muestra: m }).forEach((r) => { o[r.criterio] = r.resultado; });
    return o;
  };
  const completa = res({ paginas: 10, paginasAnalizadas: 10, sinAnalizar: [] });
  assert.equal(completa["1.1.1"], "Correcto");

  // Con tres páginas sin analizar, ese «Correcto» es una afirmación que el
  // agente no puede sostener: se queda sin determinar, y con el motivo dentro.
  const parcial = res({ paginas: 10, paginasAnalizadas: 7, sinAnalizar: [1, 2, 3] });
  assert.match(parcial["1.1.1"], /No se puede comprobar \(muestra incompleta: 7 de 10/);
  // Lo que NO cambia: una barrera encontrada sigue siendo una barrera, y «no
  // aplica» habla de lo que hay en las páginas, no de cuántas se miraron.
  assert.equal(parcial["1.3.1"], "Falla");
  assert.equal(parcial["2.4.4"], "No aplica");
});

test("la cobertura de la muestra viaja en su propia columna del CSV", () => {
  const findings = [{ c: { n: "1.1.1", lvl: "A", t: "x" }, verdict: "cumple" }];
  const csv = oawExport(findings, { muestra: { paginas: 10, paginasAnalizadas: 7, sinAnalizar: [1, 2, 3] }, todosLosCriterios: false }).csv.seguimiento;
  assert.match(csv.split("\r\n")[0], /Cobertura de la muestra/);
  assert.match(csv, /7 de 10 página\(s\) analizadas/);
});
