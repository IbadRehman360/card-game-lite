"use client";

import { useState } from "react";
import type { CharacterId } from "@/lib/characters";

/** Head-and-shoulders pictures of each character, taken at the table. */
const PICTURE: Record<CharacterId, string> = {
  mungo: "/profile/mungo.png",
  corvina: "/profile/corvina.png",
  sal: "/profile/sal.png",
  wart: "/profile/wart.png",
};

/** A character's round profile picture on their colour; their first letter if the picture can't load. */
export function Portrait({
  id,
  accent,
  className,
  letter,
}: {
  id: CharacterId;
  accent: string;
  className?: string;
  letter?: string;
}) {
  const [failed, setFailed] = useState<CharacterId | null>(null);
  return (
    <span className={`portrait ${className ?? ""}`} style={{ background: accent }} aria-hidden>
      {failed === id ? (
        <b className="portrait-letter">{letter ?? id.slice(0, 1).toUpperCase()}</b>
      ) : (
        // small fixed pictures in a round frame; next/image adds nothing here
        // eslint-disable-next-line @next/next/no-img-element
        <img src={PICTURE[id]} alt="" draggable={false} decoding="async" onError={() => setFailed(id)} />
      )}
    </span>
  );
}
