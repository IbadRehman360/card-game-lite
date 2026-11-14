"use client";

import { type CSSProperties, useEffect, useState } from "react";
import type { Card } from "@/lib/game/cards";
import type { Seat } from "@/lib/game/engine";
import { type BluffCard, type BluffState, type Rank, SHOT_LANDS_MS, isJoker } from "@/lib/bluff/engine";
import { CardFace } from "@/components/game/playing-card";
import { Hand, MID, SEAT_AT, SEAT_ROT, TagProjector, jitter, toward } from "./table-play";
import { motionReduced } from "./motion";
import { BluffDrama, FOCUS_AT, HOLD_AT, RETURN_AT, SPIN_AT } from "./bluff-drama";

/** What the table needs from a Bluff game, from the viewer's side (seat 0 = you). */
export interface BluffStageTable {
  round: number;
  tableCard: Rank;
  /** Cards in each seat's hand. */
  counts: number[];
  /** The plays laid face down this round, oldest first: who laid them and how many. */
  pile: { seat: number; count: number }[];
  /** A call being shown: the play turned over, and whose revolver is pulled. */
  reveal: { seat: number; caller: number; cards: BluffCard[]; loser: number; fired: boolean } | null;
  players: { alive: boolean; shots: number }[];
  turn: number;
}

/** The table's view of a (seat-rotated) Bluff state. */
export function bluffStage(s: BluffState): BluffStageTable {
  return {
    round: s.round,
    tableCard: s.tableCard,
    counts: s.counts,
    pile: s.plays.map((p) => ({ seat: p.seat, count: p.cards.length })),
    reveal: s.reveal
      ? { seat: s.reveal.seat, caller: s.reveal.caller, cards: s.reveal.cards, loser: s.reveal.loser, fired: s.reveal.fired }
      : null,
    players: s.players.map((p) => ({ alive: p.alive, shots: p.shots })),
    turn: s.turn,
  };
}

const SUITS = ["S", "H", "D", "C"];
const PILE_AT: [number, number] = [MID[0] - 6, MID[1]];
const GUN_HOME: [number, number] = [MID[0] + 8, MID[1] + 1];
const GUN_HOME_ROT = -24;

/** Every card laid this round, face down in the middle; the newest play slides in from its player. */
function Pile({ pile, round, hide }: { pile: BluffStageTable["pile"]; round: number; hide: number }) {
  let n = 0;
  const cards: { key: string; seat: number; dx: number; dy: number; rot: number; play: number; i: number }[] = [];
  pile.forEach((p, pi) => {
    for (let i = 0; i < p.count; i++, n++) {
      cards.push({
        key: `${round}-${pi}-${i}`,
        seat: p.seat,
        dx: jitter(round * 31 + n) * 2.2,
        dy: jitter(round * 17 + n * 3) * 2.2,
        rot: jitter(round * 7 + n * 5) * 26,
        play: pi,
        i,
      });
    }
  });
  const shown = cards.filter((c) => c.play !== hide);
  return (
    <>
      {shown.map((c) => (
        <span
          key={c.key}
          className="st-card st-fly"
          style={
            {
              left: `${PILE_AT[0] + c.dx}%`,
              top: `${PILE_AT[1] + c.dy}%`,
              rotate: `${c.rot}deg`,
              "--fx": `${SEAT_AT[c.seat][0]}%`,
              "--fy": `${SEAT_AT[c.seat][1]}%`,
              "--fr": `${SEAT_ROT[c.seat]}deg`,
              animationDelay: `${c.i * 0.08}s`,
            } as CSSProperties
          }
        >
          <i className="st-back" />
        </span>
      ))}
      {shown.length > 0 && (
        <b className="st-badge st-pile-badge" style={{ left: `${PILE_AT[0] + 3}%`, top: `${PILE_AT[1] - 6}%` }}>
          {shown.length}
        </b>
      )}
    </>
  );
}

/** The play that was called, turned face up in a row in the middle. */
function Revealed({ cards, from }: { cards: BluffCard[]; from: number }) {
  const o = toward(from, 0.4);
  return (
    <>
      {cards.map((c, i) => {
        const x = MID[0] + (i - (cards.length - 1) / 2) * 7;
        return (
          <span
            key={c}
            className="st-card st-fly st-flip"
            style={
              {
                left: `${x}%`,
                top: `${MID[1] - 1}%`,
                "--fx": `${o[0]}%`,
                "--fy": `${o[1]}%`,
                "--fr": "0deg",
                animationDelay: `${0.2 + i * 0.15}s`,
              } as CSSProperties
            }
          >
            {isJoker(c) ? (
              <span className="st-joker">
                <b>★</b>
                <small>JOKER</small>
              </span>
            ) : (
              <CardFace card={`${c[0]}${SUITS[Number(c.slice(1)) % 4]}` as Card} />
            )}
          </span>
        );
      })}
    </>
  );
}

type GunPhase = "home" | "aim" | "roll" | "hold" | "fire" | "back";

/**
 * The one revolver on the table. On a call it spins, slides over to the loser and points at them;
 * then it either clicks or goes off (flash, a shake and a red splash on their seat).
 */
function Revolver({ pull }: { pull: { key: string; seat: number; fired: boolean } | null }) {
  const [phase, setPhase] = useState<{ key: string | null; p: GunPhase }>({ key: null, p: "home" });
  const key = pull?.key ?? null;
  const fired = !!pull?.fired;
  useEffect(() => {
    if (!key) return;
    const still = motionReduced();
    const L = SHOT_LANDS_MS;
    // slides over to the loser and is raised at them; the cylinder turns; a held breath; then the trigger
    const steps: [number, GunPhase][] = still
      ? [
          [0, "aim"],
          [L, "fire"],
          [RETURN_AT, "back"],
        ]
      : [
          [FOCUS_AT, "aim"],
          [SPIN_AT, "roll"],
          [HOLD_AT, "hold"],
          [L, "fire"],
          [RETURN_AT, "back"],
        ];
    const ids = steps.map(([t, p]) => window.setTimeout(() => setPhase({ key, p }), t));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [key, fired]);

  const p = phase.key === key && key ? phase.p : "home";
  const seat = pull?.seat ?? 0;
  const aimAt = toward(seat, 0.5);
  let at = GUN_HOME;
  let rot = GUN_HOME_ROT;
  let flip = false;
  if (p === "aim" || p === "roll" || p === "hold" || p === "fire") {
    const w = typeof window === "undefined" ? 16 : window.innerWidth;
    const h = typeof window === "undefined" ? 9 : window.innerHeight;
    const dx = (SEAT_AT[seat][0] - aimAt[0]) * w;
    const dy = (SEAT_AT[seat][1] - aimAt[1]) * h;
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    at = aimAt;
    rot = 720 + a;
    flip = Math.abs(a) > 90;
  }
  return (
    <>
      <span
        className="st-gun"
        data-phase={p}
        data-fired={p === "fire" ? String(fired) : undefined}
        style={{ left: `${at[0]}%`, top: `${at[1]}%`, rotate: `${rot}deg` }}
      >
        <svg viewBox="0 0 120 56" style={{ scale: flip ? "1 -1" : undefined }} aria-hidden>
          {/* barrel */}
          <rect x="48" y="14" width="66" height="9" rx="2" fill="#4a4f57" stroke="#1b1c20" strokeWidth="2" />
          <rect x="48" y="22" width="56" height="5" rx="1.5" fill="#2a2c31" />
          <rect x="108" y="10" width="4" height="5" fill="#1b1c20" />
          {/* frame and cylinder */}
          <path d="M30 12 h22 v18 h-10 l-6 6 h-8 z" fill="#3a3e45" stroke="#1b1c20" strokeWidth="2" />
          <rect x="34" y="13" width="18" height="15" rx="4" fill="#5b6069" stroke="#1b1c20" strokeWidth="2" />
          <g className="st-cyl">
            <line x1="34" y1="15" x2="52" y2="15" stroke="#2a2c31" strokeWidth="1.5" />
            <line x1="34" y1="20" x2="52" y2="20" stroke="#2a2c31" strokeWidth="1.5" />
            <line x1="34" y1="25" x2="52" y2="25" stroke="#2a2c31" strokeWidth="1.5" />
          </g>
          {/* hammer */}
          <path d="M28 12 l-7 -6 l4 -2 l8 7 z" fill="#2a2c31" stroke="#1b1c20" strokeWidth="1.5" />
          {/* trigger and guard */}
          <path d="M36 30 q-2 9 6 10" fill="none" stroke="#1b1c20" strokeWidth="3" />
          <path d="M40 30 q0 5 3 6" fill="none" stroke="#c08a33" strokeWidth="2.5" />
          {/* wooden grip */}
          <path d="M30 26 h10 l-6 26 q-1 3 -5 3 h-8 q-4 0 -3 -4 z" fill="#6a3519" stroke="#2a140a" strokeWidth="2" />
          <circle cx="28" cy="38" r="2" fill="#c08a33" />
        </svg>
        <i className="st-flash" />
      </span>
      {p === "fire" && fired && (
        <i
          key={key}
          className="st-hit"
          style={{ left: `${SEAT_AT[seat][0]}%`, top: `${SEAT_AT[seat][1] - (seat === 2 ? 8 : 0)}%` }}
        />
      )}
    </>
  );
}

export function BluffTable({ table }: { table: BluffStageTable }) {
  const r = table.reveal;
  const pull = r ? { key: `${table.round}:${r.seat}:${r.caller}:${r.loser}`, seat: r.loser, fired: r.fired } : null;
  return (
    <div className="st-bluff">
      <TagProjector />
      <Pile pile={table.pile} round={table.round} hide={r ? table.pile.length - 1 : -1} />
      {r && <Revealed key={pull!.key} cards={r.cards} from={r.seat} />}
      {([1, 2, 3] as Seat[]).map((s) =>
        table.players[s]?.alive ? <Hand key={`${table.round}-${s}`} seat={s} count={table.counts[s]} /> : null,
      )}
      <Revolver pull={pull} />
      <BluffDrama pull={pull} />
    </div>
  );
}
