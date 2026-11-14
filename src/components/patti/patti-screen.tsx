"use client";

import { CostTag } from "@/components/shop/cost-tag";
import { PATTI_BUYIN, pattiCashOut } from "@/lib/wallet/economy";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { type PattiEvent, type PattiState, type Seat, options } from "@/lib/patti/engine";
import { KIND_NAME, evaluate } from "@/lib/patti/hands";
import { sfx } from "@/lib/sfx";
import { seatTags } from "@/components/stage/anchors";
import { Portrait } from "@/components/game/portrait";
import { Burst, EmoteButton, EmoteDeck, type LiveChat, useEmotes } from "@/components/game/emotes";
import { useChatSound } from "@/components/game/chat";
import { PATTI_TURN_SECONDS, type PattiGame, SIDESHOW_SECONDS } from "./use-patti";
import { CardFace, cardName } from "@/components/game/playing-card";
import { TurnTimer } from "@/components/game/turn-timer";
import { WinFlare } from "@/components/game/win-flare";
import "./patti.css";

const SPOT = { 1: "right", 2: "top", 3: "left" } as const;
/** After a deal ends: the shown hands and the pot sliding over get this long before the result card. */
const RESULT_AFTER_MS = 1400;

/** The same card face as Rung (painted on a canvas). Cards are "AS", "TD"... */
function CardImg({ card }: { card: string }) {
  return (
    <span className="patti-face" aria-label={cardName(card)}>
      <CardFace card={card} />
    </span>
  );
}
const fmt = (n: number) => n.toLocaleString("en-IN");
/** The coin, next to every number at the table (you play with your coins). */
const Coin = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img className="patti-coin" src="/coins/coin.svg" alt="" aria-hidden width={16} height={16} />
);

/** What a seat did last this deal, for the bubble by their name. */
function lastMove(state: PattiState, seat: Seat): string | null {
  for (let i = state.events.length - 1; i >= 0; i--) {
    const e = state.events[i];
    if (e.type === "boot") return null;
    if (!("seat" in e) || e.seat !== seat) continue;
    if (e.type === "chaal") return e.allIn ? `All in ${fmt(e.amount)}` : `${e.raise ? "Raise" : "Chaal"} ${fmt(e.amount)}`;
    if (e.type === "pack") return null; // the seat already says Packed
    if (e.type === "show") return "Show!";
    if (e.type === "sideshowAsk") return "Sideshow?";
    if (e.type === "sideshowReply") return e.accept ? "Accepted" : "Refused";
  }
  return null;
}

/** The game laid over the 3D table: pot, seats, your three cards, your moves and the result. */
export function PattiScreen({
  game,
  seatChars,
  playerName,
  paused,
  onMenu,
  onRules,
  names,
  bots,
  talk,
}: {
  game: PattiGame;
  seatChars: number[];
  playerName: string;
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
    (s: Seat) => (s === 0 ? "You" : (names?.[s] || CHARACTERS[seatChars[s]].name)),
    [names, seatChars],
  );

  // emotes stay on this phone
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

  // a sideshow you were part of: show both hands for a moment
  const sideshow = useMemo(() => {
    if (!state) return null;
    const e = state.events[state.events.length - 1];
    const r = [...state.events].reverse().find((x): x is Extract<PattiEvent, { type: "sideshowReply" }> => x.type === "sideshowReply");
    if (!r || !r.accept || (r.seat !== 0 && r.from !== 0)) return null;
    // only while it is the latest news
    const idx = state.events.lastIndexOf(r);
    if (state.events.length - idx > 2 && e !== r) return null;
    const other = r.seat === 0 ? r.from : r.seat;
    return { other, key: `${state.dealNo}-${idx}`, youLost: r.loser === 0 };
  }, [state]);
  const [hiddenSideshow, setHiddenSideshow] = useState<string | null>(null);

  // the last five seconds of your clock tick
  const o = state ? options(state, 0) : null;
  const yourMove = !!o && (o.myTurn || o.reply);
  useEffect(() => {
    if (!yourMove || paused) return;
    const secs = o?.reply ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS;
    const ticks = [5, 4, 3, 2, 1].map((left) => window.setTimeout(() => sfx.tick(), (secs - left) * 1000));
    return () => ticks.forEach((t) => window.clearTimeout(t));
    // restart with each new turn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourMove, paused, game.turnKey]);

  // The end of a deal: the pot slides to the winner first, then the result card comes up.
  const endedDeal = state?.result ? state.dealNo : null;
  const [resultFor, setResultFor] = useState<number | null>(null);
  useEffect(() => {
    if (endedDeal === null || paused) return;
    const t = window.setTimeout(() => setResultFor(endedDeal), RESULT_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [endedDeal, paused]);

  if (!state || !o) return null;
  const me = state.players[0];
  const result = state.result;
  const showResult = !!result && resultFor === state.dealNo;
  const potWon = result ? result.won.reduce((a, b) => a + b, 0) : 0;
  const potTo = result ? (result.winners[0] === 0 ? "me" : SPOT[result.winners[0] as 1 | 2 | 3]) : null;
  const myValue = state.hands[0].length === 3 ? evaluate(state.hands[0]) : null;
  const turnName = state.pending ? nameOf(state.pending.to) : nameOf(state.turn);

  const status = (s: Seat) => {
    const p = state.players[s];
    if (p.out) return { tag: "Out", tone: "out" };
    if (p.folded) return { tag: "Packed", tone: "out" };
    if (p.allIn) return { tag: "All in", tone: "allin" };
    return p.seen ? { tag: "Seen", tone: "seen" } : { tag: "Blind", tone: "blind" };
  };

  return (
    <div className="game patti">
      {/* ── top: the pot and the stake ── */}
      <header className="hud-top patti-top">
        <button type="button" className="patti-help" aria-label="Hand rankings and rules" onClick={onRules}>
          ?
        </button>
      </header>
      {!result && state.pot > 0 && (
        <div className="patti-pot-center" key={state.pot} aria-label={`Pot ${fmt(state.pot)} coins`}>
          <Coin />
          {fmt(state.pot)}
        </div>
      )}
      {result && potWon > 0 && !showResult && (
        <div className="patti-pot-center patti-pot-fly" data-to={potTo} key={`fly${state.dealNo}`} aria-hidden>
          <Coin />
          {fmt(potWon)}
        </div>
      )}

      {/* ── the other three players ── */}
      {([1, 2, 3] as Seat[]).map((s) => {
        const c = CHARACTERS[seatChars[s]];
        const p = state.players[s];
        const st = status(s);
        const theirTurn = !result && (state.pending ? state.pending.to === s : state.turn === s);
        const move = lastMove(state, s);
        const won = result?.won[s] ?? 0;
        return (
          <div
            key={s}
            ref={(el) => {
              seatTags[s] = el;
            }}
            className="seat-tag patti-seat"
            data-spot={SPOT[s as 1 | 2 | 3]}
            data-turn={theirTurn}
            data-out={st.tone === "out"}
            style={{ "--accent": c.accent } as CSSProperties}
          >
            <span className="seat-pfp-wrap">
              <Portrait id={c.id} accent={c.accent} className="seat-pfp" letter={c.name.slice(0, 1)} />
              {won > 0 && <WinFlare key={state.dealNo} />}
              {(bots?.[s] ?? true) && <i className="patti-bot" title="Computer" aria-label="Computer" />}
              {game.reloaded.includes(s) && state.events.length < 4 && <i className="patti-reload">Bought in</i>}
            </span>
            <span className="patti-plate">
              <span className="seat-name">{c.name}</span>
              <span className="patti-chips">
                <Coin />
                {fmt(p.chips)}
              </span>
              {st.tone !== "blind" && (
                <span className="patti-status" data-tone={st.tone}>
                  {st.tag}
                </span>
              )}
            </span>
            {won > 0 ? (
              <span className="patti-move" data-tone="win" key={`w${state.dealNo}`}>
                +{fmt(won)}
              </span>
            ) : (
              move && (
                <span className="patti-move" key={`${state.events.length}-${move}`}>
                  {move}
                </span>
              )
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

      {/* ── a sideshow you were in: both hands, briefly ── */}
      {sideshow && hiddenSideshow !== sideshow.key && (
        <div className="patti-peek" role="status" key={sideshow.key} onClick={() => setHiddenSideshow(sideshow.key)}>
          <p>
            Sideshow with {nameOf(sideshow.other)}: {sideshow.youLost ? "you pack" : `${nameOf(sideshow.other)} packs`}
          </p>
          <div className="patti-peek-row">
            <MiniHand cards={state.hands[0]} label="You" />
            <MiniHand cards={state.hands[sideshow.other]} label={nameOf(sideshow.other)} />
          </div>
        </div>
      )}

      {/* ── you ── */}
      <section className="my-side patti-me" aria-label="Your cards">
        <div className="my-row">
          <div className="patti-wallet" title={playerName ? `${playerName}: your coins at the table` : "Your coins at the table"}>
            <Coin />
            <b>{fmt(me.chips)}</b>
          </div>
          <div className="turn-plate" data-on={yourMove} key={yourMove ? game.turnKey : "wait"}>
            {yourMove ? (
              <TurnTimer
                seconds={o.reply ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS}
                paused={paused}
                label={o.reply ? "Sideshow?" : "Your turn"}
              />
            ) : (
              <span>{result ? "Deal over" : me.folded ? "You packed" : me.allIn ? "All in" : `${turnName} to bet`}</span>
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

        <div className="patti-hand" data-seen={me.seen} data-folded={me.folded} key={state.dealNo}>
          {!me.out &&
            [0, 1, 2].map((i) => {
              const c = state.hands[0][i];
              return (
                <span
                  key={c ?? `back${i}`}
                  className="patti-card"
                  data-up={!!c && (me.seen || !!result?.shown.includes(0))}
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="patti-flip">
                    <span className="patti-back" />
                    {c && <CardImg card={c} />}
                  </span>
                </span>
              );
            })}
          {o.see && !me.folded && (
            <button
              type="button"
              className="patti-see"
              data-must={o.mustSee}
              onClick={() => {
                sfx.flip();
                game.move({ type: "see" });
              }}
            >
              {o.mustSee ? "Look now" : "See"}
            </button>
          )}
        </div>
        <p className="patti-hand-name">
          {me.seen && myValue ? KIND_NAME[myValue.kind] : " "}
        </p>

        {o.myTurn && (
          <div className="patti-actions" role="group" aria-label="Your move">
            <button type="button" className="patti-btn" data-kind="pack" onClick={() => game.move({ type: "pack" })}>
              Pack
            </button>
            {o.show && (
              <button type="button" className="patti-btn" data-kind="show" onClick={() => game.move({ type: "show" })}>
                Show <small><Coin />{fmt(o.showCost)}</small>
              </button>
            )}
            {o.sideshow && o.sideshowTo !== null && (
              <button type="button" className="patti-btn" data-kind="side" onClick={() => game.move({ type: "sideshow" })}>
                Sideshow <small><Coin />{fmt(o.chaalCost)}</small>
              </button>
            )}
            <button
              type="button"
              className="patti-btn"
              data-kind="chaal"
              disabled={!o.chaal}
              onClick={() => game.move({ type: "chaal" })}
            >
              {o.chaalAllIn ? "All in" : me.seen ? "Chaal" : "Blind"} <small><Coin />{fmt(o.chaalCost)}</small>
            </button>
            {o.raise && (
              <button type="button" className="patti-btn" data-kind="raise" onClick={() => game.move({ type: "raise" })}>
                Raise <small><Coin />{fmt(o.raiseCost)}</small>
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── someone asks you for a sideshow ── */}
      {o.reply && state.pending && (
        <div className="patti-ask" role="dialog" aria-label="Sideshow request">
          <p>
            <b>{nameOf(state.pending.from)}</b> wants a sideshow
          </p>
          <div className="patti-ask-row">
            <button type="button" className="patti-btn" data-kind="pack" onClick={() => game.move({ type: "sideshowReply", accept: false })}>
              Refuse
            </button>
            <button type="button" className="patti-btn" data-kind="chaal" onClick={() => game.move({ type: "sideshowReply", accept: true })}>
              Accept
            </button>
          </div>
        </div>
      )}

      {/* ── end of the deal ── */}
      {result && showResult && (
        <div className="result" role="dialog" aria-modal="false" aria-label="Deal result">
          <div className="result-card patti-result">
            <h2 className="result-title" data-tone={result.won[0] > 0 ? "good" : "bad"}>
              {game.bust
                ? "Out of coins"
                : result.winners.length > 1
                  ? result.winners.includes(0)
                    ? "Split pot"
                    : `${result.winners.map(nameOf).join(" & ")} split it`
                  : result.winners[0] === 0
                    ? `You win ${fmt(result.won[0])}!`
                    : `${nameOf(result.winners[0])} wins ${fmt(result.won[result.winners[0]])}`}
            </h2>
            {result.shown.some((s) => result.won[s] > 0) && (
              <ul className="patti-shown">
                {result.shown
                  .filter((s) => result.won[s] > 0)
                  .map((s) => (
                    <li key={s}>
                      <MiniHand cards={state.hands[s]} />
                      <span className="patti-shown-hand">{result.values[s] ? KIND_NAME[result.values[s]!.kind] : ""}</span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="patti-mine">
              You
              <Coin />
              <em data-tone={(result.won[0] ?? 0) - me.put > 0 ? "up" : (result.won[0] ?? 0) - me.put < 0 ? "down" : "even"}>
                {(result.won[0] ?? 0) - me.put > 0 ? "+" : (result.won[0] ?? 0) - me.put < 0 ? "−" : ""}
                {fmt(Math.abs((result.won[0] ?? 0) - me.put))}
              </em>
            </p>
            <div className="result-actions">
              {game.bust ? (
                <button type="button" className="result-next" autoFocus onClick={game.rebuy}>
                  Buy in
                  <CostTag amount={PATTI_BUYIN} className="result-cost" />
                </button>
              ) : (
                <button type="button" className="result-next" autoFocus onClick={game.next}>
                  Next deal
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
                Leave
                {me.chips > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <CostTag amount={pattiCashOut(me.chips, state.rules.startChips)} className="patti-cashout" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniHand({ cards, label }: { cards: string[]; label?: string }) {
  return (
    <span className="patti-mini">
      {label && <small>{label}</small>}
      <span className="patti-mini-row">
        {cards.map((c) => (
          <span key={c} className="patti-mini-card">
            <CardImg card={c} />
          </span>
        ))}
      </span>
    </span>
  );
}
