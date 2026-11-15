"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import type { Card } from "@/lib/game/cards";
import { type GameOptions, newGame } from "@/lib/game/engine";
import { AWAY_SECONDS } from "@/lib/game/pace";
import { gameFromView, turnSeat } from "@/lib/online/perspective";
import type { ChatMessage, JoinResponse, RoomView } from "@/lib/online/types";
import { WALLET_HEADER } from "@/lib/wallet/economy";
import { walletToken } from "@/lib/wallet/client";

/** A chat message, marked when it arrived live (so it pops up at the table) rather than with the history. */
export type LiveChatMessage = ChatMessage & { live?: boolean };
import { type SoloGame, useTable } from "./use-solo-game";

const TOKEN_HEADER = "x-baazi-token";
const tokenKey = (code: string) => `baazi:token:${code}`;

export function readToken(code: string) {
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

export function saveToken(code: string, token: string) {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {}
}

export function forgetToken(code: string) {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {}
}

/** An API failure: `status` is the HTTP status, or 0 when the server couldn't be reached in time. */
export type ApiFailure = Error & { status: number; coins?: boolean; short?: number | null };

const OFFLINE = "Can't reach the table. Check you're on the same Wi-Fi and try again.";
/** A request that hasn't answered by now is treated as lost (phones on bad Wi-Fi can hang for a minute). */
const TIMEOUT_MS = 12_000;

function failure(message: string, status: number, extra: Partial<ApiFailure> = {}): ApiFailure {
  return Object.assign(new Error(message), { status, ...extra });
}

async function api<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const isRead = !rest.method || rest.method === "GET";
  // Reads are safe to repeat, so one that is lost on the way gets a second try.
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      const wallet = walletToken();
      res = await fetch(path, {
        ...rest,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { [TOKEN_HEADER]: token } : {}),
          ...(wallet ? { [WALLET_HEADER]: wallet } : {}),
        },
        cache: "no-store",
        signal: ctrl.signal,
      });
    } catch {
      window.clearTimeout(timer);
      if (isRead && attempt === 0) continue;
      throw failure(OFFLINE, 0);
    }
    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      data = {};
    } finally {
      window.clearTimeout(timer);
    }
    if (res.ok) return data as T;
    // a proxy or a crashed server may answer with HTML: still give the player a sentence
    const message =
      typeof data.error === "string"
        ? data.error
        : res.status === 429
          ? "Too many requests, wait a moment and try again"
          : res.status >= 500
            ? "The table hit a problem, try again"
            : "Something went wrong, try again";
    throw failure(message, res.status, data.coins ? { coins: true, short: typeof data.short === "number" ? data.short : null } : {});
  }
}

export function createRoom(name: string, options: GameOptions, avatar?: string) {
  return api<JoinResponse>("/api/rooms", { method: "POST", body: JSON.stringify({ name, options, avatar }) });
}

/** Play: a seat at a quick-match table for this game (people searching for it, then players the server finds). */
export function joinQuick(game: string, name: string, avatar?: string) {
  return api<JoinResponse>("/api/match", { method: "POST", body: JSON.stringify({ action: "join", game, name, avatar }) });
}

export function joinRoom(code: string, name: string, token?: string | null, avatar?: string) {
  return api<JoinResponse>(`/api/rooms/${code}`, {
    method: "POST",
    token,
    body: JSON.stringify({ action: "join", name, avatar }),
  });
}

/** One look at a table this phone sat at (to offer going back to it). Throws an ApiFailure (403/404: it's gone). */
export function peekRoom(code: string, token: string) {
  return api<RoomView>(`/api/rooms/${code}`, { token });
}

/** Get up from a table without having it open (the Leave on the rejoin prompt). */
export function leaveTableRequest(code: string, token: string) {
  return api<{ ok: boolean }>(`/api/rooms/${code}`, { method: "POST", token, body: JSON.stringify({ action: "leave" }) });
}

/** Live view of one online table: fetches this player's view and refreshes whenever the table changes. */
export function useOnlineRoom(code: string | null, token: string | null) {
  const [room, setRoom] = useState<RoomView | null>(null);
  // Loading errors last until the next good fetch; errors from a move fade after a few seconds.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const actTimer = useRef<number | undefined>(undefined);
  const setError = useCallback((m: string | null) => {
    setActError(m);
    window.clearTimeout(actTimer.current);
    if (m) actTimer.current = window.setTimeout(() => setActError(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(actTimer.current), []);
  const error = actError ?? loadError;
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState(false);
  const latest = useRef(-1);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const addChat = useCallback((m: LiveChatMessage) => {
    setChat((list) => (list.some((x) => x.id === m.id) ? list : [...list, m].slice(-80)));
  }, []);
  const loadChat = useCallback(async () => {
    if (!code || !token) return;
    try {
      const { messages } = await api<{ messages: ChatMessage[] }>(`/api/rooms/${code}/chat`, { token });
      setChat((list) => {
        const known = new Set(messages.map((m) => m.id));
        return [...messages, ...list.filter((m) => !known.has(m.id))].sort((a, b) => a.at - b.at).slice(-80);
      });
    } catch {}
  }, [code, token]);

  // Ignore stale views that arrive out of order.
  const accept = useCallback((view: RoomView) => {
    if (view.version >= latest.current) {
      latest.current = view.version;
      setRoom(view);
    }
  }, []);

  // The table is gone (server restarted, or cleared away) or this phone is no longer at it: stop asking.
  const [gone, setGone] = useState(false);
  const goneRef = useRef(false);
  const lastFetch = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const backoffUntil = useRef(0);

  const fetchView = useCallback(async () => {
    if (!code || !token || goneRef.current) return;
    if (Date.now() < backoffUntil.current) return;
    lastFetch.current = Date.now();
    try {
      accept(await api<RoomView>(`/api/rooms/${code}`, { token }));
      setLoadError(null);
    } catch (e) {
      const err = e as ApiFailure;
      if (err.status === 403 || err.status === 404) {
        goneRef.current = true;
        setGone(true);
        forgetToken(code);
        setRoom(null);
      }
      // too many requests: give the server a breather
      if (err.status === 429) backoffUntil.current = Date.now() + 5000;
      setLoadError(err.message);
    }
  }, [code, token, accept]);

  /** Fetch this phone's view now. Calls made while one is on the way fold into a single one after it. */
  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        await fetchView();
      } while (again.current);
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = run;
    return run;
  }, [fetchView]);

  // A seat held for someone who dropped out: when its time is up, ask the server to hand it to a computer.
  const awayDue =
    room?.game?.players.reduce<number | null>(
      (min, p) => (p.awayAt ? Math.min(min ?? Infinity, p.awayAt + AWAY_SECONDS * 1000) : min),
      null,
    ) ?? null;
  useEffect(() => {
    if (!code || !token || !awayDue) return;
    const t = window.setTimeout(
      () => {
        api<{ view?: RoomView }>(`/api/rooms/${code}`, {
          method: "POST",
          token,
          body: JSON.stringify({ action: "reap" }),
        })
          .then((res) => (res.view ? accept(res.view) : refresh()))
          .catch(() => {});
      },
      Math.max(0, awayDue - Date.now()) + 600,
    );
    return () => clearTimeout(t);
  }, [awayDue, token, code, accept, refresh]);

  // A quick-match table filling up: ask about it every second and a half. That keeps this phone's seat,
  // shows the seats filling, and the poll that finds the table full starts the game. Several polls in a
  // row that can't reach the server mean the search is lost (the menu then plays on this phone instead).
  const filling = Boolean(room?.match);
  const [matchLost, setMatchLost] = useState(false);
  useEffect(() => {
    if (!code || !token || !filling) return;
    let misses = 0;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await api<{ view?: RoomView }>("/api/match", { method: "POST", token, body: JSON.stringify({ action: "poll", code }) });
        misses = 0;
        if (res.view && !stopped) accept(res.view);
      } catch (e) {
        const err = e as ApiFailure;
        if (err.status === 403 || err.status === 404) void refresh();
        else if (err.status === 0 && ++misses >= 4 && !stopped) setMatchLost(true);
      }
    };
    const t = window.setInterval(() => void poll(), 1500);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [code, token, filling, accept, refresh]);
  // the search is over (or a new one began): forget a lost one
  useEffect(() => {
    if (!matchLost || filling) return;
    const t = window.setTimeout(() => setMatchLost(false), 0);
    return () => window.clearTimeout(t);
  }, [matchLost, filling]);

  useEffect(() => {
    if (!code || !token) return;
    latest.current = -1;
    goneRef.current = false;
    inFlight.current = null;
    again.current = false;
    backoffUntil.current = 0;
    const initial = setTimeout(() => {
      setGone(false);
      void refresh();
    }, 0);
    const parse = (e: Event) => {
      try {
        return JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
      } catch {
        return null;
      }
    };

    let events: EventSource | null = null;
    let streamUp = false;
    let retry: number | undefined;
    let failures = 0;
    const connect = () => {
      window.clearTimeout(retry);
      if (goneRef.current || document.hidden) return;
      const es = new EventSource(`/api/rooms/${code}/events`);
      events = es;
      es.onopen = () => {
        failures = 0;
        streamUp = true;
        setLive(true);
        void refresh(); // catch up on anything missed while disconnected
        void loadChat();
      };
      es.addEventListener("chat", (e) => {
        const m = parse(e);
        if (m && typeof m.id === "string") addChat({ ...(m as unknown as ChatMessage), live: true });
      });
      es.addEventListener("update", (e) => {
        const version = parse(e)?.version;
        if (typeof version !== "number" || version > latest.current) void refresh();
      });
      es.onerror = () => {
        streamUp = false;
        setLive(false);
        // After a dropped connection the browser retries by itself; after a refusal (404, 429) it
        // stops for good, so try again later, a little slower each time.
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          failures++;
          void refresh(); // a table that's gone is noticed here, and that ends the retries
          retry = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** failures));
        }
      };
    };
    connect();

    // Safety net: with the stream down (or something missed) look every few seconds; while it's up,
    // only now and then; never while the phone is locked or the tab is hidden.
    const poll = window.setInterval(() => {
      if (document.hidden || goneRef.current) return;
      if (Date.now() - lastFetch.current >= (streamUp ? 20_000 : 4000)) void refresh();
    }, 2000);
    const wake = () => {
      if (document.hidden) {
        // a hidden tab keeps no stream open (phones cut it anyway, and it costs battery)
        events?.close();
        events = null;
        streamUp = false;
        setLive(false);
        window.clearTimeout(retry);
        return;
      }
      void refresh();
      if (!events || events.readyState === EventSource.CLOSED) connect();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      clearTimeout(initial);
      window.clearInterval(poll);
      window.clearTimeout(retry);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      events?.close();
    };
  }, [code, token, refresh, loadChat, addChat]);

  const sendChat = useCallback(
    async (msg: { text?: string; sticker?: string }) => {
      if (!code || !token) return;
      try {
        const res = await api<{ message: ChatMessage }>(`/api/rooms/${code}`, {
          method: "POST",
          token,
          body: JSON.stringify({ action: "chat", ...msg }),
        });
        addChat({ ...res.message, live: true });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [code, token, addChat, setError],
  );

  const busy = useRef(false);
  // the player's own moves on their way to the server (not the clock's automatic ones): shows the move spinner
  const [moving, setMoving] = useState(0);
  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!code || goneRef.current) return;
      // Game moves go one at a time: a double tap would otherwise send the same card twice and be told
      // "not your turn". Lobby changes and the automatic moves (tick, timeout, reap) aren't held back.
      const own = !AUTO_ACTIONS.has(action);
      const serial = SERIAL_ACTIONS.has(action);
      if (serial && busy.current) return;
      if (serial) busy.current = true;
      setPending(true);
      if (own) setMoving((n) => n + 1);
      try {
        const res = await api<{ view?: RoomView }>(`/api/rooms/${code}`, {
          method: "POST",
          token,
          body: JSON.stringify({ action, ...extra }),
        });
        if (res.view) accept(res.view);
        else await refresh();
      } catch (e) {
        const err = e as ApiFailure;
        // losing the race for an automatic move is normal: say nothing
        if (own || err.status !== 409) setError(err.message);
        await refresh();
      } finally {
        if (serial) busy.current = false;
        setPending(busy.current);
        if (own) setMoving((n) => Math.max(0, n - 1));
      }
    },
    [code, token, refresh, accept, setError],
  );

  // A quick-match Rung table: the other players move when their thinking time is up, and any phone at the
  // table asks the server for that move then (the server checks its own clock). A little later from each
  // phone, so they don't all ask at once.
  // At a table with friends the same clock covers a player whose phone dropped out (closed, reloading,
  // lost signal): their seat stays theirs, and a card is played for them until they're back.
  const rungDue = room?.status === "playing" && room.game && !room.game.result ? room.turnDeadlineIn : null;
  const rungVersion = room?.version ?? -1;
  useEffect(() => {
    if (rungDue == null || !code || !token) return;
    const t = window.setTimeout(() => void act("timeout"), rungDue + 250 + Math.random() * 300);
    return () => window.clearTimeout(t);
  }, [rungDue, rungVersion, code, token, act]);

  // Back at the table after dropping out (reload, rejoin, phone woken up): the server was moving for this
  // seat on a short clock; tell it someone is here again. Once per return, so a player who is simply slow
  // still gets moved for (a card they play clears it too).
  const dropped = !!(room?.code === code && room?.dropped);
  const returned = useRef(true);
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") returned.current = true;
    };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, []);
  useEffect(() => {
    returned.current = true;
  }, [code, token]);
  useEffect(() => {
    if (!room || room.code !== code) return;
    if (!dropped) {
      returned.current = false;
      return;
    }
    if (!returned.current || !code || !token) return;
    returned.current = false;
    api<{ view?: RoomView }>(`/api/rooms/${code}`, { method: "POST", token, body: JSON.stringify({ action: "back" }) })
      .then((res) => res.view && accept(res.view))
      .catch(() => {});
  }, [room, dropped, code, token, accept]);

  // a view of the table this phone was at before (another code, or the same code with another seat) never shows
  const current = code && token && room?.code === code && !gone ? room : null;
  return { room: current, error, pending, moving: moving > 0, live, gone, act, chat: current ? chat : NO_CHAT, sendChat, matchLost: matchLost && filling, clearError: () => {
      setError(null);
      setLoadError(null);
    },
  };
}

const NO_CHAT: LiveChatMessage[] = [];

/** Moves any phone at the table may send for someone else; they never block the player's own. */
const AUTO_ACTIONS = new Set(["tick", "extraTick", "timeout", "reap"]);
/** The player's game moves: one at a time. */
const SERIAL_ACTIONS = new Set(["play", "patti", "next", "start"]);

/** Character index (lib/characters) for a character id, falling back to the first. */
const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));

/**
 * A running online table as the game screen and the 3D table want it: turned so you sit in seat 0,
 * with each seat's character and name.
 */
export function useOnlineGame(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  pending: boolean,
  paused: boolean,
): { solo: SoloGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const view = room?.game ?? null;
  const game = useMemo(() => (view ? gameFromView(view) : null), [view]);
  const seats = useMemo(() => {
    if (!view) return null;
    const chars: number[] = [0, 0, 0, 0];
    const names = ["", "", "", ""];
    const bots = [false, false, false, false];
    for (const p of view.players) {
      const s = turnSeat(p.seat, view.mySeat);
      chars[s] = charIndex(p.avatar);
      names[s] = p.name;
      bots[s] = p.isBot;
    }
    return { chars, names, bots };
  }, [view]);

  const play = useCallback((card: Card, auto: boolean) => void act("play", { card, auto }), [act]);
  const next = useCallback(() => void act("next"), [act]);
  const table = useTable(
    {
      game: game ?? EMPTY_GAME,
      dealId: view ? `${view.seriesNo}:${view.dealNo}` : "none",
      play,
      next,
      restart: next,
      catchUp: true,
      ready: !pending,
    },
    paused || !view,
  );
  if (!view || !game || !seats) return null;
  return { solo: table.view, seatChars: seats.chars, names: seats.names, bots: seats.bots };
}

/** Stands in for the game until the table has started. */
const EMPTY_GAME = newGame();
