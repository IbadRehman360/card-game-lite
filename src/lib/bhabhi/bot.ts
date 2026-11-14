import { type Card, type Suit, rankOf, suitOf } from "@/lib/game/cards";
import { type BhabhiAction, type BhabhiState, type Seat, active, highest, legalPlays } from "./engine";

/**
 * Computer players. The idea: don't be the high card when someone is about to thulla, dump high cards
 * when it's safe (last to play, or as a thulla), and lead suits nobody is known to be out of.
 */

export type Temper = "careful" | "steady" | "wild";
export const TEMPERS: Temper[] = ["careful", "steady", "wild", "steady", "careful", "wild"];

const SUITS: Suit[] = ["S", "H", "C", "D"];
const SI: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
const NOISE: Record<Temper, number> = { careful: 0.04, steady: 0.12, wild: 0.28 };

const lowest = (cards: Card[]) => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
const highestCard = (cards: Card[]) => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));

/** Seats still to play in this trick after `seat`. */
function stillToPlay(s: BhabhiState, seat: Seat): Seat[] {
  const played = new Set(s.trick.plays.map((p) => p.seat));
  const out: Seat[] = [];
  for (let i = 1; i < s.players; i++) {
    const x = (seat + i) % s.players;
    if (active(s, x) && !played.has(x) && x !== seat) out.push(x);
  }
  return out;
}

export function chooseAction(s: BhabhiState, seat: Seat, temper: Temper = "steady", random: () => number = Math.random): BhabhiAction {
  const legal = legalPlays(s, seat);
  if (legal.length === 1) return { type: "play", card: legal[0] };
  // now and then, just play something
  if (random() < NOISE[temper]) return { type: "play", card: legal[Math.floor(random() * legal.length)] };

  const t = s.trick;
  // leading
  if (!t.plays.length) {
    const hand = s.hands[seat];
    const others = Array.from({ length: s.players }, (_, i) => i).filter((x) => x !== seat && active(s, x));
    let best: { suit: Suit; score: number } | null = null;
    for (const suit of SUITS) {
      const mine = hand.filter((c) => suitOf(c) === suit);
      if (!mine.length) continue;
      const voids = others.filter((x) => s.voids[x][SI[suit]]).length;
      // safer suits: nobody known to be out; longer suits: more to get rid of
      const score = -voids * 10 + mine.length + random() * 1.5;
      if (!best || score > best.score) best = { suit, score };
    }
    const mine = hand.filter((c) => suitOf(c) === best!.suit);
    const risky = others.some((x) => s.voids[x][SI[best!.suit]]);
    // a safe suit: lead high and keep the power. A risky one: lead low, hoping someone else is higher.
    return { type: "play", card: risky ? lowest(mine) : highestCard(mine) };
  }

  const follow = legal.filter((c) => suitOf(c) === t.suit);
  // can't follow: thulla with your highest card (gets rid of the most dangerous one)
  if (!follow.length) {
    if (t.first) return { type: "play", card: highestCard(legal) };
    return { type: "play", card: highestCard(legal) };
  }

  const later = stillToPlay(s, seat);
  const topCard = t.plays.find((p) => p.seat === highest(t))!.card;
  const under = follow.filter((c) => rankOf(c) < rankOf(topCard));
  // last to play (or the first trick, which is always thrown away): safe, dump your highest
  if (!later.length || t.first) return { type: "play", card: highestCard(follow) };
  const danger = later.some((x) => s.voids[x][SI[t.suit!]]);
  if (danger || temper === "careful") {
    // stay under the top card if you can, with the highest card that still does
    return { type: "play", card: under.length ? highestCard(under) : lowest(follow) };
  }
  // nobody known to be out of this suit: middle of the road
  return { type: "play", card: under.length ? highestCard(under) : highestCard(follow) };
}

/** How long a computer player thinks before playing (ms). */
export function thinkMs(s: BhabhiState, random: () => number = Math.random): number {
  const base = s.trick.plays.length ? 650 : 900;
  return base + Math.floor(random() * 650);
}
