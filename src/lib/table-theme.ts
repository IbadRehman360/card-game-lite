"use client";

import { usePrefs } from "./prefs";
import { useWallet } from "./wallet/client";
import { DEFAULT_TABLE, type TableThemeId } from "./wallet/economy";

/**
 * Table themes: how each table on sale looks (the names and prices are in wallet/economy.ts, so the server
 * charges from its own list). A theme is a felt (four tones from the lamp-lit middle to the shaded edge),
 * a woven or printed pattern on it, a rail (three tones, top to underside), and the accents: the lit lip
 * of the rail, the inlay line round the felt and the studs on the rail.
 *
 * The same description draws the table in a game (src/components/stage/table-theme.tsx) and the little
 * picture in the shop (tablePreviewUrl), so what is sold is what is seen.
 */

export type FeltPattern = "none" | "weave" | "diamond" | "planks" | "jaali" | "truck" | "deco";

export interface TableLook {
  /** Felt: lamp-lit middle, body, edge, deep edge. */
  felt: [string, string, string, string];
  pattern: FeltPattern;
  patternInk: string;
  patternOpacity: number;
  /** A photographic grain laid over the felt (the CC0 velour or oak in public/assets/textures), 0 for none. */
  grain: { src: "felt" | "oak"; opacity: number } | null;
  /** Rail: top, middle, underside. */
  rail: [string, string, string];
  /** Oak grain on the rail (0: a painted or lacquered rail). */
  railGrain: number;
  /** Veins drawn over the rail, for a stone rail. */
  railVeins?: string;
  /** The lit inner lip of the rail. */
  lip: string;
  /** The dark seam where the felt meets the rail. */
  seam: string;
  /** The inlay line round the felt; several colours make a dashed, gem-set line. */
  inlay: string[];
  /** Studs on the rail (alternating when more than one). */
  studs: string[];
  /** The slab under the rail: underside and the band just below the top. */
  apron: [string, string];
}

export const TABLE_LOOKS: Record<TableThemeId, TableLook> = {
  // the house table, as the title screen shows it: lamp-lit oxblood felt, a walnut rail with a lit
  // bronze edge, a gold inlay and brass studs
  tavern: {
    felt: ["#bb4228", "#a2311c", "#741a0e", "#4a0c06"],
    pattern: "none",
    patternInk: "#000",
    patternOpacity: 0,
    grain: { src: "felt", opacity: 0.28 },
    rail: ["#5e3416", "#4a280e", "#22110a"],
    railGrain: 0.45,
    lip: "#a46a33",
    seam: "#2b060d",
    inlay: ["#e0a24a"],
    studs: ["#f6c65a"],
    apron: ["#070200", "#1a0a03"],
  },
  // a club's billiard-green baize, mahogany rail and a brass line
  baize: {
    felt: ["#3c9a5c", "#25763f", "#16552c", "#0b3019"],
    pattern: "weave",
    patternInk: "#04170b",
    patternOpacity: 0.22,
    grain: { src: "felt", opacity: 0.4 },
    rail: ["#6a2a14", "#4f1c0c", "#240a03"],
    railGrain: 0.5,
    lip: "#b0703f",
    seam: "#0a1a0f",
    inlay: ["#d9ad4f"],
    studs: ["#f0cf7a"],
    apron: ["#080302", "#170804"],
  },
  // deep blue speed cloth with a faint diamond print, black lacquer and silver
  midnight: {
    felt: ["#2f5c9e", "#1f427a", "#132b55", "#08142c"],
    pattern: "diamond",
    patternInk: "#b8c8e6",
    patternOpacity: 0.09,
    grain: { src: "felt", opacity: 0.3 },
    rail: ["#33343c", "#1b1b21", "#060608"],
    railGrain: 0,
    lip: "#9aa8be",
    seam: "#050a16",
    inlay: ["#d4dcea"],
    studs: ["#eef3fb"],
    apron: ["#020203", "#0c0c10"],
  },
  // a roadside dhaba's table: oiled planks, a painted teal rim and mustard tin trim
  dhaba: {
    felt: ["#b8763a", "#9a5c26", "#7a4319", "#4c260b"],
    pattern: "planks",
    patternInk: "#2c1405",
    patternOpacity: 0.55,
    grain: { src: "oak", opacity: 0.55 },
    rail: ["#3a9a90", "#24716a", "#0e3a36"],
    railGrain: 0,
    lip: "#7fd0c2",
    seam: "#2a1405",
    inlay: ["#f2c14e"],
    studs: ["#f6d36b"],
    apron: ["#061614", "#0e2826"],
  },
  // white Makrana marble round a lapis felt with a gold jaali lattice; a pietra dura line of carnelian,
  // lapis and malachite set into the marble
  marble: {
    felt: ["#2a7a86", "#1c5e6a", "#123f49", "#08242b"],
    pattern: "jaali",
    patternInk: "#f3d99a",
    patternOpacity: 0.2,
    grain: { src: "felt", opacity: 0.3 },
    rail: ["#f6f1e6", "#ddd3c0", "#8f8471"],
    railGrain: 0,
    railVeins: "#8a7f6c",
    lip: "#fffaf0",
    seam: "#0a2a30",
    inlay: ["#c23b22", "#1f4fa0", "#1f8a57", "#d9ad4f"],
    studs: ["#c23b22", "#1f8a57"],
    apron: ["#2a261f", "#4a443a"],
  },
  // a Bedford truck's back: royal blue with stencilled phool-patti flowers, a sunflower-yellow rim and
  // chamak-patti studs in every colour
  truck: {
    felt: ["#2f62c4", "#1f4ba0", "#163677", "#0b1d45"],
    pattern: "truck",
    patternInk: "#ffd21f",
    patternOpacity: 0.26,
    grain: { src: "felt", opacity: 0.25 },
    rail: ["#ffcf2e", "#e2a400", "#7a5200"],
    railGrain: 0,
    lip: "#fff1a8",
    seam: "#0a1530",
    inlay: ["#ff3b5c", "#1fa04a", "#ffd21f", "#ff7a1a"],
    studs: ["#ff3b5c", "#1fa04a", "#1e6fd9", "#ff7a1a"],
    apron: ["#2a1a00", "#4a2f00"],
  },
  // black felt with art-deco fans in gold, and a gilded rail
  gold: {
    felt: ["#34302b", "#211e1a", "#141210", "#060505"],
    pattern: "deco",
    patternInk: "#e2b85a",
    patternOpacity: 0.16,
    grain: { src: "felt", opacity: 0.35 },
    rail: ["#f6dc8c", "#c99a38", "#5e3d0a"],
    railGrain: 0,
    lip: "#fff3c4",
    seam: "#000",
    inlay: ["#e8c06a"],
    studs: ["#fff0b8"],
    apron: ["#0a0700", "#1e1503"],
  },
};

/**
 * The felt pattern as an SVG <pattern> (a string, so the game's table and the shop picture share it).
 * `s` is the tile size in user units; `squash` flattens it by the slant of the camera.
 */
export function feltPatternSvg(id: string, look: TableLook, s: number, squash = 1): string {
  const ink = look.patternInk;
  const sw = Math.max(0.6, s / 28).toFixed(2);
  const t = `patternTransform="scale(1 ${squash.toFixed(3)})"`;
  const open = (w: number, h: number) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" ${t}>`;
  const n = (v: number) => v.toFixed(2);
  switch (look.pattern) {
    case "weave": {
      const a = s / 4;
      return `${open(a, a)}<path d="M0 ${n(a)}L${n(a)} 0M0 0L${n(a)} ${n(a)}" stroke="${ink}" stroke-width="${n(a / 5)}"/></pattern>`;
    }
    case "diamond":
      return `${open(s, s)}<path d="M${n(s / 2)} 0L${n(s)} ${n(s / 2)}L${n(s / 2)} ${n(s)}L0 ${n(s / 2)}Z" fill="none" stroke="${ink}" stroke-width="${sw}"/><circle cx="${n(s / 2)}" cy="${n(s / 2)}" r="${n(s / 14)}" fill="${ink}"/></pattern>`;
    case "planks": {
      // boards running across, each with a butt joint at its own place, and a little grain
      const h = s * 0.9;
      return `${open(s * 4, h * 2)}<path d="M0 0H${n(s * 4)}M0 ${n(h)}H${n(s * 4)}M${n(s * 1.3)} 0V${n(h)}M${n(s * 3.1)} ${n(h)}V${n(h * 2)}" stroke="${ink}" stroke-width="${n(s / 14)}"/><path d="M${n(s * 0.2)} ${n(h * 0.4)}C${n(s)} ${n(h * 0.3)} ${n(s * 2)} ${n(h * 0.55)} ${n(s * 3.6)} ${n(h * 0.42)}M${n(s * 0.6)} ${n(h * 1.5)}C${n(s * 1.6)} ${n(h * 1.38)} ${n(s * 2.4)} ${n(h * 1.62)} ${n(s * 3.8)} ${n(h * 1.5)}" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="${n(s / 30)}"/></pattern>`;
    }
    case "jaali": {
      // the Mughal eight-point star lattice: two squares turned 45° in every cell, joined to the next cell
      const c = s / 2;
      const r = s * 0.3;
      const d = r * Math.SQRT1_2;
      const sq = `M${n(c - d)} ${n(c - d)}H${n(c + d)}V${n(c + d)}H${n(c - d)}Z`;
      const rh = `M${n(c)} ${n(c - r)}L${n(c + r)} ${n(c)}L${n(c)} ${n(c + r)}L${n(c - r)} ${n(c)}Z`;
      const links = `M${n(c + r)} ${n(c)}H${n(s)}M0 ${n(c)}H${n(c - r)}M${n(c)} ${n(c + r)}V${n(s)}M${n(c)} 0V${n(c - r)}`;
      return `${open(s, s)}<path d="${sq}${rh}${links}" fill="none" stroke="${ink}" stroke-width="${sw}"/><circle cx="0" cy="0" r="${n(s / 10)}" fill="${ink}"/><circle cx="${n(s)}" cy="0" r="${n(s / 10)}" fill="${ink}"/><circle cx="0" cy="${n(s)}" r="${n(s / 10)}" fill="${ink}"/><circle cx="${n(s)}" cy="${n(s)}" r="${n(s / 10)}" fill="${ink}"/></pattern>`;
    }
    case "truck": {
      // a stencilled five-petal phool in the middle of each cell, little leaves and dots between
      const c = s / 2;
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = (i * 72 * Math.PI) / 180;
        return `<ellipse cx="${n(c + Math.sin(a) * s * 0.13)}" cy="${n(c - Math.cos(a) * s * 0.13)}" rx="${n(s * 0.07)}" ry="${n(s * 0.12)}" transform="rotate(${i * 72} ${n(c + Math.sin(a) * s * 0.13)} ${n(c - Math.cos(a) * s * 0.13)})" fill="${ink}"/>`;
      }).join("");
      return `${open(s, s)}${petals}<circle cx="${n(c)}" cy="${n(c)}" r="${n(s * 0.06)}" fill="#ff5fa2"/><circle cx="0" cy="0" r="${n(s * 0.05)}" fill="#ff5fa2"/><circle cx="${n(s)}" cy="0" r="${n(s * 0.05)}" fill="#ff5fa2"/><circle cx="0" cy="${n(s)}" r="${n(s * 0.05)}" fill="#ff5fa2"/><circle cx="${n(s)}" cy="${n(s)}" r="${n(s * 0.05)}" fill="#ff5fa2"/><path d="M${n(s * 0.08)} ${n(c)}q${n(s * 0.08)} -${n(s * 0.1)} ${n(s * 0.16)} 0q-${n(s * 0.08)} ${n(s * 0.1)} -${n(s * 0.16)} 0ZM${n(s * 0.76)} ${n(c)}q${n(s * 0.08)} -${n(s * 0.1)} ${n(s * 0.16)} 0q-${n(s * 0.08)} ${n(s * 0.1)} -${n(s * 0.16)} 0Z" fill="#3fd47a"/></pattern>`;
    }
    case "deco": {
      // art-deco fans: a scale pattern of arcs, rays inside each
      const w = s;
      const h = s / 2;
      const rays = [-50, -25, 0, 25, 50]
        .map((deg) => {
          const a = (deg * Math.PI) / 180;
          return `M${n(w / 2)} ${n(h)}L${n(w / 2 + Math.sin(a) * h * 0.85)} ${n(h - Math.cos(a) * h * 0.85)}`;
        })
        .join("");
      return `${open(w, h)}<path d="M0 ${n(h)}A${n(w / 2)} ${n(h)} 0 0 1 ${n(w)} ${n(h)}M${n(-w / 2)} 0A${n(w / 2)} ${n(h)} 0 0 0 ${n(w / 2)} 0M${n(w / 2)} 0A${n(w / 2)} ${n(h)} 0 0 0 ${n(w * 1.5)} 0${rays}" fill="none" stroke="${ink}" stroke-width="${sw}"/></pattern>`;
    }
    default:
      return "";
  }
}

/** Meandering grey veins for a marble rail, as a <pattern> tile `s` wide. */
export function veinPatternSvg(id: string, ink: string, s: number): string {
  const n = (v: number) => v.toFixed(1);
  return `<pattern id="${id}" width="${n(s)}" height="${n(s * 0.6)}" patternUnits="userSpaceOnUse"><path d="M0 ${n(s * 0.12)}C${n(s * 0.2)} ${n(s * 0.02)} ${n(s * 0.35)} ${n(s * 0.3)} ${n(s * 0.55)} ${n(s * 0.2)}S${n(s * 0.85)} ${n(s * 0.05)} ${n(s)} ${n(s * 0.12)}M${n(s * 0.3)} ${n(s * 0.6)}C${n(s * 0.4)} ${n(s * 0.45)} ${n(s * 0.6)} ${n(s * 0.5)} ${n(s * 0.7)} ${n(s * 0.36)}M${n(s * 0.55)} ${n(s * 0.2)}L${n(s * 0.62)} ${n(s * 0.34)}" fill="none" stroke="${ink}" stroke-opacity=".55" stroke-width="${n(Math.max(0.6, s / 90))}"/></pattern>`;
}

/** The theme the tables actually show: the one picked, if this wallet owns it, else the free one. */
export function useTableTheme(): TableThemeId {
  const { tableTheme } = usePrefs();
  const { tables } = useWallet();
  return tables.includes(tableTheme) ? tableTheme : DEFAULT_TABLE;
}

/**
 * A small picture of a theme for the shop: the table seen from a little above, rail, felt, inlay and
 * studs, on the dark of the room. 160 × 120.
 */
export function tablePreviewSvg(id: TableThemeId): string {
  const L = TABLE_LOOKS[id];
  const pat = feltPatternSvg("p", L, 22, 0.62);
  const studs = L.studs;
  const studXs = Array.from({ length: 9 }, (_, i) => 22 + i * 14.5);
  const inlay =
    L.inlay.length > 1
      ? L.inlay.map((c, i) => `<rect x="30" y="38" width="100" height="46" rx="16" fill="none" stroke="${c}" stroke-width="2.2" stroke-dasharray="4 ${4 * (L.inlay.length - 1)}" stroke-dashoffset="${-i * 4}"/>`).join("")
      : `<rect x="30" y="38" width="100" height="46" rx="16" fill="none" stroke="${L.inlay[0]}" stroke-width="1.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
  <defs>
    <radialGradient id="f" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="${L.felt[0]}"/><stop offset=".45" stop-color="${L.felt[1]}"/><stop offset=".85" stop-color="${L.felt[2]}"/><stop offset="1" stop-color="${L.felt[3]}"/></radialGradient>
    <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.rail[0]}"/><stop offset=".5" stop-color="${L.rail[1]}"/><stop offset="1" stop-color="${L.rail[2]}"/></linearGradient>
    <radialGradient id="v" cx=".5" cy=".45" r=".65"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
    ${pat}
    ${L.railVeins ? veinPatternSvg("m", L.railVeins, 60) : ""}
  </defs>
  <ellipse cx="80" cy="104" rx="70" ry="9" fill="#000" opacity=".45"/>
  <rect x="8" y="30" width="144" height="74" rx="30" fill="${L.apron[0]}"/>
  <rect x="8" y="22" width="144" height="76" rx="30" fill="url(#r)"/>
  ${L.railVeins ? `<rect x="8" y="22" width="144" height="76" rx="30" fill="url(#m)"/>` : ""}
  <rect x="14" y="27" width="132" height="66" rx="25" fill="none" stroke="${L.lip}" stroke-width="1.6" stroke-opacity=".8"/>
  <rect x="18" y="30" width="124" height="60" rx="22" fill="url(#f)" stroke="${L.seam}" stroke-width="1.5"/>
  ${pat ? `<rect x="18" y="30" width="124" height="60" rx="22" fill="url(#p)" opacity="${L.patternOpacity * 1.6}"/>` : ""}
  <rect x="18" y="30" width="124" height="60" rx="22" fill="url(#v)"/>
  ${inlay}
  ${studXs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="25" r="1.6" fill="${studs[i % studs.length]}"/><circle cx="${x.toFixed(1)}" cy="95" r="1.8" fill="${studs[(i + 1) % studs.length]}"/>`).join("")}
</svg>`;
}

/** The preview as a data: URL, for <img>. */
export function tablePreviewUrl(id: TableThemeId): string {
  return `data:image/svg+xml,${encodeURIComponent(tablePreviewSvg(id).replace(/\s+/g, " "))}`;
}
