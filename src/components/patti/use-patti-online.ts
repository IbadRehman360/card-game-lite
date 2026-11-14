"use client";

import { useCallback, useEffect, useMemo } from "react";
import { CHARACTERS } from "@/lib/characters";
import { type PattiAction, type Seat, TABLES } from "@/lib/patti/engine";
import type { RoomView } from "@/lib/online/types";
import { type PattiGame, usePattiSounds } from "./use-patti";

const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
const rot = (seat: Seat, mine: Seat) => ((((seat - mine) % 4) + 4) % 4) as Seat;

/**
 * A 3 Patti table with friends, as the 3 Patti screen wants it. The server holds the cards and moves the
 * computer players; when someone's time is up (a computer's thinking time, or a person's clock) this phone
 * asks the server to move for them.
 */
export function usePattiOnline(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  error: string | null,
): { game: PattiGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const view = room?.patti ?? null;
  const state = view?.state ?? null;
  usePattiSounds(state);

  const seats = useMemo(() => {
    if (!view) return null;
    const mine = view.mySeat ?? 0;
    const chars = [0, 1, 2, 3];
    const names = ["", "", "", ""];
    const bots = [false, false, false, false];
    for (const p of view.players) {
      const s = rot(p.seat, mine);
      chars[s] = charIndex(p.avatar);
      names[s] = p.name;
      bots[s] = p.isBot;
    }
    return { chars, names, bots };
  }, [view]);

  // when the player on the move is out of time, ask the server to move for them
  const deadlineIn = room?.turnDeadlineIn ?? null;
  const version = room?.version;
  const over = !!state?.result;
  useEffect(() => {
    if (deadlineIn === null || over || !view) return;
    const t = window.setTimeout(() => void act("tick"), deadlineIn + 250);
    return () => window.clearTimeout(t);
  }, [deadlineIn, version, over, view, act]);

  const move = useCallback((a: PattiAction) => void act("patti", { move: a }), [act]);
  const next = useCallback(() => void act("next"), [act]);
  const noop = useCallback(() => {}, []);

  if (!view || !state || !seats) return null;
  const table = TABLES.find((t) => t.boot === state.rules.boot)?.id ?? "low";
  const turnKey = `${state.dealNo}:${state.pending ? "ss" : state.turn}:${state.events.filter((e) => e.type !== "see").length}`;
  return {
    game: {
      state,
      table,
      start: noop,
      move,
      next,
      // online, everyone out of chips buys back in when the next deal starts
      rebuy: next,
      bust: false,
      error,
      turnKey,
      reloaded: [],
    },
    seatChars: seats.chars,
    names: seats.names,
    bots: seats.bots,
  };
}
