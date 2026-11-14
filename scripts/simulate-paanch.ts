/**
 * Plays thousands of Paanch games between computer players and checks the rules hold the whole way:
 *   npx tsx scripts/simulate-paanch.ts [games]
 */

import {
  BOARD,
  CELLS,
  LINES_TO_WIN,
  MOVE_LIMIT,
  PaanchError,
  type PaanchState,
  SIZE,
  type Seat,
  SQUARES_OF,
  act,
  autoMove,
  isCorner,
  legalTargets,
  lineCount,
  newPaanch,
  paanchDeck,
  teamOf,
} from "../src/lib/paanch/engine";
import { chooseAction, thinkMs } from "../src/lib/paanch/bot";
import { HIDDEN, paanchForSeat } from "../src/lib/paanch/view";

const GAMES = Number(process.argv[2]) || 2000;

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

let failures = 0;
function check(ok: unknown, msg: string) {
  if (!ok) {
    failures++;
    if (failures < 20) console.error("FAIL:", msg);
  }
}

// ── the board ──
check(BOARD.length === CELLS, "board has 100 squares");
check([0, 9, 90, 99].every((i) => BOARD[i] === null), "corners are free");
const faces = BOARD.filter(Boolean) as string[];
check(faces.length === 96, "96 card squares");
check(!faces.some((c) => c[0] === "J"), "no jacks on the board");
check(Object.values(SQUARES_OF).every((s) => s.length === 2), "every card twice");
check(Object.keys(SQUARES_OF).length === 48, "48 different cards");
const far = Object.values(SQUARES_OF).every(([a, b]) => Math.max(Math.abs((a % SIZE) - (b % SIZE)), Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE))) >= 4);
check(far, "each card's copies are at least 4 apart");

const sorted = (a: string[]) => a.slice().sort().join(",");
const FULL = sorted(paanchDeck());

function straight(cells: number[]) {
  const rc = cells.map((i) => [Math.floor(i / SIZE), i % SIZE]);
  const dr = rc[1][0] - rc[0][0];
  const dc = rc[1][1] - rc[0][1];
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) return false;
  return rc.every(([r, c], k) => r === rc[0][0] + k * dr && c === rc[0][1] + k * dc);
}

function invariants(s: PaanchState, tag: string) {
  const all = [...s.hands.flat(), ...s.deck, ...s.discard];
  check(all.length === 104 && sorted(all) === FULL, `${tag}: all 104 cards accounted for`);
  for (let i = 0; i < CELLS; i++) {
    if (isCorner(i)) check(s.chips[i] === null, `${tag}: corner ${i} has no chip`);
    if (s.locked[i]) check(s.chips[i] !== null || isCorner(i), `${tag}: locked square ${i} keeps its chip`);
  }
  for (const l of s.lines) {
    check(l.cells.length === 5 && straight(l.cells), `${tag}: line is five in a row`);
    check(l.cells.every((i) => isCorner(i) || s.chips[i] === l.team), `${tag}: line squares are the side's`);
  }
  for (const t of [0, 1] as const) {
    const ls = s.lines.filter((l) => l.team === t);
    for (let a = 0; a < ls.length; a++)
      for (let b = a + 1; b < ls.length; b++)
        check(ls[a].cells.filter((x) => ls[b].cells.includes(x)).length <= 1, `${tag}: a side's lines share at most one square`);
  }
  const n = s.players === 2 ? 7 : 6;
  for (let p = 0; p < s.players; p++) check(s.hands[p].length <= n, `${tag}: hand size`);
}

const stats = { 2: { wins: [0, 0], draws: 0, moves: 0, games: 0, auto: 0, dead: 0, removes: 0, reshuffles: 0 }, 4: { wins: [0, 0], draws: 0, moves: 0, games: 0, auto: 0, dead: 0, removes: 0, reshuffles: 0 } };
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  const players = (g % 2 === 0 ? 2 : 4) as 2 | 4;
  const rnd = seeded(g + 1);
  let s = newPaanch({ players, dealer: (g % players) as Seat, random: rnd });
  invariants(s, `g${g} start`);
  const st = stats[players];
  st.games++;
  let steps = 0;
  while (!s.result) {
    if (++steps > MOVE_LIMIT * 4) {
      check(false, `g${g}: game never ended`);
      break;
    }
    const seat = s.turn;
    const before = s;
    // sometimes the clock runs out and a random move is made
    const timedOut = rnd() < 0.05;
    const action = timedOut ? autoMove(s, seat, rnd) : chooseAction(s, seat, rnd);
    if (timedOut) st.auto++;
    check(thinkMs(s, rnd) > 0, "thinkMs positive");
    try {
      s = act(s, seat, action, rnd);
    } catch (e) {
      check(false, `g${g}: ${timedOut ? "auto" : "bot"} move threw ${(e as Error).message} ${JSON.stringify(action)}`);
      break;
    }
    if (action.type === "place") {
      check(before.chips[action.cell] === null && !isCorner(action.cell), `g${g}: placed on a free square`);
      check(action.card === "JD" || action.card === "JC" || BOARD[action.cell] === action.card, `g${g}: placement matches the card`);
      check(s.chips[action.cell] === teamOf(seat), `g${g}: chip is the mover's`);
    } else if (action.type === "remove") {
      st.removes++;
      check(!before.locked[action.cell], `g${g}: never removes a chip in a finished line`);
      check(before.chips[action.cell] === 1 - teamOf(seat), `g${g}: removes an opponent chip`);
      check(s.chips[action.cell] === null, `g${g}: chip removed`);
    } else {
      st.dead++;
      check(legalTargets(before, seat, action.card).length === 0, `g${g}: swapped card was dead`);
    }
    for (let i = 0; i < CELLS; i++) if (before.locked[i]) check(s.locked[i] && s.chips[i] === before.chips[i], `g${g}: finished lines stay`);
    if (s.events.some((e) => e.type === "reshuffle") && !before.events.some((e) => e.type === "reshuffle")) st.reshuffles++;
    invariants(s, `g${g} move ${s.moveNo}`);
  }
  if (s.result) {
    st.moves += s.moveNo;
    if (s.result.winner === null) st.draws++;
    else {
      st.wins[s.result.winner]++;
      check(lineCount(s, s.result.winner) >= LINES_TO_WIN, `g${g}: winner has two lines`);
    }
  }
  // the view hides what it should, from every seat
  if (g % 50 === 0) {
    for (let me = 0; me < players; me++) {
      const v = paanchForSeat(s, me as Seat);
      check(v.hands[0].join() === s.hands[me].join(), "view: my own hand");
      check(v.hands.slice(1).flat().every((c) => c === HIDDEN), "view: other hands hidden");
      check(v.deck.every((c) => c === HIDDEN) && v.deckCount === s.deck.length, "view: deck hidden");
      check(v.chips.filter((c) => c === 0).length === s.chips.filter((c) => c === teamOf(me as Seat)).length, "view: my chips are side 0");
    }
  }
}

// ── illegal moves are refused ──
{
  const s = newPaanch({ players: 2, random: seeded(99) });
  const seat = s.turn;
  const other = (1 - seat) as Seat;
  const refuses = (f: () => unknown, msg: string) => {
    try {
      f();
      check(false, `should refuse: ${msg}`);
    } catch (e) {
      check(e instanceof PaanchError, `refusal is a PaanchError: ${msg}`);
    }
  };
  const card = s.hands[seat].find((c) => c[0] !== "J")!;
  refuses(() => act(s, other, { type: "place", card: s.hands[other][0], cell: 1 }), "out of turn");
  refuses(() => act(s, seat, { type: "place", card, cell: 0 }), "a corner");
  refuses(() => act(s, seat, { type: "place", card, cell: BOARD.findIndex((c) => c && c !== card) }), "wrong square");
  refuses(() => act(s, seat, { type: "place", card: "ZZ", cell: 5 }), "card not held");
  refuses(() => act(s, seat, { type: "dead", card }), "swapping a live card");
  refuses(() => act(s, seat, { type: "remove", card, cell: 5 }), "removing without a jack");
  refuses(() => act(s, seat, { type: "place", card, cell: 1000 }), "off the board");
}

const ms = Date.now() - t0;
for (const p of [2, 4] as const) {
  const st = stats[p];
  console.log(
    `${p} players: ${st.games} games, side 0 won ${st.wins[0]}, side 1 won ${st.wins[1]}, draws ${st.draws}, ` +
      `avg ${(st.moves / Math.max(1, st.games)).toFixed(1)} moves, ${st.removes} chips taken, ${st.dead} dead swaps, ${st.auto} timed-out moves, ${st.reshuffles} reshuffles`,
  );
}
console.log(`${GAMES} games in ${ms} ms`);
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("All checks passed.");
