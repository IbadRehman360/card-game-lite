import { type GPattaAction, type GPattaState, drawTarget } from "./engine";

/**
 * Computer players: they throw every pair straight away and take a random card (a face-down hand
 * gives nothing to read). A small habit per player makes them lean left, right or middle.
 */
export function chooseAction(state: GPattaState, seat: number, random: () => number = Math.random): GPattaAction | null {
  if (state.phase === "pairs") return state.players[seat].ready ? null : { type: "throw" };
  if (state.phase !== "draw" || state.turn !== seat) return null;
  const from = drawTarget(state, seat);
  if (from === null) return null;
  const count = state.players[from].hand.length;
  const lean = [0.5, 0.25, 0.75, 0.5, 0.35, 0.65][seat % 6];
  // mostly random, with a little lean toward a favourite part of the fan
  const pick = random() < 0.6 ? random() : Math.min(0.999, Math.max(0, lean + (random() - 0.5) * 0.4));
  return { type: "draw", index: Math.min(count - 1, Math.floor(pick * count)) };
}

/** How long a computer player seems to think before acting. */
export function thinkMs(state: GPattaState, random: () => number = Math.random): number {
  if (state.phase === "pairs") return 350 + random() * 450;
  return 650 + random() * 900;
}
