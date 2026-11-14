/**
 * The computer at a Paanch table. It scores every legal move by the windows of five it builds or breaks:
 * finishing a line beats blocking a four, which beats building its own threes. Two-eyed jacks are kept
 * for when they matter; one-eyed jacks go on the opponent's most dangerous chip. A little noise keeps
 * it from playing the same way every time.
 */

import type { Card } from "../game/cards";
import {
  CELLS,
  type PaanchAction,
  type PaanchState,
  SIZE,
  type Seat,
  type Team,
  isCorner,
  isDead,
  isOneEyed,
  isTwoEyed,
  legalTargets,
  teamOf,
} from "./engine";

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

/** Every window of five squares on the board, and the windows through each square. */
const WINDOWS: number[][] = [];
const THROUGH: number[][][] = Array.from({ length: CELLS }, () => []);
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    for (const [dr, dc] of DIRS) {
      const er = r + 4 * dr;
      const ec = c + 4 * dc;
      if (er < 0 || er >= SIZE || ec < 0 || ec >= SIZE) continue;
      const w = [0, 1, 2, 3, 4].map((k) => (r + k * dr) * SIZE + (c + k * dc));
      WINDOWS.push(w);
      for (const i of w) THROUGH[i].push(w);
    }
  }
}

/** What a window is worth to `team`: how many of its squares are theirs, or -1 if the window is no use to them. */
function count(state: PaanchState, w: number[], team: Team, extra = -1): number {
  let n = 0;
  let lockedMine = 0;
  for (const i of w) {
    if (i === extra || isCorner(i)) n++;
    else if (state.chips[i] === team) {
      n++;
      if (state.locked[i]) lockedMine++;
    } else if (state.chips[i] !== null) return -1;
  }
  // a new line may share only one square with a finished one
  return lockedMine > 1 ? -1 : n;
}

const BUILD = [0, 1, 4, 22, 140, 10000];
const BLOCK = [0, 0, 3, 30, 900, 0];

/** How good putting `team`'s chip on `cell` is: own windows it grows, opponent windows it spoils. */
function placeValue(state: PaanchState, cell: number, team: Team): number {
  const them = (1 - team) as Team;
  let v = 0;
  for (const w of THROUGH[cell]) {
    const mine = count(state, w, team, cell);
    if (mine >= 0) v += BUILD[mine];
    const theirs = count(state, w, them);
    if (theirs >= 0) v += BLOCK[theirs];
  }
  // a little pull towards the middle, where more windows meet
  const r = Math.floor(cell / SIZE);
  const c = cell % SIZE;
  return v + (9 - Math.abs(4.5 - r) - Math.abs(4.5 - c)) * 0.3;
}

/** How much the opponent loses if their chip on `cell` comes off. */
function removeValue(state: PaanchState, cell: number, them: Team): number {
  let v = 0;
  for (const w of THROUGH[cell]) {
    const n = count(state, w, them);
    if (n >= 0) v += [0, 0, 2, 20, 700, 0][n];
  }
  return v;
}

/** What it costs to spend a jack (they are worth keeping for a finish or a block). */
const TWO_EYED_COST = 160;
const ONE_EYED_COST = 260;

export function chooseAction(state: PaanchState, seat: Seat, random: () => number = Math.random): PaanchAction {
  const hand = state.hands[seat];
  const team = teamOf(seat);
  const them = (1 - team) as Team;

  // a dead card is a free swap: do it first
  if (!state.swapped) {
    const dead = hand.find((c) => isDead(state, seat, c));
    if (dead) return { type: "dead", card: dead };
  }

  let best: { action: PaanchAction; score: number } | null = null;
  const consider = (action: PaanchAction, score: number) => {
    const s = score * (0.92 + random() * 0.16) + random() * 2;
    if (!best || s > best.score) best = { action, score: s };
  };

  const seen = new Set<Card>();
  for (const card of hand) {
    if (seen.has(card)) continue;
    seen.add(card);
    const targets = legalTargets(state, seat, card);
    if (isOneEyed(card)) {
      for (const cell of targets) consider({ type: "remove", card, cell }, removeValue(state, cell, them) - ONE_EYED_COST);
    } else if (isTwoEyed(card)) {
      for (const cell of targets) consider({ type: "place", card, cell }, placeValue(state, cell, team) - TWO_EYED_COST);
    } else {
      for (const cell of targets) consider({ type: "place", card, cell }, placeValue(state, cell, team));
    }
  }
  if (best) return (best as { action: PaanchAction }).action;
  // nothing can be played at all: throw away a dead card (ends the turn)
  return { type: "dead", card: hand.find((c) => isDead(state, seat, c)) ?? hand[0] };
}

/** How long the computer takes to move: longer when the board is busy. */
export function thinkMs(state: PaanchState, random: () => number = Math.random): number {
  const filled = state.chips.filter((c) => c !== null).length;
  return Math.round(650 + Math.min(filled, 50) * 9 + random() * 700);
}
