import { type PattiAction, type PattiState, type Seat, SEATS, inHand, options } from "./engine";
import { strength } from "./hands";

/**
 * A computer player's move. It only uses what its seat knows: its own cards (once it has looked), the stake,
 * the pot and what the others have done. Each character has a temper: how long it likes to play blind and how
 * often it bluffs.
 */
export interface Temper {
  /** Chance per turn of staying blind (while the stake is still low). */
  blind: number;
  /** Chance of betting on with a weak hand. */
  bluff: number;
  /** Shifts how strong a hand it wants before betting (negative: bolder). */
  nerve: number;
}

export const TEMPERS: Temper[] = [
  { blind: 0.55, bluff: 0.12, nerve: 0 },
  { blind: 0.7, bluff: 0.2, nerve: -0.05 },
  { blind: 0.35, bluff: 0.06, nerve: 0.05 },
  { blind: 0.5, bluff: 0.15, nerve: -0.02 },
];

export function chooseAction(state: PattiState, seat: Seat, temper: Temper, random: () => number = Math.random): PattiAction {
  const o = options(state, seat);
  const me = state.players[seat];
  const { boot, maxStake } = state.rules;

  if (o.reply) {
    // a sideshow costs nothing to refuse: accept only with a hand that should win it
    const s = strength(state.hands[seat]);
    return { type: "sideshowReply", accept: s > 0.8 - temper.nerve };
  }
  if (!o.myTurn) return { type: "see" };

  const left = SEATS.filter((x) => inHand(state.players[x])).length;
  const pressure = state.stake / maxStake; // 0.06 .. 1
  const potOdds = o.chaalCost / Math.max(1, state.pot + o.chaalCost);

  // ---- blind: keep betting blind for a while, then look ----
  if (!me.seen) {
    const stayBlind =
      !o.mustSee && state.stake <= boot * 4 && me.blindTurns < 3 && random() < temper.blind && me.chips > o.chaalCost * 6;
    if (!stayBlind) return { type: "see" };
    if (o.show && random() < 0.25) return { type: "show" };
    if (o.raise && random() < 0.15) return { type: "raise" };
    return { type: "chaal" };
  }

  // ---- seen: bet by hand strength, the stake and how many are left ----
  const s = strength(state.hands[seat]);
  const need = 0.55 + pressure * 0.3 + (left - 2) * 0.04 + temper.nerve;
  const bluffing = s < need && random() < temper.bluff * (1 - pressure);

  if (s < need && !bluffing) {
    // a medium hand facing several players: try a sideshow before giving up
    if (o.sideshow && s > need - 0.15 && random() < 0.6) return { type: "sideshow" };
    if (potOdds < 0.08 && s > need - 0.1) return { type: "chaal" };
    return { type: "pack" };
  }

  if (o.show) {
    // two left: show once the stakes are up, or straight away with a strong hand against a high stake
    if (s > 0.9 || pressure > 0.4 || (s > need + 0.1 && random() < 0.35)) return { type: "show" };
  }
  if (o.raise && (s > 0.93 || (s > need + 0.2 && random() < 0.35) || (bluffing && random() < 0.3))) {
    return { type: "raise" };
  }
  if (o.sideshow && s < need + 0.08 && random() < 0.3) return { type: "sideshow" };
  return { type: "chaal" };
}

/** Thinking time (ms) before a computer player moves: a bit longer for big decisions. */
export function thinkMs(state: PattiState, random: () => number = Math.random) {
  return 700 + random() * 700 + (state.stake / state.rules.maxStake) * 600;
}
