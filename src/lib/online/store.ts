import "server-only";
import type { GameOptions, Seat } from "../game/engine";
import type { ChatMessage, RoomEvent, StoredState } from "./types";

export interface RoomRow {
  code: string;
  status: "lobby" | "playing";
  options: GameOptions;
  state: StoredState | null;
  version: number;
}

export interface PlayerRow {
  id: string;
  room_code: string;
  name: string;
  seat: Seat | null;
  is_host: boolean;
  token: string;
  /** The character they picked (lib/characters). */
  avatar?: string;
  /** Their coin wallet (a hash of the phone's wallet token). */
  wallet?: string;
  created_at: number;
}

/** Thrown when a write would put two players in the same seat. */
export class SeatTakenError extends Error {}

/**
 * Where online tables live. For now that is this server's memory, which is all a table on one local
 * network needs (everyone's phone talks to the computer running the game).
 */
export interface RoomStore {
  getRoom(code: string): Promise<RoomRow | null>;
  /** Returns false if the code is already taken. */
  insertRoom(room: Pick<RoomRow, "code" | "options">): Promise<boolean>;
  /** Applies the patch only if the room is still at `expectedVersion`; returns the new version or null. */
  updateRoom(
    code: string,
    expectedVersion: number,
    patch: Partial<Pick<RoomRow, "status" | "options" | "state">>,
  ): Promise<number | null>;
  listPlayers(code: string): Promise<PlayerRow[]>;
  playerByToken(code: string, token: string): Promise<PlayerRow | null>;
  insertPlayer(p: Omit<PlayerRow, "id" | "created_at">): Promise<PlayerRow>;
  updatePlayer(code: string, id: string, patch: Partial<Pick<PlayerRow, "seat" | "is_host">>): Promise<void>;
  deletePlayer(code: string, id: string): Promise<void>;
  /** Tell everyone watching this room that it changed. */
  publish(code: string, version: number): Promise<void>;
  /** Server-side change feed for /events. */
  subscribe(code: string, listener: (event: RoomEvent) => void): Promise<() => void>;
  /** Table chat: keeps the latest messages and pushes each new one down the change feed. */
  addChat(code: string, message: ChatMessage): Promise<void>;
  listChat(code: string): Promise<ChatMessage[]>;
}

/** How many chat messages a table keeps. */
export const CHAT_KEEP = 60;

let store: RoomStore | null = null;

export async function getStore(): Promise<RoomStore> {
  store ??= (await import("./store-memory")).memoryStore;
  return store;
}

/**
 * The memory store only works on one long-running server. On serverless hosts like Vercel each request
 * can land on a different instance, so tables with friends aren't offered there yet.
 */
export function tablesAvailable() {
  return !process.env.VERCEL;
}
