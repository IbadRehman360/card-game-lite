import type { GameOptions, GameState, Seat } from "../game/engine";
import type { SeatView } from "../game/view";
import type { PattiState } from "../patti/engine";

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
}

export interface StoredState {
  /** Rung (a placeholder at a 3 Patti table). */
  game: GameState;
  /** 3 Patti, at a 3 Patti table. */
  patti?: PattiState;
  seats: SeatEntry[];
  /** Server time (ms) after which anyone at the table may have a card played for the player on turn. */
  deadline?: number | null;
  /** Unique per game, so coin charges and payouts are made exactly once. */
  gameId?: string;
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

export interface RoomView {
  code: string;
  status: "lobby" | "playing";
  version: number;
  options: GameOptions;
  me: { playerId: string; name: string; seat: Seat | null; isHost: boolean };
  lobby: LobbySeat[];
  spectators: number;
  /** Joined but not in a seat (more than four people, or moved out by the host). */
  waiting: { playerId: string; name: string; isMe: boolean; avatar: string }[];
  game: SeatView | null;
  /** A 3 Patti table, turned so this player sits in seat 0, with only the cards they may see. */
  patti: PattiView | null;
  /** True when the game is running and this player has no seat (watching only). */
  spectating: boolean;
  /** Milliseconds (from when this view was made) until the player on turn can be timed out. */
  turnDeadlineIn: number | null;
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
  players: { seat: Seat; name: string; isBot: boolean; avatar: string; awayAt: number | null }[];
}
