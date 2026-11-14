/** Poster art for the menu: a fan of paired cards and the one card left over, stamped G. */
export function GPattaPreview({ className }: { className?: string }) {
  const fan = [
    { r: "7", s: "♠", red: false, x: 52, rot: -24 },
    { r: "7", s: "♥", red: true, x: 70, rot: -12 },
    { r: "K", s: "♣", red: false, x: 88, rot: 0 },
    { r: "K", s: "♦", red: true, x: 106, rot: 12 },
  ];
  return (
    <svg className={`gp-preview ${className ?? ""}`} viewBox="0 0 220 140" role="img" aria-label="G Patta">
      <defs>
        <radialGradient id="gpp-felt" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#7a2431" />
          <stop offset="1" stopColor="#2a0a0e" />
        </radialGradient>
        <pattern id="gpp-back" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#6c1519" />
          <rect width="3" height="6" fill="#8e1f22" />
        </pattern>
      </defs>
      <ellipse cx="110" cy="72" rx="104" ry="62" fill="url(#gpp-felt)" stroke="#f0ad3a" strokeWidth="4" />
      {/* face-down hand being drawn from */}
      {[0, 1, 2].map((k) => (
        <rect key={k} x={24 + k * 9} y={36} width="26" height="38" rx="4" fill="url(#gpp-back)" stroke="#f4e6c2" strokeWidth="1.5" transform={`rotate(${-10 + k * 8} ${37 + k * 9} 74)`} />
      ))}
      {fan.map((c) => (
        <g key={c.r + c.s} transform={`rotate(${c.rot} ${c.x + 13} 118)`}>
          <rect x={c.x} y={56} width="30" height="44" rx="4" fill="#fffaf0" stroke="#3b2a12" strokeWidth="1.2" />
          <text x={c.x + 4} y={68} fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="11" fill={c.red ? "#c8261f" : "#1a1206"}>
            {c.r}
          </text>
          <text x={c.x + 15} y={88} textAnchor="middle" fontSize="16" fill={c.red ? "#c8261f" : "#1a1206"}>
            {c.s}
          </text>
        </g>
      ))}
      {/* the one left over */}
      <g transform="rotate(10 168 70)">
        <rect x="150" y="44" width="34" height="50" rx="5" fill="#fffaf0" stroke="#3b2a12" strokeWidth="1.4" />
        <text x="155" y="58" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="12" fill="#c8261f">
          Q
        </text>
        <text x="167" y="81" textAnchor="middle" fontSize="18" fill="#c8261f">
          ♥
        </text>
        <circle cx="172" cy="78" r="17" fill="rgba(255,240,220,0.15)" stroke="#e0473a" strokeWidth="3" />
        <text x="172" y="86" textAnchor="middle" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="22" fill="#ff5a4a" transform="rotate(-24 172 78)">
          G
        </text>
      </g>
    </svg>
  );
}
