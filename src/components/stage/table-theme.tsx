"use client";

import { feltPatternSvg, TABLE_LOOKS, useTableTheme, veinPatternSvg } from "@/lib/table-theme";
import { DEFAULT_TABLE } from "@/lib/wallet/economy";

/** The table's outlines, already projected through the stage's camera (see Room in tavern-stage.tsx). */
export interface TablePaths {
  apron: string;
  apronTop: string;
  rim: string;
  lip: string;
  felt: string;
  inlay: string;
  /** The felt's printed diamonds: the big one, then the one inside it. */
  emblem: string[];
  studs: [number, number][];
}

/**
 * The card table, drawn in the theme the player picked (the shop's Tables tab). The same outlines as the
 * 3D app's table; only the paint changes, so every game's layout on the felt stays where it was.
 *
 * Phones in a game stand on a baked picture of the room that already holds the house table. With the house
 * theme that picture shows as it always has; with any other theme this table is drawn over it, through the
 * picture's own camera, so the new felt and rail sit exactly on the old ones (and, like the picture's
 * table, in front of the player across).
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
  const L = TABLE_LOOKS[id];
  const themed = id !== DEFAULT_TABLE && play;
  const look = themed ? L : TABLE_LOOKS[DEFAULT_TABLE];
  const hide = plate && !themed;
  const tile = Math.max(18, w / 26);
  const pattern = themed ? feltPatternSvg("tt-pat", look, tile, Math.max(0.35, Math.min(1, squash))) : "";
  const veins = themed && look.railVeins ? veinPatternSvg("tt-veins", look.railVeins, Math.max(80, w / 6)) : "";
  const grainSize = Math.max(160, w / 4);

  const emblem = (
    <g className="st-emblem" aria-hidden>
      <path d={paths.emblem[0]} fill="rgba(0,0,0,0.1)" stroke="rgba(255,255,255,0.13)" strokeWidth={Math.max(2, w / 180)} strokeLinejoin="round" />
      <path d={paths.emblem[1]} fill="rgba(0,0,0,0.12)" stroke="rgba(255,255,255,0.08)" strokeWidth={Math.max(1.4, w / 300)} strokeLinejoin="round" />
    </g>
  );
  // the house picture holds its own table: only the printed diamonds go over it, in a game
  if (hide)
    return play ? (
      <svg className="st-table st-table-emblem" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        {emblem}
      </svg>
    ) : null;

  return (
    <svg className="st-table" data-hide={hide ? "" : undefined} data-theme={id} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <radialGradient id="st-felt" cx="0.5" cy="0.42" r="0.64">
          <stop offset="0" stopColor={look.felt[0]} />
          <stop offset="0.22" stopColor={themed ? look.felt[1] : "#9a2518"} />
          <stop offset="0.5" stopColor={look.felt[1]} />
          <stop offset="0.85" stopColor={look.felt[2]} />
          <stop offset="1" stopColor={look.felt[3]} />
        </radialGradient>
        <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={look.rail[0]} />
          <stop offset="0.45" stopColor={look.rail[1]} />
          <stop offset="1" stopColor={look.rail[2]} />
        </linearGradient>
        {themed && (
          <>
            {/* the lamp's pool of light: the pattern and grain fade into shadow at the edges, as the felt does */}
            <radialGradient id="tt-shade" cx="0.5" cy="0.42" r="0.64">
              <stop offset="0.5" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity="0.5" />
            </radialGradient>
            <filter id="tt-grey" colorInterpolationFilters="sRGB">
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <pattern id="tt-felt-grain" width={grainSize} height={grainSize} patternUnits="userSpaceOnUse">
              <image
                href={look.grain?.src === "oak" ? "/assets/textures/table-oak.webp" : "/assets/textures/felt-velour.webp"}
                width={grainSize}
                height={grainSize}
                preserveAspectRatio="none"
                filter="url(#tt-grey)"
              />
            </pattern>
            <pattern id="tt-oak" width={grainSize} height={grainSize} patternUnits="userSpaceOnUse">
              <image href="/assets/textures/table-oak.webp" width={grainSize} height={grainSize} preserveAspectRatio="none" filter="url(#tt-grey)" />
            </pattern>
          </>
        )}
      </defs>
      {(pattern || veins) && <defs dangerouslySetInnerHTML={{ __html: pattern + veins }} />}

      <path d={paths.apron} fill={look.apron[0]} />
      <path d={paths.apronTop} fill={look.apron[1]} />
      <path d={paths.rim} fill="url(#st-wood)" />
      {themed && look.railGrain > 0 && <path d={paths.rim} fill="url(#tt-oak)" opacity={look.railGrain} style={{ mixBlendMode: "multiply" }} />}
      {veins && <path d={paths.rim} fill="url(#tt-veins)" />}
      {/* the lit inner bevel of the rim, then the dark seam into the felt */}
      <path d={paths.lip} fill="none" stroke={look.lip} strokeWidth={Math.max(2, w / 200)} />
      <path d={paths.felt} fill="url(#st-felt)" stroke={look.seam} strokeWidth={Math.max(1.5, w / 320)} />
      {themed && look.grain && (
        <path d={paths.felt} fill="url(#tt-felt-grain)" opacity={look.grain.opacity} style={{ mixBlendMode: look.grain.src === "oak" ? "multiply" : "soft-light" }} />
      )}
      {pattern && <path d={paths.felt} fill="url(#tt-pat)" opacity={look.patternOpacity} />}
      {themed && <path d={paths.felt} fill="url(#tt-shade)" />}
      {/* no inlay line round the felt: the printed diamonds in the middle instead */}
      {play && emblem}
      {paths.studs.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={Math.max(1.4, w / 600)} fill={look.studs[i % look.studs.length]} />
      ))}
    </svg>
  );
}
