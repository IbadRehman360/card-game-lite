import { type CSSProperties, useId } from "react";
import { CHARACTERS, type CharacterId, resolveCharacterId } from "@/lib/characters";
import { EAR, EYES, INK, LOOKS } from "./desi-avatars";
import "./avatars.css";

/**
 * A character's round bust portrait, drawn as SVG so it is crisp at any size. Takes any id (old figure
 * ids and unknown strings fall back to a character), on the character's accent.
 */
export function Avatar({
  id,
  size,
  className,
  title,
  style,
}: {
  id: CharacterId | string | null | undefined;
  /** CSS size (px number or any length); leave out to size it with CSS. */
  size?: number | string;
  className?: string;
  /** Accessible name; without it the picture is decorative. */
  title?: string;
  style?: CSSProperties;
}) {
  const cid = resolveCharacterId(id) ?? CHARACTERS[0].id;
  const c = CHARACTERS.find((x) => x.id === cid)!;
  const k = LOOKS[cid];
  const clip = `av${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      className={`avatar ${className ?? ""}`}
      width={size}
      height={size}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-character={cid}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={c.accent} />
        <circle cx="50" cy="40" r="44" fill="#fff" opacity="0.16" />
        <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
          {k.back}
          <path d="M12 102c0-18 14-30 38-30s38 12 38 30z" fill={k.shirt} />
          <path d="M43 58v16h14V58z" fill={k.skin} />
          <path d="M43 64c4 3 10 3 14 0v-6H43z" fill={INK} opacity="0.18" stroke="none" />
          {k.outfit}
          <path d={EAR} fill={k.skin} />
          <ellipse cx="50" cy="46" rx="19" ry="21" fill={k.skin} />
          <g fill="#e05a4a" opacity="0.28" stroke="none">
            <circle cx="38" cy="55" r="3.2" />
            <circle cx="62" cy="55" r="3.2" />
          </g>
          {k.eyes ?? EYES}
          {k.brows ?? <path d="M39 42q4-2.5 8 0M53 42q4-2.5 8 0" fill="none" />}
          <path d="M50 49q-2 5 1 6" fill="none" strokeWidth="1.8" />
          {k.face}
          {k.mouth ?? <path d="M45 59q5 4 10 0" fill="none" />}
          {k.top}
          {k.prop}
        </g>
      </g>
      <circle cx="50" cy="50" r="48.5" fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="3" />
    </svg>
  );
}
