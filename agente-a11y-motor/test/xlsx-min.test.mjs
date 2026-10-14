import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leeLibro } from "../scripts/xlsx-min.mjs";

/**
 * EL LECTOR DE `.xlsx` SIN DEPENDENCIAS.
 *
 * La hoja de seguimiento de una auditoría humana viene siempre en `.xlsx`, y el
 * motor no tiene ni una dependencia de ejecución: meter una librería de Excel
 * para leer una matriz de criterios sería pagar muy caro una tabla.
 *
 * DÓNDE SE COMPROBÓ DE VERDAD: contra el libro real de una auditoría de un
 * sitio —seis pestañas, 1006 filas en la de seguimiento, cadenas compartidas,
 * celdas desplazadas— y celda por celda contra lo que leía `openpyxl`. Eso no
 * se puede dejar en el repositorio, porque son datos de un cliente.
 *
 * Así que estos tests montan ZIPs mínimos pero DE VERDAD —directorio central,
 * `deflateRaw`, el XML tal como lo escribe Excel— para fijar lo que el lector
 * tiene que saber hacer y, sobre todo, lo que tiene que decir cuando no puede.
 */

/* Un .xlsx es un ZIP, y aquí se escribe uno a mano para no depender de nada
 * tampoco en los tests. Solo lo que el lector necesita leer. */
const zip = (entradas) => {
  const locales = [], centrales = [];
  let desplaza = 0;
  for (const [nombre, texto] of entradas) {
    const n = Buffer.from(nombre, "utf8");
    const crudo = Buffer.from(texto, "utf8");
    const comp = deflateRawSync(crudo);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(crudo.length, 22);
    lh.writeUInt16LE(n.length, 26);
    locales.push(lh, n, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(crudo.length, 24);
    ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(desplaza, 42);
    centrales.push(ch, n);
    desplaza += lh.length + n.length + comp.length;
  }
  const cuerpo = Buffer.concat(locales);
  const dir = Buffer.concat(centrales);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, dir, eocd]);
};

const LIBRO = '<?xml version="1.0"?><workbook xmlns:r="x"><sheets>' +
  '<sheet name="Seguimiento" sheetId="1" r:id="rId1"/><sheet name="Notas &amp; m&#xE1;s" sheetId="2" r:id="rId2"/>' +
  "</sheets></workbook>";
const RELS = '<?xml version="1.0"?><Relationships>' +
  '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>';
/* Una cadena compartida partida en dos `<t>`, que es como la deja Excel cuando
 * un trozo del texto va con otro formato. */
const SS = '<?xml version="1.0"?><sst count="3" uniqueCount="3">' +
  "<si><t>SC 1.4.11 — Contraste</t></si>" +
  "<si><r><t>No </t></r><r><t>aplica</t></r></si>" +
  "<si><t>Caf&#xE9; &amp; t&#xE9;</t></si></sst>";
const HOJA1 = '<?xml version="1.0"?><worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1"><v>3.5</v></c></row>' +
  '<row r="3"><c r="B3" t="inlineStr"><is><t>Total</t></is></c><c r="C3" t="s"><v>2</v></c></row>' +
  "</sheetData></worksheet>";

let dir;
const libroEn = async (nombre, entradas) => {
  if (!dir) dir = await mkdtemp(join(tmpdir(), "xlsxmin-"));
  const f = join(dir, nombre);
  await writeFile(f, zip(entradas));
  return f;
};
const COMPLETO = [
  ["xl/workbook.xml", LIBRO],
  ["xl/_rels/workbook.xml.rels", RELS],
  ["xl/sharedStrings.xml", SS],
  ["xl/worksheets/sheet1.xml", HOJA1],
  ["xl/worksheets/sheet2.xml", '<?xml version="1.0"?><worksheet><sheetData/></worksheet>']
];

test("xlsx: las pestañas salen en su orden y con sus entidades deshechas", async () => {
  const L = await leeLibro(await libroEn("a.xlsx", COMPLETO));
  assert.deepEqual(L.hojas, ["Seguimiento", "Notas & más"]);
});

test("xlsx: las celdas caen en su columna aunque la fila venga con huecos", async () => {
  const L = await leeLibro(await libroEn("b.xlsx", COMPLETO));
  const f = L.filas("Seguimiento");
  /* La fila 1 trae A, C y D: B tiene que quedar vacía, no desplazar nada. */
  assert.deepEqual(f[0], ["SC 1.4.11 — Contraste", "", "No aplica", "3.5"]);
  /* `r="3"` salta la fila 2: esa queda vacía y la tercera en su sitio. */
  assert.deepEqual(f[1], []);
  assert.deepEqual(f[2], ["", "Total", "Café & té"]);
});

test("xlsx: una cadena partida en varios <t> se pega, y las entidades se deshacen", async () => {
  const L = await leeLibro(await libroEn("c.xlsx", COMPLETO));
  const f = L.filas("Seguimiento");
  assert.equal(f[0][2], "No aplica", "venía en dos trozos: «No » y «aplica»");
  assert.equal(f[2][2], "Café & té");
});

test("xlsx: pedir una pestaña que no existe dice las que hay", async () => {
  const L = await leeLibro(await libroEn("d.xlsx", COMPLETO));
  assert.throws(() => L.filas("Barreras"), /no existe la hoja .*Seguimiento.*Notas/s);
});

test("xlsx: un fichero que no es un libro se dice así, no con un error de ZIP", async () => {
  const f = await libroEn("e.xlsx", [["mimetype", "application/vnd.oasis.opendocument.text"]]);
  await assert.rejects(() => leeLibro(f), /no encuentro xl\/workbook\.xml/);
});

test("xlsx: algo que no es ni un ZIP se dice en la primera frase", async () => {
  if (!dir) await libroEn("z.xlsx", COMPLETO);
  const f = join(dir, "f.xlsx");
  await writeFile(f, Buffer.from("esto no es un zip, es un csv mal nombrado\n", "utf8"));
  await assert.rejects(() => leeLibro(f), /no parece un ZIP/);
});
