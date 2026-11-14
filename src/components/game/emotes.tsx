"use client";

import clsx from "clsx";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { playEmoteSound } from "@/lib/emote-sounds";
import { STICKERS } from "@/lib/stickers";
import { Sticker } from "./sticker";
import "./emotes.css";

/** A chat message or emote at the table; `live` when it arrived while you were watching (not history). */
export type LiveChat = {
  id: string;
  name: string;
  seat: 0 | 1 | 2 | 3 | null;
  text?: string;
  sticker?: string;
  live?: boolean;
  playerId?: string;
  at?: number;
};

/** How long after an emote before the next one can go (it's still flying). */
const COOLDOWN_MS = 2400;

/**
 * Emotes, game style: a button by your portrait opens the deck, a tap sends one, and it bursts out of
 * your portrait for everyone at the table. They never show up in the chat.
 */
export function useEmotes(send: (m: { sticker: string }) => unknown) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const pick = (sticker: string) => {
    setOpen(false);
    if (cooling) return;
    playEmoteSound(sticker);
    void send({ sticker });
    setCooling(Date.now());
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCooling(0), COOLDOWN_MS);
  };
  return { open, setOpen, toggle: () => setOpen((v) => !v), pick, cooling };
}

export type Emotes = ReturnType<typeof useEmotes>;

/** The round emote button: a speech bubble with a grin, and a cooldown ring after each emote. */
export function EmoteButton({ emotes, className }: { emotes: Emotes; className?: string }) {
  return (
    <button
      type="button"
      className={clsx("emote-btn", emotes.open && "is-open", emotes.cooling && "is-cooling", className)}
      onClick={emotes.toggle}
      aria-label="Emotes"
      aria-expanded={emotes.open}
    >
      <svg viewBox="0 0 40 40" aria-hidden>
        <path
          d="M20 6C29.5 6 35 11.5 35 18.5S29.5 31 20 31C18 31 16.2 30.8 14.6 30.3L8 34 9.6 27.4C6.8 25.2 5 22 5 18.5 5 11.5 10.5 6 20 6Z"
          fill="#fff"
          stroke="#0b231a"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <circle cx="15" cy="16" r="2" fill="#0b231a" />
        <circle cx="25" cy="16" r="2" fill="#0b231a" />
        <path d="M13.5 21Q20 27.5 26.5 21Z" fill="#0b231a" stroke="#0b231a" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {emotes.cooling > 0 && <span key={emotes.cooling} className="emote-cool" style={{ "--cool": `${COOLDOWN_MS}ms` } as CSSProperties} />}
    </button>
  );
}

/** The deck: every emote as a big tile, springing open from the emote button. */
export function EmoteDeck({ emotes, onSay }: { emotes: Emotes; onSay?: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (!emotes.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && emotes.setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emotes]);
  if (!emotes.open) return null;
  return (
    <>
      <div className="emote-backdrop" onClick={() => emotes.setOpen(false)} aria-hidden />
      <div className="emote-deck" role="dialog" aria-label="Emotes">
        <div className="emote-grid">
          {STICKERS.map((s) => (
            <button key={s.id} type="button" className="emote-tile" onClick={() => emotes.pick(s.id)} aria-label={s.label}>
              <Sticker id={s.id} size={56} />
            </button>
          ))}
        </div>
        {onSay && (
          <form
            className="emote-say"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.replace(/\s+/g, " ").trim();
              if (!text) return;
              onSay(text.slice(0, 140));
              setDraft("");
              emotes.setOpen(false);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something…"
              maxLength={140}
              enterKeyHint="send"
              autoComplete="off"
              aria-label="Message"
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
              </svg>
            </button>
          </form>
        )}
      </div>
    </>
  );
}

/** Which way an emote flies out of each seat's portrait: towards the middle of the table. */
const FLY: Record<0 | 1 | 2 | 3, [number, number]> = { 0: [0, -84], 1: [-80, 6], 2: [0, 78], 3: [80, 6] };

/** The latest emote or message from a seat, bursting out of its portrait. */
export function Burst({ message, rel }: { message?: LiveChat; rel: 0 | 1 | 2 | 3 }) {
  if (!message?.live) return null;
  const [dx, dy] = FLY[rel];
  const style = { "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties;
  return message.sticker ? (
    <div key={message.id} className="emote-burst" style={style} aria-live="polite" aria-label={`${message.name}: ${message.sticker}`}>
      <Sticker id={message.sticker} size={96} />
    </div>
  ) : (
    <div key={message.id} className={clsx("say-burst", rel === 1 && "from-right")} style={style} aria-live="polite">
      {message.text}
    </div>
  );
}
