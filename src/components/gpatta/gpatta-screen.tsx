"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { RANKS } from "@/lib/game/cards";
import { type Card, type GPattaEvent, cardLabel, drawTarget, rankLabel } from "@/lib/gpatta/engine";
import { payoutFor } from "@/lib/wallet/economy";
import { sfx } from "@/lib/sfx";
import { CostTag } from "@/components/shop/cost-tag";
import { WinFlare } from "@/components/game/win-flare";
import { Portrait } from "@/components/game/portrait";
import { CardFace } from "@/components/game/playing-card";
import { seatTags } from "@/components/stage/anchors";
import { DEAL_GAP, GPATTA_TURN_SECONDS, PAIR_FLY, PAIR_GAP, type GPattaGame, motionReduced, timeline } from "./use-gpatta";
import { TurnTimer } from "@/components/game/turn-timer";
import "./gpatta.css";

const ME = 0;
/** Where things sit, in % of the screen: the middle of the 3D table's felt is about (50, 46). */
const PILE = { x: 68, y: 46 };
const OUT = { x: 30, y: 46 };
const DECK = { x: 50, y: 46 };
const FLY_MS = 420;
/** Where each seat's tag sits on screen (the 3D players: right, across, left). */
const SPOT = { 1: "right", 2: "top", 3: "left" } as const;

/** Where a seat sits on screen: you at the bottom, the others where they sit at the 3D table. */
function spot(seat: number, n: number) {
  if (seat === ME) return { x: 50, y: 100 };
  if (n === 4) return [{ x: 50, y: 100 }, { x: 90, y: 44 }, { x: 50, y: 22 }, { x: 10, y: 44 }][seat];
  const a = (((seat - 0.5) / (n - 1)) * Math.PI);
  return { x: 50 + 40 * Math.cos(a), y: 46 - 24 * Math.sin(a) };
}

const ordinal = (p: number) => `${p}${p === 1 ? "st" : p === 2 ? "nd" : p === 3 ? "rd" : "th"}`;
const cardKey = (c: Card) => `${c.r}${c.s}`;

/** The same card face as Rung (painted on a canvas): {r: 10, s: "h"} is "TH". */
const Face = ({ card }: { card: Card }) => <CardFace card={`${RANKS[card.r - 2]}${card.s.toUpperCase()}`} />;
const Back = () => <span className="gp-back" />;

interface Flight {
  key: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  dur: number;
  card: Card | null;
  rot: number;
  fade: boolean;
}

export function GPattaScreen({
  game,
  seatChars,
  names,
  bots,
  paused,
  onMenu,
  onRules,
}: {
  game: GPattaGame;
  /** Character (index into CHARACTERS) at each seat; seat 0 is you. */
  seatChars: number[];
  /** Names for the seats (seat 0 defaults to "You"). */
  names?: string[];
  /** Online: which seats a computer plays (every seat but yours, playing alone). */
  bots?: boolean[];
  paused: boolean;
  onMenu: () => void;
  onRules: () => void;
}) {
  const { state } = game;
  const [picked, setPicked] = useState<number | null>(null);
  const [nudge, setNudge] = useState(0);

  const n = state?.n ?? 4;
  const chars = useMemo(
    () => Array.from({ length: n }, (_, i) => CHARACTERS[(seatChars[i] ?? i) % CHARACTERS.length]),
    [n, seatChars],
  );
  const nameOf = useMemo(() => {
    const seen = new Map<string, number>();
    const list = chars.map((c, i) => {
      if (names?.[i]) return names[i];
      if (i === ME) return "You";
      const k = (seen.get(c.name) ?? 0) + 1;
      seen.set(c.name, k);
      return k > 1 ? `${c.name} ${k}` : c.name;
    });
    return (i: number) => list[i] ?? `Seat ${i + 1}`;
  }, [chars, names]);

  const events = state?.events;
  const steps = useMemo(() => timeline(events ?? [], motionReduced()), [events]);

  // what flies across the table during this step
  const flights = useMemo(() => {
    const out: Flight[] = [];
    if (!state) return out;
    for (const b of steps.beats) {
      const e = b.e;
      if (e.t === "deal") {
        const total = e.counts.reduce((a, c) => a + c, 0);
        for (let k = 0; k < total; k++) {
          const seat = (e.first + k) % n;
          out.push({ key: `d${k}`, from: DECK, to: spot(seat, n), delay: b.at + k * DEAL_GAP, dur: FLY_MS, card: null, rot: (k % 5) * 7 - 14, fade: true });
        }
      } else if (e.t === "pairs") {
        e.cards.forEach((c, i) => {
          out.push({
            key: `p${b.at}-${i}`,
            from: spot(e.seat, n),
            // the two cards of a pair land side by side, face up, one pair after another
            to: { x: PILE.x + (i % 2 ? 5 : -5), y: PILE.y },
            delay: b.at + 200 + Math.floor(i / 2) * PAIR_GAP + (i % 2) * 80,
            dur: PAIR_FLY,
            card: c,
            rot: (i * 37) % 30 - 15,
            fade: true,
          });
        });
      } else if (e.t === "draw") {
        const known = e.to === ME || e.from === ME;
        out.push({ key: `w${b.at}`, from: spot(e.from, n), to: spot(e.to, n), delay: b.at, dur: b.dur - 80, card: known ? e.card : null, rot: 8, fade: true });
      }
    }
    return out;
  }, [state, steps, n]);

  if (!state) return null;
  const me = state.players[ME];
  const dealStep = steps.beats.find((b) => b.e.t === "deal");
  const revealStep = steps.beats.find((b) => b.e.t === "reveal-out");
  const freshCard = steps.beats.map((b) => b.e).find((e): e is Extract<GPattaEvent, { t: "draw" }> => e.t === "draw" && e.to === ME)?.card;
  const target = state.phase === "draw" ? drawTarget(state, state.turn) : null;
  const myPick = game.waiting && state.phase === "draw";
  const manualPairs = game.waiting && state.phase === "pairs";
  const over = state.phase === "over" && !game.busy;
  const sel = manualPairs ? picked : null;

  // your hand, sorted by rank so pairs sit together (positions in the real hand are kept for moves)
  const hand = me.hand.map((c, i) => ({ c, i })).sort((a, b) => a.c.r - b.c.r || a.c.s.localeCompare(b.c.s));

  // pile: the newest few, the ones thrown this step land when their flight does
  const stepThrown = steps.beats.reduce((a, b) => a + (b.e.t === "pairs" ? b.e.cards.length : 0), 0);
  const landAt = new Map<number, number>();
  {
    let idx = state.discard.length - stepThrown;
    for (const b of steps.beats) {
      if (b.e.t !== "pairs") continue;
      b.e.cards.forEach((_, i) => landAt.set(idx++, b.at + 200 + Math.floor(i / 2) * PAIR_GAP + (i % 2) * 80 + PAIR_FLY));
    }
  }
  const pileFrom = Math.max(0, state.discard.length - 6);

  // the line under the table
  let status = "";
  const last = state.events.at(-1);
  if (myPick && target !== null) status = `Your turn · take a card from ${nameOf(target)}`;
  else if (manualPairs) status = "Throw your pairs · tap two cards of the same rank";
  else if (game.busy && last) {
    const e = state.events.find((x) => x.t === "draw") ?? last;
    if (e.t === "reveal-out") status = `Taken out: ${cardLabel(e.card)} · one ${rankLabel(e.card.r)} has no pair now`;
    else if (e.t === "deal") status = "Dealing every card";
    else if (e.t === "pairs") status = `${nameOf(e.seat)} threw ${e.cards.length / 2} pair${e.cards.length > 2 ? "s" : ""}`;
    else if (e.t === "draw")
      status =
        e.to === ME
          ? `You took ${e.card ? cardLabel(e.card) : "a card"} from ${nameOf(e.from)}`
          : e.from === ME
            ? `${nameOf(e.to)} took your ${e.card ? cardLabel(e.card) : "card"}`
            : `${nameOf(e.to)} took a card from ${nameOf(e.from)}`;
    else if (e.t === "safe") status = `${nameOf(e.seat)} ${e.seat === ME ? "are" : "is"} out · ${ordinal(e.place)}`;
    else if (e.t === "end") status = e.g >= 0 ? `${nameOf(e.g)} ${e.g === ME ? "are" : "is"} G` : "";
  } else if (state.phase === "pairs") status = "Throwing pairs";
  else if (state.phase === "draw" && target !== null) status = `${nameOf(state.turn)} is taking from ${nameOf(target)}`;
  else if (state.phase === "over" && state.g !== null) status = `${nameOf(state.g)} ${state.g === ME ? "are" : "is"} G`;

  const tapCard = (i: number) => {
    if (!manualPairs) return;
    if (sel === null) {
      setPicked(i);
      sfx.select();
    } else if (sel === i) setPicked(null);
    else if (me.hand[sel]?.r === me.hand[i].r) {
      game.pair(sel, i);
      setPicked(null);
    } else {
      setPicked(i);
      setNudge((k) => k + 1);
      sfx.back();
    }
  };

  const myPlace = me.place;
  const standings = state.players
    .map((p, i) => ({ i, place: p.place ?? n }))
    .sort((a, b) => a.place - b.place);
  // against the computer it is free: coins are only shown at a table with friends
  const wallet = game.online ? game.coins : undefined;
  const expected = myPlace !== null ? payoutFor("gpatta", { place: myPlace, players: n }) : 0;
  const coins = wallet?.paid ?? expected;

  return (
    <div className="gp" data-phase={state.phase} data-n={n} data-paused={paused}>
      {/* ── top: pairs thrown, help (the same chips as Rung and 3 Patti) ── */}
      <header className="hud-top gp-top">
        <div className="hud-chip">
          <span>Pairs</span>
          <b className="hud-series">{state.discard.length / 2}</b>
        </div>
      </header>
      <button type="button" className="icon-button corner-back gp-help" aria-label="Rules" onClick={onRules}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 9.2a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.9v.7" />
          <path d="M12 18h.01" />
        </svg>
      </button>

      {/* ── the other players: tags that follow them at the 3D table ── */}
      {state.players.map((p, s) => {
        if (s === ME || s > 3) return null;
        const c = chars[s];
        const safe = p.place !== null && state.g !== s;
        return (
          <div
            key={s}
            ref={(el) => {
              seatTags[s] = el;
            }}
            className="seat-tag gp-seat"
            data-spot={SPOT[s as 1 | 2 | 3]}
            data-turn={state.phase === "draw" && state.turn === s}
            data-target={myPick && target === s}
            data-safe={safe}
            data-g={over && state.g === s}
            style={{ "--accent": c.accent } as CSSProperties}
          >
            <span className="seat-pfp-wrap">
              <Portrait id={c.id} accent={c.accent} className="seat-pfp" letter={c.name.slice(0, 1)} />
              {(bots?.[s] ?? true) && <i className="seat-cpu">CPU</i>}
              {safe && <WinFlare key={`f${p.place}`} />}
              {safe && <em className="gp-place">{ordinal(p.place!)}</em>}
              {over && state.g === s && <strong className="gp-stamp">G</strong>}
            </span>
            <span className="seat-name">{nameOf(s)}</span>
            <span className="seat-cards" key={p.hand.length}>
              {safe ? "Safe" : `${p.hand.length} card${p.hand.length === 1 ? "" : "s"}`}
            </span>
          </div>
        );
      })}

      {/* ── cards on the 3D table: a see-through layer ── */}
      <section className="gp-stage" aria-label="Table">
        {/* the deck, while the card is taken out and everything is dealt */}
        {(state.phase === "reveal" || dealStep) && (
          <div className="gp-deck" style={{ left: `${DECK.x}%`, top: `${DECK.y}%`, "--t": dealStep ? `${dealStep.dur}ms` : "0ms" } as CSSProperties} data-dealing={!!dealStep} aria-hidden>
            <Back />
            <Back />
            <Back />
          </div>
        )}

        {/* the card taken out: drawn, turned over for everyone, then set aside */}
        {revealStep ? (
          <div className="gp-reveal" style={{ "--x0": `${DECK.x}%`, "--y0": `${DECK.y}%`, "--x1": `${OUT.x}%`, "--y1": `${OUT.y}%` } as CSSProperties} aria-label={`Taken out: ${cardLabel(state.out)}`}>
            <span className="gp-flip">
              <span className="gp-flip-front">
                <Face card={state.out} />
              </span>
              <span className="gp-flip-back">
                <Back />
              </span>
            </span>
          </div>
        ) : (
          <div className="gp-out" style={{ left: `${OUT.x}%`, top: `${OUT.y}%` }} title={`Taken out: ${cardLabel(state.out)}`}>
            <Face card={state.out} />
            <span className="gp-out-label">Out</span>
          </div>
        )}

        {/* thrown pairs */}
        {state.discard.length > 0 && (
          <div className="gp-pile" style={{ left: `${PILE.x}%`, top: `${PILE.y}%` }} aria-label={`${state.discard.length / 2} pairs thrown`}>
            {state.discard.slice(pileFrom).map((c, k) => {
              const idx = pileFrom + k;
              return (
                <span
                  key={cardKey(c)}
                  className="gp-pile-card"
                  style={{ "--r": `${((idx * 47) % 40) - 20}deg`, "--d": `${landAt.get(idx) ?? 0}ms` } as CSSProperties}
                  data-new={landAt.has(idx)}
                  data-top={idx >= state.discard.length - 2 ? (idx % 2 ? "r" : "l") : undefined}
                >
                  <Face card={c} />
                </span>
              );
            })}
          </div>
        )}

        {/* cards in flight */}
        {game.busy && (
          <div className="gp-flights" key={state.seq} aria-hidden>
            {flights.map((f) => (
              <span
                key={f.key}
                className="gp-fly"
                data-fade={f.fade}
                style={
                  {
                    "--x0": `${f.from.x}%`,
                    "--y0": `${f.from.y}%`,
                    "--x1": `${f.to.x}%`,
                    "--y1": `${f.to.y}%`,
                    "--d": `${f.delay}ms`,
                    "--t": `${f.dur}ms`,
                    "--r": `${f.rot}deg`,
                  } as CSSProperties
                }
              >
                {f.card ? <Face card={f.card} /> : <Back />}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── your side: the pick, what's happening, your hand ── */}
      <section className="my-side gp-me" aria-label="Your cards">
        {myPick && target !== null && (
          <div className="gp-pick" role="group" aria-label={`Take a card from ${nameOf(target)}`} style={{ "--n": state.players[target].hand.length, "--n1": Math.max(1, state.players[target].hand.length - 1) } as CSSProperties}>
            {state.players[target].hand.map((_, i) => (
              <button key={i} type="button" className="gp-pick-card" style={{ "--k": i - (state.players[target].hand.length - 1) / 2 } as CSSProperties} aria-label={`Card ${i + 1}`} onMouseEnter={() => sfx.hover()} onClick={() => game.pick(i)}>
                <Back />
              </button>
            ))}
          </div>
        )}

        <div className="gp-bar">
          <p className="gp-status" role="status" data-mine={myPick || manualPairs} key={status}>
            {game.clockKey ? (
              <TurnTimer key={game.clockKey} seconds={GPATTA_TURN_SECONDS} paused={paused} label={myPick && target !== null ? `Take from ${nameOf(target)}` : manualPairs ? "Throw pairs" : "Your turn"} />
            ) : (
              <span>{status || (myPlace !== null && state.g !== ME ? `You're safe · ${ordinal(myPlace)}` : "G Patta")}</span>
            )}
          </p>
          <label className="gp-auto">
            <input type="checkbox" checked={game.autoPairs} onChange={(e) => game.setAutoPairs(e.target.checked)} />
            <span>Auto pairs</span>
          </label>
        </div>
        {game.error && (
          <p className="gp-error" role="alert">
            {game.error}
          </p>
        )}

        <div className="gp-hand" data-manual={manualPairs} data-nudge={nudge === 0 ? undefined : nudge % 2 ? "a" : "b"} style={{ "--n": hand.length, "--n1": Math.max(1, hand.length - 1) } as CSSProperties}>
          {hand.map(({ c, i }, k) => (
            <button
              key={cardKey(c)}
              type="button"
              className="gp-card"
              disabled={!manualPairs}
              data-picked={sel === i}
              data-fresh={!!freshCard && cardKey(freshCard) === cardKey(c)}
              data-deal={!!dealStep}
              style={
                {
                  "--k": k - (hand.length - 1) / 2,
                  "--d": dealStep ? `${dealStep.at + (i * n + ((ME - state.first + n) % n)) * DEAL_GAP + FLY_MS}ms` : "0ms",
                } as CSSProperties
              }
              aria-label={cardLabel(c)}
              onClick={() => tapCard(i)}
            >
              <Face card={c} />
            </button>
          ))}
          {hand.length === 0 && state.phase !== "reveal" && !dealStep && <p className="gp-empty">{myPlace !== null ? "You're out" : ""}</p>}
        </div>

        {manualPairs && (
          <div className="gp-actions">
            <button type="button" className="gp-btn" onClick={game.throwAll}>
              Throw all pairs
            </button>
          </div>
        )}
      </section>

      {over && state.g !== null && (
        <div className="result gp-result" role="dialog" aria-modal="false" aria-label="Game over">
          <div className="result-card">
            <h2 className="result-title" data-tone={state.g === ME ? "bad" : "good"}>
              {state.g === ME ? "You're G" : `Out ${ordinal(myPlace ?? n)}`}
            </h2>
            <div className="gp-final">
              <span className="gp-final-card">
                <Face card={state.players[state.g].hand[0] ?? state.out} />
                <strong className="gp-stamp">G</strong>
              </span>
              <ol className="gp-standings">
                {standings.map(({ i, place }) => (
                  <li key={i} data-me={i === ME} data-g={i === state.g}>
                    <b>{i === state.g ? "G" : ordinal(place)}</b> {nameOf(i)}
                  </li>
                ))}
              </ol>
            </div>
            {wallet && (
              <p className="result-coins" data-won={coins > 0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/coins/coin.svg" alt="" width={20} height={20} />
                {coins > 0 ? `+${coins}` : "+0"}
              </p>
            )}
            <div className="result-actions">
              {/* a table with friends plays one game: after it, everyone leaves */}
              {!game.online && (
                <button type="button" className="result-next" autoFocus onClick={() => void game.start(n)}>
                  Play again
                  {wallet && <CostTag amount={wallet.fee} className="result-cost" />}
                </button>
              )}
              <button type="button" className="result-menu" autoFocus={game.online} onClick={onMenu}>
                {game.online ? "Leave table" : "Menu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
