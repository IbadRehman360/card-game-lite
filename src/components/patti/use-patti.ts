"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { CoinError, openShop, openSolo, settleOnExit, soloRebuy, soloReport, soloSettle } from "@/lib/wallet/client";
import { TEMPERS, chooseAction, thinkMs } from "@/lib/patti/bot";
import {
  type PattiAction,
  PattiError,
  type PattiState,
  type Seat,
  SEATS,
  TABLES,
  type TableId,
  act,
  newTable,
  rulesFor,
  startDeal,
} from "@/lib/patti/engine";

import { PATTI_TURN_SECONDS, SIDESHOW_SECONDS } from "@/lib/patti/engine";
export { PATTI_TURN_SECONDS, SIDESHOW_SECONDS };


export interface PattiGame {
  state: PattiState | null;
  table: TableId;
  /** Sits down at a table (pays the buy-in; resolves false, with the shop open, when you can't). */
  start: (table: TableId) => Promise<boolean> | void;
  move: (action: PattiAction) => void;
  /** Deals the next hand (computer players who ran out buy back in). */
  next: () => void;
  /** You ran out of chips: buy back in with the starting stack (another buy-in). */
  rebuy: () => void;
  /** Leaving the table: your chips turn back into coins. */
  leave?: () => void;
  /** You have no chips left for the next deal. */
  bust: boolean;
  error: string | null;
  /** Changes whenever it becomes your turn (restarts the clock). */
  turnKey: string;
  /** Computer players who bought back in before this deal. */
  reloaded: Seat[];
}

export function usePatti(paused: boolean): PattiGame {
  const [state, setState] = useState<PattiState | null>(null);
  const [table, setTable] = useState<TableId>("low");
  const [error, setError] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState<Seat[]>([]);
  const errTimer = useRef<number | undefined>(undefined);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof PattiError ? e.message : "Something went wrong");
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 2500);
  }, []);

  // the paid session at this table (coins), and your chips for cashing out if the app is closed
  const session = useRef<string | null>(null);
  const chipsNow = useRef(0);

  const coinFail = useCallback(
    (e: unknown) => {
      if (e instanceof CoinError) openShop({ need: e.short ?? undefined, message: e.message });
      else fail(e);
    },
    [fail],
  );

  const start = useCallback(
    async (id: TableId) => {
      const boot = TABLES.find((t) => t.id === id)!.boot;
      const rules = rulesFor(boot);
      try {
        session.current = (await openSolo("patti", rules.startChips)).session;
      } catch (e) {
        coinFail(e);
        return false;
      }
      const fresh = newTable(rules, [rules.startChips, rules.startChips, rules.startChips, rules.startChips], ((Math.random() * 4) | 0) as Seat);
      chipsNow.current = rules.startChips;
      setTable(id);
      setReloaded([]);
      setError(null);
      setState(startDeal(fresh));
      sfx.flip();
      return true;
    },
    [coinFail],
  );

  const apply = useCallback(
    (seat: Seat, action: PattiAction) => {
      setState((s) => {
        if (!s) return s;
        try {
          return act(s, seat, action);
        } catch (e) {
          if (seat === 0) fail(e);
          // a computer move that went wrong: pack rather than stall the table
          try {
            return seat === 0 ? s : act(s, seat, { type: "pack", auto: true });
          } catch {
            return s;
          }
        }
      });
    },
    [fail],
  );

  const move = useCallback((action: PattiAction) => apply(0, action), [apply]);

  const bust = !!state?.result && state.players[0].chips <= 0;

  const next = useCallback(() => {
    setState((s) => {
      if (!s || !s.result || s.players[0].chips <= 0) return s;
      const c = structuredClone(s);
      const back: Seat[] = [];
      for (const x of SEATS) {
        if (x !== 0 && c.players[x].chips <= 0) {
          c.players[x].chips = c.rules.startChips;
          back.push(x);
        }
      }
      setReloaded(back);
      return startDeal(c);
    });
    sfx.flip();
  }, []);

  const rebuy = useCallback(async () => {
    if (!session.current) return;
    try {
      await soloRebuy(session.current);
    } catch (e) {
      coinFail(e);
      return;
    }
    setState((s) => {
      if (!s) return s;
      const c = structuredClone(s);
      c.players[0].chips = c.rules.startChips;
      for (const x of SEATS) if (x !== 0 && c.players[x].chips <= 0) c.players[x].chips = c.rules.startChips;
      setReloaded([]);
      return startDeal(c);
    });
    sfx.confirm();
  }, [coinFail]);

  const leave = useCallback(() => {
    const id = session.current;
    session.current = null;
    if (id) void soloSettle(id, { chips: chipsNow.current }).catch(() => {});
  }, []);

  // closing the app mid-session still cashes your chips out
  useEffect(() => {
    const bye = () => {
      if (session.current) settleOnExit(session.current, chipsNow.current);
      session.current = null;
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);

  // tell the server your chips after every deal (they're cashed out from there if the app is closed)
  const myChips = state?.result ? state.players[0].chips : null;
  useEffect(() => {
    if (myChips === null) return;
    chipsNow.current = myChips;
    if (session.current) soloReport(session.current, myChips);
  }, [myChips]);

  usePattiSounds(state);

  // the computer players
  useEffect(() => {
    if (!state || state.result || paused) return;
    const who: Seat = state.pending ? state.pending.to : state.turn;
    if (who === 0) return;
    const t = window.setTimeout(() => apply(who, chooseAction(state, who, TEMPERS[who])), thinkMs(state));
    return () => window.clearTimeout(t);
  }, [state, paused, apply]);

  // your clock: pack when it runs out; a sideshow you don't answer is refused
  const yourMove = !!state && !state.result && (state.pending ? state.pending.to === 0 : state.turn === 0);
  // only restart the clock when a different turn begins (your own "see" doesn't count)
  const clockKey = state ? `${state.dealNo}:${state.pending ? "ss" : state.turn}:${state.events.filter((e) => e.type !== "see").length}` : "none";
  useEffect(() => {
    if (!state || !yourMove || paused) return;
    const pending = state.pending;
    const t = window.setTimeout(
      () => apply(0, pending ? { type: "sideshowReply", accept: false } : { type: "pack", auto: true }),
      (pending ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS) * 1000,
    );
    return () => window.clearTimeout(t);
    // the clock depends on whose move it is, not on every state change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockKey, yourMove, paused, apply]);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  return { state, table, start, move, next, rebuy, leave, bust, error, turnKey: clockKey, reloaded };
}

/** Sounds for what just happened at a 3 Patti table (chips, packs, the end of a deal). */
export function usePattiSounds(state: PattiState | null) {
  const heard = useRef({ deal: -1, n: 0 });
  useEffect(() => {
    if (!state) return;
    const evs = state.events;
    if (heard.current.deal !== state.dealNo || evs.length < heard.current.n) heard.current = { deal: state.dealNo, n: 0 };
    for (const e of evs.slice(heard.current.n)) {
      if (e.type === "boot") sfx.chips(true);
      else if (e.type === "chaal") sfx.chips(e.raise || e.allIn);
      else if (e.type === "pack") sfx.pack();
      else if (e.type === "see" && e.seat === 0) sfx.flip();
      else if (e.type === "show" || e.type === "sideshowAsk") sfx.chips(false);
      else if (e.type === "sideshowReply") sfx.flip();
      else if (e.type === "end" && state.result) {
        const w = state.result.won[0] > 0;
        window.setTimeout(() => (w ? sfx.win() : state.result!.shown.includes(0) ? sfx.lose() : sfx.gather()), 350);
      }
    }
    heard.current.n = evs.length;
  }, [state]);
}
