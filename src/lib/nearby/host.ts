import { runBots } from "@/lib/game/bot";
import { shuffle } from "@/lib/game/cards";
import { type GameOptions, type GameState, type Seat, SEATS, cleanGameOptions, legalCards, newGame, playCard, startNextDeal } from "@/lib/game/engine";
import { AWAY_SECONDS, PACE, TURN_SECONDS } from "@/lib/game/pace";
import { seatView } from "@/lib/game/view";
import { CHARACTERS, isCharacterId } from "@/lib/characters";
import type { ChatMessage, LobbySeat, PattiView, RoomView, SeatEntry, StoredState } from "@/lib/online/types";
import {
  PATTI_TURN_SECONDS,
  type PattiAction,
  type PattiState,
  SIDESHOW_SECONDS,
  act as pattiAct,
  newTable,
  rulesFor,
  startDeal,
} from "@/lib/patti/engine";
import { TEMPERS, chooseAction, thinkMs } from "@/lib/patti/bot";
import { pattiForSeat } from "@/lib/patti/view";
import { newId } from "./protocol";

/**
 * The table, run on the host's phone. This is the friends' table from the game server
 * (lib/online/rooms.ts) moved into the browser, without coins: the same rules, bots, turn clock and
 * per-player views, so the lobby and game screens work unchanged. Guests reach it over the data
 * channel (see session.ts); the host's own seat calls it directly.
 */

export class NearbyError extends Error {}

export interface NearbyPlayer {
  id: string;
  name: string;
  avatar: string;
  /** Lobby seat (and their seat in the game). */
  seat: Seat | null;
  isHost: boolean;
  connected: boolean;
}

/** Time and timers, swappable for tests. */
export interface HostClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const realClock: HostClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

const GRACE_MS = 2500;
const CHAT_MAX = 140;
const STICKER_ID = /^[a-z0-9-]{1,24}$/;
const NO_RUNG = newGame();
const MAX_PLAYERS = 12;

function avatarFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHARACTERS[h % CHARACTERS.length].id;
}
const cleanName = (name: unknown) => {
  const n = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return n || "Player";
};
const cleanAvatar = (a: unknown, name: string) => (isCharacterId(a) ? a : avatarFor(name));
const pattiActor = (p: PattiState): Seat => (p.pending ? p.pending.to : p.turn);
const botName = (name: string) => (name.endsWith(" (bot)") ? name : `${name} (bot)`);

const PATTI_MOVES = ["see", "chaal", "raise", "pack", "show", "sideshow", "sideshowReply"] as const;
function cleanPattiAction(a: unknown): PattiAction {
  const x = (a ?? {}) as { type?: unknown; accept?: unknown };
  const type = PATTI_MOVES.find((m) => m === x.type);
  if (!type) throw new NearbyError("Unknown move");
  if (type === "sideshowReply") return { type, accept: x.accept === true };
  return { type };
}

export class NearbyHost {
  readonly hostId: string;
  status: "lobby" | "playing" = "lobby";
  options: GameOptions;
  version = 1;
  players: NearbyPlayer[] = [];
  state: StoredState | null = null;
  chat: ChatMessage[] = [];
  closed = false;
  /** Who each seat belongs to in this game, so a player who dropped out gets it back from the bot. */
  private owners: (string | null)[] = [null, null, null, null];
  private chatTimes = new Map<string, number[]>();
  private timer: unknown = null;
  private changeListeners = new Set<() => void>();
  private chatListeners = new Set<(m: ChatMessage) => void>();

  constructor(
    host: { name: string; avatar?: string },
    options: GameOptions,
    private clock: HostClock = realClock,
  ) {
    this.options = cleanGameOptions(options);
    const name = cleanName(host.name);
    this.hostId = newId();
    this.players.push({ id: this.hostId, name, avatar: cleanAvatar(host.avatar, name), seat: 0, isHost: true, connected: true });
  }

  // ───────────── listeners ─────────────

  onChange(fn: () => void) {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }
  onChat(fn: (m: ChatMessage) => void) {
    this.chatListeners.add(fn);
    return () => this.chatListeners.delete(fn);
  }
  private changed() {
    this.version++;
    this.schedule();
    for (const l of this.changeListeners) l();
  }

  // ───────────── people ─────────────

  private player(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new NearbyError("You're not at this table");
    return p;
  }

  /**
   * A guest connected (again). The same guest id gets their place back: their lobby seat if it's free,
   * or mid-game the seat they owned, taken back from the computer.
   */
  join(guestId: string, name: unknown, avatar?: unknown): string {
    if (this.closed) throw new NearbyError("The table is closed");
    const n = cleanName(name);
    let p = this.players.find((x) => x.id === guestId);
    if (p) {
      p.connected = true;
      p.name = n;
      if (this.status === "lobby" && p.seat === null) p.seat = this.freeLobbySeat();
    } else {
      if (this.players.length >= MAX_PLAYERS) throw new NearbyError("The table is full");
      p = { id: guestId, name: n, avatar: cleanAvatar(avatar, n), seat: null, isHost: false, connected: true };
      this.players.push(p);
      if (this.status === "lobby") p.seat = this.freeLobbySeat();
    }
    if (this.status === "playing" && this.state) this.sitMidGame(p);
    this.changed();
    return p.id;
  }

  private freeLobbySeat(): Seat | null {
    return SEATS.find((s) => !this.players.some((x) => x.seat === s)) ?? null;
  }

  /** Mid-game: back into their own seat, or into a seat a computer has had from the start. */
  private sitMidGame(p: NearbyPlayer) {
    const state = this.state!;
    if (state.seats.some((s) => s.playerId === p.id)) {
      state.seats = state.seats.map((s) => (s.playerId === p.id ? { ...s, awaySince: null } : s));
      return;
    }
    const own = this.owners.indexOf(p.id);
    const free = state.seats.find((s) => s.isBot && this.owners[s.seat] === null);
    const ownFree = own >= 0 && (state.seats[own].isBot || !state.seats[own].playerId);
    const seat = ownFree ? (own as Seat) : free?.seat;
    if (seat === undefined) {
      p.seat = null; // watching
      return;
    }
    const fresh = own !== seat;
    this.owners[seat] = p.id;
    p.seat = seat;
    state.seats = state.seats.map((s) =>
      s.seat === seat ? { ...s, name: p.name, isBot: false, playerId: p.id, avatar: s.avatar ?? p.avatar, awaySince: null } : s,
    );
    if (state.patti) {
      if (fresh) {
        const patti = structuredClone(state.patti);
        patti.players[seat].chips = patti.rules.startChips;
        state.patti = patti;
      }
      state.deadline = this.pattiDeadline(state.patti, state.seats);
    }
  }

  /** A guest's connection dropped. Mid-game their seat is held for a while, then a computer plays it. */
  disconnect(playerId: string) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.isHost || !p.connected) return;
    p.connected = false;
    if (this.status === "lobby") {
      p.seat = null; // gets a seat again on rejoining
    } else if (this.state) {
      const now = this.clock.now();
      this.state.seats = this.state.seats.map((s) => (s.playerId === p.id ? { ...s, playerId: null, awaySince: now } : s));
    }
    this.changed();
  }

  /** A guest left for good (or the host: the table closes). */
  leave(playerId: string) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.isHost) return this.close();
    this.disconnect(playerId);
    this.players = this.players.filter((x) => x.id !== playerId);
    const own = this.owners.indexOf(playerId);
    if (own >= 0) this.owners[own] = null;
    this.changed();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    for (const l of this.changeListeners) l();
  }

  // ───────────── moves ─────────────

  /** The same actions the game server takes from a phone. Throws NearbyError for a move that isn't allowed. */
  act(playerId: string, action: string, extra: Record<string, unknown> = {}) {
    if (this.closed) throw new NearbyError("The table is closed");
    const me = this.player(playerId);
    switch (action) {
      case "seat":
        return this.chooseSeat(me, extra.seat);
      case "move":
        return this.movePlayer(me, extra.playerId, extra.seat);
      case "shufflePairs":
        return this.shufflePairs(me);
      case "options":
        return this.updateOptions(me, extra.options);
      case "start":
        return this.start(me);
      case "play":
        return this.play(me, extra.card, extra.auto);
      case "patti":
        return this.pattiMove(me, extra.move);
      case "next":
        return this.nextDeal(me);
      case "tick":
      case "timeout":
      case "reap":
        // the host keeps its own clock; a phone asking early or late changes nothing
        return this.runDue();
      case "leave":
        return this.leave(playerId);
      default:
        throw new NearbyError("Unknown action");
    }
  }

  private lobbyOnly(me: NearbyPlayer, hostOnly: string | null) {
    if (this.status !== "lobby") throw new NearbyError("The game has already started");
    if (hostOnly && !me.isHost) throw new NearbyError(hostOnly);
  }

  private chooseSeat(me: NearbyPlayer, seat: unknown) {
    this.lobbyOnly(me, null);
    const s = seat === null ? null : (Number(seat) as Seat);
    if (s !== null && !SEATS.includes(s)) throw new NearbyError("Invalid seat");
    if (s !== null && this.players.some((x) => x.seat === s && x.id !== me.id)) throw new NearbyError("That seat is taken");
    me.seat = s;
    this.changed();
  }

  private movePlayer(me: NearbyPlayer, playerId: unknown, seat: unknown) {
    this.lobbyOnly(me, "Only the host can arrange the pairs");
    const target = seat === null ? null : (Number(seat) as Seat);
    if (target !== null && !SEATS.includes(target)) throw new NearbyError("Invalid seat");
    const mover = this.players.find((p) => p.id === playerId);
    if (!mover) throw new NearbyError("That player has left");
    if (mover.seat === target) return;
    const occupant = target === null ? undefined : this.players.find((p) => p.seat === target);
    if (occupant) occupant.seat = mover.seat;
    mover.seat = target;
    this.changed();
  }

  private shufflePairs(me: NearbyPlayer) {
    this.lobbyOnly(me, "Only the host can arrange the pairs");
    const seated = this.players.filter((p) => p.seat !== null);
    const seats = shuffle(SEATS.slice());
    seated.forEach((p, i) => (p.seat = seats[i]));
    this.changed();
  }

  private updateOptions(me: NearbyPlayer, options: unknown) {
    if (!me.isHost) throw new NearbyError("Only the host can change the rules");
    this.lobbyOnly(me, null);
    this.options = cleanGameOptions(options);
    this.changed();
  }

  private start(me: NearbyPlayer) {
    this.lobbyOnly(me, "Only the host can start the game");
    const free = CHARACTERS.map((c) => c.id as string);
    const take = (want: string | undefined) => {
      const i = want ? free.indexOf(want) : -1;
      return free.splice(i >= 0 ? i : 0, 1)[0];
    };
    const seated = SEATS.map((seat) => this.players.find((x) => x.seat === seat && x.connected));
    const looks = seated.map((p) => (p ? take(p.avatar) : null));
    const seats: SeatEntry[] = SEATS.map((seat) => {
      const p = seated[seat];
      if (p) return { seat, name: p.name, isBot: false, playerId: p.id, avatar: looks[seat]! };
      const avatar = take(undefined);
      return { seat, name: CHARACTERS.find((c) => c.id === avatar)!.name, isBot: true, playerId: null, avatar };
    });
    this.owners = seats.map((s) => s.playerId);
    this.status = "playing";
    if (this.options.game === "patti") {
      const table = newTable(rulesFor(this.options.boot ?? 10), undefined, Math.floor(Math.random() * 4) as Seat);
      this.state = this.pattiStored(startDeal(table), seats);
    } else {
      const game = runBots(newGame(this.options), (s) => seats[s].isBot);
      this.state = { game, seats, deadline: this.turnDeadline(null, game, seats) };
    }
    this.changed();
  }

  private mySeat(me: NearbyPlayer): Seat {
    if (this.status !== "playing" || !this.state) throw new NearbyError("The game hasn't started");
    const entry = this.state.seats.find((s) => s.playerId === me.id);
    if (!entry) throw new NearbyError("You're watching this table, not playing");
    return entry.seat;
  }

  private play(me: NearbyPlayer, card: unknown, auto: unknown) {
    const seat = this.mySeat(me);
    const state = this.state!;
    if (state.patti) throw new NearbyError("This table plays 3 Patti");
    let played: GameState;
    try {
      played = playCard(state.game, seat, String(card), { auto: auto === true });
    } catch (e) {
      throw new NearbyError((e as Error).message);
    }
    this.setRung(state.game, runBots(played, (s) => state.seats[s].isBot));
  }

  private setRung(before: GameState, game: GameState, seats = this.state!.seats) {
    this.state = { game, seats, deadline: this.turnDeadline(before, game, seats) };
    this.changed();
  }

  private nextDeal(me: NearbyPlayer) {
    this.mySeat(me);
    const state = this.state!;
    if (state.patti) {
      if (!state.patti.result) return; // someone else already dealt
      const c = structuredClone(state.patti);
      // anyone out of chips (person or computer) gets the starting stack again: nothing is at stake
      for (const s of SEATS) if (c.players[s].chips <= 0) c.players[s].chips = c.rules.startChips;
      this.state = this.pattiStored(startDeal(c), state.seats);
      this.changed();
      return;
    }
    if (!state.game.deal.result) return;
    this.setRung(state.game, runBots(startNextDeal(state.game), (s) => state.seats[s].isBot));
  }

  private pattiDeadline(p: PattiState, seats: SeatEntry[]): number | null {
    if (p.result) return null;
    const who = pattiActor(p);
    const dealing = p.events.length <= 1 ? 1800 : 0;
    if (seats[who].isBot) return this.clock.now() + dealing + thinkMs(p);
    return this.clock.now() + dealing + (p.pending ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS) * 1000 + GRACE_MS;
  }
  private pattiStored(p: PattiState, seats: SeatEntry[]): StoredState {
    return { game: NO_RUNG, patti: p, seats, deadline: this.pattiDeadline(p, seats) };
  }

  private pattiMove(me: NearbyPlayer, action: unknown) {
    const seat = this.mySeat(me);
    const state = this.state!;
    if (!state.patti) throw new NearbyError("This table plays Rung");
    const move = cleanPattiAction(action);
    let p: PattiState;
    try {
      p = pattiAct(state.patti, seat, move);
    } catch (e) {
      throw new NearbyError((e as Error).message);
    }
    const sameTurn = move.type === "see" && pattiActor(p) === pattiActor(state.patti) && !p.result;
    this.state = { ...state, patti: p, deadline: sameTurn ? (state.deadline ?? null) : this.pattiDeadline(p, state.seats) };
    this.changed();
  }

  /** When the player on turn runs out of time (after the table replays what just happened). */
  private turnDeadline(before: GameState | null, game: GameState, seats: SeatEntry[]): number | null {
    const d = game.deal;
    if (d.result || seats[d.turn].isBot) return null;
    const from = before && before.dealNo === game.dealNo ? before.deal.events.length : 0;
    let reveal = 0;
    for (let i = from; i < d.events.length; i++) {
      const prev = d.events[i - 1];
      reveal += !prev ? PACE.first : prev.type === "trick" ? PACE.afterTrick : PACE.afterPlay;
    }
    return this.clock.now() + reveal + TURN_SECONDS * 1000 + GRACE_MS;
  }

  // ───────────── the clock ─────────────

  /** The next moment something is due: a turn running out, a bot's think time, a held seat expiring. */
  private nextDue(): number | null {
    const s = this.state;
    if (this.closed || this.status !== "playing" || !s) return null;
    let due = s.deadline ?? null;
    for (const seat of s.seats) {
      if (!seat.isBot && !seat.playerId && seat.awaySince) {
        const at = seat.awaySince + AWAY_SECONDS * 1000;
        due = due === null ? at : Math.min(due, at);
      }
    }
    return due;
  }

  private schedule() {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    const due = this.nextDue();
    if (due === null) return;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.runDue();
    }, Math.max(0, due - this.clock.now()) + 20);
  }

  /** Does whatever is due now. Safe to call any time. */
  runDue() {
    const s = this.state;
    if (this.closed || this.status !== "playing" || !s) return;
    const now = this.clock.now();
    let changed = false;

    // seats held for players who dropped out go to the computer
    const away = (x: SeatEntry) => !x.isBot && !x.playerId && !!x.awaySince && now - x.awaySince >= AWAY_SECONDS * 1000;
    if (s.seats.some(away)) {
      const seats = s.seats.map((x) => (away(x) ? { ...x, isBot: true, awaySince: null, name: botName(x.name) } : x));
      if (s.patti) this.state = this.pattiStored(s.patti, seats);
      else {
        const game = runBots(s.game, (x) => seats[x].isBot);
        this.state = { game, seats, deadline: this.turnDeadline(s.game, game, seats) };
      }
      changed = true;
    }

    const st = this.state!;
    if (st.deadline && now >= st.deadline) {
      if (st.patti && !st.patti.result) {
        const who = pattiActor(st.patti);
        let p = st.patti;
        if (st.seats[who].isBot) {
          for (let i = 0; i < 3; i++) {
            const a = chooseAction(p, who, TEMPERS[who]);
            try {
              p = pattiAct(p, who, a);
            } catch {
              p = pattiAct(p, who, p.pending ? { type: "sideshowReply", accept: false } : { type: "pack", auto: true });
              break;
            }
            if (a.type !== "see") break;
          }
        } else {
          p = pattiAct(p, who, p.pending ? { type: "sideshowReply", accept: false } : { type: "pack", auto: true });
        }
        this.state = { ...st, patti: p, deadline: this.pattiDeadline(p, st.seats) };
        changed = true;
      } else if (!st.patti && !st.game.deal.result) {
        const seat = st.game.deal.turn;
        const legal = legalCards(st.game.deal, seat);
        const played = playCard(st.game, seat, legal[Math.floor(Math.random() * legal.length)], { auto: true });
        const game = runBots(played, (x) => st.seats[x].isBot);
        this.state = { game, seats: st.seats, deadline: this.turnDeadline(st.game, game, st.seats) };
        changed = true;
      }
    }
    if (changed) this.changed();
    else this.schedule();
  }

  // ───────────── chat ─────────────

  sendChat(playerId: string, body: { text?: unknown; sticker?: unknown }): ChatMessage {
    const me = this.player(playerId);
    const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX) : "";
    const sticker = typeof body.sticker === "string" && STICKER_ID.test(body.sticker) ? body.sticker : undefined;
    if (!text && !sticker) throw new NearbyError("Say something first");
    const now = this.clock.now();
    const times = (this.chatTimes.get(me.id) ?? []).filter((t) => now - t < 10_000);
    if (times.length >= 6) throw new NearbyError("Slow down a little");
    this.chatTimes.set(me.id, [...times, now]);
    const seat =
      this.status === "playing" && this.state ? (this.state.seats.find((s) => s.playerId === me.id)?.seat ?? null) : me.seat;
    const message: ChatMessage = { id: newId(), at: now, playerId: me.id, name: me.name, seat, ...(sticker ? { sticker } : { text }) };
    this.chat = [...this.chat, message].slice(-80);
    for (const l of this.chatListeners) l(message);
    return message;
  }

  // ───────────── what each phone sees ─────────────

  viewFor(playerId: string): RoomView {
    const me = this.player(playerId);
    const lobby: LobbySeat[] = SEATS.map((seat) => {
      const p = this.players.find((x) => x.seat === seat);
      return { seat, playerId: p?.id ?? null, name: p?.name ?? null, isHost: !!p?.isHost, isMe: p?.id === me.id, avatar: p?.avatar ?? null };
    });
    let game = null;
    let patti: PattiView | null = null;
    let spectating = false;
    const s = this.state;
    if (this.status === "playing" && s) {
      const mine = s.seats.find((x) => x.playerId === me.id)?.seat ?? null;
      spectating = mine === null;
      const players = s.seats.map(({ seat, name, isBot, avatar, awaySince }) => ({
        seat,
        name,
        isBot,
        avatar: avatar ?? avatarFor(name),
        awayAt: awaySince ?? null,
      }));
      if (s.patti) patti = { state: pattiForSeat(s.patti, mine), mySeat: mine, players };
      else {
        game = seatView(s.game, mine ?? 0, players);
        if (mine === null) {
          game.hand = [];
          game.legal = [];
        }
      }
    }
    const waiting = this.players.filter((p) => p.seat === null && p.connected);
    const deadline = this.status === "playing" ? s?.deadline : null;
    return {
      code: "NEAR",
      status: this.status,
      version: this.version,
      options: this.options,
      me: { playerId: me.id, name: me.name, seat: me.seat, isHost: me.isHost },
      lobby,
      spectators: waiting.length,
      waiting: waiting.map((p) => ({ playerId: p.id, name: p.name, isMe: p.id === me.id, avatar: p.avatar })),
      game,
      patti,
      spectating,
      turnDeadlineIn: deadline ? Math.max(0, deadline - this.clock.now()) : null,
    };
  }

  /** Guests that are connected right now (for the host's list). */
  guests() {
    return this.players.filter((p) => !p.isHost);
  }
}
