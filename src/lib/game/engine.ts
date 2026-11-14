import { type Card, type Suit, OPENING_CARD, SUITS, balancedDeal, rankOf, suitOf } from "./cards";
import { type TableGame, seatsFor, specFor } from "./table-games";
import { isGameKind } from "../wallet/economy";

/**
 * Rung / Court Piece, "first void makes trump" variant:
 * - all 13 cards are dealt up front
 * - whoever holds the 2♣ must open with it
 * - follow suit if you can
 * - no trump is called; from the 5th haath on, the first card played off-suit makes its suit trump for
 *   the rest of the deal. Before that, a player who can't follow suit just throws a card away.
 * - finished haaths (tricks) stack up in the middle. Once Rung has been set, a player who wins two
 *   haaths in a row collects the whole stack (a sar). Haaths won before Rung is set, and the haath
 *   in which it is set, never count towards a streak. The stack can't be picked up by a haath won with
 *   an Ace: the player keeps their streak and takes it if they win the next one with another card.
 *   The 13th haath is the exception: a streak can take the stack with it even when it's won with an
 *   Ace. Without a streak, whatever is left in the middle belongs to nobody.
 * - nobody can take the stack before the 5th haath, and nobody can take it on the 12th: a streak that
 *   wins the 12th carries on and can take it on the 13th.
 * - a hand holding 7 or more cards of one suit is a misdeal and the cards are dealt again (the fair
 *   dealer never deals one, so in practice it never happens).
 * - first team whose collected sars hold 7 haaths wins the deal; winning it while the other team
 *   hasn't won a single haath is a Court (worth double). If neither team has 7 after the 13th haath,
 *   the deal is a tie and nobody scores.
 *
 * Seats run anticlockwise 0→1→2→3. Seats 0 & 2 are team 0, seats 1 & 3 are team 1.
 */

export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const SEATS: Seat[] = [0, 1, 2, 3];
export const SARS_TO_WIN = 7;
export const TRICKS_PER_DEAL = 13;
/** Haath index (0-based) from which an off-suit card can set Rung: the 5th haath. */
export const RUNG_FROM_TRICK = 4;
/** Haath index from which the stack can be taken: nobody wins it before the 5th haath. */
export const TAKE_FROM_TRICK = 4;
/** Haath index on which the stack can't be taken: the 12th. A streak carries on to the 13th. */
export const NO_TAKE_TRICK = 11;
/** A hand with this many cards of one suit is a misdeal. */
export const MISDEAL_SUIT_LENGTH = 7;

/** True if any hand holds 7 or more cards of one suit. */
export const isMisdeal = (hands: Card[][]) =>
  hands.some((h) => SUITS.some((s) => h.filter((c) => suitOf(c) === s).length >= MISDEAL_SUIT_LENGTH));

/** Table settings chosen by the host. Which of them a game uses is in lib/game/table-games. */
export interface GameOptions {
  /** Which card game the table plays. */
  game?: TableGame;
  /** Seats at this table (what the game allows: see TABLE_GAMES). */
  players?: number;
  /**
   * Rung: how many matches (deals) the series is played over: a 3-match series is won by the first team
   * to 2 points, a 5-match series by the first to 3. A deal is worth 1 point, a Court 2; ties don't count.
   */
  series?: 3 | 5;
  /** 3 Patti: the boot (10, 50 or 100). */
  boot?: number;
}

export const SERIES_LENGTHS = [3, 5] as const;
export const DEFAULT_OPTIONS: GameOptions = { series: 3 };

/** Points a team needs to win the series. */
export const seriesTarget = (options: GameOptions | undefined) => Math.ceil((options?.series ?? 3) / 2);

/**
 * Settings a table can really be played with: an unknown game becomes Rung, the seat count is forced to
 * one the game supports, and a setting the game doesn't have (a series at 3 Patti, a boot at Rung) is
 * dropped rather than carried around.
 */
export function cleanGameOptions(o: unknown): GameOptions {
  const x = (o ?? {}) as Partial<GameOptions>;
  const game: TableGame = isGameKind(x.game) ? x.game : "rung";
  const out: GameOptions = { game, players: seatsFor(game, x.players) };
  for (const setting of specFor(game).settings) {
    if (setting.key === "series") out.series = x.series === 5 ? 5 : 3;
    if (setting.key === "boot") out.boot = x.boot === 50 || x.boot === 100 ? x.boot : 10;
  }
  return out;
}

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

export type GameEvent =
  | {
      type: "play";
      seat: Seat;
      card: Card;
      trumpSet?: Suit;
      /** Played for them when their time ran out. */
      auto?: boolean;
    }
  | {
      type: "trick";
      winner: Seat;
      cards: PlayedCard[];
      /** Team that took the stack off the table with this trick, if any. */
      collectedBy: Team | null;
      /** Haaths collected (this one plus everything stacked under it). */
      collected: number;
      /** The winner now has one haath towards a streak: win the next and the stack is theirs. */
      armed: boolean;
      /** Won a second haath in a row, but with an Ace, which can't pick up the stack. */
      aceBlocked?: boolean;
      /** Won a second haath in a row on the 12th, where the stack can't be taken: the streak carries on. */
      twelfthBlocked?: boolean;
    }
  | { type: "dealEnd"; winnerTeam: Team | null; court: boolean };

export interface DealResult {
  /** null when neither team reached 7: a tie. */
  winnerTeam: Team | null;
  court: boolean;
  sars: [number, number];
}

export interface DealState {
  hands: Card[][];
  trick: PlayedCard[];
  /** Seat that opened this deal (holder of the 2♣). */
  opener: Seat;
  turn: Seat;
  trump: Suit | null;
  trumpSetBy: Seat | null;
  /** Index of the haath in which Rung was set. */
  trumpTrick: number | null;
  /** Haaths each team has collected. */
  sars: [number, number];
  /** Haaths each team has won, collected or not (a Court means the losers won none). */
  won: [number, number];
  /** Haaths stacked uncollected in the middle. */
  pile: number;
  lastTrickWinner: Seat | null;
  /** Player who won the previous counting haath and can collect by winning the next. */
  streak: Seat | null;
  tricksPlayed: number;
  played: Card[];
  events: GameEvent[];
  result: DealResult | null;
}

export interface GameState {
  options: GameOptions;
  dealNo: number;
  dealer: Seat;
  /** Deals won by each team; a Court counts as two. */
  score: [number, number];
  courts: [number, number];
  /** Deals nobody won. */
  ties: number;
  /** Set once a team has the points to win the series; the next deal starts a new series. */
  seriesWinner?: Team | null;
  /** Which series this is at the table, counting from 1. */
  seriesNo?: number;
  deal: DealState;
}

export const teamOf = (seat: Seat): Team => (seat % 2) as Team;
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat;
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat;

export function newGame(options: GameOptions = DEFAULT_OPTIONS): GameState {
  return {
    options: cleanGameOptions(options),
    seriesWinner: null,
    seriesNo: 1,
    dealNo: 1,
    dealer: 0,
    score: [0, 0],
    courts: [0, 0],
    ties: 0,
    deal: newDeal(),
  };
}

export function newDeal(dealt?: Card[][]): DealState {
  // A misdeal (someone holding 7+ of a suit) is dealt again.
  let hands = dealt ?? balancedDeal();
  for (let i = 0; !dealt && isMisdeal(hands) && i < 50; i++) hands = balancedDeal();
  const opener = hands.findIndex((h) => h.includes(OPENING_CARD)) as Seat;
  return {
    hands,
    trick: [],
    opener,
    turn: opener,
    trump: null,
    trumpSetBy: null,
    trumpTrick: null,
    sars: [0, 0],
    won: [0, 0],
    pile: 0,
    lastTrickWinner: null,
    streak: null,
    tricksPlayed: 0,
    played: [],
    events: [],
    result: null,
  };
}

export function startNextDeal(game: GameState): GameState {
  if (!game.deal.result) throw new GameError("The current deal is still in progress");
  // After a won series, the same table starts the next one from 0–0.
  const fresh =
    game.seriesWinner != null
      ? { score: [0, 0] as [number, number], courts: [0, 0] as [number, number], ties: 0, seriesWinner: null, seriesNo: (game.seriesNo ?? 1) + 1 }
      : {};
  return {
    ...game,
    ...fresh,
    dealNo: game.dealNo + 1,
    dealer: nextSeat(game.dealer),
    deal: newDeal(),
  };
}

export class GameError extends Error {}

export function legalCards(deal: DealState, seat: Seat): Card[] {
  const hand = deal.hands[seat];
  if (deal.result) return [];
  if (deal.trick.length === 0) {
    if (deal.tricksPlayed === 0 && hand.includes(OPENING_CARD)) return [OPENING_CARD];
    return hand.slice();
  }
  const lead = suitOf(deal.trick[0].card);
  const following = hand.filter((c) => suitOf(c) === lead);
  return following.length ? following : hand.slice();
}

/** Does `a` beat `b` given the led suit and trump? */
export function beats(a: Card, b: Card, lead: Suit, trump: Suit | null) {
  const sa = suitOf(a);
  const sb = suitOf(b);
  if (sa === sb) return rankOf(a) > rankOf(b);
  if (trump && sa === trump) return true;
  if (trump && sb === trump) return false;
  return sa === lead && sb !== lead;
}

export function currentWinner(trick: PlayedCard[], trump: Suit | null): PlayedCard | null {
  if (!trick.length) return null;
  const lead = suitOf(trick[0].card);
  return trick.reduce((best, p) => (beats(p.card, best.card, lead, trump) ? p : best));
}

/** Pure: returns a new state with the card played (and the trick / deal resolved if complete). */
export function playCard(game: GameState, seat: Seat, card: Card, { auto = false } = {}): GameState {
  const deal = game.deal;
  if (deal.result) throw new GameError("This deal is over");
  if (deal.turn !== seat) throw new GameError("It is not your turn");
  if (!legalCards(deal, seat).includes(card)) throw new GameError("You can't play that card");

  const d: DealState = structuredClone(deal);
  const g: GameState = { ...game, score: [...game.score], courts: [...game.courts], deal: d };

  d.hands[seat] = d.hands[seat].filter((c) => c !== card);
  const event: GameEvent = { type: "play", seat, card, ...(auto && { auto }) };
  if (
    d.trick.length > 0 &&
    d.trump === null &&
    d.tricksPlayed >= RUNG_FROM_TRICK &&
    suitOf(card) !== suitOf(d.trick[0].card)
  ) {
    d.trump = suitOf(card);
    d.trumpSetBy = seat;
    d.trumpTrick = d.tricksPlayed;
    event.trumpSet = d.trump;
  }
  d.trick.push({ seat, card });
  d.played.push(card);
  d.events.push(event);

  if (d.trick.length < 4) {
    d.turn = nextSeat(seat);
    return g;
  }

  resolveTrick(g);
  return g;
}

function resolveTrick(g: GameState) {
  const d = g.deal;
  const top = currentWinner(d.trick, d.trump)!;
  const winner = top.seat;
  const wonWithAce = top.card[0] === "A";
  const team = teamOf(winner);
  const index = d.tricksPlayed;
  d.tricksPlayed += 1;
  d.pile += 1;
  d.won[team] += 1;

  // Only haaths that start after Rung is set count towards a streak.
  const counts = d.trumpTrick !== null && index > d.trumpTrick;
  const lastTrick = d.tricksPlayed === TRICKS_PER_DEAL;

  let collectedBy: Team | null = null;
  let collected = 0;
  let armed = false;
  let aceBlocked = false;
  let twelfthBlocked = false;
  const canTake = index >= TAKE_FROM_TRICK && index !== NO_TAKE_TRICK;
  if (counts && d.streak === winner && !canTake) {
    // The 12th haath (or anything before the 5th) can't take the stack: the streak carries on.
    twelfthBlocked = index === NO_TAKE_TRICK;
    armed = true;
  } else if (!lastTrick && counts && d.streak === winner && wonWithAce) {
    // An Ace can't pick up the stack: it stays in the middle and the streak carries on.
    aceBlocked = true;
    armed = true;
  } else if (counts && d.streak === winner) {
    collectedBy = team;
    collected = d.pile;
    d.sars[team] += d.pile;
    d.pile = 0;
    d.streak = null;
  } else if (counts) {
    d.streak = winner;
    armed = true;
  } else {
    d.streak = null;
  }

  d.events.push({ type: "trick", winner, cards: d.trick, collectedBy, collected, armed, ...(aceBlocked && { aceBlocked }), ...(twelfthBlocked && { twelfthBlocked }) });
  d.lastTrickWinner = winner;
  d.trick = [];
  d.turn = winner;

  const done = d.sars[0] >= SARS_TO_WIN || d.sars[1] >= SARS_TO_WIN || lastTrick;
  if (done) {
    const winnerTeam: Team | null = d.sars[0] >= SARS_TO_WIN ? 0 : d.sars[1] >= SARS_TO_WIN ? 1 : null;
    const court = winnerTeam !== null && d.won[1 - winnerTeam] === 0;
    d.result = { winnerTeam, court, sars: [d.sars[0], d.sars[1]] };
    d.events.push({ type: "dealEnd", winnerTeam, court });
    if (winnerTeam === null) {
      g.ties = (g.ties ?? 0) + 1;
    } else {
      g.score[winnerTeam] += court ? 2 : 1;
      if (court) g.courts[winnerTeam] += 1;
      if (g.score[winnerTeam] >= seriesTarget(g.options)) g.seriesWinner = winnerTeam;
    }
  }
}
