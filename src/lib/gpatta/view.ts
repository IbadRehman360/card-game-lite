import type { Card, GPattaEvent, GPattaState } from "./engine";

/**
 * What one player may see: their own hand, everyone's card counts, the card taken out (it was shown
 * to everyone) and the thrown pairs. Seats are turned so `mine` is seat 0. Spectators (mine = null)
 * see no hands.
 */
export interface GPattaView extends Omit<GPattaState, "players" | "deck" | "events"> {
  players: { hand: (Card | null)[]; count: number; ready: boolean; place: number | null }[];
  deckCount: number;
  events: GPattaEvent[];
}

export function gpattaForSeat(state: GPattaState, mine: number | null): GPattaView {
  const n = state.n;
  const shift = mine ?? 0;
  const rot = (seat: number) => (seat - shift + n) % n;
  const players = state.players.map((_, k) => {
    const real = (k + shift) % n;
    const p = state.players[real];
    const own = mine !== null && real === mine;
    return { hand: own ? p.hand.slice() : p.hand.map(() => null), count: p.hand.length, ready: p.ready, place: p.place };
  });
  const events = state.events.map((e): GPattaEvent => {
    switch (e.t) {
      case "deal":
        return { ...e, first: rot(e.first), counts: players.map((p) => p.count) };
      case "pairs":
        return { ...e, seat: rot(e.seat) };
      case "draw": {
        // the card is seen only by whoever took it and whoever gave it
        const sees = mine !== null && (e.to === mine || e.from === mine);
        return { ...e, from: rot(e.from), to: rot(e.to), card: sees ? e.card : null };
      }
      case "safe":
        return { ...e, seat: rot(e.seat) };
      case "end":
        return { ...e, g: e.g < 0 ? e.g : rot(e.g) };
      default:
        return e;
    }
  });
  return {
    n,
    phase: state.phase,
    players,
    out: state.out,
    deckCount: state.deck.length,
    discard: state.discard.slice(),
    first: rot(state.first),
    turn: rot(state.turn),
    nextPlace: state.nextPlace,
    g: state.g === null ? null : rot(state.g),
    events,
    seq: state.seq,
  };
}
