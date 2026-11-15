import "server-only";
import { randomUUID } from "node:crypto";
import type { PlayerRow, RoomRow, RoomStore } from "./store";
import { CHAT_KEEP, SeatTakenError, runSweepHook, setSweepHook } from "./store";
import type { ChatMessage, RoomEvent } from "./types";

/**
 * In-process room store for playing on a local network. Everything lives in this server's memory,
 * so tables disappear when the server restarts. Kept on globalThis so dev hot-reloads don't wipe it.
 */

type Listener = (event: RoomEvent) => void;

interface MemoryDb {
  rooms: Map<string, RoomRow & { updatedAt: number }>;
  players: Map<string, PlayerRow>;
  listeners: Map<string, Set<Listener>>;
  chat?: Map<string, ChatMessage[]>;
}

const g = globalThis as unknown as { __lastHaathDb?: MemoryDb };
const db: MemoryDb = (g.__lastHaathDb ??= { rooms: new Map(), players: new Map(), listeners: new Map() });

const chat = (db.chat ??= new Map());

/** Nobody left at the table. */
const EMPTY_MS = 5 * 60 * 1000;
/** Nobody has the table open and nothing has happened for a while. */
const STALE_MS = 3 * 60 * 60 * 1000;
/** However it's going, a table this quiet is forgotten. */
const MAX_IDLE_MS = 24 * 60 * 60 * 1000;
const clone = <T>(v: T): T => structuredClone(v);

export { setSweepHook };

function sweepStale() {
  const now = Date.now();
  const occupied = new Set<string>();
  for (const p of db.players.values()) occupied.add(p.room_code);
  for (const [code, room] of db.rooms) {
    const idle = now - room.updatedAt;
    const watched = Boolean(db.listeners.get(code)?.size);
    const gone = !occupied.has(code) ? idle > EMPTY_MS : (!watched && idle > STALE_MS) || idle > MAX_IDLE_MS;
    if (gone) {
      void runSweepHook(room, [...db.players.values()].filter((p) => p.room_code === code));
      db.rooms.delete(code);
      chat.delete(code);
      for (const [id, p] of db.players) if (p.room_code === code) db.players.delete(id);
    }
  }
}

// Sweep every few minutes too, not only when a table is made, so memory and the 900 table codes come
// back even on a quiet server. (Once per process: hot reloads keep the first timer.)
const gs = globalThis as unknown as { __lastHaathSweep?: boolean };
if (!gs.__lastHaathSweep) {
  gs.__lastHaathSweep = true;
  const timer = setInterval(() => sweepStale(), 5 * 60 * 1000);
  (timer as { unref?: () => void }).unref?.();
}

function seatClash(p: PlayerRow) {
  if (p.seat === null) return false;
  for (const other of db.players.values()) {
    if (other.id !== p.id && other.room_code === p.room_code && other.seat === p.seat) return true;
  }
  return false;
}

export const memoryStore: RoomStore = {
  async addChat(code, message) {
    chat.set(code, [...(chat.get(code) ?? []), message].slice(-CHAT_KEEP));
    db.listeners.get(code)?.forEach((l) => l({ type: "chat", message }));
  },

  async listChat(code) {
    return clone(chat.get(code) ?? []);
  },

  async getRoom(code) {
    const r = db.rooms.get(code);
    if (!r) return null;
    const { updatedAt: _ignored, ...row } = r;
    void _ignored;
    return clone(row);
  },

  async insertRoom({ code, options, quick }) {
    sweepStale();
    if (db.rooms.has(code)) return false;
    db.rooms.set(code, {
      code,
      options: clone(options),
      status: "lobby",
      state: null,
      version: 0,
      updatedAt: Date.now(),
      ...(quick ? { quick: clone(quick) } : {}),
    });
    return true;
  },

  async findQuickRooms(key) {
    const out: RoomRow[] = [];
    for (const r of db.rooms.values()) {
      if (r.status !== "lobby" || r.quick?.key !== key) continue;
      const { updatedAt: _ignored, ...row } = r;
      void _ignored;
      out.push(clone(row));
    }
    return out.sort((a, b) => (a.quick?.openedAt ?? 0) - (b.quick?.openedAt ?? 0)).slice(0, 10);
  },

  async seePlayer(_code, id) {
    const p = db.players.get(id);
    if (p) p.last_seen = Date.now();
  },

  async updateRoom(code, expectedVersion, patch) {
    const r = db.rooms.get(code);
    if (!r || r.version !== expectedVersion) return null;
    Object.assign(r, clone(patch), { version: r.version + 1, updatedAt: Date.now() });
    return r.version;
  },

  async listPlayers(code) {
    return [...db.players.values()]
      .filter((p) => p.room_code === code)
      .sort((a, b) => a.created_at - b.created_at)
      .map(clone);
  },

  async playerByToken(code, token) {
    for (const p of db.players.values()) if (p.room_code === code && p.token === token) return clone(p);
    return null;
  },

  async insertPlayer(p) {
    const row: PlayerRow = { ...p, id: randomUUID(), created_at: Date.now() + db.players.size / 1e6, last_seen: Date.now() };
    if (seatClash(row)) throw new SeatTakenError();
    db.players.set(row.id, row);
    return clone(row);
  },

  async updatePlayer(_code, id, patch) {
    const p = db.players.get(id);
    if (!p) return;
    const next = { ...p, ...patch };
    if (seatClash(next)) throw new SeatTakenError();
    db.players.set(id, next);
  },

  async deletePlayer(_code, id) {
    db.players.delete(id);
  },

  async publish(code, version) {
    db.listeners.get(code)?.forEach((l) => l({ type: "update", version }));
  },

  async subscribe(code, listener) {
    return subscribe(code, listener);
  },
};

/** Server-Sent Events subscription used by /api/rooms/[code]/events. */
export function subscribe(code: string, listener: Listener) {
  let set = db.listeners.get(code);
  if (!set) db.listeners.set(code, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (!set!.size) db.listeners.delete(code);
  };
}
