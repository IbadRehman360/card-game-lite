"use client";

import { useSyncExternalStore } from "react";

/**
 * How much the 3D tavern may cost this device.
 *  - high: desktops and laptops: shadows, sharp resolution, every light.
 *  - mid:  ordinary phones and tablets: no shadows, capped resolution.
 *  - low:  slow phones: few lights, low resolution, 30 fps, no blur effects.
 *
 * Picked from the hardware on first visit; if frames still drop while playing, the stage steps down
 * on its own and the phone remembers it. The player can also force it in Settings.
 */
export type PerfTier = "low" | "mid" | "high";
export type Quality = "auto" | "low" | "high";

const KEY = "baazi:quality";
const LEARNED = "baazi:quality-learned";

const listeners = new Set<() => void>();
let quality: Quality = "auto";
let learned: PerfTier | null = null;
let loaded = false;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, v);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const q = read(KEY);
  if (q === "low" || q === "high" || q === "auto") quality = q;
  const l = read(LEARNED);
  if (l === "low" || l === "mid") learned = l;
}

/** What the hardware suggests, before any frames are measured. */
function detect(): PerfTier {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const saveData = nav.connection?.saveData === true;
  if (saveData || mem <= 2 || cores <= 2) return "low";
  if (touch && (mem <= 4 || cores <= 4)) return "low";
  // Android browsers on big, dense screens push a lot of pixels; start them light
  if (touch && /Android/i.test(navigator.userAgent) && mem <= 6) return "low";
  if (touch) return "mid";
  return "high";
}

export function perfTier(): PerfTier {
  load();
  if (quality === "low") return "low";
  if (quality === "high") return "high";
  const d = detect();
  if (!learned) return d;
  // a learned step-down only ever lowers the tier
  const rank = { low: 0, mid: 1, high: 2 } as const;
  return rank[learned] < rank[d] ? learned : d;
}

export function getQuality(): Quality {
  load();
  return quality;
}

export function setQuality(q: Quality) {
  load();
  quality = q;
  write(KEY, q);
  // choosing again wipes what the stage learned
  learned = null;
  write(LEARNED, null);
  apply();
}

/** Frames were too slow at this tier: step down one, and remember it on this phone. */
export function stepDown() {
  load();
  if (quality !== "auto") return;
  const t = perfTier();
  if (t === "low") return;
  learned = t === "high" ? "mid" : "low";
  write(LEARNED, learned);
  apply();
}

function apply() {
  if (typeof document !== "undefined") document.documentElement.dataset.perf = perfTier();
  for (const l of listeners) l();
}

/** Marks <html data-perf="..."> so CSS can drop expensive effects on slow phones. */
export function markPerf() {
  if (typeof document !== "undefined") document.documentElement.dataset.perf = perfTier();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePerfTier(): PerfTier {
  return useSyncExternalStore(subscribe, perfTier, () => "high" as PerfTier);
}

export function useQuality(): Quality {
  return useSyncExternalStore(subscribe, getQuality, () => "auto" as Quality);
}
