import { type ReactNode, useId } from "react";
import { type StickerId, stickerLabel } from "@/lib/stickers";

/**
 * Chat stickers: the deck's own King, Queen and Jack in tilted sticker tiles, with cartoon props drawn
 * over them. Each sticker is a 120 × 120 SVG. Portraits come from public/cards/court-*.svg and are
 * framed with a crop in the art's own coordinates, so props (tears, shades, steam) can be placed
 * relative to a face.
 */

const OUT = "#231a35";
const YELLOW = "#ffd23f";
const RED = "#ff4d4d";
const BLUE = "#59c8ff";

type Who = "K" | "Q" | "J";
// Art size, and the square crop [x, y, size] that frames each face in its sticker.
const ART: Record<Who, { w: number; h: number; crop: [number, number, number] }> = {
  K: { w: 822, h: 1290, crop: [150, -20, 470] },
  Q: { w: 870, h: 1278, crop: [300, -30, 470] },
  J: { w: 864, h: 1278, crop: [220, -20, 470] },
};
// Where the eyes are, in art coordinates (the Jack is in profile: one eye).
const EYES: Record<Who, [number, number][]> = {
  K: [
    [253, 153],
    [349, 153],
  ],
  Q: [
    [507, 84],
    [574, 84],
  ],
  J: [[372, 134]],
};

export function Sticker({ id, size = 64, className }: { id: string; size?: number; className?: string }) {
  const clip = useId();
  const art = DRAW[id as StickerId];
  if (!art) return null;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={stickerLabel(id)}
      style={{ overflow: "visible" }}
    >
      {art(`s${clip.replace(/[^a-zA-Z0-9]/g, "")}`)}
    </svg>
  );
}

// ───────────── building blocks ─────────────

/** The tilted white tile. Children are clipped to it; `over` is drawn on top, free to break out. */
function Tile({ clip, tilt = -5, fill = "#fff", children, over }: { clip: string; tilt?: number; fill?: string; children?: ReactNode; over?: ReactNode }) {
  return (
    <g>
      <g transform={`rotate(${tilt} 60 62)`}>
        <rect x="13" y="22" width="94" height="82" rx="17" fill="#000" opacity="0.28" transform="translate(1.5 4.5)" />
        <clipPath id={clip}>
          <rect x="13" y="22" width="94" height="82" rx="17" />
        </clipPath>
        <rect x="13" y="22" width="94" height="82" rx="17" fill={fill} />
        <g clipPath={`url(#${clip})`}>{children}</g>
        <rect x="13" y="22" width="94" height="82" rx="17" fill="none" stroke={OUT} strokeWidth="5" />
      </g>
      {over}
    </g>
  );
}

/** A face from the deck. `children` are drawn in the art's coordinates (see EYES). */
function Face({ who, x = 10, y = 16, size = 100, flip, children }: { who: Who; x?: number; y?: number; size?: number; flip?: boolean; children?: ReactNode }) {
  const { w, h, crop } = ART[who];
  const [cx, cy, s] = crop;
  return (
    <svg x={x} y={y} width={size} height={size} viewBox={`${cx} ${cy} ${s} ${s}`} overflow="visible">
      <g transform={flip ? `translate(${2 * cx + s} 0) scale(-1 1)` : undefined}>
        <image href={`/cards/court-${who}.svg`} width={w} height={h} preserveAspectRatio="none" />
        {children}
      </g>
    </svg>
  );
}

/** Chunky outlined caption. */
function Word({ x = 60, y = 108, size = 22, fill = YELLOW, rotate = -6, children }: { x?: number; y?: number; size?: number; fill?: string; rotate?: number; children: ReactNode }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={size}
      fontWeight="900"
      fill={fill}
      stroke={OUT}
      strokeWidth={size / 4.5}
      strokeLinejoin="round"
      paintOrder="stroke"
      transform={`rotate(${rotate} ${x} ${y})`}
      style={{ fontFamily: "var(--font-baloo), system-ui, sans-serif", letterSpacing: "0.01em" }}
    >
      {children}
    </text>
  );
}

const heart = (x: number, y: number, s: number, fill = RED, rot = 0) => (
  <path
    transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / 20})`}
    d="M0 7C-6-1-16 0-16 8-16 15-6 20 0 26 6 20 16 15 16 8 16 0 6-1 0 7Z"
    fill={fill}
    stroke={OUT}
    strokeWidth={20 / s * 1.6}
    strokeLinejoin="round"
  />
);

const drop = (x: number, y: number, s: number, rot = 0) => (
  <path
    transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / 10})`}
    d="M0-10C4-4 7 0 7 4 7 8 4 11 0 11-4 11-7 8-7 4-7 0-4-4 0-10Z"
    fill={BLUE}
    stroke={OUT}
    strokeWidth={10 / s * 1.4}
  />
);

const sparkle = (x: number, y: number, s: number, fill = YELLOW) => (
  <path
    transform={`translate(${x} ${y}) scale(${s / 10})`}
    d="M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10Z"
    fill={fill}
    stroke={OUT}
    strokeWidth={10 / s * 1.3}
    strokeLinejoin="round"
  />
);

/** Comic burst behind a word. */
const burst = (x: number, y: number, r: number, fill = YELLOW, points = 12) => {
  const d = Array.from({ length: points * 2 }, (_, i) => {
    const a = (Math.PI * i) / points;
    const rr = i % 2 ? r * 0.62 : r;
    return `${(x + rr * Math.cos(a)).toFixed(1)} ${(y + rr * Math.sin(a)).toFixed(1)}`;
  }).join("L");
  return <path d={`M${d}Z`} fill={fill} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />;
};

/** A little playing card, face up (rank and suit) or face down. */
function MiniCard({ x, y, w = 34, rot = 0, rank, suit, back }: { x: number; y: number; w?: number; rot?: number; rank?: string; suit?: "S" | "H" | "D" | "C"; back?: boolean }) {
  const h = w * 1.4;
  const red = suit === "H" || suit === "D";
  return (
    <g transform={`rotate(${rot} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={w * 0.12} fill={back ? "#7a1f30" : "#fff"} stroke={OUT} strokeWidth="2.6" />
      {back ? (
        <rect x={x + w * 0.14} y={y + w * 0.14} width={w * 0.72} height={h - w * 0.28} rx={w * 0.06} fill="none" stroke={YELLOW} strokeWidth="1.6" />
      ) : (
        <g style={{ color: red ? "#c8102e" : "#151515" }}>
          <text x={x + w * 0.2} y={y + w * 0.42} textAnchor="middle" fontSize={w * 0.34} fontWeight="700" fill="currentColor" style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}>
            {rank}
          </text>
          <use href={`#suit-${suit}`} x={x + w * 0.22} y={y + h * 0.3} width={w * 0.62} height={w * 0.62} />
        </g>
      )}
    </g>
  );
}

const flame = (x: number, y: number, s: number) => (
  <g transform={`translate(${x} ${y}) scale(${s / 20})`}>
    <path d="M0 20C-11 20-16 12-14 3-12-5-5-8-6-20 3-14 6-8 5-1 8-4 9-7 9-10 15-3 16 6 12 13 9 18 5 20 0 20Z" fill="#ff7a1a" stroke={OUT} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M0 18C-6 18-8 13-7 9-6 5-2 3-2-3 3 1 5 6 4 10 6 9 7 7 7 5 10 9 9 14 6 16 4 18 2 18 0 18Z" fill={YELLOW} />
  </g>
);

const thumbsUp = (x: number, y: number, s: number, rot = 0) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s / 30})`} stroke={OUT} strokeWidth="2.6" strokeLinejoin="round" fill="#fff">
    <path d="M-4-4C-4-12 0-20 4-26 8-28 11-25 10-20L8-8H20C25-8 28-4 26 1L22 16C21 20 18 22 14 22H-4Z" />
    <rect x="-16" y="-6" width="12" height="30" rx="3" fill={BLUE} />
    <path d="M10 2H24M10 9H22M9 16H20" fill="none" strokeWidth="2" />
  </g>
);

const clock = (x: number, y: number, s: number) => (
  <g transform={`translate(${x} ${y}) scale(${s / 20})`} stroke={OUT} strokeWidth="2.4" strokeLinejoin="round">
    <circle cx="-12" cy="-15" r="6" fill={RED} />
    <circle cx="12" cy="-15" r="6" fill={RED} />
    <path d="M-12 18-15 23M12 18 15 23" />
    <circle r="17" fill="#fff" />
    <path d="M0-10V0L7 5" fill="none" strokeLinecap="round" strokeWidth="3" />
  </g>
);

// ───────────── the stickers ─────────────

const DRAW: Record<StickerId, (clip: string) => ReactNode> = {
  "king-lol": (clip) => (
    <Tile
      clip={clip}
      tilt={-6}
      over={
        <>
          {drop(14, 40, 8, -40)}
          {drop(8, 58, 6, -60)}
          {drop(106, 40, 8, 40)}
          {drop(112, 58, 6, 60)}
          <Word x={60} y={112} size={26} rotate={-8}>
            HAHA
          </Word>
        </>
      }
    >
      <Face who="K" />
    </Tile>
  ),

  "queen-cry": (clip) => (
    <Tile
      clip={clip}
      tilt={5}
      fill="#dff4ff"
      over={
        <>
          <path d="M20 108C34 100 86 100 100 108" fill={BLUE} stroke={OUT} strokeWidth="3" />
          <Word x={60} y={22} size={18} fill="#fff" rotate={4}>
            UFF…
          </Word>
        </>
      }
    >
      <Face who="Q">
        {EYES.Q.map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y + 16}C${x + (i ? 6 : -6)} ${y + 90} ${x + (i ? 16 : -16)} ${y + 200} ${x + (i ? 40 : -40)} ${y + 400}`} fill="none" stroke={OUT} strokeWidth="24" strokeLinecap="round" />
            <path d={`M${x} ${y + 16}C${x + (i ? 6 : -6)} ${y + 90} ${x + (i ? 16 : -16)} ${y + 200} ${x + (i ? 40 : -40)} ${y + 400}`} fill="none" stroke={BLUE} strokeWidth="15" strokeLinecap="round" />
          </g>
        ))}
      </Face>
    </Tile>
  ),

  "king-cool": (clip) => (
    <Tile
      clip={clip}
      tilt={-4}
      over={
        <Word x={60} y={112} size={15} fill="#fff" rotate={-4}>
          DEAL WITH IT
        </Word>
      }
    >
      <Face who="K">
        {/* pixel shades */}
        <g fill="#111">
          <rect x="200" y="122" width="210" height="16" />
          <path d="M214 138H292V170H282V180H226V170H214Z" />
          <path d="M306 138H384V170H374V180H318V170H306Z" />
        </g>
        <g fill="#fff">
          <rect x="226" y="144" width="12" height="10" />
          <rect x="238" y="156" width="12" height="10" />
          <rect x="318" y="144" width="12" height="10" />
          <rect x="330" y="156" width="12" height="10" />
        </g>
      </Face>
    </Tile>
  ),

  "king-rage": (clip) => (
    <Tile
      clip={clip}
      tilt={6}
      fill="#ffd6d0"
      over={
        <>
          <g fill="#fff" stroke={OUT} strokeWidth="2.6">
            <path d="M12 26C6 20 10 10 18 12 20 4 32 6 30 14 36 16 34 26 26 24 24 30 14 30 12 26Z" />
            <path d="M92 20C88 12 96 4 102 10 108 4 118 12 112 18 118 24 110 30 104 26 100 32 90 28 92 20Z" />
          </g>
          <path d="M84 40l6-6m4 10 8-3m-12 13 9 3" stroke={RED} strokeWidth="4.5" strokeLinecap="round" />
          <Word x={60} y={112} size={24} fill={RED} rotate={5}>
            GRRR
          </Word>
        </>
      }
    >
      <Face who="K">
        <rect x="150" y="-20" width="470" height="470" fill={RED} opacity="0.32" style={{ mixBlendMode: "multiply" }} />
      </Face>
    </Tile>
  ),

  "queen-kiss": (clip) => (
    <Tile
      clip={clip}
      tilt={-5}
      fill="#ffe4ef"
      over={
        <>
          {heart(98, 30, 13, RED, 15)}
          {heart(110, 52, 9, "#ff7eb6", 25)}
          {heart(16, 40, 9, "#ff7eb6", -20)}
          <Word x={60} y={112} size={22} fill="#ff7eb6" rotate={-6}>
            MWAH!
          </Word>
        </>
      }
    >
      <Face who="Q">{heart(560, 205, 46, RED, 10)}</Face>
    </Tile>
  ),

  "jack-shabash": (clip) => (
    <Tile
      clip={clip}
      tilt={4}
      over={
        <>
          {thumbsUp(96, 64, 30, 8)}
          {sparkle(20, 28, 9)}
          {sparkle(104, 26, 7)}
          <Word x={58} y={113} size={19} rotate={-4}>
            SHABASH!
          </Word>
        </>
      }
    >
      <Face who="J" x={2} />
    </Tile>
  ),

  "jack-sweat": (clip) => (
    <Tile
      clip={clip}
      tilt={-6}
      fill="#e5f6ff"
      over={
        <>
          {drop(30, 34, 9, -10)}
          {drop(20, 52, 6, -20)}
          <Word x={60} y={112} size={20} fill="#fff" rotate={-5}>
            UH OH
          </Word>
        </>
      }
    >
      <Face who="J">
        {drop(300, 120, 34, -15)}
        {drop(452, 70, 26, 10)}
      </Face>
    </Tile>
  ),

  "jack-jaldi": (clip) => (
    <Tile
      clip={clip}
      tilt={5}
      over={
        <>
          {clock(96, 34, 15)}
          <path d="M80 16l-6-6M112 16l6-6M96 6V0" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
          <Word x={56} y={113} size={22} fill={YELLOW} rotate={-5}>
            JALDI!
          </Word>
        </>
      }
    >
      <Face who="J" x={-2} />
    </Tile>
  ),

  "queen-think": (clip) => (
    <Tile
      clip={clip}
      tilt={-4}
      over={
        <>
          <circle cx="16" cy="50" r="4" fill="#fff" stroke={OUT} strokeWidth="2.4" />
          <circle cx="10" cy="38" r="6" fill="#fff" stroke={OUT} strokeWidth="2.4" />
          <ellipse cx="22" cy="18" rx="17" ry="13" fill="#fff" stroke={OUT} strokeWidth="2.8" />
          <Word x={22} y={26} size={20} fill="#9b6bff" rotate={0}>
            ?
          </Word>
          <Word x={66} y={113} size={20} fill="#fff" rotate={-4}>
            HMM…
          </Word>
        </>
      }
    >
      <Face who="Q" x={16} />
    </Tile>
  ),

  "king-wah": (clip) => (
    <Tile
      clip={clip}
      tilt={-5}
      fill="#fff6d6"
      over={
        <>
          {sparkle(14, 30, 11)}
          {sparkle(108, 36, 9)}
          {sparkle(102, 18, 6, "#fff")}
          <Word x={60} y={113} size={26} rotate={-7}>
            WAH!
          </Word>
        </>
      }
    >
      <Face who="K" />
    </Tile>
  ),

  "jack-sleep": (clip) => (
    <Tile
      clip={clip}
      tilt={6}
      fill="#d9dcff"
      over={
        <>
          <Word x={90} y={40} size={14} fill="#fff" rotate={-10}>
            z
          </Word>
          <Word x={100} y={28} size={18} fill="#fff" rotate={-10}>
            z
          </Word>
          <Word x={110} y={14} size={22} fill="#fff" rotate={-10}>
            Z
          </Word>
          <Word x={58} y={113} size={18} fill="#fff" rotate={-4}>
            KHEL BHI LO
          </Word>
        </>
      }
    >
      <Face who="J">
        <path d="M352 132C362 142 382 142 392 132" fill="none" stroke="#111" strokeWidth="9" strokeLinecap="round" />
      </Face>
    </Tile>
  ),

  gg: (clip) => (
    <Tile
      clip={clip}
      tilt={-3}
      over={
        <>
          {heart(60, 26, 12, RED)}
          <path d="M8 92H112L104 104 112 116H8L16 104Z" fill={RED} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
          <Word x={60} y={113} size={22} fill="#fff" rotate={0}>
            GG
          </Word>
        </>
      }
    >
      <Face who="K" x={-12} y={20} size={78} />
      <Face who="Q" x={52} y={20} size={78} />
    </Tile>
  ),

  rung: () => (
    <g>
      {burst(60, 56, 54, YELLOW, 14)}
      <MiniCard x={38} y={16} w={44} rot={-10} rank="A" suit="S" />
      <path d="M22 76l-12 6M24 88l-14 2M98 76l12 6M96 88l14 2" stroke={OUT} strokeWidth="3.5" strokeLinecap="round" />
      <Word x={60} y={110} size={28} fill={RED} rotate={-6}>
        RUNG!
      </Word>
    </g>
  ),

  "ace-boom": () => (
    <g>
      {burst(60, 60, 56, "#ff8a2a", 11)}
      {burst(60, 60, 40, YELLOW, 9)}
      <MiniCard x={42} y={26} w={36} rot={8} rank="A" suit="H" />
      <Word x={60} y={112} size={26} fill="#fff" rotate={-8}>
        BOOM
      </Word>
    </g>
  ),

  "sab-mera": () => (
    <g>
      <ellipse cx="60" cy="96" rx="44" ry="10" fill="#000" opacity="0.25" />
      {[0, 1, 2, 3, 4].map((i) => (
        <MiniCard key={i} x={40 + i * 1.5} y={46 - i * 6} w={40} rot={-12 + i * 6} back />
      ))}
      <path d="M44 22 50 4 60 16 70 4 76 22Z" fill={YELLOW} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      {sparkle(18, 30, 9)}
      {sparkle(102, 36, 8)}
      <Word x={60} y={112} size={22} rotate={-5}>
        SAB MERA!
      </Word>
    </g>
  ),

  court: (clip) => (
    <Tile clip={clip} tilt={-4} over={null}>
      <Face who="K" x={10} y={18} size={100} />
      <g transform="rotate(-18 60 70)">
        <rect x="8" y="52" width="104" height="34" rx="6" fill="#fff" fillOpacity="0.8" stroke={RED} strokeWidth="5" />
        <Word x={60} y={78} size={21} fill={RED} rotate={0}>
          COURT!
        </Word>
      </g>
    </Tile>
  ),

  "on-fire": () => (
    <g>
      {flame(30, 40, 26)}
      {flame(90, 36, 28)}
      {flame(60, 26, 34)}
      <MiniCard x={22} y={44} w={34} rot={-18} rank="K" suit="H" />
      <MiniCard x={43} y={38} w={34} rot={0} rank="A" suit="S" />
      <MiniCard x={64} y={44} w={34} rot={18} rank="Q" suit="D" />
      <Word x={60} y={114} size={21} rotate={-5}>
        ON FIRE
      </Word>
    </g>
  ),

  oops: () => (
    <g>
      <MiniCard x={20} y={20} w={36} rot={-35} rank="2" suit="C" />
      <MiniCard x={60} y={36} w={34} rot={28} rank="3" suit="D" />
      <path d="M14 14l-6-6M30 8l2-8M70 22l6-8" stroke={OUT} strokeWidth="3" strokeLinecap="round" />
      {drop(100, 26, 8, 20)}
      <Word x={60} y={110} size={28} fill="#fff" rotate={-8}>
        OOPS
      </Word>
    </g>
  ),
};
