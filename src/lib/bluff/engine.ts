/*
 * Bluff: four players, a 20-card deck (6 Kings, 6 Queens, 6 Aces, 2 wild Jokers) and a revolver each.
 *
 * Every round a table card (King, Queen or Ace) is drawn and everyone alive gets five cards. On your turn you
 * lay 1–3 cards face down and claim they are all the table card. The next player either plays on (accepting
 * the claim) or calls "Liar!". The last play is turned over: if every card is the table card or a Joker the
 * caller was wrong, otherwise the player who laid them lied. Whoever was wrong pulls their own trigger. Each
 * revolver holds one live round in six chambers, so every blank survived makes the next pull more likely to
 * fire. A new round follows every call. The last player alive wins.
 *
 * Pure and JSON-serialisable: the server and the phones run the same code.
 */

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];

/** A table card. */
export type Rank = "K" | "Q" | "A";
export const RANKS: Rank[] = ["K", "Q", "A"];
export const RANK_NAME: Record<Rank, string> = { K: "King", Q: "Queen", A: "Ace" };

/** "K0".."K5", "Q0".."Q5", "A0".."A5", and the two Jokers "W0", "W1". Hidden cards are "??". */
export type BluffCard = string;
export const HIDDEN: BluffCard = "??";
export const isJoker = (c: BluffCard) => c[0] === "W";
export const rankOfCard = (c: BluffCard): Rank | "W" | "?" => (c[0] === "?" ? "?" : (c[0] as Rank | "W"));
/** True when the card may stand for the table card. */
export const matches = (c: BluffCard, table: Rank) => c[0] === table || isJoker(c);

export const HAND_SIZE = 5;
export const MAX_PLAY = 3;
export const CHAMBERS = 6;
/** Seconds a person has to move before they play (or call) automatically. */
export const BLUFF_TURN_SECONDS = 30;
/** How long a call's reveal and the trigger pull are shown before the next round is dealt (ms). */
export const BLUFF_REVEAL_MS = 5800;
/** When, after a call, the trigger is pulled on screen (ms): the cards are turned over first. */
export const SHOT_AT_MS = 1500;
/** When the pull's outcome lands (ms after the call): the cylinder spins, the hammer cocks, a heartbeat, then click or bang. */
export const SHOT_LANDS_MS = 3500;

export function fullBluffDeck(): BluffCard[] {
  const d: BluffCard[] = [];
  for (const r of RANKS) for (let i = 0; i < 6; i++) d.push(`${r}${i}`);
  d.push("W0", "W1");
  return d;
}

export interface BluffPlayer {
  alive: boolean;
  /** Trigger pulls survived so far (the UI shows shots/6). */
  shots: number;
  /** Which pull (0–5) holds the live round. -1 when hidden from this phone. */
  live: number;
}

export interface BluffPlay {
  seat: Seat;
  cards: BluffCard[];
}

export interface BluffReveal {
  /** Who made the play that was called. */
  seat: Seat;
  caller: Seat;
  cards: BluffCard[];
  truthful: boolean;
  /** Who pulled the trigger, which pull it was (1–6), and whether it fired. */
  loser: Seat;
  pull: number;
  fired: boolean;
}

export type BluffEvent =
  | { type: "roundStart"; round: number; tableCard: Rank; starter: Seat }
  | { type: "deal"; counts: number[] }
  | { type: "play"; seat: Seat; count: number; auto?: boolean }
  | { type: "call"; by: Seat; on: Seat; auto?: boolean }
  | { type: "reveal"; seat: Seat; cards: BluffCard[]; truthful: boolean }
  | { type: "shot"; seat: Seat; pull: number; live: boolean }
  | { type: "eliminated"; seat: Seat }
  | { type: "end"; winner: Seat };

export type BluffAction = { type: "play"; cards: BluffCard[]; auto?: boolean } | { type: "call"; auto?: boolean };

export interface BluffState {
  /** 1, 2, … — a new round after every call. */
  round: number;
  tableCard: Rank;
  dealer: Seat;
  hands: BluffCard[][];
  /** Cards in each hand. Equal to hands[s].length on the server; kept for phones that can't see the cards. */
  counts: number[];
  players: BluffPlayer[];
  /** Whose move it is (while phase is "play"). */
  turn: Seat;
  /** The player on turn can't play and has to call the last play. */
  mustCall: boolean;
  /** Every play this round, oldest first; the last one is what a call turns over. */
  plays: BluffPlay[];
  /** "play": someone is on turn. "reveal": a call was just settled, the next round comes after it is shown. "over": one left. */
  phase: "play" | "reveal" | "over";
  reveal: BluffReveal | null;
  /** Who starts the next round (set while phase is "reveal"). */
  nextStarter: Seat | null;
  winner: Seat | null;
  /** This round's events (cleared when a round starts), for animation. */
  events: BluffEvent[];
  /** Counts every event since the start of the game, so a phone can tell new events from old. */
  eventNo: number;
}

export class BluffError extends Error {}

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat;
export const aliveSeats = (s: BluffState) => SEATS.filter((x) => s.players[x].alive);

function push(s: BluffState, e: BluffEvent) {
  s.events.push(e);
  s.eventNo += 1;
}

/** The first living seat after `from` (never `from` itself unless it is the only one). */
function nextAlive(s: BluffState, from: Seat, want: (x: Seat) => boolean = () => true): Seat | null {
  let x = from;
  for (let i = 0; i < 4; i++) {
    x = nextSeat(x);
    if (x === from) break;
    if (s.players[x].alive && want(x)) return x;
  }
  return null;
}

/** A new game: four loaded revolvers and the first round dealt. */
export function newBluff(dealer?: Seat, random: Random = Math.random): BluffState {
  const d = dealer ?? (Math.floor(random() * 4) as Seat);
  const s: BluffState = {
    round: 0,
    tableCard: "K",
    dealer: d,
    hands: [[], [], [], []],
    counts: [0, 0, 0, 0],
    players: SEATS.map(() => ({ alive: true, shots: 0, live: Math.floor(random() * CHAMBERS) })),
    turn: nextSeat(d),
    mustCall: false,
    plays: [],
    phase: "play",
    reveal: null,
    nextStarter: null,
    winner: null,
    events: [],
    eventNo: 0,
  };
  return startRound(s, nextSeat(d), random);
}

/** Shuffles, deals five to everyone alive and draws a table card. Mutates and returns `s`. */
function startRound(s: BluffState, starter: Seat, random: Random): BluffState {
  const deck = shuffle(fullBluffDeck(), random);
  s.round += 1;
  s.tableCard = RANKS[Math.floor(random() * RANKS.length)];
  s.hands = SEATS.map((x) => (s.players[x].alive ? deck.splice(0, HAND_SIZE) : []));
  s.counts = s.hands.map((h) => h.length);
  s.plays = [];
  s.reveal = null;
  s.nextStarter = null;
  s.phase = "play";
  s.events = [];
  const first = s.players[starter].alive ? starter : nextAlive(s, starter)!;
  s.turn = first;
  s.mustCall = false;
  push(s, { type: "roundStart", round: s.round, tableCard: s.tableCard, starter: first });
  push(s, { type: "deal", counts: [...s.counts] });
  return s;
}

/** Deals the next round once a call's reveal has been shown. */
export function nextRound(state: BluffState, random: Random = Math.random): BluffState {
  if (state.phase !== "reveal" || state.nextStarter === null) throw new BluffError("The round is still being played");
  return startRound(structuredClone(state), state.nextStarter, random);
}

export interface BluffOptions {
  myTurn: boolean;
  canPlay: boolean;
  canCall: boolean;
  mustCall: boolean;
  /** Most cards you may lay now. */
  maxPlay: number;
}

export function options(state: BluffState, seat: Seat): BluffOptions {
  const myTurn = state.phase === "play" && state.turn === seat && state.players[seat].alive;
  const n = state.counts[seat];
  const last = state.plays[state.plays.length - 1];
  return {
    myTurn,
    canPlay: myTurn && !state.mustCall && n > 0,
    canCall: myTurn && !!last && last.seat !== seat,
    mustCall: myTurn && state.mustCall,
    maxPlay: Math.min(MAX_PLAY, n),
  };
}

/** Hands someone the turn after `from` played: the next living player who can still play, or someone who must call. */
function passTurn(s: BluffState, from: Seat) {
  const withCards = (x: Seat) => s.counts[x] > 0;
  const holders = aliveSeats(s).filter(withCards);
  const next = nextAlive(s, from, (x) => withCards(x));
  if (next !== null && !(holders.length === 1 && holders[0] === next)) {
    s.turn = next;
    s.mustCall = false;
    return;
  }
  // Nobody else can play on: the next player (cards or not) has to call the last play.
  s.turn = next ?? nextAlive(s, from)!;
  s.mustCall = true;
}

export function act(state: BluffState, seat: Seat, action: BluffAction): BluffState {
  if (state.phase === "over") throw new BluffError("The game is over");
  if (state.phase !== "play") throw new BluffError("Wait for the next round");
  if (!state.players[seat]?.alive) throw new BluffError("You're out of this game");
  if (state.turn !== seat) throw new BluffError("It isn't your turn");
  const s = structuredClone(state);
  const o = options(state, seat);

  if (action.type === "play") {
    if (!o.canPlay) throw new BluffError(state.mustCall ? "Nobody can play on: call it" : "You have no cards left");
    const cards = Array.isArray(action.cards) ? action.cards.map(String) : [];
    if (cards.length < 1 || cards.length > MAX_PLAY) throw new BluffError(`Play 1 to ${MAX_PLAY} cards`);
    if (new Set(cards).size !== cards.length) throw new BluffError("Each card once");
    const hand = s.hands[seat];
    if (hand.length !== s.counts[seat]) throw new BluffError("Those cards aren't visible here");
    for (const c of cards) if (!hand.includes(c)) throw new BluffError("That card isn't in your hand");
    s.hands[seat] = hand.filter((c) => !cards.includes(c));
    s.counts[seat] = s.hands[seat].length;
    s.plays.push({ seat, cards });
    push(s, { type: "play", seat, count: cards.length, ...(action.auto && { auto: true }) });
    passTurn(s, seat);
    return s;
  }

  if (action.type === "call") {
    if (!o.canCall) throw new BluffError("There's nothing to call yet");
    const last = s.plays[s.plays.length - 1];
    const truthful = last.cards.every((c) => matches(c, s.tableCard));
    if (last.cards.some((c) => c === HIDDEN)) throw new BluffError("Those cards aren't visible here");
    push(s, { type: "call", by: seat, on: last.seat, ...(action.auto && { auto: true }) });
    push(s, { type: "reveal", seat: last.seat, cards: [...last.cards], truthful });
    const loser = truthful ? seat : last.seat;
    const p = s.players[loser];
    const fired = p.shots === p.live;
    const pull = p.shots + 1;
    push(s, { type: "shot", seat: loser, pull, live: fired });
    if (fired) {
      p.alive = false;
      s.hands[loser] = [];
      s.counts[loser] = 0;
      push(s, { type: "eliminated", seat: loser });
    } else {
      p.shots += 1;
    }
    s.reveal = { seat: last.seat, caller: seat, cards: [...last.cards], truthful, loser, pull, fired };
    const alive = aliveSeats(s);
    if (alive.length <= 1) {
      s.phase = "over";
      s.winner = alive[0] ?? null;
      if (s.winner !== null) push(s, { type: "end", winner: s.winner });
      return s;
    }
    s.phase = "reveal";
    s.nextStarter = p.alive ? loser : nextAlive(s, loser)!;
    return s;
  }
  throw new BluffError("Unknown move");
}

/** The move made for a player whose time ran out: call when they must, otherwise lay one random card. */
export function autoAction(state: BluffState, seat: Seat, random: Random = Math.random): BluffAction {
  const o = options(state, seat);
  if (o.mustCall || !o.canPlay) return { type: "call", auto: true };
  const hand = state.hands[seat];
  return { type: "play", cards: [hand[Math.floor(random() * hand.length)]], auto: true };
}

/** Total cards claimed so far this round. */
export const claimed = (s: BluffState) => s.plays.reduce((n, p) => n + p.cards.length, 0);
