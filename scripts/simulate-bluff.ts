/*
 * Plays thousands of Bluff games between computer players and checks the rules hold:
 * cards are conserved, every game ends with exactly one player alive, nobody gets stuck,
 * and the view hides what it should. Run: npx tsx scripts/simulate-bluff.ts
 */
import { BLUFF_TEMPERS, chooseAction } from "../src/lib/bluff/bot";
import {
  type BluffState,
  BluffError,
  CHAMBERS,
  HAND_SIZE,
  HIDDEN,
  SEATS,
  type Seat,
  act,
  aliveSeats,
  autoAction,
  newBluff,
  nextRound,
  options,
} from "../src/lib/bluff/engine";
import { bluffForSeat } from "../src/lib/bluff/view";

// mulberry32: small, seedable and well mixed
let seed = 12345;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

function fail(msg: string, s: BluffState): never {
  console.error(JSON.stringify(s, null, 1).slice(0, 4000));
  throw new Error(msg);
}

function check(s: BluffState) {
  const alive = aliveSeats(s);
  for (const x of SEATS) {
    if (s.counts[x] !== s.hands[x].length) fail("count mismatch", s);
    if (!s.players[x].alive && s.hands[x].length) fail("dead player holds cards", s);
    if (s.players[x].shots >= CHAMBERS) fail("survived six pulls", s);
  }
  if (s.phase === "play") {
    const total = s.hands.reduce((n, h) => n + h.length, 0) + s.plays.reduce((n, p) => n + p.cards.length, 0);
    if (total !== alive.length * HAND_SIZE) fail(`cards not conserved: ${total}`, s);
    const all = [...s.hands.flat(), ...s.plays.flatMap((p) => p.cards)];
    if (new Set(all).size !== all.length) fail("duplicate card", s);
    if (!s.players[s.turn].alive) fail("dead player on turn", s);
    const o = options(s, s.turn);
    if (!o.canPlay && !o.canCall) fail("stuck: player on turn can neither play nor call", s);
    if (s.mustCall && !o.canCall) fail("must call with nothing to call", s);
  }
  if (s.phase === "over" && (alive.length !== 1 || s.winner !== alive[0])) fail("bad ending", s);
}

function checkView(s: BluffState, mine: Seat) {
  const v = bluffForSeat(s, mine);
  for (let i = 1; i < 4; i++) if (v.hands[i].length) fail("view leaks a hand", s);
  if (v.players.some((p) => p.live !== -1)) fail("view leaks a chamber", s);
  if (v.hands[0].length !== s.hands[mine].length) fail("view lost my hand", s);
  for (const p of v.plays) if (p.seat !== 0 && p.cards.some((c) => c !== HIDDEN)) fail("view leaks a play", s);
  if (v.turn !== (((s.turn - mine) % 4) + 4) % 4) fail("view turn rotation", s);
}

const GAMES = 20000;
let rounds = 0;
let calls = 0;
let truthful = 0;
let forced = 0;
let autos = 0;
const wins = [0, 0, 0, 0];
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  let s = newBluff(undefined, random);
  let guard = 0;
  while (s.phase !== "over") {
    if (++guard > 2000) fail("game never ends", s);
    check(s);
    if (g % 50 === 0) checkView(s, (g % 4) as Seat);
    if (s.phase === "reveal") {
      s = nextRound(s, random);
      rounds++;
      continue;
    }
    const who = s.turn;
    if (s.mustCall) forced++;
    // now and then a player times out
    const a = random() < 0.03 ? (autos++, autoAction(s, who, random)) : chooseAction(s, who, BLUFF_TEMPERS[who], random);
    try {
      s = act(s, who, a);
    } catch (e) {
      if (e instanceof BluffError) fail(`bot made an illegal move: ${e.message} ${JSON.stringify(a)}`, s);
      throw e;
    }
    if (s.reveal && s.events[s.events.length - 1]?.type !== "play") {
      if (a.type === "call") {
        calls++;
        if (s.reveal.truthful) truthful++;
      }
    }
  }
  check(s);
  wins[s.winner!]++;
}

// illegal moves are refused
{
  const s = newBluff(0, random);
  const other = ((s.turn + 1) % 4) as Seat;
  const expectError = (f: () => unknown, what: string) => {
    try {
      f();
    } catch (e) {
      if (e instanceof BluffError) return;
      throw e;
    }
    throw new Error(`should refuse: ${what}`);
  };
  expectError(() => act(s, other, { type: "play", cards: [s.hands[other][0]] }), "out of turn");
  expectError(() => act(s, s.turn, { type: "call" }), "call with no play");
  expectError(() => act(s, s.turn, { type: "play", cards: [] }), "empty play");
  expectError(() => act(s, s.turn, { type: "play", cards: s.hands[s.turn].slice(0, 4) }), "four cards");
  expectError(() => act(s, s.turn, { type: "play", cards: [s.hands[other][0]] }), "someone else's card");
  expectError(() => act(s, s.turn, { type: "play", cards: [s.hands[s.turn][0], s.hands[s.turn][0]] }), "same card twice");
  expectError(() => nextRound(s), "next round mid-round");
}

console.log(
  `ok: ${GAMES} games, ${rounds} rounds, ${calls} calls (${Math.round((truthful / calls) * 100)}% truthful), ${forced} forced calls, ${autos} timeouts, wins by seat ${wins.join("/")}, ${Date.now() - t0}ms`,
);
