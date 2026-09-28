// Prepara el motor para Node: inyecta el DOMParser de linkedom y re-exporta la API.
import { DOMParser } from "linkedom";
import * as engine from "../src/index.js";

engine.setDOMParser(DOMParser);

// Crea un único elemento a partir de un fragmento HTML (para tests unitarios de bajo nivel).
export function elementFrom(html) {
  const doc = new DOMParser().parseFromString('<div id="__r">' + html + "</div>", "text/html");
  return doc.getElementById("__r").firstElementChild;
}

// Documento del fragmento (para resolver referencias por id, p. ej. labelledby).
export function docFrom(html) {
  return new DOMParser().parseFromString('<div id="__r">' + html + "</div>", "text/html");
}

// Busca en el modelo el primer nodo cuyo rol coincide.
export function nodeByRole(model, role) {
  return model.all.find(function (n) { return n.role === role; });
}

export * from "../src/index.js";
