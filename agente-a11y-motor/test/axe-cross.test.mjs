import { test } from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs"; // inyecta el DOMParser en el motor
import {
  scFromAxeTag, scFromAxeTags, axeViolationsBySC,
  reconcile, crossCheck
} from "../src/index.js";

test("scFromAxeTag: deriva el criterio del tag de axe", () => {
  assert.equal(scFromAxeTag("wcag412"), "4.1.2");
  assert.equal(scFromAxeTag("wcag143"), "1.4.3");
  assert.equal(scFromAxeTag("wcag1410"), "1.4.10");
  assert.equal(scFromAxeTag("wcag2aa"), null); // tag de nivel, no criterio
  assert.equal(scFromAxeTag("cat.forms"), null);
});

test("scFromAxeTags: reúne y deduplica criterios", () => {
  assert.deepEqual(scFromAxeTags(["cat.name-role-value", "wcag2a", "wcag412", "wcag412"]), ["4.1.2"]);
});

test("axeViolationsBySC: indexa violaciones por criterio", () => {
  const v = [{ id: "button-name", impact: "critical", help: "Buttons need text", tags: ["wcag2a", "wcag412"], nodes: [{}] }];
  const bySC = axeViolationsBySC(v);
  assert.ok(bySC.has("4.1.2"));
  assert.equal(bySC.get("4.1.2").rules[0].id, "button-name");
});

// Violaciones sintéticas de axe con la forma real de axe.run().violations
const V = {
  buttonName: { id: "button-name", impact: "critical", help: "Los botones necesitan texto perceptible", tags: ["cat.name-role-value", "wcag2a", "wcag412"], nodes: [{}] },
  colorContrast: { id: "color-contrast", impact: "serious", help: "El texto necesita contraste suficiente", tags: ["cat.color", "wcag2aa", "wcag143"], nodes: [{}] }
};

test("reconcile: acuerdo cuando motor y axe señalan el mismo criterio", () => {
  const engineFallas = [{ c: { n: "4.1.2", t: "Nombre, función, valor" }, sev: "crítica", verdict: "falla" }];
  const rec = reconcile(engineFallas, [V.buttonName]);
  assert.equal(rec.summary.acuerdo, 1);
  assert.equal(rec.summary.soloMotor, 0);
  assert.equal(rec.summary.soloAxe, 0);
  assert.equal(rec.agreements[0].sc, "4.1.2");
  assert.equal(rec.agreements[0].axeRules[0].id, "button-name");
});

test("reconcile: solo-axe cuando axe ve algo que el motor no (p. ej. contraste renderizado)", () => {
  const engineFallas = [{ c: { n: "4.1.2", t: "Nombre, función, valor" }, sev: "crítica", verdict: "falla" }];
  const rec = reconcile(engineFallas, [V.buttonName, V.colorContrast]);
  assert.equal(rec.summary.acuerdo, 1);
  assert.equal(rec.summary.soloAxe, 1);
  assert.equal(rec.onlyAxe[0].sc, "1.4.3");
});

test("reconcile: solo-motor cuando el motor ve algo que axe no (p. ej. enlace poco descriptivo)", () => {
  const engineFallas = [{ c: { n: "2.4.4", t: "Propósito del enlace" }, sev: "moderada", verdict: "falla" }];
  const rec = reconcile(engineFallas, []); // axe sin violaciones
  assert.equal(rec.summary.soloMotor, 1);
  assert.equal(rec.onlyEngine[0].sc, "2.4.4");
});

test("crossCheck: pipeline completo con runAxe inyectado (sin navegador)", async () => {
  const html = '<button><svg viewBox="0 0 24 24"><path d="M3 6h18"/></svg></button>';
  const runAxe = async () => [V.buttonName];
  const out = await crossCheck(html, { runAxe });
  assert.ok(out.engine.summary.falla >= 1);
  // El motor falla 4.1.2 y axe también → acuerdo en 4.1.2
  assert.ok(out.reconciliation.agreements.some((a) => a.sc === "4.1.2"));
});

test("crossCheck: exige un runAxe", async () => {
  await assert.rejects(() => crossCheck("<button>x</button>", {}), /runAxe/);
});
