import { BRAND } from "@/lib/brand";

/**
 * The wordmark, lettered like a painted sign: each letter tilted on its own, a heavy outline,
 * a solid shadow block underneath and a soft highlight across the top. The small word rides on a tag.
 * Works for any name in BRAND; letter positions are laid out from rough Oswald Bold widths.
 */
const SIZE = 132;
const PAD = 26;
const TILTS = [-6, 4, -3, 5, -4, 3, -5, 4];
const INK = "#1a0f03";

const widthOf = (ch: string) =>
  /[MW]/.test(ch)
    ? 0.74
    : /[IJ1!'.]/.test(ch)
      ? 0.3
      : /[ ]/.test(ch)
        ? 0.26
        : /[FLTE]/.test(ch)
          ? 0.47
          : 0.54;

function layoutWord(word: string) {
  const gap = 0.04 * SIZE;
  let x = PAD;
  const layout = word
    .toUpperCase()
    .split("")
    .map((ch, i) => {
      const w = widthOf(ch) * SIZE;
      const cx = x + w / 2;
      x += w + gap;
      return { ch, cx, tilt: ch === " " ? 0 : TILTS[i % TILTS.length] };
    });
  return { layout, W: Math.max(x - gap + PAD, 260) };
}

const { layout, W } = layoutWord(BRAND.word);

export function Logo({ className = "" }: { className?: string }) {
  const tag = BRAND.tag.toUpperCase();
  const tagW = Math.max(90, tag.length * 22 + 30);

  const letters = (dy: number, fill: string, stroke: string, sw: number) =>
    layout.map(({ ch, cx, tilt }, i) => (
      <text
        key={i}
        x={cx}
        y={176 + dy}
        textAnchor="middle"
        fill={fill}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
        paintOrder="stroke"
        transform={`rotate(${tilt} ${cx} ${120 + dy})`}
      >
        {ch}
      </text>
    ));

  return (
    <h1 className={`logo ${className}`}>
      <svg
        viewBox={`0 0 ${W} 200`}
        role="img"
        aria-label={[BRAND.tag, BRAND.word].filter(Boolean).join(" ")}
      >
        <defs>
          <linearGradient id="logo-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe0a0" />
            <stop offset="0.5" stopColor="#efab3c" />
            <stop offset="1" stopColor="#b8661a" />
          </linearGradient>
          <clipPath id="logo-top">
            <rect x="0" y="0" width={W} height="102" />
          </clipPath>
        </defs>

        {tag && (
          <g transform={`rotate(-5 ${18 + tagW / 2} 30)`}>
            <rect
              x="18"
              y="18"
              width={tagW}
              height="40"
              rx="3"
              fill="#2a1604"
            />
            <rect
              x="18"
              y="12"
              width={tagW}
              height="40"
              rx="3"
              fill={INK}
              stroke="#e9a63a"
              strokeWidth="3"
            />
            <text
              x={18 + tagW / 2}
              y="43"
              textAnchor="middle"
              fill="#f6dfae"
              style={{
                fontFamily: "var(--font-oswald), sans-serif",
                fontWeight: 700,
                fontSize: 28,
                letterSpacing: "0.2em",
              }}
            >
              {tag}
            </text>
          </g>
        )}

        <g
          style={{
            fontFamily: "var(--font-oswald), sans-serif",
            fontWeight: 700,
            fontSize: SIZE,
          }}
        >
          {letters(10, "#2a1604", "#2a1604", 16)}
          {letters(0, "url(#logo-face)", INK, 12)}
          <g clipPath="url(#logo-top)">
            {letters(0, "rgba(255,240,210,0.22)", "none", 0)}
          </g>
        </g>
      </svg>
    </h1>
  );
}
