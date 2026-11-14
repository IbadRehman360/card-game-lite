"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { CHARACTERS } from "@/lib/characters";
import type { BluffAction, BluffState } from "@/lib/bluff/engine";
import type { RoomView } from "@/lib/online/types";
import { type BluffGame, bluffTurnKey, useBluffSounds } from "./use-bluff";

/** Bluff is always played four-handed. */
const SEATS = 4;

const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
/** The server's seat as this phone sees it (you always sit in seat 0). */
const rot = (seat: number, mine: number) => (((seat - mine) % SEATS) + SEATS) % SEATS;

/**
 * A Bluff table with friends, as the Bluff screen wants it. The server holds the cards, moves the
 * computer players and runs the clock; this phone only sends your moves and, when someone's time is
 * up, asks the server to move on.
 */
export function useBluffOnline(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  error: string | null,
): { game: BluffGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const extra = room?.extra ?? null;
  const view = extra && extra.game === "bluff" ? extra : null;
  const state = (view?.state ?? null) as BluffState | null;
  useBluffSounds(state);

  const seats = useMemo(() => {
    if (!view) return null;
    const mine = view.mySeat ?? 0;
    const chars = Array.from({ length: SEATS }, (_, i) => i);
    const names = Array.from({ length: SEATS }, () => "");
    const bots = Array.from({ length: SEATS }, () => false);
    for (const p of view.players) {
      const s = rot(p.seat, mine);
      if (s >= SEATS) continue;
      chars[s] = charIndex(p.avatar);
      names[s] = p.name;
      bots[s] = p.isBot;
    }
    return { chars, names, bots };
  }, [view]);

  // When whoever is on the move runs out of time (a computer's thinking time, a person's clock, or the
  // moment the table shows the next round), ask the server to move on. Any phone at the table may ask,
  // so they are spread out a little; the server ignores one that comes too early or too late.
  const deadlineIn = room?.turnDeadlineIn ?? null;
  const version = room?.version;
  const mySeat = view?.mySeat ?? 0;
  const live = !!view && !!state && state.phase !== "over";
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

  // one move at a time: a double tap would otherwise be played twice
  const sending = useRef(false);
  const move = useCallback(
    (a: BluffAction) => {
      if (sending.current) return;
      sending.current = true;
      void act("extraMove", { move: a }).finally(() => {
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
      next: noop,
      leave: noop,
      error,
      turnKey: bluffTurnKey(state),
      online: true,
    },
    seatChars: seats.chars,
    names: seats.names,
    bots: seats.bots,
  };
}
