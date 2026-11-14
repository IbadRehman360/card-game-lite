import { type Card, rankOf, suitOf } from "@/lib/game/cards";

/**
 * 3 Patti hand ranks, best first:
 *   Trail (three of a kind) > Pure sequence (straight flush) > Sequence (straight) > Color (flush) > Pair > High card.
 * Sequences: A-K-Q is the top one, A-2-3 the next, then K-Q-J down to 2-3-4. K-A-2 is not a sequence.
 * Suits never break a tie: two equal hands are equal.
 */
export type HandKind = "trail" | "pure" | "sequence" | "color" | "pair" | "high";

const KIND_ORDER: Record<HandKind, number> = { trail: 5, pure: 4, sequence: 3, color: 2, pair: 1, high: 0 };

export const KIND_NAME: Record<HandKind, string> = {
  trail: "Trail",
  pure: "Pure sequence",
  sequence: "Sequence",
  color: "Color",
  pair: "Pair",
  high: "High card",
};

export interface HandValue {
  kind: HandKind;
  /** Compared left to right after the kind; higher wins. */
  key: number[];
  /** e.g. "Pair of Kings", "Sequence A-2-3". */
  label: string;
}

const RANK_NAME: Record<number, string> = {
  14: "Aces",
  13: "Kings",
  12: "Queens",
  11: "Jacks",
  10: "Tens",
  9: "Nines",
  8: "Eights",
  7: "Sevens",
  6: "Sixes",
  5: "Fives",
  4: "Fours",
  3: "Threes",
  2: "Twos",
};
const short = (r: number) => (r === 14 ? "A" : r === 13 ? "K" : r === 12 ? "Q" : r === 11 ? "J" : String(r));

/** Value of a sequence for comparing: A-K-Q 15, A-2-3 14, then the top card (K-Q-J 13 ... 4-3-2 4); null if not one. */
function sequenceValue(desc: number[]): number | null {
  const [a, b, c] = desc;
  if (a === 14 && b === 13 && c === 12) return 15;
  if (a === 14 && b === 3 && c === 2) return 14;
  if (a - b === 1 && b - c === 1) return a;
  return null;
}

export function evaluate(cards: Card[]): HandValue {
  if (cards.length !== 3) throw new Error("A 3 Patti hand has three cards");
  const desc = cards.map(rankOf).sort((x, y) => y - x);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const seq = sequenceValue(desc);
  const seqLabel = seq === 14 ? "A-2-3" : desc.map(short).join("-");

  if (desc[0] === desc[2]) return { kind: "trail", key: [desc[0]], label: `Trail of ${RANK_NAME[desc[0]]}` };
  if (seq !== null && flush) return { kind: "pure", key: [seq], label: `Pure sequence ${seqLabel}` };
  if (seq !== null) return { kind: "sequence", key: [seq], label: `Sequence ${seqLabel}` };
  if (flush) return { kind: "color", key: desc, label: `Color, ${short(desc[0])} high` };
  if (desc[0] === desc[1] || desc[1] === desc[2]) {
    const pair = desc[1];
    const kicker = desc[0] === desc[1] ? desc[2] : desc[0];
    return { kind: "pair", key: [pair, kicker], label: `Pair of ${RANK_NAME[pair]}` };
  }
  return { kind: "high", key: desc, label: `${short(desc[0])} high` };
}

/** Positive if a beats b, negative if b beats a, 0 for equal hands. */
export function compareValues(a: HandValue, b: HandValue): number {
  const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (k) return k;
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
    const d = (a.key[i] ?? 0) - (b.key[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export const compareHands = (a: Card[], b: Card[]) => compareValues(evaluate(a), evaluate(b));

/**
 * Rough strength 0..1 of a hand: about the share of random 3-card hands it beats. Used by the computer players.
 */
export function strength(cards: Card[]): number {
  const v = evaluate(cards);
  // share of all hands below each kind (out of 22100): high 74.4%, pair 16.9%, color 5%, seq 3.3%, pure 0.2%, trail 0.2%
  const base: Record<HandKind, [number, number]> = {
    high: [0, 0.744],
    pair: [0.744, 0.913],
    color: [0.913, 0.963],
    sequence: [0.963, 0.996],
    pure: [0.996, 0.9978],
    trail: [0.9978, 1],
  };
  const [lo, hi] = base[v.kind];
  let within: number;
  if (v.kind === "trail") within = (v.key[0] - 2) / 12;
  else if (v.kind === "pure" || v.kind === "sequence") within = (v.key[0] - 4) / 11;
  else if (v.kind === "pair") within = (v.key[0] - 2 + (v.key[1] - 2) / 13) / 13;
  // high card / color: driven mostly by the top card (5 high is the lowest possible top card)
  else within = Math.max(0, (v.key[0] - 5 + (v.key[1] - 2) / 13) / 10);
  return lo + (hi - lo) * Math.min(1, Math.max(0, within));
}
