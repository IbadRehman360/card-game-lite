import type { ChatMessage, RoomView } from "@/lib/online/types";

/**
 * What the phones at a nearby table say to each other over the data channel. The host phone holds the
 * game; every guest sends it moves and gets back its own view of the table (only the cards it may see).
 *
 * Every message carries the protocol version, so a phone running an older copy of the app is told to
 * update instead of misreading the table. Big messages are split into parts, because some browsers
 * refuse data-channel messages over 64 KB.
 */
export const PROTOCOL = 1;

export type GuestMsg =
  | { t: "hello"; v: number; guestId: string; name: string; avatar?: string }
  | { t: "act"; v: number; id: string; action: string; extra?: Record<string, unknown> }
  | { t: "chat"; v: number; id: string; text?: string; sticker?: string }
  | { t: "pong"; v: number; at: number }
  | { t: "bye"; v: number };

export type HostMsg =
  | { t: "welcome"; v: number; playerId: string; chat: ChatMessage[] }
  | { t: "view"; v: number; view: RoomView }
  | { t: "chat"; v: number; message: ChatMessage }
  /** The answer to an act or chat with this id: done, or why not. */
  | { t: "done"; v: number; id: string; error?: string }
  | { t: "ping"; v: number; at: number }
  | { t: "bye"; v: number; reason: string };

type Part = { t: "part"; v: number; id: string; i: number; n: number; d: string };

/** Data-channel messages are kept under this many characters. */
export const PART_SIZE = 15_000;

const str = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Checks a message from a guest. Anything malformed comes back null and is ignored. */
export function parseGuest(raw: unknown): GuestMsg | { t: "old"; v: number } | null {
  if (!isObj(raw) || typeof raw.v !== "number") return null;
  if (raw.v !== PROTOCOL) return { t: "old", v: raw.v };
  switch (raw.t) {
    case "hello":
      if (!str(raw.guestId, 64) || !raw.guestId || !str(raw.name, 40)) return null;
      return { t: "hello", v: PROTOCOL, guestId: raw.guestId, name: raw.name, avatar: str(raw.avatar, 24) ? raw.avatar : undefined };
    case "act":
      if (!str(raw.id, 40) || !str(raw.action, 24)) return null;
      return { t: "act", v: PROTOCOL, id: raw.id, action: raw.action, extra: isObj(raw.extra) ? raw.extra : undefined };
    case "chat":
      if (!str(raw.id, 40)) return null;
      return {
        t: "chat",
        v: PROTOCOL,
        id: raw.id,
        text: str(raw.text, 400) ? raw.text : undefined,
        sticker: str(raw.sticker, 24) ? raw.sticker : undefined,
      };
    case "pong":
      return { t: "pong", v: PROTOCOL, at: typeof raw.at === "number" ? raw.at : 0 };
    case "bye":
      return { t: "bye", v: PROTOCOL };
    default:
      return null;
  }
}

/** Checks a message from the host (the guest trusts the host for the game itself). */
export function parseHost(raw: unknown): HostMsg | { t: "old"; v: number } | null {
  if (!isObj(raw) || typeof raw.v !== "number") return null;
  if (raw.v !== PROTOCOL) return { t: "old", v: raw.v };
  switch (raw.t) {
    case "welcome":
      return str(raw.playerId, 64) && Array.isArray(raw.chat) ? (raw as HostMsg) : null;
    case "view":
      return isObj(raw.view) && typeof raw.view.version === "number" ? (raw as HostMsg) : null;
    case "chat":
      return isObj(raw.message) ? (raw as HostMsg) : null;
    case "done":
      return str(raw.id, 40) ? (raw as HostMsg) : null;
    case "ping":
      return typeof raw.at === "number" ? (raw as HostMsg) : null;
    case "bye":
      return { t: "bye", v: PROTOCOL, reason: str(raw.reason, 200) ? raw.reason : "The table closed" };
    default:
      return null;
  }
}

let partCounter = 0;

/** A message as one or more strings to send, in order, on an ordered channel. */
export function frame(msg: GuestMsg | HostMsg): string[] {
  const s = JSON.stringify(msg);
  if (s.length <= PART_SIZE) return [s];
  const id = `${Date.now().toString(36)}${(partCounter++).toString(36)}`;
  const n = Math.ceil(s.length / PART_SIZE);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const part: Part = { t: "part", v: PROTOCOL, id, i, n, d: s.slice(i * PART_SIZE, (i + 1) * PART_SIZE) };
    out.push(JSON.stringify(part));
  }
  return out;
}

/** Puts split messages back together. Feed it every string received; it returns whole messages (parsed JSON). */
export class Reassembler {
  private parts = new Map<string, { n: number; got: string[]; count: number; at: number }>();

  push(data: unknown): unknown | null {
    if (typeof data !== "string" || data.length > PART_SIZE + 400) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return null;
    }
    if (!isObj(raw) || raw.t !== "part") return raw;
    const { id, i, n, d } = raw as Part;
    if (!str(id, 40) || typeof i !== "number" || typeof n !== "number" || typeof d !== "string") return null;
    if (n < 1 || n > 64 || i < 0 || i >= n || !Number.isInteger(i)) return null;
    const now = Date.now();
    // forget half-received messages after a while
    for (const [k, p] of this.parts) if (now - p.at > 30_000) this.parts.delete(k);
    let p = this.parts.get(id);
    if (!p) {
      if (this.parts.size > 8) return null;
      p = { n, got: new Array<string>(n), count: 0, at: now };
      this.parts.set(id, p);
    }
    if (p.n !== n || p.got[i] !== undefined) return null;
    p.got[i] = d;
    p.count++;
    if (p.count < n) return null;
    this.parts.delete(id);
    try {
      return JSON.parse(p.got.join(""));
    } catch {
      return null;
    }
  }
}

/** The pipe between two phones: a data channel, or (in tests and for the host's own seat) memory. */
export interface Channel {
  send(data: string): void;
  close(): void;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
}

/** Two channels joined end to end, for tests. */
export function memoryPair(): [Channel, Channel] {
  const make = (): Channel & { peer?: Channel; open: boolean } => ({
    open: true,
    onmessage: null,
    onclose: null,
    send(data: string) {
      if (!this.open) return;
      const peer = this.peer as (Channel & { open: boolean }) | undefined;
      queueMicrotask(() => {
        if (peer?.open) peer.onmessage?.(data);
      });
    },
    close() {
      if (!this.open) return;
      this.open = false;
      const peer = this.peer as (Channel & { open: boolean }) | undefined;
      queueMicrotask(() => {
        this.onclose?.();
        if (peer?.open) {
          peer.open = false;
          peer.onclose?.();
        }
      });
    },
  });
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

/** Seconds between the host's pings; a phone silent for SILENT_MS is treated as gone. */
export const PING_MS = 2000;
export const SILENT_MS = 9000;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
