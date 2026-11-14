"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { sfx } from "@/lib/sfx";
import { GPATTA_TURN_SECONDS, type Card, type GPattaAction, type GPattaState } from "@/lib/gpatta/engine";
import type { GPattaView } from "@/lib/gpatta/view";
import type { RoomView } from "@/lib/online/types";
import { type GPattaGame, playStep, useAutoPairs } from "./use-gpatta";

const ME = 0;
const charIndex = (id: string | undefined) => Math.max(0, CHARACTERS.findIndex((c) => c.id === id));
/** The server's seat as this phone sees it (you always sit in seat 0). G Patta seats two to six. */
const rot = (seat: number, mine: number, n: number) => (((seat - mine) % n) + n) % n;

/**
 * A G Patta table with friends, as the G Patta screen wants it: the server's view of your seat turned
 * back into the state the screen reads. Cards in other hands are face down there, so they stand in as
 * blanks — the screen only counts them and draws their backs.
 */
export function useGPattaOnline(
  room: RoomView | null,
  act: (action: string, extra?: Record<string, unknown>) => Promise<void>,
  error: string | null,
  paused: boolean,
): { game: GPattaGame; seatChars: number[]; names: string[]; bots: boolean[] } | null {
  const extra = room?.extra ?? null;
  const view = extra && extra.game === "gpatta" ? extra : null;
  const seen = (view?.state ?? null) as GPattaView | null;
  const [autoPairs, setAutoPairs] = useAutoPairs();

  const state = useMemo<GPattaState | null>(() => {
    if (!seen) return null;
    return {
      ...seen,
      // your own cards are real; a face-down card elsewhere is a blank the screen only counts and
      // draws the back of. Watching the table, nobody's cards are yours, so your hand is empty.
      players: seen.players.map((p, i) => ({
        hand: (i === ME ? p.hand.filter((c): c is Card => c !== null) : (p.hand as Card[])),
        ready: p.ready,
        place: p.place,
      })),
      deck: Array.from({ length: seen.deckCount }, () => seen.out),
    };
  }, [seen]);

  // every step animates (and sounds) before the table moves on, exactly as it does playing alone
  const seq = state?.seq ?? -1;
  const events = state?.events;
  const [doneSeq, setDoneSeq] = useState(-1);
  const busy = !!state && seq !== doneSeq;
  const latest = useRef<typeof events>(undefined);
  useEffect(() => {
    latest.current = events;
  }, [events]);
  // a step is its number: the same view, fetched again, must not play it twice
  useEffect(() => {
    const step = latest.current;
    if (!step || seq < 0) return;
    const { timers, total } = playStep(step);
    timers.push(window.setTimeout(() => setDoneSeq(seq), total + 60));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [seq]);

  const n = seen?.n ?? 0;
  const seats = useMemo(() => {
    if (!view || !n) return null;
    const chars = Array.from({ length: n }, (_, i) => i);
    const names = Array.from({ length: n }, () => "");
    const bots = Array.from({ length: n }, () => false);
    const mine = view.mySeat ?? 0;
    for (const p of view.players) {
      const s = rot(p.seat, mine, n);
      if (s >= n) continue;
      chars[s] = charIndex(p.avatar);
      names[s] = p.name;
      bots[s] = p.isBot;
    }
    return { chars, names, bots };
  }, [view, n]);

  // one move at a time: a double tap would otherwise take two cards
  const sending = useRef(false);
  const send = useCallback(
    (move: GPattaAction) => {
      if (sending.current) return;
      sending.current = true;
      void act("extraMove", { move }).finally(() => {
        sending.current = false;
      });
    },
    [act],
  );

  // Whoever is on the move is out of time (or the table owes a step of its own, like the deal): ask the
  // server for it — but not before this step has finished animating, or it would be cut short. Any phone
  // at the table may ask, so they are spread out a little; the server ignores one that comes too early.
  const deadlineIn = room?.turnDeadlineIn ?? null;
  const version = room?.version;
  const mySeat = view?.mySeat ?? 0;
  const live = !!state && state.phase !== "over";
  // when this countdown reached us, so that the animation doesn't start it over
  const seenAt = useRef(0);
  useEffect(() => {
    seenAt.current = Date.now();
  }, [deadlineIn, version]);
  useEffect(() => {
    if (deadlineIn === null || !live || busy) return;
    const left = deadlineIn - (Date.now() - seenAt.current);
    const t = window.setTimeout(() => void act("extraTick"), Math.max(0, left) + 250 + mySeat * 400);
    return () => window.clearTimeout(t);
  }, [deadlineIn, version, live, busy, mySeat, act]);

  const myPairs = state?.phase === "pairs" && !state.players[ME].ready;
  const waiting = !!state && !busy && ((state.phase === "draw" && state.turn === ME) || (!!myPairs && !autoPairs));
  const clockKey = waiting && state ? `${seq}:${state.phase}` : "";

  // your clock: the server plays for you when it runs out, this is only the sound of it running down
  useEffect(() => {
    if (!clockKey || paused) return;
    sfx.turn();
    const timers = [5, 4, 3, 2, 1].map((s) => window.setTimeout(() => sfx.tick(), (GPATTA_TURN_SECONDS - s) * 1000));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [clockKey, paused]);

  // your opening pairs, thrown for you
  useEffect(() => {
    if (!myPairs || !autoPairs || busy || paused) return;
    const t = window.setTimeout(() => send({ type: "throw" }), 250);
    return () => window.clearTimeout(t);
  }, [myPairs, autoPairs, busy, paused, send]);

  const pick = useCallback(
    (index: number) => {
      if (waiting && state?.phase === "draw") send({ type: "draw", index });
    },
    [waiting, state?.phase, send],
  );
  const pair = useCallback(
    (a: number, b: number) => {
      if (myPairs && !busy) send({ type: "pair", a, b });
    },
    [myPairs, busy, send],
  );
  const throwAll = useCallback(() => {
    if (myPairs && !busy) send({ type: "throw" });
  }, [myPairs, busy, send]);
  // a table plays one game: there is no "again" here, you leave and sit down somewhere else
  const noAgain = useCallback(async () => false, []);
  const noop = useCallback(() => {}, []);

  if (!view || !state || !seats) return null;
  return {
    game: {
      state,
      // online the table pays out by itself, and leaving is the lobby's business
      start: noAgain,
      pick,
      pair,
      throwAll,
      autoPairs,
      setAutoPairs,
      waiting,
      busy,
      clockKey,
      error,
      leave: noop,
      online: true,
    },
    seatChars: seats.chars,
    names: seats.names,
    bots: seats.bots,
  };
}
