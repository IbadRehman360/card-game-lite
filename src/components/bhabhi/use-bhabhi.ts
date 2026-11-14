"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { useSoloCoins } from "@/lib/wallet/use-solo-coins";
import { TEMPERS, chooseAction, thinkMs } from "@/lib/bhabhi/bot";
import {
  BHABHI_TURN_SECONDS,
  type BhabhiState,
  BhabhiError,
  type Seat,
  act,
  legalPlays,
  newBhabhi,
} from "@/lib/bhabhi/engine";

export { BHABHI_TURN_SECONDS };

/** How long a finished trick stays on the table (the sweep or the pickup) before the next lead. */
export const TRICK_PAUSE_MS = 1300;

export interface BhabhiGame {
  state: BhabhiState | null;
  /** Pays the fee and deals. False (with the shop open) when you can't afford it. */
  start: (players?: number) => Promise<boolean>;
  /** Plays one of your cards. */
  move: (card: string) => void;
  /** You got away early: play the rest out instantly. */
  finish: () => void;
  /** Going to the menu mid-game: it's forfeited (your place counts if you already got away). */
  leave: () => void;
  error: string | null;
  /** Changes whenever it becomes your turn (restarts the clock). */
  turnKey: string;
  /** What a game costs and what it paid. Solo only: online the table settles the coins. */
  coins?: { fee: number; paid: number | null };
  /** True at a table with friends (the server deals and runs the clock). */
  online?: boolean;
}

const playersFor = (s: BhabhiState) => s.players;

export function useBhabhi(paused: boolean): BhabhiGame {
  const [state, setState] = useState<BhabhiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);
  const coins = useSoloCoins("bhabhi");
  const { pay, settle, forfeit } = coins;

  const fail = useCallback((e: unknown) => {
    setError(e instanceof BhabhiError ? e.message : "Something went wrong");
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 2200);
  }, []);

  const start = useCallback(
    async (players = 4) => {
      if (!(await pay())) return false;
      setError(null);
      setState(newBhabhi({ players }));
      sfx.deal();
      return true;
    },
    [pay],
  );

  const apply = useCallback(
    (seat: Seat, card: string, auto = false) => {
      setState((s) => {
        if (!s) return s;
        try {
          return act(s, seat, { type: "play", card, ...(auto ? { auto } : {}) });
        } catch (e) {
          if (seat === 0 && !auto) fail(e);
          // a computer move that went wrong: play any legal card rather than stall the table
          const any = legalPlays(s, seat)[0];
          if (!any || seat === 0) return s;
          try {
            return act(s, seat, { type: "play", card: any });
          } catch {
            return s;
          }
        }
      });
    },
    [fail],
  );

  const move = useCallback((card: string) => apply(0, card), [apply]);

  // computer players: think, then play (a little longer right after a trick ends, so it can be seen)
  const turn = state?.turn ?? null;
  const seq = state?.seq ?? 0;
  useEffect(() => {
    if (!state || paused || turn === null || turn === 0) return;
    const delay = thinkMs(state) + (state.trick.plays.length === 0 && state.lastTrick ? TRICK_PAUSE_MS : 0);
    const t = window.setTimeout(() => {
      const a = chooseAction(state, turn, TEMPERS[turn % TEMPERS.length]);
      apply(turn, a.card);
    }, delay);
    return () => window.clearTimeout(t);
    // a new move each time the state moves on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, turn, paused]);

  // your clock: out of time, the lowest legal card is played for you
  const turnKey = state && turn === 0 ? `${seq}` : "wait";
  useEffect(() => {
    if (!state || paused || turn !== 0) return;
    const extra = state.trick.plays.length === 0 && state.lastTrick ? TRICK_PAUSE_MS : 0;
    const t = window.setTimeout(() => {
      const legal = legalPlays(state, 0);
      if (legal.length) apply(0, legal[0], true);
    }, BHABHI_TURN_SECONDS * 1000 + extra);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, paused]);

  // sounds for what just happened
  useBhabhiSounds(state);

  // coins: settled once, as soon as your place is known (you got away, or you're the Bhabhi)
  const myPlace = state?.place[0] ?? null;
  const n = state ? playersFor(state) : 0;
  useEffect(() => {
    if (myPlace !== null && n) settle({ place: myPlace, players: n });
  }, [myPlace, n, settle]);

  const finish = useCallback(() => {
    setState((s) => {
      if (!s || s.place[0] === null) return s;
      let x = s;
      for (let i = 0; i < 4000 && x.turn !== null; i++) {
        const seat = x.turn;
        x = act(x, seat, chooseAction(x, seat, TEMPERS[seat % TEMPERS.length]));
      }
      return x;
    });
  }, []);

  const leave = useCallback(() => {
    // your place is already paid for if you got away; otherwise it's forfeited
    forfeit();
  }, [forfeit]);

  return { state, start, move, finish, leave, error, turnKey, coins: { fee: coins.fee, paid: coins.paid } };
}

/**
 * Sounds for what just happened at a Bhabhi table. Works the same on a state dealt on this phone and
 * on one that came from an online table (the first state seen is never replayed).
 */
export function useBhabhiSounds(state: BhabhiState | null) {
  const lastSeen = useRef(0);
  const started = useRef(false);
  useEffect(() => {
    if (!state) return;
    // joining a table part-way through (or a fresh deal): take it as read, don't replay it
    if (!started.current) {
      started.current = true;
      lastSeen.current = state.seq;
      return;
    }
    const fresh = state.events.filter((e) => e.id > lastSeen.current);
    lastSeen.current = state.seq;
    if (fresh.some((e) => e.type === "deal")) return;
    for (const e of fresh) {
      if (e.type === "play") sfx.card();
      else if (e.type === "thulla") sfx.trump();
      else if (e.type === "cleared") sfx.sweep();
      else if (e.type === "pickup") sfx.gather();
      else if (e.type === "escape") (e.seat === 0 ? sfx.win : sfx.chips)();
      else if (e.type === "end") (e.bhabhi === 0 ? sfx.lose : sfx.confirm)();
    }
    // your ping waits for a finished trick to clear the table, in time with your clock starting
    if (state.turn === 0 && fresh.length) {
      const wait = state.trick.plays.length === 0 && state.lastTrick ? TRICK_PAUSE_MS : 0;
      if (wait) window.setTimeout(() => sfx.turn(), wait);
      else sfx.turn();
    }
  }, [state]);
}

