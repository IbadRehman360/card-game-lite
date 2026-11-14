import { type BluffAction, type BluffState, MAX_PLAY, type Seat, isJoker, matches, options } from "./engine";

/** How a computer player leans: how readily it bluffs, and how readily it calls. */
export interface BluffTemper {
  bold: number;
  suspicious: number;
}

export const BLUFF_TEMPERS: BluffTemper[] = [
  { bold: 0.5, suspicious: 0.5 },
  { bold: 0.35, suspicious: 0.65 },
  { bold: 0.7, suspicious: 0.4 },
  { bold: 0.5, suspicious: 0.55 },
];

/** Cards that can be the table card: six of the rank and the two Jokers. */
const MATCHING_IN_DECK = 8;

/**
 * How likely the last play is a lie, seen from `seat`: only its own hand and its own plays are known.
 * Players lay real table cards when they have them, so a claim is likelier true than a random draw.
 */
export function lieChance(state: BluffState, seat: Seat): number {
  const last = state.plays[state.plays.length - 1];
  if (!last) return 0;
  const mine = state.hands[seat].filter((c) => matches(c, state.tableCard)).length;
  const minePlayed = state.plays
    .filter((p) => p.seat === seat)
    .reduce((n, p) => n + p.cards.filter((c) => matches(c, state.tableCard)).length, 0);
  // what other players' claims before this one already used up (assume most were honest)
  const othersBefore = state.plays
    .slice(0, -1)
    .filter((p) => p.seat !== seat)
    .reduce((n, p) => n + p.cards.length, 0);
  const avail = MATCHING_IN_DECK - mine - minePlayed - othersBefore * 0.6;
  const c = last.cards.length;
  if (avail < c - 0.01) return 0.97;
  // cards the claimer could have held: the rest of the deal outside my own hand and plays
  const dealt = state.counts.reduce((a, b) => a + b, 0) + state.plays.reduce((n, p) => n + p.cards.length, 0);
  const unknown = Math.max(1, dealt - state.hands[seat].length - state.plays.filter((p) => p.seat === seat).reduce((n, p) => n + p.cards.length, 0));
  const perCard = Math.min(0.93, (Math.max(0, avail) / unknown) * 2.1);
  let lie = 1 - perCard ** c;
  // emptying a hand is a common time to dump junk
  if (state.counts[last.seat] === 0) lie += 0.12;
  if (c === MAX_PLAY) lie += 0.05;
  return Math.max(0, Math.min(0.97, lie));
}

export function chooseAction(state: BluffState, seat: Seat, temper: BluffTemper, random: () => number = Math.random): BluffAction {
  const o = options(state, seat);
  if (!o.myTurn) return { type: "call" };
  if (o.mustCall || !o.canPlay) return { type: "call" };

  const hand = state.hands[seat];
  const good = hand.filter((c) => matches(c, state.tableCard));
  const bad = hand.filter((c) => !matches(c, state.tableCard));

  if (o.canCall) {
    const lie = lieChance(state, seat);
    // with nothing honest to lay, calling is more tempting
    const need = 0.62 - temper.suspicious * 0.25 - (good.length === 0 ? 0.12 : 0) + (random() - 0.5) * 0.16;
    if (lie > need) return { type: "call" };
  }

  if (good.length > 0) {
    // keep Jokers back when real cards will do
    const real = good.filter((c) => !isJoker(c));
    const jokers = good.filter(isJoker);
    const pool = [...real, ...jokers];
    let n = Math.min(MAX_PLAY, pool.length, 1 + Math.floor(random() * Math.min(MAX_PLAY, pool.length)));
    // nearly out: lay what's honest and keep going
    if (hand.length <= MAX_PLAY && bad.length === 0) n = hand.length;
    const cards = pool.slice(0, n);
    // a bold player slips one junk card in with real ones
    if (bad.length > 0 && cards.length < MAX_PLAY && random() < temper.bold * 0.25) cards.push(bad[0]);
    return { type: "play", cards };
  }

  // a bluff: usually one card, sometimes two
  const n = Math.min(bad.length, random() < temper.bold * 0.45 ? 2 : 1);
  const pick = [...bad].sort(() => random() - 0.5).slice(0, Math.max(1, n));
  return { type: "play", cards: pick };
}

/** How long a computer seems to think (ms). */
export function thinkMs(state: BluffState, random: () => number = Math.random): number {
  const opening = state.events.length <= 2 ? 1400 : 0;
  return opening + 900 + Math.floor(random() * 1300);
}
