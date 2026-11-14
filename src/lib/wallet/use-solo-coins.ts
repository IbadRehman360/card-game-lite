"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameKind, Outcome } from "./economy";
import { CoinError, openShop, openSolo, settleOnExit, soloSettle } from "./client";

export interface SoloCoins {
  /** What one game costs. Always 0: playing against the computer is free. */
  fee: number;
  /** Opens the game. Free, so this only fails when the server can't be reached. */
  pay: () => Promise<boolean>;
  /** The game is decided: settle it once (later calls for the same game do nothing). */
  settle: (outcome: Pick<Outcome, "won" | "draw" | "place" | "players">) => void;
  /** Leaving mid-game: it's forfeited. */
  forfeit: () => void;
  /** Coins the last settled game paid. Always 0 against the computer: coins are won at a table with friends. */
  paid: number | null;
}

/**
 * One game against the computer: it costs nothing and pays nothing, but the server still opens and
 * closes a session for it (so a game left open is tidied up when the next one starts).
 */
export function useSoloCoins(game: GameKind): SoloCoins {
  const session = useRef<string | null>(null);
  const [paid, setPaid] = useState<number | null>(null);

  const pay = useCallback(async () => {
    try {
      // an unfinished game left open is forfeited by the server when this one opens
      session.current = (await openSolo(game)).session;
      setPaid(null);
      return true;
    } catch (e) {
      if (e instanceof CoinError) openShop({ need: e.short, message: e.message });
      else openShop({ message: "Couldn't reach the game server" });
      return false;
    }
  }, [game]);

  const settle = useCallback((outcome: Pick<Outcome, "won" | "draw" | "place" | "players">) => {
    const id = session.current;
    if (!id) return;
    session.current = null;
    soloSettle(id, outcome)
      .then((r) => setPaid(r.paid))
      .catch(() => setPaid(0));
  }, []);

  const forfeit = useCallback(() => {
    const id = session.current;
    if (!id) return;
    session.current = null;
    void soloSettle(id, {}).catch(() => {});
  }, []);

  useEffect(() => {
    const bye = () => {
      if (session.current) settleOnExit(session.current);
      session.current = null;
    };
    window.addEventListener("pagehide", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      bye();
    };
  }, []);

  return { fee: 0, pay, settle, forfeit, paid };
}
