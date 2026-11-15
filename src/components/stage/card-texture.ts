import { Cinzel } from "next/font/google";

/*
 * Card faces, drawn the same way as the old app's SVG deck: a 250 × 350 card with the rank and suit in two
 * corners, real pip layouts on number cards, the traced court portraits on J, Q and K, and one big pip on Aces.
 * The suits are vector paths, not font glyphs, so they look the same on every device.
 *
 * The finish is a fine deck's: ivory stock with a linen grain and a bevelled edge, a thin gilt frame round
 * the pips and the portraits, a guilloché rosette behind the Ace, softly bevelled pips, and engraved-style
 * Roman indexes. The gold stays off the indexes, so a card still reads at a glance on a small phone.
 */

/** The index face: Roman inscriptional capitals with lining figures. Loaded on demand (see waitIndexFont). */
const cardSerif = Cinzel({ weight: "800", subsets: ["latin"], display: "swap", preload: false });

const SUIT_PATH: Record<string, string> = {
  "♥": "M50 90C22 69 4 51 4 31 4 16 15 6 28.5 6 38 6 45.5 11.5 50 20 54.5 11.5 62 6 71.5 6 85 6 96 16 96 31 96 51 78 69 50 90Z",
  "♦": "M50 3C61 22 73 36 89 50 73 64 61 78 50 97 39 78 27 64 11 50 27 36 39 22 50 3Z",
  "♠": "M50 4C63 24 94 38 94 61 94 75 84 83 72.5 83 64.5 83 58 79 54 72.5 55 83 59 91 67 97H33C41 91 45 83 46 72.5 42 79 35.5 83 27.5 83 16 83 6 75 6 61 6 38 37 24 50 4Z",
  "♣": "M46.5 56C46 74 42 87 33 97H67C58 87 54 74 53.5 56Z",
};
const CLUB_LOBES: [number, number, number][] = [
  [50, 27, 19],
  [27, 59, 19],
  [73, 59, 19],
  [50, 52, 12],
];

const FACE_INK = "#151515";
const FACE_RED = "#b00f07";
/** Four-colour deck: diamonds blue and clubs green, so the two red and the two black suits are told apart. */
const FACE_BLUE = "#1452b8";
const FACE_GREEN = "#13753a";

export type SuitInk = "classic" | "four";

function inkFor(suit: string, colors: SuitInk) {
  if (colors === "four") {
    if (suit === "♦") return FACE_BLUE;
    if (suit === "♣") return FACE_GREEN;
  }
  return suit === "♥" || suit === "♦" ? FACE_RED : FACE_INK;
}
/** Canvas pixels per card unit: the card is drawn at 325 × 455. */
const K = 1.3;

// Pip positions on number cards: two columns and a centre line; pips below the middle are turned.
const PL = 84;
const PC = 125;
const PR = 166;
const PT = 62;
const PB = 288;
const PM = 175;
const q = (n: number) => PT + ((PB - PT) * n) / 6;
const PIPS: Record<string, [number, number][]> = {
  "2": [[PC, PT], [PC, PB]],
  "3": [[PC, PT], [PC, PM], [PC, PB]],
  "4": [[PL, PT], [PR, PT], [PL, PB], [PR, PB]],
  "5": [[PL, PT], [PR, PT], [PC, PM], [PL, PB], [PR, PB]],
  "6": [[PL, PT], [PR, PT], [PL, PM], [PR, PM], [PL, PB], [PR, PB]],
  "7": [[PL, PT], [PR, PT], [PC, q(1.5)], [PL, PM], [PR, PM], [PL, PB], [PR, PB]],
  "8": [[PL, PT], [PR, PT], [PC, q(1.5)], [PL, PM], [PR, PM], [PC, q(4.5)], [PL, PB], [PR, PB]],
  "9": [[PL, PT], [PR, PT], [PL, q(2)], [PR, q(2)], [PC, PM], [PL, q(4)], [PR, q(4)], [PL, PB], [PR, PB]],
  "10": [[PL, PT], [PR, PT], [PC, q(1)], [PL, q(2)], [PR, q(2)], [PL, q(4)], [PR, q(4)], [PC, q(5)], [PL, PB], [PR, PB]],
};

// The court portrait frame sits between the corner indexes, as on a printed deck.
const FX = 42;
const FY = 40;
const FW = 166;
const FH = 270;
const ART: Record<string, number> = { J: 864 / 1278, Q: 870 / 1278, K: 822 / 1290 };

/** The court portraits (public/cards), loaded once each and shared by every suit. */
const courts = new Map<string, Promise<CanvasImageSource>>();
/** Starts loading the three court portraits, so they are ready before the first court card is played. */
export function preloadCourtArt() {
  for (const r of ["J", "Q", "K"]) void courtArt(r).catch(() => {});
  if (typeof document !== "undefined") void waitIndexFont();
}
function courtArt(rank: string): Promise<CanvasImageSource> {
  let p = courts.get(rank);
  if (!p) {
    const w = Math.round(FH * K * ART[rank]);
    const h = Math.round(FH * K);
    // rasterise the (large) vector art once, so drawing it onto each card is cheap
    const flatten = (img: HTMLImageElement) => {
      const bmp = document.createElement("canvas");
      bmp.width = w;
      bmp.height = h;
      bmp.getContext("2d")!.drawImage(img, 0, 0, w, h);
      return bmp;
    };
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const file = `/cards/court-${rank}.svg`;
    // First a sized copy (some browsers will not draw an SVG that has no pixel size); if that fails on this
    // phone, the file itself, as the old app drew it.
    p = fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(async (svg) => {
        const sized = svg.replace("<svg ", `<svg width="${w}" height="${h}" `);
        const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml" }));
        try {
          return flatten(await load(url));
        } finally {
          URL.revokeObjectURL(url);
        }
      })
      .catch(async () => flatten(await load(file)));
    // a failed load can be tried again next time
    p.catch(() => courts.delete(rank));
    courts.set(rank, p);
  }
  return p;
}

/** The UI font (as next/font names it): the stand-in for the indexes until the card font has loaded. */
function uiFont() {
  const family =
    typeof document !== "undefined"
      ? getComputedStyle(document.body).getPropertyValue("--font-oswald").trim()
      : "";
  return `${family ? `${family}, ` : ""}"Arial Narrow", Impact, sans-serif`;
}

/**
 * The indexes are set in Cinzel. It is drawn on a canvas, so a face painted before the font has arrived
 * is not kept, and is painted again once it has.
 */
const SERIF_FAMILY = cardSerif.style.fontFamily.split(",")[0].trim();
const INDEX_FONT = `800 50px ${SERIF_FAMILY}, "Times New Roman", serif`;
const INDEX_PROBE = `800 50px ${SERIF_FAMILY}`;
let indexFontReady = false;
let indexFontWait: Promise<void> | null = null;
function indexFontLoaded(): boolean {
  if (indexFontReady) return true;
  try {
    indexFontReady = document.fonts.check(INDEX_PROBE, "AKQJ10") && document.fonts.status === "loaded";
  } catch {
    indexFontReady = false;
  }
  return indexFontReady;
}
function waitIndexFont(): Promise<void> {
  indexFontWait ??= document.fonts
    .load(INDEX_PROBE, "AKQJ10")
    .then(() => {
      indexFontReady = true;
    })
    .catch(() => {
      // offline with no cached font: the serif fallback stands in for good
      indexFontReady = true;
    });
  return indexFontWait;
}

// ───────────── paper, gilt and ink ─────────────

/** A small tile of linen weave, drawn once and repeated over every face (a faint cross-grain, like card stock). */
let linenTile: HTMLCanvasElement | null = null;
function linen(): HTMLCanvasElement {
  if (linenTile) return linenTile;
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const g = c.getContext("2d")!;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(120,95,60,${(0.03 + rnd() * 0.045).toFixed(3)})`;
    g.fillRect(0, i, 12, 1);
    g.fillStyle = `rgba(120,95,60,${(0.025 + rnd() * 0.04).toFixed(3)})`;
    g.fillRect(i, 0, 1, 12);
  }
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.3).toFixed(2)})`;
    g.fillRect(Math.floor(rnd() * 12), Math.floor(rnd() * 12), 1, 1);
  }
  linenTile = c;
  return c;
}

/** A gold-leaf gradient across a box: dark old gold, a bright catch of light, and back. */
function gilt(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, "#8a5d16");
  gr.addColorStop(0.28, "#d9b052");
  gr.addColorStop(0.45, "#fbe7a6");
  gr.addColorStop(0.6, "#c99a38");
  gr.addColorStop(1, "#7a4f10");
  return gr;
}

/** Each ink with a lighter top and a deeper foot, so a pip reads as a little raised (a bevel, not a glow). */
const INK_SHADE: Record<string, [string, string]> = {
  [FACE_INK]: ["#3c3c42", "#050506"],
  [FACE_RED]: ["#d8322a", "#7c0905"],
  [FACE_BLUE]: ["#3a78d8", "#0b3480"],
  [FACE_GREEN]: ["#2d9a57", "#0a4f25"],
};

function suitAt(g: CanvasRenderingContext2D, suit: string, x: number, y: number, size: number, turn = false, ink?: string) {
  g.save();
  g.translate(x + size / 2, y + size / 2);
  if (turn) g.rotate(Math.PI);
  g.translate(-size / 2, -size / 2);
  g.scale(size / 100, size / 100);
  const shade = ink ? INK_SHADE[ink] : undefined;
  if (ink && shade) {
    // lit from above whichever way the pip is turned
    const gr = turn ? g.createLinearGradient(0, 100, 0, 0) : g.createLinearGradient(0, 0, 0, 100);
    gr.addColorStop(0, shade[0]);
    gr.addColorStop(0.45, ink);
    gr.addColorStop(1, shade[1]);
    g.fillStyle = gr;
  }
  g.fill(new Path2D(SUIT_PATH[suit]));
  if (suit === "♣") {
    for (const [cx, cy, r] of CLUB_LOBES) {
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** A small diamond of gold, for the corners of a frame. */
function giltDot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
}

/** The thin gilt frame inside the card: a gold rule, a hairline inside it, and a diamond at each corner. */
function giltFrame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.save();
  const gold = gilt(g, x, y, w, h);
  g.strokeStyle = gold;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.stroke();
  g.globalAlpha = 0.55;
  g.lineWidth = 1.1;
  g.beginPath();
  g.roundRect(x + 4.5, y + 4.5, w - 9, h - 9, Math.max(1, r - 4));
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = gold;
  giltDot(g, x, y, 5);
  giltDot(g, x + w, y, 5);
  giltDot(g, x, y + h, 5);
  giltDot(g, x + w, y + h, 5);
  g.restore();
}

/** The Ace's rosette: fine guilloché rings of gold behind the one big pip. */
function rosette(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.save();
  g.strokeStyle = gilt(g, cx - r, cy - r, r * 2, r * 2);
  g.lineWidth = 2.2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.5;
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(cx, cy, r - 6, 0, Math.PI * 2);
  g.stroke();
  // interlaced loops round the ring, as on a banknote
  const n = 28;
  g.globalAlpha = 0.4;
  g.lineWidth = 0.8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), 9, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

/** The paper: ivory with a soft falloff to the edge, a linen grain, and a bevelled rim. */
function paper(g: CanvasRenderingContext2D) {
  const bg = g.createRadialGradient(125, 150, 40, 125, 175, 250);
  bg.addColorStop(0, "#fffdf6");
  bg.addColorStop(0.7, "#fbf6ea");
  bg.addColorStop(1, "#f1e8d4");
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, 250, 350, 18);
  g.fill();
  const grain = g.createPattern(linen(), "repeat");
  if (grain) {
    g.save();
    g.clip();
    g.fillStyle = grain;
    g.fillRect(0, 0, 250, 350);
    g.restore();
  }
  // the bevel: a lit upper edge, a shaded lower one, then a fine dark outline
  const bevel = g.createLinearGradient(0, 0, 0, 350);
  bevel.addColorStop(0, "rgba(255,255,255,0.95)");
  bevel.addColorStop(0.5, "rgba(255,255,255,0.15)");
  bevel.addColorStop(1, "rgba(110,80,40,0.32)");
  g.strokeStyle = bevel;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(3.5, 3.5, 243, 343, 15);
  g.stroke();
  g.strokeStyle = "rgba(60,40,20,0.32)";
  g.lineWidth = 2.2;
  g.beginPath();
  g.roundRect(1.1, 1.1, 247.8, 347.8, 17);
  g.stroke();
}

/** A corner index: the rank fitted to one box whatever the glyph (so A, Q and 10 sit alike), the suit under it. */
function index(g: CanvasRenderingContext2D, rank: string, suit: string, ink: string, serif: boolean) {
  g.save();
  g.fillStyle = ink;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = serif ? INDEX_FONT : `700 50px ${uiFont()}`;
  const m = g.measureText(rank);
  const left = m.actualBoundingBoxLeft || 0;
  const gw = left + (m.actualBoundingBoxRight || m.width);
  const gh = m.actualBoundingBoxAscent || 36;
  // the cap height is 37 from y 13, centred on x 25; a tail (the Q's) may drop a little below
  const k = Math.min(37 / gh, (rank === "10" ? 40 : 32) / Math.max(1, gw));
  // "10" is pressed a little narrower so it fits the same column as one letter
  const kx = rank === "10" ? k * 0.92 : k;
  g.translate(25 - (gw * kx) / 2 + left * kx, 13 + gh * k);
  g.scale(kx, k);
  g.fillText(rank, 0, 0);
  g.restore();
  suitAt(g, suit, 11, 59, 28, false, ink);
}

function drawFace(
  g: CanvasRenderingContext2D,
  rank: string,
  suit: string,
  art: CanvasImageSource | null,
  colors: SuitInk,
  serif: boolean,
) {
  const ink = inkFor(suit, colors);
  g.setTransform(K, 0, 0, K, 0, 0);
  g.clearRect(0, 0, 250, 350);
  paper(g);

  g.fillStyle = ink;
  if (rank === "A") {
    giltFrame(g, 47, 18, 156, 314, 10);
    // one big pip in a gilt rosette; the Ace of spades, by custom, a size larger
    const spade = suit === "♠";
    rosette(g, 125, 175, spade ? 64 : 56);
    const size = spade ? 84 : 72;
    suitAt(g, suit, 125 - size / 2, 175 - size / 2, size, false, ink);
  } else if (rank === "J" || rank === "Q" || rank === "K") {
    if (art) {
      g.save();
      g.beginPath();
      g.rect(FX, FY, FW, FH);
      g.clip();
      const w = FH * ART[rank];
      g.drawImage(art, FX + (FW - w) / 2, FY, w, FH);
      g.restore();
    } else {
      // until the portrait is ready: a big letter and the suit, so the card is never blank
      g.save();
      g.fillStyle = ink;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = serif ? INDEX_FONT.replace("50px", "104px") : `700 120px ${uiFont()}`;
      g.fillText(rank, 125, 160);
      g.restore();
      suitAt(g, suit, 95, 215, 60, false, ink);
    }
    g.save();
    g.strokeStyle = "#16110e";
    g.lineWidth = 1.6;
    g.strokeRect(FX, FY, FW, FH);
    g.restore();
    // the portrait in a gilt frame, and the suit in a small ivory medallion in two of its corners (the
    // portraits are shared by all four suits, so this says whose court it is at a glance)
    giltFrame(g, FX - 4, FY - 4, FW + 8, FH + 8, 3);
    for (const turn of [false, true]) {
      const cx = turn ? FX + FW - 15 : FX + 15;
      const cy = turn ? FY + FH - 15 : FY + 15;
      g.save();
      g.fillStyle = "#fbf6ea";
      g.beginPath();
      g.arc(cx, cy, 12.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = gilt(g, cx - 12, cy - 12, 24, 24);
      g.lineWidth = 2;
      g.stroke();
      g.restore();
      suitAt(g, suit, cx - 8.5, cy - 8.5, 17, turn, ink);
    }
  } else {
    giltFrame(g, 47, 18, 156, 314, 10);
    const size = rank === "9" || rank === "10" ? 50 : 56;
    for (const [x, y] of PIPS[rank] ?? []) suitAt(g, suit, x - size / 2, y - size / 2, size, y > PM, ink);
  }

  // the corner indexes, top-left and (turned) bottom-right
  index(g, rank, suit, ink, serif);
  g.save();
  g.translate(250, 350);
  g.rotate(Math.PI);
  index(g, rank, suit, ink, serif);
  g.restore();
}

/**
 * Finished faces, kept so a card shown again (every hand, every flight, every re-render) is one copy
 * instead of a full redraw. Small on purpose: 24 faces is about 14 MB of canvas, fine on low-end phones.
 */
const FACE_CACHE = new Map<string, HTMLCanvasElement>();
const FACE_CACHE_MAX = 24;
function keepFace(key: string, src: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = src.width;
  copy.height = src.height;
  copy.getContext("2d")!.drawImage(src, 0, 0);
  FACE_CACHE.delete(key);
  FACE_CACHE.set(key, copy);
  if (FACE_CACHE.size > FACE_CACHE_MAX) FACE_CACHE.delete(FACE_CACHE.keys().next().value!);
}

/**
 * Paints a card face onto a canvas (the same drawing on the table and in your hand). A face is painted
 * again once what it waits for has arrived (a court's portrait, the index font), and then `onArt` is called.
 */
export function paintCard(
  c: HTMLCanvasElement,
  rank: string,
  suit: "♠" | "♥" | "♦" | "♣",
  onArt?: () => void,
  colors: SuitInk = "classic",
) {
  c.width = Math.round(250 * K);
  c.height = Math.round(350 * K);
  const g = c.getContext("2d")!;
  const key = rank + suit + colors;
  const kept = FACE_CACHE.get(key);
  if (kept) {
    // most recently used goes to the back of the queue
    FACE_CACHE.delete(key);
    FACE_CACHE.set(key, kept);
    g.drawImage(kept, 0, 0);
    return () => {};
  }
  const serif = indexFontLoaded();
  const court = rank === "J" || rank === "Q" || rank === "K";
  drawFace(g, rank, suit, null, colors, serif);
  if (!court && serif) {
    keepFace(key, c);
    return () => {};
  }
  let live = true;
  void Promise.all([court ? courtArt(rank).catch(() => null) : Promise.resolve(null), serif ? undefined : waitIndexFont()]).then(
    ([art]) => {
      if (!live) return;
      drawFace(g, rank, suit, art, colors, true);
      // a court whose portrait failed is painted again next time rather than kept without it
      if (art || !court) keepFace(key, c);
      onArt?.();
    },
  );
  return () => {
    live = false;
  };
}
