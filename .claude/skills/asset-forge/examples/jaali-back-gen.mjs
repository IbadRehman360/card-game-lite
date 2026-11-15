// Generates the Jaali Gold back drafts. Written the way card-style.ts builds its ART strings (template + Array.from),
// so the body can be ported as is. usage: node gen.mjs <round> <out.svg>
import { writeFileSync } from "node:fs";

const round = Number(process.argv[2] ?? 1);
const out = process.argv[3];
const f = (n) => +n.toFixed(2);

/** An {8/2} star (two squares), as a polygon around (cx, cy). */
function star(cx, cy, R, rot = 0) {
  const r = R * Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8);
  return Array.from({ length: 16 }, (_, i) => {
    const a = rot + (Math.PI * i) / 8 - Math.PI / 2;
    const d = i % 2 ? r : R;
    return `${f(cx + d * Math.cos(a))} ${f(cy + d * Math.sin(a))}`;
  }).join(" ");
}

// cusped (multifoil) arch: straight sides, three cusps per side up to an ogee point
function mehrab(cx, top, base, w) {
  const l = cx - w / 2, rgt = cx + w / 2, spring = top + (base - top) * 0.42;
  const pts = [
    [l, spring], [l + w * 0.08, spring - (spring - top) * 0.42], [l + w * 0.24, spring - (spring - top) * 0.78], [cx, top],
  ];
  const cusp = (a, b) => `A${f(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62)} ${f(Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62)} 0 0 1 ${f(b[0])} ${f(b[1])}`;
  const mir = (p) => [2 * cx - p[0], p[1]];
  let d = `M${l} ${base}V${f(spring)}`;
  for (let i = 1; i < pts.length; i++) d += round >= 3 && i === pts.length - 1 ? `Q${f(pts[i][0] - w * 0.02)} ${f(pts[i][1] + (pts[i - 1][1] - pts[i][1]) * 0.15)} ${f(pts[i][0])} ${f(pts[i][1])}` : cusp(pts[i - 1], pts[i]);
  const rp = pts.map(mir).reverse();
  for (let i = 1; i < rp.length; i++) d += round >= 3 && i === 1 ? `Q${f(rp[0][0] + w * 0.02)} ${f(rp[0][1] + (rp[1][1] - rp[0][1]) * 0.85)} ${f(rp[1][0])} ${f(rp[1][1])}` : cusp(rp[i - 1], rp[i]);
  return d + `V${base}Z`;
}

const T = round >= 2 ? 14 : 11; // lattice tile
const R = T * 0.4;
const lw = round >= 2 ? 0.8 : 0.9;
const tile = `
  <polygon points="${star(T / 2, T / 2, R)}" fill="#4a0e15" stroke="url(#gl)" stroke-width="${lw}" stroke-linejoin="round"/>
  <path d="M${T / 2} 0V${f(T / 2 - R)}M${T / 2} ${f(T / 2 + R)}V${T}M0 ${T / 2}H${f(T / 2 - R)}M${f(T / 2 + R)} ${T / 2}H${T}" stroke="url(#gl)" stroke-width="${lw}"/>
  ${[[0, 0], [T, 0], [0, T], [T, T]].map(([x, y]) => `<path d="M${x} ${f(y - 1.7)}L${f(x + 1.7)} ${y}L${x} ${f(y + 1.7)}L${f(x - 1.7)} ${y}Z" fill="url(#gl)"/>`).join("")}`;

const arch = mehrab(50, round >= 2 ? 40 : 46, round >= 2 ? 102 : 96, round >= 2 ? 42 : 36);
const body = `
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#6e1822"/><stop offset="1" stop-color="#34080e"/></radialGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbd48a"/><stop offset=".55" stop-color="#e2a94a"/><stop offset="1" stop-color="#a8701f"/></linearGradient>
    <linearGradient id="gm" x1="0" y1="0" x2="0" y2="140" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fbd48a"/><stop offset=".5" stop-color="#e2a94a"/><stop offset="1" stop-color="#8a5a1c"/></linearGradient>
    <pattern id="p" width="${T}" height="${T}" patternUnits="userSpaceOnUse" x="${f(50 - T / 2)}" y="${f(70 - T / 2)}">${tile}</pattern>
    ${round >= 2 ? `<clipPath id="c"><rect x="9" y="9" width="82" height="122" rx="4"/></clipPath>` : ""}
    ${round >= 2 ? `<radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>` : ""}
  </defs>
  <rect width="100" height="140" fill="url(#g)"/>
  <rect x="9" y="9" width="82" height="122" rx="4" fill="url(#p)" ${round >= 2 ? `opacity=".5"` : ""}/>
  ${round >= 2 ? `<rect width="100" height="140" fill="url(#v)"/>` : ""}
  <g fill="#fbd48a" fill-opacity=".85">${Array.from({ length: 13 }, (_, i) => `<circle cx="${f(13 + i * 6.17)}" cy="6.75" r=".55"/><circle cx="${f(13 + i * 6.17)}" cy="133.25" r=".55"/>`).join("")}${Array.from({ length: 19 }, (_, i) => `<circle cx="6.75" cy="${f(14 + i * 6.22)}" r=".55"/><circle cx="93.25" cy="${f(14 + i * 6.22)}" r=".55"/>`).join("")}</g>
  <rect x="4.5" y="4.5" width="91" height="131" rx="6" fill="none" stroke="#2a0b06" stroke-width="1.8" transform="translate(.5 .6)"/>
  <rect x="4.5" y="4.5" width="91" height="131" rx="6" fill="none" stroke="url(#gm)" stroke-width="1.8"/>
  <rect x="9" y="9" width="82" height="122" rx="4" fill="none" stroke="url(#gm)" stroke-width="${round >= 2 ? 1 : 0.7}"/>
  <g ${round >= 2 ? `clip-path="url(#c)"` : ""}>${[[9, 9, 0], [91, 9, 90], [91, 131, 180], [9, 131, 270]].map(([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M0 0H${round >= 2 ? 13 : 10}A${round >= 2 ? 13 : 10} ${round >= 2 ? 13 : 10} 0 0 1 0 ${round >= 2 ? 13 : 10}Z" fill="#34080e" stroke="url(#gm)" stroke-width=".9"/>${round >= 3 ? `<path d="M0 0L9 9" stroke="url(#gm)" stroke-width=".8"/><polygon points="${star(5.2, 5.2, 3.6)}" fill="url(#gm)" stroke="#2a0b06" stroke-width=".4"/>` : `<polygon points="${star(0, 0, round >= 2 ? 8 : 6)}" fill="url(#gm)" opacity=".95"/>`}</g>`).join("")}</g>
  <path d="${arch}" fill="#2a0b06" transform="translate(.6 .8)"/>
  <path d="${arch}" fill="url(#gm)"/>
  <path d="${arch}" fill="#3e0a11" transform="translate(50 ${round >= 2 ? 74 : 72}) scale(.8) translate(-50 -${round >= 2 ? 74 : 72})" stroke="#fbd48a" stroke-width=".5"/>
  ${round >= 2 ? `<path d="${arch}" fill="none" stroke="#fff4d6" stroke-opacity=".55" stroke-width=".45" transform="translate(-.35 -.35)"/>` : ""}
  <polygon points="${star(50, round >= 2 ? 80 : 76, round >= 2 ? 10 : 8)}" fill="url(#gm)" stroke="#2a0b06" stroke-width=".5"/>
  <polygon points="${star(50, round >= 2 ? 80 : 76, round >= 2 ? 6 : 4.8, Math.PI / 8)}" fill="#3e0a11"/>
  <circle cx="50" cy="${round >= 2 ? 80 : 76}" r="${round >= 2 ? 2.6 : 2}" fill="#1f6b5a" stroke="#fbd48a" stroke-width=".6"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="300" height="420">${body}</svg>`;
writeFileSync(out, svg);
console.log(`${out}: ${(Buffer.byteLength(body.replace(/\s+/g, " ")) / 1024).toFixed(1)} KB body`);
