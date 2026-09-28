// El banco de precisión accname (corpus WPT) como test de regresión:
// ningún caso EN ÁMBITO debe divergir. Los `skip` (limitaciones sin CSS) no cuentan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accessibleName, implicitRole } from "./helpers.mjs";
import { DOMParser } from "linkedom";
import { ACCNAME_CASES } from "../bench/corpus/accname.cases.mjs";

function roleOf(el) {
  const explicit = el.getAttribute("role");
  return explicit ? explicit.split(/\s+/)[0] : implicitRole(el);
}

for (const c of ACCNAME_CASES) {
  if (c.skip) continue;
  test("accname WPT: " + c.name, () => {
    const doc = new DOMParser().parseFromString('<div id="__r">' + c.html + "</div>", "text/html");
    const el = doc.getElementById("__r").querySelector(c.sel || ".ex");
    assert.ok(el, "selector encontró el objetivo");
    assert.equal(accessibleName(el, doc, roleOf(el)).name, c.expected);
  });
}
