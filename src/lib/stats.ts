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

/** XP: 10 for every game played, 25 more for every win. */
export const xpFor = (stats: GameStats): number => {
  const t = totalStats(stats);
  return t.played * 10 + t.won * 25;
};

/** XP to climb from level n to n + 1: 100, 150, 200 ... */
const stepFor = (n: number) => 100 + (n - 1) * 50;

/** Level for a total of XP, how far into it, what it takes to reach the next, and that as 0..1. */
export function levelFor(xp: number): { level: number; xpInto: number; xpNeeded: number; progress: number } {
  let level = 1;
  let left = Math.max(0, Math.floor(xp) || 0);
  while (left >= stepFor(level)) {
    left -= stepFor(level);
    level++;
  }
  const xpNeeded = stepFor(level);
  return { level, xpInto: left, xpNeeded, progress: left / xpNeeded };
}

/** Your level, from the games played on this device. */
export function useLevel() {
  return levelFor(xpFor(useStats()));
}

/** A steady made-up level (3 to 40) for a computer player, from its name: the same name is always the same level. */
export function botLevel(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return 3 + ((h >>> 0) % 38);
}
