/**
 * What one player may see of a Paanch game: their own hand, everyone's card counts, the board and the
 * discards, but not other hands or the order of the deck. Seats are turned so the viewer is always
 * seat 0 (and so always side 0: if they are on side 1, the chip colours are swapped as well).
 */

import type { PaanchEvent, PaanchState, Seat, Team } from "./engine";

/** A card face nobody may see. */
export const HIDDEN = "??";

export type PaanchView = PaanchState & { handCounts: number[]; deckCount: number };

export function paanchForSeat(state: PaanchState, mine: Seat | null): PaanchView {
  const n = state.players;
  const off = mine ?? 0;
  const seat = (s: Seat) => (((s - off) % n) + n) % n as Seat;
  const flip = off % 2 === 1;
  const team = (t: Team): Team => (flip ? ((1 - t) as Team) : t);
  const hands: string[][] = [[], [], [], []];
  const handCounts = [0, 0, 0, 0];
  for (let s = 0; s < n; s++) {
    const to = seat(s as Seat);
    handCounts[to] = state.hands[s].length;
    hands[to] = mine !== null && s === mine ? state.hands[s].slice() : state.hands[s].map(() => HIDDEN);
  }
  const ev = (e: PaanchEvent): PaanchEvent => {
    switch (e.type) {
      case "place":
        return { ...e, seat: seat(e.seat) };
      case "dead":
        return { ...e, seat: seat(e.seat) };
      case "remove":
        return { ...e, seat: seat(e.seat), team: team(e.team) };
      case "line":
        return { ...e, team: team(e.team) };
      case "end":
        return { ...e, winner: e.winner === null ? null : team(e.winner) };
      default:
        return e;
    }
  };
  return {
    ...state,
    chips: state.chips.map((c) => (c === null ? null : team(c))),
    locked: state.locked.slice(),
    lines: state.lines.map((l) => ({ team: team(l.team), cells: l.cells.slice() })),
    hands,
    handCounts,
    deck: state.deck.map(() => HIDDEN),
    deckCount: state.deck.length,
    discard: state.discard.slice(),
    turn: seat(state.turn),
    dealer: seat(state.dealer),
    events: state.events.map(ev),
    last: state.last ? { ...state.last, seat: seat(state.last.seat) } : null,
    result: state.result ? { ...state.result, winner: state.result.winner === null ? null : team(state.result.winner) } : null,
  };
}
