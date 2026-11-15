import type { ReactNode } from "react";
import type { CharacterId } from "@/lib/characters";

/**
 * The desi cast as flat-vector busts: our own drawings, one 100 × 100 viewBox each, bold rounded ink
 * outlines on warm skin and the table's wine and gold. A shared head and shoulders, with each
 * character's hair, headwear, clothes and one prop drawn over it.
 */

export const INK = "#2b160e";
const GOLD = "#e8b04a";
const GOLD_DK = "#b8762a";
const CREAM = "#f4ecd8";
const HAIR = "#1e1210";
const GREY = "#d6d3dc";
const RED = "#c0392b";

export interface Look {
  skin: string;
  shirt: string;
  /** Behind the head and shoulders (long hair, a dupatta). */
  back?: ReactNode;
  /** Over the shirt (waistcoats, collars, straps). */
  outfit?: ReactNode;
  eyes?: ReactNode;
  brows?: ReactNode;
  mouth?: ReactNode;
  /** Over the face (glasses, beards, moustaches). */
  face?: ReactNode;
  /** Hair and headwear. */
  top?: ReactNode;
  prop?: ReactNode;
}

/** A thick ink line with a coloured core (straps, sticks, headphone bands). */
const Band = ({ d, color, w = 4 }: { d: string; color: string; w?: number }) => (
  <>
    <path d={d} fill="none" strokeWidth={w + 3} />
    <path d={d} fill="none" stroke={color} strokeWidth={w} />
  </>
);

/** Both ears, drawn behind the head. */
export const EAR = "M26 49a5 5 0 1 0 10 0a5 5 0 1 0-10 0zM64 49a5 5 0 1 0 10 0a5 5 0 1 0-10 0z";

export const EYES = (
  <>
    <g stroke="none" fill={INK}>
      <ellipse cx="43" cy="48" rx="2.3" ry="2.9" />
      <ellipse cx="57" cy="48" rx="2.3" ry="2.9" />
    </g>
    <g stroke="none" fill="#fff">
      <circle cx="43.8" cy="47" r="0.9" />
      <circle cx="57.8" cy="47" r="0.9" />
    </g>
  </>
);
const GRIN = <path d="M43 57q7 8 14 0z" fill="#fff" />;

export const LOOKS: Record<CharacterId, Look> = {
  chaudhry: {
    skin: "#c98d5e",
    shirt: CREAM,
    outfit: (
      <>
        <path d="M13 100c0-14 8-22 23-26l8 26zM87 100c0-14-8-22-23-26l-8 26z" fill="#7a2430" />
        <g fill={GOLD} strokeWidth="1.2">
          <circle cx="41" cy="86" r="1.8" />
          <circle cx="59" cy="86" r="1.8" />
        </g>
        <path d="M44 72l6 8 6-8" fill="none" />
      </>
    ),
    brows: <path d="M38 41l9 1.5M53 42.5l9-1.5" fill="none" strokeWidth="3.4" />,
    face: (
      <path
        d="M50 55c-4-3-11-3-17 1 4-1 8 1 10 3 3 1 6 0 7-2 1 2 4 3 7 2 2-2 6-4 10-3-6-4-13-4-17-1z"
        fill={INK}
      />
    ),
    mouth: <path d="M47 62q3 2 6 0" fill="none" />,
    top: (
      <>
        <path d="M58 18c3-9 11-14 17-12-2 7-6 13-13 17z" fill={GOLD} />
        <path d="M29 40c-3-16 8-27 21-27s24 11 21 27c-6-6-36-6-42 0z" fill={CREAM} />
        <path d="M33 29c10-6 24-6 34 0M31 35c12-5 26-5 38 0" fill="none" strokeWidth="1.6" />
      </>
    ),
    prop: (
      <>
        <Band d="M86 102L77 58" color="#8a5a2b" w={4} />
        <path d="M78 64l4-1" stroke={GOLD} strokeWidth="2.4" />
      </>
    ),
  },

  nani: {
    skin: "#dba57a",
    shirt: "#2f7a5c",
    back: <path d="M26 52c-4-26 10-38 24-38s28 12 24 38l10 48H16z" fill="#f08a9a" />,
    eyes: (
      <>
        {EYES}
        <path d="M36 54q2 2 4 1M64 54q-2 2-4 1" fill="none" strokeWidth="1.3" />
      </>
    ),
    face: (
      <>
        <g fill="#fff" fillOpacity="0.25" strokeWidth="2">
          <circle cx="43" cy="48" r="6" />
          <circle cx="57" cy="48" r="6" />
        </g>
        <path d="M49 48h2" fill="none" strokeWidth="2" />
        <circle cx="50" cy="39" r="1.4" fill={RED} stroke="none" />
      </>
    ),
    mouth: <path d="M44 58q6 5 12 0" fill="none" />,
    top: (
      <>
        <path d="M31 42c0-10 8-16 19-16s19 6 19 16c-5-6-12-8-19-8s-14 2-19 8z" fill={GREY} />
        <path d="M27 40c0-16 10-25 23-25s23 9 23 25c-4-10-12-14-23-14s-19 4-23 14z" fill="#f08a9a" />
        <path d="M30 35c4-8 11-12 20-12s16 4 20 12" fill="none" stroke={GOLD} strokeWidth="1.6" />
      </>
    ),
    prop: (
      <>
        <path d="M10 76l22 18M14 72l16 26" fill="none" stroke="#c9c9cf" strokeWidth="2" />
        <circle cx="22" cy="90" r="9" fill={GOLD} />
        <path d="M15 87q7-4 14 2M15 93q7-4 13 2M20 82q4 6 1 16" fill="none" strokeWidth="1.3" />
      </>
    ),
  },

  badshah: {
    skin: "#a8693f",
    shirt: "#2c4f8a",
    back: <path d="M30 44c0-14 8-22 20-22s20 8 20 22z" fill={HAIR} />,
    outfit: (
      <>
        <path d="M29 73q21 18 42 0l3 6q-24 21-48 0z" fill={GOLD} />
        <circle cx="50" cy="88" r="3" fill={RED} />
      </>
    ),
    face: (
      <>
        <path
          d="M31 50c0 14 8 22 19 22s19-8 19-22c-4 6-8 8-12 7-2-2-4-3-7-3s-5 1-7 3c-4 1-8-1-12-7z"
          fill={HAIR}
        />
        <path d="M50 57c-3-2-8-2-11 0-2 1-4 0-4-2M50 57c3-2 8-2 11 0 2 1 4 0 4-2" fill="none" strokeWidth="2.6" />
      </>
    ),
    mouth: <path d="M46 61q4 2 8 0" fill="none" stroke="#e8a27a" strokeWidth="1.8" />,
    top: (
      <>
        <path d="M32 31l-2-15 8 7 6-11 6 9 6-9 6 11 8-7-2 15z" fill={GOLD} />
        <path d="M32 31h36" fill="none" />
        <g fill={RED} strokeWidth="1.2">
          <circle cx="50" cy="26" r="2" />
          <circle cx="40" cy="27" r="1.6" />
          <circle cx="60" cy="27" r="1.6" />
        </g>
      </>
    ),
    prop: (
      <>
        <Band d="M14 102L22 66" color={GOLD} w={3.5} />
        <circle cx="22.5" cy="62" r="4.5" fill={GOLD} />
        <circle cx="21.5" cy="60.8" r="1.2" fill="#fff" stroke="none" />
      </>
    ),
  },

  ustad: {
    skin: "#c98d5e",
    shirt: "#7a5230",
    outfit: (
      <>
        <path d="M43 72l7 14 7-14z" fill={CREAM} />
        <path d="M43 72q7 4 14 0" fill="none" />
        <path d="M60 90h9v8h-9z" fill="#6a4426" />
        <path d="M62 90v-6" stroke="#3a6fd0" strokeWidth="2" />
        <path d="M66 90v-7" stroke={RED} strokeWidth="2" />
      </>
    ),
    brows: <path d="M37 40q5-3 10 0M53 40q5-3 10 0" fill="none" strokeWidth="2.6" />,
    face: (
      <>
        <g fill="#fff" fillOpacity="0.25" strokeWidth="2">
          <rect x="37" y="44" width="11" height="8" rx="2" />
          <rect x="52" y="44" width="11" height="8" rx="2" />
        </g>
        <path d="M48 47h4" fill="none" strokeWidth="2" />
        <path d="M42 57q8-5 16 0q-8 2-16 0z" fill={GREY} />
      </>
    ),
    mouth: <path d="M47 61q3 1.5 6 0" fill="none" />,
    top: (
      <>
        <path d="M31 47c-1-6 0-11 3-13 0 4 0 9 1 13zM69 47c1-6 0-11-3-13 0 4 0 9-1 13z" fill={GREY} />
        <path d="M41 31q5-4 11-3" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" />
      </>
    ),
    prop: (
      <g transform="rotate(-14 22 88)">
        <path d="M12 78h20v22H12z" fill="#b8392b" />
        <path d="M15 78v22" fill="none" strokeWidth="1.6" />
        <path d="M19 84h9" stroke={GOLD} strokeWidth="1.6" />
      </g>
    ),
  },

  cricketer: {
    skin: "#8a5432",
    shirt: "#f7f5ee",
    outfit: (
      <>
        <path d="M42 72l8 10 8-10" fill="none" stroke="#1f7a45" strokeWidth="3" />
        <path d="M18 88q6-8 14-10M82 88q-6-8-14-10" fill="none" stroke="#1f7a45" strokeWidth="2.4" />
      </>
    ),
    mouth: GRIN,
    face: <path d="M31 43v9M69 43v9" stroke={HAIR} strokeWidth="3" />,
    top: (
      <>
        <path d="M30 41c0-14 9-22 20-22s20 8 20 22z" fill="#1f7a45" />
        <path d="M27 42q23-8 46 0q2 4-2 5q-21-6-42 0q-4-1-2-5z" fill="#17603a" />
        <circle cx="50" cy="31" r="3" fill={GOLD} strokeWidth="1.4" />
        <circle cx="50" cy="19" r="1.8" fill="#17603a" strokeWidth="1.4" />
      </>
    ),
    prop: (
      <>
        <path d="M66 82l5 3 7-11-5-3z" fill="#3a6fd0" />
        <path d="M73 71l6 4 19-33-6-4z" fill="#e8c98a" />
        <path d="M80 66l10-18" fill="none" strokeWidth="1.3" />
        <circle cx="20" cy="88" r="6" fill={RED} />
        <path d="M16 84q4 4 0 8M24 84q-4 4 0 8" fill="none" stroke="#fff" strokeWidth="1" />
      </>
    ),
  },

  malika: {
    skin: "#f2c79a",
    shirt: "#c94f9b",
    back: <path d="M26 50c-2-22 10-32 24-32s26 10 24 32l4 34H22z" fill={HAIR} />,
    outfit: (
      <>
        <path d="M36 74q14 13 28 0" fill="none" stroke={GOLD} strokeWidth="3" />
        <circle cx="50" cy="85" r="2.6" fill={GOLD} strokeWidth="1.4" />
      </>
    ),
    eyes: (
      <>
        {EYES}
        <path d="M40 46l-2-2M60 46l2-2" fill="none" strokeWidth="1.6" />
      </>
    ),
    brows: <path d="M39 42q4-3 8-1M53 41q4-2 8 1" fill="none" strokeWidth="1.8" />,
    mouth: <path d="M46 59q4 3 8 0q-4-1-8 0z" fill={RED} strokeWidth="1.6" />,
    face: <circle cx="53.6" cy="54" r="2.2" fill="none" stroke={GOLD} strokeWidth="1.3" />,
    top: (
      <>
        <path d="M31 44c0-14 8-22 19-22s19 8 19 22c-4-8-10-12-19-12s-15 4-19 12z" fill={HAIR} />
        <path d="M50 23v13" stroke={GOLD} strokeWidth="1.3" />
        <circle cx="50" cy="37" r="2.2" fill={GOLD} strokeWidth="1.3" />
        <g fill={GOLD} strokeWidth="1.3">
          <circle cx="31" cy="57" r="2.6" />
          <circle cx="69" cy="57" r="2.6" />
        </g>
      </>
    ),
    prop: (
      <>
        <path d="M22 98q-2-8 0-12" fill="none" stroke="#2f7a5c" strokeWidth="2.4" />
        <path d="M22 92q-6-2-7 2 4 2 7-2z" fill="#2f7a5c" strokeWidth="1.3" />
        <circle cx="22" cy="83" r="5.5" fill={RED} />
        <path d="M22 81q2 2 0 4q-3-1-1-4" fill="none" strokeWidth="1.2" />
      </>
    ),
  },

  rockstar: {
    skin: "#dba57a",
    shirt: "#2a2a33",
    outfit: (
      <>
        <path d="M40 72l10 16 10-16z" fill={RED} />
        <path d="M40 72l-6 6 10 16zM60 72l6 6-10 16z" fill="#3d3d4a" />
      </>
    ),
    eyes: (
      <>
        <path d="M35 45h12q1 7-6 7t-6-7zM53 45h12q0 7-6 7t-6-7z" fill="#15151c" />
        <path d="M47 46h6" fill="none" />
        <path d="M38 47l3-1M56 47l3-1" stroke="#fff" strokeWidth="1.1" />
      </>
    ),
    brows: <path d="M37 41l9 1M54 42l9-2" fill="none" strokeWidth="2.6" />,
    mouth: (
      <>
        <path d="M45 59q6 2 10-2" fill="none" />
        <path d="M47 63q3 4 6 0z" fill={INK} />
      </>
    ),
    face: <circle cx="31" cy="53" r="1.5" fill="#c9c9cf" strokeWidth="1" />,
    top: (
      <>
        <path
          d="M30 44c-2-14 6-28 22-28 10 0 20 6 18 12-4-2-8-2-10 0 4 2 8 8 10 14-6-6-14-8-22-8-8 0-14 4-18 10z"
          fill={HAIR}
        />
        <path d="M44 22q8-2 14 1" fill="none" stroke="#5a4a6a" strokeWidth="2" />
      </>
    ),
    prop: (
      <>
        <ellipse cx="22" cy="92" rx="13" ry="10" fill="#e0475a" />
        <circle cx="23" cy="91" r="3" fill={INK} />
        <path d="M24 86l4 2-12-30-4 2z" fill="#6b3f1f" />
        <path d="M9 52l7-2 3 8-7 2z" fill={INK} />
      </>
    ),
  },

  baba: {
    skin: "#c98d5e",
    shirt: "#f7f5ee",
    eyes: <path d="M40 48q3-3 6 0M54 48q3-3 6 0" fill="none" />,
    brows: <path d="M37 42q5-5 10-1q-5 0-10 1zM53 41q5-4 10 1q-5-1-10-1z" fill="#fff" strokeWidth="1.8" />,
    face: (
      <>
        <path
          d="M30 49c-2 20 8 31 20 31s22-11 20-31c-4 8-10 10-14 8-2-2-4-3-6-3s-4 1-6 3c-4 2-10 0-14-8z"
          fill="#f7f5ee"
        />
        <path d="M41 58q9-6 18 0q-9 3-18 0z" fill="#fff" />
        <path d="M44 68q6 3 12 0M46 74q4 2 8 0" fill="none" strokeWidth="1.2" />
      </>
    ),
    mouth: <path d="M47 62q3 1.5 6 0" fill="none" strokeWidth="1.8" />,
    top: (
      <>
        <path d="M31 37c0-12 9-16 19-16s19 4 19 16z" fill="#fff" />
        <path d="M34 33h32M36 28h28" fill="none" stroke={GOLD_DK} strokeWidth="1.4" strokeDasharray="1 2.6" />
      </>
    ),
    prop: (
      <>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (Math.PI * (0.15 + i * 0.12));
          return <circle key={i} cx={78 + 10 * Math.cos(a)} cy={80 + 10 * Math.sin(a)} r="2.3" fill="#7a2430" strokeWidth="1.2" />;
        })}
        <path d="M72 89l-3 9h4z" fill={GOLD} strokeWidth="1.2" />
      </>
    ),
  },

  gamer: {
    skin: "#f2c79a",
    shirt: "#3b2f6b",
    outfit: (
      <>
        <path d="M28 76q22-12 44 0l-4 6q-18-8-36 0z" fill="#2e2456" />
        <path d="M44 79v10M56 79v10" stroke="#fff" strokeWidth="1.6" />
      </>
    ),
    eyes: (
      <>
        {EYES}
        <path d="M40 46h6M54 46h6" fill="none" strokeWidth="2" />
      </>
    ),
    mouth: <path d="M45 58q5 4 10 0z" fill="#fff" />,
    top: (
      <>
        <path
          d="M30 44c-2-16 8-26 20-26s22 10 20 26c-3-4-6-6-8-6l-2 5-4-7-4 6-4-7-4 6-4-5c-4 1-8 4-10 8z"
          fill="#6b3f1f"
        />
        <Band d="M27 47c0-24 46-24 46 0" color="#33b5c9" w={4} />
        <g fill="#33b5c9">
          <rect x="22" y="42" width="10" height="16" rx="4" />
          <rect x="68" y="42" width="10" height="16" rx="4" />
        </g>
        <path d="M28 57q4 8 13 8" fill="none" strokeWidth="2" />
        <circle cx="42" cy="65" r="1.8" fill={INK} />
      </>
    ),
    prop: (
      <>
        <path
          d="M33 90c0-5 4-7 8-7h18c4 0 8 2 8 7 0 6-3 10-6 8l-4-3H43l-4 3c-3 2-6-2-6-8z"
          fill="#22222b"
        />
        <path d="M40 88h5M42.5 85.5v5" stroke="#fff" strokeWidth="1.4" />
        <circle cx="57" cy="87" r="1.5" fill="#e0475a" stroke="none" />
        <circle cx="61" cy="90" r="1.5" fill="#2fa866" stroke="none" />
      </>
    ),
  },

  ghulam: {
    skin: "#a8693f",
    shirt: CREAM,
    outfit: <path d="M13 100c0-14 8-22 23-26l6 26zM87 100c0-14-8-22-23-26l-6 26z" fill="#2c6a5a" />,
    face: <path d="M44 56q6-2.5 12 0" fill="none" strokeWidth="2" />,
    mouth: <path d="M46 60q4 3 8 0" fill="none" />,
    top: (
      <>
        <g fill={INK}>
          <circle cx="32" cy="43" r="4" />
          <circle cx="68" cy="43" r="4" />
        </g>
        <path d="M64 26c6-10 16-14 22-12-4 4-10 10-20 14z" fill={GOLD} />
        <path d="M66 26l16-10" fill="none" strokeWidth="1.2" />
        <path d="M30 39c0-10 9-17 20-17s20 7 20 17c-6-3-34-3-40 0z" fill={RED} />
        <path d="M30 39q20-6 40 0v3q-20-6-40 0z" fill={GOLD} />
      </>
    ),
    prop: (
      <>
        <ellipse cx="76" cy="90" rx="15" ry="4" fill="#c9c9cf" />
        <path d="M70 88l1-10h9l1 10z" fill="#c9772f" />
        <path d="M71 81h9" stroke="#f3dcb4" strokeWidth="1.6" />
        <path d="M76 74q-2-3 0-5t0-5" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.3" />
      </>
    ),
  },

  joker: {
    skin: "#dba57a",
    shirt: "#8a63d2",
    outfit: (
      <path
        d={`M24 82${Array.from({ length: 9 }, (_, i) => `L${27 + i * 6} ${i % 2 ? 70 : 76}`).join("")}L78 82z`}
        fill="#f7f5ee"
      />
    ),
    mouth: GRIN,
    face: <path d="M59 53l2 3-2 3-2-3z" fill="#2fa866" strokeWidth="1.2" />,
    top: (
      <>
        <path d="M34 33C26 18 16 16 11 25c8-3 14 3 24 12z" fill={GOLD} />
        <path d="M66 33C74 18 84 16 89 25c-8-3-14 3-24 12z" fill="#2fa866" />
        <path d="M41 30C41 15 48 6 57 8c-4 4-2 12 2 22z" fill="#e0475a" />
        <path d="M30 39c0-8 9-12 20-12s20 4 20 12z" fill="#e0475a" />
        <path d="M30 39q20-8 40 0v4q-20-8-40 0z" fill={GOLD} />
        <g fill={GOLD} strokeWidth="1.4">
          <circle cx="11" cy="26" r="3" />
          <circle cx="89" cy="26" r="3" />
          <circle cx="57" cy="8" r="3" />
        </g>
      </>
    ),
    prop: (
      <g transform="rotate(-12 20 88)">
        <rect x="12" y="76" width="16" height="23" rx="2.5" fill="#fff" />
        <path d="M20 81l3 6-3 6-3-6z" fill="#e0475a" strokeWidth="1.2" />
      </g>
    ),
  },

  student: {
    skin: "#c98d5e",
    shirt: GOLD,
    outfit: (
      <>
        <Band d="M35 74l-5 28M65 74l5 28" color="#e0752a" w={4} />
        <path d="M44 74q6 4 12 0" fill="none" />
      </>
    ),
    eyes: (
      <>
        <g stroke="none" fill={INK}>
          <ellipse cx="43" cy="48" rx="2.7" ry="3.3" />
          <ellipse cx="57" cy="48" rx="2.7" ry="3.3" />
        </g>
        <g stroke="none" fill="#fff">
          <circle cx="44" cy="46.8" r="1.2" />
          <circle cx="58" cy="46.8" r="1.2" />
        </g>
      </>
    ),
    mouth: <path d="M44 58q6 5 12 0z" fill="#fff" />,
    top: (
      <>
        <path d="M33 41l3 4 3-4 3 4 3-4" fill="none" strokeWidth="1.8" />
        <path d="M31 41c0-14 8-22 19-22s19 8 19 22z" fill="#3a6fd0" />
        <path d="M58 37q14-3 24 4q-11 2-24 0z" fill="#2a55a8" />
        <path d="M50 19v22" fill="none" strokeWidth="1.2" />
        <path d="M68 46l11-9 2 2-11 9z" fill={GOLD} strokeWidth="1.4" />
      </>
    ),
  },
};
