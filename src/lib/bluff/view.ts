import { type BluffEvent, type BluffState, HIDDEN, type Seat } from "./engine";

const rot = (seat: Seat, mine: Seat) => ((((seat - mine) % 4) + 4) % 4) as Seat;
function turn<T>(arr: T[], mine: Seat): T[] {
  return arr.map((_, i) => arr[(i + mine) % 4]);
}

/**
 * A Bluff table as one player may see it, turned so that player sits in seat 0: other hands and face-down
 * plays are hidden (only how many cards there are), and nobody learns which pull holds a live round.
 * `mine` null: a spectator, seen from seat 0 with every hand hidden.
 */
export function bluffForSeat(state: BluffState, mine: Seat | null): BluffState {
  const m: Seat = mine ?? 0;
  const r = (s: Seat) => rot(s, m);
  const hide = (cards: string[]) => cards.map(() => HIDDEN);
  const event = (e: BluffEvent): BluffEvent => {
    switch (e.type) {
      case "roundStart":
        return { ...e, starter: r(e.starter) };
      case "deal":
        return { ...e, counts: turn(e.counts, m) };
      case "play":
      case "shot":
      case "eliminated":
        return { ...e, seat: r(e.seat) };
      case "reveal":
        return { ...e, seat: r(e.seat) };
      case "call":
        return { ...e, by: r(e.by), on: r(e.on) };
      case "end":
        return { ...e, winner: r(e.winner) };
    }
  };
  return {
    ...state,
    dealer: r(state.dealer),
    hands: turn(state.hands, m).map((h, i) => (i === 0 && mine !== null ? [...h] : [])),
    counts: turn(state.counts, m),
    players: turn(state.players, m).map((p) => ({ ...p, live: -1 })),
    turn: r(state.turn),
    plays: state.plays.map((p) => ({ seat: r(p.seat), cards: p.seat === mine ? [...p.cards] : hide(p.cards) })),
    reveal: state.reveal
      ? { ...state.reveal, seat: r(state.reveal.seat), caller: r(state.reveal.caller), loser: r(state.reveal.loser) }
      : null,
    nextStarter: state.nextStarter === null ? null : r(state.nextStarter),
    winner: state.winner === null ? null : r(state.winner),
    events: state.events.map(event),
  };
}
