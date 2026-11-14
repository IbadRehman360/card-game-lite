"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { BLUFF_TEMPERS, chooseAction, thinkMs } from "@/lib/bluff/bot";
import {
  BLUFF_REVEAL_MS,
  BLUFF_TURN_SECONDS,
  SHOT_AT_MS,
  SHOT_LANDS_MS,
  type BluffAction,
  BluffError,
  type BluffState,
  type Seat,
  act,
  autoAction,
  newBluff,
  nextRound,
} from "@/lib/bluff/engine";
import { bluffSfx } from "./bluff-sfx";
import { type SoloCoins, useSoloCoins } from "@/lib/wallet/use-solo-coins";

export { BLUFF_REVEAL_MS, BLUFF_TURN_SECONDS, SHOT_AT_MS, SHOT_LANDS_MS };

export interface BluffGame {
  state: BluffState | null;
  /** Pays and starts a new game (false, with the shop open, when you can't afford it). */
  start: () => Promise<boolean>;
  move: (action: BluffAction) => void;
  /** After the game ends: play again (paid again). */
  next: () => void;
  /** Leaving mid-game (forfeits it). */
  leave: () => void;
  /** The fee, and what the last game paid. */
  coins: Pick<SoloCoins, "fee" | "paid">;
  error: string | null;
  /** Changes whenever a new turn begins (restarts the clock). */
  turnKey: string;
}

export const bluffTurnKey = (s: BluffState | null) =>
  s ? `${s.round}:${s.phase}:${s.turn}:${s.plays.length}` : "none";

export function useBluff(paused: boolean): BluffGame {
  const [state, setState] = useState<BluffState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof BluffError ? e.message : "Something went wrong");
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 2500);
  }, []);

  const coins = useSoloCoins("bluff");
  const { pay, settle, forfeit } = coins;
  const start = useCallback(async () => {
    if (!(await pay())) return false;
    setError(null);
    setState(newBluff());
    sfx.flip();
    return true;
  }, [pay]);
  const again = useCallback(() => void start(), [start]);

  // decided for you once you're shot out, or when the game ends
  const decided = !!state && (state.phase === "over" || !state.players[0].alive);
  const youWon = !!state && state.winner === 0;
  useEffect(() => {
    if (decided) settle({ won: youWon });
  }, [decided, youWon, settle]);

  const apply = useCallback(
    (seat: Seat, action: BluffAction) => {
      setState((s) => {
        if (!s) return s;
        try {
          return act(s, seat, action);
        } catch (e) {
          if (seat === 0) {
            fail(e);
            return s;
          }
          // a computer move that went wrong: make the timed-out move rather than stall the table
          try {
            return act(s, seat, autoAction(s, seat));
          } catch {
            return s;
          }
        }
      });
    },
    [fail],
  );

  const move = useCallback((a: BluffAction) => apply(0, a), [apply]);

  useBluffSounds(state);

  // computer players
  useEffect(() => {
    if (!state || state.phase !== "play" || paused || state.turn === 0) return;
    const who = state.turn;
    const t = window.setTimeout(() => apply(who, chooseAction(state, who, BLUFF_TEMPERS[who])), thinkMs(state));
    return () => window.clearTimeout(t);
  }, [state, paused, apply]);

  // after a call has been shown, the next round
  useEffect(() => {
    if (!state || state.phase !== "reveal" || paused) return;
    const t = window.setTimeout(() => setState((s) => (s && s.phase === "reveal" ? nextRound(s) : s)), BLUFF_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [state, paused]);

  // your clock
  const turnKey = bluffTurnKey(state);
  const yourMove = !!state && state.phase === "play" && state.turn === 0 && state.players[0].alive;
  useEffect(() => {
    if (!yourMove || paused) return;
    const t = window.setTimeout(() => setState((s) => (s ? safeAuto(s) : s)), BLUFF_TURN_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [turnKey, yourMove, paused]);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  return { state, start, move, next: again, leave: forfeit, coins: { fee: coins.fee, paid: coins.paid }, error, turnKey };
}

function safeAuto(s: BluffState): BluffState {
  if (s.phase !== "play" || s.turn !== 0) return s;
  try {
    return act(s, 0, autoAction(s, 0));
  } catch {
    return s;
  }
}

/** Sounds for what just happened at a Bluff table. Works for solo and online states alike. */
export function useBluffSounds(state: BluffState | null) {
  const heard = useRef(-1);
  useEffect(() => {
    if (!state) return;
    const first = state.eventNo - state.events.length;
    // a fresh page: don't replay the past
    if (heard.current < 0 || heard.current > state.eventNo) heard.current = state.eventNo;
    const from = Math.max(heard.current, first);
    const timers: number[] = [];
    for (let i = from - first; i < state.events.length; i++) {
      const e = state.events[i];
      if (e.type === "deal") sfx.flip();
      else if (e.type === "play") bluffSfx.slide(e.count);
      else if (e.type === "call") bluffSfx.call();
      else if (e.type === "reveal") timers.push(window.setTimeout(() => sfx.flip(), 450));
      else if (e.type === "shot") {
        timers.push(window.setTimeout(() => bluffSfx.spin(), SHOT_AT_MS));
        timers.push(window.setTimeout(() => bluffSfx.cock(), SHOT_LANDS_MS - 750));
        timers.push(window.setTimeout(() => bluffSfx.heartbeat(), SHOT_LANDS_MS - 620));
        timers.push(window.setTimeout(() => (e.live ? bluffSfx.bang() : bluffSfx.click()), SHOT_LANDS_MS));
        if (e.live) timers.push(window.setTimeout(() => bluffSfx.thud(), SHOT_LANDS_MS + 520));
      } else if (e.type === "end") {
        const won = e.winner === 0;
        timers.push(window.setTimeout(() => (won ? sfx.win() : sfx.lose()), SHOT_LANDS_MS + 900));
      }
    }
    heard.current = state.eventNo;
    // sounds already scheduled keep playing even if the state moves on
    void timers;
  }, [state]);
}
