"use client";

import { useEffect, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { seatsFor, specFor, type TableGame } from "@/lib/game/table-games";
import type { MatchView } from "@/lib/online/types";
import { sfx } from "@/lib/sfx";
import { botLevel, useLevel } from "@/lib/stats";
import { LevelBadge } from "@/components/ui/level-badge";
import { Portrait } from "@/components/game/portrait";
import "./match.css";

const SEARCH_SECONDS = 30;

/**
 * Play: the table filling up, drawn like the lobby of a table with friends (the same seat cards, and at
 * Rung the same two teams with VS between them). Each seat shows a searching ring until a player sits
 * down in it (people searching for the same game, or players the server finds), then their face and
 * name. Once every seat is taken the game starts by itself. `match` is null while the seat is being found.
 */
export function MatchScreen({ game, match, onCancel }: { game: TableGame; match: MatchView | null; onCancel: () => void }) {
  const spec = specFor(game);
  const mine = useLevel().level;
  const seats: MatchView["seats"] = match?.seats ?? Array.from({ length: seatsFor(game, undefined) }, () => null);
  const count = seats.length;
  const filled = seats.filter(Boolean).length;
  const starting = match?.startsIn != null;

  // a chime as each player sits down
  const [seen, setSeen] = useState(filled);
  if (seen !== filled) {
    if (filled > seen && seen > 0) sfx.confirm();
    setSeen(filled);
  }

  // the seconds spent looking, like any matchmaking screen
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(since);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.floor((now - since) / 1000);

  const mySeat = Math.max(0, seats.findIndex((s) => s?.isMe));
  const slot = (seat: number) => {
    const s = seats[seat];
    const c = s ? CHARACTERS.find((x) => x.id === s.avatar) : undefined;
    return (
      <div
        key={seat}
        className="lobby-seat match-seat"
        data-filled={!!s}
        data-me={!!s?.isMe}
        style={{ "--accent": c?.accent ?? "rgba(255,255,255,0.3)" } as React.CSSProperties}
      >
        <span className="lobby-ring" aria-hidden>
          {s ? (
            <>
              <Portrait id={s.avatar} accent={c?.accent ?? "#888"} className="lobby-pfp" />
              {/* quick-match seats carry no level: yours is real, the others get a steady one from their name */}
              <LevelBadge level={s.isMe ? mine : botLevel(s.name)} size="sm" className="seat-lvl" />
            </>
          ) : (
            <span className="match-dots">
              <i />
              <i />
              <i />
            </span>
          )}
        </span>
        <span className="lobby-name">{s ? s.name : "Searching…"}</span>
        {s && <span className="lobby-sub">{s.isMe ? <i data-tag="You">You</i> : "Ready"}</span>}
      </div>
    );
  };

  // partners only in Rung: everyone else sits in a plain ring, this phone first
  const hasTeams = spec.teams && count === 4;
  const myTeam = mySeat % 2;
  const team = (pair: [number, number], tone: "us" | "them") => (
    <div className="lobby-team" data-tone={tone}>
      <div className="lobby-pair">
        {slot(pair[0])}
        {slot(pair[1])}
      </div>
    </div>
  );
  const order = Array.from({ length: count }, (_, i) => (mySeat + i) % count);

  return (
    <div className="lobby match" data-starting={starting}>
      <div className="lobby-top">
        <button
          type="button"
          className="icon-button lobby-leave"
          aria-label="Stop searching"
          disabled={starting}
          onClick={() => {
            sfx.back();
            onCancel();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
      </div>

      <section className="match-head" aria-live="polite">
        <h2 className="match-title">{starting ? "Starting…" : "Finding players"}</h2>
        <div className="match-progress" aria-hidden>
          <i style={{ width: `${starting ? 100 : Math.min(96, (secs / SEARCH_SECONDS) * 100)}%` }} />
        </div>
      </section>

      <p className="lobby-label match-players">
        Players <b>{filled}/{count}</b>
      </p>
      <section className="lobby-teams">
        {hasTeams ? (
          <>
            {team(myTeam === 0 ? [0, 2] : [1, 3], "us")}
            <div className="lobby-vs" aria-hidden>
              <span>VS</span>
            </div>
            {team(myTeam === 0 ? [1, 3] : [0, 2], "them")}
          </>
        ) : (
          <div className="lobby-team lobby-free" data-tone="us" data-seats={count}>
            <div className="lobby-pair">{order.map((s) => slot(s))}</div>
          </div>
        )}
      </section>

      <section className="lobby-foot">
        <button
          type="button"
          className="home-btn home-btn-ghost match-cancel"
          disabled={starting}
          onClick={() => {
            sfx.back();
            onCancel();
          }}
        >
          Cancel
        </button>
      </section>
    </div>
  );
}
