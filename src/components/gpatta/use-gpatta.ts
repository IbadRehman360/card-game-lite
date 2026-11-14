"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { useSoloCoins } from "@/lib/wallet/use-solo-coins";
import { chooseAction, thinkMs } from "@/lib/gpatta/bot";
import {
  GPATTA_TURN_SECONDS,
  type GPattaAction,
  GPattaError,
  type GPattaEvent,
  type GPattaState,
  act,
  newGPatta,
} from "@/lib/gpatta/engine";

export { GPATTA_TURN_SECONDS };

/** One animated beat of a step: what happens, when it starts and how long it takes (ms). */
export interface Beat {
  e: GPattaEvent;
  at: number;
  dur: number;
}

/** Time between two cards of the deal (ms). */
export const DEAL_GAP = 42;
/** Thrown pairs go one pair at a time, slowly, so everyone can remember which cards are gone (ms). */
export const PAIR_GAP = 1100;
export const PAIR_FLY = 850;

export const motionReduced = () =>
  typeof document !== "undefined" &&
  (document.documentElement.dataset.motion === "reduce" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Lays a step's events out in time (the screen animates them, the hook waits for them). */
export function timeline(events: GPattaEvent[], fast = false): { beats: Beat[]; total: number } {
  let t = 0;
  const beats: Beat[] = [];
  for (const e of events) {
    let dur = 0;
    switch (e.t) {
      case "reveal-out":
        dur = 2400;
        break;
      case "deal":
        dur = e.counts.reduce((a, b) => a + b, 0) * DEAL_GAP + 550;
        break;
      case "pairs":
        dur = 200 + (e.cards.length / 2) * PAIR_GAP + PAIR_FLY;
        break;
      case "draw":
        dur = 780;
        break;
      case "safe":
        dur = 650;
        break;
      case "end":
        dur = 500;
        break;
    }
    if (fast) dur = Math.min(dur, 160);
    beats.push({ e, at: t, dur });
    t += dur;
  }
  return { beats, total: t };
}

export interface GPattaGame {
  state: GPattaState | null;
  /** Sits down (pays the fee); resolves false, with the shop open, when you can't. */
  start: (players: number) => Promise<boolean>;
  /** Take the card at this position from the next player's hand. */
  pick: (index: number) => void;
  /** Throw two of your cards as a pair (positions in your hand). */
  pair: (a: number, b: number) => void;
  /** Throw all your pairs at once. */
  throwAll: () => void;
  /** Throw opening pairs for you automatically. */
  autoPairs: boolean;
  setAutoPairs: (on: boolean) => void;
  /** Animations are done and the game waits for you. */
  waiting: boolean;
  /** The current step is still animating. */
  busy: boolean;
  /** Changes whenever your clock (re)starts; empty while it isn't running. */
  clockKey: string;
  error: string | null;
  /** What a game costs, and the coins the settled game paid (null until then). Solo only. */
  coins?: { fee: number; paid: number | null };
  /** Going to the menu mid-game gives it up. */
  leave: () => void;
  /** True at a table with friends (the server deals and runs the clock). */
  online?: boolean;
}

const ME = 0;
const AUTO_KEY = "baazi:gpatta:auto";

/**
 * Plays the sounds of one step as it animates. Returns the timers it set (clear them when the step is
 * replaced) and how long the whole step takes. Shared by a game on this phone and one at a table.
 */
export function playStep(events: GPattaEvent[]): { timers: number[]; total: number } {
  const fast = motionReduced();
  const { beats, total } = timeline(events, fast);
  const timers: number[] = [];
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  for (const b of beats) {
    const e = b.e;
    if (e.t === "reveal-out") {
      at(b.at, () => sfx.card());
      at(b.at + (fast ? 0 : 500), () => sfx.flip());
      at(b.at + (fast ? 0 : 1900), () => sfx.pack());
    } else if (e.t === "deal") {
      at(b.at, () => sfx.deal());
      const n = e.counts.reduce((a, c) => a + c, 0);
      if (!fast) for (let k = 6; k < n; k += 6) at(b.at + k * DEAL_GAP, () => sfx.card());
    } else if (e.t === "pairs") at(b.at + (fast ? 0 : 200), () => sfx.gather());
    else if (e.t === "draw") at(b.at, () => sfx.card());
    else if (e.t === "safe") at(b.at, () => sfx.confirm());
    else if (e.t === "end") at(b.at, () => (e.g === ME ? sfx.lose() : sfx.win()));
  }
  return { timers, total };
}

/** "Throw my opening pairs for me", remembered on this phone. */
export function useAutoPairs(): [boolean, (on: boolean) => void] {
  const [autoPairs, setAutoPairsState] = useState(true);
  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem(AUTO_KEY) === "0";
    } catch {
      // private window
    }
    if (!off) return;
    const t = window.setTimeout(() => setAutoPairsState(false), 0);
    return () => window.clearTimeout(t);
  }, []);
  const setAutoPairs = useCallback((on: boolean) => {
    setAutoPairsState(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? "1" : "0");
    } catch {
      // private window
    }
  }, []);
  return [autoPairs, setAutoPairs];
}

export function useGPatta(paused: boolean): GPattaGame {
  const [state, setState] = useState<GPattaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPairs, setAutoPairs] = useAutoPairs();
  // the last step whose animation has finished (anything newer is still playing)
  const [doneSeq, setDoneSeq] = useState(-1);
  const errTimer = useRef<number | undefined>(undefined);
  const coins = useSoloCoins("gpatta");
  const { pay, settle, forfeit } = coins;

  const fail = useCallback((e: unknown) => {
    setError(e instanceof GPattaError ? e.message : "Something went wrong");
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 2200);
  }, []);

  const apply = useCallback(
    (seat: number, action: GPattaAction) => {
      setState((s) => {
        if (!s) return s;
        try {
          return act(s, seat, action);
        } catch (e) {
          fail(e);
          return s;
        }
      });
    },
    [fail],
  );

  // every step animates first; nothing else happens until it's done
  const seq = state?.seq ?? -1;
  const events = state?.events;
  const busy = !!state && seq !== doneSeq;
  useEffect(() => {
    if (!events) return;
    const { timers, total } = playStep(events);
    timers.push(window.setTimeout(() => setDoneSeq(seq), total + 60));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // a step is identified by its events (a new array on every act)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // whose move is it once the animation is over
  const humanPairs = state?.phase === "pairs" && !state.players[ME].ready;
  const waiting = !!state && !busy && ((state.phase === "draw" && state.turn === ME) || (humanPairs && !autoPairs));

  useEffect(() => {
    if (!state || busy || paused) return;
    if (state.phase === "reveal") {
      const t = window.setTimeout(() => apply(ME, { type: "deal" }), 120);
      return () => window.clearTimeout(t);
    }
    if (state.phase === "pairs") {
      // players throw one after another from the first dealt; you're skipped while throwing by hand
      const order = Array.from({ length: state.n }, (_, k) => (state.first + k) % state.n);
      const next = order.find((i) => !state.players[i].ready && (i !== ME || autoPairs));
      if (next === undefined) return;
      const t = window.setTimeout(
        () => apply(next, next === ME ? { type: "throw" } : chooseAction(state, next)!),
        next === ME ? 250 : thinkMs(state),
      );
      return () => window.clearTimeout(t);
    }
    if (state.phase === "draw" && state.turn !== ME) {
      const seat = state.turn;
      const t = window.setTimeout(() => {
        const a = chooseAction(state, seat);
        if (a) apply(seat, a);
      }, thinkMs(state));
      return () => window.clearTimeout(t);
    }
  }, [state, busy, paused, autoPairs, apply]);

  // your clock: when it runs out a card is taken for you (or your pairs are thrown)
  const clockKey = waiting ? `${seq}:${state?.phase}` : "";
  useEffect(() => {
    if (!clockKey || paused) return;
    sfx.turn();
    const timers = [
      window.setTimeout(() => apply(ME, { type: "timeout" }), GPATTA_TURN_SECONDS * 1000),
      ...[5, 4, 3, 2, 1].map((s) => window.setTimeout(() => sfx.tick(), (GPATTA_TURN_SECONDS - s) * 1000)),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [clockKey, paused, apply]);

  // settle as soon as your place is known (out early pays, G pays nothing); settle only runs once per game
  const myPlace = state?.players[ME].place ?? null;
  const players = state?.n ?? 0;
  useEffect(() => {
    if (myPlace !== null) settle({ place: myPlace, players });
  }, [myPlace, players, settle]);

  const start = useCallback(
    async (n: number) => {
      if (!(await pay())) return false;
      setError(null);
      setDoneSeq(-1);
      setState(newGPatta({ players: n }));
      return true;
    },
    [pay],
  );

  const leave = useCallback(() => {
    forfeit();
    setState(null);
  }, [forfeit]);

  const pick = useCallback(
    (index: number) => {
      if (waiting && state?.phase === "draw") apply(ME, { type: "draw", index });
    },
    [waiting, state?.phase, apply],
  );
  const pair = useCallback(
    (a: number, b: number) => {
      if (humanPairs && !busy) apply(ME, { type: "pair", a, b });
    },
    [humanPairs, busy, apply],
  );
  const throwAll = useCallback(() => {
    if (humanPairs && !busy) apply(ME, { type: "throw" });
  }, [humanPairs, busy, apply]);

  return {
    state,
    start,
    pick,
    pair,
    throwAll,
    autoPairs,
    setAutoPairs,
    waiting,
    busy,
    clockKey,
    error,
    coins: { fee: coins.fee, paid: coins.paid },
    leave,
  };
}
