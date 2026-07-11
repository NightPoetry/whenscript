#!/usr/bin/env node
// 零依赖生成官网游戏的像素素材(手写 PNG 编码,思路同扩展的 gen-icon.mjs)。
// 全部素材为原创像素画:MC/Flappy 风格致敬,不复制任何官方贴图(规避侵权)。
// 用法: node gen-sprites.mjs   → 在本目录输出 apple.png / pillar.png / cap.png / ground.png / cloud.png

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── PNG 编码(16x16 RGBA,filter=0,无依赖)─────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function writePng(file, grid, palette) {
  const h = grid.length, w = grid[0].length;
  const raw = Buffer.alloc(h * (1 + w * 4));
  let o = 0;
  for (const row of grid) {
    raw[o++] = 0; // filter none
    for (const ch of row) {
      const [r, g, b, a] = palette[ch] || [0, 0, 0, 0];
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path.join(__dirname, file), png);
  console.log("✓", file, w + "x" + h);
}

// ── 金苹果(16x16)──────────────────────────────────────────────────────
const appleGrid = [
  "......KK........",
  "......KsK.......",
  ".....KsKLL......",
  "....KKsKLLL.....",
  "...KGGKGGKK.....",
  "..KGhhGGGGGK....",
  ".KGhhgGGGGGGK...",
  ".KGhgGGGGGGGK...",
  "KGhGGGGGGGGGdK..",
  "KGGGGGGGGGGGdK..",
  "KGGGGGGGGGGGdK..",
  "KGGGGGGGGGGdK...",
  ".KGGGGGGGGGdK...",
  ".KdGGGGGGGdK....",
  "..KddKKKddK.....",
  "...KKK.KKK......",
];
const applePal = {
  K: [58, 42, 10, 255],    // 深棕描边
  s: [107, 74, 31, 255],   // 果柄
  L: [87, 166, 74, 255],   // 叶
  G: [245, 197, 66, 255],  // 金
  g: [255, 226, 130, 255], // 亮金
  h: [255, 244, 190, 255], // 高光
  d: [209, 154, 18, 255],  // 暗金
};

// ── 石砖柱身(16x16,可无缝纵向平铺)───────────────────────────────────
const pillarGrid = [
  "mmmmmmmmmmmmmmmm",
  "mSSSSSSSmSSSSSSm",
  "mSssssssmSssssSm",
  "mSssssssmSssssSm",
  "mSSSSSSSmSSSSSSm",
  "mmmmmmmmmmmmmmmm",
  "mSSSmSSSSSSSmSSm",
  "mSssmSssssssmSsm",
  "mSssmSssssssmSsm",
  "mSSSmSSSSSSSmSSm",
  "mmmmmmmmmmmmmmmm",
  "mSSSSSSSmSSSSSSm",
  "mSssssssmSssssSm",
  "mSssssssmSssssSm",
  "mSSSSSSSmSSSSSSm",
  "mmmmmmmmmmmmmmmm",
];
const pillarPal = {
  m: [88, 92, 100, 255],    // 砖缝
  S: [148, 152, 160, 255],  // 砖面
  s: [128, 132, 140, 255],  // 砖面阴影
};

// ── 柱顶方块脸(16x16,恶搞"方块人"守卫——原创配色,非任何官方皮肤)──────
const capGrid = [
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHHHHHHHHHHHHHHH",
  "HHffffffffffffHH",
  "HffffffffffffffH",
  "HffffffffffffffH",
  "HffEEffffffEEffH",
  "HffEeffffffEeffH",
  "HffffffnnffffffH",
  "HffffffnnffffffH",
  "HffffffffffffffH",
  "HffffMMMMMMffffH",
  "HffffffffffffffH",
  "HffffffffffffffH",
  "HHffffffffffffHH",
  "HHHHHHHHHHHHHHHH",
];
const capPal = {
  H: [74, 52, 34, 255],    // 头发/边框深棕
  f: [214, 168, 122, 255], // 皮肤
  E: [255, 255, 255, 255], // 眼白
  e: [63, 72, 204, 255],   // 眼珠蓝
  n: [173, 126, 84, 255],  // 鼻影
  M: [130, 84, 56, 255],   // 嘴
};

// ── 草方块地面(16x16,可无缝横向平铺)─────────────────────────────────
const groundGrid = [
  "gGgGGgGgGGgGgGGg",
  "GgGgGgGGgGgGGgGg",
  "ggGGgLgGgLgGgGgL",
  "LgLgGgLgGgGLgLgG",
  "DdDDdDdDDdDdDDdD",
  "dDdOdDdDOdDdOdDd",
  "DdDDdDdDDdDdDDdD",
  "dDdDdOdDdDdDdDOd",
  "DDdDdDdDDdOdDdDD",
  "dDdODdDdDdDdDdDd",
  "DdDDdDdODdDdDDdD",
  "dDdDdDdDdDdOdDdd",
  "DdODdDdDDdDdDDdD",
  "dDdDdDdDdDdDdDOd",
  "DdDDdOdDDdDdDDdD",
  "dDdDdDdDDdDdDdDd",
];
const groundPal = {
  g: [106, 190, 48, 255],  // 草亮
  G: [86, 160, 38, 255],   // 草
  L: [66, 130, 30, 255],   // 草暗
  D: [134, 96, 60, 255],   // 土
  d: [120, 85, 52, 255],   // 土暗
  O: [96, 66, 40, 255],    // 石粒
};

// ── 像素云(24x12)──────────────────────────────────────────────────────
const cloudGrid = [
  "........WWWWWW..........",
  "......WWWWWWWWWW........",
  "....WWWWWWWWWWWWWW......",
  "..WWWWWWWWWWWWWWWWWW....",
  ".WWWWWWWWWWWWWWWWWWWW...",
  "WWWWWWWWWWWWWWWWWWWWWWW.",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  "WWWWWWWWWWWWWWWWWWWWWWWW",
  ".WWWWWWWWWWWWWWWWWWWWWW.",
  "..WWWWWWWWWWWWWWWWWWWW..",
  "....WWWWWWWWWWWWWW......",
  "........................",
];
const cloudPal = { W: [255, 255, 255, 235] };

writePng("apple.png", appleGrid, applePal);
writePng("pillar.png", pillarGrid, pillarPal);
writePng("cap.png", capGrid, capPal);
writePng("ground.png", groundGrid, groundPal);
writePng("cloud.png", cloudGrid, cloudPal);
