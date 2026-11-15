"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { Avatar } from "@/components/avatars/avatar";
import { SeatedFigure } from "@/components/avatars/seated";
import { CHARACTERS } from "@/lib/characters";
import { NAME_MAX, cleanName, setPrefs, usePrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sfx";
import { COUNTED_GAMES, rankFor, totalStats, useStats, winPercent } from "@/lib/stats";
import { GAMES } from "@/lib/wallet/economy";
import { Chevron } from "./icons";
import "@/components/shop/shop.css";
import "./profile.css";

/**
 * Your profile, a screen of its own: your character big and seated at the table, your name, a strip of
 * your rank and record, and two tabs: the cast to pick from, and your games one by one. It is also where
 * a first-time player picks who they play as on the way into a game: then a button at the foot sits them down.
 */
export function ProfileScreen({
  index,
  onIndex,
  onBack,
  confirm = null,
}: {
  /** The picked character (an index into CHARACTERS). */
  index: number;
  /** Picks a character (saved straight away). */
  onIndex: (i: number) => void;
  onBack: () => void;
  /** A game is waiting on this pick: the button that goes on to it. */
  confirm?: { label: string; onConfirm: () => void } | null;
}) {
  const prefs = usePrefs();
  const stats = useStats();
  const [tab, setTab] = useState<"character" | "stats">("character");
  const n = CHARACTERS.length;
  const i = Math.min(n - 1, Math.max(0, index));
  const me = CHARACTERS[i];
  const total = totalStats(stats);
  const rank = rankFor(total.won);

  const pick = (next: number) => {
    if (next < 0 || next >= n || next === i) return;
    sfx.select();
    onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        sfx.back();
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const tabButton = (id: typeof tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`prof-tab-${id}`}
      aria-selected={tab === id}
      aria-controls="prof-panel"
      onClick={() => {
        if (tab === id) return;
        sfx.flip();
        setTab(id);
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="prof" data-confirm={confirm ? "" : undefined} style={{ "--accent": me.accent } as CSSProperties}>
      <div className="prof-glow" aria-hidden />
      <header className="prof-top">
        <button
          type="button"
          className="icon-button prof-back"
          aria-label="Back to menu"
          onClick={() => {
            sfx.back();
            onBack();
          }}
        >
          <Chevron dir="left" />
        </button>
        <h1 className="prof-title">{confirm ? "Who's playing?" : "Your profile"}</h1>
      </header>

      <div className="prof-body">
        <section className="prof-hero" aria-label="You">
          <div className="prof-stage" aria-live="polite">
            <SeatedFigure key={me.id} id={me.id} cards table className="prof-figure" title={me.name} />
          </div>
          <p className="prof-name">{prefs.name || me.name}</p>
          <label className="prof-field">
            <span className="prof-h">Your name</span>
            <input
              className="prof-input"
              value={prefs.name}
              maxLength={NAME_MAX}
              autoComplete="nickname"
              spellCheck={false}
              placeholder={me.name}
              onChange={(e) => setPrefs({ name: cleanName(e.target.value) })}
            />
          </label>
          <dl className="prof-strip">
            <div data-rank="">
              <dt>Rank</dt>
              <dd>{rank.title}</dd>
            </div>
            <div>
              <dt>Matches</dt>
              <dd>{total.played}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>{total.won}</dd>
            </div>
            <div>
              <dt>Win %</dt>
              <dd>{winPercent(total.played, total.won)}%</dd>
            </div>
          </dl>
        </section>

        <div className="prof-side">
          <div className="shop-tabs prof-tabs" role="tablist" aria-label="Profile">
            {tabButton("character", "Character")}
            {tabButton("stats", "Stats")}
          </div>

          <div className="prof-panel" id="prof-panel" role="tabpanel" aria-labelledby={`prof-tab-${tab}`}>
            {tab === "character" ? (
              <div className="prof-grid" role="radiogroup" aria-label="Character">
                {CHARACTERS.map((c, k) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={k === i}
                    aria-label={c.name}
                    className="prof-card"
                    style={{ "--accent": c.accent } as CSSProperties}
                    onClick={() => pick(k)}
                  >
                    <span className="prof-card-pic">
                      <Avatar id={c.id} />
                      {k === i && (
                        <svg className="prof-card-check" viewBox="0 0 24 24" aria-hidden>
                          <path d="M6 12.5 10.2 16.5 18 8" />
                        </svg>
                      )}
                    </span>
                    <span className="prof-card-name">{c.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <ul className="prof-games">
                {COUNTED_GAMES.map((g) => {
                  const s = stats[g] ?? { played: 0, won: 0 };
                  return (
                    <li key={g}>
                      <span className="prof-game">{GAMES[g].name}</span>
                      <span className="prof-num">
                        <b>{s.played}</b> played
                      </span>
                      <span className="prof-num">
                        <b>{s.won}</b> won
                      </span>
                      <span className="prof-pct">{s.played ? `${winPercent(s.played, s.won)}%` : "–"}</span>
                    </li>
                  );
                })}
                {rank.next && (
                  <li className="prof-next">
                    {rank.next.wins - total.won} more win{rank.next.wins - total.won === 1 ? "" : "s"} to {rank.next.title}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {confirm && (
        <div className="prof-foot">
          <button
            type="button"
            className="home-btn home-btn-gold prof-go"
            autoFocus
            onClick={() => {
              sfx.confirm();
              confirm.onConfirm();
            }}
          >
            {confirm.label}
          </button>
        </div>
      )}
    </div>
  );
}

/** Your avatar in the top bar; opens your profile screen. */
export function ProfileButton({ onOpen }: { onOpen: () => void }) {
  const prefs = usePrefs();
  const me = CHARACTERS.find((c) => c.id === prefs.character) ?? CHARACTERS[0];
  return (
    <button
      type="button"
      className="profile-btn"
      style={{ "--accent": me.accent } as CSSProperties}
      aria-label="Your profile"
      onClick={() => {
        sfx.select();
        onOpen();
      }}
    >
      <Avatar id={me.id} />
    </button>
  );
}
