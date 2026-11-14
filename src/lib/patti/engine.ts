import { type Card, fullDeck, shuffle } from "@/lib/game/cards";
import { type HandValue, compareValues, evaluate } from "./hands";

/**
 * 3 Patti (Teen Patti) for four seats, as a pure state machine: every move returns a new state.
 *
 * The deal:
 * - Everyone still holding chips puts the boot in the pot and gets three cards face down.
 * - Play goes round from the dealer's left. On your turn you pack (fold), chaal (bet), raise, or — when allowed —
 *   ask for a show or a sideshow. You may look at your cards ("see") at any time; until then you play blind.
 * - The stake starts at the boot. A blind player bets the stake (or doubles it); a seen player bets twice the
 *   stake (or four times, which doubles it). The stake never goes above the table's chaal limit.
 * - A blind player may play blind for at most `blindLimit` turns, then has to look.
 * - Show: once only two players are left, either may pay their chaal and ask for both hands to be shown.
 *   Equal hands: the player who asked loses.
 * - Sideshow: a seen player, with three or more still in, may pay their chaal and ask the player who bet just
 *   before them (if that player has also seen) to compare hands privately. That player may refuse. If they
 *   accept, the weaker hand packs; equal hands: the player who asked packs.
 * - Pot limit: when the pot reaches it, everyone still in shows and the best hand takes the pot.
 * - Short of chips: a bet you can't cover puts in everything you have (all in). You stay in to the showdown but
 *   can only win from each player as much as you put in (side pots).
 */

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: Seat[] = [0, 1, 2, 3];

export interface PattiRules {
  boot: number;
  startChips: number;
  /** Highest the (blind) stake can go. */
  maxStake: number;
  potLimit: number;
  /** Most turns a player may play blind before they have to see. */
  blindLimit: number;
}

/** Three table sizes; everything scales with the boot. */
export const TABLES = [
  { id: "low", name: "Chai table", boot: 1 },
  { id: "mid", name: "Bazaar table", boot: 50 },
  { id: "high", name: "Royal table", boot: 100 },
] as const;
export type TableId = (typeof TABLES)[number]["id"];

export function rulesFor(boot: number): PattiRules {
  return { boot, startChips: boot * 50, maxStake: boot * 8, potLimit: boot * 128, blindLimit: 4 };
}

export interface Player {
  chips: number;
  /** Has looked at their cards. */
  seen: boolean;
  folded: boolean;
  /** Every chip is in the pot: no more bets, but still in for the showdown. */
  allIn: boolean;
  /** Chips put in the pot this deal (boot included). */
  put: number;
  /** Turns played blind this deal. */
  blindTurns: number;
  /** Sat this deal out (no chips when it was dealt). */
  out: boolean;
}

export type PattiEvent =
  | { type: "boot"; amounts: number[] }
  | { type: "see"; seat: Seat }
  | { type: "chaal"; seat: Seat; amount: number; raise: boolean; blind: boolean; allIn: boolean }
  | { type: "pack"; seat: Seat; auto?: boolean }
  | { type: "sideshowAsk"; seat: Seat; to: Seat; amount: number }
  | { type: "sideshowReply"; seat: Seat; from: Seat; accept: boolean; loser: Seat | null }
  | { type: "show"; seat: Seat; amount: number }
  | { type: "end"; reason: EndReason };

export type EndReason = "fold" | "show" | "potLimit" | "allIn";

export interface DealResult {
  reason: EndReason;
  /** Chips each seat takes from the pot (0 for most). */
  won: number[];
  winners: Seat[];
  /** Seats whose cards are turned face up. */
  shown: Seat[];
  values: (HandValue | null)[];
  pot: number;
}

export interface PattiState {
  rules: PattiRules;
  dealNo: number;
  dealer: Seat;
  hands: Card[][];
  players: Player[];
  stake: number;
  pot: number;
  turn: Seat;
  /** A sideshow waiting for an answer from `to`. */
  pending: { from: Seat; to: Seat } | null;
  /** Who bet most recently (the player a sideshow is asked of). */
  lastBettor: Seat | null;
  events: PattiEvent[];
  result: DealResult | null;
}

export type PattiAction =
  | { type: "see" }
  | { type: "chaal" }
  | { type: "raise" }
  | { type: "pack"; auto?: boolean }
  | { type: "show" }
  | { type: "sideshow" }
  | { type: "sideshowReply"; accept: boolean };

export class PattiError extends Error {}

/** Seconds a player has to move before they pack. */
export const PATTI_TURN_SECONDS = 30;
/** Seconds to answer a sideshow before it is refused. */
export const SIDESHOW_SECONDS = 12;

const next = (s: Seat) => ((s + 1) % 4) as Seat;
export const inHand = (p: Player) => !p.out && !p.folded;
const canAct = (p: Player) => inHand(p) && !p.allIn;

/** A fresh table: everyone with the starting chips, nothing dealt yet. */
export function newTable(rules: PattiRules, chips?: number[], dealer: Seat = 3): PattiState {
  return {
    rules,
    dealNo: 0,
    dealer,
    hands: [[], [], [], []],
    players: SEATS.map((s) => ({
      chips: chips?.[s] ?? rules.startChips,
      seen: false,
      folded: false,
      allIn: false,
      put: 0,
      blindTurns: 0,
      out: true,
    })),
    stake: rules.boot,
    pot: 0,
    turn: 0,
    pending: null,
    lastBettor: null,
    events: [],
    result: null,
  };
}

/** Seats with chips to play the next deal. */
export const seatsWithChips = (state: PattiState) => SEATS.filter((s) => state.players[s].chips > 0);

/** Deals the next hand: the button moves on, everyone with chips pays the boot and gets three cards. */
export function startDeal(state: PattiState, random?: () => number): PattiState {
  if (seatsWithChips(state).length < 2) throw new PattiError("At least two players need chips to deal");
  const { boot } = state.rules;
  const s: PattiState = structuredClone(state);
  s.dealNo += 1;
  s.dealer = next(s.dealer);
  s.pot = 0;
  s.stake = boot;
  s.pending = null;
  s.lastBettor = null;
  s.result = null;
  const deck = shuffle(fullDeck(), random);
  const amounts = [0, 0, 0, 0];
  for (const seat of SEATS) {
    const p = s.players[seat];
    p.seen = false;
    p.folded = false;
    p.allIn = false;
    p.put = 0;
    p.blindTurns = 0;
    p.out = p.chips <= 0;
    s.hands[seat] = p.out ? [] : deck.splice(0, 3);
    if (!p.out) amounts[seat] = pay(s, seat, boot);
  }
  s.events = [{ type: "boot", amounts }];
  // first to act: the dealer's left, skipping anyone who can't bet
  let t = next(s.dealer);
  for (let i = 0; i < 4 && !canAct(s.players[t]); i++) t = next(t);
  s.turn = t;
  return settleIfStuck(s, s.dealer);
}

/** Moves chips from a seat to the pot (as many as it has, up to amount). Returns how many went in. */
function pay(s: PattiState, seat: Seat, amount: number) {
  const p = s.players[seat];
  const paid = Math.min(amount, p.chips);
  p.chips -= paid;
  p.put += paid;
  s.pot += paid;
  if (p.chips === 0) p.allIn = true;
  return paid;
}

/** What a seat's chaal costs: the stake blind, twice the stake seen; doubled for a raise. */
export function chaalCost(state: PattiState, seat: Seat, raise = false) {
  return state.stake * (state.players[seat].seen ? 2 : 1) * (raise ? 2 : 1);
}

/** The player a sideshow would be asked of, if a sideshow is allowed for this seat right now. */
export function sideshowTarget(state: PattiState, seat: Seat): Seat | null {
  const me = state.players[seat];
  if (!me.seen || state.lastBettor === null || state.lastBettor === seat) return null;
  if (SEATS.filter((x) => inHand(state.players[x])).length < 3) return null;
  const t = state.players[state.lastBettor];
  if (!inHand(t) || !t.seen || t.allIn) return null;
  if (me.chips < chaalCost(state, seat)) return null;
  return state.lastBettor;
}

export interface Options {
  /** It is this seat's turn to bet. */
  myTurn: boolean;
  see: boolean;
  /** Played blind as long as the table allows: has to see before betting again. */
  mustSee: boolean;
  chaal: boolean;
  chaalCost: number;
  /** The chaal would take every chip left. */
  chaalAllIn: boolean;
  raise: boolean;
  raiseCost: number;
  pack: boolean;
  show: boolean;
  showCost: number;
  sideshow: boolean;
  sideshowTo: Seat | null;
  /** A sideshow is waiting for this seat's answer. */
  reply: boolean;
}

/** Everything a seat may do right now. */
export function options(state: PattiState, seat: Seat): Options {
  const p = state.players[seat];
  const live = state.result === null && inHand(p);
  const myTurn = live && state.pending === null && state.turn === seat && !p.allIn;
  const mustSee = !p.seen && p.blindTurns >= state.rules.blindLimit;
  const cost = chaalCost(state, seat);
  const raiseCost = chaalCost(state, seat, true);
  const left = SEATS.filter((x) => inHand(state.players[x])).length;
  const bet = myTurn && !mustSee;
  const to = myTurn ? sideshowTarget(state, seat) : null;
  return {
    myTurn,
    see: live && !p.seen,
    mustSee: myTurn && mustSee,
    chaal: bet,
    chaalCost: Math.min(cost, p.chips),
    chaalAllIn: p.chips <= cost,
    raise: bet && state.stake * 2 <= state.rules.maxStake && p.chips > raiseCost,
    raiseCost,
    pack: myTurn,
    show: bet && left === 2,
    showCost: Math.min(cost, p.chips),
    sideshow: bet && to !== null,
    sideshowTo: to,
    reply: live && state.pending?.to === seat,
  };
}

/** Plays one move for a seat. Throws a PattiError if it isn't allowed. */
export function act(state: PattiState, seat: Seat, action: PattiAction): PattiState {
  const o = options(state, seat);
  const s: PattiState = structuredClone(state);
  const p = s.players[seat];
  switch (action.type) {
    case "see": {
      if (!o.see) throw new PattiError("You can't look now");
      p.seen = true;
      s.events.push({ type: "see", seat });
      return s;
    }
    case "pack": {
      if (!o.pack) throw new PattiError("Not your turn");
      p.folded = true;
      s.events.push({ type: "pack", seat, auto: action.auto });
      return advance(s, seat);
    }
    case "chaal":
    case "raise": {
      const raise = action.type === "raise";
      if (raise ? !o.raise : !o.chaal) throw new PattiError(o.mustSee ? "Look at your cards first" : "You can't bet that now");
      const blind = !p.seen;
      const amount = pay(s, seat, chaalCost(s, seat, raise));
      if (raise) s.stake *= 2;
      if (blind) p.blindTurns += 1;
      s.lastBettor = seat;
      s.events.push({ type: "chaal", seat, amount, raise, blind, allIn: p.allIn });
      if (s.pot >= s.rules.potLimit) return finish(s, "potLimit", null);
      return advance(s, seat);
    }
    case "show": {
      if (!o.show) throw new PattiError("A show needs exactly two players left");
      const amount = pay(s, seat, chaalCost(s, seat));
      if (!p.seen) p.blindTurns += 1;
      s.events.push({ type: "show", seat, amount });
      return finish(s, "show", seat);
    }
    case "sideshow": {
      if (!o.sideshow || o.sideshowTo === null) throw new PattiError("No sideshow now");
      const amount = pay(s, seat, chaalCost(s, seat));
      s.lastBettor = seat;
      s.pending = { from: seat, to: o.sideshowTo };
      s.events.push({ type: "sideshowAsk", seat, to: o.sideshowTo, amount });
      if (s.pot >= s.rules.potLimit) {
        s.pending = null;
        return finish(s, "potLimit", null);
      }
      return s;
    }
    case "sideshowReply": {
      if (!o.reply || !s.pending) throw new PattiError("Nobody asked you for a sideshow");
      const { from } = s.pending;
      s.pending = null;
      let loser: Seat | null = null;
      if (action.accept) {
        const c = compareValues(evaluate(s.hands[from]), evaluate(s.hands[seat]));
        loser = c > 0 ? seat : from; // equal hands: the one who asked packs
        s.players[loser].folded = true;
      }
      s.events.push({ type: "sideshowReply", seat, from, accept: action.accept, loser });
      return advance(s, from);
    }
  }
}

/** Passes the turn on from a seat, or ends the deal if betting is over. */
function advance(s: PattiState, from: Seat): PattiState {
  const live = SEATS.filter((x) => inHand(s.players[x]));
  if (live.length === 1) return finish(s, "fold", null);
  let t = next(from);
  for (let i = 0; i < 4 && !canAct(s.players[t]); i++) t = next(t);
  s.turn = t;
  return settleIfStuck(s, from);
}

/** Ends the deal when nobody (or only one player, already level with the all-ins) can still bet. */
function settleIfStuck(s: PattiState, _from: Seat): PattiState {
  const live = SEATS.filter((x) => inHand(s.players[x]));
  if (live.length === 1) return finish(s, "fold", null);
  const actors = live.filter((x) => !s.players[x].allIn);
  if (actors.length === 0) return finish(s, "allIn", null);
  if (actors.length === 1) {
    const a = actors[0];
    const top = Math.max(...live.filter((x) => x !== a).map((x) => s.players[x].put));
    if (s.players[a].put >= top) return finish(s, "allIn", null);
    s.turn = a;
  }
  return s;
}

/**
 * Ends the deal and shares out the pot. Each layer of the pot (up to what each all-in player put in) goes to
 * the best hand among the players still in who paid into it; equal hands split it. `asker` loses ties (show).
 */
function finish(s: PattiState, reason: EndReason, asker: Seat | null): PattiState {
  s.pending = null;
  const live = SEATS.filter((x) => inHand(s.players[x]));
  const values = SEATS.map((x) => (s.hands[x].length === 3 ? evaluate(s.hands[x]) : null));
  const won = [0, 0, 0, 0];
  const pot = s.pot;

  if (live.length === 1) {
    won[live[0]] = pot;
  } else {
    const puts = s.players.map((p) => p.put);
    const levels = [...new Set(live.map((x) => puts[x]))].sort((a, b) => a - b);
    let prev = 0;
    let shared = 0;
    let lastWinners: Seat[] = [];
    for (const level of levels) {
      const layer = puts.reduce((n, put) => n + Math.max(0, Math.min(put, level) - prev), 0);
      const eligible = live.filter((x) => puts[x] >= level);
      const winners = best(eligible, values, asker);
      splitInto(won, winners, layer, s.dealer);
      shared += layer;
      lastWinners = winners;
      prev = level;
    }
    // chips a packed player put in above every live player's total go to the last layer's winners
    if (pot > shared) splitInto(won, lastWinners, pot - shared, s.dealer);
  }

  for (const x of SEATS) s.players[x].chips += won[x];
  const winners = SEATS.filter((x) => won[x] > 0);
  s.pot = 0;
  s.events.push({ type: "end", reason });
  s.result = {
    reason,
    won,
    winners,
    shown: reason === "fold" ? [] : live,
    values,
    pot,
  };
  return s;
}

/** The best hands among some seats; when two tie and one of them asked for the show, the asker drops out. */
function best(seats: Seat[], values: (HandValue | null)[], asker: Seat | null): Seat[] {
  let top: Seat[] = [];
  for (const x of seats) {
    if (!top.length) top = [x];
    else {
      const c = compareValues(values[x]!, values[top[0]]!);
      if (c > 0) top = [x];
      else if (c === 0) top.push(x);
    }
  }
  if (top.length > 1 && asker !== null && top.includes(asker)) top = top.filter((x) => x !== asker);
  return top;
}

/** Splits chips evenly; odd chips go round from the dealer's left. */
function splitInto(won: number[], winners: Seat[], amount: number, dealer: Seat) {
  if (!winners.length || amount <= 0) return;
  const each = Math.floor(amount / winners.length);
  let rest = amount - each * winners.length;
  for (const w of winners) won[w] += each;
  for (let t = next(dealer); rest > 0; t = next(t)) {
    if (winners.includes(t)) {
      won[t] += 1;
      rest -= 1;
    }
  }
}
