/**
 * Paanch: five in a row on a board of cards. Two decks (no jokers) are dealt out; on your turn you play a
 * card from your hand and put a chip on a free square showing that card. Five in a row (across, down or
 * diagonally) makes a line; the first side to make two lines wins. Corners are free squares that count
 * for everyone. Two-eyed jacks (♦ ♣) go anywhere; one-eyed jacks (♥ ♠) take an opponent's chip off,
 * unless it is part of a finished line.
 *
 * Pure and JSON-serialisable: every move returns a new state.
 */

import { type Card, RANKS, SUITS } from "../game/cards";

export type Seat = 0 | 1 | 2 | 3;
/** Side 0 or 1. Seats 0 & 2 play together, 1 & 3 together. */
export type Team = 0 | 1;

export const PAANCH_TURN_SECONDS = 30;
export const SIZE = 10;
export const CELLS = SIZE * SIZE;
/** Lines a side needs to win. */
export const LINES_TO_WIN = 2;
/** A game that somehow never ends (jacks taking chips back and forth) is a draw after this many moves. */
export const MOVE_LIMIT = 500;
const EVENTS_KEPT = 60;

export class PaanchError extends Error {}

// ───────────── cards ─────────────

export const isJack = (c: Card) => c[0] === "J";
/** ♦ and ♣ jacks: put a chip on any free square. */
export const isTwoEyed = (c: Card) => c === "JD" || c === "JC";
/** ♥ and ♠ jacks: take an opponent's chip off. */
export const isOneEyed = (c: Card) => c === "JH" || c === "JS";

export function paanchDeck(): Card[] {
  const one: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) one.push(r + s);
  return [...one, ...one];
}

// ───────────── the board ─────────────

const CORNERS = [0, SIZE - 1, CELLS - SIZE, CELLS - 1];
export const isCorner = (i: number) => CORNERS.includes(i);

/** A small seeded generator, so every phone draws the same board. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a: number, b: number) => Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)));

/**
 * The board: 100 squares, the four corners free (null), every other card (no jacks) twice. Our own
 * arrangement: each card's two copies sit well apart, and no two neighbouring squares share a suit
 * where it can be helped, so the board reads as a patchwork rather than in runs.
 */
function makeBoard(): (Card | null)[] {
  const cards: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) if (r !== "J") cards.push(r + s);
  for (let seed = 5; seed < 5000; seed++) {
    const rnd = seeded(seed * 7919);
    const board: (Card | null)[] = Array(CELLS).fill(null);
    const free = () => Array.from({ length: CELLS }, (_, i) => i).filter((i) => !isCorner(i) && board[i] === null);
    const order = cards.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let ok = true;
    for (const c of order) {
      const open = free();
      // a square whose neighbours don't share this card's suit, if there is one
      const calm = (i: number) =>
        [-1, 1, -SIZE, SIZE].every((d) => {
          const n = i + d;
          if (n < 0 || n >= CELLS || (Math.abs(d) === 1 && Math.floor(n / SIZE) !== Math.floor(i / SIZE))) return true;
          return board[n]?.[1] !== c[1];
        });
      const pick = (list: number[]) => {
        const nice = list.filter(calm);
        const from = nice.length ? nice : list;
        return from[Math.floor(rnd() * from.length)];
      };
      const a = pick(open);
      board[a] = c;
      const far = free().filter((i) => dist(i, a) >= 4);
      if (!far.length) {
        ok = false;
        break;
      }
      board[pick(far)] = c;
    }
    if (ok) return board;
  }
  throw new Error("Couldn't lay out the Paanch board");
}

/** The board every table uses. */
export const BOARD: readonly (Card | null)[] = makeBoard();

/** Each card's two squares. */
export const SQUARES_OF: Readonly<Record<Card, number[]>> = (() => {
  const m: Record<Card, number[]> = {};
  BOARD.forEach((c, i) => {
    if (c) (m[c] ??= []).push(i);
  });
  return m;
})();

// ───────────── state ─────────────

export interface Line {
  team: Team;
  cells: number[];
}

export type PaanchEvent =
  | { type: "deal"; players: 2 | 4 }
  | { type: "place"; seat: Seat; card: Card; cell: number; wild: boolean; auto?: boolean }
  | { type: "remove"; seat: Seat; card: Card; cell: number; team: Team; auto?: boolean }
  | { type: "dead"; seat: Seat; card: Card; endsTurn: boolean }
  | { type: "line"; team: Team; cells: number[] }
  | { type: "reshuffle" }
  | { type: "end"; winner: Team | null; reason: "lines" | "board" | "limit" };

export interface PaanchState {
  players: 2 | 4;
  /** Whose chip is on each square (side 0 or 1), null for empty. Corners stay null (free for all). */
  chips: (Team | null)[];
  /** Squares that are part of a finished line (their chips can't be taken). */
  locked: boolean[];
  lines: Line[];
  /** Each seat's cards (2 players: seats 0 and 1 only; the others stay empty). */
  hands: Card[][];
  deck: Card[];
  discard: Card[];
  turn: Seat;
  dealer: Seat;
  /** A dead card was already swapped this turn. */
  swapped: boolean;
  moveNo: number;
  /** The most recent events (older ones are dropped); `eventNo` counts every event ever. */
  events: PaanchEvent[];
  eventNo: number;
  last: { seat: Seat; card: Card; cell: number; kind: "place" | "remove" } | null;
  result: { winner: Team | null; reason: "lines" | "board" | "limit" } | null;
}

export type PaanchAction =
  | { type: "place"; card: Card; cell: number; auto?: boolean }
  | { type: "remove"; card: Card; cell: number; auto?: boolean }
  /** Swap a card that can't be played (both its squares are taken) for a fresh one. */
  | { type: "dead"; card: Card };

export const teamOf = (s: Seat): Team => (s % 2) as Team;
export const seatsOf = (players: 2 | 4): Seat[] => (players === 2 ? [0, 1] : [0, 1, 2, 3]);
export const handSize = (players: 2 | 4) => (players === 2 ? 7 : 6);
const nextSeat = (players: 2 | 4, s: Seat) => ((s + 1) % players) as Seat;

function shuffled<T>(items: T[], random: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newPaanch({ players, dealer, random = Math.random }: { players: 2 | 4; dealer?: Seat; random?: () => number }): PaanchState {
  if (players !== 2 && players !== 4) throw new PaanchError("Paanch is for 2 or 4 players");
  const d = (dealer ?? 0) % players as Seat;
  const deck = shuffled(paanchDeck(), random);
  const hands: Card[][] = [[], [], [], []];
  const n = handSize(players);
  for (let i = 0; i < n; i++) for (const s of seatsOf(players)) hands[s].push(deck.pop()!);
  return {
    players,
    chips: Array(CELLS).fill(null),
    locked: Array(CELLS).fill(false),
    lines: [],
    hands,
    deck,
    discard: [],
    turn: nextSeat(players, d),
    dealer: d,
    swapped: false,
    moveNo: 0,
    events: [{ type: "deal", players }],
    eventNo: 1,
    last: null,
    result: null,
  };
}

// ───────────── rules ─────────────

/** Where this card can go right now: free squares for it (any free square for a two-eyed jack), or the opponent chips a one-eyed jack may take. */
export function legalTargets(state: PaanchState, seat: Seat, card: Card): number[] {
  const out: number[] = [];
  if (isOneEyed(card)) {
    const them = (1 - teamOf(seat)) as Team;
    for (let i = 0; i < CELLS; i++) if (state.chips[i] === them && !state.locked[i]) out.push(i);
    return out;
  }
  if (isTwoEyed(card)) {
    for (let i = 0; i < CELLS; i++) if (!isCorner(i) && state.chips[i] === null) out.push(i);
    return out;
  }
  for (const i of SQUARES_OF[card] ?? []) if (state.chips[i] === null) out.push(i);
  return out;
}

/** A card with nowhere to go. */
export const isDead = (state: PaanchState, seat: Seat, card: Card) => legalTargets(state, seat, card).length === 0;

/** Can this seat place or take a chip with any card in hand? */
export const canMove = (state: PaanchState, seat: Seat) => state.hands[seat].some((c) => !isDead(state, seat, c));

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

const at = (r: number, c: number) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1);
const ownedBy = (state: PaanchState, i: number, team: Team) => isCorner(i) || state.chips[i] === team;

/**
 * New lines through `cell` for `team`: windows of five of its chips (corners count) that share at most
 * one square with each of the side's existing lines. Several may finish at once.
 */
export function findLines(state: PaanchState, cell: number, team: Team, existing: Line[] = state.lines): number[][] {
  const mine = existing.filter((l) => l.team === team).map((l) => l.cells);
  const found: number[][] = [];
  const r0 = Math.floor(cell / SIZE);
  const c0 = cell % SIZE;
  for (const [dr, dc] of DIRS) {
    // the run through this cell along the direction
    let k = 0;
    while (at(r0 - (k + 1) * dr, c0 - (k + 1) * dc) >= 0 && ownedBy(state, at(r0 - (k + 1) * dr, c0 - (k + 1) * dc), team)) k++;
    const run: number[] = [];
    for (let j = -k; ; j++) {
      const i = at(r0 + j * dr, c0 + j * dc);
      if (i < 0 || !ownedBy(state, i, team)) break;
      run.push(i);
    }
    if (run.length < 5) continue;
    // every window of five holding the new chip, best (least overlap) first, greedily
    const windows: number[][] = [];
    for (let s = 0; s + 5 <= run.length; s++) {
      const w = run.slice(s, s + 5);
      if (w.includes(cell)) windows.push(w);
    }
    for (const w of windows) {
      const others = [...mine, ...found];
      if (others.every((l) => l.filter((x) => w.includes(x)).length <= 1)) found.push(w);
    }
  }
  return found;
}

/** Every line on the board (for checks): the stored ones. */
export const findSequences = (state: PaanchState) => state.lines;

function push(s: PaanchState, e: PaanchEvent) {
  s.events.push(e);
  s.eventNo++;
  if (s.events.length > EVENTS_KEPT) s.events.splice(0, s.events.length - EVENTS_KEPT);
}

function draw(s: PaanchState, seat: Seat, random: () => number) {
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffled(s.discard, random);
    s.discard = [];
    push(s, { type: "reshuffle" });
  }
  const c = s.deck.pop();
  if (c) s.hands[seat].push(c);
}

function takeFromHand(s: PaanchState, seat: Seat, card: Card) {
  const i = s.hands[seat].indexOf(card);
  if (i < 0) throw new PaanchError("That card isn't in your hand");
  s.hands[seat].splice(i, 1);
}

function endTurn(s: PaanchState) {
  s.moveNo++;
  s.swapped = false;
  if (s.result) return;
  const full = s.chips.every((c, i) => isCorner(i) || c !== null);
  if (full) {
    s.result = { winner: null, reason: "board" };
    push(s, { type: "end", winner: null, reason: "board" });
    return;
  }
  if (s.moveNo >= MOVE_LIMIT) {
    s.result = { winner: null, reason: "limit" };
    push(s, { type: "end", winner: null, reason: "limit" });
    return;
  }
  s.turn = nextSeat(s.players, s.turn);
}

export function act(state: PaanchState, seat: Seat, action: PaanchAction, random: () => number = Math.random): PaanchState {
  if (state.result) throw new PaanchError("The game is over");
  if (seat !== state.turn) throw new PaanchError("It isn't your turn");
  const s = structuredClone(state);
  const team = teamOf(seat);
  const card = action.card;
  if (!s.hands[seat].includes(card)) throw new PaanchError("That card isn't in your hand");

  if (action.type === "dead") {
    if (!isDead(s, seat, card)) throw new PaanchError("That card can still be played");
    if (s.swapped) {
      // a second dead card in one turn is only allowed when nothing at all can be played: it ends the turn
      if (canMove(s, seat)) throw new PaanchError("You've already swapped a dead card this turn");
      takeFromHand(s, seat, card);
      s.discard.push(card);
      draw(s, seat, random);
      push(s, { type: "dead", seat, card, endsTurn: true });
      endTurn(s);
      return s;
    }
    takeFromHand(s, seat, card);
    s.discard.push(card);
    draw(s, seat, random);
    s.swapped = true;
    push(s, { type: "dead", seat, card, endsTurn: false });
    // nothing else playable and no more swaps: the turn passes
    if (!canMove(s, seat) && !s.hands[seat].some((c) => isDead(s, seat, c))) endTurn(s);
    return s;
  }

  const cell = Math.trunc(Number(action.cell));
  if (!(cell >= 0 && cell < CELLS)) throw new PaanchError("That isn't a square on the board");

  if (action.type === "remove") {
    if (!isOneEyed(card)) throw new PaanchError("Only a one-eyed jack (♥ ♠) takes a chip off");
    const them = (1 - team) as Team;
    if (s.chips[cell] !== them) throw new PaanchError("There's no opponent chip there");
    if (s.locked[cell]) throw new PaanchError("That chip is part of a finished line");
    takeFromHand(s, seat, card);
    s.discard.push(card);
    s.chips[cell] = null;
    s.last = { seat, card, cell, kind: "remove" };
    push(s, { type: "remove", seat, card, cell, team: them, ...(action.auto ? { auto: true } : {}) });
    draw(s, seat, random);
    endTurn(s);
    return s;
  }

  // place
  if (isOneEyed(card)) throw new PaanchError("A one-eyed jack takes a chip off; it can't place one");
  if (isCorner(cell)) throw new PaanchError("Corners are free for everyone");
  if (s.chips[cell] !== null) throw new PaanchError("That square is taken");
  const wild = isTwoEyed(card);
  if (!wild && BOARD[cell] !== card) throw new PaanchError("That card doesn't match the square");
  takeFromHand(s, seat, card);
  s.discard.push(card);
  s.chips[cell] = team;
  s.last = { seat, card, cell, kind: "place" };
  push(s, { type: "place", seat, card, cell, wild, ...(action.auto ? { auto: true } : {}) });
  for (const cells of findLines(s, cell, team)) {
    s.lines.push({ team, cells });
    for (const i of cells) s.locked[i] = true;
    push(s, { type: "line", team, cells });
  }
  if (s.lines.filter((l) => l.team === team).length >= LINES_TO_WIN) {
    s.result = { winner: team, reason: "lines" };
    push(s, { type: "end", winner: team, reason: "lines" });
  }
  draw(s, seat, random);
  endTurn(s);
  return s;
}

/** A random legal move (when someone's time runs out). */
export function autoMove(state: PaanchState, seat: Seat, random: () => number = Math.random): PaanchAction {
  const moves: PaanchAction[] = [];
  for (const card of state.hands[seat]) {
    for (const cell of legalTargets(state, seat, card)) {
      moves.push(isOneEyed(card) ? { type: "remove", card, cell, auto: true } : { type: "place", card, cell, auto: true });
    }
  }
  // prefer ordinary placements over spending a jack
  const plain = moves.filter((m) => !isJack(m.card));
  const pool = plain.length ? plain : moves;
  if (pool.length) return pool[Math.floor(random() * pool.length)];
  const dead = state.hands[seat].find((c) => isDead(state, seat, c));
  if (dead) return { type: "dead", card: dead };
  throw new PaanchError("No move available");
}

/** How many lines each side has. */
export const lineCount = (state: Pick<PaanchState, "lines">, team: Team) => state.lines.filter((l) => l.team === team).length;
