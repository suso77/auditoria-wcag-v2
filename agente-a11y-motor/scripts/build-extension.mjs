#!/usr/bin/env node
/**
 * Empaqueta el núcleo de la librería para la extensión de Chrome.
 *
 *   npm run build:extension
 *
 * Mismo principio que el artifact: la extensión NO lleva una copia a mano del
 * motor, se genera desde `src/`. Así el navegador, el CLI y la extensión
 * dictaminan exactamente igual.
 *
 * ── Por qué no basta con concatenar ────────────────────────────────────────
 * Los módulos son ESM y un content script de MV3 es un script clásico, así que
 * hay que aplanarlos. Pegarlos uno detrás de otro sería un desastre silencioso:
 * media docena de módulos definen por su cuenta `F`, `crit`, `IX`, `loc`,
 * `tagOf` u `ocultoEl`. En un solo ámbito, el último gana y el resto pasa a
 * llamar a una función que no es la suya — sin error, con veredictos falsos.
 *
 * Por eso cada módulo va en su propia IIFE. Los `import` se traducen a una
 * desestructuración del espacio de nombres común, y los `export` a asignaciones
 * en él. Cada módulo conserva su ámbito y ve exactamente lo que importaba.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const DEST = join(ROOT, "extension");

/** En orden de dependencia: cada módulo solo puede importar de los anteriores. */
const MODULOS = [
  "verdicts.js",
  "engine.js",
  "measure.browser.js",
  "page-audit.js",
  "coherence.js",
  "viewport.js",
  "dynamic.js",
  "axe-map.js",
  // El cuaderno va después del motor y de `verdicts`, que es de donde saca los
  // criterios y el vocabulario. En la extensión sirve para lo mismo que fuera:
  // decir qué criterios de juicio no vienen al caso en la página que se mira.
  "cuaderno.js",
  "oaw-letters.js",
  "report-oaw.js",
  "sampling.js",
  "pixel-contrast.js"
];

function abortar(msg) {
  console.error("✗ build-extension: " + msg);
  process.exit(1);
}

/** Nombres exportados por un módulo. */
function exportados(src) {
  const out = new Set();
  const re = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  const re2 = /^export\s*\{([^}]+)\}/gm;
  while ((m = re2.exec(src))) {
    m[1].split(",").forEach(function (t) {
      const n = t.trim().split(/\s+as\s+/).pop().trim();
      if (n) out.add(n);
    });
  }
  return Array.from(out);
}

/** Nombres importados desde otros módulos del paquete. */
function importados(src) {
  const out = new Set();
  const re = /^import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["'];?\s*$/gm;
  let m;
  while ((m = re.exec(src))) {
    m[1].split(",").forEach(function (t) {
      const n = t.trim().split(/\s+as\s+/)[0].trim();
      if (n) out.add(n);
    });
  }
  return Array.from(out);
}

/** Quita lo que solo tiene sentido en Node: drivers con Playwright, fs, zlib. */
function sinNode(src) {
  return src.replace(/\/\* NODE-ONLY:START \*\/[\s\S]*?\/\* NODE-ONLY:END \*\//g, "");
}

function aplanar(nombre, src) {
  const imp = importados(src);
  const exp = exportados(src);
  if (!exp.length) abortar(nombre + " no exporta nada: revisa el orden o el marcado NODE-ONLY");

  const limpio = src
    // Los import de otros módulos los resuelve el espacio de nombres.
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^import\s+[A-Za-z_$][\w$]*\s+from\s*["'][^"']+["'];?\s*$/gm, "")
    // `export` deja de tener sentido dentro de una IIFE.
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s)/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, "")
    // El navegador trae DOMParser nativo; el andamiaje de inyección sobra.
    .replace(/new _DOMParser\(/g, "new DOMParser(")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (/^\s*(import|export)\s/m.test(limpio)) {
    abortar(nombre + " conserva un import/export tras el aplanado: " + (/^\s*(import|export)\s.*$/m.exec(limpio) || [])[0]);
  }

  const cabecera = imp.length ? "  const { " + imp.join(", ") + " } = NS;\n" : "";
  const pie = exp.map(function (n) { return "  NS." + n + " = " + n + ";"; }).join("\n");
  return "/* ── " + nombre + " ── */\n(function (NS) {\n" + cabecera +
    limpio.split("\n").map(function (l) { return l.length ? "  " + l : l; }).join("\n") +
    "\n" + pie + "\n})(A11Y);\n";
}

const partes = [];
const todosExp = new Set();
for (const nombre of MODULOS) {
  // Se comprueba sobre el código YA sin las regiones de Node: lo que solo existe
  // allí (el decodificador PNG, los drivers) no cuenta como dependencia aquí.
  const src = sinNode(await readFile(join(SRC, nombre), "utf8"));
  // Comprobación de orden: no puede importar algo que aún no se ha definido.
  importados(src).forEach(function (n) {
    if (!todosExp.has(n)) abortar(nombre + " importa «" + n + "», que ningún módulo anterior exporta. Revisa el orden de MODULOS.");
  });
  exportados(src).forEach(function (n) { todosExp.add(n); });
  partes.push(aplanar(nombre, src));
}

const bundle =
  "/**\n" +
  " * Núcleo del Agente de Accesibilidad — GENERADO, no editar a mano.\n" +
  " *\n" +
  " *   fuente:  agente-a11y-motor/src/\n" +
  " *   genera:  npm run build:extension\n" +
  " *\n" +
  " * Cada módulo va en su propia IIFE y comparte el espacio de nombres `A11Y`:\n" +
  " * varios definen por su cuenta funciones con el mismo nombre (F, crit, loc…)\n" +
  " * y en un ámbito único se pisarían en silencio.\n" +
  " */\n" +
  "var A11Y = (typeof globalThis !== \"undefined\" ? globalThis : self).A11Y || {};\n" +
  "(typeof globalThis !== \"undefined\" ? globalThis : self).A11Y = A11Y;\n\n" +
  partes.join("\n");

// Chrome rechaza inyectar un fichero con «noncharacters» (U+FFFE, U+FFFF,
// U+FDD0–U+FDEF): dice «It isn't UTF-8 encoded» y la extensión no carga. Un
// rango escrito con el carácter literal en vez de con la secuencia de escape
// (`\u00a0-\uffff`) basta para dejarla muerta, y no lo ve ningún test.
for (let i = 0; i < bundle.length; i++) {
  const c = bundle.codePointAt(i);
  if (c === 0xFFFE || c === 0xFFFF || (c >= 0xFDD0 && c <= 0xFDEF)) {
    const linea = bundle.slice(0, i).split("\n").length;
    abortar("el bundle contiene el carácter U+" + c.toString(16).toUpperCase() +
      " (línea " + linea + "), que Chrome rechaza al inyectar: escríbelo como secuencia de escape en src/");
  }
}

// El bundle tiene que compilar antes de escribirse.
try { new Function(bundle); }
catch (e) { abortar("el bundle generado no compila: " + (e && e.message)); }

for (const clave of ["understand", "analyze", "runChecksReal", "auditPageDoc", "fingerprintPage", "analizarPixeles", "oawExport"]) {
  if (bundle.indexOf("NS." + clave + " = ") === -1) abortar("falta la exportación de " + clave + " en el bundle");
}

await mkdir(DEST, { recursive: true });
await writeFile(join(DEST, "motor.js"), bundle, "utf8");
console.log("✓ extension/motor.js generado desde src/ (" + MODULOS.length + " módulos, " + bundle.length + " bytes, " + todosExp.size + " exportaciones).");
