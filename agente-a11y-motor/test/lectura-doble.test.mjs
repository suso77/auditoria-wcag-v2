import { test } from "node:test";
import assert from "node:assert/strict";
import { diferenciaDeLectura } from "../src/crawl.js";

/* ── Una sola captura no basta en un sitio que pinta en el cliente ────────────
 *
 * Medido en la pasada `ja4` de jesusaccesible.com: el rastreo iba con
 * `waitUntil: "load"` y SIN espera añadida, mientras la auditoría va con
 * `load` + 400 ms. `/contacto` —cuatro campos y un botón de envío— salió con
 * `tieneFormulario: false`, la cobertura de la muestra quedó con
 * `formulario: false`, y la justificación que va al IRA decía «No se ha
 * encontrado ninguna página de la categoría "Página con formulario":
 * compruébalo a mano» con la página del formulario DENTRO de la muestra. Una
 * afirmación falsa en el documento que sostiene la auditoría, y además mandando
 * al auditor a buscar algo que ya tenía.
 *
 * Las huellas lo delataban: cuatro páginas con la MISMA huella —el armazón
 * compartido— y una sin header ni footer. Dos momentos de pintado distintos en
 * la misma pasada no son marcado estable, son una carrera.
 *
 * El comportamiento con navegador está en test/integration/crawl-real.test.mjs,
 * que se SALTA donde no hay Chromium. La comparación vive aquí, pura, porque un
 * test que se salta en silencio es el verde falso que este proyecto persigue. */

const lectura = (plantilla, senales, enlaces) =>
  ({ plantilla: plantilla, "señales": senales || {}, enlaces: enlaces || [] });

test("doble lectura: dos lecturas iguales no cambian nada", () => {
  const a = lectura("header>main>footer", { tieneFormulario: true, tieneBusqueda: false });
  assert.deepEqual(diferenciaDeLectura(a, lectura("header>main>footer", { tieneFormulario: true, tieneBusqueda: false })), []);
});

test("doble lectura: el formulario que aparece al pintarse SE DETECTA", () => {
  /* Este es exactamente el caso de /contacto en ja4. */
  const antes = lectura("header>main>footer", { tieneFormulario: false });
  const despues = lectura("header>main>footer", { tieneFormulario: true });
  assert.deepEqual(diferenciaDeLectura(antes, despues), ["tieneFormulario"]);
});

test("doble lectura: una huella que cambia es la señal de que se leyó el armazón", () => {
  const antes = lectura("main|/||nav:0", { tieneFormulario: false });
  const despues = lectura("header>navigation>main>contentinfo|/grow||nav:8", { tieneFormulario: false });
  assert.deepEqual(diferenciaDeLectura(antes, despues), ["plantilla"]);
});

test("doble lectura: también cuenta que aparezcan enlaces", () => {
  const antes = lectura("x", {}, [{ href: "/" }]);
  const despues = lectura("x", {}, [{ href: "/" }, { href: "/contacto" }]);
  assert.deepEqual(diferenciaDeLectura(antes, despues), ["enlaces"]);
});

test("doble lectura: varios cambios salen en orden estable, con la plantilla primero", () => {
  /* El orden importa porque esta lista se imprime en el aviso del informe, y un
   * orden que baila entre pasadas hace ilegible el diff de dos auditorías. */
  const antes = lectura("a", { tieneFormulario: false, video: false, tieneBusqueda: false }, []);
  const despues = lectura("b", { tieneFormulario: true, video: true, tieneBusqueda: false }, [{ href: "/" }]);
  assert.deepEqual(diferenciaDeLectura(antes, despues), ["plantilla", "tieneFormulario", "video", "enlaces"]);
});

test("doble lectura: sin segunda lectura no se inventa ningún cambio", () => {
  /* Fail-safe: si la segunda evaluación falló —la página navegó, el contexto se
   * perdió— no hay comparación, y lo que NO se puede hacer es marcar la página
   * como «pinta en el cliente» sin haberlo medido. */
  const a = lectura("x", { tieneFormulario: true });
  assert.deepEqual(diferenciaDeLectura(a, null), []);
  assert.deepEqual(diferenciaDeLectura(null, a), []);
});

test("doble lectura: una señal que DESAPARECE también es un cambio", () => {
  /* No se asume que el DOM solo crece. Un carrusel que se monta y se desmonta, o
   * un aviso de cookies que se va, cambian la lectura igual. */
  const antes = lectura("x", { carrusel: true });
  assert.deepEqual(diferenciaDeLectura(antes, lectura("x", { carrusel: false })), ["carrusel"]);
});
