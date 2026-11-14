/* Bhabhi Thulla: thousands of computer games, checking the rules hold. Run: npx tsx scripts/simulate-bhabhi.ts */
import { suitOf } from "../src/lib/game/cards";
import { type BhabhiState, BhabhiError, act, cardCount, legalPlays, newBhabhi } from "../src/lib/bhabhi/engine";
import { TEMPERS, chooseAction } from "../src/lib/bhabhi/bot";
import { bhabhiForSeat } from "../src/lib/bhabhi/view";

let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

function fail(msg: string, s: BhabhiState): never {
  console.error("FAIL:", msg);
  console.error(JSON.stringify({ trick: s.trick, hands: s.hands, place: s.place, turn: s.turn }, null, 1));
  process.exit(1);
}

const GAMES = 6000;
const loserCount: Record<number, number[]> = {};
let tricks = 0;
let thullas = 0;
let longest = 0;

for (let g = 0; g < GAMES; g++) {
  const n = 3 + (g % 4);
  let s = newBhabhi({ players: n, random: rand });
  if (cardCount(s) !== 52) fail("deal isn't 52 cards", s);
  if (!s.hands[s.turn!].includes("AS")) fail("A♠ holder doesn't lead", s);

  // an illegal lead must be refused
  if (s.hands[s.turn!].length > 1) {
    const wrong = s.hands[s.turn!].find((c) => c !== "AS")!;
    try {
      act(s, s.turn!, { type: "play", card: wrong });
      fail("first lead other than A♠ accepted", s);
    } catch (e) {
      if (!(e instanceof BhabhiError)) throw e;
    }
  }

  let steps = 0;
  while (s.bhabhi === null) {
    if (++steps > 5000) fail("game didn't end", s);
    const seat = s.turn!;
    if (s.place[seat] !== null) fail("escaped player has the turn", s);
    const legal = legalPlays(s, seat);
    if (!legal.length) fail("no legal play for the player on turn", s);
    // follow-suit legality: if you hold the suit led, only that suit is legal
    if (s.trick.plays.length) {
      const has = s.hands[seat].some((c) => suitOf(c) === s.trick.suit);
      if (has && legal.some((c) => suitOf(c) !== s.trick.suit)) fail("off-suit allowed while holding the suit", s);
    }
    // a player who isn't on turn can't play
    const other = (seat + 1) % n;
    if (s.hands[other].length) {
      try {
        act(s, other, { type: "play", card: s.hands[other][0] });
        fail("out-of-turn play accepted", s);
      } catch (e) {
        if (!(e instanceof BhabhiError)) throw e;
      }
    }
    const a = chooseAction(s, seat, TEMPERS[seat], rand);
    if (!legal.includes(a.card)) fail("bot chose an illegal card", s);
    const before = s.seq;
    s = act(s, seat, a);
    for (const e of s.events) if (e.id > before && e.type === "thulla") thullas++;
    for (const e of s.events) if (e.id > before && (e.type === "cleared" || e.type === "pickup")) tricks++;
    if (cardCount(s) !== 52) fail(`cards not conserved: ${cardCount(s)}`, s);
    // nobody escaped holding cards
    s.place.forEach((p, i) => {
      if (p !== null && i !== s.bhabhi && s.hands[i].length) fail("escaped with cards", s);
    });
    // the view hides other hands and keeps counts
    if (steps % 37 === 0 && s.turn !== null) {
      const v = bhabhiForSeat(s, s.turn);
      if (v.hand.length !== s.hands[s.turn].length || v.counts[0] !== s.hands[s.turn].length) fail("view broken", s);
      if (v.turn !== 0) fail("view not rotated", s);
    }
  }
  longest = Math.max(longest, steps);
  // exactly one loser, everyone placed once
  const places = s.place.slice().sort((a, b) => a! - b!);
  if (places.some((p, i) => p !== i + 1)) fail(`places wrong: ${s.place}`, s);
  if (s.place[s.bhabhi] !== n) fail("Bhabhi isn't last", s);
  if (s.order.length !== n - 1) fail("escape order length wrong", s);
  (loserCount[n] ??= Array(n).fill(0))[s.bhabhi]++;
  try {
    act(s, 0, { type: "play", card: "AS" });
    fail("play after the end accepted", s);
  } catch (e) {
    if (!(e instanceof BhabhiError)) throw e;
  }
}

console.log(`${GAMES} games OK · ${tricks} tricks · ${thullas} thullas · longest ${longest} plays`);
for (const [n, c] of Object.entries(loserCount)) console.log(`  ${n} players, Bhabhi by seat: ${c.join(" ")}`);
