import type { GameOptions, GameState, Seat } from "../game/engine";
import type { SeatView } from "../game/view";
import type { PattiState } from "../patti/engine";
import type { BluffState } from "../bluff/engine";
import type { PaanchState } from "../paanch/engine";
import type { PaanchView } from "../paanch/view";
import type { BhabhiState } from "../bhabhi/engine";
import type { BhabhiView } from "../bhabhi/view";
import type { GPattaState } from "../gpatta/engine";
import type { GPattaView } from "../gpatta/view";

/**
 * Seats at an online table run 0 … options.players − 1 (up to MAX_SEATS). Rung's `Seat` is 0–3; the
 * bigger tables (Bhabhi, G Patta) reuse it as a plain seat number.
 */

export interface SeatEntry {
  seat: Seat;
  name: string;
  isBot: boolean;
  playerId: string | null;
  avatar?: string;
  /** Set (server time, ms) when the player left mid-game; a computer takes the seat after AWAY_SECONDS. */
  awaySince?: number | null;
  /** 3 Patti: how many times this player bought chips at the table (caps what they can cash out). */
  buyIns?: number;
  /** Quick match: sitting here without having paid the fee (couldn't afford it), so it pays nothing out either. */
  free?: boolean;
  /** Quick match: a computer filling a seat, which plays at a person's pace and now and then says something. */
  lifelike?: boolean;
  /**
   * The player's phone went quiet and the server has been moving for them (closed app, reload, no
   * signal). The seat is still theirs; they get short turns until their phone says it's back.
   */
  dropped?: boolean;
}

/** A quick-match table while it fills up (stored with the room until the game starts). */
export interface QuickMeta {
  /** The game and seat count it matches people for, e.g. "rung:4". */
  key: string;
  openedAt: number;
  /**
   * When each seat nobody takes gets filled, one after another (server ms), with who fills it. A person
   * who joins takes the place of the last of these, so the table never fills slower than this.
   */
  arrivals: { at: number; name: string; avatar: string }[];
}

/** The search screen of a quick-match table: who has sat down so far. */
export interface MatchView {
  game: string;
  /** One entry per seat; null while the seat is still empty. */
  seats: ({ name: string; avatar: string; isMe: boolean } | null)[];
  /** Milliseconds until the game starts, once everyone is there (null: still filling). */
  startsIn: number | null;
}

/** The four games that aren't Rung or 3 Patti, with the state the server keeps for them. */
export type ExtraStored =
  | { game: "bluff"; state: BluffState }
  | { game: "paanch"; state: PaanchState }
  | { game: "bhabhi"; state: BhabhiState }
  | { game: "gpatta"; state: GPattaState };

export type ExtraGame = ExtraStored["game"];

/** The same four games as one player may see them (their own cards only), turned so they sit in seat 0. */
export type ExtraSeen =
  | { game: "bluff"; state: BluffState }
  | { game: "paanch"; state: PaanchView }
  | { game: "bhabhi"; state: BhabhiView }
  | { game: "gpatta"; state: GPattaView };

export interface StoredState {
  /** Rung (a placeholder at a table playing anything else). */
  game: GameState;
  /** 3 Patti, at a 3 Patti table. */
  patti?: PattiState;
  /** Bluff, Paanch, Bhabhi or G Patta, at a table playing one of them. */
  extra?: ExtraStored;
  seats: SeatEntry[];
  /** Server time (ms) after which anyone at the table may have a card played for the player on turn. */
  deadline?: number | null;
  /** Unique per game, so coin charges and payouts are made exactly once. */
  gameId?: string;
  /** A quick-match table (people matched by the server, empty seats filled for them). */
  quick?: boolean;
}

/** What the live stream (/events) sends. */
export interface ChatMessage {
  id: string;
  at: number;
  playerId: string;
  name: string;
  /** Seat at the table when it was sent (null for someone watching or waiting). */
  seat: Seat | null;
  text?: string;
  sticker?: string;
}

/** What the live stream (/events) sends. */
export type RoomEvent = { type: "update"; version: number } | { type: "chat"; message: ChatMessage };

export interface LobbySeat {
  seat: Seat;
  playerId: string | null;
  name: string | null;
  isHost: boolean;
  isMe: boolean;
  avatar: string | null;
}

/** Everyone at the table, by server seat number (seats run 0 … options.players − 1). */
export interface TablePlayer {
  seat: number;
  name: string;
  isBot: boolean;
  avatar: string;
  awayAt: number | null;
}

/** The same, at a table of four, where every seat is one of Rung's. */
export type FourSeatPlayer = TablePlayer & { seat: Seat };

export interface RoomView {
  code: string;
  status: "lobby" | "playing";
  version: number;
  options: GameOptions;
  me: { playerId: string; name: string; seat: Seat | null; isHost: boolean };
  /** One entry per seat at this table (options.players of them). */
  lobby: LobbySeat[];
  spectators: number;
  /** Joined but not in a seat (more people than seats, or moved out by the host). */
  waiting: { playerId: string; name: string; isMe: boolean; avatar: string }[];
  game: SeatView | null;
  /** A 3 Patti table, turned so this player sits in seat 0, with only the cards they may see. */
  patti: PattiView | null;
  /** A Bluff, Paanch, Bhabhi or G Patta table, the same way. */
  extra: ExtraView | null;
  /** True when the game is running and this player has no seat (watching only). */
  spectating: boolean;
  /** Milliseconds (from when this view was made) until the player on turn can be timed out. */
  turnDeadlineIn: number | null;
  /** A quick-match table. */
  quick: boolean;
  /** A quick-match table still filling up: what the search screen shows. */
  match: MatchView | null;
  /**
   * The game at this table has been played to its end (a Rung match won, or a Bluff, Paanch, Bhabhi or
   * G Patta game over). A phone that left it no longer offers to go back to it. 3 Patti deals on and on.
   */
  finished?: boolean;
  /** The server has been moving for this player (their phone went quiet); the phone answers with action "back". */
  dropped?: boolean;
}

export interface JoinResponse {
  code: string;
  token: string;
}

export interface PattiView {
  state: PattiState;
  /** This player's seat number at the server (null: watching). */
  mySeat: Seat | null;
  /** Every seat, by server seat number. */
  players: FourSeatPlayer[];
}

/**
 * One of the four extra games at an online table. `game` says which, and narrows `state` to that game's
 * view type. Moves go back through POST /api/rooms/:code as `{ action: "extraMove", move }`.
 */
export type ExtraView = ExtraSeen & {
  /** This player's seat number at the server (null: watching). */
  mySeat: Seat | null;
  /** Every seat, by server seat number. */
  players: TablePlayer[];
};
