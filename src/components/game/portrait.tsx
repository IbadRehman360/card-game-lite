"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/avatars/avatar";
import type { CharacterId } from "@/lib/characters";

/**
 * A character's round profile picture: their desi avatar (an SVG bust) on their colour.
 * `letter` is kept for callers that pass it; the drawing never fails to load, so it isn't shown.
 */
export function Portrait({
  id,
  accent,
  className,
}: {
  id: CharacterId | string;
  accent: string;
  className?: string;
  letter?: string;
}) {
  return (
    <span className={`portrait ${className ?? ""}`} style={{ background: accent }} aria-hidden>
      <Avatar id={id} />
    </span>
  );
}

/**
 * The seat tag's one number on the avatar: a small gold badge on the picture's edge
 * (cards in hand, in every game). Put it inside `.seat-pfp-wrap`; it sits on the side facing the table.
 */
export function SeatCount({ n, label = "cards in hand" }: { n: number; label?: string }) {
  return (
    <b className="seat-count" key={n} title={`${n} ${label}`} aria-label={`${n} ${label}`}>
      {n}
    </b>
  );
}

/** The tag's one extra stat, under the name: a tiny icon and a number (or a word, when it must be one). */
export function SeatStat({ icon, children, tone, title }: { icon?: ReactNode; children: ReactNode; tone?: string; title?: string }) {
  return (
    <span className="seat-stat" data-tone={tone} title={title}>
      {icon}
      {children}
    </span>
  );
}
