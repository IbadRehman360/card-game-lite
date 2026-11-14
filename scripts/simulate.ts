// Plays many all-bot deals and checks the rules hold. Run: npx tsx scripts/simulate.ts
import { newGame, startNextDeal, legalCards, playCard, seriesTarget, type GameState } from "../src/lib/game/engine";
import { chooseCard } from "../src/lib/game/bot";
import { replay } from "../src/lib/game/view";
import { SUITS, highCardPoints, suitOf } from "../src/lib/game/cards";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const DEALS = 3000;
let g: GameState = newGame();
let courts = 0, trumpless = 0, collects = 0, lastSweeps = 0, aceBlocks = 0, ties = 0, series = 0;
const t0 = performance.now();
for (let n = 0; n < DEALS; n++) {
  const hands = g.deal.hands;
  check(new Set(hands.flat()).size === 52, "52 distinct cards");
  for (const h of hands) {
    check(h.length === 13, "13 cards each");
    for (const s of SUITS) {
      const k = h.filter((c) => suitOf(c) === s).length;
      check(k >= 2 && k <= 5, "2-5 cards per suit");
    }
    const p = highCardPoints(h);
    check(p >= 8 && p <= 12, "8-12 points per hand");
  }
  const first = g.deal.opener;
  check(hands[first].includes("2C"), "opener holds 2C");
  let moves = 0;
  while (!g.deal.result) {
    const seat = g.deal.turn;
    const card = chooseCard(g, seat);
    check(legalCards(g.deal, seat).includes(card), "bot played legal card");
    if (moves === 0) check(card === "2C", "first card is 2C");
    const before = g.deal.trump;
    const lead = g.deal.trick[0]?.card;
    g = playCard(g, seat, card);
    if (!before && g.deal.trump) check(lead && suitOf(lead) !== suitOf(card), "trump set by off-suit card");
    moves++;
  }
  // Stacking rules: nothing is collected before Rung is set, and the trick that sets it can't start a streak.
  let prevCounting: number | null = null;
  let trickIndex = -1;
  let trumpAt: number | null = null;
  for (const e of g.deal.events) {
    if (e.type === "play" && e.trumpSet) trumpAt = trickIndex + 1;
    if (e.type !== "trick") continue;
    trickIndex++;
    const counts = trumpAt !== null && trickIndex > trumpAt;
    const last = trickIndex === 12;
    const winCard = e.cards.find((c) => c.seat === e.winner)!.card;
    if (e.collectedBy !== null) {
      check(counts && prevCounting === e.winner, "collect only on a second straight counting win, even on the 13th");
      if (!last) check(winCard[0] !== "A", "an Ace never picks up the stack (except the last haath)");
      if (last) lastSweeps++;
      else collects++;
    }
    if (last && counts && prevCounting === e.winner) check(e.collectedBy !== null, "a streak on the 13th takes the stack, Ace or not");
    if (counts && !last && prevCounting === e.winner && winCard[0] === "A") {
      check(e.collectedBy === null && e.aceBlocked && e.armed, "Ace win keeps the stack down and the streak alive");
      aceBlocks++;
    }
    if (!counts) check(e.collectedBy === null, "no collecting before Rung");
    prevCounting = e.armed ? e.winner : null;
  }
  const r = g.deal.result;
  if (r.winnerTeam === null) {
    check(r.sars[0] < 7 && r.sars[1] < 7 && g.deal.tricksPlayed === 13, "a tie only when nobody reached 7 after all 13");
    check(!r.court, "a tie is never a Court");
    ties++;
  } else check(r.sars[r.winnerTeam] >= 7, "winner has 7+");
  const snap = replay(g.deal.events, g.deal.opener, g.deal.events.length);
  check(snap.sars[0] === r.sars[0] && snap.sars[1] === r.sars[1], "replay matches engine");
  check(snap.trump === g.deal.trump, "replay trump matches");
  if (r.court) courts++;
  if (!g.deal.trump) trumpless++;
  // Series: decided the moment a team reaches the target, never before.
  const target = seriesTarget(g.options);
  const leader = g.score[0] >= target ? 0 : g.score[1] >= target ? 1 : null;
  check(g.seriesWinner === leader, "series winner is whoever reached the target");
  if (leader !== null) {
    check(g.score[1 - leader] < target, "only one team reaches the target");
    series++;
  }
  const before = g.seriesNo;
  g = startNextDeal(g);
  if (leader !== null) check(g.score[0] === 0 && g.score[1] === 0 && g.seriesNo === (before ?? 1) + 1, "a new series starts at 0–0");
}
const ms = (performance.now() - t0) / DEALS;
console.log(
  `${DEALS} deals ok (${ms.toFixed(2)} ms each) · score ${g.score} · courts ${courts} · no trump ${trumpless} · streak collects ${collects} · 13th-haath streak takes ${lastSweeps} · Ace blocks ${aceBlocks} · ties ${ties} · series won ${series} (best of ${g.options.series})`,
);
