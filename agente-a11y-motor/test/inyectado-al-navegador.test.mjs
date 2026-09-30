/**
 * Lo que se inyecta en el navegador tiene que llegar como se escribió.
 *
 * Varias capas mandan código al navegador dentro de un template literal
 * (`const HELPERS = \`…\``) para ejecutarlo con `page.evaluate(new Function(…))`.
 * Dentro de un template literal, `\s` NO es una secuencia de escape válida y
 * JavaScript la colapsa a la letra `s` sin avisar de nada: lo que se escribe como
 * `/\s+/` llega al navegador como `/s+/`, que es «una o más letras s».
 *
 * No es una hipótesis. En `crawl.js` pasaba en dos sitios, y la consecuencia era
 * de las gordas: `__cls` partía la lista de clases por la letra «s», así que
 * `class="noticias"` y `class="noticia"` daban el mismo token. La firma de
 * plantilla es lo único que distingue maquetaciones, así que dos plantillas
 * distintas quedaban con la misma firma, una desaparecía de la muestra, y el IRA
 * afirmaba «4 plantillas, la muestra cubre 4». Una plantilla entera —con sus
 * barreras— fuera de la auditoría, y el informe diciendo que estaba cubierta.
 *
 * El fallo es invisible leyendo el fichero: en el editor se ve `/\s+/`. Solo se ve
 * evaluando el template, que es lo que hace esta prueba, sobre todas las
 * plantillas de golpe y para todas las secuencias que se colapsan igual.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Cada `const X = \`` … \`;` de un módulo, ya evaluado. */
function plantillas(fichero) {
  const src = readFileSync(join(SRC, fichero), "utf8");
  const out = [];
  const re = /^const ([A-Z_]+) = `$/gm;
  let m;
  while ((m = re.exec(src))) {
    const fin = src.indexOf("\n`;", m.index);
    assert.notEqual(fin, -1, "la plantilla " + m[1] + " de " + fichero + " no se cierra con `;");
    const decl = src.slice(m.index, fin + 3);
    // Se evalúa igual que al cargar el módulo: aquí es donde `\s` se vuelve `s`.
    out.push({ nombre: m[1], fichero: fichero, codigo: new Function(decl + " return " + m[1] + ";")() });
  }
  return out;
}

const MODULOS = readdirSync(SRC).filter((f) => f.endsWith(".js"));

/* Todos los tramos entre comillas invertidas de un fichero, con su línea.
 *
 * No basta con las plantillas que tienen nombre (`const HELPERS = \`…\``): la mayor
 * parte del código que se inyecta va en plantillas EN LÍNEA, dentro de la propia
 * llamada a `evalIn(page, \`…\`)`, y ahí el colapso de `\s` pasa exactamente igual.
 * Este recorrido las coge todas. Es un análisis del TEXTO, no del valor, porque una
 * plantilla con `${…}` dentro no se puede evaluar suelta; y para este fallo el
 * texto basta: dentro de una plantilla, `\s` es un error y `\\s` es lo correcto.
 */
function tramosDePlantilla(fuente) {
  const tramos = [];
  let i = 0, linea = 1;
  const n = fuente.length;
  while (i < n) {
    const c = fuente[i];
    if (c === "\n") { linea++; i++; continue; }
    // Comentarios y cadenas normales se saltan: una comilla invertida dentro de
    // un comentario (o de una cadena) no abre ninguna plantilla.
    if (c === "/" && fuente[i + 1] === "/") { while (i < n && fuente[i] !== "\n") i++; continue; }
    if (c === "/" && fuente[i + 1] === "*") {
      i += 2;
      while (i < n && !(fuente[i] === "*" && fuente[i + 1] === "/")) { if (fuente[i] === "\n") linea++; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n && fuente[i] !== q) { if (fuente[i] === "\\") i++; if (fuente[i] === "\n") linea++; i++; }
      i++; continue;
    }
    if (c === "`") {
      const desde = i + 1, lineaInicio = linea;
      i++;
      let prof = 0;
      while (i < n) {
        if (fuente[i] === "\\") { i += 2; continue; }
        if (fuente[i] === "\n") linea++;
        if (fuente[i] === "$" && fuente[i + 1] === "{") { prof++; i += 2; continue; }
        if (prof > 0 && fuente[i] === "}") { prof--; i++; continue; }
        if (prof === 0 && fuente[i] === "`") break;
        i++;
      }
      tramos.push({ linea: lineaInicio, texto: fuente.slice(desde, i) });
      i++; continue;
    }
    i++;
  }
  return tramos;
}

/* Las secuencias que una plantilla se come sin protestar, buscadas en el TEXTO:
 * una barra sola delante de la letra. `\\s` (dos barras) es lo correcto y no
 * salta; `\n`, `\t`, `\\`, `\'`, `\`` y `\${` son escapes válidos y no entran. */
const SUELTAS = /(^|[^\\])\\([sdwbSDWB])(?![a-zA-Z])/;

test("ninguna plantilla del código —con nombre o en línea— lleva una secuencia sin escapar", () => {
  const fallos = [];
  MODULOS.forEach((f) => {
    const fuente = readFileSync(join(SRC, f), "utf8");
    tramosDePlantilla(fuente).forEach((t) => {
      t.texto.split("\n").forEach((l, k) => {
        const m = l.match(SUELTAS);
        if (m) {
          fallos.push(f + ":" + (t.linea + k) + "  se escribió `\\" + m[2] +
            "` y a la plantilla llega la letra suelta; dóblalo a `\\\\" + m[2] + "`\n      " + l.trim().slice(0, 140));
        }
      });
    });
  });
  assert.deepEqual(fallos, [], "secuencias colapsadas en plantillas:\n  – " + fallos.join("\n  – "));
});

/* Las secuencias que un template literal se come sin protestar. `\n`, `\t`, `\\`
 * y `\'` sí son escapes válidos y no entran aquí. */
const COLAPSADAS = [
  { re: /\/s\+\/|\/s\*\/|\[\^s\]|\(\?:s\)/, era: "\\s", nota: "espacio en blanco" },
  { re: /\/d\+\/|\/d\*\/|\[\^d\]/, era: "\\d", nota: "dígito" },
  { re: /\/w\+\/|\/w\*\/|\[\^w\]/, era: "\\w", nota: "carácter de palabra" },
  { re: /\.split\(\/b/, era: "\\b", nota: "frontera de palabra" }
];

test("ninguna plantilla inyectada llega al navegador con una secuencia colapsada", () => {
  let revisadas = 0;
  MODULOS.forEach((f) => {
    plantillas(f).forEach((p) => {
      revisadas++;
      p.codigo.split("\n").forEach((linea, i) => {
        COLAPSADAS.forEach((c) => {
          assert.ok(!c.re.test(linea),
            f + " · plantilla " + p.nombre + ", línea " + (i + 1) + ": se escribió `" + c.era +
            "` (" + c.nota + ") y al navegador llega la letra suelta. Escápalo como `" + c.era.replace("\\", "\\\\") +
            "`.\n    " + linea.trim());
        });
      });
    });
  });
  assert.ok(revisadas >= 4, "se esperaban al menos 4 plantillas inyectadas, y se han revisado " + revisadas);
});

test("regresión: la firma de plantilla distingue singular de plural", () => {
  // El caso exacto que estaba roto: `class="noticias"` (listado) y
  // `class="noticia"` (ficha) tienen que dar tokens distintos.
  const extraer = plantillas("crawl.js").find((p) => p.nombre === "EXTRAER");
  assert.ok(extraer, "crawl.js tiene que seguir teniendo la plantilla EXTRAER");
  const m = extraer.codigo.match(/function __cls\(el\)\{([\s\S]*?)\n/);
  assert.ok(m, "no se encuentra __cls en la plantilla evaluada");
  const cuerpo = m[0].replace(/^function __cls\(el\)\{/, "").replace(/\}\s*$/, "");
  const __cls = new Function("el", cuerpo);
  const con = (clase) => __cls({ getAttribute: () => clase });
  assert.equal(con("noticias"), "noticias");
  assert.equal(con("noticia"), "noticia");
  assert.notEqual(con("noticias"), con("noticia"), "dos plantillas distintas no pueden dar la misma firma");
  assert.equal(con("sitio"), "sitio", "y una clase con «s» dentro no se parte por ahí");
  assert.equal(con("cabecera destacada"), "cabecera", "la lista de clases se parte por el espacio, que es de lo que iba la regex");
});
