/**
 * gen-icons.mjs — Hibiki アイコン生成スクリプト
 *
 * 外部依存なし（Node v18+ 標準モジュールのみ）。
 *
 * 生成物:
 *   icons/icon.svg              — ソース SVG（manifest でも使用）
 *   icons/icon-192.png          — 192×192 PNG  (purpose: any)
 *   icons/icon-512.png          — 512×512 PNG  (purpose: any)
 *   icons/icon-512-maskable.png — 512×512 PNG  (purpose: maskable)
 *   icons/apple-touch-icon-180.png — 180×180 PNG (iOS ホーム画面)
 *
 * PNG は zlib（Node 標準）を使った純粋自前実装でエンコード。
 * デザイン: 背景 #0a0a1a、同心円の波紋、アクセントグラデ (#5be1c4 → #7b5be1)。
 *
 * 使い方:
 *   node tools/gen-icons.mjs
 */

import { createDeflate } from 'zlib';
import { createWriteStream, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { Writable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = resolve(__dirname, '../icons');

mkdirSync(ICONS_DIR, { recursive: true });

// ---- 色定数 ----
const BG   = { r: 0x0a, g: 0x0a, b: 0x1a };      // #0a0a1a
const C1   = { r: 0x5b, g: 0xe1, b: 0xc4 };       // #5be1c4 (ティール)
const C2   = { r: 0x7b, g: 0x5b, b: 0xe1 };       // #7b5be1 (パープル)
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

// ---- SVG 生成 ----
function buildSVG(size) {
  const cx = size / 2;
  const rings = 5;
  const maxR = size * 0.44;
  const ringGap = maxR / rings;
  const strokeW = Math.max(1, size * 0.012);

  let circles = '';
  for (let i = 1; i <= rings; i++) {
    const r = ringGap * i;
    const t = (i - 1) / (rings - 1);   // 0..1
    // 外側ほど薄く
    const opacity = 0.85 - t * 0.55;
    circles += `<circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}"
      fill="none"
      stroke="url(#wg)"
      stroke-width="${strokeW.toFixed(2)}"
      opacity="${opacity.toFixed(3)}"/>\n`;
  }

  // 中央の光点
  const dotR = size * 0.065;
  const glowR = size * 0.14;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#141430"/>
      <stop offset="100%" stop-color="#0a0a1a"/>
    </radialGradient>
    <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#5be1c4"/>
      <stop offset="100%" stop-color="#7b5be1"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#5be1c4" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#7b5be1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <!-- 背景 -->
  <rect width="${size}" height="${size}" rx="${(size * 0.18).toFixed(2)}" fill="url(#bg)"/>
  <!-- 波紋リング -->
  ${circles}
  <!-- 中央グロー -->
  <circle cx="${cx}" cy="${cx}" r="${glowR.toFixed(2)}" fill="url(#glow)" opacity="0.55"/>
  <!-- 中央点 -->
  <circle cx="${cx}" cy="${cx}" r="${dotR.toFixed(2)}" fill="#5be1c4" opacity="0.95"/>
</svg>`;
}

// icons/icon.svg を書き出す
import { writeFileSync } from 'fs';

const svgContent = buildSVG(512);
writeFileSync(resolve(ICONS_DIR, 'icon.svg'), svgContent, 'utf-8');
console.log('icon.svg を生成しました');

// ---- PNG 自前エンコード ----

/**
 * 色をピクセル単位でラスタライズしてピクセル配列を作る。
 * @param {number} size
 * @param {boolean} maskable - maskable の場合は safe-zone 外を BG で塗る
 */
function rasterize(size, maskable = false) {
  const cx = size / 2;
  const cy = size / 2;
  // maskable safe zone: 内接円の80%（中央40%=0.4*size radius に収まるようにする）
  const safeR = maskable ? size * 0.40 : Infinity;

  const rings = 5;
  const maxR = size * 0.44;
  const ringGap = maxR / rings;
  const strokeW = Math.max(1, size * 0.012);
  const dotR = size * 0.065;
  const glowR = size * 0.14;

  // lerp 2色
  function lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    };
  }

  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // maskable: safe-zone 外は BG のみ
      if (maskable && dist > safeR) {
        pixels[idx]     = BG.r;
        pixels[idx + 1] = BG.g;
        pixels[idx + 2] = BG.b;
        pixels[idx + 3] = 255;
        continue;
      }

      // 背景グラデ（中心 #141430 → 外 #0a0a1a）
      const bgT = Math.min(dist / (size * 0.5), 1);
      const bgR = Math.round(0x14 + (BG.r - 0x14) * bgT);
      const bgG = Math.round(0x14 + (BG.g - 0x14) * bgT);
      const bgB = Math.round(0x30 + (BG.b - 0x30) * bgT);

      let pr = bgR, pg = bgG, pb = bgB, pa = 255;

      // 波紋リング
      for (let i = 1; i <= rings; i++) {
        const r = ringGap * i;
        const d = Math.abs(dist - r);
        if (d < strokeW) {
          const t = (i - 1) / (rings - 1);
          const col = lerpColor(C1, C2, t);
          const opacity = (0.85 - t * 0.55) * (1 - d / strokeW);
          pr = Math.round(pr * (1 - opacity) + col.r * opacity);
          pg = Math.round(pg * (1 - opacity) + col.g * opacity);
          pb = Math.round(pb * (1 - opacity) + col.b * opacity);
        }
      }

      // 中央グロー
      if (dist < glowR) {
        const glowT = 1 - dist / glowR;
        const glowOp = 0.55 * glowT * glowT;
        const glowCol = lerpColor(C2, C1, glowT);
        pr = Math.round(pr * (1 - glowOp) + glowCol.r * glowOp);
        pg = Math.round(pg * (1 - glowOp) + glowCol.g * glowOp);
        pb = Math.round(pb * (1 - glowOp) + glowCol.b * glowOp);
      }

      // 中央点
      if (dist < dotR) {
        const dT = 1 - dist / dotR;
        pr = Math.round(pr * (1 - dT) + C1.r * dT);
        pg = Math.round(pg * (1 - dT) + C1.g * dT);
        pb = Math.round(pb * (1 - dT) + C1.b * dT);
      }

      pixels[idx]     = pr;
      pixels[idx + 1] = pg;
      pixels[idx + 2] = pb;
      pixels[idx + 3] = pa;
    }
  }

  return pixels;
}

/**
 * RGBA ピクセル配列 → PNG Buffer
 * 純粋 Node 標準（zlib）実装。
 */
async function encodePNG(pixels, width, height) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // チャンク生成ヘルパ
  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf  = crc32(Buffer.concat([typeBuf, data]));
    const lenBuf  = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 2;   // color type: RGB (2)
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  // IDAT: filter type 0 (None) を各行先頭に付加して deflate
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter=None
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (1 + width * 3) + 1 + x * 3;
      raw[di]     = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      // alpha は使わない（RGB PNG）
    }
  }

  const compressed = await deflateBuffer(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
}

/** Buffer を deflate で圧縮して Buffer を返す */
function deflateBuffer(buf) {
  return new Promise((resolve, reject) => {
    const deflate = createDeflate({ level: 6 });
    const chunks = [];
    deflate.on('data', (c) => chunks.push(c));
    deflate.on('end',  ()  => resolve(Buffer.concat(chunks)));
    deflate.on('error', reject);
    deflate.write(buf);
    deflate.end();
  });
}

/** CRC-32 テーブル生成 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const b = Buffer.alloc(4);
  b.writeUInt32BE(crc, 0);
  return b;
}

/** PNG を指定パスに書き出す */
async function writePNG(path, size, maskable = false) {
  const pixels = rasterize(size, maskable);
  const buf = await encodePNG(pixels, size, size);
  writeFileSync(path, buf);
  console.log(`${path.split('/').pop()} を生成しました (${size}×${size}${maskable ? ', maskable' : ''})`);
}

// ---- 全アイコン生成 ----
await writePNG(resolve(ICONS_DIR, 'icon-192.png'),          192);
await writePNG(resolve(ICONS_DIR, 'icon-512.png'),          512);
await writePNG(resolve(ICONS_DIR, 'icon-512-maskable.png'), 512, true);
await writePNG(resolve(ICONS_DIR, 'apple-touch-icon-180.png'), 180);

console.log('\n完了:');
import { readdirSync, statSync } from 'fs';
const files = readdirSync(ICONS_DIR);
for (const f of files) {
  const s = statSync(resolve(ICONS_DIR, f));
  console.log(`  ${f.padEnd(32)} ${(s.size / 1024).toFixed(1)} KB`);
}
