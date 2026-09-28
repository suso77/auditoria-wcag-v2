import { test } from "node:test";
import assert from "node:assert/strict";
import { dynamicAnalyze } from "../../src/index.js";

const launchOptions = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
let browserOK = true, why = "";
try { const { chromium } = await import("playwright"); const b = await chromium.launch(launchOptions); await b.close(); }
catch (e) { browserOK = false; why = (e && e.message) || String(e); }
const skip = browserOK ? false : "sin navegador: " + why;

test("dinámico real: disclosure roto (aria-expanded no cambia) → falla 4.1.2", { skip }, async () => {
  // Botón que NO actualiza aria-expanded al pulsar.
  const html = '<button aria-expanded="false" aria-controls="p">Opciones</button><div id="p" hidden>contenido</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions });
  assert.ok(out.findings.some((f) => f.c.n === "4.1.2" && f.verdict === "falla"));
});

test("dinámico real: disclosure correcto → 4.1.2 cumple", { skip }, async () => {
  const html = '<button id="b" aria-expanded="false" aria-controls="p" onclick="var p=document.getElementById(\'p\');var e=this.getAttribute(\'aria-expanded\')===\'true\';this.setAttribute(\'aria-expanded\',String(!e));p.hidden=e;">Opciones</button><div id="p" hidden>contenido</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions });
  assert.ok(out.findings.some((f) => f.c.n === "4.1.2" && f.verdict === "cumple"));
});

test("dinámico real: control div+onclick no se alcanza tabulando → falla 2.1.1", { skip }, async () => {
  const html = '<button>Real</button><div role="button" onclick="x()">Falso</div>';
  const out = await dynamicAnalyze({ html }, { launchOptions });
  // el div[role=button] sin tabindex no entra en el orden de Tab
  assert.ok(out.findings.some((f) => f.c.n === "2.1.1"));
});
