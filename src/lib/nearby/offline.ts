"use client";

import { useSyncExternalStore } from "react";
import { CoinError } from "@/lib/wallet/client";

/**
 * Coins without the internet. Coins live on the game server, so with no connection:
 * - games against the computer are free practice: nothing is charged and nothing is paid out;
 * - nearby tables (phones on the same Wi-Fi or hotspot) are always free and never pay out.
 * The server's wallet rules are not touched; this only decides whether a game may start without them.
 */

/** Label shown on nearby tables and offline practice. */
export const NEARBY_LABEL = "Nearby · free";
export const OFFLINE_LABEL = "Offline · practice";

/** True when a wallet call failed only because the server couldn't be reached (not "not enough coins"). */
export function isOfflineError(e: unknown): boolean {
  return e instanceof CoinError && e.status === 0;
}

/**
 * Wrap a paid start: if the server answers, its charge stands; if it can't be reached, the game starts
 * as free practice and `session` is null (so nothing is settled later). Other errors are thrown as before.
 */
export async function payOrPractice<T extends { session: string }>(pay: () => Promise<T>): Promise<{ session: string | null; practice: boolean }> {
  try {
    const r = await pay();
    return { session: r.session, practice: false };
  } catch (e) {
    if (isOfflineError(e)) return { session: null, practice: true };
    throw e;
  }
}

const navigatorOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

function subscribe(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

/** Whether the phone thinks it has a network (a hint only: café Wi-Fi without internet still says yes). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, navigatorOnline, () => true);
}
