/* Plays thousands of G Patta games between computer players and checks the rules hold. */
import { chooseAction } from "../src/lib/gpatta/bot";
import { type Card, type GPattaState, GPattaError, act, findPairs, newGPatta } from "../src/lib/gpatta/engine";
import { gpattaForSeat } from "../src/lib/gpatta/view";

const key = (c: Card) => `${c.r}${c.s}`;
// mulberry32: small, seeded, well mixed
let seed = 12345;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

function check(s: GPattaState, msg: string) {
  const all = [s.out, ...s.deck, ...s.discard, ...s.players.flatMap((p) => p.hand)].map(key);
  if (all.length !== 52 || new Set(all).size !== 52) throw new Error(`${msg}: card conservation broke (${all.length})`);
  for (let i = 0; i < s.discard.length; i += 2) if (s.discard[i].r !== s.discard[i + 1].r) throw new Error(`${msg}: a thrown pair isn't a pair`);
  if (s.phase === "draw" || s.phase === "over")
    s.players.forEach((p, i) => {
      if (findPairs(p.hand).pairs.length) throw new Error(`${msg}: seat ${i} kept a pair`);
      if (p.place !== null && p.hand.length && s.g !== i) throw new Error(`${msg}: safe seat ${i} holds cards`);
    });
  if (s.phase === "draw" && s.players[s.turn].place !== null) throw new Error(`${msg}: turn on a finished player`);
}

const GAMES = 2000;
let games = 0;
const gCount: number[] = [];
let steps = 0;
let maxSteps = 0;
for (let n = 2; n <= 6; n++) {
  gCount[n] = 0;
  for (let g = 0; g < GAMES; g++) {
    let s = newGPatta({ players: n, random });
    check(s, "new");
    s = act(s, 0, { type: "deal" }, random);
    check(s, "deal");
    if (s.players.reduce((a, p) => a + p.hand.length, 0) !== 51) throw new Error("deal lost cards");
    let guard = 0;
    while (s.phase !== "over") {
      if (++guard > 5000) throw new Error(`game didn't end (n=${n})`);
      if (s.phase === "pairs") {
        const seat = s.players.findIndex((p) => !p.ready);
        const h = s.players[seat].hand;
        const i = h.findIndex((c, k) => h.some((d, j) => j !== k && d.r === c.r));
        // seat 0 sometimes throws pairs by hand
        if (seat === 0 && i >= 0 && random() < 0.5) {
          const j = h.findIndex((d, k) => k !== i && d.r === h[i].r);
          s = act(s, 0, { type: "pair", a: i, b: j }, random);
        } else s = act(s, seat, chooseAction(s, seat, random)!, random);
      } else {
        const seat = s.turn;
        // occasionally a timeout instead of a pick
        s = act(s, seat, random() < 0.1 ? { type: "timeout" } : chooseAction(s, seat, random)!, random);
        // the view never leaks someone else's card
        const v = gpattaForSeat(s, 1 % n);
        for (const e of v.events) if (e.t === "draw" && e.card && e.to !== 0 && e.from !== 0) throw new Error("view leaked a drawn card");
        if (v.players.some((p, k) => k !== 0 && p.hand.some((c) => c !== null))) throw new Error("view leaked a hand");
      }
      check(s, `n=${n} step`);
    }
    steps += guard;
    maxSteps = Math.max(maxSteps, guard);
    if (s.g === null) throw new Error("no G");
    const holders = s.players.filter((p) => p.hand.length > 0);
    if (holders.length !== 1 || s.players[s.g].hand.length !== 1) throw new Error("G must be the only one holding exactly one card");
    if (s.players[s.g].hand[0].r !== s.out.r) throw new Error("G's card isn't the rank of the card taken out");
    const places = s.players.map((p) => p.place ?? 0).sort((a, b) => a - b);
    if (places.join() !== Array.from({ length: n }, (_, i) => i + 1).join()) throw new Error(`bad places ${places}`);
    if (s.players[s.g].place !== n) throw new Error("G isn't last");
    if (s.events.at(-1)?.t !== "end") throw new Error("no end event");
    if (s.g === 0) gCount[n]++;
    games++;
  }
}

// moves that must be refused
const mustThrow = (f: () => unknown, why: string) => {
  try {
    f();
  } catch (e) {
    if (e instanceof GPattaError) return;
    throw e;
  }
  throw new Error(`should refuse: ${why}`);
};
let s = newGPatta({ players: 4, random });
mustThrow(() => act(s, 0, { type: "draw", index: 0 }), "draw before deal");
mustThrow(() => newGPatta({ players: 7 }), "7 players");
mustThrow(() => newGPatta({ players: 1 }), "1 player");
s = act(s, 0, { type: "deal" });
mustThrow(() => act(s, 0, { type: "deal" }), "deal twice");
mustThrow(() => act(s, 0, { type: "draw", index: 0 }), "draw during pairs");
const h = s.players[0].hand;
const b = h.findIndex((d) => d.r !== h[0].r);
mustThrow(() => act(s, 0, { type: "pair", a: 0, b }), "non-pair");
mustThrow(() => act(s, 0, { type: "pair", a: 0, b: 0 }), "same card twice");
s = act(s, 0, { type: "throw" });
mustThrow(() => act(s, 0, { type: "throw" }), "throw twice");
for (let i = 1; i < 4; i++) s = act(s, i, { type: "throw" });
if (s.phase === "draw") {
  const other = s.players.findIndex((p, i) => i !== s.turn && p.place === null);
  mustThrow(() => act(s, other, { type: "draw", index: 0 }), "out of turn");
  mustThrow(() => act(s, s.turn, { type: "draw", index: 999 }), "bad index");
}

console.log(`${games} games ok (2-6 players) · avg ${(steps / games).toFixed(1)} steps, max ${maxSteps}`);
console.log("seat 0 was G:", gCount.slice(2).map((c, i) => `${i + 2}p ${((c / GAMES) * 100).toFixed(1)}%`).join(", "));
