import type { Card } from "@/lib/game/cards";
import type { BhabhiEvent, BhabhiState, LastTrick, Seat, Trick } from "./engine";

/**
 * What one seat may see: its own hand, everyone's card counts, the table. Seats are turned so the
 * viewer is seat 0 (watchers, mine = null, see it from seat 0 with no hand).
 */
export interface BhabhiView extends Omit<BhabhiState, "hands"> {
  /** Your cards (empty for a watcher). */
  hand: Card[];
  /** How many cards each seat holds. */
  counts: number[];
  /** Original seat of the viewer (null for a watcher). */
  mine: Seat | null;
}

export function bhabhiForSeat(s: BhabhiState, mine: Seat | null): BhabhiView {
  const n = s.players;
  const base = mine ?? 0;
  const r = (x: Seat) => (x - base + n) % n;
  const rot = <T>(arr: T[]): T[] => arr.map((_, i) => arr[(i + base) % n]);
  const trick = (t: Trick): Trick => ({ ...t, leader: r(t.leader), plays: t.plays.map((p) => ({ ...p, seat: r(p.seat) })) });
  const last = (l: LastTrick | null): LastTrick | null =>
    l && { ...l, to: r(l.to), thulla: l.thulla === null ? null : r(l.thulla), plays: l.plays.map((p) => ({ ...p, seat: r(p.seat) })) };
  const event = (e: BhabhiEvent): BhabhiEvent => {
    switch (e.type) {
      case "deal":
        return { ...e, counts: rot(e.counts) };
      case "play":
        return { ...e, seat: r(e.seat) };
      case "thulla":
        return { ...e, seat: r(e.seat), on: r(e.on) };
      case "cleared":
        return { ...e, leader: r(e.leader) };
      case "pickup":
        // others only learn how many cards were picked up, which they saw anyway (they were on the table)
        return { ...e, to: r(e.to) };
      case "escape":
        return { ...e, seat: r(e.seat) };
      case "end":
        return { ...e, bhabhi: r(e.bhabhi) };
    }
  };
  return {
    players: n,
    hand: mine === null ? [] : s.hands[mine].slice(),
    counts: rot(s.hands.map((h) => h.length)),
    mine,
    trick: trick(s.trick),
    turn: s.turn === null ? null : r(s.turn),
    place: rot(s.place),
    order: s.order.map(r),
    discarded: s.discarded,
    trickNo: s.trickNo,
    voids: rot(s.voids),
    lastTrick: last(s.lastTrick),
    events: s.events.map(event),
    seq: s.seq,
    bhabhi: s.bhabhi === null ? null : r(s.bhabhi),
  };
}
