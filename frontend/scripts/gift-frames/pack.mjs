import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';
const SRC = path.join(HERE, 'frames'), OUT = path.join(HERE, '../../public/gift-frames');
const SS = 2, VW = 672, VH = 640, OS = 0.85; // output pixels per virtual-frame pixel
fs.mkdirSync(OUT, { recursive: true });
const manifest = { width: VW, height: VH, sheets: {} };
for (const name of fs.readdirSync(SRC).filter((n) => !n.endsWith('.png') && !n.startsWith('loop-')).sort()) {
  const files = fs.readdirSync(SRC + '/' + name).sort();
  let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
  const raws = [];
  for (const f of files) {
    const { data, info } = await sharp(SRC + '/' + name + '/' + f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    raws.push(f);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  // align crop to the supersampling grid, 2px margin
  x0 = Math.max(0, Math.floor(x0 / SS) * SS - 2 * SS); y0 = Math.max(0, Math.floor(y0 / SS) * SS - 2 * SS);
  x1 = Math.min(VW * SS, Math.ceil((x1 + 1) / SS) * SS + 2 * SS); y1 = Math.min(VH * SS, Math.ceil((y1 + 1) / SS) * SS + 2 * SS);
  const cw = Math.round((x1 - x0) / SS * OS), ch = Math.round((y1 - y0) / SS * OS);
  const n = files.length, cols = Math.ceil(Math.sqrt(n * ch / cw)), rows = Math.ceil(n / cols);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const buf = await sharp(SRC + '/' + name + '/' + files[i]).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer();
    cells.push({ input: buf, left: (i % cols) * cw, top: Math.floor(i / cols) * ch });
  }
  await sharp({ create: { width: cols * cw, height: rows * ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells).webp({ quality: 84, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(OUT + '/' + name + '.webp');
  manifest.sheets[name] = { frames: n, cols, rows, cellW: cw, cellH: ch, x: x0 / SS / VW, y: y0 / SS / VH, w: (x1 - x0) / SS / VW, h: (y1 - y0) / SS / VH };
  console.log(name, n, cols + 'x' + rows, cw + 'x' + ch, (fs.statSync(OUT + '/' + name + '.webp').size / 1024).toFixed(0) + 'KB');
}

// Looping turntable videos (VP9 + alpha, Chromium): frames/loop-<tone>/0000.png …
const LOOP_FPS = 30;
manifest.loops = {};
for (const name of fs.readdirSync(SRC).filter((n) => n.startsWith('loop-')).sort()) {
  const dir = SRC + '/' + name;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  const first = await sharp(dir + '/' + files[0]).metadata();
  const ss = first.width / VW; // supersampling the frames were rendered with
  let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
  for (let i = 0; i < files.length; i += 4) {
    const { data, info } = await sharp(dir + '/' + files[i]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const pad = Math.ceil(6 * ss);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(first.width, x1 + pad); y1 = Math.min(first.height, y1 + pad);
  // even output size (yuv420), OS output pixels per virtual pixel
  const LOOP_OS = 0.72; // ≈ 1:1 with the hero container at 1x
  const ow = Math.round(((x1 - x0) / ss) * LOOP_OS / 2) * 2, oh = Math.round(((y1 - y0) / ss) * LOOP_OS / 2) * 2;
  const tmp = fs.mkdtempSync(path.join(HERE, 'tmp-'));
  for (let i = 0; i < files.length; i++) {
    await sharp(dir + '/' + files[i]).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).resize(ow, oh, { kernel: 'lanczos3' }).png().toFile(path.join(tmp, String(i).padStart(4, '0') + '.png'));
  }
  const out = path.join(OUT, name + '.webm');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(LOOP_FPS), '-i', path.join(tmp, '%04d.png'),
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '44', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-auto-alt-ref', '0', '-an', out], { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
  manifest.loops[name.slice(5)] = { x: x0 / ss / VW, y: y0 / ss / VH, w: (x1 - x0) / ss / VW, h: (y1 - y0) / ss / VH, width: ow, height: oh };
  console.log(name, files.length + ' frames', ow + 'x' + oh, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}
// pile still: trim transparent top, keep full width
const pile = sharp(SRC + '/pile.png');
const meta = await pile.metadata();
await sharp(SRC + '/pile.png').resize(Math.round(meta.width * 0.75)).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(OUT + '/pile.webp');
manifest.pile = { width: Math.round(meta.width * 0.75), height: Math.round(meta.height * 0.75) };
console.log('pile', (fs.statSync(OUT + '/pile.webp').size / 1024).toFixed(0) + 'KB');
const f = (v) => v.toFixed(5);
const lines = [
  '/* Generated by scripts/gift-frames/pack.mjs. Do not edit by hand. */',
  'export type FrameSheet = { frames: number; cols: number; rows: number; cellW: number; cellH: number; x: number; y: number; w: number; h: number };',
  '/** Size of the virtual frame the sheets were cut from (camera aspect 1.05). */',
  `export const FRAME_W = ${VW};`,
  `export const FRAME_H = ${VH};`,
  'export const FRAME_SHEETS: Record<string, FrameSheet> = {',
  ...Object.entries(manifest.sheets).map(([k, v]) => `  '${k}': { frames: ${v.frames}, cols: ${v.cols}, rows: ${v.rows}, cellW: ${v.cellW}, cellH: ${v.cellH}, x: ${f(v.x)}, y: ${f(v.y)}, w: ${f(v.w)}, h: ${f(v.h)} },`),
  '};',
  `export const PILE_IMAGE = { width: ${manifest.pile.width}, height: ${manifest.pile.height} };`,
  '/** Seamless turntable videos (crop of the virtual frame, like the sheets). */',
  `export const LOOP_VIDEOS: Partial<Record<'red' | 'green' | 'graphite', { x: number; y: number; w: number; h: number; width: number; height: number }>> = {`,
  ...Object.entries(manifest.loops).map(([k, v]) => `  ${k}: { x: ${f(v.x)}, y: ${f(v.y)}, w: ${f(v.w)}, h: ${f(v.h)}, width: ${v.width}, height: ${v.height} },`),
  '};'
];
fs.writeFileSync(path.join(HERE, '../../src/gl/giftFramesData.ts'), lines.join('\n') + '\n');
