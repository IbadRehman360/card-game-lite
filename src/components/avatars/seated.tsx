import type { CSSProperties } from "react";
import { CHARACTERS, type CharacterId, resolveCharacterId } from "@/lib/characters";
import { EAR, EYES, INK, LOOKS } from "./desi-avatars";
import "./avatars.css";

/**
 * A character seated at the table, half-body: the very head, headwear and clothes of their round bust
 * (desi-avatars LOOKS), on a fuller torso, with both forearms resting on the table's edge. Drawn in a
 * 160 × 132 box whose line y = 122 is the table edge, so callers line that up with the rail.
 *
 * Idle life is CSS only (avatars.css): a slow breath, the head riding on it, a blink every few seconds.
 */
export const SEATED = {
  w: 160,
  h: 132,
  /** Where the table's edge runs (the forearms rest on it). */
  table: 122,
  /** Drawing units per metre of the 3D room, so the stage can size the figure for its seat. */
  perMetre: 125,
} as const;

/** Where the bust's 100 × 100 drawing sits inside the seated box. */
const BUST = "translate(30 2)";
/** Sunglasses and closed eyes don't blink. */
const NO_BLINK: CharacterId[] = ["rockstar", "baba"];

const ARMS = [
  "M52 90C41 97 36 107 37 115C38 121 50 122 66 120",
  "M108 90C119 97 124 107 123 115C122 121 110 122 94 120",
];

/** A fan of card backs, held at the table edge. */
function Fan() {
  return (
    <g transform="translate(80 121)">
      {[-24, -8, 8, 24].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <rect x="-8" y="-25" width="16" height="22" rx="2.2" fill="#8e1f2c" strokeWidth="1.6" />
          <rect x="-5.6" y="-22.6" width="11.2" height="17.2" rx="1.2" fill="none" stroke="#e8b04a" strokeWidth="0.9" />
        </g>
      ))}
    </g>
  );
}

export function SeatedFigure({
  id,
  cards = false,
  table = false,
  className,
  style,
  title,
}: {
  id: CharacterId | string | null | undefined;
  /** Hold a fan of cards (off at the game tables, where the game draws each hand itself). */
  cards?: boolean;
  /** Draw a strip of table edge under the arms (on a page with no table of its own). */
  table?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible name; without it the picture is decorative. */
  title?: string;
}) {
  const cid = resolveCharacterId(id) ?? CHARACTERS[0].id;
  const k = LOOKS[cid];
  const hands = cards ? [72, 88] : [69, 91];
  return (
    <svg
      viewBox={`0 0 ${SEATED.w} ${SEATED.h}`}
      className={`seated ${className ?? ""}`}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-character={cid}
      data-blink={NO_BLINK.includes(cid) ? undefined : ""}
    >
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <g className="sit-body">
          <g transform={BUST}>
            <g className="sit-head">{k.back}</g>
          </g>
          <path d="M41 124V106C41 87 56 74 80 74S119 87 119 106V124Z" fill={k.shirt} />
          <g transform={BUST}>
            <path d="M43 58v16h14V58z" fill={k.skin} />
            <path d="M43 64c4 3 10 3 14 0v-6H43z" fill={INK} opacity="0.18" stroke="none" />
            {k.outfit}
            <g className="sit-head">
              <path d={EAR} fill={k.skin} />
              <ellipse cx="50" cy="46" rx="19" ry="21" fill={k.skin} />
              <g fill="#e05a4a" opacity="0.28" stroke="none">
                <circle cx="38" cy="55" r="3.2" />
                <circle cx="62" cy="55" r="3.2" />
              </g>
              <g className="sit-eyes">{k.eyes ?? EYES}</g>
              {k.brows ?? <path d="M39 42q4-2.5 8 0M53 42q4-2.5 8 0" fill="none" />}
              <path d="M50 49q-2 5 1 6" fill="none" strokeWidth="1.8" />
              {k.face}
              {k.mouth ?? <path d="M45 59q5 4 10 0" fill="none" />}
              {k.top}
            </g>
          </g>
        </g>

        {table && (
          <g>
            <path d="M-2 126h164v8H-2z" fill="#8a2116" stroke="none" />
            <path d="M-2 119h164v7H-2z" fill="#4a2810" />
            <path d="M-2 120.6h164" stroke="#8f5e2d" strokeWidth="1.6" />
            <g fill="#d07a2a" stroke="none">
              {[10, 30, 50, 70, 90, 110, 130, 150].map((x) => (
                <circle key={x} cx={x} cy="123" r="1.2" />
              ))}
            </g>
          </g>
        )}

        {/* the forearms rest on the edge: they stay put while the body breathes */}
        <g className="sit-arms">
          {ARMS.map((d) => (
            <g key={d}>
              <path d={d} fill="none" strokeWidth="16" />
              <path d={d} fill="none" stroke={k.shirt} strokeWidth="11.2" />
            </g>
          ))}
          {cards && <Fan />}
          {hands.map((x, i) => (
            <g key={x}>
              <ellipse cx={x} cy="119.5" rx="7" ry="5.6" fill={k.skin} />
              <path
                d={i === 0 ? `M${x + 2} 116.5v4M${x + 4.6} 117v3.4` : `M${x - 2} 116.5v4M${x - 4.6} 117v3.4`}
                fill="none"
                strokeWidth="1.2"
              />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}
