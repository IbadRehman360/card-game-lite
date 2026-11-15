"use client";

import { useEffect, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { SERIES_LENGTHS, seriesTarget } from "@/lib/game/engine";
import { seatsFor, specFor } from "@/lib/game/table-games";
import type { RoomView } from "@/lib/online/types";
import { sfx } from "@/lib/sfx";
import { useLevel } from "@/lib/stats";
import { LevelBadge } from "@/components/ui/level-badge";
import { Portrait } from "@/components/game/portrait";
import { ErrorNote } from "./error-note";

type Act = (action: string, extra?: Record<string, unknown>) => Promise<void>;

/**
 * The table before a game with friends starts: the code to share, who sits where (empty seats are played
 * by the computer), the game's settings and the host's Start button. Rung is partners, so it draws two
 * teams facing each other; every other game is a free-for-all and draws a plain grid of seats, as many
 * as the host asked for (2 to 6). The host can tap a player and then a seat to move them, or shuffle.
 */
export function LobbyScreen({
  room,
  pending,
  error,
  live,
  act,
  onLeave,
}: {
  room: RoomView;
  pending: boolean;
  error: string | null;
  live: boolean;
  act: Act;
  onLeave: () => void;
}) {
  const mine = useLevel().level;
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const isHost = room.me.isHost;
  const spec = specFor(room.options.game);
  // the table is as big as the host made it; the seats the server sent are the truth
  const seats = room.lobby.length || seatsFor(room.options.game, room.options.players);
  const mySeat = room.lobby.findIndex((s) => s.isMe);
  const myTeam = mySeat >= 0 ? mySeat % 2 : 0;
  const humans = room.lobby.filter((s) => s.name).length;
  const inviteUrl = useInviteUrl(room.code);

  // A chime when someone sits down.
  const [seen, setSeen] = useState(humans);
  if (seen !== humans) {
    if (humans > seen) sfx.confirm();
    setSeen(humans);
  }

  const copy = async () => {
    sfx.select();
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Baazi", text: `Join my table: ${room.code}`, url: inviteUrl });
    } catch {
      // dismissed
    }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const tapSeat = (seat: number) => {
    const s = room.lobby[seat];
    if (!s) return;
    sfx.select();
    if (isHost) {
      if (picked) {
        if (picked !== s.playerId) void act("move", { playerId: picked, seat });
        setPicked(null);
      } else if (s.playerId) setPicked(s.playerId);
      return;
    }
    // everyone else can only move themselves, into an empty seat
    if (!s.name) void act("seat", { seat });
  };

  const slot = (seat: number) => {
    const s = room.lobby[seat];
    if (!s) return null;
    const c = CHARACTERS.find((x) => x.id === s.avatar);
    const tags = [s.isMe && "You", s.isHost && "Host"].filter(Boolean) as string[];
    return (
      <button
        key={seat}
        type="button"
        className="lobby-seat"
        data-filled={!!s.name}
        data-me={!!s.isMe}
        data-picked={picked !== null && s.playerId === picked}
        data-drop={isHost && picked !== null && s.playerId !== picked}
        style={{ "--accent": c?.accent ?? "rgba(255,255,255,0.3)" } as React.CSSProperties}
        disabled={pending || (!isHost && !!s.name)}
        onClick={() => tapSeat(seat)}
      >
        <span className="lobby-ring" aria-hidden>
          {s.name && c ? (
            <>
              <Portrait id={c.id} accent={c.accent} className="lobby-pfp" />
              {/* only your own level is known: no badge on anyone else rather than a made-up one */}
              {s.isMe && <LevelBadge level={mine} size="sm" className="seat-lvl" />}
            </>
          ) : (
            <svg viewBox="0 0 24 24">
              <rect x="4" y="5" width="16" height="11" rx="2" />
              <path d="M9 20h6M12 16v4" />
            </svg>
          )}
        </span>
        <span className="lobby-name">{s.name ?? "Computer"}</span>
        <span className="lobby-sub">
          {s.name
            ? tags.map((t) => (
                <i key={t} data-tag={t}>
                  {t}
                </i>
              ))
            : null}
        </span>
      </button>
    );
  };

  const team = (pair: [number, number], tone: "us" | "them") => (
    <div className="lobby-team" data-tone={tone}>
      <div className="lobby-pair">
        {slot(pair[0])}
        {slot(pair[1])}
      </div>
    </div>
  );

  const pickedName = picked
    ? (room.lobby.find((s) => s.playerId === picked)?.name ??
      room.waiting.find((w) => w.playerId === picked)?.name)
    : null;
  const series = room.options.series ?? 3;
  // partners only in Rung: everyone else sits in a plain ring, this phone first
  const hasTeams = spec.teams && seats === 4;
  const hasSeries = spec.settings.some((s) => s.key === "series");
  const order = Array.from({ length: seats }, (_, i) => ((mySeat < 0 ? 0 : mySeat) + i) % seats);

  return (
    <div className="lobby lobby-host">
      <div className="lobby-top">
        <button
          type="button"
          className="icon-button lobby-leave"
          aria-label="Leave table"
          onClick={() => {
            sfx.back();
            onLeave();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        {!live && <span className="lobby-live">Reconnecting…</span>}
      </div>

      <section className="lobby-code-wrap">
        <p className="lobby-label">Table code</p>
        <button
          type="button"
          className="lobby-code"
          onClick={() => void copy()}
          aria-label={`Table code ${room.code.split("").join(" ")}. Tap to copy the invite link.`}
        >
          {room.code.split("").map((ch, i) => (
            <span key={i} aria-hidden>
              {ch}
            </span>
          ))}
        </button>
        <p className="lobby-hint">{copied ? "Invite link copied" : "Tap the code to copy the invite link"}</p>
      </section>

      <section className="lobby-teams">
        <div className="lobby-row">
          {isHost && humans > 1 && (
            <button
              type="button"
              className="lobby-small"
              disabled={pending}
              onClick={() => {
                setPicked(null);
                sfx.flip();
                void act("shufflePairs");
              }}
            >
              {hasTeams ? "Shuffle" : "Shuffle seats"}
            </button>
          )}
        </div>
        {hasTeams ? (
          <>
            {team(myTeam === 0 ? [0, 2] : [1, 3], "us")}
            <div className="lobby-vs" aria-hidden>
              <span>VS</span>
            </div>
            {team(myTeam === 0 ? [1, 3] : [0, 2], "them")}
          </>
        ) : (
          <div className="lobby-team lobby-free" data-tone="us" data-seats={seats}>
            <div className="lobby-pair">{order.map((s) => slot(s))}</div>
          </div>
        )}
        {pickedName && <p className="lobby-hint">Now tap where {pickedName} should sit</p>}
        {room.waiting.length > 0 && (
          <div className="lobby-waiting">
            <p className="lobby-label">Waiting</p>
            {room.waiting.map((w) => (
              <button
                key={w.playerId}
                type="button"
                className="lobby-chip"
                data-picked={picked === w.playerId}
                disabled={!isHost || pending}
                onClick={() => setPicked(picked === w.playerId ? null : w.playerId)}
              >
                {w.name}
                {w.isMe && " (you)"}
              </button>
            ))}
          </div>
        )}
        {hasSeries && (
          <>
        <div className="lobby-switch" role="radiogroup" aria-label="Series length">
          {SERIES_LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={series === n}
              disabled={!isHost || pending}
              onClick={() => {
                if (series === n) return;
                sfx.select();
                void act("options", { options: { ...room.options, series: n } });
              }}
            >
              {n} deals
            </button>
          ))}
          <i aria-hidden style={{ translate: `${SERIES_LENGTHS.indexOf(series) * 100}% 0` }} />
        </div>
        <p className="lobby-switch-note">First to {seriesTarget({ series })} deals wins</p>
          </>
        )}
      </section>

      <section className="lobby-foot">
        {isHost ? (
          <button
            type="button"
            className="home-btn home-btn-gold lobby-start"
            disabled={pending}
            onClick={() => {
              sfx.confirm();
              void act("start");
            }}
          >
            Start the game
          </button>
        ) : (
          <p className="lobby-wait">Waiting for the host to start</p>
        )}
        {canShare && (
          <button type="button" className="lobby-back" aria-label="Share invite" onClick={() => void share()}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />
            </svg>
          </button>
        )}
      </section>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/** The link friends open to join: this page with the table code, using the PC's network address if needed. */
function useInviteUrl(code: string) {
  const [origin, setOrigin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  useEffect(() => {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") return;
    let cancelled = false;
    fetch("/api/lan")
      .then((r) => r.json())
      .then((d: { urls?: string[] }) => {
        if (!cancelled && d.urls?.length) setOrigin(d.urls[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return `${origin}/?table=${code}`;
}
