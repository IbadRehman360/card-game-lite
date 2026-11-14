import type { Card, Suit } from "./cards";
import {
  type DealResult,
  type GameEvent,
  type GameOptions,
  type GameState,
  type PlayedCard,
  type Seat,
  type Team,
  legalCards,
  nextSeat,
  teamOf,
} from "./engine";

export interface PlayerInfo {
  seat: Seat;
  name: string;
  isBot: boolean;
  /** The character they play as (lib/characters). */
  avatar?: string;
  /** Online: when (server ms) they dropped out; a computer takes the seat soon after. */
  awayAt?: number | null;
}

/**
 * What one seat is allowed to see. Other players' hands are reduced to counts; the deal's
 * public event log lets the client replay and animate everything that happened.
 */
export interface SeatView {
  mySeat: Seat;
  players: PlayerInfo[];
  hand: Card[];
  legal: Card[];
  events: GameEvent[];
  opener: Seat;
  turn: Seat;
  result: DealResult | null;
  score: [number, number];
  courts: [number, number];
  dealNo: number;
  dealer: Seat;
  options: GameOptions;
  /** The team that has won the series (shown on the result of its last deal). */
  seriesWinner: Team | null;
  seriesNo: number;
}

export function seatView(game: GameState, seat: Seat, players: PlayerInfo[]): SeatView {
  const d = game.deal;
  return {
    mySeat: seat,
    players,
    hand: d.hands[seat].slice(),
    legal: d.turn === seat ? legalCards(d, seat) : [],
    events: d.events,
    opener: d.opener,
    turn: d.turn,
    result: d.result,
    score: game.score,
    courts: game.courts,
    dealNo: game.dealNo,
    dealer: game.dealer,
    options: game.options,
    seriesWinner: game.seriesWinner ?? null,
    seriesNo: game.seriesNo ?? 1,
  };
}

/** The public table as it looked after the first `upTo` events of the deal. */
export interface TableSnapshot {
  trick: PlayedCard[];
  /** Set while a finished trick is still on the table, waiting to be swept. */
  trickWinner: Seat | null;
  collectedBy: Team | null;
  sars: [number, number];
  /** Haaths stacked in the middle (including a just-finished one that is staying there). */
  pile: number;
  /** Size of the stack the last trick swept to a team (0 if it stayed in the middle). */
  swept: number;
  /** Player who can collect the stack by winning the next haath. */
  streak: Seat | null;
  trump: Suit | null;
  trumpSetBy: Seat | null;
  turn: Seat;
  cardsLeft: [number, number, number, number];
  dealOver: boolean;
  lastEvent: GameEvent | null;
}

export function replay(events: GameEvent[], opener: Seat, upTo: number): TableSnapshot {
  const s: TableSnapshot = {
    trick: [],
    trickWinner: null,
    collectedBy: null,
    sars: [0, 0],
    pile: 0,
    swept: 0,
    streak: null,
    trump: null,
    trumpSetBy: null,
    turn: opener,
    cardsLeft: [13, 13, 13, 13],
    dealOver: false,
    lastEvent: null,
  };
  for (const e of events.slice(0, upTo)) {
    if (e.type === "play") {
      if (s.trickWinner !== null) {
        s.trick = [];
        s.trickWinner = null;
        s.collectedBy = null;
        s.swept = 0;
      }
      s.trick.push({ seat: e.seat, card: e.card });
      s.cardsLeft[e.seat] -= 1;
      if (e.trumpSet) {
        s.trump = e.trumpSet;
        s.trumpSetBy = e.seat;
      }
      s.turn = nextSeat(e.seat);
    } else if (e.type === "trick") {
      s.trickWinner = e.winner;
      s.collectedBy = e.collectedBy;
      s.streak = e.armed ? e.winner : null;
      if (e.collectedBy === null) {
        s.pile += 1;
        s.swept = 0;
      } else {
        s.sars[e.collectedBy] += e.collected;
        s.swept = e.collected;
        s.pile = 0;
      }
      s.turn = e.winner;
    } else {
      s.dealOver = true;
    }
    s.lastEvent = e;
  }
  return s;
}

export { teamOf };
