#!/usr/bin/env node
/**
 * asset-forge / render-compare.mjs: render an SVG to PNG and lay it next to the reference, so you can
 * Read one image and judge the match. Uses the project's `sharp` (librsvg); no browser needed.
 *
 *   node render-compare.mjs candidate.svg out.png                      just render (height 560)
 *   node render-compare.mjs candidate.svg out.png --ref reference.jpg  side by side + in-game sizes
 *   options: --height 560   --bg "#070502"   --small 54,80   (small sizes, px wide, shown as in the hand)
 *
 * The sheet shows: REFERENCE | CANDIDATE at the same height | the candidate at the small sizes it really
 * appears at in the game (pixel-scaled up so you can see what survives). Also prints the top colours of
 * both, so palette drift is visible as numbers.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadSharp } from "./load-sharp.mjs";
import { palette } from "./palette.mjs";

const sharp = loadSharp();
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const refPath = flag("--ref");
const H = Number(flag("--height", 560));
const bg = flag("--bg", "#070502");
const smalls = flag("--small", "54,80").split(",").map(Number);
const [inPath, outPath] = args;
if (!inPath || !outPath) {
  console.error("usage: node render-compare.mjs candidate.svg out.png [--ref reference.png] [--height 560] [--bg #hex] [--small 54,80]");
  process.exit(1);
}
mkdirSync(dirname(resolve(outPath)), { recursive: true });

const svg = readFileSync(inPath);
// density high enough that the SVG is rasterised at (at least) the target height, not upscaled
const meta = await sharp(svg).metadata();
const density = Math.max(72, Math.ceil((72 * H) / (meta.height || H)));
const cand = await sharp(svg, { density }).resize({ height: H }).png().toBuffer();
const candMeta = await sharp(cand).metadata();

if (!refPath) {
  await sharp(cand).toFile(outPath);
  console.log(`rendered ${outPath} (${candMeta.width}x${candMeta.height})`);
  console.log("candidate palette:", (await palette(cand, 6)).map((c) => `${c.hex} ${c.pct}%`).join("  "));
  process.exit(0);
}

// an SVG reference (e.g. an existing in-game back used as the anchor) must be rasterised at a matching density
const refIsSvg = /\.svg$/i.test(refPath);
const refDensity = refIsSvg ? Math.max(72, Math.ceil((72 * H) / ((await sharp(refPath).metadata()).height || H))) : undefined;
const ref = await sharp(refPath, refIsSvg ? { density: refDensity } : {}).resize({ height: H }).png().toBuffer();
const refMeta = await sharp(ref).metadata();

// small in-game sizes, scaled back up with nearest-neighbour so lost detail is obvious
const smallTiles = [];
for (const w of smalls) {
  const tiny = await sharp(svg, { density: 300 }).resize({ width: w }).png().toBuffer();
  const tm = await sharp(tiny).metadata();
  const up = Math.max(1, Math.floor(Math.min(H / 2 - 30, 260) / tm.height));
  smallTiles.push({ w, buf: await sharp(tiny).resize({ width: tm.width * up, kernel: "nearest" }).png().toBuffer(), up });
}
const smallMetas = await Promise.all(smallTiles.map((t) => sharp(t.buf).metadata()));
const smallColW = Math.max(...smallMetas.map((m) => m.width));

const pad = 24, label = 30;
const W = pad + refMeta.width + pad + candMeta.width + pad + smallColW + pad;
const sheetH = label + H + pad * 2;
const text = (x, y, s) => `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fbd48a">${s}</text>`;
let y = label + pad;
const layers = [
  { input: ref, left: pad, top: label + pad },
  { input: cand, left: pad * 2 + refMeta.width, top: label + pad },
];
const labels = [text(pad, label + 4, "REFERENCE"), text(pad * 2 + refMeta.width, label + 4, "CANDIDATE")];
const sx = pad * 3 + refMeta.width + candMeta.width;
smallTiles.forEach((t, i) => {
  labels.push(text(sx, y - 6, `${t.w}px wide (x${t.up})`));
  layers.push({ input: t.buf, left: sx, top: y });
  y += smallMetas[i].height + label + 6;
});
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.max(sheetH, y)}">${labels.join("")}</svg>`);
await sharp({ create: { width: W, height: Math.max(sheetH, y), channels: 4, background: bg } })
  .composite([...layers, { input: overlay, left: 0, top: 0 }])
  .png()
  .toFile(outPath);

const [pr, pc] = await Promise.all([palette(ref, 6), palette(cand, 6)]);
console.log(`compare sheet: ${outPath}`);
console.log("reference palette:", pr.map((c) => `${c.hex} ${c.pct}%`).join("  "));
console.log("candidate palette:", pc.map((c) => `${c.hex} ${c.pct}%`).join("  "));
