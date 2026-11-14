"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { type Card, SUIT_SYMBOL, isRed, rankLabel, suitOf } from "@/lib/game/cards";
import { type BhabhiEvent, type BhabhiState, type Seat, legalPlays } from "@/lib/bhabhi/engine";
import { payoutFor } from "@/lib/wallet/economy";
import { sfx } from "@/lib/sfx";
import { CardFace, cardName } from "@/components/game/playing-card";
import { WinFlare } from "@/components/game/win-flare";
import { Portrait } from "@/components/game/portrait";
import { seatTags } from "@/components/stage/anchors";
import { CostTag } from "@/components/shop/cost-tag";
import { BHABHI_TURN_SECONDS, type BhabhiGame } from "./use-bhabhi";
import { TurnTimer } from "@/components/game/turn-timer";
import "./bhabhi.css";

/** Names for extra seats when a character sits at the table twice (5 or 6 players). */
const EXTRA_NAMES = ["Raza", "Nimmi", "Guddu", "Shabo", "Babar", "Pinky"];
const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];

type Pt = { x: number; y: number };
/** The middle of the 3D table's felt, in percent of the screen. */
const CENTRE: Pt = { x: 50, y: 46 };
/** Thrown-away tricks go to a little pile on the far side of the table. */
const DISCARD: Pt = { x: 72, y: 30 };
/** Where each seat's tag sits on screen (the 3D players: right, across, left). */
const SPOT = { 1: "right", 2: "top", 3: "left" } as const;

/** Each seat's spot on screen (percent): you at the bottom, the others where they sit at the 3D table. */
function seatSpots(n: number): Pt[] {
  if (n === 4)
    return [
      { x: 50, y: 96 },
      { x: 90, y: 44 },
      { x: 50, y: 22 },
      { x: 10, y: 44 },
    ];
  const spots: Pt[] = [{ x: 50, y: 96 }];
  for (let i = 0; i < n - 1; i++) {
    const a = ((i + 0.5) * Math.PI) / (n - 1);
    spots.push({ x: 50 + 40 * Math.cos(a), y: 46 - 24 * Math.sin(a) });
  }
  return spots;
}

/** A played card's spot in the middle: a little toward the seat that played it. */
const pileSpot = (seat: Pt): Pt => ({ x: CENTRE.x + (seat.x - CENTRE.x) * 0.3, y: CENTRE.y + (seat.y - CENTRE.y) * 0.3 });
/** A small fixed tilt per card, so the pile looks thrown, not stacked. */
const tilt = (c: Card) => ((c.charCodeAt(0) * 7 + c.charCodeAt(1) * 13) % 23) - 11;

const pct = (p: Pt) => ({ "--x": `${p.x}%`, "--y": `${p.y}%` }) as CSSProperties;

/** The same card face as Rung (painted on a canvas). */
const CardImg = ({ card }: { card: Card }) => <CardFace card={card} />;

function CardLabel({ card }: { card: Card }) {
  return (
    <b className="bh-cl" data-red={isRed(suitOf(card))}>
      {rankLabel(card)}
      {SUIT_SYMBOL[suitOf(card)]}
    </b>
  );
}

/** Bhabhi Thulla against the computer, laid over the tavern: the felt, the trick, your hand. */
export function BhabhiScreen({
  game,
  seatChars,
  names,
  bots,
  paused,
  onMenu,
  onRules,
}: {
  game: BhabhiGame;
  /** Each seat's character (index into CHARACTERS); seats past the list reuse it. */
  seatChars: number[];
  /** Optional name for each seat (seat 0 is always "You"). */
  names?: string[];
  /** Online: which seats a computer plays (every seat but yours, playing alone). */
  bots?: boolean[];
  paused: boolean;
  onMenu: () => void;
  onRules: () => void;
}) {
  const { state } = game;
  const n = state?.players ?? 4;
  const spots = useMemo(() => seatSpots(n), [n]);

  const people = useMemo(() => {
    const seen = new Set<number>();
    return Array.from({ length: n }, (_, s) => {
      const ci = seatChars.length ? seatChars[s % seatChars.length] % CHARACTERS.length : s % CHARACTERS.length;
      const c = CHARACTERS[ci];
      const dup = seen.has(ci);
      seen.add(ci);
      const name = s === 0 ? "You" : names?.[s] || (dup ? EXTRA_NAMES[s % EXTRA_NAMES.length] : c.name);
      return { c, name };
    });
  }, [n, seatChars, names]);
  const nameOf = (s: Seat) => people[s]?.name ?? `Seat ${s}`;

  const [picked, setPicked] = useState<Card | null>(null);
  const legal = useMemo(() => (state ? legalPlays(state, 0) : []), [state]);
  const myTurn = !!state && state.turn === 0;
  const chosen = picked && legal.includes(picked) ? picked : null;

  // the last five seconds of your clock tick
  useEffect(() => {
    if (!myTurn || paused) return;
    const ticks = [5, 4, 3, 2, 1].map((left) => window.setTimeout(() => sfx.tick(), (BHABHI_TURN_SECONDS - left) * 1000));
    return () => ticks.forEach((t) => window.clearTimeout(t));
  }, [myTurn, paused, game.turnKey]);

  // the last trick gets a moment on the table before the result card comes up
  const ended = state?.bhabhi != null ? state.seq : null;
  const [endSeen, setEndSeen] = useState<number | null>(null);
  useEffect(() => {
    if (ended === null || paused) return;
    const id = window.setTimeout(() => setEndSeen(ended), 1100);
    return () => window.clearTimeout(id);
  }, [ended, paused]);

  if (!state) return null;

  const t = state.trick;
  const over = state.bhabhi !== null && endSeen === state.seq;
  const myPlace = state.place[0];
  const escaped = myPlace !== null && state.bhabhi === null;
  const last = state.lastTrick;
  const showGhost = !!last && t.plays.length === 0;

  const play = (card: Card) => {
    setPicked(null);
    game.move(card);
  };
  const tap = (card: Card) => {
    if (!myTurn || !legal.includes(card)) return;
    if (chosen === card) play(card);
    else {
      sfx.select();
      setPicked(card);
    }
  };

  const status = statusLine(state, nameOf);
  const hand = state.hands[0];
  const fan = Math.min(2.4, 26 / Math.max(hand.length, 1));
  // against the computer it is free: coins are only shown at a table with friends
  const coins = game.online ? game.coins : undefined;
  const payout = coins && myPlace !== null ? (coins.paid ?? payoutFor("bhabhi", { place: myPlace, players: n })) : 0;

  return (
    <div className="bh" data-paused={paused}>
      {/* ── top: trick count, help ── */}
      <header className="hud-top bh-top">
        <div className="hud-chip">
          <span>Trick</span>
          <b className="hud-series">{state.trickNo}</b>
        </div>
      </header>
      <button type="button" className="icon-button corner-back bh-help" aria-label="Rules" onClick={onRules}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 9.2a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.9v.7" />
          <path d="M12 18h.01" />
        </svg>
      </button>

      {/* ── the other players: tags that follow them at the 3D table ── */}
      {people.map(({ c, name }, s) => {
        if (s === 0 || s > 3) return null;
        const place = state.place[s];
        const isBhabhi = state.bhabhi === s;
        const turn = state.turn === s;
        const bubble = seatBubble(state, s);
        return (
          <div
            key={s}
            ref={(el) => {
              seatTags[s] = el;
            }}
            className="seat-tag bh-seat"
            data-spot={SPOT[s as 1 | 2 | 3]}
            data-turn={turn}
            data-out={place !== null && !isBhabhi}
            style={{ "--accent": c.accent } as CSSProperties}
          >
            <span className="seat-pfp-wrap">
              <Portrait id={c.id} accent={c.accent} className="seat-pfp" letter={name.slice(0, 1)} />
              {(bots?.[s] ?? true) && <i className="seat-cpu">CPU</i>}
              {place !== null && !isBhabhi && <WinFlare key={`f${place}`} />}
              {place !== null && !isBhabhi && (
                <i className="bh-medal" key={`m${place}`}>
                  {ORDINAL[place]}
                </i>
              )}
            </span>
            <span className="seat-name">{name}</span>
            <span className="seat-cards">{isBhabhi ? "Bhabhi" : place !== null ? "Got away" : `${state.hands[s].length} cards`}</span>
            {bubble && (
              <span className="bh-bubble" data-tone={bubble.tone} key={bubble.key}>
                {bubble.text}
              </span>
            )}
          </div>
        );
      })}

      {/* ── cards on the table ── */}
      <div className="bh-table">
        {state.discarded > 0 && (
          <div className="bh-discard" style={pct(DISCARD)} aria-label={`${state.discarded} cards thrown away`}>
            <span className="bh-back" />
            <span className="bh-back" />
            <span className="bh-back" />
            <small key={state.discarded}>{state.discarded}</small>
          </div>
        )}

        {/* the trick being played */}
        {t.plays.map((p) => {
          const from = spots[p.seat];
          const at = pileSpot(from);
          return (
            <span
              key={`${state.trickNo}-${p.card}`}
              className="bh-tc"
              data-off={p.off && !t.first}
              style={
                {
                  "--x": `${at.x}%`,
                  "--y": `${at.y}%`,
                  "--fx": `${from.x}%`,
                  "--fy": `${from.y}%`,
                  "--r": `${tilt(p.card)}deg`,
                } as CSSProperties
              }
              aria-label={`${nameOf(p.seat)}: ${cardName(p.card)}`}
            >
              <CardImg card={p.card} />
            </span>
          );
        })}

        {/* the trick that just ended: swept away, or flying into the hand of whoever picks it up */}
        {showGhost &&
          last.plays.map((p, i) => {
            const from = spots[p.seat];
            const at = pileSpot(from);
            const to = last.outcome === "pickup" ? spots[last.to] : DISCARD;
            const final = i === last.plays.length - 1;
            return (
              <span
                key={`g${last.id}-${p.card}`}
                className="bh-tc bh-ghost"
                data-last={final}
                data-off={p.off}
                style={
                  {
                    "--x": `${at.x}%`,
                    "--y": `${at.y}%`,
                    "--fx": `${from.x}%`,
                    "--fy": `${from.y}%`,
                    "--tx": `${to.x}%`,
                    "--ty": `${to.y}%`,
                    "--r": `${tilt(p.card)}deg`,
                    "--d": `${i * 40}ms`,
                  } as CSSProperties
                }
                aria-hidden
              >
                <CardImg card={p.card} />
              </span>
            );
          })}
        {showGhost && last.outcome === "pickup" && last.thulla !== null && (
          <div className="bh-stamp" key={`s${last.id}`} role="status">
            <b>Thulla!</b>
            <small>
              {nameOf(last.to)} {last.to === 0 ? "pick" : "picks"} up {last.plays.length}
            </small>
          </div>
        )}
      </div>

      {game.error && (
        <div className="bh-toast" role="status">
          {game.error}
        </div>
      )}

      {/* ── your side: what's happening, then your hand ── */}
      <section className="my-side bh-handbar" aria-label="Your cards">
        <div className="bh-status" data-mine={myTurn}>
          <span className="bh-status-turn" key={game.turnKey}>
            {!over && myTurn ? <TurnTimer seconds={BHABHI_TURN_SECONDS} paused={paused} /> : over ? "Game over" : escaped ? "You got away" : state.turn !== null ? `${nameOf(state.turn)}'s turn` : "Next trick"}
          </span>
          {chosen ? (
            <button type="button" className="bh-play" onClick={() => play(chosen)}>
              Play <CardLabel card={chosen} />
            </button>
          ) : (
            <span className="bh-status-what">
              {myTurn
                ? t.first && !t.plays.length
                  ? "Lead the Ace of Spades"
                  : t.plays.length && legal.some((c) => suitOf(c) === t.suit)
                    ? `Follow ${SUIT_SYMBOL[t.suit!]}`
                    : t.plays.length
                      ? t.first
                        ? "No spades: play any card"
                        : "No card of that suit: thulla!"
                      : "Lead any card"
                : status}
            </span>
          )}
        </div>
        <div className="bh-hand" style={{ "--n": hand.length, "--fan": `${fan}deg` } as CSSProperties}>
          {hand.map((c, i) => {
            const ok = myTurn && legal.includes(c);
            return (
              <button
                type="button"
                key={c}
                className="bh-card"
                data-ok={ok}
                data-dim={myTurn && !ok}
                data-picked={chosen === c}
                style={{ "--i": i } as CSSProperties}
                aria-label={cardName(c)}
                disabled={!ok}
                onClick={() => tap(c)}
                onDoubleClick={() => ok && play(c)}
              >
                <CardImg card={c} />
              </button>
            );
          })}
          {hand.length === 0 && !over && <p className="bh-empty">No cards: you got away</p>}
        </div>
      </section>

      {/* ── you got away early: watch, or skip to the end ── */}
      {escaped && (
        <div className="bh-away" role="status">
          <b>You got away {ORDINAL[myPlace]}!</b>
          {coins && (
            <span className="result-coins" data-won={payout > 0}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/coins/coin.svg" alt="" width={18} height={18} />+{payout}
            </span>
          )}
          <div className="bh-away-row">
            {/* at a table with friends the others play on: you can only watch */}
            {!game.online && (
              <button type="button" className="result-next" onClick={game.finish}>
                Skip to end
              </button>
            )}
            <button
              type="button"
              className="result-menu"
              onClick={() => {
                sfx.back();
                onMenu();
              }}
            >
              Menu
            </button>
          </div>
        </div>
      )}

      {/* ── the end: who's the Bhabhi ── */}
      {over && (
        <div className="result bh-result" role="dialog" aria-modal="false" aria-label="Game over">
          <div className="result-card">
            <div className="bh-reveal" style={{ "--accent": people[state.bhabhi!].c.accent } as CSSProperties}>
              <Portrait id={people[state.bhabhi!].c.id} accent={people[state.bhabhi!].c.accent} className="bh-reveal-pfp" />
              <span className="bh-reveal-stamp">Bhabhi</span>
            </div>
            <h2 className="result-title" data-tone={state.bhabhi === 0 ? "bad" : "good"}>
              {state.bhabhi === 0 ? "You're the Bhabhi!" : `${nameOf(state.bhabhi!)} is the Bhabhi`}
            </h2>
            <ol className="bh-places">
              {state.order.map((s) => (
                <li key={s} data-me={s === 0}>
                  <span>{ORDINAL[state.place[s]!]}</span>
                  {nameOf(s)}
                </li>
              ))}
            </ol>
            {coins && (
              <p className="result-coins" data-won={payout > 0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/coins/coin.svg" alt="" width={20} height={20} />
                {payout > 0 ? `+${payout}` : "+0"}
              </p>
            )}
            <div className="result-actions">
              {/* a table with friends plays one game: after it, everyone leaves */}
              {!game.online && (
                <button type="button" className="result-next" autoFocus onClick={() => void game.start(n)}>
                  Play again
                  {coins && <CostTag amount={coins.fee} className="result-cost" />}
                </button>
              )}
              <button
                type="button"
                className="result-menu"
                autoFocus={game.online}
                onClick={() => {
                  sfx.back();
                  onMenu();
                }}
              >
                {game.online ? "Leave table" : "Menu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One line about the latest thing that happened. */
function statusLine(s: BhabhiState, nameOf: (s: Seat) => string) {
  const ev = s.events;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    switch (e.type) {
      case "end":
        return <>{e.bhabhi === 0 ? "You're left holding cards" : `${nameOf(e.bhabhi)} is left holding cards`}</>;
      case "escape":
        continue;
      case "pickup": {
        const th = findBack(ev, i, "thulla");
        return (
          <>
            {th ? `${nameOf(th.seat)} thulla'd: ` : ""}
            {nameOf(e.to)} {e.to === 0 ? "pick" : "picks"} up {e.cards.length}
          </>
        );
      }
      case "cleared":
        return <>Thrown away · {nameOf(s.trick.leader)} {s.trick.leader === 0 ? "lead" : "leads"}</>;
      case "play":
        return (
          <>
            {nameOf(e.seat)} {e.lead ? (e.seat === 0 ? "led" : "led") : "played"} <CardLabel card={e.card} />
            {e.auto ? " (time)" : ""}
          </>
        );
      case "deal":
        return <>{nameOf(s.trick.leader)} {s.trick.leader === 0 ? "have" : "has"} the Ace of Spades</>;
      default:
        continue;
    }
  }
  return null;
}

function findBack<T extends BhabhiEvent["type"]>(ev: BhabhiEvent[], from: number, type: T) {
  for (let i = from; i >= 0; i--) if (ev[i].type === type) return ev[i] as Extract<BhabhiEvent, { type: T }>;
  return null;
}

/** A short note by a seat's name: thulla, picked up, got away. */
function seatBubble(s: BhabhiState, seat: Seat): { text: string; tone: string; key: string } | null {
  const l = s.lastTrick;
  if (!l || s.trick.plays.length) return null;
  if (l.thulla === seat) return { text: "Thulla!", tone: "thulla", key: `t${l.id}` };
  if (l.outcome === "pickup" && l.to === seat) return { text: `+${l.plays.length} cards`, tone: "pickup", key: `p${l.id}` };
  return null;
}
