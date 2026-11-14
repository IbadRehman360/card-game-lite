import type { ChatMessage, RoomView } from "@/lib/online/types";
import type { GameOptions } from "@/lib/game/engine";
import { NearbyError, NearbyHost, type HostClock } from "./host";
import {
  type Channel,
  type GuestMsg,
  type HostMsg,
  PING_MS,
  PROTOCOL,
  Reassembler,
  SILENT_MS,
  frame,
  newId,
  parseGuest,
  parseHost,
} from "./protocol";

/** A chat message, marked when it arrived live (so it pops up at the table). */
export type NearbyChat = ChatMessage & { live?: boolean };

export interface NearbySnapshot {
  room: RoomView | null;
  chat: NearbyChat[];
  /** Connected to the table right now. */
  live: boolean;
  /** Set when this phone is no longer at the table, and why. */
  ended: string | null;
}

/**
 * One phone's place at a nearby table, as the screens use it. The host's phone runs the table itself
 * (HostSession); a guest's phone talks to it over a channel (GuestSession). Both look the same to the
 * lobby and game screens.
 */
export interface NearbyClient {
  readonly role: "host" | "guest";
  subscribe(fn: () => void): () => void;
  snapshot(): NearbySnapshot;
  /** A move or lobby action; rejects with a message the player can read. */
  act(action: string, extra?: Record<string, unknown>): Promise<void>;
  sendChat(msg: { text?: string; sticker?: string }): Promise<void>;
  leave(): void;
}

const EMPTY: NearbySnapshot = { room: null, chat: [], live: false, ended: null };

abstract class Base {
  protected snap: NearbySnapshot = EMPTY;
  private listeners = new Set<() => void>();
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  snapshot() {
    return this.snap;
  }
  protected set(patch: Partial<NearbySnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }
  protected addChat(m: NearbyChat) {
    if (this.snap.chat.some((x) => x.id === m.id)) return;
    this.set({ chat: [...this.snap.chat, m].slice(-80) });
  }
}

interface GuestLink {
  channel: Channel;
  playerId: string | null;
  lastHeard: number;
  /** Results of recent moves by id, so a move sent twice is applied once. */
  done: Map<string, string | undefined>;
  parts: Reassembler;
  onHello?: (name: string) => void;
}

/** Phones that send a newer or older protocol are told to update. */
const VERSION_MISMATCH = "This phone and the host's run different versions of the app. Refresh both and try again.";

export class HostSession extends Base implements NearbyClient {
  readonly role = "host" as const;
  readonly host: NearbyHost;
  private links = new Set<GuestLink>();
  private pinger: ReturnType<typeof setInterval> | null = null;
  private flushQueued = false;

  constructor(me: { name: string; avatar?: string }, options: GameOptions, clock?: HostClock) {
    super();
    this.host = new NearbyHost(me, options, clock);
    this.host.onChange(() => this.queueFlush());
    this.host.onChat((m) => {
      this.addChat({ ...m, live: true });
      for (const l of this.links) if (l.playerId) this.send(l, { t: "chat", v: PROTOCOL, message: m });
    });
    this.snap = { room: this.host.viewFor(this.host.hostId), chat: [], live: true, ended: null };
    this.pinger = setInterval(() => this.heartbeat(), PING_MS);
  }

  /** Guests that are at the table, for the host's list. */
  guests() {
    return this.host.guests();
  }

  /** A new data channel (a guest who just scanned in). They introduce themselves with "hello". */
  addGuest(channel: Channel, onHello?: (name: string) => void) {
    const link: GuestLink = { channel, playerId: null, lastHeard: Date.now(), done: new Map(), parts: new Reassembler(), onHello };
    this.links.add(link);
    channel.onmessage = (data) => {
      const raw = link.parts.push(data);
      if (raw === null) return;
      link.lastHeard = Date.now();
      this.receive(link, parseGuest(raw));
    };
    channel.onclose = () => this.drop(link, false);
  }

  private receive(link: GuestLink, msg: ReturnType<typeof parseGuest>) {
    if (!msg) return;
    if (msg.t === "old") {
      this.send(link, { t: "bye", v: PROTOCOL, reason: VERSION_MISMATCH });
      return this.drop(link, true);
    }
    if (msg.t === "hello") {
      // the same phone on a fresh connection replaces its old one
      for (const other of this.links) if (other !== link && other.playerId === msg.guestId) this.drop(other, true, true);
      try {
        link.playerId = this.host.join(msg.guestId, msg.name, msg.avatar);
      } catch (e) {
        this.send(link, { t: "bye", v: PROTOCOL, reason: (e as Error).message });
        return this.drop(link, true);
      }
      this.send(link, { t: "welcome", v: PROTOCOL, playerId: link.playerId, chat: this.host.chat });
      this.send(link, { t: "view", v: PROTOCOL, view: this.host.viewFor(link.playerId) });
      link.onHello?.(msg.name);
      return;
    }
    const pid = link.playerId;
    if (!pid) return; // nothing before hello
    switch (msg.t) {
      case "act": {
        if (link.done.has(msg.id)) {
          this.send(link, { t: "done", v: PROTOCOL, id: msg.id, error: link.done.get(msg.id) });
          return;
        }
        let error: string | undefined;
        try {
          if (msg.action === "leave") {
            this.send(link, { t: "done", v: PROTOCOL, id: msg.id });
            this.host.leave(pid);
            link.playerId = null;
            return this.drop(link, true);
          }
          this.host.act(pid, msg.action, msg.extra);
        } catch (e) {
          error = e instanceof NearbyError ? e.message : "That didn't work";
        }
        link.done.set(msg.id, error);
        if (link.done.size > 64) link.done.delete(link.done.keys().next().value as string);
        this.flush(); // the new view goes before the answer, so the guest never acts on a stale table
        this.send(link, { t: "done", v: PROTOCOL, id: msg.id, error });
        return;
      }
      case "chat": {
        let error: string | undefined;
        if (!link.done.has(msg.id)) {
          try {
            this.host.sendChat(pid, msg);
          } catch (e) {
            error = (e as Error).message;
          }
          link.done.set(msg.id, error);
        }
        this.send(link, { t: "done", v: PROTOCOL, id: msg.id, error: link.done.get(msg.id) });
        return;
      }
      case "bye":
        this.host.leave(pid);
        link.playerId = null;
        return this.drop(link, true);
      case "pong":
        return;
    }
  }

  private send(link: GuestLink, msg: HostMsg) {
    try {
      for (const s of frame(msg)) link.channel.send(s);
    } catch {
      this.drop(link, true);
    }
  }

  /** A guest's connection is gone: their seat is held, then a computer plays it. */
  private drop(link: GuestLink, close: boolean, replaced = false) {
    if (!this.links.delete(link)) return;
    link.channel.onmessage = null;
    link.channel.onclose = null;
    if (close) link.channel.close();
    if (link.playerId && !replaced) this.host.disconnect(link.playerId);
  }

  private heartbeat() {
    const now = Date.now();
    for (const l of this.links) {
      if (now - l.lastHeard > SILENT_MS) this.drop(l, true);
      else this.send(l, { t: "ping", v: PROTOCOL, at: now });
    }
  }

  private queueFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => this.flush());
  }

  /** Everyone gets their own view of the table as it is now. */
  private flush() {
    this.flushQueued = false;
    if (this.host.closed) return;
    this.set({ room: this.host.viewFor(this.host.hostId) });
    for (const l of this.links) {
      if (!l.playerId) continue;
      try {
        this.send(l, { t: "view", v: PROTOCOL, view: this.host.viewFor(l.playerId) });
      } catch {
        // left meanwhile
      }
    }
  }

  async act(action: string, extra: Record<string, unknown> = {}) {
    if (action === "leave") return this.leave();
    try {
      this.host.act(this.host.hostId, action, extra);
    } catch (e) {
      throw new Error(e instanceof NearbyError ? e.message : "That didn't work");
    }
    this.flush();
  }

  async sendChat(msg: { text?: string; sticker?: string }) {
    this.host.sendChat(this.host.hostId, msg);
  }

  /** The host leaving closes the table for everyone. */
  leave() {
    if (this.snap.ended) return;
    for (const l of [...this.links]) {
      this.send(l, { t: "bye", v: PROTOCOL, reason: "The host closed the table" });
      this.drop(l, true, true);
    }
    if (this.pinger) clearInterval(this.pinger);
    this.pinger = null;
    this.host.close();
    this.set({ live: false, ended: "You closed the table" });
  }
}

export class GuestSession extends Base implements NearbyClient {
  readonly role = "guest" as const;
  private playerId: string | null = null;
  private latest = -1;
  private lastHeard = Date.now();
  /** How far the host's clock is ahead of this phone's (ms), from its pings. */
  private skew = 0;
  private waiting = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private parts = new Reassembler();
  private watchdog: ReturnType<typeof setInterval>;
  private welcomed: () => void = () => {};
  /** Resolves once the host has let this phone in (rejects if it refuses). */
  readonly ready: Promise<void>;

  constructor(
    private channel: Channel,
    me: { guestId: string; name: string; avatar?: string },
  ) {
    super();
    let fail: (e: Error) => void = () => {};
    this.ready = new Promise<void>((res, rej) => {
      this.welcomed = res;
      fail = rej;
    });
    this.ready.catch(() => {});
    this.onEnd = fail;
    channel.onmessage = (data) => {
      const raw = this.parts.push(data);
      if (raw === null) return;
      this.lastHeard = Date.now();
      if (!this.snap.live && this.playerId) this.set({ live: true });
      this.receive(parseHost(raw));
    };
    channel.onclose = () => this.end("Lost the connection to the host. Scan the host's code again to get back in.");
    this.send({ t: "hello", v: PROTOCOL, guestId: me.guestId, name: me.name, avatar: me.avatar });
    this.watchdog = setInterval(() => {
      const quiet = Date.now() - this.lastHeard;
      if (quiet > SILENT_MS * 2) {
        this.channel.close();
        this.end("Lost the connection to the host. Scan the host's code again to get back in.");
      } else if (quiet > SILENT_MS && this.snap.live) this.set({ live: false });
    }, 1000);
  }
  private onEnd: (e: Error) => void;

  private receive(msg: ReturnType<typeof parseHost>) {
    if (!msg) return;
    switch (msg.t) {
      case "old":
        return this.end(VERSION_MISMATCH);
      case "welcome":
        this.playerId = msg.playerId;
        this.set({ live: true, chat: msg.chat });
        this.welcomed();
        return;
      case "view": {
        const view = msg.view;
        if (view.version < this.latest) return; // out of order
        this.latest = view.version;
        this.set({ room: this.localTimes(view) });
        return;
      }
      case "chat":
        return this.addChat({ ...msg.message, live: true });
      case "done": {
        const w = this.waiting.get(msg.id);
        if (!w) return;
        this.waiting.delete(msg.id);
        clearTimeout(w.timer);
        if (msg.error) w.reject(new Error(msg.error));
        else w.resolve();
        return;
      }
      case "ping":
        this.skew = msg.at - Date.now();
        this.send({ t: "pong", v: PROTOCOL, at: msg.at });
        return;
      case "bye":
        this.channel.close();
        return this.end(msg.reason);
    }
  }

  /** The host's timestamps (when a player dropped out) turned into this phone's clock. */
  private localTimes(view: RoomView): RoomView {
    const fix = <T extends { awayAt?: number | null }>(p: T): T => (p.awayAt ? { ...p, awayAt: p.awayAt - this.skew } : p);
    if (!this.skew) return view;
    return {
      ...view,
      game: view.game ? { ...view.game, players: view.game.players.map(fix) } : null,
      patti: view.patti ? { ...view.patti, players: view.patti.players.map(fix) } : null,
    };
  }

  private send(msg: GuestMsg) {
    try {
      for (const s of frame(msg)) this.channel.send(s);
    } catch {
      this.end("Lost the connection to the host.");
    }
  }

  private request(msg: GuestMsg & { id: string }): Promise<void> {
    if (this.snap.ended) return Promise.reject(new Error(this.snap.ended));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(msg.id);
        reject(new Error("The host didn't answer. Are you still on the same Wi-Fi?"));
      }, 10_000);
      this.waiting.set(msg.id, { resolve, reject, timer });
      this.send(msg);
    });
  }

  act(action: string, extra?: Record<string, unknown>) {
    if (action === "leave") {
      this.leave();
      return Promise.resolve();
    }
    return this.request({ t: "act", v: PROTOCOL, id: newId(), action, extra });
  }

  sendChat(msg: { text?: string; sticker?: string }) {
    return this.request({ t: "chat", v: PROTOCOL, id: newId(), ...msg });
  }

  leave() {
    if (this.snap.ended) return;
    this.send({ t: "bye", v: PROTOCOL });
    this.channel.close();
    this.end("You left the table");
  }

  private end(reason: string) {
    if (this.snap.ended) return;
    clearInterval(this.watchdog);
    for (const w of this.waiting.values()) {
      clearTimeout(w.timer);
      w.reject(new Error(reason));
    }
    this.waiting.clear();
    this.onEnd(new Error(reason));
    this.set({ live: false, ended: reason });
  }
}

/** This phone's id at nearby tables, kept so a dropped connection gets the same seat back. */
export function guestId(): string {
  const KEY = "baazi:nearby-id";
  try {
    const have = localStorage.getItem(KEY);
    if (have) return have;
    const id = newId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return newId();
  }
}
