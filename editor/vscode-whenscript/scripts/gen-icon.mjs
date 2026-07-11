#!/usr/bin/env node
// 零依赖生成 WhenScript 扩展图标(纯手写 PNG 编码,不依赖 canvas / sharp / 任何图形库)。
//
// 设计:深蓝紫底圆角方形(四角像素 alpha=0 裁圆)+ 中央一条"反应式脉冲"信号线——
// 低电平横线在中点跳变成高电平(方波阶跃),跳变沿粗一点、颜色最亮,
// 象征 WhenScript 的核心哲学"写入即触发求值"。
//
// 用法: node scripts/gen-icon.mjs [输出路径] [尺寸]
//   默认输出 ../icon.png,尺寸 256x256。

import { writeFileSync } from "node:fs";
import { deflateSync, crc32 as zlibCrc32 } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, process.argv[2] || "../icon.png");
const SIZE = Number(process.argv[3] || 256);

// ---------- CRC32(若 zlib 没暴露 crc32,就自己建查表实现,标准 IEEE 802.3 多项式) ----------
let crc32;
if (typeof zlibCrc32 === "function") {
  crc32 = (buf) => zlibCrc32(buf) >>> 0;
} else {
  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC_TABLE[n] = c >>> 0;
  }
  crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
}

// ---------- PNG chunk writer ----------
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ---------- 几何 / 着色辅助 ----------
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// smoothstep 抗锯齿:coverage 从 0 到 1,edge 附近 1px 宽的过渡带
function coverageFromSDF(d) {
  // d < 0 = 在形状内部,d > 0 = 外部;过渡带宽度 1px
  return clamp(0.5 - d, 0, 1);
}

function roundedRectSDF(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  const outside = Math.sqrt(ax * ax + ay * ay);
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
}

// ---------- 画布 ----------
const N = SIZE;
const raw = Buffer.alloc(N * N * 4);

// 背景色(深蓝紫渐变,顶深一点底更深,营造纵深)
const bgTop = [42, 30, 92]; // #2a1e5c
const bgBottom = [19, 14, 41]; // #130e29

// 圆角方形参数
const margin = N * 0.06;
const cx = N / 2;
const cy = N / 2;
const halfW = N / 2 - margin;
const halfH = N / 2 - margin;
const radius = N * 0.2;

// 信号线几何(按 256 基准比例换算)
const s = N / 256;
const lineY_low = 168 * s;
const lineY_high = 96 * s;
const xStart = 46 * s;
const xStep = 128 * s;
const xEnd = 210 * s;
const thickness = 15 * s;
const stepThickness = 19 * s; // 跳变沿更粗,强调"跳变"

const cyanCore = [125, 249, 255]; // 高亮跳变沿核心色(近白青)
const cyanLine = [34, 211, 238]; // 信号线主色(亮青色)
const cyanGlow = [56, 189, 248]; // 外围淡光晕色

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const px = x + 0.5;
    const py = y + 0.5;

    // 背景圆角方形 + 渐变色 + alpha 裁圆
    const d = roundedRectSDF(px, py, cx, cy, halfW, halfH, radius);
    const bgAlpha = coverageFromSDF(d);
    const gradT = clamp((py - (cy - halfH)) / (halfH * 2), 0, 1);
    let color = mixColor(bgTop, bgBottom, gradT);
    let alpha = bgAlpha;

    // 中心淡淡的径向光晕(呼应"脉冲"主题),只在背景内部叠加
    if (bgAlpha > 0) {
      const distCenter = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      const glowT = clamp(1 - distCenter / (N * 0.62), 0, 1) ** 2 * 0.16;
      color = mixColor(color, cyanGlow, glowT);
    }

    // 三段信号线的外发光(柔和,半径比线宽大)
    const glowHalf = thickness * 1.9;
    const dGlowLow = distToSegment(px, py, xStart, lineY_low, xStep, lineY_low);
    const dGlowStep = distToSegment(px, py, xStep, lineY_low, xStep, lineY_high);
    const dGlowHigh = distToSegment(px, py, xStep, lineY_high, xEnd, lineY_high);
    const dGlow = Math.min(dGlowLow, dGlowStep, dGlowHigh);
    if (dGlow < glowHalf && bgAlpha > 0.3) {
      const glowCoverage = clamp(1 - dGlow / glowHalf, 0, 1) ** 2 * 0.55;
      color = mixColor(color, cyanLine, glowCoverage);
    }

    // 信号线本体(低电平段 + 高电平段:细线;跳变沿:粗线+更亮核心色)
    const dLow = distToSegment(px, py, xStart, lineY_low, xStep, lineY_low) - thickness / 2;
    const dHigh = distToSegment(px, py, xStep, lineY_high, xEnd, lineY_high) - thickness / 2;
    const dStep = distToSegment(px, py, xStep, lineY_low, xStep, lineY_high) - stepThickness / 2;

    const covLow = coverageFromSDF(dLow);
    const covHigh = coverageFromSDF(dHigh);
    const covStep = coverageFromSDF(dStep);

    if (covLow > 0) color = mixColor(color, cyanLine, covLow);
    if (covHigh > 0) color = mixColor(color, cyanLine, covHigh);
    if (covStep > 0) color = mixColor(color, cyanCore, covStep);

    const idx = (y * N + x) * 4;
    raw[idx] = Math.round(clamp(color[0], 0, 255));
    raw[idx + 1] = Math.round(clamp(color[1], 0, 255));
    raw[idx + 2] = Math.round(clamp(color[2], 0, 255));
    raw[idx + 3] = Math.round(clamp(alpha, 0, 1) * 255);
  }
}

// ---------- 按扫描线加 filter byte(用 0=None,简单可靠)后 zlib deflate ----------
const stride = N * 4;
const scanlines = Buffer.alloc(N * (stride + 1));
for (let y = 0; y < N; y++) {
  const srcStart = y * stride;
  const dstStart = y * (stride + 1);
  scanlines[dstStart] = 0; // filter type: None
  raw.copy(scanlines, dstStart + 1, srcStart, srcStart + stride);
}
const idatData = deflateSync(scanlines, { level: 9 });

// ---------- IHDR ----------
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); // width
ihdr.writeUInt32BE(N, 4); // height
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  PNG_SIGNATURE,
  chunk("IHDR", ihdr),
  chunk("IDAT", idatData),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(outPath, png);
console.log(`已生成 ${outPath}(${N}x${N},${png.length} 字节)`);
