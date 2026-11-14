"use client";

import { useEffect, useRef } from "react";
import { type Card, SUIT_SYMBOL, rankLabel, suitOf } from "@/lib/game/cards";
import { paintCard } from "@/components/stage/card-texture";

/**
 * A card face in your hand: the very same drawing as the cards on the table (real pip layouts, the court
 * portraits on J, Q and K, one big pip on an Ace), painted onto a canvas.
 */
export function CardFace({ card }: { card: Card }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return paintCard(ref.current, rankLabel(card), SUIT_SYMBOL[suitOf(card)] as "♠" | "♥" | "♦" | "♣");
  }, [card]);
  return (
    <span className="card-face" data-art>
      <canvas ref={ref} aria-hidden />
    </span>
  );
}

const SUIT_WORD = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
} as const;
const RANK_WORD: Record<string, string> = {
  A: "Ace",
  K: "King",
  Q: "Queen",
  J: "Jack",
  T: "10",
};

export function cardName(card: Card) {
  return `${RANK_WORD[card[0]] ?? card[0]} of ${SUIT_WORD[suitOf(card)]}`;
}
