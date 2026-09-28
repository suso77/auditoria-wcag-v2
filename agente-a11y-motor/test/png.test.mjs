import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodePNG } from "../src/png.js";

/** Codificador PNG mínimo, solo para las pruebas: permite ida y vuelta. */
function encodePNG(width, height, canales, pixeles, filtros) {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const colorType = { 1: 0, 2: 4, 3: 2, 4: 6 }[canales];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const anchoLinea = width * canales;
  const crudo = Buffer.alloc((anchoLinea + 1) * height);
  for (let y = 0; y < height; y++) {
    const f = filtros ? filtros[y] : 0;
    crudo[y * (anchoLinea + 1)] = f;
    for (let x = 0; x < anchoLinea; x++) {
      const v = pixeles[y * anchoLinea + x];
      const a = x >= canales ? pixeles[y * anchoLinea + x - canales] : 0;
      const arr = y > 0 ? pixeles[(y - 1) * anchoLinea + x] : 0;
      const ai = (y > 0 && x >= canales) ? pixeles[(y - 1) * anchoLinea + x - canales] : 0;
      let e;
      if (f === 0) e = v;
      else if (f === 1) e = v - a;
      else if (f === 2) e = v - arr;
      else if (f === 3) e = v - ((a + arr) >> 1);
      else {
        const p = a + arr - ai, pa = Math.abs(p - a), pb = Math.abs(p - arr), pc = Math.abs(p - ai);
        e = v - (pa <= pb && pa <= pc ? a : (pb <= pc ? arr : ai));
      }
      crudo[y * (anchoLinea + 1) + 1 + x] = e & 0xff;
    }
  }
  const chunk = (tipo, datos) => {
    const b = Buffer.alloc(8 + datos.length + 4);
    b.writeUInt32BE(datos.length, 0);
    b.write(tipo, 4, "ascii");
    Buffer.from(datos).copy(b, 8);
    b.writeUInt32BE(0, 8 + datos.length); // CRC: el decodificador no lo verifica
    return b;
  };
  return Buffer.concat([firma, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(crudo)), chunk("IEND", Buffer.alloc(0))]);
}

test("ida y vuelta en RGBA con filtro 0", () => {
  const px = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 9, 9, 9, 1]);
  const img = decodePNG(encodePNG(2, 2, 4, px));
  assert.equal(img.width, 2); assert.equal(img.height, 2);
  assert.deepEqual([...img.data], [...px]);
});

test("los cinco filtros PNG se desfiltran igual", () => {
  const w = 6, h = 5, canales = 3;
  const px = new Uint8Array(w * h * canales);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37 + 11) & 0xff;
  const esperado = decodePNG(encodePNG(w, h, canales, px, [0, 0, 0, 0, 0]));
  [[1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4], [0, 1, 2, 3, 4]].forEach((f) => {
    const img = decodePNG(encodePNG(w, h, canales, px, f));
    assert.deepEqual([...img.data], [...esperado.data], "filtro " + f.join(","));
  });
});

test("RGB sin alfa se expande a RGBA opaco", () => {
  const img = decodePNG(encodePNG(1, 1, 3, Uint8Array.from([10, 20, 30])));
  assert.deepEqual([...img.data], [10, 20, 30, 255]);
});

test("escala de grises se expande a RGBA", () => {
  assert.deepEqual([...decodePNG(encodePNG(1, 1, 1, Uint8Array.from([77]))).data], [77, 77, 77, 255]);
  assert.deepEqual([...decodePNG(encodePNG(1, 1, 2, Uint8Array.from([77, 128]))).data], [77, 77, 77, 128]);
});

test("una imagen grande se decodifica entera y sin desfase", () => {
  const w = 40, h = 30;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    px[i] = x * 6 & 255; px[i + 1] = y * 8 & 255; px[i + 2] = (x + y) & 255; px[i + 3] = 255;
  }
  const img = decodePNG(encodePNG(w, h, 4, px, Array.from({ length: h }, (_, y) => y % 5)));
  assert.deepEqual([...img.data], [...px]);
});

/* ── Lo que NO admite se dice, no se inventa ── */

test("un fichero que no es PNG se rechaza", () => {
  assert.throws(() => decodePNG(Buffer.from("no soy un png aunque lo parezca")), /firma no válida/);
  assert.throws(() => decodePNG(Buffer.from([1, 2])), /demasiado corto/);
});

test("lo que queda fuera de alcance lanza un error claro", () => {
  const roto = encodePNG(2, 2, 4, new Uint8Array(16));
  roto[8 + 8 + 8] = 16;                         // bitDepth = 16
  assert.throws(() => decodePNG(roto), /8 bits por canal/);
  const entre = encodePNG(2, 2, 4, new Uint8Array(16));
  entre[8 + 8 + 12] = 1;                        // interlace Adam7
  assert.throws(() => decodePNG(entre), /entrelazado/);
});

test("un PNG con tRNS lanza error en vez de inventar el alfa", () => {
  // El chunk tRNS declara transparencia fuera del canal alfa. Ignorarlo devolvía
  // los píxeles con alfa 255: un color inventado justo donde había transparencia,
  // y el contraste medido sobre él sería falso. La cabecera del módulo promete un
  // error claro para lo que queda fuera de alcance; ahora lo cumple.
  const crc = (buf) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  };
  const chunk = (tipo, datos) => {
    const t = Buffer.from(tipo, "ascii"), d = Buffer.from(datos);
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, d])));
    return Buffer.concat([len, t, d, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("tRNS", Buffer.from([0, 255, 0, 0, 0, 0])),
    chunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00])),
    chunk("IEND", Buffer.alloc(0))
  ]);
  assert.throws(() => decodePNG(png), /tRNS/);
});
