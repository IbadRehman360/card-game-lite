#!/usr/bin/env node
/**
 * asset-forge / palette.mjs: the dominant colours of an image (k-means on a 64 px thumbnail).
 *
 *   node palette.mjs reference.jpg [k=8]
 *
 * Gives hex values and their share of the picture, largest first, to seed the design spec's palette.
 * Eyeball the result against the image: small accents (gold leaf, a red pip) can be under 3% and still
 * matter more than a big background colour.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadSharp } from "./load-sharp.mjs";

export async function palette(input, k = 8) {
  const sharp = loadSharp();
  const { data, info } = await sharp(input).flatten({ background: "#000" }).resize(64, 64, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += info.channels) px.push([data[i], data[i + 1], data[i + 2]]);
  // k-means++-ish seeding: spread the starting centres across brightness
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let cs = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]]);
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    assign = px.map((p) => {
      let best = 0, bd = Infinity;
      cs.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } });
      return best;
    });
    cs = cs.map((c, j) => {
      const m = px.filter((_, i) => assign[i] === j);
      return m.length ? [0, 1, 2].map((ch) => m.reduce((s, p) => s + p[ch], 0) / m.length) : c;
    });
  }
  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const out = cs.map((c, j) => ({ hex: hex(c), pct: +((100 * assign.filter((a) => a === j).length) / px.length).toFixed(1), lum: c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114 }));
  return out.filter((c) => c.pct > 0).sort((a, b) => b.pct - a.pct).map(({ hex, pct }) => ({ hex, pct }));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [file, k] = process.argv.slice(2);
  if (!file) { console.error("usage: node palette.mjs image [k]"); process.exit(1); }
  for (const c of await palette(file, Number(k ?? 8))) console.log(`${c.hex}  ${String(c.pct).padStart(5)}%`);
}
