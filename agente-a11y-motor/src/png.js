/**
 * Decodificador PNG mínimo, sin dependencias.
 *
 * Hace falta para resolver el contraste del texto sobre degradados e imágenes:
 * ahí `getComputedStyle` no basta —no existe un «color de fondo»— y la única
 * forma honrada de dictaminar es mirar los píxeles de verdad. Playwright entrega
 * capturas en PNG, así que hay que abrirlas.
 *
 * Se implementa aquí en vez de traer una librería porque el alcance es diminuto y
 * conocido: lo que emite Chromium en una captura es PNG de 8 bits por canal, sin
 * entrelazar. Cubrimos los cuatro tipos de color de ese perfil y nada más; lo que
 * quede fuera lanza un error claro en lugar de devolver píxeles inventados.
 *
 * `inflateSync` lo pone Node. El resto es el desfiltrado, que son cinco casos.
 */
import { inflateSync } from "zlib";

const FIRMA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Canales por tipo de color PNG: 0 gris, 2 RGB, 3 paleta, 4 gris+alfa, 6 RGBA.
const CANALES = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decodifica un PNG a RGBA de 8 bits.
 * @param {Buffer|Uint8Array} buf
 * @returns {{ width:number, height:number, data:Uint8Array }} data en RGBA, 4 bytes por píxel
 */
export function decodePNG(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 8) throw new Error("PNG: fichero demasiado corto");
  for (let i = 0; i < 8; i++) if (b[i] !== FIRMA[i]) throw new Error("PNG: firma no válida");

  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos + 8 <= b.length) {
    const len = dv.getUint32(pos);
    const tipo = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7]);
    const ini = pos + 8;
    if (tipo === "IHDR") {
      ihdr = {
        width: dv.getUint32(ini), height: dv.getUint32(ini + 4),
        bitDepth: b[ini + 8], colorType: b[ini + 9],
        interlace: b[ini + 12]
      };
    } else if (tipo === "IDAT") {
      idat.push(b.subarray(ini, ini + len));
    } else if (tipo === "tRNS") {
      // Declara transparencia fuera del canal alfa. No se aplica, y devolver los
      // píxeles con alfa 255 sería inventarlos: el contrato de este módulo dice
      // que lo que queda fuera lanza un error claro, no que se adivine. Chromium
      // emite tipo de color 6 (RGBA), así que en la práctica no aparece.
      throw new Error("PNG: el chunk tRNS (transparencia por color) no está admitido; este decodificador no puede saber qué píxeles son transparentes");
    } else if (tipo === "IEND") break;
    pos = ini + len + 4; // + CRC
  }
  if (!ihdr) throw new Error("PNG: falta la cabecera IHDR");
  if (ihdr.bitDepth !== 8) throw new Error("PNG: solo se admiten 8 bits por canal (este tiene " + ihdr.bitDepth + ")");
  if (ihdr.interlace !== 0) throw new Error("PNG: no se admite el entrelazado Adam7");
  const canales = CANALES[ihdr.colorType];
  if (!canales) throw new Error("PNG: tipo de color no admitido (" + ihdr.colorType + "; la paleta queda fuera de alcance)");
  if (!idat.length) throw new Error("PNG: no hay datos de imagen");

  // Concatenar los IDAT e inflar.
  let total = 0;
  idat.forEach(function (c) { total += c.length; });
  const comprimido = new Uint8Array(total);
  let off = 0;
  idat.forEach(function (c) { comprimido.set(c, off); off += c.length; });
  const crudo = new Uint8Array(inflateSync(Buffer.from(comprimido.buffer, comprimido.byteOffset, comprimido.length)));

  const { width, height } = ihdr;
  const bpp = canales;               // bytes por píxel (8 bits por canal)
  const anchoLinea = width * bpp;
  const esperado = (anchoLinea + 1) * height;
  if (crudo.length < esperado) throw new Error("PNG: datos incompletos (" + crudo.length + " de " + esperado + " bytes)");

  // Desfiltrado, línea a línea, en su sitio.
  const plano = new Uint8Array(anchoLinea * height);
  for (let y = 0; y < height; y++) {
    const filtro = crudo[y * (anchoLinea + 1)];
    const src = y * (anchoLinea + 1) + 1;
    const dst = y * anchoLinea;
    const arriba = dst - anchoLinea;
    for (let x = 0; x < anchoLinea; x++) {
      const v = crudo[src + x];
      const a = x >= bpp ? plano[dst + x - bpp] : 0;           // píxel a la izquierda
      const arr = y > 0 ? plano[arriba + x] : 0;               // píxel de arriba
      const ai = (y > 0 && x >= bpp) ? plano[arriba + x - bpp] : 0; // arriba-izquierda
      let out;
      switch (filtro) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + arr; break;
        case 3: out = v + ((a + arr) >> 1); break;
        case 4: out = v + paeth(a, arr, ai); break;
        default: throw new Error("PNG: filtro desconocido (" + filtro + ") en la línea " + y);
      }
      plano[dst + x] = out & 0xff;
    }
  }

  // A RGBA.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    const s = i * bpp;
    if (canales === 4) { data[p] = plano[s]; data[p + 1] = plano[s + 1]; data[p + 2] = plano[s + 2]; data[p + 3] = plano[s + 3]; }
    else if (canales === 3) { data[p] = plano[s]; data[p + 1] = plano[s + 1]; data[p + 2] = plano[s + 2]; data[p + 3] = 255; }
    else if (canales === 2) { data[p] = data[p + 1] = data[p + 2] = plano[s]; data[p + 3] = plano[s + 1]; }
    else { data[p] = data[p + 1] = data[p + 2] = plano[s]; data[p + 3] = 255; }
  }
  return { width: width, height: height, data: data };
}
