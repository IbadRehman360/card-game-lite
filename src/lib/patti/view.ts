import type { PattiEvent, PattiState, Seat } from "./engine";

/** Seat `seat` as seen from `mine`'s chair (you are always 0). */
const rot = (seat: Seat, mine: Seat) => ((((seat - mine) % 4) + 4) % 4) as Seat;
/** An array indexed by seat, turned so `mine` comes first. */
const turnArr = <T,>(a: T[], mine: Seat): T[] => a.map((_, i) => a[(i + mine) % 4]);

function turnEvent(e: PattiEvent, m: Seat): PattiEvent {
  switch (e.type) {
    case "boot":
      return { ...e, amounts: turnArr(e.amounts, m) };
    case "end":
      return e;
    case "sideshowAsk":
      return { ...e, seat: rot(e.seat, m), to: rot(e.to, m) };
    case "sideshowReply":
      return { ...e, seat: rot(e.seat, m), from: rot(e.from, m), loser: e.loser === null ? null : rot(e.loser, m) };
    default:
      return { ...e, seat: rot(e.seat, m) };
  }
}

/** Seats whose cards `mine` may see: their own once looked at, everyone shown at the end, a sideshow partner. */
export function visibleTo(state: PattiState, mine: Seat | null): Set<Seat> {
  const v = new Set<Seat>(state.result?.shown ?? []);
  if (mine === null) return v;
  if (state.players[mine].seen || state.result) v.add(mine);
  for (const e of state.events) {
    if (e.type === "sideshowReply" && e.accept && (e.seat === mine || e.from === mine)) {
      v.add(e.seat);
      v.add(e.from);
    }
  }
  return v;
}

/**
 * The table as one player may see it, turned so they sit in seat 0. Cards they may not see come as empty
 * hands. `mine` null: someone watching, from seat 0's chair, seeing only what is shown.
 */
export function pattiForSeat(state: PattiState, mine: Seat | null): PattiState {
  const m = mine ?? 0;
  const vis = visibleTo(state, mine);
  const hands = state.hands.map((h, s) => (vis.has(s as Seat) ? h.slice() : []));
  const r = state.result;
  return {
    ...state,
    dealer: rot(state.dealer, m),
    turn: rot(state.turn, m),
    hands: turnArr(hands, m),
    players: turnArr(state.players, m).map((p) => ({ ...p })),
    pending: state.pending ? { from: rot(state.pending.from, m), to: rot(state.pending.to, m) } : null,
    lastBettor: state.lastBettor === null ? null : rot(state.lastBettor, m),
    events: state.events.map((e) => turnEvent(e, m)),
    result: r
      ? {
          ...r,
          won: turnArr(r.won, m),
          values: turnArr(r.values.map((v, s) => (vis.has(s as Seat) ? v : null)), m),
          winners: r.winners.map((s) => rot(s, m)),
          shown: r.shown.map((s) => rot(s, m)),
        }
      : null,
  };
}
