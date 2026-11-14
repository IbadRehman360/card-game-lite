"use client";

import { type CSSProperties, useEffect, useState } from "react";
import type { Card } from "@/lib/game/cards";
import type { Seat } from "@/lib/game/engine";
import { PACE, TRICK_HOLD, TRICK_MOVE } from "@/lib/game/pace";
import type { TableSnapshot } from "@/lib/game/view";
import { CardFace } from "@/components/game/playing-card";
import { seatTags } from "./anchors";
import { preloadCourtArt } from "./card-texture";
import { PLAY_ANGLE, TABLE_TOP, type Vec, type View, seatDir } from "./view2d";

/**
 * The flat (2D) table. Everything on the felt is placed in percent of the stage, projected through the
 * 3D app’s own camera (view2d), so cards land where the 3D app put them. The stage calls syncView
 * whenever the screen size or scene changes.
 */
let VIEW: View | null = null;
export const currentView = () => VIEW;
const W = (p: Vec): [number, number] => (VIEW ? VIEW.pc(p) : [50, 50]);
const scaled = (d: Vec, k: number, y = TABLE_TOP): Vec => [d[0] * k, y, d[2] * k];

export const MID: [number, number] = [50, 47];
/** Where each seat’s cards come from: your hand below, side hands on the felt, partner’s held up. */
export const SEAT_AT: [number, number][] = [
  [50, 82],
  [80, 47],
  [50, 21],
  [20, 47],
];
/** Where each player’s hand lies (side players on the felt, partner at the far edge). */
export const HAND_AT: [number, number][] = [
  [50, 82],
  [80, 47],
  [50, 21],
  [20, 47],
];

export function syncView(v: View) {
  VIEW = v;
  const set = (arr: [number, number], p: [number, number]) => {
    arr[0] = p[0];
    arr[1] = p[1];
  };
  set(MID, W([0, TABLE_TOP, 0]));
  set(SEAT_AT[0], W(scaled(seatDir(0), 1.15, TABLE_TOP + 0.3)));
  set(SEAT_AT[1], W(scaled(seatDir(1), 0.9)));
  // the partner holds their fan up just over the far rail (the 3D app's HOLD_R 1.62)
  set(SEAT_AT[2], W(scaled(seatDir(2), 1.62, TABLE_TOP + 0.2)));
  set(SEAT_AT[3], W(scaled(seatDir(3), 0.9)));
  for (const s of [0, 1, 2, 3]) set(HAND_AT[s], SEAT_AT[s]);
  set(HAND_AT[2], W(scaled(seatDir(2), 1.62, TABLE_TOP + 0.07)));
  // the held fan is further away than the middle of the table, so it draws a little smaller
  const ppm = (p: Vec) => {
    const a = v.px([p[0] - 0.1, p[1], p[2]]);
    const b = v.px([p[0] + 0.1, p[1], p[2]]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  HELD_K = (HELD_W / FELT_W) * (ppm([0, TABLE_TOP + 0.07, -1.62]) / Math.max(1, ppm([0, TABLE_TOP, 0])));
}

/** Card widths in the 3D app (m): on the felt (0.2 × 1.9), in a side hand (× 0.72), held up (× 1.05). */
const FELT_W = 0.38;
const SIDE_W = 0.144;
const HELD_W = 0.21;
const STACK_W = 0.32;
let HELD_K = HELD_W / FELT_W;

/** Size of a card lying on the felt (the 3D app drew them 0.38 m wide), in px. */
export function cardPx(v: View) {
  const a = v.px([-0.19, TABLE_TOP, 0]);
  const b = v.px([0.19, TABLE_TOP, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Rotation of a seat’s cards, so they face that player. */
export const SEAT_ROT = [0, -90, 180, 90];

/** A point on the felt part of the way from the middle towards a seat (1 = 1.1 m out). */
export const toward = (seat: number, k: number): [number, number] => W(scaled(seatDir(seat), k * 1.1));

/** A point on the felt, in table metres. */
export const onFelt = (x: number, z: number): [number, number] => W([x, TABLE_TOP, z]);

/** Stable little offsets, so piles look scattered but don't jump between renders. */
export const jitter = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

const pos = (p: [number, number]) => ({ left: `${p[0]}%`, top: `${p[1]}%` });

/** One card on the felt: face up (CardFace) or the house back. Flies in from `from` if given. */
export function TableCard({
  c,
  at,
  rot = 0,
  from,
  fromRot,
  delay = 0,
  className = "",
  size = 1,
  style,
}: {
  c?: Card | null;
  at: [number, number];
  rot?: number;
  from?: [number, number];
  fromRot?: number;
  delay?: number;
  className?: string;
  /** Width next to a card lying on the felt. */
  size?: number;
  style?: CSSProperties;
}) {
  // the outer box flies and is squashed by the slant; the card turns inside it, so it lies flat
  const s = {
    ...pos(at),
    "--k": size,
    "--fx": from ? `${from[0]}%` : undefined,
    "--fy": from ? `${from[1]}%` : undefined,
    "--fr": `${(fromRot ?? rot) - rot}deg`,
    animationDelay: from && delay ? `${delay}s` : undefined,
    ...style,
  } as CSSProperties;
  return (
    <span className={`st-card st-flat ${from ? "st-fly" : ""} ${className}`} style={s}>
      <span style={{ rotate: `${rot}deg` }}>{c ? <CardFace card={c} /> : <i className="st-back" />}</span>
    </span>
  );
}

/** A neat stack of face-down cards with a gold count badge. */
export function Stack({ count, at, turn = 0 }: { count: number; at: [number, number]; turn?: number }) {
  if (count <= 0) return null;
  const shown = Math.min(count, 5);
  return (
    <span className="st-stack" style={{ ...pos(at), rotate: `${turn}deg`, "--k": STACK_W / FELT_W } as CSSProperties}>
      {Array.from({ length: shown }, (_, i) => (
        <i key={i} className="st-back" style={{ translate: `0 ${-i * 2}px` }} />
      ))}
      <b className="st-badge" style={{ rotate: `${-turn}deg` }}>
        {count}
      </b>
    </span>
  );
}

/** When (s into the deal) the i-th card of a seat arrives: one card to each seat in turn. */
export const dealDelay = (i: number, seat: number) => ((i * 4 + seat) / 52) * (PACE.deal / 1000 - 0.35);

/**
 * A player's face-down hand, as the 3D app lays it out. A side player's hand lies on the felt in front of
 * them: a row of backs along their edge, each turned a little. The partner holds a fan up just over the far
 * rail, pivoting from the bottom. While dealing, the cards fly out from the middle one at a time.
 */
export function Hand({ seat, count, dealing }: { seat: Seat; count: number; dealing?: boolean }) {
  const n = Math.max(0, Math.min(13, count));
  if (seat !== 2) {
    const a = PLAY_ANGLE[seat];
    const d = seatDir(seat);
    const side: Vec = [Math.cos(a), 0, Math.sin(a)];
    return (
      <>
        {Array.from({ length: n }, (_, i) => {
          const off = (i - (n - 1) / 2) * 0.034;
          const at = W([d[0] * 0.9 + side[0] * off, TABLE_TOP, d[2] * 0.9 + side[2] * off]);
          const rot = (-(a + off * 1.6) * 180) / Math.PI;
          return (
            <TableCard
              key={i}
              at={at}
              rot={rot}
              size={SIDE_W / FELT_W}
              className="st-side"
              from={dealing ? MID : undefined}
              fromRot={rot + 130}
              delay={dealing ? dealDelay(i, seat) : 0}
            />
          );
        })}
      </>
    );
  }
  const step = n > 1 ? Math.min(0.11, 1.15 / (n - 1)) : 0;
  return (
    <span className="st-hand st-held" style={{ ...pos(HAND_AT[2]), "--k": HELD_K } as CSSProperties}>
      {Array.from({ length: n }, (_, i) => (
        <i
          key={i}
          className={`st-back ${dealing ? "st-dealt" : ""}`}
          style={{
            rotate: `${(((i - (n - 1) / 2) * step * 180) / Math.PI).toFixed(2)}deg`,
            animationDelay: dealing ? `${dealDelay(i, seat)}s` : undefined,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Moves each seat's name tag to its place: side players flush on their own edge, halfway down the
 * table; the partner under their picture at the top. Cheap: a few times a second, not every frame.
 */
export function TagProjector() {
  useEffect(() => {
    const place = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const top = (document.querySelector(".hud-top")?.getBoundingClientRect().bottom ?? 60) + 8;
      const bottom = (document.querySelector(".my-side")?.getBoundingClientRect().top ?? height) - 8;
      const v = currentView();
      for (const s of [1, 2, 3]) {
        const el = seatTags[s];
        if (!el) continue;
        // as the 3D app: just in front of the player’s chest at table height; side players flush on
        // their own edge, halfway down the table
        const d = seatDir(s);
        const side = s % 2 === 1;
        const p = v ? v.px([d[0] * (side ? 3 : 1.6), TABLE_TOP + 0.12, d[2] * 1.6]) : [width / 2, height * 0.2];
        const w = el.offsetWidth / 2 + (side ? 0 : 8);
        const h = el.offsetHeight / 2 + 8;
        const x = Math.min(width - w, Math.max(w, p[0]));
        const want = side ? (top + bottom) / 2 : p[1];
        const y = Math.min(bottom - h, Math.max(top + h, want));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      }
    };
    const tick = () => {
      if (!document.hidden) place();
    };
    place();
    const id = window.setInterval(tick, 250);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", place);
    };
  }, []);
  return null;
}

/** Where each team's collected haaths are stacked: by the player nearest you on that side. */
const TEAM_STACK_AT: [number, number][] = [
  [-0.75, 0.9],
  [0.75, -1.08],
];

/** Everything on the felt during a Rung deal, drawn from the revealed table snapshot. */
export function TablePlay({ snap, dealKey, dealing }: { snap: TableSnapshot; dealKey: string; dealing: boolean }) {
  useEffect(() => preloadCourtArt(), []);
  const decided = snap.trickWinner !== null;
  const swept = decided && snap.collectedBy !== null;
  const pileUnder = decided && !swept ? snap.pile - 1 : snap.pile;
  const TEAM_STACK = TEAM_STACK_AT.map(([x, z]) => onFelt(x, z));
  const to: [number, number] | null = !decided ? null : swept ? TEAM_STACK[snap.collectedBy!] : MID;

  // the winners' pile only grows once the sweep has landed on it
  const sweepId = swept ? `${dealKey}:${snap.sars[0]}:${snap.sars[1]}` : null;
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    if (!sweepId) return;
    const t = window.setTimeout(() => setLanded(sweepId), (TRICK_HOLD + TRICK_MOVE) * 1000);
    return () => window.clearTimeout(t);
  }, [sweepId]);
  const arriving = sweepId && landed !== sweepId ? snap.swept : 0;
  const teamCount = (team: 0 | 1) => snap.sars[team] - (snap.collectedBy === team ? arriving : 0);

  return (
    <>
      <TagProjector />
      <Stack count={pileUnder} at={MID} turn={20} />
      <Stack count={teamCount(0)} at={TEAM_STACK[0]} turn={-23} />
      <Stack count={teamCount(1)} at={TEAM_STACK[1]} turn={28} />
      {snap.trick.map((p, i) => (
        <TableCard
          key={p.card}
          c={p.card}
          at={toward(p.seat, p.seat % 2 ? 0.31 : 0.38)}
          rot={SEAT_ROT[p.seat] / 6 + jitter(i + p.seat * 7) * 14}
          from={SEAT_AT[p.seat]}
          fromRot={SEAT_ROT[p.seat]}
          className={`st-trick ${p.seat === snap.trickWinner ? "st-win" : ""} ${to ? "st-gone" : ""}`}
          style={
            to
              ? ({
                  "--tx": `${to[0]}%`,
                  "--ty": `${to[1]}%`,
                  "--hold": `${TRICK_HOLD}s`,
                  "--move": `${TRICK_MOVE}s`,
                } as CSSProperties)
              : undefined
          }
        />
      ))}
      {([1, 2, 3] as Seat[]).map((s) => (
        <Hand key={`${dealKey}-${s}`} seat={s} count={snap.cardsLeft[s]} dealing={dealing} />
      ))}
    </>
  );
}
