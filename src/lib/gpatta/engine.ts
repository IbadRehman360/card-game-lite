/**
 * G Patta: one card is taken out of the deck and shown, the rest is dealt to everyone, pairs are
 * thrown away, then each player in turn takes a face-down card from the next player. Whoever is
 * left holding the card that can't be paired is G.
 *
 * Pure and JSON-serialisable. Randomness is passed in (defaults to Math.random).
 */

export type Suit = "s" | "h" | "d" | "c";
export const SUITS: Suit[] = ["s", "h", "d", "c"];

export interface Card {
  /** 2..14 (11 J, 12 Q, 13 K, 14 A) */
  r: number;
  s: Suit;
}

export type Phase = "reveal" | "pairs" | "draw" | "over";

export interface GPlayer {
  hand: Card[];
  /** Threw (or chose to throw) their opening pairs. */
  ready: boolean;
  /** 1 = out first. Null while still holding cards. */
  place: number | null;
}

export type GPattaEvent =
  | { t: "reveal-out"; card: Card }
  | { t: "deal"; first: number; counts: number[] }
  | { t: "pairs"; seat: number; cards: Card[] }
  | { t: "draw"; from: number; to: number; index: number; card: Card | null }
  | { t: "safe"; seat: number; place: number }
  | { t: "end"; g: number };

export interface GPattaState {
  n: number;
  phase: Phase;
  players: GPlayer[];
  /** The card taken out at the start (shown to everyone): its rank can't be fully paired. */
  out: Card;
  /** Cards not dealt yet (only during "reveal"). */
  deck: Card[];
  /** Thrown pairs, in order. */
  discard: Card[];
  /** Who deals first (and draws first). */
  first: number;
  /** Whose turn it is to draw (during "draw"). */
  turn: number;
  /** Next placement to hand out. */
  nextPlace: number;
  g: number | null;
  /** Events of the last step, for animation. */
  events: GPattaEvent[];
  /** Counts steps; changes on every act. */
  seq: number;
}

export type GPattaAction =
  | { type: "deal" }
  | { type: "throw" }
  | { type: "pair"; a: number; b: number }
  | { type: "draw"; index: number }
  | { type: "timeout" };

export class GPattaError extends Error {}

export const GPATTA_TURN_SECONDS = 20;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d;
}

function shuffle<T>(a: T[], random: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

const clone = (s: GPattaState): GPattaState => ({
  ...s,
  players: s.players.map((p) => ({ ...p, hand: p.hand.slice() })),
  deck: s.deck.slice(),
  discard: s.discard.slice(),
  events: [],
  seq: s.seq + 1,
});

export const active = (s: GPattaState, seat: number) => s.players[seat].place === null;
export const activeSeats = (s: GPattaState) => s.players.map((_, i) => i).filter((i) => active(s, i));

/** The next player still holding cards after `seat` (not `seat` itself), or null. */
export function nextActive(s: GPattaState, seat: number): number | null {
  for (let k = 1; k < s.n; k++) {
    const i = (seat + k) % s.n;
    if (active(s, i)) return i;
  }
  return null;
}

/** Who `seat` draws from: the next player still holding cards. */
export const drawTarget = (s: GPattaState, seat: number) => nextActive(s, seat);

/** Splits a hand into pairs (same rank) to throw and the cards that stay. */
export function findPairs(hand: Card[]): { pairs: Card[]; rest: Card[] } {
  const byRank = new Map<number, Card[]>();
  for (const c of hand) byRank.set(c.r, [...(byRank.get(c.r) ?? []), c]);
  const pairs: Card[] = [];
  const rest: Card[] = [];
  for (const c of hand) {
    const group = byRank.get(c.r)!;
    const even = group.length - (group.length % 2);
    const idx = group.indexOf(c);
    if (idx < even) pairs.push(c);
    else rest.push(c);
  }
  // keep pairs adjacent
  pairs.sort((x, y) => x.r - y.r);
  return { pairs, rest };
}

export const hasPair = (hand: Card[]) => findPairs(hand).pairs.length > 0;

export function newGPatta(opts: { players?: number; first?: number; random?: () => number } = {}): GPattaState {
  const random = opts.random ?? Math.random;
  const n = Math.floor(opts.players ?? 4);
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new GPattaError(`G Patta needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  const deck = shuffle(fullDeck(), random);
  const out = deck.shift()!;
  const first = opts.first ?? Math.floor(random() * n);
  return {
    n,
    phase: "reveal",
    players: Array.from({ length: n }, () => ({ hand: [], ready: false, place: null })),
    out,
    deck,
    discard: [],
    first: ((first % n) + n) % n,
    turn: first,
    nextPlace: 1,
    g: null,
    events: [{ t: "reveal-out", card: out }],
    seq: 0,
  };
}

/** Marks empty-handed players safe, and ends the game when one player is left. */
function settle(s: GPattaState, order: number[]) {
  for (const i of order) {
    const p = s.players[i];
    if (p.place === null && p.hand.length === 0) {
      p.place = s.nextPlace++;
      s.events.push({ t: "safe", seat: i, place: p.place });
    }
  }
  const left = activeSeats(s);
  if (left.length <= 1 && s.phase !== "over") {
    s.phase = "over";
    const g = left[0] ?? -1;
    if (g >= 0) {
      s.players[g].place = s.nextPlace++;
      s.g = g;
    }
    s.events.push({ t: "end", g });
  }
}

function throwPairs(s: GPattaState, seat: number, random: () => number) {
  const p = s.players[seat];
  const { pairs, rest } = findPairs(p.hand);
  // the rest is shuffled so nobody can follow where a card sits
  p.hand = shuffle(rest, random);
  if (pairs.length) {
    s.discard.push(...pairs);
    s.events.push({ t: "pairs", seat, cards: pairs });
  }
}

function startDrawing(s: GPattaState) {
  s.phase = "draw";
  const order = Array.from({ length: s.n }, (_, k) => (s.first + k) % s.n);
  settle(s, order);
  if (s.phase === "draw") s.turn = active(s, s.first) ? s.first : nextActive(s, s.first)!;
}

/**
 * Applies an action. `seat` is who acts; "deal" is the table's own step (any seat may send it).
 * Throws GPattaError on anything not allowed.
 */
export function act(state: GPattaState, seat: number, action: GPattaAction, random: () => number = Math.random): GPattaState {
  if (state.phase === "over") throw new GPattaError("The game is over");
  if (!Number.isInteger(seat) || seat < 0 || seat >= state.n) throw new GPattaError("No such seat");

  if (action.type === "deal") {
    if (state.phase !== "reveal") throw new GPattaError("The cards are already dealt");
    const s = clone(state);
    s.deck.forEach((c, k) => s.players[(s.first + k) % s.n].hand.push(c));
    s.deck = [];
    s.phase = "pairs";
    s.events.push({ t: "deal", first: s.first, counts: s.players.map((p) => p.hand.length) });
    return s;
  }

  if (state.phase === "reveal") throw new GPattaError("The cards aren't dealt yet");

  if (state.phase === "pairs") {
    const me = state.players[seat];
    if (me.ready) throw new GPattaError("You've already thrown your pairs");
    const s = clone(state);
    const p = s.players[seat];
    if (action.type === "pair") {
      const { a, b } = action;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !p.hand[a] || !p.hand[b]) throw new GPattaError("Pick two of your cards");
      if (p.hand[a].r !== p.hand[b].r) throw new GPattaError("Those two aren't a pair");
      const cards = [p.hand[a], p.hand[b]];
      p.hand = p.hand.filter((_, i) => i !== a && i !== b);
      s.discard.push(...cards);
      s.events.push({ t: "pairs", seat, cards });
      if (!hasPair(p.hand)) {
        p.hand = shuffle(p.hand, random);
        p.ready = true;
      }
    } else if (action.type === "throw" || action.type === "timeout") {
      throwPairs(s, seat, random);
      p.ready = true;
    } else throw new GPattaError("Throw your pairs first");
    if (s.players.every((x) => x.ready)) startDrawing(s);
    return s;
  }

  // drawing
  if (seat !== state.turn) throw new GPattaError("It isn't your turn");
  if (action.type !== "draw" && action.type !== "timeout") throw new GPattaError("Take a card from the next player");
  const from = drawTarget(state, seat);
  if (from === null) throw new GPattaError("Nobody to take from");
  const count = state.players[from].hand.length;
  const index = action.type === "draw" ? action.index : Math.floor(random() * count);
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new GPattaError("Pick one of their cards");

  const s = clone(state);
  const giver = s.players[from];
  const me = s.players[seat];
  const [card] = giver.hand.splice(index, 1);
  // a new card goes somewhere random in the hand
  me.hand.splice(Math.floor(random() * (me.hand.length + 1)), 0, card);
  s.events.push({ t: "draw", from, to: seat, index, card });
  const pairIdx = me.hand.findIndex((c) => c !== card && c.r === card.r);
  if (pairIdx >= 0) {
    const mate = me.hand[pairIdx];
    me.hand = me.hand.filter((c) => c !== card && c !== mate);
    s.discard.push(mate, card);
    s.events.push({ t: "pairs", seat, cards: [mate, card] });
  }
  // the one who lost their last card is out before the one who took it
  settle(s, [from, seat]);
  if (s.phase === "draw") s.turn = nextActive(s, seat)!;
  return s;
}

export const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r);
export const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const cardLabel = (c: Card) => `${rankLabel(c.r)}${SUIT_GLYPH[c.s]}`;
export const isRed = (c: Card) => c.s === "h" || c.s === "d";
