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
