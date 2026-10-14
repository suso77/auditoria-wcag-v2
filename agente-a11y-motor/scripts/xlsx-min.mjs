/**
 * LEER UNA HOJA DE CÁLCULO SIN DEPENDER DE NADA.
 *
 * La hoja de seguimiento de una auditoría humana viene en `.xlsx`, siempre. Y el
 * motor no tiene ni una dependencia de ejecución: meter una librería de Excel
 * para leer una matriz de criterios sería pagar muy caro una tabla.
 *
 * Un `.xlsx` es un ZIP con XML dentro, y para ESTO —leer celdas de texto de una
 * hoja— hace falta poco: el directorio central del ZIP, `inflateRaw` (que viene
 * en Node), la tabla de cadenas compartidas y el XML de la hoja.
 *
 * Lo que este lector NO hace, dicho aquí para que nadie lo descubra a base de
 * resultados raros: no evalúa fórmulas (devuelve el valor cacheado que Excel
 * dejó escrito, y si no hay, nada), no entiende formatos de fecha (un número
 * sale como número), y no mira colores ni comentarios ni celdas combinadas —de
 * una combinada devuelve el valor en su celda de arriba a la izquierda y vacío
 * en las demás, que es como está guardado—. Para una matriz de criterios y
 * veredictos escritos a mano es exactamente lo que se necesita.
 */
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/* ── El ZIP ────────────────────────────────────────────────────────────────
 * Se lee por el DIRECTORIO CENTRAL, al final del fichero, y no recorriendo las
 * cabeceras locales desde el principio: cuando el que escribió el ZIP usó
 * descriptor de datos, en la cabecera local los tamaños van a cero y recorrer
 * por ahí se pierde. El directorio central siempre los tiene. */
const BUSCA_EOCD = 22;           // tamaño del registro de fin de directorio
const MAX_COMENTARIO = 0xffff;

function entradasDe(buf) {
  let fin = -1;
  const desde = Math.max(0, buf.length - (BUSCA_EOCD + MAX_COMENTARIO));
  for (let i = buf.length - BUSCA_EOCD; i >= desde; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin === -1) throw new Error("no parece un ZIP (no encuentro el fin del directorio central)");
  const cuantas = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out = new Map();
  for (let n = 0; n < cuantas; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("directorio central corrupto en la entrada " + n);
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const nLargo = buf.readUInt16LE(p + 28);
    const extraLargo = buf.readUInt16LE(p + 30);
    const comentLargo = buf.readUInt16LE(p + 32);
    const desplaza = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + nLargo);
    out.set(nombre, { metodo: metodo, comprimido: comprimido, desplaza: desplaza });
    p += 46 + nLargo + extraLargo + comentLargo;
  }
  return out;
}

function saca(buf, e) {
  if (buf.readUInt32LE(e.desplaza) !== 0x04034b50) throw new Error("cabecera local corrupta");
  const nLargo = buf.readUInt16LE(e.desplaza + 26);
  const extraLargo = buf.readUInt16LE(e.desplaza + 28);
  const ini = e.desplaza + 30 + nLargo + extraLargo;
  const datos = buf.subarray(ini, ini + e.comprimido);
  if (e.metodo === 0) return datos;
  if (e.metodo === 8) return inflateRawSync(datos);
  throw new Error("método de compresión " + e.metodo + " no soportado");
}

/* ── El XML ────────────────────────────────────────────────────────────────
 * No hace falta un analizador: lo que se busca son etiquetas conocidas. */
const DESESCAPA = function (s) {
  return s.replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(Number(d)); })
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
};
/* El texto de una celda o de una cadena compartida puede venir partido en
 * varios `<t>` (cada trozo con su formato). Se pegan todos. */
const textoDe = (xml) => {
  const t = xml.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
  return DESESCAPA(t.map((x) => x.replace(/^<t[^>]*>/, "").replace(/<\/t>$/, "")).join(""));
};

const columnaANumero = function (ref) {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return 0;
  let n = 0;
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
};

/**
 * Devuelve { hojas: [nombre…], filas(nombre) } — las filas como matriz de
 * cadenas, con los huecos como "".
 */
export async function leeLibro(ruta) {
  const buf = await readFile(ruta);
  const ent = entradasDe(buf);
  const txt = (n) => (ent.has(n) ? saca(buf, ent.get(n)).toString("utf8") : null);

  const libro = txt("xl/workbook.xml");
  if (!libro) throw new Error("no encuentro xl/workbook.xml: ¿seguro que es un .xlsx?");
  /* El orden de `<sheet>` en workbook.xml es el de las pestañas; el fichero de
   * cada una se resuelve por su r:id en los `_rels`. */
  const rels = txt("xl/_rels/workbook.xml.rels") || "";
  const porId = {};
  (rels.match(/<Relationship\b[^>]*>/g) || []).forEach((r) => {
    const id = /Id="([^"]+)"/.exec(r), tg = /Target="([^"]+)"/.exec(r);
    if (id && tg) porId[id[1]] = tg[1].replace(/^\/?xl\//, "").replace(/^\.\//, "");
  });
  const hojas = [];
  (libro.match(/<sheet\b[^>]*>/g) || []).forEach((h) => {
    const nm = /name="([^"]*)"/.exec(h);
    const rid = /r:id="([^"]+)"/.exec(h);
    if (nm) hojas.push({ nombre: DESESCAPA(nm[1]), fichero: rid && porId[rid[1]] ? "xl/" + porId[rid[1]] : null });
  });

  const compartidas = [];
  const ss = txt("xl/sharedStrings.xml");
  if (ss) (ss.match(/<si>[\s\S]*?<\/si>/g) || []).forEach((si) => compartidas.push(textoDe(si)));

  const filasDe = function (nombre) {
    const h = hojas.find((x) => x.nombre === nombre);
    if (!h || !h.fichero) throw new Error("no existe la hoja «" + nombre + "». Hay: " + hojas.map((x) => x.nombre).join(", "));
    const xml = txt(h.fichero);
    if (xml === null) throw new Error("la hoja «" + nombre + "» no trae datos en el fichero");
    const out = [];
    (xml.match(/<row\b[^>]*>[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []).forEach((row) => {
      const rn = /\br="(\d+)"/.exec(row);
      const fila = [];
      (row.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || []).forEach((c) => {
        const ref = /\br="([A-Z]+\d+)"/.exec(c);
        const col = ref ? columnaANumero(ref[1]) : fila.length + 1;
        const tipo = /\bt="([^"]+)"/.exec(c);
        let v = "";
        if (tipo && tipo[1] === "inlineStr") v = textoDe(c);
        else {
          const vv = /<v[^>]*>([\s\S]*?)<\/v>/.exec(c);
          if (vv) {
            const bruto = DESESCAPA(vv[1]);
            if (tipo && tipo[1] === "s") v = compartidas[Number(bruto)] !== undefined ? compartidas[Number(bruto)] : "";
            else v = bruto;
          } else if (tipo && tipo[1] === "str") v = textoDe(c);
        }
        while (fila.length < col - 1) fila.push("");
        fila[col - 1] = v;
      });
      const ix = rn ? Number(rn[1]) - 1 : out.length;
      while (out.length < ix) out.push([]);
      out[ix] = fila;
    });
    return out;
  };

  return { hojas: hojas.map((h) => h.nombre), filas: filasDe };
}
