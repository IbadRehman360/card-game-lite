// Plays thousands of 3 Patti deals between computer players and checks the rules hold:
// chips are never created or lost, nobody goes below zero, every deal ends, hand ranks order correctly.
import { TEMPERS, chooseAction } from "../src/lib/patti/bot";
import { type PattiState, type Seat, SEATS, act, newTable, options, rulesFor, seatsWithChips, startDeal } from "../src/lib/patti/engine";
import { compareHands, evaluate } from "../src/lib/patti/hands";

const assert = (ok: unknown, msg: string) => {
  if (!ok) throw new Error(msg);
};

// hand ranking spot checks
assert(compareHands(["AS", "AH", "AD"], ["KS", "QS", "JS"]) > 0, "trail beats pure sequence");
assert(compareHands(["AS", "KS", "QS"], ["AH", "2H", "3H"]) > 0, "A-K-Q beats A-2-3");
assert(compareHands(["AH", "2H", "3H"], ["KS", "QS", "JS"]) > 0, "A-2-3 beats K-Q-J");
assert(evaluate(["KS", "AD", "2C"]).kind === "high", "K-A-2 is not a sequence");
assert(compareHands(["2S", "3D", "4C"], ["AS", "KS", "9S"]) > 0, "sequence beats color");
assert(compareHands(["AS", "KS", "9S"], ["AH", "AD", "KC"]) > 0, "color beats pair");
assert(compareHands(["AH", "AD", "2C"], ["KH", "KD", "AC"]) > 0, "pair of aces beats pair of kings");
assert(compareHands(["KH", "KD", "AC"], ["KS", "KC", "QD"]) > 0, "pair kicker");
assert(compareHands(["AS", "KD", "9C"], ["AH", "KC", "9D"]) === 0, "suits don't break ties");

let deals = 0;
const reasons: Record<string, number> = {};
let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

for (const boot of [1, 10, 50, 100]) {
  for (let game = 0; game < 300; game++) {
    let s: PattiState = newTable(rulesFor(boot));
    const total = () => s.players.reduce((n, p) => n + p.chips, 0) + s.pot;
    const start = total();
    for (let d = 0; d < 40 && seatsWithChips(s).length >= 2; d++) {
      s = startDeal(s, random);
      deals++;
      let steps = 0;
      while (!s.result) {
        assert(++steps < 500, "deal never ended");
        const who: Seat = s.pending ? s.pending.to : s.turn;
        const o = options(s, who);
        assert(o.myTurn || o.reply, `seat ${who} has nothing to do`);
        const a = chooseAction(s, who, TEMPERS[who], random);
        s = act(s, who, a);
        assert(total() === start, `chips changed: ${total()} vs ${start}`);
        assert(s.players.every((p) => p.chips >= 0), "negative chips");
        assert(s.stake <= s.rules.maxStake, "stake over the limit");
      }
      reasons[s.result.reason] = (reasons[s.result.reason] ?? 0) + 1;
      assert(s.result.won.reduce((a, b) => a + b, 0) === s.result.pot, "pot not fully paid out");
      assert(total() === start, "chips changed at the end");
      for (const x of SEATS) assert(!s.players[x].out || s.result.won[x] === 0, "a seat that sat out won");
    }
  }
}
console.log(`ok: ${deals} deals`, reasons);
