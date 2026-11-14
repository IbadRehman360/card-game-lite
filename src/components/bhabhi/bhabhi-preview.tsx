/** A small picture for the menu poster: a trick on the felt, one card off-suit, and the THULLA stamp. */
export function BhabhiPreview({ className }: { className?: string }) {
  const cards: { x: number; y: number; r: number; rank: string; suit: string; red: boolean }[] = [
    { x: 74, y: 30, r: -14, rank: "9", suit: "♥", red: true },
    { x: 104, y: 22, r: -2, rank: "K", suit: "♥", red: true },
    { x: 134, y: 30, r: 12, rank: "4", suit: "♥", red: true },
    { x: 160, y: 46, r: 26, rank: "Q", suit: "♠", red: false },
  ];
  return (
    <svg className={className} viewBox="0 0 260 150" role="img" aria-label="Bhabhi Thulla">
      <defs>
        <radialGradient id="bh-felt" cx="50%" cy="42%" r="65%">
          <stop offset="0" stopColor="#8a2a37" />
          <stop offset="0.6" stopColor="#4a1219" />
          <stop offset="1" stopColor="#2a0a0e" />
        </radialGradient>
        <pattern id="bh-back" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#6e1420" />
          <rect width="3" height="6" fill="#9b2230" />
        </pattern>
      </defs>
      <ellipse cx="130" cy="78" rx="122" ry="66" fill="#5c3a0e" />
      <ellipse cx="130" cy="78" rx="118" ry="62" fill="#f2c76b" />
      <ellipse cx="130" cy="78" rx="115" ry="59" fill="#b07a26" />
      <ellipse cx="130" cy="78" rx="109" ry="53" fill="url(#bh-felt)" />
      {/* the thrown-away pile */}
      <g transform="translate(206 92)">
        <rect x="-10" y="-14" width="20" height="28" rx="3" fill="url(#bh-back)" stroke="#f4ecd8" strokeWidth="2" transform="rotate(-10)" />
        <rect x="-10" y="-14" width="20" height="28" rx="3" fill="url(#bh-back)" stroke="#f4ecd8" strokeWidth="2" transform="rotate(6)" />
      </g>
      {cards.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y}) rotate(${c.r})`}>
          <rect
            width="34"
            height="48"
            rx="4"
            fill="#fffaf0"
            stroke={c.red ? "#1a0f04" : "#e0475a"}
            strokeWidth={c.red ? 1.5 : 2.5}
          />
          <text x="5" y="14" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="12" fill={c.red ? "#c8202e" : "#140d02"}>
            {c.rank}
          </text>
          <text x="17" y="36" textAnchor="middle" fontSize="18" fill={c.red ? "#c8202e" : "#140d02"}>
            {c.suit}
          </text>
        </g>
      ))}
      {/* THULLA! */}
      <g transform="translate(118 108) rotate(-8)">
        <rect x="-50" y="-15" width="100" height="30" rx="6" fill="#c8202e" stroke="#fff" strokeWidth="3" />
        <text x="0" y="8" textAnchor="middle" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="20" letterSpacing="2" fill="#fff">
          THULLA!
        </text>
      </g>
    </svg>
  );
}
