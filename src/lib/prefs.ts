"use client";

import { useSyncExternalStore } from "react";
import { type CharacterId, isCharacterId } from "./characters";

/** Per-device settings, kept in localStorage. Everything works without storage too. */
export interface Prefs {
  name: string;
  character: CharacterId | null;
  /** 0..1 */
  sfxVolume: number;
  ambience: boolean;
  /** Master mute for every sound. */
  muted: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  name: "",
  character: null,
  sfxVolume: 0.7,
  ambience: true,
  muted: false,
  reduceMotion: false,
};

export const NAME_MAX = 16;

const KEY = "liars-rung:prefs";
const listeners = new Set<() => void>();
let current: Prefs = DEFAULT_PREFS;
let loaded = false;

export function cleanName(v: unknown) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "")
    .slice(0, NAME_MAX);
}

function clean(v: unknown): Prefs {
  const o = (v ?? {}) as Partial<Record<keyof Prefs, unknown>>;
  const vol = Number(o.sfxVolume);
  return {
    name: cleanName(o.name),
    character: isCharacterId(o.character) ? o.character : null,
    sfxVolume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : DEFAULT_PREFS.sfxVolume,
    ambience: typeof o.ambience === "boolean" ? o.ambience : DEFAULT_PREFS.ambience,
    muted: typeof o.muted === "boolean" ? o.muted : DEFAULT_PREFS.muted,
    reduceMotion: typeof o.reduceMotion === "boolean" ? o.reduceMotion : DEFAULT_PREFS.reduceMotion,
  };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = clean(JSON.parse(raw));
  } catch {
    current = DEFAULT_PREFS;
  }
}

export function getPrefs(): Prefs {
  load();
  return current;
}

export function setPrefs(patch: Partial<Prefs>) {
  load();
  current = clean({ ...current, ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode or storage blocked: settings last for this visit only.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}
