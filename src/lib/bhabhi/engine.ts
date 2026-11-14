import { type Card, type Suit, fullDeck, rankOf, shuffle, suitOf } from "@/lib/game/cards";

/**
 * Bhabhi Thulla (also called Bhabhi, Bhabho, Laad or Get Away): a shedding game with tricks.
 * The last player still holding cards is the Bhabhi, and loses.
 *
 * Rules as played here. Sources:
 * - Pagat, "Get Away": https://www.pagat.com/inflation/getaway.html
 * - Official Game Rules, "Getaway (Bhabhi)": https://officialgamerules.org/game-rules/getaway-bhabhi/
 * - Cardzmania, "Bhabhi": https://cardzmania.com/Bhabhi
 *
 * - Every card is dealt out, one at a time, so some players may hold one more card than others.
 * - The player holding the A♠ leads it to the first trick.
 * - Everyone must follow the suit that was led if they can.
 * - First trick (Pagat): everyone plays a card, even someone with no spades, and the first trick is
 *   always thrown away. The highest spade (the A♠) leads next.
 * - Later tricks: when everyone follows suit, the trick is thrown away and the highest card of the suit
 *   led takes the lead ("has the power").
 * - Thulla: a player who can't follow plays any card. That ends the trick at once, and the remaining
 *   players don't play. Whoever played the highest card of the suit led picks up the whole trick and
 *   leads next.
 * - Getting away: a player whose hand is empty when a trick ends has escaped and takes the next place.
 *   It doesn't matter if they emptied their hand earlier in that trick: when several players escape
 *   on one trick, they place in the order they played. The player who picks up a thulla'd trick has
 *   cards again, so they can't escape on it.
 * - When the winner of a thrown-away trick has just played their last card, they still escape, and
 *   the lead passes to the next player who still holds cards. (Pagat mentions an exception when only
 *   two players are left. We play the simpler rule most apps use.)
 * - If a thrown-away trick would empty every hand left, whoever played the highest card has the power
 *   but no card to lead with, so they are the Bhabhi.
 * - The game ends when one player is left holding cards. That player is the Bhabhi.
 */

export type Seat = number;

export const BHABHI_TURN_SECONDS = 30;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
const OPENER: Card = "AS";
const LOG_MAX = 60;

export class BhabhiError extends Error {}

export interface TrickPlay {
  seat: Seat;
  card: Card;
  /** Played off-suit. Ends the trick, except on the first trick. */
  off: boolean;
}

export interface Trick {
  leader: Seat;
  suit: Suit | null;
  plays: TrickPlay[];
  /** The opening trick: off-suit cards don't end it, and it's always thrown away. */
  first: boolean;
}

/** How the last trick ended (kept so the screen can play the sweep or the pickup). */
export interface LastTrick {
  id: number;
  plays: TrickPlay[];
  /** "cleared": thrown away. "pickup": picked up by `to`. */
  outcome: "cleared" | "pickup";
  /** Who picked it up, or who took the lead after a thrown-away trick. */
  to: Seat;
  /** Who played the off-suit card that ended it (pickup only). */
  thulla: Seat | null;
}

export type BhabhiEvent =
  | { id: number; type: "deal"; counts: number[] }
  | { id: number; type: "play"; seat: Seat; card: Card; lead: boolean; off: boolean; auto?: boolean }
  | { id: number; type: "thulla"; seat: Seat; card: Card; on: Seat }
  | { id: number; type: "cleared"; cards: Card[]; leader: Seat }
  | { id: number; type: "pickup"; to: Seat; cards: Card[] }
  | { id: number; type: "escape"; seat: Seat; place: number }
  | { id: number; type: "end"; bhabhi: Seat };

export interface BhabhiState {
  players: number;
  hands: Card[][];
  trick: Trick;
  /** Whose turn it is. Null when the game is over. */
  turn: Seat | null;
  /** Each seat's place once they escape (1 = first out). The Bhabhi gets the last place. */
  place: (number | null)[];
  /** Seats in the order they escaped. */
  order: Seat[];
  /** Cards thrown away so far. */
  discarded: number;
  trickNo: number;
  /** Public knowledge: a seat that went off-suit has no cards of that suit (until it picks some up). */
  voids: boolean[][];
  lastTrick: LastTrick | null;
  events: BhabhiEvent[];
  seq: number;
  bhabhi: Seat | null;
}

export type BhabhiAction = { type: "play"; card: Card; auto?: boolean };

const SUIT_INDEX: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

export const active = (s: BhabhiState, seat: Seat) => s.place[seat] === null && s.bhabhi !== seat;
export const isOver = (s: BhabhiState) => s.bhabhi !== null;

type NoId<E> = E extends unknown ? Omit<E, "id"> : never;

function push(s: BhabhiState, e: NoId<BhabhiEvent>) {
  s.seq += 1;
  s.events.push({ ...e, id: s.seq } as BhabhiEvent);
  if (s.events.length > LOG_MAX) s.events.splice(0, s.events.length - LOG_MAX);
}

/** Sorts a hand by suit (spades, hearts, clubs, diamonds, so the colours alternate), low to high. */
export function sortCards(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => SUIT_INDEX[suitOf(a)] - SUIT_INDEX[suitOf(b)] || rankOf(a) - rankOf(b));
}

/** Deals a new game. All 52 cards go out; the A♠ holder leads. */
export function newBhabhi(opts: { players?: number; random?: () => number } = {}): BhabhiState {
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(opts.players ?? 4)));
  const deck = shuffle(fullDeck(), opts.random);
  const hands: Card[][] = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const opener = hands.findIndex((h) => h.includes(OPENER));
  const s: BhabhiState = {
    players: n,
    hands: hands.map(sortCards),
    trick: { leader: opener, suit: null, plays: [], first: true },
    turn: opener,
    place: Array(n).fill(null),
    order: [],
    discarded: 0,
    trickNo: 1,
    voids: Array.from({ length: n }, () => [false, false, false, false]),
    lastTrick: null,
    events: [],
    seq: 0,
    bhabhi: null,
  };
  push(s, { type: "deal", counts: s.hands.map((h) => h.length) });
  return s;
}

/** The cards this seat may play now (none when it isn't their turn). */
export function legalPlays(s: BhabhiState, seat: Seat): Card[] {
  if (s.turn !== seat || isOver(s)) return [];
  const hand = s.hands[seat];
  if (!s.trick.plays.length) return s.trick.first ? hand.filter((c) => c === OPENER) : hand.slice();
  const follow = hand.filter((c) => suitOf(c) === s.trick.suit);
  return follow.length ? follow : hand.slice();
}

/** The seat holding the highest card of the suit led in this trick so far. */
export function highest(trick: Pick<Trick, "plays" | "suit">): Seat {
  let best: TrickPlay | null = null;
  for (const p of trick.plays) {
    if (suitOf(p.card) !== trick.suit) continue;
    if (!best || rankOf(p.card) > rankOf(best.card)) best = p;
  }
  return best!.seat;
}

/** The next seat after `from` (clockwise) that still holds cards in the game. */
function nextActive(s: BhabhiState, from: Seat): Seat | null {
  for (let i = 1; i <= s.players; i++) {
    const x = (from + i) % s.players;
    if (active(s, x) && s.hands[x].length > 0) return x;
  }
  return null;
}

/** Seats taking part in this trick: everyone who hasn't escaped (including anyone who just played their last card). */
function inTrick(s: BhabhiState): Seat[] {
  return Array.from({ length: s.players }, (_, i) => i).filter((x) => active(s, x));
}

/** Plays a card. Returns a new state; the old one isn't changed. */
export function act(prev: BhabhiState, seat: Seat, action: BhabhiAction): BhabhiState {
  if (isOver(prev)) throw new BhabhiError("The game is over");
  if (prev.turn !== seat) throw new BhabhiError("It isn't your turn");
  if (action?.type !== "play") throw new BhabhiError("Unknown move");
  const card = action.card;
  if (!prev.hands[seat].includes(card)) throw new BhabhiError("You don't have that card");
  if (!legalPlays(prev, seat).includes(card)) {
    throw new BhabhiError(
      prev.trick.first && !prev.trick.plays.length ? "Lead the Ace of Spades" : "You must follow suit",
    );
  }

  const s = structuredClone(prev);
  const t = s.trick;
  const lead = t.plays.length === 0;
  if (lead) t.suit = suitOf(card);
  const off = !lead && suitOf(card) !== t.suit;
  s.hands[seat] = s.hands[seat].filter((c) => c !== card);
  t.plays.push({ seat, card, off });
  if (off) s.voids[seat][SUIT_INDEX[t.suit!]] = true;
  push(s, { type: "play", seat, card, lead, off, ...(action.auto ? { auto: true } : {}) });

  // thulla: the trick ends now (except on the first trick)
  if (off && !t.first) {
    resolve(s, "pickup", seat);
    return s;
  }
  // everyone in the trick has played: it's thrown away
  const players = inTrick(s);
  if (t.plays.length >= players.length) {
    resolve(s, "cleared", null);
    return s;
  }
  // next to play: the next seat in the trick that hasn't played yet
  const played = new Set(t.plays.map((p) => p.seat));
  for (let i = 1; i <= s.players; i++) {
    const x = (seat + i) % s.players;
    if (active(s, x) && !played.has(x)) {
      s.turn = x;
      break;
    }
  }
  return s;
}

function resolve(s: BhabhiState, outcome: "cleared" | "pickup", thulla: Seat | null) {
  const t = s.trick;
  const top = highest(t);
  const cards = t.plays.map((p) => p.card);
  if (outcome === "pickup") {
    push(s, { type: "thulla", seat: thulla!, card: t.plays[t.plays.length - 1].card, on: top });
    s.hands[top] = sortCards([...s.hands[top], ...cards]);
    // they can follow those suits again
    s.voids[top] = s.voids[top].map((v, i) => v && !cards.some((c) => SUIT_INDEX[suitOf(c)] === i));
    push(s, { type: "pickup", to: top, cards });
  } else {
    s.discarded += cards.length;
    push(s, { type: "cleared", cards, leader: top });
  }
  s.lastTrick = { id: s.seq, plays: t.plays.slice(), outcome, to: top, thulla };

  // escapes, in the order the trick was played
  const empty = t.plays.map((p) => p.seat).filter((x) => active(s, x) && s.hands[x].length === 0);
  const holding = inTrick(s).filter((x) => s.hands[x].length > 0);
  for (const x of empty) {
    // every hand would be empty: the one with the power can't lead, and is the Bhabhi
    if (holding.length === 0 && x === top && outcome === "cleared") continue;
    s.place[x] = s.order.length + 1;
    s.order.push(x);
    push(s, { type: "escape", seat: x, place: s.place[x]! });
  }

  const left = inTrick(s);
  if (left.length <= 1) {
    const loser = left.length === 1 ? left[0] : top;
    s.bhabhi = loser;
    s.place[loser] = s.players;
    s.turn = null;
    s.trick = { leader: loser, suit: null, plays: [], first: false };
    push(s, { type: "end", bhabhi: loser });
    return;
  }

  // the lead goes to the player with the power, or the next one with cards if they just escaped
  const leader = active(s, top) && s.hands[top].length > 0 ? top : nextActive(s, top)!;
  s.trick = { leader, suit: null, plays: [], first: false };
  s.turn = leader;
  s.trickNo += 1;
}

/** Every card in the game (hands, the trick on the table, thrown away). For tests. */
export function cardCount(s: BhabhiState): number {
  return s.hands.reduce((n, h) => n + h.length, 0) + s.trick.plays.length + s.discarded;
}
