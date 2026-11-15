"use client";

import { useSyncExternalStore } from "react";
import type { GameKind } from "./wallet/economy";

/**
 * Games played and won on this device, per game, kept in localStorage (lost with site data; nothing is
 * sent anywhere). Recorded when a game against the computer is settled (see use-solo-coins and the
 * Rung match in main-menu).
 */
export type GameStats = Partial<Record<GameKind, { played: number; won: number }>>;

const KEY = "baazi:stats";
const EMPTY: GameStats = {};
const listeners = new Set<() => void>();
let current: GameStats = EMPTY;
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: GameStats = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
      const o = v as { played?: unknown; won?: unknown };
      const played = Math.max(0, Math.floor(Number(o?.played) || 0));
      if (played) out[k as GameKind] = { played, won: Math.min(played, Math.max(0, Math.floor(Number(o?.won) || 0))) };
    }
    current = out;
  } catch {
    current = EMPTY;
  }
}

/** One finished game. */
export function recordGame(game: GameKind, won: boolean) {
  load();
  const was = current[game] ?? { played: 0, won: 0 };
  current = { ...current, [game]: { played: was.played + 1, won: was.won + (won ? 1 : 0) } };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage blocked: counts last for this visit only
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getStats() {
  load();
  return current;
}

export function useStats(): GameStats {
  return useSyncExternalStore(subscribe, getStats, () => EMPTY);
}

/** Games whose results are counted (3 Patti is a cash game: no win or loss to count). */
export const COUNTED_GAMES: GameKind[] = ["rung", "bluff", "paanch", "bhabhi", "gpatta"];

/** Every counted game added up. */
export function totalStats(stats: GameStats): { played: number; won: number } {
  return COUNTED_GAMES.reduce(
    (a, g) => ({ played: a.played + (stats[g]?.played ?? 0), won: a.won + (stats[g]?.won ?? 0) }),
    { played: 0, won: 0 },
  );
}

/** Win rate as a whole percent (0 with no games). */
export const winPercent = (played: number, won: number) => (played ? Math.round((won / played) * 100) : 0);

/** Ranks by total wins: the first one at 0, each next one once `wins` is reached. */
export const RANKS = [
  { title: "Naya", wins: 0 },
  { title: "Khiladi", wins: 5 },
  { title: "Ustad", wins: 20 },
  { title: "Badshah", wins: 50 },
] as const;

/** The rank for a number of wins, and the next one (null at the top). */
export function rankFor(wins: number): { title: string; next: { title: string; wins: number } | null } {
  let i = 0;
  while (i + 1 < RANKS.length && wins >= RANKS[i + 1].wins) i++;
  const next = RANKS[i + 1] ?? null;
  return { title: RANKS[i].title, next: next ? { title: next.title, wins: next.wins } : null };
}
