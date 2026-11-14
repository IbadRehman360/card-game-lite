"use client";

import { useSyncExternalStore } from "react";

/**
 * The installable app: the service worker (offline play and updates) and the browser's install offer.
 * One small store; the install button and the update toast read it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallState = "unavailable" | "prompt" | "ios" | "installed";

interface PwaState {
  install: InstallState;
  /** A new version is downloaded and waiting. */
  update: boolean;
}

let state: PwaState = { install: "unavailable", update: false };
const SERVER: PwaState = state;
let deferred: BeforeInstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
// iPadOS says it's a Mac with a touch screen
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const installState = (): InstallState => (standalone() ? "installed" : deferred ? "prompt" : ios() ? "ios" : "unavailable");

let started = false;

/** Starts the service worker and listens for the install offer. Safe to call more than once. */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  set({ install: installState() });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ install: installState() });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ install: "installed" });
  });

  // only built apps get a worker: in development it would serve stale code
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const watch = (w: ServiceWorker | null) => {
        if (!w) return;
        const check = () => {
          // "installed" with a page already controlled: an update, not the first install
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            waiting = w;
            set({ update: true });
          }
        };
        check();
        w.addEventListener("statechange", check);
      };
      watch(reg.waiting);
      reg.addEventListener("updatefound", () => watch(reg.installing));
      // look for a new version when the app comes back to the front
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void reg.update().catch(() => {});
      });
      warm();
    } catch {}
  };
  if (document.readyState === "complete") void register();
  else window.addEventListener("load", () => void register(), { once: true });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!waiting || reloading) return; // first install: nothing to reload
    reloading = true;
    window.location.reload();
  });
}

/** Sends the worker everything this page loaded, so it is all saved for offline. */
function warm() {
  const send = async () => {
    const reg = await navigator.serviceWorker.ready;
    const urls = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && !u.includes("/api/"));
    reg.active?.postMessage({ type: "WARM", urls });
  };
  // after the 3D room and sounds have loaded
  window.setTimeout(() => void send().catch(() => {}), 8000);
}

/** Install the app (when the browser offered it). */
export async function install() {
  if (!deferred) return;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  set({ install: outcome === "accepted" ? "installed" : installState() });
}

/** Switch to the waiting version now (the page reloads). */
export function applyUpdate() {
  if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}
export function dismissUpdate() {
  set({ update: false });
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}
