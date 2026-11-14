"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { keepAwake } from "@/lib/nearby/peer";
import type { NearbyClient, NearbySnapshot } from "@/lib/nearby/session";

const NONE: NearbySnapshot = { room: null, chat: [], live: false, ended: null };
const noSub = () => () => {};

/**
 * A nearby table in the same shape as useOnlineRoom, so the lobby, Rung and 3 Patti screens take it
 * unchanged: { room, error, pending, live, act, chat, sendChat, clearError }, plus `ended` (why this
 * phone is no longer at the table).
 */
export function useNearbyRoom(client: NearbyClient | null) {
  const snap = useSyncExternalStore(
    client ? (fn) => client.subscribe(fn) : noSub,
    client ? () => client.snapshot() : () => NONE,
    () => NONE,
  );
  const [error, setErrorState] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const setError = useCallback((m: string | null) => {
    setErrorState(m);
    window.clearTimeout(timer.current);
    if (m) timer.current = window.setTimeout(() => setErrorState(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // At the table: keep the screen on (a locked phone drops the connection), and say goodbye when the
  // page really closes so the others aren't left waiting.
  const ended = snap.ended;
  useEffect(() => {
    if (!client || ended) return;
    let release: (() => void) | null = null;
    let gone = false;
    void keepAwake().then((r) => (gone ? r() : (release = r)));
    const bye = (e: PageTransitionEvent) => {
      if (!e.persisted) client.leave();
    };
    window.addEventListener("pagehide", bye);
    return () => {
      gone = true;
      release?.();
      window.removeEventListener("pagehide", bye);
    };
  }, [client, ended]);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      if (!client) return;
      setPending(true);
      try {
        await client.act(action, extra);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPending(false);
      }
    },
    [client, setError],
  );
  const sendChat = useCallback(
    async (msg: { text?: string; sticker?: string }) => {
      if (!client) return;
      try {
        await client.sendChat(msg);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [client, setError],
  );

  return {
    room: client ? snap.room : null,
    error: error ?? snap.ended,
    pending,
    live: snap.live,
    act,
    chat: snap.chat,
    sendChat,
    ended: snap.ended,
    clearError: () => setError(null),
  };
}
