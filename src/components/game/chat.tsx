"use client";

import clsx from "clsx";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { playEmoteSound } from "@/lib/emote-sounds";
import { sfx } from "@/lib/sfx";
import type { LiveChat } from "./emotes";
import "./emotes.css";

export interface ChatProps {
  messages: LiveChat[];
  /** Your player id, to tell your own messages apart. */
  myId: string;
  send: (m: { text?: string; sticker?: string }) => Promise<void> | void;
}

/** A sound when someone else's message or emote arrives live (your own play as you send them). */
export function useChatSound(messages: LiveChat[], myId: string) {
  const last = messages[messages.length - 1];
  const lastId = last?.live && last.playerId !== myId ? last.id : null;
  const sticker = last?.sticker;
  useEffect(() => {
    if (!lastId) return;
    if (sticker) playEmoteSound(sticker);
    else sfx.tick();
  }, [lastId, sticker]);
}

/** Emotes are sent through the same channel but never show up in the chat itself. */
const isText = (m: LiveChat) => !!m.text;

/** The table chat: written messages only. Emotes have their own button at the table. */
export function ChatPanel({ chat, onClose }: { chat: ChatProps; onClose: () => void }) {
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const messages = chat.messages.filter(isText);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    void chat.send({ text: t });
  };

  return (
    <div className="chat-backdrop" onClick={onClose}>
      <div className="chat-sheet" role="dialog" aria-label="Table chat" onClick={(e) => e.stopPropagation()}>
        <div className="chat-head">
          <h2>Table chat</h2>
          <button type="button" className="chat-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div ref={list} className="chat-list">
          {messages.length === 0 && <p className="chat-empty">No messages yet. Say salaam!</p>}
          {messages.map((m) => {
            const mine = m.playerId === chat.myId;
            return (
              <div key={m.id} className="chat-msg" data-mine={mine}>
                {!mine && <span className="chat-who">{m.name}</span>}
                <div className="chat-bubble">{m.text}</div>
              </div>
            );
          })}
        </div>
        <form onSubmit={submit} className="chat-form">
          <input
            className="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the table…"
            maxLength={140}
            enterKeyHint="send"
            aria-label="Message"
          />
          <button type="submit" className="chat-send" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

/** Opens the chat; shows how many messages arrived since it was last opened. */
export function ChatButton({ chat, className }: { chat: ChatProps; className?: string }) {
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const texts = chat.messages.filter(isText);
  const latest = texts[texts.length - 1]?.at ?? 0;
  const unread = open
    ? 0
    : texts.filter((m) => m.live && m.playerId !== chat.myId && (m.at ?? 0) > seenAt).length;
  const close = () => {
    setSeenAt(latest);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={clsx("chat-btn", className)}
        onClick={() => {
          setSeenAt(latest);
          setOpen(true);
        }}
        aria-label={unread ? `Chat, ${unread} new` : "Chat"}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 5h16v11H9l-5 4Z" />
        </svg>
        {unread > 0 && <span className="chat-unread">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <ChatPanel chat={chat} onClose={close} />}
    </>
  );
}
