// Gera o ícone da Órbita (PNG) sem dependências: desenha por campo de distância
// com supersampling e codifica o PNG com zlib do Node.
// Uso: node scripts/make-icon.mjs  -> tizen/icon.png (512x512) e src/assets/logo.png (256x256)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// paleta da marca (mesma de src/styles/tokens.css)
const VIOLET = [124, 92, 255];
const CYAN = [61, 214, 245];
const BG_TOP = [22, 20, 44];
const BG_BOTTOM = [8, 9, 18];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x) => Math.max(0, Math.min(1, x));

// amostra a cor (RGBA, 0..255, premultiplicada não) num ponto normalizado [-1,1]
function sample(x, y) {
  // fundo: quadrado arredondado
  const r = 0.22, h = 1 - r;
  const qx = Math.max(Math.abs(x) - h, 0), qy = Math.max(Math.abs(y) - h, 0);
  const dBox = Math.hypot(qx, qy) - r + Math.min(Math.max(Math.abs(x) - h, Math.abs(y) - h), 0);
  if (dBox > 0) return null;
  let col = mix(BG_TOP, BG_BOTTOM, clamp((y + 1) / 2));

  // halo suave atrás do planeta
  const dc = Math.hypot(x, y);
  col = mix(col, VIOLET, 0.35 * clamp(1 - dc / 0.75) ** 2);

  // planeta com gradiente diagonal
  const pr = 0.34;
  if (dc < pr) {
    const t = clamp((x - y + 0.5) / 1.0);
    const shade = 0.75 + 0.25 * clamp(1 - Math.hypot(x + 0.12, y + 0.12) / pr);
    col = mix(VIOLET, CYAN, t).map((v) => v * shade);
  }

  // órbita: elipse inclinada (só a metade da frente passa sobre o planeta)
  const a = -0.45, c = Math.cos(a), s = Math.sin(a);
  const ex = x * c - y * s, ey = x * s + y * c;
  const rx = 0.72, ry = 0.24;
  const k = Math.hypot(ex / rx, ey / ry);
  const ringD = Math.abs(k - 1) * Math.min(rx, ry);
  const front = ey > 0;
  if (ringD < 0.022 && (front || dc >= pr)) col = mix(CYAN, [255, 255, 255], 0.35);

  // satélite na órbita
  const ang = 0.55;
  const sx = rx * Math.cos(ang), sy = ry * Math.sin(ang);
  const wx = sx * c + sy * s, wy = -sx * s + sy * c;
  if (Math.hypot(x - wx, y - wy) < 0.065) col = [255, 255, 255];

  return col;
}

function render(size) {
  const SS = 4; // supersampling 4x4
  const px = Buffer.alloc(size * (size * 4 + 1));
  for (let j = 0; j < size; j++) {
    px[j * (size * 4 + 1)] = 0; // filtro PNG: none
    for (let i = 0; i < size; i++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let sj = 0; sj < SS; sj++) for (let si = 0; si < SS; si++) {
        const x = ((i + (si + 0.5) / SS) / size) * 2 - 1;
        const y = ((j + (sj + 0.5) / SS) / size) * 2 - 1;
        const c = sample(x, y);
        if (c) { rr += c[0]; gg += c[1]; bb += c[2]; aa++; }
      }
      const o = j * (size * 4 + 1) + 1 + i * 4;
      const n = SS * SS;
      px[o] = aa ? Math.round(rr / aa) : 0;
      px[o + 1] = aa ? Math.round(gg / aa) : 0;
      px[o + 2] = aa ? Math.round(bb / aa) : 0;
      px[o + 3] = Math.round((aa / n) * 255);
    }
  }
  return png(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8 bits RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(ROOT, 'src/assets'), { recursive: true });
writeFileSync(join(ROOT, 'tizen/icon.png'), render(512));
writeFileSync(join(ROOT, 'src/assets/logo.png'), render(256));
console.log('ícones gerados: tizen/icon.png, src/assets/logo.png');
