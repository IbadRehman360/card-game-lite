import type { Card, Suit } from "../game/cards";
import type { DealState, GameEvent, GameState, PlayedCard, Seat, Team } from "../game/engine";
import type { SeatView } from "../game/view";

/**
 * An online table seen from one player's chair. The server numbers seats 0–3 round the table; on every
 * phone the table is turned so its own player sits in seat 0 (at the bottom), partner in 2, rivals in 1 and 3.
 * Team 0 is always "us".
 */
export function turnSeat(seat: Seat, mine: Seat): Seat {
  return (((seat - mine) % 4) + 4) % 4 as Seat;
}
const turnTeam = (team: Team, mine: Seat): Team => (mine % 2 ? 1 - team : team) as Team;
const turnPair = <T,>(pair: [T, T], mine: Seat): [T, T] => (mine % 2 ? [pair[1], pair[0]] : [pair[0], pair[1]]);

function turnEvent(e: GameEvent, m: Seat): GameEvent {
  if (e.type === "play") return { ...e, seat: turnSeat(e.seat, m) };
  if (e.type === "trick")
    return {
      ...e,
      winner: turnSeat(e.winner, m),
      cards: e.cards.map((c) => ({ ...c, seat: turnSeat(c.seat, m) })),
      collectedBy: e.collectedBy === null ? null : turnTeam(e.collectedBy, m),
    };
  return { ...e, winnerTeam: e.winnerTeam === null ? null : turnTeam(e.winnerTeam, m) };
}

/**
 * Rebuilds a full game state (other players' hands left empty) from what one seat may see, turned to that
 * seat's point of view, so the same table, rules helpers and turn-clock play as a solo game work on it.
 */
export function gameFromView(v: SeatView): GameState {
  const m = v.mySeat;
  const events = v.events.map((e) => turnEvent(e, m));
  let trick: PlayedCard[] = [];
  let trump: Suit | null = null;
  let trumpSetBy: Seat | null = null;
  let trumpTrick: number | null = null;
  let tricksPlayed = 0;
  let pile = 0;
  let streak: Seat | null = null;
  let lastTrickWinner: Seat | null = null;
  const sars: [number, number] = [0, 0];
  const won: [number, number] = [0, 0];
  const played: Card[] = [];
  for (const e of events) {
    if (e.type === "play") {
      trick.push({ seat: e.seat, card: e.card });
      played.push(e.card);
      if (e.trumpSet) {
        trump = e.trumpSet;
        trumpSetBy = e.seat;
        trumpTrick = tricksPlayed;
      }
    } else if (e.type === "trick") {
      trick = [];
      tricksPlayed += 1;
      lastTrickWinner = e.winner;
      won[e.winner % 2] += 1;
      streak = e.armed ? e.winner : null;
      if (e.collectedBy === null) pile += 1;
      else {
        sars[e.collectedBy] += e.collected;
        pile = 0;
      }
    }
  }
  const deal: DealState = {
    hands: [v.hand.slice(), [], [], []],
    trick,
    opener: turnSeat(v.opener, m),
    turn: turnSeat(v.turn, m),
    trump,
    trumpSetBy,
    trumpTrick,
    sars,
    won,
    pile,
    lastTrickWinner,
    streak,
    tricksPlayed,
    played,
    events,
    result: v.result
      ? {
          ...v.result,
          winnerTeam: v.result.winnerTeam === null ? null : turnTeam(v.result.winnerTeam, m),
          sars: turnPair(v.result.sars, m),
        }
      : null,
  };
  return {
    options: v.options,
    dealNo: v.dealNo,
    dealer: turnSeat(v.dealer, m),
    score: turnPair(v.score, m),
    courts: turnPair(v.courts, m),
    ties: 0,
    seriesWinner: v.seriesWinner === null ? null : turnTeam(v.seriesWinner, m),
    seriesNo: v.seriesNo,
    deal,
  };
}
