/**
 * The 3D app's camera, as plain maths: the same shots (position, target, field of view, picture shift)
 * and the same table and seat positions, projected to screen pixels. The 2D table, the cards and the
 * name tags are all placed with it, so they land exactly where the 3D app drew them. No three.js here.
 */

export type Vec = [number, number, number];
export type LookId = "title" | "menu" | "select" | "play";

export const TABLE_TOP = 0.78;
export const TABLE_SCALE = 1.25;
/** Half the table's width (x) and depth (z) and its corner radius, before TABLE_SCALE. */
export const TOP_HALF = 1.02;
export const TOP_DEPTH = 1.27;
export const TOP_CORNER = 0.32;
export const SEAT_RADIUS = 1.95;
/** Where the four regulars sit round the far side while you pick (radians from straight across). */
export const SEAT_ANGLES = [-52, -18, 18, 52].map((d) => (d * Math.PI) / 180);
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
}

/** Distance at which a W x H box fills the frame. */
function fit(w: number, h: number, fov: number, aspect: number) {
  const t = 2 * Math.tan((fov * Math.PI) / 360);
  return Math.max(h / t, w / (t * aspect));
}

/** Seat height of the chairs, and the head of the one at each pick seat (Sal is a size bigger). */
const BUST_BASE = 0.42;
const HEAD_SCALE = [1, 1, 1.1, 1];

/** The 3D app's close-up on one pick seat: the chosen figure, centred, from just above eye height. */
function selectShot(i: number, aspect: number, short: boolean): Shot {
  const tall = aspect < 0.9;
  const a = SEAT_ANGLES[i];
  const fov = tall ? 34 : 30;
  const at: Vec = [SEAT_RADIUS * Math.sin(a), BUST_BASE + 0.84 * HEAD_SCALE[i] - 0.12, -SEAT_RADIUS * Math.cos(a)];
  const dir = norm([-Math.sin(a), 0.16, Math.cos(a)]);
  const d = fit(tall ? 2.0 : 2.1, short ? 1.35 : 1.7, fov, aspect);
  return { pos: along(at, dir, d), look: at, fov, shift: tall ? [0, 0.13] : [0, short ? 0.04 : 0.1] };
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixV = (a: Vec, b: Vec, k: number): Vec => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

/**
 * The 3D app's camera shots. Picking a character frames the chosen seat; a fractional focus is the
 * camera on its way from one seat to the next.
 */
export function shotFor(look: LookId, aspect: number, short: boolean, focus = 0): Shot {
  const tall = aspect < 0.9;
  if (look === "select") {
    const f = Math.min(3, Math.max(0, focus));
    const i = Math.floor(f);
    const a = selectShot(i, aspect, short);
    if (f === i) return a;
    const b = selectShot(i + 1, aspect, short);
    const k = f - i;
    return {
      pos: mixV(a.pos, b.pos, k),
      look: mixV(a.look, b.look, k),
      fov: mix(a.fov, b.fov, k),
      shift: [mix(a.shift[0], b.shift[0], k), mix(a.shift[1], b.shift[1], k)],
    };
  }
  if (look === "play") {
    const fov = tall ? 52 : 42;
    const at: Vec = [0, tall ? 0.8 : 0.88, tall ? 0.1 : -0.05];
    const dir = norm([0, tall ? 2.3 : 0.85, 1]);
    const d = fit(tall ? 2.38 : 3.6, short ? 1.85 : 2.1, fov, aspect);
    return { pos: along(at, dir, d), look: at, fov, shift: [0, tall ? 0.03 : short ? 0.12 : 0.08] };
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

export function makeView(look: LookId, w: number, h: number, focus = 0): View {
  const aspect = w / Math.max(h, 1);
  const shot = shotFor(look, aspect, h < 560, focus);
  const f = norm(sub(shot.look, shot.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((shot.fov * Math.PI) / 360);
  const px = (p: Vec): [number, number] => {
    const d = sub(p, shot.pos);
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
