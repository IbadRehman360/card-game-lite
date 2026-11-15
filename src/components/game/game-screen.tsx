"use client";

import { TurnTimer } from "@/components/game/turn-timer";

import { CostTag } from "@/components/shop/cost-tag";
import { RUNG_FEE, RUNG_WIN } from "@/lib/wallet/economy";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { SUIT_SYMBOL, isRed } from "@/lib/game/cards";
import { type Seat, seriesTarget } from "@/lib/game/engine";
import { TURN_SECONDS } from "@/lib/game/pace";
import { sfx } from "@/lib/sfx";
import { seatTags } from "@/components/stage/anchors";
import { CardFace, cardName } from "./playing-card";
import type { SoloGame } from "./use-solo-game";
import { DevPanel } from "./dev-panel";
import { WinFlare } from "./win-flare";
import { Portrait, SeatCount, SeatStat } from "./portrait";
import { ChatButton, type ChatProps, useChatSound } from "./chat";
import { Burst, EmoteButton, EmoteDeck, type LiveChat, useEmotes } from "./emotes";

/** Chat at an online table. Messages carry the seat as seen from this phone (you are seat 0). */
export interface TableTalk {
  messages: LiveChat[];
  myId: string;
  send: (m: { text?: string; sticker?: string }) => Promise<void> | void;
}

const SPOT = { 1: "right", 2: "top", 3: "left" } as const;

/** Everything laid over the 3D table during a deal: scores, Rung, the seats, your hand and the result. */
export function GameScreen({
  solo,
  seatChars,
  playerName,
  paused,
  onMenu,
  names,
  bots,
  talk,
}: {
  solo: SoloGame;
  seatChars: number[];
  playerName: string;
  paused: boolean;
  onMenu: () => void;
  /** Online: each seat's player name (you are seat 0). */
  names?: string[];
  /** Online: which seats a computer plays. Against the computer, every other seat. */
  bots?: boolean[];
  /** Online: the table chat. Without it, emotes only play on this phone. */
  talk?: TableTalk;
}) {
  const { game, snap, hand, legal, myTurn, turnKey, over } = solo;
  const nameOf = (s: Seat) =>
    s === 0 ? playerName || "You" : names?.[s] || CHARACTERS[seatChars[s]].name;

  // Emotes: sent to the table online, or just shown here against the computer.
  const [local, setLocal] = useState<LiveChat[]>([]);
  const sendLocal = useCallback((m: { text?: string; sticker?: string }) => {
    setLocal((list) => [...list.slice(-20), { id: `${Date.now()}`, name: "You", seat: 0, live: true, at: Date.now(), playerId: "me", ...m }]);
  }, []);
  const chat: ChatProps = talk ?? { messages: local, myId: "me", send: sendLocal };
  const emotes = useEmotes(chat.send);
  useChatSound(chat.messages, chat.myId);
  const lastFrom = (s: Seat) => {
    for (let i = chat.messages.length - 1; i >= 0; i--) if (chat.messages[i].seat === s) return chat.messages[i];
    return undefined;
  };
  const result = game.deal.result;
  const target = seriesTarget(game.options);

  // The last five seconds of your clock tick.
  useEffect(() => {
    if (!myTurn || paused) return;
    const ticks = [5, 4, 3, 2, 1].map((left) =>
      window.setTimeout(() => sfx.tick(), (TURN_SECONDS - left) * 1000),
    );
    return () => ticks.forEach((t) => window.clearTimeout(t));
  }, [myTurn, paused, turnKey]);

  const banner = useMemo(() => {
    const e = snap.lastEvent;
    if (!e) return null;
    if (e.type === "play" && e.trumpSet) {
      return {
        tone: "rung",
        text: `${nameOf(e.seat)} sets Rung`,
        suit: e.trumpSet,
      };
    }
    if (e.type === "play" && e.auto && e.seat === 0)
      return { tone: "warn", text: "Time's up. A card was played for you" };
    if (e.type === "trick" && e.collectedBy !== null) {
      return {
        tone: e.collectedBy === 0 ? "good" : "bad",
        text: `${nameOf(e.winner)} sweeps ${e.collected}`,
      };
    }
    if (e.type === "trick" && e.aceBlocked)
      return { tone: "warn", text: "An Ace can't sweep" };
    if (e.type === "trick" && e.twelfthBlocked)
      return { tone: "warn", text: "No sweep on haath 12" };
    return null;
    // nameOf only depends on seatChars and playerName
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.lastEvent, seatChars, playerName]);

  const legalSet = new Set(legal);
  const count = hand.length;

  return (
    <div className="game">
      {/* ── top bar: Rung and the series, slim pills like the old app ── */}
      <header className="hud-top">
        {snap.trump && (
          <div className="hud-chip" data-set>
            <span>Rung</span>
            <b className="hud-suit" data-red={isRed(snap.trump)}>{SUIT_SYMBOL[snap.trump]}</b>
          </div>
        )}
        <div className="hud-chip" title={`First to ${target} points wins`}>
          <span>Series</span>
          <b className="hud-series">
            {game.score[0]}–{game.score[1]}
          </b>
        </div>
      </header>
      <div className="score-dock score-dock-them" title="Haaths this deal">
        <div
          key={snap.sars[1]}
          className="score-bubble"
          data-team={1}
          aria-label={`Rivals: ${snap.sars[1]} haaths`}
        >
          {snap.sars[1]}
        </div>
      </div>

      {/* ── the other three seats ── */}
      {([1, 2, 3] as Seat[]).map((s) => {
        const c = CHARACTERS[seatChars[s]];
        const theirTurn = !snap.dealOver && snap.turn === s && !over;
        return (
          <div
            key={s}
            ref={(el) => {
              seatTags[s] = el;
            }}
            className="seat-tag"
            data-spot={SPOT[s as 1 | 2 | 3]}
            data-turn={theirTurn}
            data-team={s % 2}
            style={{ "--accent": c.accent } as CSSProperties}
          >
            {s !== 2 && (
              <span className="seat-pfp-wrap">
                <Portrait id={c.id} accent={c.accent} className="seat-pfp" letter={(names?.[s] || c.name).slice(0, 1)} />
                {(bots ? bots[s] : true) && <i className="seat-cpu">CPU</i>}
                {over && result?.winnerTeam === s % 2 && <WinFlare key={game.dealNo} />}
                <SeatCount n={snap.cardsLeft[s]} />
              </span>
            )}
            <span className="seat-name">{names?.[s] || c.name}</span>
            <Burst message={lastFrom(s)} rel={s as 1 | 2 | 3} />
            {/* the player across is a figure, not a picture: their count goes under the name */}
            {s === 2 && (
              <SeatStat icon={<i className="seat-card-ico" aria-hidden />} title="Cards in hand">
                {snap.cardsLeft[s]}
              </SeatStat>
            )}
          </div>
        );
      })}

      {banner && (
        <div
          className="banner"
          data-tone={banner.tone}
          key={`${game.dealNo}-${game.deal.events.indexOf(snap.lastEvent!)}`}
          role="status"
        >
          {banner.text}
          {"suit" in banner && banner.suit && (
            <b data-red={isRed(banner.suit)}>{SUIT_SYMBOL[banner.suit]}</b>
          )}
        </div>
      )}

      {/* ── your hand ── */}
      <section className="my-side" aria-label="Your hand">
        <div className="my-row">
          <div className="score-dock" title="Haaths this deal">
            <div
              key={snap.sars[0]}
              className="score-bubble"
              data-team={0}
              aria-label={`Your team: ${snap.sars[0]} haaths`}
            >
              {snap.sars[0]}
            </div>
          </div>
          <div
            className="turn-plate"
            data-on={myTurn}
            key={myTurn ? turnKey : "wait"}
          >
            {myTurn ? (
              <>
                <TurnTimer seconds={TURN_SECONDS} paused={paused} />
              </>
            ) : (
              <span>{over
                  ? "Deal over"
                  : solo.dealing
                    ? "Dealing"
                    : `${nameOf(snap.turn)}'s turn`}</span>
            )}
          </div>
          <div className="social-dock">
            <EmoteButton emotes={emotes} />
            <EmoteDeck emotes={emotes} onSay={(text) => void chat.send({ text })} />
            {talk && <ChatButton chat={chat} />}
          </div>
        </div>
        <div className="burst-me" aria-hidden={false}>
          <Burst message={lastFrom(0)} rel={0} />
        </div>
        <ul
          className="hand"
          key={solo.dealKey}
          data-dealing={solo.dealing}
          style={{ "--n": count } as CSSProperties}
        >
          {hand.map((card, i) => {
            const ok = legalSet.has(card);
            return (
              <li key={card} style={{ "--i": i } as CSSProperties}>
                <button
                  type="button"
                  className="hand-card"
                  data-legal={ok}
                  data-waiting={!myTurn}
                  disabled={!ok}
                  aria-label={cardName(card)}
                  onClick={() => solo.play(card)}
                >
                  <CardFace card={card} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── end of the deal ── */}
      {over && result && (
        <div
          className="result"
          role="dialog"
          aria-modal="false"
          aria-label="Deal result"
        >
          <div className="result-card">
            <h2
              className="result-title"
              data-tone={
                (game.seriesWinner ?? result.winnerTeam) === null
                  ? "tie"
                  : (game.seriesWinner ?? result.winnerTeam) === 0
                    ? "good"
                    : "bad"
              }
            >
              {game.seriesWinner != null
                ? game.seriesWinner === 0
                  ? "Series won"
                  : "Series lost"
                : result.winnerTeam === null
                  ? "Tie"
                  : result.winnerTeam === 0
                    ? result.court
                      ? "Court!"
                      : "Deal won"
                    : result.court
                      ? "Court against you"
                      : "Deal lost"}
            </h2>
            {/* one plain score line: this deal's haaths, then the series */}
            <div className="result-plain">
              <span>
                <small>You</small>
                <b data-team="0">{result.sars[0]}</b>
              </span>
              <i>–</i>
              <span>
                <b data-team="1">{result.sars[1]}</b>
                <small>Them</small>
              </span>
            </div>
            <p className="result-sub">
              Series {game.score[0]}–{game.score[1]} · to {target}
            </p>
            {game.seriesWinner != null && (
              <p className="result-coins" data-won={game.seriesWinner === 0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/coins/coin.svg" alt="" width={20} height={20} />
                {game.seriesWinner === 0 ? `+${RUNG_WIN}` : `−${RUNG_FEE}`}
              </p>
            )}
            <div className="result-actions">
              <button
                type="button"
                className="result-next"
                autoFocus
                onClick={() => {
                  sfx.flip();
                  solo.next();
                }}
              >
                {game.seriesWinner != null ? (
                  <>
                    New match
                    <CostTag amount={RUNG_FEE} className="result-cost" />
                  </>
                ) : (
                  "Next deal"
                )}
              </button>
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
        </div>
      )}
      {solo.dev && <DevPanel dev={solo.dev} />}
    </div>
  );
}
