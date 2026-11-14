"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CHARACTERS } from "@/lib/characters";
import type { PaanchAction } from "@/lib/paanch/engine";
import type { PaanchView } from "@/lib/paanch/view";
import type { RoomView } from "@/lib/online/types";
import { type PaanchGame, usePaanchSounds } from "./use-paanch";

const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
/** The server's seat as this phone sees it (you always sit in seat 0). Paanch is played 2- or 4-handed. */
const rot = (seat: number, mine: number, n: number) => (((seat - mine) % n) + n) % n;

/**
 * A Paanch board with friends, as the Paanch screen wants it. The server holds the hands, moves the
 * computer players and runs the clock; this phone sends your moves and, when someone's time is up,
 * asks the server to move on.
 */
export function usePaanchOnline(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  error: string | null,
): { game: PaanchGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const extra = room?.extra ?? null;
  const view = extra && extra.game === "paanch" ? extra : null;
  const state = (view?.state ?? null) as PaanchView | null;
  usePaanchSounds(state);

  const n = state?.players ?? 0;
  const seats = useMemo(() => {
    if (!view || !n) return null;
    const mine = view.mySeat ?? 0;
    const chars = Array.from({ length: n }, (_, i) => i);
    const names = Array.from({ length: n }, () => "");
    const bots = Array.from({ length: n }, () => false);
    for (const p of view.players) {
      const s = rot(p.seat, mine, n);
      if (s >= n) continue;
      chars[s] = charIndex(p.avatar);
      names[s] = p.name;
      bots[s] = p.isBot;
    }
    return { chars, names, bots };
  }, [view, n]);

  // Whoever is on the move is out of time: ask the server to play for them. Any phone at the table may
  // ask, so they are spread out a little; the server ignores one that comes too early.
  const deadlineIn = room?.turnDeadlineIn ?? null;
  const version = room?.version;
  const mySeat = view?.mySeat ?? 0;
  const live = !!state && !state.result;
  // when this countdown reached us, so that a re-render doesn't start it over
  const seenAt = useRef(0);
  useEffect(() => {
    seenAt.current = Date.now();
  }, [deadlineIn, version]);
  useEffect(() => {
    if (deadlineIn === null || !live) return;
    const left = deadlineIn - (Date.now() - seenAt.current);
    const t = window.setTimeout(() => void act("extraTick"), Math.max(0, left) + 250 + mySeat * 400);
    return () => window.clearTimeout(t);
  }, [deadlineIn, version, live, mySeat, act]);

  // one move at a time: a double tap would otherwise play the same card twice
  const sending = useRef(false);
  const move = useCallback(
    (a: PaanchAction) => {
      if (sending.current) return;
      sending.current = true;
      void act("extraMove", { move: a }).finally(() => {
        sending.current = false;
      });
    },
    [act],
  );
  // a table plays one board: there is no "again" here, you leave and sit down somewhere else
  const noAgain = useCallback(async () => false, []);
  const noop = useCallback(() => {}, []);

  if (!view || !state || !seats) return null;
  return {
    game: {
      state,
      // online the table pays out by itself, and leaving is the lobby's business
      start: noAgain,
      move,
      leave: noop,
      error,
      turnKey: `${state.moveNo}:${state.turn}:${state.result ? "end" : ""}`,
      online: true,
    },
    seatChars: seats.chars,
    names: seats.names,
    bots: seats.bots,
  };
}
