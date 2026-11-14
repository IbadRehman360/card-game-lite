"use client";

import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { CHARACTERS } from "@/lib/characters";
import { type Card, SUIT_SYMBOL, type Suit, rankLabel, suitOf } from "@/lib/game/cards";
import {
  BOARD,
  LINES_TO_WIN,
  type PaanchEvent,
  type Seat,
  SIZE,
  SQUARES_OF,
  canMove,
  isCorner,
  isOneEyed,
  isTwoEyed,
  legalTargets,
  lineCount,
} from "@/lib/paanch/engine";
import type { PaanchView } from "@/lib/paanch/view";
import { CardFace } from "@/components/game/playing-card";
import { Portrait } from "@/components/game/portrait";
import { Burst, EmoteButton, EmoteDeck, type LiveChat, useEmotes } from "@/components/game/emotes";
import { useChatSound } from "@/components/game/chat";
import { CostTag } from "@/components/shop/cost-tag";
import { PAANCH_FEE, PAANCH_WIN } from "@/lib/wallet/economy";
import { PAANCH_TURN_SECONDS, type PaanchGame } from "./use-paanch";
import { TurnTimer } from "@/components/game/turn-timer";
import "./paanch.css";

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
const RANK_ORDER = "23456789TJQKA";
const red = (c: Card) => c[1] === "H" || c[1] === "D";

/** A card as text, with its suit: "A♥", "10♠". */
function CardName({ card }: { card: Card }) {
  return (
    <b className="pn-cardname" data-red={red(card) || undefined}>
      {rankLabel(card)}
      {SUIT_SYMBOL[suitOf(card)]}
    </b>
  );
}

/** One square of the board: a small card face (or a free corner). */
function Square({ card }: { card: Card | null }) {
  if (!card) {
    return (
      <span className="pn-free" aria-label="Free corner">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z" />
        </svg>
        <i>Free</i>
      </span>
    );
  }
  const r = card[0];
  const court = r === "K" || r === "Q";
  return (
    <span className="pn-face" data-red={red(card) || undefined} data-court={court || undefined} data-ace={r === "A" || undefined}>
      <b>{rankLabel(card)}</b>
      <i>{SUIT_SYMBOL[suitOf(card)]}</i>
    </span>
  );
}

/** A poker chip in a side's colour. */
function Chip({ team, locked, fresh, gone }: { team: 0 | 1; locked?: boolean; fresh?: boolean; gone?: boolean }) {
  return <span className="pn-chip" data-team={team} data-locked={locked || undefined} data-fresh={fresh || undefined} data-gone={gone || undefined} aria-hidden />;
}

const cellCentre = (i: number) => [(i % SIZE) + 0.5, Math.floor(i / SIZE) + 0.5] as const;

/**
 * Where each seat sits, in board squares, so a played card flies in from its player:
 * you below the board, the others in the row above it (your side left, theirs right).
 */
const FROM: Record<number, Record<number, readonly [number, number]>> = {
  2: { 0: [4.5, 11.5], 1: [8, -2] },
  4: { 0: [4.5, 11.5], 1: [7, -2], 2: [2, -2], 3: [9, -2] },
};

/** What a seat last did, for the status line. */
function describe(e: PaanchEvent | undefined, nameOf: (s: Seat) => string) {
  if (!e) return null;
  if (e.type === "place") {
    return (
      <>
        {nameOf(e.seat)} · <CardName card={e.card} />
        {e.wild && <em> wild</em>}
      </>
    );
  }
  if (e.type === "remove") {
    return (
      <>
        {nameOf(e.seat)} · <CardName card={e.card} /> <em>removed a chip</em>
      </>
    );
  }
  if (e.type === "dead") {
    return (
      <>
        {nameOf(e.seat)} · swapped <CardName card={e.card} />
      </>
    );
  }
  return null;
}

/** The ring round a seat whose turn it is, running down the clock. */
function TurnRing({ seconds, paused }: { seconds: number; paused: boolean }) {
  return (
    <svg className="pn-ring" viewBox="0 0 44 44" aria-hidden data-paused={paused || undefined} style={{ "--t": `${seconds}s` } as CSSProperties}>
      <circle cx="22" cy="22" r="20" pathLength="100" />
    </svg>
  );
}

/** The board game laid out flat: the 10×10 board, the players and score at the top, your cards at the bottom. */
export function PaanchScreen({
  game,
  seatChars,
  names,
  bots,
  talk,
  paused,
  onMenu,
  onRules,
}: {
  game: PaanchGame;
  /** Character (index into CHARACTERS) at each seat, you first. */
  seatChars: number[];
  /** Online: each seat's name (you are seat 0). */
  names?: string[];
  /** Online: which seats a computer plays. */
  bots?: boolean[];
  /** Online: the table's chat (emotes go to everyone). */
  talk?: { myId: string; send: (m: { text?: string; sticker?: string }) => unknown; messages: LiveChat[] };
  paused: boolean;
  onMenu: () => void;
  onRules: () => void;
}) {
  const { state, turnKey } = game;
  const players = state?.players ?? 2;
  const seats = useMemo(() => (players === 2 ? [0, 1] : [0, 1, 2, 3]) as Seat[], [players]);

  const charOf = useCallback((s: Seat) => CHARACTERS[seatChars[s] ?? s % CHARACTERS.length] ?? CHARACTERS[0], [seatChars]);
  const nameOf = useCallback(
    (s: Seat) => (s === 0 ? "You" : names?.[s] || charOf(s).name),
    [names, charOf],
  );

  // emotes stay on this phone unless the table has a chat
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

  // the card you picked (forgotten when the turn moves on)
  const [pick, setPick] = useState<{ card: Card; key: string } | null>(null);
  const [hover, setHover] = useState<Card | null>(null);
  const myTurn = !!state && !state.result && state.turn === 0;
  const hand = useMemo(() => {
    const h = state?.hands[0] ?? [];
    return h
      .map((card, i) => ({ card, i }))
      .sort((a, b) => SUIT_ORDER[suitOf(a.card)] - SUIT_ORDER[suitOf(b.card)] || RANK_ORDER.indexOf(a.card[0]) - RANK_ORDER.indexOf(b.card[0]));
  }, [state]);
  const picked = myTurn && pick && pick.key === turnKey && state!.hands[0].includes(pick.card) ? pick.card : null;

  const targets = useMemo(() => new Set(state && picked ? legalTargets(state, 0, picked) : []), [state, picked]);
  const hinted = useMemo(() => new Set(!picked && hover && !isTwoEyed(hover) && !isOneEyed(hover) ? SQUARES_OF[hover] ?? [] : []), [picked, hover]);
  const dead = useCallback((c: Card) => !!state && legalTargets(state, 0, c).length === 0, [state]);
  const canSwap = !!state && myTurn && (!state.swapped || !canMove(state, 0));

  const lastEvent = useMemo(() => {
    if (!state) return undefined;
    for (let i = state.events.length - 1; i >= 0; i--) {
      const e = state.events[i];
      if (e.type === "place" || e.type === "remove" || e.type === "dead") return e;
    }
    return undefined;
  }, [state]);

  if (!state) return <PaanchStart game={game} onMenu={onMenu} onRules={onRules} />;

  const tap = (cell: number) => {
    if (!myTurn) return;
    if (picked && targets.has(cell)) {
      game.move(isOneEyed(picked) ? { type: "remove", card: picked, cell } : { type: "place", card: picked, cell });
      setPick(null);
      return;
    }
    // tapping a square whose card you hold plays it straight away
    const card = BOARD[cell];
    if (card && state.chips[cell] === null && state.hands[0].includes(card)) {
      game.move({ type: "place", card, cell });
      setPick(null);
    }
  };

  const choose = (card: Card) => {
    if (!myTurn) return;
    setPick((p) => (p && p.card === card && p.key === turnKey ? null : { card, key: turnKey }));
  };

  const us = lineCount(state, 0);
  const them = lineCount(state, 1);
  const result = state.result;
  const removed = state.last?.kind === "remove" ? state.last : null;

  let label: string;
  if (myTurn && picked) {
    label = isOneEyed(picked)
      ? targets.size
        ? "Take a chip"
        : "No chip to take"
      : isTwoEyed(picked)
        ? "Any open square"
        : targets.size
          ? "Pick a square"
          : "Dead card";
  } else label = state.swapped ? "Now play a card" : "Your turn";

  // the last card played flies in from its player and lands on its square
  const fly = state.last && !result ? state.last : null;
  const flyFrom = fly ? FROM[players]?.[fly.seat] : null;

  const seatTag = (s: Seat) => {
    const c = charOf(s);
    const turn = !result && state.turn === s;
    return (
      <li key={s} className="pn-seat" data-team={s % 2} data-turn={turn || undefined} data-me={s === 0 || undefined}>
        <span className="pn-pfp">
          <Portrait id={c.id} accent={c.accent} letter={c.name.slice(0, 1)} />
          {turn && <TurnRing key={turnKey} seconds={PAANCH_TURN_SECONDS} paused={paused} />}
          {s !== 0 && (bots?.[s] ?? true) && <i className="pn-cpu" aria-label="Computer" />}
          <b className="pn-count" key={state.handCounts[s]} aria-label={`${state.handCounts[s]} cards`}>
            {state.handCounts[s]}
          </b>
          <Burst message={lastFrom(s)} rel={2} />
        </span>
        <span className="pn-name">{nameOf(s)}</span>
      </li>
    );
  };
  const team = (t: 0 | 1) => seats.filter((s) => s % 2 === t);

  return (
    <div className="paanch" data-paused={paused || undefined} data-players={players}>
      <button type="button" className="icon-button corner-back pn-help" onClick={onRules} aria-label="How to play">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 9.2a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.9v.7" />
          <path d="M12 18h.01" />
        </svg>
      </button>

      {/* ── the players: your side on the left, theirs on the right, the score between ── */}
      <div className="pn-table">
        <ul className="pn-team" data-team="0">
          {team(0).map(seatTag)}
        </ul>
        <div className="pn-score" aria-label={`Lines: ${players === 4 ? "your side" : "you"} ${us}, them ${them}, first to ${LINES_TO_WIN}`}>
          <span className="pn-pips" data-team="0">
            {Array.from({ length: LINES_TO_WIN }, (_, k) => (
              <b key={k} data-on={k < us || undefined} />
            ))}
          </span>
          <span className="pn-vs">vs</span>
          <span className="pn-pips" data-team="1">
            {Array.from({ length: LINES_TO_WIN }, (_, k) => (
              <b key={k} data-on={k < them || undefined} />
            ))}
          </span>
        </div>
        <ul className="pn-team" data-team="1">
          {team(1).map(seatTag)}
        </ul>
      </div>

      {/* ── the board ── */}
      <div className="pn-boardwrap">
        <div className="pn-board" data-picking={(picked && myTurn) || undefined}>
          <div className="pn-grid">
            {BOARD.map((card, i) => {
              const chip = state.chips[i];
              const legal = targets.has(i);
              const fresh = state.last?.kind === "place" && state.last.cell === i;
              return (
                <button
                  key={i}
                  type="button"
                  className="pn-cell"
                  data-corner={isCorner(i) || undefined}
                  data-legal={legal || undefined}
                  data-take={(legal && picked && isOneEyed(picked)) || undefined}
                  data-hint={hinted.has(i) || undefined}
                  data-last={(state.last?.cell === i && !result) || undefined}
                  disabled={!myTurn}
                  tabIndex={legal ? 0 : -1}
                  onClick={() => tap(i)}
                  aria-label={`${card ?? "Free corner"}${chip === 0 ? ", your chip" : chip === 1 ? ", their chip" : ""}`}
                >
                  <Square card={card} />
                  {chip !== null && <Chip key={fresh ? `${chip}-${state.moveNo}` : `${chip}`} team={chip} locked={state.locked[i]} fresh={fresh} />}
                  {removed && removed.cell === i && chip === null && <Chip key={`gone-${state.eventNo}`} team={(1 - (removed.seat % 2)) as 0 | 1} gone />}
                </button>
              );
            })}
          </div>
          <svg className="pn-lines" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="none" aria-hidden>
            {state.lines.map((l) => {
              const [x1, y1] = cellCentre(l.cells[0]);
              const [x2, y2] = cellCentre(l.cells[4]);
              return (
                <g key={l.cells.join()} data-team={l.team}>
                  <line className="pn-line-glow" x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} />
                  <line className="pn-line" x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} />
                </g>
              );
            })}
          </svg>
          {fly && flyFrom && (
            <span
              key={`fly-${state.eventNo}`}
              className="pn-fly"
              data-from={fly.seat === 0 ? "me" : "them"}
              aria-hidden
              style={
                {
                  "--c": fly.cell % SIZE,
                  "--r": Math.floor(fly.cell / SIZE),
                  "--px": flyFrom[0],
                  "--py": flyFrom[1],
                } as CSSProperties
              }
            >
              <Square card={fly.card} />
            </span>
          )}
          {/* what just happened, for a moment */}
          {game.error ? (
            <span className="pn-toast" data-kind="error" role="alert" key={game.error}>
              {game.error}
            </span>
          ) : (
            lastEvent &&
            !result && (
              <span className="pn-toast" role="status" key={state.eventNo}>
                {describe(lastEvent, nameOf)}
              </span>
            )
          )}
        </div>
      </div>

      {/* ── whose turn: the deck, the turn plate, emotes ── */}
      <div className="pn-bar">
        <span className="pn-deck" aria-label={`${state.deckCount} cards left in the deck`}>
          <i />
          <b>{state.deckCount}</b>
        </span>
        <div className="pn-plate">
          {result ? (
            <span className="pn-wait">Game over</span>
          ) : myTurn ? (
            <TurnTimer key={turnKey} seconds={PAANCH_TURN_SECONDS} paused={paused} label={label} />
          ) : (
            <span className="pn-wait" key={state.turn} data-team={state.turn % 2}>
              <i />
              {nameOf(state.turn)}&rsquo;s turn
            </span>
          )}
        </div>
        <EmoteButton emotes={emotes} className="pn-emote" />
      </div>

      {/* ── your hand ── */}
      <div className="pn-handzone">
        <div className="pn-hand" data-turn={myTurn || undefined} style={{ "--n": hand.length } as CSSProperties}>
          {hand.map(({ card, i }, k) => {
            const isDeadCard = myTurn && dead(card);
            const sel = picked === card;
            return (
              <div key={`${card}-${i}`} className="pn-card" data-picked={sel || undefined} data-dead={isDeadCard || undefined} style={{ "--k": k - (hand.length - 1) / 2 } as CSSProperties}>
                <button
                  type="button"
                  className="pn-card-btn"
                  onClick={() => choose(card)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(card)}
                  onPointerLeave={() => setHover(null)}
                  disabled={!myTurn}
                  aria-pressed={sel}
                  aria-label={`${card}${isDeadCard ? ", dead" : ""}`}
                >
                  <CardFace card={card} />
                  {isTwoEyed(card) && <i className="pn-tag" data-kind="wild">Wild</i>}
                  {isOneEyed(card) && <i className="pn-tag" data-kind="take">Remove</i>}
                  {isDeadCard && <i className="pn-tag" data-kind="dead">Dead</i>}
                </button>
                {sel && isDeadCard && (
                  <button
                    type="button"
                    className="pn-swap"
                    disabled={!canSwap}
                    onClick={() => {
                      game.move({ type: "dead", card });
                      setPick(null);
                    }}
                  >
                    {canSwap ? "Swap" : "1 swap a turn"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <EmoteDeck emotes={emotes} onSay={talk ? (text) => void talk.send({ text }) : undefined} />

      {/* ── the end ── */}
      {result && (
        <div className="pn-end" data-tone={result.winner === 0 ? "win" : result.winner === 1 ? "lose" : "draw"}>
          <div className="pn-end-card">
            <p className="pn-end-kicker">{result.winner === null ? "No winner" : `${us} – ${them}`}</p>
            <h2>{result.winner === 0 ? (players === 4 ? "Your side wins" : "You win") : result.winner === 1 ? (players === 4 ? "Their side wins" : `${nameOf(1)} wins`) : "Draw"}</h2>
            {game.coins && (
              <p className="result-coins" data-won={result.winner === 0}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/coins/coin.svg" alt="" width={20} height={20} />
                {result.winner === 0
                  ? `+${game.coins.paid ?? PAANCH_WIN}`
                  : result.winner === null
                    ? `+${PAANCH_FEE}`
                    : `−${game.coins.fee}`}
              </p>
            )}
            <div className="pn-end-row">
              <button type="button" className="pn-btn" data-kind="primary" onClick={() => void game.start(players)}>
                Play again
                {game.coins && <CostTag amount={game.coins.fee} className="result-cost" />}
              </button>
              <button type="button" className="pn-btn" onClick={onMenu}>
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Before a game: two players or four (two teams). */
function PaanchStart({ game, onMenu, onRules }: { game: PaanchGame; onMenu: () => void; onRules: () => void }) {
  return (
    <div className="paanch pn-startscreen">
      <div className="pn-end-card">
        <p className="pn-end-kicker">Five in a row</p>
        <h2>Paanch</h2>
        <div className="pn-end-row">
          <button type="button" className="pn-btn" data-kind="primary" onClick={() => void game.start(2)}>
            1 vs 1
          </button>
          <button type="button" className="pn-btn" data-kind="primary" onClick={() => void game.start(4)}>
            2 vs 2
          </button>
        </div>
        <div className="pn-end-row">
          <button type="button" className="pn-btn" onClick={onRules}>
            How to play
          </button>
          <button type="button" className="pn-btn" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export type { PaanchView };
