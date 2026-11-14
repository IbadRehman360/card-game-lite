

/*
 * Card faces, drawn the same way as the old app's SVG deck: a 250 × 350 card with the rank and suit in two
 * corners, real pip layouts on number cards, the traced court portraits on J, Q and K, and one big pip on Aces.
 * The suits are vector paths, not font glyphs, so they look the same on every device.
 */

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

/** The card font (Oswald, as next/font names it), falling back to a narrow system face. */
function cardFont() {
  const family =
    typeof document !== "undefined"
      ? getComputedStyle(document.body).getPropertyValue("--font-oswald").trim()
      : "";
  return `${family ? `${family}, ` : ""}"Arial Narrow", Impact, sans-serif`;
}

function suitAt(g: CanvasRenderingContext2D, suit: string, x: number, y: number, size: number, turn = false) {
  g.save();
  g.translate(x + size / 2, y + size / 2);
  if (turn) g.rotate(Math.PI);
  g.translate(-size / 2, -size / 2);
  g.scale(size / 100, size / 100);
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

function drawFace(
  g: CanvasRenderingContext2D,
  rank: string,
  suit: string,
  art: CanvasImageSource | null,
) {
  const ink = suit === "♥" || suit === "♦" ? FACE_RED : FACE_INK;
  g.setTransform(K, 0, 0, K, 0, 0);
  g.clearRect(0, 0, 250, 350);

  const bg = g.createLinearGradient(0, 0, 0, 350);
  bg.addColorStop(0, "#fffefa");
  bg.addColorStop(1, "#f7f2e7");
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(0, 0, 250, 350, 18);
  g.fill();
  g.strokeStyle = "rgba(60,40,20,0.28)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(1.25, 1.25, 247.5, 347.5, 17);
  g.stroke();

  g.fillStyle = ink;
  if (rank === "A") {
    // one normal-sized pip in the middle, a little larger than a number card's
    suitAt(g, suit, 125 - 37, 175 - 37, 74);
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
      g.font = `700 120px ${cardFont()}`;
      g.fillText(rank, 125, 160);
      suitAt(g, suit, 95, 215, 60);
      g.restore();
    }
    g.strokeStyle = "#16110e";
    g.lineWidth = 1.6;
    g.strokeRect(FX, FY, FW, FH);
  } else {
    const size = rank === "9" || rank === "10" ? 52 : 58;
    for (const [x, y] of PIPS[rank] ?? []) suitAt(g, suit, x - size / 2, y - size / 2, size, y > PM);
  }

  // the corner indexes, top-left and (turned) bottom-right
  const font = cardFont();
  const index = () => {
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `700 50px ${font}`;
    if (rank === "10") {
      g.save();
      g.translate(25, 54);
      g.scale(40 / Math.max(1, g.measureText("10").width), 1);
      g.fillText("10", 0, 0);
      g.restore();
    } else g.fillText(rank, 25, 54);
    suitAt(g, suit, 9, 60, 32);
  };
  index();
  g.save();
  g.translate(250, 350);
  g.rotate(Math.PI);
  index();
  g.restore();
}

/**
 * Paints a card face onto a canvas (the same drawing on the table and in your hand). Court cards are painted
 * again once their portrait has loaded, and then `onArt` is called.
 */
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

export function paintCard(
  c: HTMLCanvasElement,
  rank: string,
  suit: "♠" | "♥" | "♦" | "♣",
  onArt?: () => void,
) {
  c.width = Math.round(250 * K);
  c.height = Math.round(350 * K);
  const g = c.getContext("2d")!;
  const key = rank + suit;
  const kept = FACE_CACHE.get(key);
  if (kept) {
    // most recently used goes to the back of the queue
    FACE_CACHE.delete(key);
    FACE_CACHE.set(key, kept);
    g.drawImage(kept, 0, 0);
    return () => {};
  }
  drawFace(g, rank, suit, null);
  let live = true;
  if (rank === "J" || rank === "Q" || rank === "K") {
    courtArt(rank)
      .then((img) => {
        if (!live) return;
        drawFace(g, rank, suit, img);
        keepFace(key, c);
        onArt?.();
      })
      .catch(() => {});
  } else keepFace(key, c);
  return () => {
    live = false;
  };
}
