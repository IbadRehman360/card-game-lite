"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import {
  type BluffCard,
  type BluffState,
  CHAMBERS,
  RANK_NAME,
  type Seat,
  isJoker,
  options,
} from "@/lib/bluff/engine";
import { sfx } from "@/lib/sfx";
import { seatTags } from "@/components/stage/anchors";
import { CardFace } from "@/components/game/playing-card";
import { Portrait } from "@/components/game/portrait";
import { Burst, EmoteButton, EmoteDeck, type LiveChat, useEmotes } from "@/components/game/emotes";
import { useChatSound } from "@/components/game/chat";
import { BLUFF_TURN_SECONDS, type BluffGame, SHOT_AT_MS, SHOT_LANDS_MS } from "./use-bluff";
import { CostTag } from "@/components/shop/cost-tag";
import { BLUFF_WIN } from "@/lib/wallet/economy";
import { TurnTimer } from "@/components/game/turn-timer";
import "./bluff.css";

const SPOT = { 1: "right", 2: "top", 3: "left" } as const;
const SUITS = "SHDC";

/** A Bluff card as an ordinary playing card (K0 → King of Spades …); Jokers are drawn separately. */
export const asPlayingCard = (c: BluffCard) => `${c[0]}${SUITS[Number(c.slice(1)) % 4]}`;

export function BluffCardFace({ card }: { card: BluffCard }) {
  if (card === "??") return <span className="bluff-back" />;
  if (isJoker(card))
    return (
      <span className="bluff-joker">
        <b>★</b>
        <small>Joker</small>
      </span>
    );
  return <CardFace card={asPlayingCard(card)} />;
}

/** A revolver cylinder: six chambers, the ones already pulled shown empty. */
export function Cylinder({ shots, dead, spin }: { shots: number; dead?: boolean; spin?: boolean }) {
  return (
    <svg className="bluff-cyl" data-dead={dead} data-spin={spin} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="18" className="bluff-cyl-body" />
      {Array.from({ length: CHAMBERS }, (_, i) => {
        const a = (i / CHAMBERS) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={i}
            cx={20 + Math.cos(a) * 10.5}
            cy={20 + Math.sin(a) * 10.5}
            r="4.3"
            className="bluff-cyl-hole"
            data-used={i < shots || dead}
          />
        );
      })}
      <circle cx="20" cy="20" r="3" className="bluff-cyl-pin" />
    </svg>
  );
}

/** A cartoon blood splat (one shape, a few drops), for whoever takes the live round. */
export function Splat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="bluff-blood" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#b3121c" />
          <stop offset="1" stopColor="#7a0f14" />
        </radialGradient>
      </defs>
      <path
        fill="url(#bluff-blood)"
        d="M50 18c6 0 8 9 13 10s12-8 16-3-4 11-1 16 13 4 12 11-11 4-13 9 6 13 0 16-9-7-15-6-8 12-14 10-2-11-7-14-14 3-15-4 9-8 8-13-11-9-6-14 12 2 16-2 0-16 6-16z"
      />
      <circle cx="18" cy="22" r="4.5" fill="#9a1018" />
      <circle cx="86" cy="80" r="3.5" fill="#9a1018" />
      <circle cx="12" cy="70" r="2.8" fill="#9a1018" />
      <circle cx="82" cy="16" r="2.4" fill="#9a1018" />
      <ellipse cx="42" cy="38" rx="7" ry="4" fill="#d8434b" opacity="0.5" transform="rotate(-25 42 38)" />
    </svg>
  );
}

/** What a seat did last this round, for the bubble by their name. */
function lastMove(state: BluffState, seat: Seat): string | null {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i];
    if (e.type === "play" && e.seat === seat) return `${e.auto ? "Time: " : ""}${e.count} ${RANK_NAME[state.tableCard]}${e.count > 1 ? "s" : ""}`;
    if (e.type === "call" && e.by === seat) return "Liar!";
  }
  return null;
}

/** The game laid over the 3D table: the table card, seats with their revolvers, your hand and your moves. */
export function BluffScreen({
  game,
  seatChars,
  paused,
  onMenu,
  onRules,
  names,
  bots,
  talk,
}: {
  game: BluffGame;
  seatChars: number[];
  paused: boolean;
  onMenu: () => void;
  onRules: () => void;
  /** Online: each seat's name and whether a computer plays it. */
  names?: string[];
  bots?: boolean[];
  /** Online: the table's chat (emotes go to everyone). */
  talk?: { myId: string; send: (m: { text?: string; sticker?: string }) => unknown; messages: LiveChat[] };
}) {
  const { state } = game;
  const nameOf = useCallback(
    (s: Seat) => (s === 0 ? "You" : names?.[s] || CHARACTERS[seatChars[s]].name),
    [names, seatChars],
  );

  // emotes stay on this phone when playing alone
  const [mine, setMine] = useState<LiveChat[]>([]);
  const sendLocal = useCallback((m: { text?: string; sticker?: string }) => {
    setMine((list) => [...list.slice(-20), { id: `${Date.now()}`, name: "You", seat: 0, live: true, at: Date.now(), playerId: "me", ...m }]);
  }, []);
  const send = talk ? talk.send : sendLocal;
  const local = talk ? talk.messages : mine;
  const emotes = useEmotes(send);
  useChatSound(local, talk?.myId ?? "me");
  const lastFrom = (s: Seat) => {
    for (let i = local.length - 1; i >= 0; i--) if (local[i].seat === s) return local[i];
    return undefined;
  };

  // the cards you picked to lay (cleared whenever your hand changes)
  const handKey = state ? `${state.round}:${state.hands[0].join(",")}` : "";
  const [picked, setPicked] = useState<{ key: string; cards: BluffCard[] }>({ key: "", cards: [] });
  const chosen = picked.key === handKey ? picked.cards : [];

  // a call's reveal plays out in steps: cards turned over, then the trigger, then the outcome
  const revealKey = state?.reveal ? `${state.round}:${state.reveal.caller}` : null;
  const [step, setStep] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  useEffect(() => {
    if (!revealKey) return;
    const ts = [
      window.setTimeout(() => setStep({ key: revealKey, n: 0 }), 0),
      window.setTimeout(() => setStep({ key: revealKey, n: 1 }), SHOT_AT_MS),
      window.setTimeout(() => setStep({ key: revealKey, n: 2 }), SHOT_LANDS_MS - 800),
      window.setTimeout(() => setStep({ key: revealKey, n: 3 }), SHOT_LANDS_MS),
      window.setTimeout(() => setStep({ key: revealKey, n: 4 }), SHOT_LANDS_MS + 1100),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [revealKey]);
  const stage = step.key === revealKey ? step.n : 0;

  // the last five seconds of your clock tick
  const o = state ? options(state, 0) : null;
  const yourMove = !!o?.myTurn;
  useEffect(() => {
    if (!yourMove || paused) return;
    const ticks = [5, 4, 3, 2, 1].map((left) => window.setTimeout(() => sfx.tick(), (BLUFF_TURN_SECONDS - left) * 1000));
    return () => ticks.forEach((t) => window.clearTimeout(t));
  }, [yourMove, paused, game.turnKey]);

  const claim = useMemo(() => {
    if (!state) return null;
    const last = state.plays[state.plays.length - 1];
    return last ? { seat: last.seat, count: last.cards.length } : null;
  }, [state]);

  if (!state || !o) return null;
  const me = state.players[0];
  const rank = RANK_NAME[state.tableCard];
  const reveal = state.reveal;
  const over = state.phase === "over";
  const showEnd = over && (!reveal || stage >= 4);
  /** The gun is up (spinning, cocked, or just gone off). */
  const gunUp = !!reveal && stage >= 1 && stage <= 3;
  const landed = !!reveal && stage >= 3;
  const hit = (s: Seat) => !!reveal && landed && reveal.fired && reveal.loser === s;
  const turnName = nameOf(state.turn);

  const toggle = (c: BluffCard) => {
    if (!o.canPlay) return;
    sfx.hover();
    const has = chosen.includes(c);
    if (!has && chosen.length >= o.maxPlay) return;
    setPicked({ key: handKey, cards: has ? chosen.filter((x) => x !== c) : [...chosen, c] });
  };
  const play = () => {
    if (!chosen.length) return;
    game.move({ type: "play", cards: chosen });
    setPicked({ key: "", cards: [] });
  };

  return (
    <div className="game bluff">
      {/* ── top: the table card ── */}
      <header className="hud-top bluff-hud">
        <button
          type="button"
          className="bluff-hud-card"
          key={state.round}
          aria-label={`Round ${state.round}, table card ${rank}. Rules`}
          onClick={onRules}
        >
          <small>Round {state.round}</small>
          <b>{rank}s</b>
        </button>
      </header>

      {/* ── the other three players ── */}
      {([1, 2, 3] as Seat[]).map((s) => {
        const c = CHARACTERS[seatChars[s]];
        const p = state.players[s];
        const theirTurn = state.phase === "play" && state.turn === s;
        const move = lastMove(state, s);
        return (
          <div
            key={s}
            ref={(el) => {
              seatTags[s] = el;
            }}
            className="seat-tag bluff-seat"
            data-spot={SPOT[s as 1 | 2 | 3]}
            data-turn={theirTurn}
            data-out={!p.alive}
            data-aim={gunUp && reveal?.loser === s && stage < 3}
            data-shot={hit(s) || !p.alive}
            data-relief={landed && !reveal?.fired && reveal?.loser === s}
            style={{ "--accent": c.accent } as CSSProperties}
          >
            <span className="seat-pfp-wrap">
              <Portrait id={c.id} accent={c.accent} className="seat-pfp" letter={c.name.slice(0, 1)} />
              {(bots?.[s] ?? true) && <i className="bluff-bot" title="Computer" aria-label="Computer" />}
              {(hit(s) || !p.alive) && (
                <>
                  <Splat className="bluff-splat" />
                  <b className="bluff-stamp">Out</b>
                </>
              )}
            </span>
            <span className="bluff-plate">
              <span className="seat-name">{nameOf(s)}</span>
              <span className="bluff-stats">
                {p.alive ? (
                  <>
                    <span className="bluff-count" title="Cards in hand">
                      <i aria-hidden />
                      {state.counts[s]}
                    </span>
                    <span className="bluff-chambers" title="Chambers pulled">
                      <Cylinder shots={p.shots} />
                      {p.shots}/{CHAMBERS}
                    </span>
                  </>
                ) : (
                  <span className="bluff-out">Out</span>
                )}
              </span>
            </span>
            {move && p.alive && (
              <span className="bluff-move" data-call={move === "Liar!"} key={`${state.round}-${state.events.length}-${move}`}>
                {move}
              </span>
            )}
            <Burst message={lastFrom(s)} rel={s as 1 | 2 | 3} />
          </div>
        );
      })}

      {game.error && (
        <div className="banner" data-tone="warn" role="status">
          {game.error}
        </div>
      )}

      {/* ── you ── */}
      <section className="my-side bluff-me" aria-label="Your cards">
        <div className="my-row">
          <div className="bluff-wallet" data-dead={!me.alive}>
            <Cylinder shots={me.shots} dead={!me.alive} />
            <b>{me.alive ? `${me.shots}/${CHAMBERS}` : "Out"}</b>
          </div>
          <div className="turn-plate" data-on={yourMove} key={yourMove ? game.turnKey : "wait"}>
            {yourMove ? (
              <>
                <TurnTimer seconds={BLUFF_TURN_SECONDS} paused={paused} label={o.mustCall ? "Call it" : "Your turn"} />
              </>
            ) : (
              <span>
                {!me.alive
                  ? "You're out"
                  : state.phase === "reveal"
                    ? "Liar called"
                    : over
                      ? "Game over"
                      : `${turnName}'s turn`}
              </span>
            )}
          </div>
          <div className="social-dock">
            <EmoteButton emotes={emotes} />
            <EmoteDeck emotes={emotes} onSay={(text) => send({ text })} />
          </div>
        </div>
        <div className="burst-me">
          <Burst message={lastFrom(0)} rel={0} />
        </div>

        <div className="bluff-play-row">
          {!me.alive && !over && (
            <button
              type="button"
              className="bluff-leave"
              onClick={() => {
                sfx.back();
                onMenu();
              }}
            >
              Leave table
            </button>
          )}
          <ul className="bluff-hand" style={{ "--n": state.hands[0].length } as CSSProperties} data-active={o.canPlay}>
            {state.hands[0].map((c, i) => (
              <li key={c} style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  className="bluff-card"
                  data-picked={chosen.includes(c)}
                  data-match={c[0] === state.tableCard || isJoker(c)}
                  disabled={!o.canPlay}
                  aria-pressed={chosen.includes(c)}
                  aria-label={isJoker(c) ? "Joker" : RANK_NAME[c[0] as "K"]}
                  onClick={() => toggle(c)}
                >
                  <BluffCardFace card={c} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {o.myTurn && (
          <div className="bluff-actions" role="group" aria-label="Your move">
            <button
              type="button"
              className="bluff-round"
              data-kind="liar"
              disabled={!o.canCall}
              onClick={() => game.move({ type: "call" })}
            >
              <b>Liar!</b>
              {claim && <small>{nameOf(claim.seat)}</small>}
            </button>
            {!o.mustCall && (
              <button
                type="button"
                className="bluff-round"
                data-kind="play"
                disabled={!o.canPlay || chosen.length === 0}
                onClick={play}
                style={{ "--t": `${BLUFF_TURN_SECONDS}s`, "--state": paused ? "paused" : "running" } as CSSProperties}
                key={game.turnKey}
              >
                <i className="bluff-ring" aria-hidden />
                <b>Play</b>
                <small>
                  {chosen.length ? `${chosen.length} × ${rank}` : `Pick 1–${o.maxPlay}`}
                </small>
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── a call: the cards turned over, then the trigger ── */}
      {reveal && !showEnd && (
        <div
          className="bluff-reveal"
          role="status"
          key={revealKey}
          data-gun={gunUp}
          data-at={reveal.loser === 2 ? "low" : "high"}
        >
          <p className="modal-title bluff-reveal-title">Liar!</p>
          <p className="modal-sub bluff-reveal-who">
            {nameOf(reveal.caller)} → {nameOf(reveal.seat)}
          </p>
          <div className="bluff-reveal-cards">
            {reveal.cards.map((c, i) => (
              <span key={c} className="bluff-reveal-card" style={{ "--i": i } as CSSProperties} data-bad={!(c[0] === state.tableCard || isJoker(c))}>
                <BluffCardFace card={c} />
              </span>
            ))}
          </div>
          <div className="bluff-reveal-foot">
            {stage < 1 ? (
              <p className="bluff-verdict" data-truth={reveal.truthful}>
                {reveal.truthful ? "Truth" : "Lie"}
              </p>
            ) : (
              <div className="bluff-shot" data-fired={landed && reveal.fired} data-landed={landed} data-tense={stage === 2}>
                <Cylinder shots={reveal.pull - 1} spin={stage === 1} />
                <span className="bluff-shot-text">
                  {landed ? (
                    <strong key="hit">{reveal.fired ? "Bang!" : "Click"}</strong>
                  ) : (
                    <strong key="wait" className="bluff-shot-wait">
                      {reveal.pull}/{CHAMBERS}
                    </strong>
                  )}
                  <small>
                    {landed && reveal.fired
                      ? `${nameOf(reveal.loser)} ${reveal.loser === 0 ? "are" : "is"} out`
                      : `${nameOf(reveal.loser)} ${reveal.loser === 0 ? "pull" : "pulls"}`}
                  </small>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {reveal && !showEnd && (
        <div className="bluff-fx" key={`fx-${revealKey}`} aria-hidden>
          <div className="bluff-vignette" data-on={gunUp} data-tense={stage === 2} />
          {landed && reveal.fired && <div className="bluff-flash" />}
          {landed && reveal.fired && reveal.loser === 0 && (
            <div className="bluff-hit-you">
              <Splat className="bluff-hit-splat" />
              <Splat className="bluff-hit-splat" />
              <Splat className="bluff-hit-splat" />
            </div>
          )}
        </div>
      )}

      {/* ── the end ── */}
      {showEnd && state.winner !== null && (
        <div className="result" role="dialog" aria-modal="false" aria-label="Game over">
          <div className="result-card bluff-result">
            <h2 className="result-title" data-tone={state.winner === 0 ? "good" : "bad"}>
              {state.winner === 0 ? "Last one standing!" : `${nameOf(state.winner)} wins`}
            </h2>
            <ul className="bluff-standings">
              {([0, 1, 2, 3] as Seat[]).map((s) => (
                <li key={s} data-won={state.winner === s}>
                  <Cylinder shots={state.players[s].shots} dead={!state.players[s].alive} />
                  <span>{nameOf(s)}</span>
                  <b>{state.winner === s ? "Winner" : "Out"}</b>
                </li>
              ))}
            </ul>
            {game.online && game.coins && (
              <p className="result-coins" data-won={state.winner === 0}>
                {state.winner === 0 ? `+${game.coins.paid ?? BLUFF_WIN} coins` : `Fee ${game.coins.fee} coins lost`}
              </p>
            )}
            <div className="result-actions">
              {/* a table with friends plays one game: after it, everyone leaves */}
              {!game.online && (
                <button type="button" className="result-next" autoFocus onClick={game.next}>
                  Play again
                  {game.online && game.coins && <CostTag amount={game.coins.fee} className="result-cost" />}
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
