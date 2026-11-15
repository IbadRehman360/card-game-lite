"use client";

import { feltPatternSvg, TABLE_LOOKS, useTableTheme, veinPatternSvg } from "@/lib/table-theme";
import { DEFAULT_TABLE } from "@/lib/wallet/economy";

/** The table's outlines, already projected through the stage's camera (see Room in tavern-stage.tsx). */
export interface TablePaths {
  /** The dark slab under the rail, top to bottom edge (its visible front and sides). */
  apron: string;
  /** The rail's outer face, from its top edge down to the apron. */
  face: string;
  /** Screen y of the near rail's top edge, the bottom of its face, and the bottom of the apron. */
  faceY: [number, number, number];
  /** The four turned legs: the far two first, so the near ones are drawn over them. */
  legs: string[];
  /** The table's shadow on the floor. */
  shadow: string;
  /** The rounded crown of the rail, where the studs sit (it catches the lamp). */
  ridge: string;
  rim: string;
  lip: string;
  felt: string;
  inlay: string;
  /** The felt's printed diamonds: the big one, then the one inside it. */
  emblem: string[];
  /** Each stud: screen x, y and its radius at its own distance. */
  studs: [number, number, number][];
}

/** The convex hull of screen points, as a closed SVG path (the outline of a solid seen from the side). */
export function hullPath(pts: [number, number][]): string {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return "";
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("") + "Z";
}

/** Two hex colours mixed, `t` of the way from a to b. */
function mix(a: string, b: string, t: number): string {
  const c = (h: string) => {
    const s = h.replace("#", "");
    const f = s.length === 3 ? s.replace(/./g, "$&$&") : s;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  const x = c(a);
  const y = c(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The card table, drawn in the theme the player picked (the shop's Tables tab). The same outlines as the
 * 3D app's table; only the paint changes, so every game's layout on the felt stays where it was.
 *
 * It is painted like the title screen's table: a floor shadow, turned legs and a dark apron, a thick rail
 * whose crown and front edge catch the lamp, brass studs, a felt lit in a warm pool under the lamp with
 * a velour nap, the rail's shadow on its edge, and a gold inlay line set in from the rail.
 *
 * In the title and menus the baked room picture holds its own table, so nothing is drawn. In a game the
 * table is always drawn, in every theme: on phones over the baked room, through the picture's own camera,
 * so the drawn felt and rail sit exactly on the picture's.
 */
export function ThemedTable({
  paths,
  w,
  h,
  plate,
  play,
  squash = 1,
}: {
  paths: TablePaths;
  w: number;
  h: number;
  /** A baked room picture is showing (it holds its own table). */
  plate: boolean;
  /** A game is on (themes are shown at the game tables). */
  play: boolean;
  /** How much the slant of the camera flattens the felt (0..1), for the printed patterns. */
  squash?: number;
}) {
  const id = useTableTheme();
  const themed = id !== DEFAULT_TABLE && play;
  const look = themed ? TABLE_LOOKS[id] : TABLE_LOOKS[DEFAULT_TABLE];
  if (plate && !play) return null;

  const tile = Math.max(18, w / 26);
  const pattern = look.pattern !== "none" ? feltPatternSvg("tt-pat", look, tile, Math.max(0.35, Math.min(1, squash))) : "";
  const veins = look.railVeins ? veinPatternSvg("tt-veins", look.railVeins, Math.max(80, w / 6)) : "";
  const grainSize = Math.max(160, w / 4);
  const u = Math.max(1, Math.min(w, h * 1.4) / 400); // a line-width unit that grows with the screen
  const [fy0, fy1, fy2] = paths.faceY;
  const studColours = [...new Set(look.studs)];

  return (
    <svg className="st-table" data-theme={id} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <radialGradient id="st-felt" cx="0.5" cy="0.42" r="0.64">
          <stop offset="0" stopColor={look.felt[0]} />
          <stop offset="0.24" stopColor={mix(look.felt[0], look.felt[1], 0.55)} />
          <stop offset="0.5" stopColor={look.felt[1]} />
          <stop offset="0.85" stopColor={look.felt[2]} />
          <stop offset="1" stopColor={look.felt[3]} />
        </radialGradient>
        {/* the lamp's pool, laid over the felt: a warm bloom in the middle */}
        <radialGradient id="st-glow" cx="0.5" cy="0.44" r="0.46">
          <stop offset="0" stopColor="#ffd7a0" stopOpacity="0.2" />
          <stop offset="0.55" stopColor="#ffc27a" stopOpacity="0.07" />
          <stop offset="1" stopColor="#ffc27a" stopOpacity="0" />
        </radialGradient>
        {/* and the shade the lamp leaves at the felt's edges */}
        <radialGradient id="st-shade" cx="0.5" cy="0.42" r="0.66">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.rail[0]} />
          <stop offset="0.45" stopColor={look.rail[1]} />
          <stop offset="1" stopColor={look.rail[2]} />
        </linearGradient>
        {/* the rail's front face: lit along its top edge, falling into shadow toward the apron */}
        <linearGradient id="st-face" gradientUnits="userSpaceOnUse" x1="0" y1={fy0} x2="0" y2={Math.max(fy1, fy0 + 2)}>
          <stop offset="0" stopColor={mix(look.rail[0], look.lip, 0.55)} />
          <stop offset="0.45" stopColor={mix(look.rail[0], look.lip, 0.25)} />
          <stop offset="1" stopColor={look.rail[2]} />
        </linearGradient>
        <linearGradient id="st-apron" gradientUnits="userSpaceOnUse" x1="0" y1={fy1} x2="0" y2={Math.max(fy2, fy1 + 2)}>
          <stop offset="0" stopColor={look.apron[0]} />
          <stop offset="0.25" stopColor={look.apron[1]} />
          <stop offset="1" stopColor={look.apron[0]} />
        </linearGradient>
        {/* a turned leg: lit down its middle, dark at both sides */}
        <linearGradient id="st-leg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={look.apron[0]} />
          <stop offset="0.42" stopColor={mix(look.apron[1], look.rail[1], 0.6)} />
          <stop offset="1" stopColor={look.apron[0]} />
        </linearGradient>
        <radialGradient id="st-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stopColor="#000" stopOpacity="0.6" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        {studColours.map((c, i) => (
          <radialGradient key={c} id={`st-stud-${i}`} cx="0.5" cy="0.5" r="0.55" fx="0.36" fy="0.3">
            <stop offset="0" stopColor="#fffbea" />
            <stop offset="0.3" stopColor={mix(c, "#ffffff", 0.25)} />
            <stop offset="0.75" stopColor={c} />
            <stop offset="1" stopColor={mix(c, "#000000", 0.6)} />
          </radialGradient>
        ))}
        <clipPath id="st-rim-clip">
          <path d={paths.rim} />
        </clipPath>
        <clipPath id="st-felt-clip">
          <path d={paths.felt} />
        </clipPath>
        <filter id="tt-grey" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
        </filter>
        {look.grain && (
          <pattern id="tt-felt-grain" width={grainSize} height={grainSize} patternUnits="userSpaceOnUse">
            <image
              href={look.grain.src === "oak" ? "/assets/textures/table-oak.webp" : "/assets/textures/felt-velour.webp"}
              width={grainSize}
              height={grainSize}
              preserveAspectRatio="none"
              filter="url(#tt-grey)"
            />
          </pattern>
        )}
        {look.railGrain > 0 && (
          <pattern id="tt-oak" width={grainSize} height={grainSize} patternUnits="userSpaceOnUse">
            <image href="/assets/textures/table-oak.webp" width={grainSize} height={grainSize} preserveAspectRatio="none" filter="url(#tt-grey)" />
          </pattern>
        )}
      </defs>
      {(pattern || veins) && <defs dangerouslySetInnerHTML={{ __html: pattern + veins }} />}

      {/* grounded: the shadow on the floor, then the legs, the apron and the rail's face */}
      <path d={paths.shadow} fill="url(#st-floor)" />
      {paths.legs.map((d, i) => (
        <path key={i} d={d} fill="url(#st-leg)" opacity={i < 2 ? 0.7 : 1} />
      ))}
      <path d={paths.apron} fill="url(#st-apron)" />
      <path d={paths.face} fill="url(#st-face)" />
      {veins && <path d={paths.face} fill="url(#tt-veins)" opacity={0.6} />}

      {/* the rail's top: wood (or lacquer, stone) with its grain */}
      <path d={paths.rim} fill="url(#st-wood)" />
      {look.railGrain > 0 && <path d={paths.rim} fill="url(#tt-oak)" opacity={look.railGrain} style={{ mixBlendMode: "multiply" }} />}
      {veins && <path d={paths.rim} fill="url(#tt-veins)" />}
      <g clipPath="url(#st-rim-clip)">
        {/* the lit outer edge, where the top turns down into the face */}
        <path d={paths.rim} fill="none" stroke={look.lip} strokeOpacity={0.55} strokeWidth={2.4 * u} />
        {/* the rounded crown catching the lamp: a soft wide sheen, a bright line along its top */}
        <path d={paths.ridge} fill="none" stroke={look.lip} strokeOpacity={0.28} strokeWidth={9 * u} strokeLinejoin="round" />
        <path d={paths.ridge} fill="none" stroke={mix(look.lip, "#fff4d6", 0.35)} strokeOpacity={0.2} strokeWidth={1.4 * u} strokeLinejoin="round" />
      </g>
      {/* the lit inner bevel of the rim, then the dark seam into the felt */}
      <path d={paths.lip} fill="none" stroke={look.lip} strokeWidth={Math.max(2, 2.2 * u)} />
      <path d={paths.felt} fill="url(#st-felt)" stroke={look.seam} strokeWidth={Math.max(1.5, 1.4 * u)} />

      {/* the felt: velour nap, printed pattern, the lamp's pool and the shaded edge */}
      {look.grain && (
        <path d={paths.felt} fill="url(#tt-felt-grain)" opacity={look.grain.opacity} style={{ mixBlendMode: look.grain.src === "oak" ? "multiply" : "soft-light" }} />
      )}
      {pattern && <path d={paths.felt} fill="url(#tt-pat)" opacity={look.patternOpacity} />}
      <path d={paths.felt} fill="url(#st-glow)" />
      <path d={paths.felt} fill="url(#st-shade)" />
      {/* the rail's own shadow on the felt's edge */}
      <g clipPath="url(#st-felt-clip)">
        <path d={paths.felt} fill="none" stroke="#000" strokeOpacity={0.16} strokeWidth={14 * u} strokeLinejoin="round" />
        <path d={paths.felt} fill="none" stroke="#000" strokeOpacity={0.24} strokeWidth={5 * u} strokeLinejoin="round" />
      </g>

      {/* the inlay line set into the felt: one metal, or a run of gems */}
      <path d={paths.inlay} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={3 * u} strokeLinejoin="round" />
      {look.inlay.length > 1 ? (
        look.inlay.map((c, i) => (
          <path
            key={i}
            d={paths.inlay}
            fill="none"
            stroke={c}
            strokeWidth={1.6 * u}
            strokeDasharray={`${5 * u} ${5 * u * (look.inlay.length - 1)}`}
            strokeDashoffset={-i * 5 * u}
          />
        ))
      ) : (
        <>
          <path d={paths.inlay} fill="none" stroke={look.inlay[0]} strokeWidth={1.5 * u} strokeLinejoin="round" />
          <path d={paths.inlay} fill="none" stroke="#fff4d6" strokeOpacity={0.25} strokeWidth={0.5 * u} strokeLinejoin="round" />
        </>
      )}

      {play && (
        <g className="st-emblem" aria-hidden>
          <path d={paths.emblem[0]} fill="rgba(0,0,0,0.08)" stroke="rgba(255,255,255,0.1)" strokeWidth={Math.max(1.6, 2 * u)} strokeLinejoin="round" />
          <path d={paths.emblem[1]} fill="rgba(0,0,0,0.1)" stroke="rgba(255,255,255,0.06)" strokeWidth={Math.max(1.2, 1.3 * u)} strokeLinejoin="round" />
        </g>
      )}

      {/* brass studs on the rail's crown, each with its shadow and a glint from the lamp */}
      {paths.studs.map(([x, y, k], i) => {
        const r = Math.max(1.9, Math.min(k * 1.1, 6 * u));
        return (
          <g key={i}>
            <circle cx={x} cy={y + r * 0.45} r={r * 1.05} fill="#000" opacity={0.45} />
            <circle cx={x} cy={y} r={r} fill={`url(#st-stud-${studColours.indexOf(look.studs[i % look.studs.length])})`} />
          </g>
        );
      })}
    </svg>
  );
}
