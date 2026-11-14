"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CHARACTERS } from "@/lib/characters";
import type { Card } from "@/lib/game/cards";
import type { BhabhiState } from "@/lib/bhabhi/engine";
import type { BhabhiView } from "@/lib/bhabhi/view";
import type { RoomView } from "@/lib/online/types";
import { type BhabhiGame, useBhabhiSounds } from "./use-bhabhi";

const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
/** The server's seat as this phone sees it (you always sit in seat 0). Bhabhi seats three to six. */
const rot = (seat: number, mine: number, n: number) => (((seat - mine) % n) + n) % n;

/**
 * The cards another seat holds are nobody's business, so the server only sends how many there are.
 * The screen counts them, so they stand in as cards that can't be read.
 */
const hidden = (seat: number, count: number): Card[] => Array.from({ length: count }, (_, i) => `#${seat}:${i}`);

/**
 * A Bhabhi table with friends, as the Bhabhi screen wants it: the server's view of your seat, turned
 * back into the state the screen reads. The server deals, moves the computer players and runs the
 * clock; this phone sends your card and nudges the server when someone's time is up.
 */
export function useBhabhiOnline(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  error: string | null,
): { game: BhabhiGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const extra = room?.extra ?? null;
  const view = extra && extra.game === "bhabhi" ? extra : null;
  const seen = (view?.state ?? null) as BhabhiView | null;

  const state = useMemo<BhabhiState | null>(() => {
    if (!seen) return null;
    const hands = seen.counts.map((c, s) => (s === 0 ? seen.hand.slice() : hidden(s, c)));
    return { ...seen, hands };
  }, [seen]);
  useBhabhiSounds(state);

  const n = seen?.players ?? 0;
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
  const live = !!state && state.bhabhi === null;
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

  // one card at a time: a double tap would otherwise play two
  const sending = useRef(false);
  const move = useCallback(
    (card: Card) => {
      if (sending.current) return;
      sending.current = true;
      void act("extraMove", { move: { type: "play", card } }).finally(() => {
        sending.current = false;
      });
    },
    [act],
  );
  // a table plays one game: there is no "again" here, you leave and sit down somewhere else
  const noAgain = useCallback(async () => false, []);
  const noop = useCallback(() => {}, []);

  if (!view || !state || !seats) return null;
  return {
    game: {
      state,
      // online the table pays out by itself, and leaving is the lobby's business
      start: noAgain,
      move,
      finish: noop,
      leave: noop,
      error,
      turnKey: state.turn === 0 ? `${state.seq}` : "wait",
      online: true,
    },
    seatChars: seats.chars,
    names: seats.names,
    bots: seats.bots,
  };
}
