"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { chooseAction, thinkMs } from "@/lib/paanch/bot";
import {
  PAANCH_TURN_SECONDS,
  type PaanchAction,
  PaanchError,
  type PaanchState,
  type Seat,
  act,
  autoMove,
  newPaanch,
} from "@/lib/paanch/engine";
import { type PaanchView, paanchForSeat } from "@/lib/paanch/view";
import { useSoloCoins } from "@/lib/wallet/use-solo-coins";

export { PAANCH_TURN_SECONDS };

export interface PaanchGame {
  /** The game as you see it (you are always seat 0, side 0). */
  state: PaanchView | null;
  /**
   * Pays the fee and deals a new game against the computer: 2 players, or 4 in two teams (your partner
   * sits opposite). Resolves false, with the shop open, when you can't afford it.
   */
  start: (players: 2 | 4) => Promise<boolean>;
  /** Leaving mid-game: the game is forfeited. */
  leave?: () => void;
  /** What a game costs, and what the last finished one paid (null until it's settled). Solo only. */
  coins?: { fee: number; paid: number | null };
  move: (action: PaanchAction) => void;
  error: string | null;
  /** Changes whenever a new turn begins (restarts the clock). */
  turnKey: string;
}

/** A game of Paanch against the computer, on this phone. */
export function usePaanch(paused: boolean): PaanchGame {
  const [state, setState] = useState<PaanchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof PaanchError ? e.message : "Something went wrong");
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 2500);
  }, []);

  const coins = useSoloCoins("paanch");
  const { pay, settle, forfeit } = coins;

  const start = useCallback(
    async (players: 2 | 4) => {
      if (!(await pay())) return false;
      setError(null);
      setState(newPaanch({ players, dealer: ((Math.random() * players) | 0) as Seat }));
      sfx.deal();
      return true;
    },
    [pay],
  );

  // settle the coins once, when the game is decided (settle ignores repeats for the same game)
  const result = state?.result ?? null;
  useEffect(() => {
    if (result) settle({ won: result.winner === 0, draw: result.winner === null });
  }, [result, settle]);

  const apply = useCallback(
    (seat: Seat, action: PaanchAction) => {
      setState((s) => {
        if (!s) return s;
        try {
          return act(s, seat, action);
        } catch (e) {
          if (seat === 0) {
            fail(e);
            return s;
          }
          // a computer move that went wrong: play anything legal instead
          try {
            return act(s, seat, autoMove(s, seat));
          } catch {
            return s;
          }
        }
      });
    },
    [fail],
  );

  const move = useCallback((action: PaanchAction) => apply(0, action), [apply]);

  // the computer players (and your partner, in a four-player game)
  useEffect(() => {
    if (!state || state.result || paused || state.turn === 0) return;
    const who = state.turn;
    const t = window.setTimeout(() => apply(who, chooseAction(state, who)), thinkMs(state));
    return () => window.clearTimeout(t);
  }, [state, paused, apply]);

  // your clock: when it runs out a move is made for you
  const clockKey = state ? `${state.moveNo}:${state.turn}:${state.result ? "end" : ""}` : "none";
  const yourMove = !!state && !state.result && state.turn === 0;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(() => {
    if (!yourMove || paused) return;
    const t = window.setTimeout(() => {
      const s = latest.current;
      if (s && !s.result && s.turn === 0) apply(0, autoMove(s, 0));
    }, PAANCH_TURN_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [clockKey, yourMove, paused, apply]);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  const view = useMemo(() => (state ? paanchForSeat(state, 0) : null), [state]);
  usePaanchSounds(view);

  return { state: view, start, move, leave: forfeit, coins: { fee: coins.fee, paid: coins.paid }, error, turnKey: clockKey };
}

/** Sounds for what just happened on a Paanch board (works on any seat's view: you are seat 0). */
export function usePaanchSounds(state: Pick<PaanchState, "events" | "eventNo" | "result" | "turn"> | null) {
  const heard = useRef(-1);
  useEffect(() => {
    if (!state) return;
    if (heard.current < 0 || state.eventNo < heard.current) heard.current = state.eventNo - 1;
    const fresh = state.events.slice(Math.max(0, state.events.length - (state.eventNo - heard.current)));
    heard.current = state.eventNo;
    let yourTurn = false;
    for (const e of fresh) {
      if (e.type === "deal") sfx.deal();
      else if (e.type === "place") sfx.card();
      else if (e.type === "remove") sfx.sweep();
      else if (e.type === "dead") sfx.flip();
      else if (e.type === "reshuffle") sfx.deal();
      else if (e.type === "line") window.setTimeout(() => sfx.trump(), 180);
      else if (e.type === "end") {
        const w = e.winner;
        window.setTimeout(() => (w === 0 ? sfx.win() : w === null ? sfx.gather() : sfx.lose()), 500);
      }
      if (e.type === "place" || e.type === "remove" || (e.type === "dead" && e.endsTurn)) yourTurn = true;
    }
    if (yourTurn && !state.result && state.turn === 0) window.setTimeout(() => sfx.turn(), 250);
  }, [state]);
}
