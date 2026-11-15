import "server-only";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PlayerRow, RoomRow, RoomStore } from "./store";
import { CHAT_KEEP, SeatTakenError, StoreUnavailableError, runSweepHook } from "./store";
import { supabaseAdmin } from "./supabase";
import type { ChatMessage } from "./types";

/**
 * Room store on Supabase Postgres, for hosts where one server's memory can't hold a table (Vercel).
 * Same behaviour as the memory store: versioned writes, a table is forgotten after a while, chat keeps
 * the latest CHAT_KEEP messages. Realtime *broadcast* is only a nudge: clients re-fetch their own view.
 */

/** Nobody left at the table. */
const EMPTY_MS = 5 * 60 * 1000;
/** Nothing has happened for a while. (Unlike the memory store we can't see who has the table open.) */
const STALE_MS = 3 * 60 * 60 * 1000;
/** However it's going, a table this quiet is forgotten. */
const MAX_IDLE_MS = 24 * 60 * 60 * 1000;
/** Sweep at most this often per server instance. */
const SWEEP_EVERY_MS = 60 * 1000;

const UNIQUE = "23505";
const sb = () => supabaseAdmin();

function fail(what: string, error: { message: string; code?: string } | null): never {
  console.error(`[baazi] supabase ${what} failed`, error?.message);
  // a check the database makes that this code expects to be gone (e.g. seats 4 and 5 before the quick-match migration)
  if (error?.code === CHECK_FAILED) throw new StoreUnavailableError(NEEDS_MIGRATION);
  throw new StoreUnavailableError("Tables are unavailable right now, try again in a moment");
}

const CHECK_FAILED = "23514";
const UNDEFINED_COLUMN = "42703";
const NEEDS_MIGRATION = "Tables need a database update (run the latest Supabase migration)";

/**
 * The quick-match columns (rooms.quick, rooms.quick_key) come with a later migration. A database that
 * hasn't had it still runs hosted tables: rooms are read without those columns, and only quick match is
 * refused. (null: not known yet; found out on the first read.)
 */
let quickColumns: boolean | null = null;
let quickMissingAt = 0;
const ROOM_COLUMNS = "code, status, options, state, version";
const roomColumns = () => {
  // look again now and then, so running the migration needs no restart
  if (quickColumns === false && Date.now() - quickMissingAt > 60_000) quickColumns = null;
  return quickColumns === false ? ROOM_COLUMNS : `${ROOM_COLUMNS}, quick`;
};
const quickOff = () => roomColumns() === ROOM_COLUMNS;
const missingQuick = (e: { code?: string; message: string }) => e.code === UNDEFINED_COLUMN || /column .*quick.* does not exist/i.test(e.message);
function noQuickColumns() {
  if (quickColumns !== false) {
    console.warn("[baazi] rooms.quick is missing: hosted tables work, quick match is off until supabase/migrations/20261115000000_quick_match.sql is run");
  }
  quickColumns = false;
  quickMissingAt = Date.now();
}

interface PlayerDb {
  id: string;
  room_code: string;
  name: string;
  seat: number | null;
  is_host: boolean;
  token: string;
  avatar: string | null;
  wallet: string | null;
  created_at: string;
  last_seen?: string | null;
}

const toPlayer = (r: PlayerDb): PlayerRow => ({
  id: r.id,
  room_code: r.room_code,
  name: r.name,
  seat: r.seat as PlayerRow["seat"],
  is_host: r.is_host,
  token: r.token,
  ...(r.avatar ? { avatar: r.avatar } : {}),
  ...(r.wallet ? { wallet: r.wallet } : {}),
  created_at: Date.parse(r.created_at),
  ...(r.last_seen ? { last_seen: Date.parse(r.last_seen) } : {}),
});

const isSeatClash = (e: { code?: string; message: string }) => e.code === UNIQUE && e.message.includes("room_seat");

let lastSweep = 0;

async function sweepStale() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  const { data: rooms, error } = await sb()
    .from("rooms")
    .select("*")
    .lt("updated_at", new Date(now - EMPTY_MS).toISOString())
    .limit(200);
  if (error || !rooms?.length) return;
  const codes = rooms.map((r) => r.code as string);
  const { data: players } = await sb().from("room_players").select("*").in("room_code", codes);
  const byRoom = new Map<string, PlayerRow[]>();
  for (const p of (players ?? []) as PlayerDb[]) byRoom.set(p.room_code, [...(byRoom.get(p.room_code) ?? []), toPlayer(p)]);
  const gone: string[] = [];
  for (const r of rooms) {
    const idle = now - Date.parse(r.updated_at);
    const occupants = byRoom.get(r.code) ?? [];
    if (idle > MAX_IDLE_MS || (occupants.length ? idle > STALE_MS : idle > EMPTY_MS)) {
      const room: RoomRow = { code: r.code, status: r.status, options: r.options, state: r.state, version: r.version };
      await runSweepHook(room, occupants);
      gone.push(r.code);
    }
  }
  if (gone.length) await sb().from("rooms").delete().in("code", gone); // players and chat go with it (on delete cascade)
}

export const supabaseStore: RoomStore = {
  async getRoom(code) {
    const read = () => sb().from("rooms").select(roomColumns()).eq("code", code).maybeSingle();
    let { data, error } = await read();
    if (error && quickColumns !== false && missingQuick(error)) {
      noQuickColumns();
      ({ data, error } = await read());
    }
    if (error) fail("getRoom", error);
    if (quickColumns === null) quickColumns = true;
    return (data as unknown as RoomRow | null) ?? null;
  },

  async insertRoom({ code, options, quick }) {
    await sweepStale().catch((e) => console.error("[baazi] sweep failed", e));
    if (quick && quickOff()) throw new StoreUnavailableError(NEEDS_MIGRATION);
    const { error } = await sb()
      .from("rooms")
      .insert({ code, options, status: "lobby", state: null, version: 0, ...(quick ? { quick, quick_key: quick.key } : {}) });
    if (!error) return true;
    if (error.code === UNIQUE) return false;
    if (quick && missingQuick(error)) {
      noQuickColumns();
      throw new StoreUnavailableError(NEEDS_MIGRATION);
    }
    fail("insertRoom", error);
  },

  async findQuickRooms(key) {
    if (quickOff()) throw new StoreUnavailableError(NEEDS_MIGRATION);
    const { data, error } = await sb()
      .from("rooms")
      .select("code, status, options, state, version, quick")
      .eq("quick_key", key)
      .eq("status", "lobby")
      .order("created_at", { ascending: true })
      .limit(10);
    if (error && missingQuick(error)) {
      noQuickColumns();
      throw new StoreUnavailableError(NEEDS_MIGRATION);
    }
    if (error) fail("findQuickRooms", error);
    return (data ?? []) as RoomRow[];
  },

  async seePlayer(code, id) {
    const { error } = await sb().from("room_players").update({ last_seen: new Date().toISOString() }).eq("room_code", code).eq("id", id);
    if (error) fail("seePlayer", error);
  },

  async updateRoom(code, expectedVersion, patch) {
    const { data, error } = await sb()
      .from("rooms")
      .update({ ...patch, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq("code", code)
      .eq("version", expectedVersion)
      .select("version");
    if (error) fail("updateRoom", error);
    return data?.length ? (data[0].version as number) : null;
  },

  async listPlayers(code) {
    const { data, error } = await sb()
      .from("room_players")
      .select("*")
      .eq("room_code", code)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail("listPlayers", error);
    return ((data ?? []) as PlayerDb[]).map(toPlayer);
  },

  async playerByToken(code, token) {
    const { data, error } = await sb().from("room_players").select("*").eq("room_code", code).eq("token", token).maybeSingle();
    if (error) fail("playerByToken", error);
    return data ? toPlayer(data as PlayerDb) : null;
  },

  async insertPlayer(p) {
    const { data, error } = await sb()
      .from("room_players")
      .insert({
        room_code: p.room_code,
        name: p.name,
        seat: p.seat,
        is_host: p.is_host,
        token: p.token,
        avatar: p.avatar ?? null,
        wallet: p.wallet ?? null,
      })
      .select("*")
      .single();
    if (error) {
      if (isSeatClash(error)) throw new SeatTakenError();
      fail("insertPlayer", error);
    }
    return toPlayer(data as PlayerDb);
  },

  async updatePlayer(code, id, patch) {
    const { error } = await sb().from("room_players").update(patch).eq("room_code", code).eq("id", id);
    if (error) {
      if (isSeatClash(error)) throw new SeatTakenError();
      fail("updatePlayer", error);
    }
  },

  async deletePlayer(code, id) {
    const { error } = await sb().from("room_players").delete().eq("room_code", code).eq("id", id);
    if (error) fail("deletePlayer", error);
  },

  async publish(code, version) {
    await broadcast(code, "update", { version });
  },

  async subscribe(code, listener) {
    const channel = sb()
      .channel(`room:${code}`)
      .on("broadcast", { event: "update" }, ({ payload }) => listener({ type: "update", version: Number(payload?.version) }))
      .on("broadcast", { event: "chat" }, ({ payload }) => listener({ type: "chat", message: payload as ChatMessage }));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    return () => void sb().removeChannel(channel);
  },

  async addChat(code, message) {
    const { error } = await sb().from("room_chat").insert({ id: message.id, room_code: code, at: message.at, message });
    if (error) fail("addChat", error);
    // keep only the latest CHAT_KEEP
    const { data: old } = await sb()
      .from("room_chat")
      .select("id")
      .eq("room_code", code)
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .range(CHAT_KEEP, CHAT_KEEP + 200);
    if (old?.length) {
      await sb()
        .from("room_chat")
        .delete()
        .eq("room_code", code)
        .in("id", old.map((r) => r.id as string));
    }
    await broadcast(code, "chat", message);
  },

  async listChat(code) {
    const { data, error } = await sb()
      .from("room_chat")
      .select("message")
      .eq("room_code", code)
      .order("at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHAT_KEEP);
    if (error) fail("listChat", error);
    return ((data ?? []) as { message: ChatMessage }[]).map((r) => r.message).reverse();
  },
};

/** One-shot broadcast over Realtime's REST endpoint (no socket needed from a serverless function). */
async function broadcast(code: string, event: string, payload: unknown) {
  let channel: RealtimeChannel | null = null;
  try {
    channel = sb().channel(`room:${code}`);
    await channel.httpSend(event, payload as Record<string, unknown>);
  } catch (e) {
    // The change is saved; clients also re-fetch on reconnect, so a missed nudge only delays them.
    console.error("[baazi] broadcast failed", e);
  } finally {
    if (channel) void sb().removeChannel(channel);
  }
}
