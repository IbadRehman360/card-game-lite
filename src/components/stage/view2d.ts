/**
 * The 3D app's camera, as plain maths: the same shots (position, target, field of view, picture shift)
 * and the same table and seat positions, projected to screen pixels. The 2D table, the cards and the
 * name tags are all placed with it, so they land exactly where the 3D app drew them. No three.js here.
 */

export type Vec = [number, number, number];
export type LookId = "title" | "menu" | "play";

export const TABLE_TOP = 0.78;
export const TABLE_SCALE = 1.25;
/** Half the table's width (x) and depth (z) and its corner radius, before TABLE_SCALE. */
export const TOP_HALF = 1.02;
export const TOP_DEPTH = 1.27;
export const TOP_CORNER = 0.32;
export const SEAT_RADIUS = 1.95;
/** Game seats round the table: you, right, partner, left. */
export const PLAY_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
export const seatDir = (seat: number): Vec => [Math.sin(PLAY_ANGLE[seat]), 0, -Math.cos(PLAY_ANGLE[seat])];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const along = (p: Vec, d: Vec, k: number): Vec => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

export interface Shot {
  pos: Vec;
  look: Vec;
  fov: number;
  /** Fraction of the view the picture slides right (x) and up (y). */
  shift: [number, number];
  /** Stretches the table depth (z) about the look point so a tall phone felt fills the band above the hand. */
  depthK?: number;
  /** Extra stretch for the near half only (the side toward the camera), so the table reaches further down. */
  nearK?: number;
}

/** Distance at which a W x H box fills the frame. */
function fit(w: number, h: number, fov: number, aspect: number) {
  const t = 2 * Math.tan((fov * Math.PI) / 360);
  return Math.max(h / t, w / (t * aspect));
}

/**
 * A game on a screen wider than a phone held upright (desktop, tablet, phone on its side): the camera
 * is fitted so the whole far side shows (the player across, head and all) down to the near rail, and the
 * table never spreads past the middle of a wide screen. An upright tablet gets it too (wider table);
 * the upright phone's own shot is left as it was.
 */
function wideTableShot(aspect: number, short: boolean): Shot {
  const fov = short ? 44 : 40;
  const t = Math.tan((fov * Math.PI) / 360);
  // steep enough that the felt stands tall on the screen (more room for the cards dealt across)
  const dir = norm([0, short ? 1.25 : 1.45, 1]);
  const at: Vec = [0, TABLE_TOP, 0.15];
  const head: Vec = [0, 2.02, -SEAT_RADIUS];
  const rimX = (TOP_HALF + 0.08) * TABLE_SCALE;
  const rimZ = (TOP_DEPTH + 0.08) * TABLE_SCALE;
  const near: Vec = [0, TABLE_TOP, rimZ];
  const corners: Vec[] = [
    [rimX, TABLE_TOP, rimZ],
    [rimX, TABLE_TOP, -rimZ],
  ];
  // where the head and the near rail land (share of the height; past 1 is under the hand), and how
  // much of the width the table may take at its widest
  const top = short ? 0.02 : 0.075;
  // an upright tablet keeps the phone's layout: the table runs the full width, under the hand
  const upright = aspect < 0.9;
  const bottom = short ? 1.2 : upright ? 1.12 : 0.99;
  const maxW = short ? 0.6 : upright ? 0.94 : 0.64;
  const ndc = (d: number) => {
    const pos = along(at, dir, d);
    const f = norm(sub(at, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return (p: Vec): [number, number] => {
      const q = sub(p, pos);
      const z = Math.max(dot(q, f), 0.01);
      return [dot(q, r) / (z * t * aspect), dot(q, u) / (z * t)];
    };
  };
  const fits = (d: number) => {
    const p = ndc(d);
    const span = (p(head)[1] - p(near)[1]) / 2;
    const wide = Math.max(...corners.map((c) => Math.abs(p(c)[0])));
    return span <= bottom - top && wide <= maxW;
  };
  let lo = 1;
  let hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const headY = (1 - ndc(hi)(head)[1]) / 2;
  return { pos: along(at, dir, hi), look: at, fov, shift: [0, headY - top] };
}

/** The 3D app's camera shots. */
export function shotFor(look: LookId, aspect: number, short: boolean): Shot {
  const tall = aspect < 0.9;
  if (look === "play") {
    if (!tall || aspect > 0.6) return wideTableShot(aspect, short);
    const fov = tall ? 52 : 42;
    const at: Vec = [0, tall ? 0.8 : 0.88, tall ? 0.1 : -0.05];
    const dir = norm([0, tall ? 2.3 : 0.85, 1]);
    const d = fit(tall ? 2.38 : 3.6, short ? 1.85 : 2.1, fov, aspect);
    return { pos: along(at, dir, d), look: at, fov, shift: [0, tall ? 0.03 : short ? 0.12 : 0.08], depthK: tall ? 1.18 : undefined, nearK: undefined };
  }
  if (look === "menu") {
    if (tall) {
      const narrow = aspect < 0.75;
      const fov = 46;
      const at: Vec = [0, narrow ? 0.85 : 0.95, narrow ? -0.15 : -0.3];
      const d = fit(narrow ? 2.5 : 3.45, 2.2, fov, aspect);
      return { pos: along(at, norm([0, 0.6, 1]), d), look: at, fov, shift: [0, -0.04] };
    }
    const fov = 36;
    const at: Vec = [0, 1.02, -0.4];
    const d = fit(5.0, short ? 2.0 : 2.3, fov, aspect);
    return { pos: along(at, norm([0, 0.3, 1]), d), look: at, fov, shift: [0.2, 0] };
  }
  const fov = tall ? 48 : 38;
  const at: Vec = [0, 0.9, -0.25];
  const d = fit(aspect < 0.75 ? 2.5 : tall ? 2.95 : 5.0, 2.3, fov, aspect);
  return { pos: along(at, norm([0, 0.45, 1]), d), look: at, fov, shift: [0, tall ? -0.2 : -0.12] };
}

export interface View {
  w: number;
  h: number;
  shot: Shot;
  /** World point → screen pixels. */
  px: (p: Vec) => [number, number];
  /** World point → percent of the stage. */
  pc: (p: Vec) => [number, number];
}

export function makeView(look: LookId, w: number, h: number): View {
  const aspect = w / Math.max(h, 1);
  const shot = shotFor(look, aspect, h < 560);
  const f = norm(sub(shot.look, shot.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((shot.fov * Math.PI) / 360);
  const k = shot.depthK ?? 1;
  const kn = shot.nearK ?? 1;
  const px = (p: Vec): [number, number] => {
    const dz = p[2] - shot.look[2];
    const kz = dz > 0 ? k * kn : k;
    const d = sub(kz === 1 ? p : [p[0], p[1], shot.look[2] + dz * kz], shot.pos);
    const z = Math.max(dot(d, f), 0.01);
    const nx = dot(d, r) / (z * t * aspect);
    const ny = dot(d, u) / (z * t);
    return [((nx + 1) / 2) * w + shot.shift[0] * w, ((1 - ny) / 2) * h - shot.shift[1] * h];
  };
  const pc = (p: Vec): [number, number] => {
    const [x, y] = px(p);
    return [(x / w) * 100, (y / h) * 100];
  };
  return { w, h, shot, px, pc };
}

/** Points round a rounded rectangle on the table (half sizes and corner in table units, scaled). */
export function roundedRect(half: number, depth: number, r: number, y: number, steps = 6): Vec[] {
  const s = TABLE_SCALE;
  const out: Vec[] = [];
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      out.push([(cx + Math.cos(a) * r) * s, y, (cz + Math.sin(a) * r) * s]);
    }
  };
  corner(half - r, depth - r, 0);
  corner(-half + r, depth - r, Math.PI / 2);
  corner(-half + r, -depth + r, Math.PI);
  corner(half - r, -depth + r, (3 * Math.PI) / 2);
  return out;
}

/** An SVG path through screen points. */
export const pathOf = (v: View, pts: Vec[]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${v.px(p)[0].toFixed(1)},${v.px(p)[1].toFixed(1)}`).join("") + "Z";

/**
 * The 3D table's own outline: a rounded rectangle whose corners are quadratic curves pulled toward the
 * corner point (as THREE's quadraticCurveTo draws them), so the long edges stay straight and the corners
 * read squarer than circular arcs.
 */
export function tableRect(half: number, depth: number, r: number, y: number, steps = 10): Vec[] {
  const s = TABLE_SCALE;
  const out: Vec[] = [];
  const q = (a: [number, number], c: [number, number], b: [number, number]) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      out.push([(u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]) * s, y, (u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]) * s]);
    }
  };
  const w = half;
  const h = depth;
  q([w - r, h], [w, h], [w, h - r]);
  q([w, -h + r], [w, -h], [w - r, -h]);
  q([-w + r, -h], [-w, -h], [-w, -h + r]);
  q([-w, h - r], [-w, h], [-w + r, h]);
  return out;
}

/** `n` points spread evenly (by length) round a closed outline: the 3D table's brass studs. */
export function spaced(pts: Vec[], n: number): Vec[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    seg.push(d);
    total += d;
  }
  const out: Vec[] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / n) * total;
    while (acc + seg[i] < want) acc += seg[i++];
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const t = seg[i] ? (want - acc) / seg[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t]);
  }
  return out;
}

/** The sizes the 3D app's pictures were captured at (public/baked), per screen shape. */
export const PLATE_SIZE = { tall: [430, 932], land: [932, 430], desk: [1600, 900] } as const;
export type PlateAspect = keyof typeof PLATE_SIZE;
export const plateAspect = (w: number, h: number): PlateAspect => (w / h < 0.9 ? "tall" : h < 560 ? "land" : "desk");

/** How a captured picture covers the screen: captured size, scale and offset (object-fit: cover). */
export interface Crop {
  bw: number;
  bh: number;
  s: number;
  ox: number;
  oy: number;
}

/**
 * The projection of a captured picture as it covers a w × h screen: the camera is the one the picture was
 * taken with (at its own size), then scaled and centred like object-fit: cover, so whatever is drawn
 * through this view lands exactly on the picture's table.
 */
export function makePlateView(look: LookId, w: number, h: number): View & { crop: Crop } {
  const [bw, bh] = PLATE_SIZE[plateAspect(w, h)];
  const base = makeView(look, bw, bh);
  const s = Math.max(w / bw, h / bh);
  const ox = (w - bw * s) / 2;
  const oy = (h - bh * s) / 2;
  const px = (p: Vec): [number, number] => {
    const [x, y] = base.px(p);
    return [x * s + ox, y * s + oy];
  };
  const pc = (p: Vec): [number, number] => {
    const [x, y] = px(p);
    return [(x / w) * 100, (y / h) * 100];
  };
  return { w, h, shot: base.shot, px, pc, crop: { bw, bh, s, ox, oy } };
}
