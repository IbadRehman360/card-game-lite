import { BOARD, SIZE } from "@/lib/paanch/engine";

/** A finished line and a few chips, for the poster on the menu. */
const LINE = [12, 23, 34, 45, 56];
const BLUE = new Set([...LINE, 18, 61, 74, 27]);
const GOLD = new Set([33, 44, 52, 66, 47, 81, 15]);
const SUIT = { S: "♠", H: "♥", C: "♣", D: "♦" } as const;

/** The Paanch board in miniature: card squares, free corners, chips and one glowing line of five. */
export function PaanchPreview({ className, size = 220 }: { className?: string; size?: number }) {
  const c = 10;
  const pad = 6;
  const w = SIZE * c + pad * 2;
  const centre = (i: number) => [pad + (i % SIZE) * c + c / 2, pad + Math.floor(i / SIZE) * c + c / 2] as const;
  const [x1, y1] = centre(LINE[0]);
  const [x2, y2] = centre(LINE[4]);
  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${w} ${w}`} role="img" aria-label="A Paanch board with five chips in a row">
      <defs>
        <linearGradient id="pn-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde3a4" />
          <stop offset="0.3" stopColor="#c98a2a" />
          <stop offset="0.55" stopColor="#fbd48a" />
          <stop offset="0.8" stopColor="#9a5b14" />
          <stop offset="1" stopColor="#f0ad3a" />
        </linearGradient>
        <radialGradient id="pn-felt" cx="0.5" cy="0" r="1.1">
          <stop offset="0" stopColor="#7a2431" />
          <stop offset="0.7" stopColor="#4a1219" />
        </radialGradient>
        <radialGradient id="pn-blue" cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#8cc8ff" />
          <stop offset="0.7" stopColor="#2b74db" />
        </radialGradient>
        <radialGradient id="pn-gold" cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#ffe39a" />
          <stop offset="0.7" stopColor="#e1a326" />
        </radialGradient>
      </defs>
      <rect x="0.8" y="0.8" width={w - 1.6} height={w - 1.6} rx="5" fill="url(#pn-felt)" stroke="url(#pn-rim)" strokeWidth="1.6" />
      {BOARD.map((card, i) => {
        const x = pad + (i % SIZE) * c + 0.4;
        const y = pad + Math.floor(i / SIZE) * c + 0.4;
        if (!card) {
          return (
            <g key={i}>
              <rect x={x} y={y} width={c - 0.8} height={c - 0.8} rx="1.3" fill="#f0ad3a" />
              <text x={x + 4.6} y={y + 6.6} fontSize="6" textAnchor="middle" fill="#140d02">
                ★
              </text>
            </g>
          );
        }
        const redSuit = card[1] === "H" || card[1] === "D";
        const court = card[0] === "K" || card[0] === "Q";
        return (
          <g key={i}>
            <rect x={x} y={y} width={c - 0.8} height={c - 0.8} rx="1.3" fill={court ? "#f6dc9c" : "#fbf4e2"} />
            <text x={x + 1.1} y={y + 3.9} fontSize="3.6" fontWeight="700" fill={redSuit ? "#c71f2f" : "#1c1a22"} fontFamily="sans-serif">
              {card[0] === "T" ? "10" : card[0]}
            </text>
            <text x={x + 8} y={y + 8.4} fontSize="4.6" textAnchor="end" fill={redSuit ? "#c71f2f" : "#1c1a22"}>
              {SUIT[card[1] as keyof typeof SUIT]}
            </text>
          </g>
        );
      })}
      {[...BLUE, ...GOLD].map((i) => {
        const [x, y] = centre(i);
        const blue = BLUE.has(i);
        return (
          <circle
            key={`chip${i}`}
            cx={x}
            cy={y}
            r="3.4"
            fill={`url(#${blue ? "pn-blue" : "pn-gold"})`}
            stroke={LINE.includes(i) ? "#fff" : blue ? "#0b2c63" : "#6a4206"}
            strokeWidth={LINE.includes(i) ? 0.8 : 0.5}
          />
        );
      })}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8cc8ff" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8cc8ff" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
