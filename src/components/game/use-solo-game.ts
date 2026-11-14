"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseCard, runBots } from "@/lib/game/bot";
import { type Card, fullDeck, shuffle, sortHand } from "@/lib/game/cards";
import {
  type GameState,
  type Seat,
  legalCards,
  newDeal,
  newGame,
  playCard,
  startNextDeal,
} from "@/lib/game/engine";
import { PACE, TRICK_HOLD, TRICK_MOVE, TURN_SECONDS } from "@/lib/game/pace";
import { type TableSnapshot, replay } from "@/lib/game/view";
import { sfx } from "@/lib/sfx";

const HUMAN: Seat = 0;
const isBot = (s: Seat) => s !== HUMAN;

export interface SoloGame {
  game: GameState;
  /** The table as far as it has been revealed (bots' moves are shown one at a time). */
  snap: TableSnapshot;
  hand: Card[];
  /** Cards you may play right now; empty while it isn't your turn or the table is still catching up. */
  legal: Card[];
  myTurn: boolean;
  /** Changes every time a new turn of yours starts (restarts the clock). */
  turnKey: string;
  /** The deal's result, once its last event has been revealed. */
  over: boolean;
  /** True while the cards are being dealt out at the start of a deal. */
  dealing: boolean;
  /** Changes with every new deal (and every restart), so the table can deal its cards afresh. */
  dealKey: string;
  play: (card: Card) => void;
  next: () => void;
  restart: () => void;
  /** Testing shortcuts (solo tables only). */
  dev?: DevTools;
}

/** Testing shortcuts for the dev panel. */
export interface DevTools {
  /** The computer plays your cards for you. */
  auto: boolean;
  setAuto: (on: boolean) => void;
  /** Everything between moves runs four times faster. */
  fast: boolean;
  setFast: (on: boolean) => void;
  /** Plays the rest of the deal at once and shows the result. */
  finish: () => void;
  /** Plays on at once until haath `n + 1` is about to start (n counts from 0). */
  skipTo: (n: number) => void;
  /** Deals a rigged hand: all the courts to you, or three courts to everyone. */
  rig: (kind: "my-courts" | "all-courts") => void;
}

const anyone = () => true;

/** Every card dealt, with the given cards forced into the given seats and the rest shuffled in. */
function riggedHands(kind: "my-courts" | "all-courts"): Card[][] {
  const courts = shuffle(fullDeck().filter((c) => "JQK".includes(c[0])));
  const hands: Card[][] = [[], [], [], []];
  if (kind === "my-courts") hands[0] = [...courts, "AS"];
  else courts.forEach((c, i) => hands[i % 4].push(c));
  const used = new Set(hands.flat());
  const rest = shuffle(fullDeck().filter((c) => !used.has(c)));
  for (const h of hands) while (h.length < 13) h.push(rest.pop()!);
  return hands;
}

/** What drives a table: the game as this player sees it (they sit in seat 0) and how to act on it. */
export interface TableSource {
  game: GameState;
  /** Changes with every new deal (and every restart), so the deal is shown from its start. */
  dealId: string;
  play: (card: Card, auto: boolean) => void;
  next: () => void;
  restart: () => void;
  /** Join an online table mid-deal without replaying everything that already happened. */
  catchUp?: boolean;
  /** False while a move is on its way to the server. */
  ready?: boolean;
  speed?: number;
  auto?: boolean;
}

/** Single-player Rung: you in seat 0, three computer players, all in the browser. */
export function useSoloGame(paused: boolean): SoloGame {
  const [game, setGame] = useState<GameState>(() => runBots(newGame(), isBot));
  const [round, setRound] = useState(0);
  const [auto, setAuto] = useState(false);
  const [fast, setFast] = useState(false);
  const dealId = `${round}:${game.dealNo}`;

  const play = useCallback((card: Card, auto: boolean) => {
    setGame((g) =>
      g.deal.turn === HUMAN && !g.deal.result ? runBots(playCard(g, HUMAN, card, { auto }), isBot) : g,
    );
  }, []);
  const next = useCallback(() => {
    setGame((g) => (g.deal.result ? runBots(startNextDeal(g), isBot) : g));
    setRound((r) => r + 1);
  }, []);
  const restart = useCallback(() => {
    setGame(runBots(newGame(), isBot));
    setRound((r) => r + 1);
  }, []);

  const table = useTable({ game, dealId, play, next, restart, speed: fast ? 4 : 1, auto }, paused);

  const jump = (g: GameState) => {
    setGame(g);
    table.skip(g.deal.events.length);
  };
  const dev: DevTools = {
    auto,
    setAuto,
    fast,
    setFast,
    finish: () => jump(runBots(game, anyone)),
    skipTo: (n) => {
      let g = game;
      let guard = 60;
      while (!g.deal.result && g.deal.tricksPlayed < n && guard-- > 0)
        g = playCard(g, g.deal.turn, chooseCard(g, g.deal.turn));
      jump(runBots(g, isBot));
    },
    rig: (kind) => {
      setGame(runBots({ ...game, deal: newDeal(riggedHands(kind)) }, isBot));
      setRound((r) => r + 1);
    },
  };
  return { ...table.view, dev };
}

/** Shows a table one move at a time, with the pauses, sounds and turn clock of a real game. */
export function useTable(src: TableSource, paused: boolean) {
  const { game, dealId } = src;
  const speed = src.speed ?? 1;
  const [shown, setShown] = useState(() => (src.catchUp ? game.deal.events.length : 0));
  const [dealing, setDealing] = useState(() => !(src.catchUp && game.deal.events.length > 0));
  // A new deal (or a restart) is shown from its start, with the cards dealt out again.
  const [seenDeal, setSeenDeal] = useState(dealId);
  if (seenDeal !== dealId) {
    // (an online table opened mid-deal jumps straight to where the game is)
    const jumpIn = src.catchUp && seenDeal === "none" && game.deal.events.length > 4;
    setSeenDeal(dealId);
    setShown(jumpIn ? game.deal.events.length : 0);
    setDealing(!jumpIn);
  }
  const round = dealId;
  const events = game.deal.events;

  // The deal: cards fly round the table with a flick for each pass, then play begins.
  useEffect(() => {
    if (!dealing || paused) return;
    const flicks = Array.from({ length: 7 }, (_, i) =>
      window.setTimeout(() => sfx.deal(), 60 + i * 230),
    );
    const done = window.setTimeout(() => setDealing(false), PACE.deal / speed);
    return () => {
      flicks.forEach((f) => window.clearTimeout(f));
      window.clearTimeout(done);
    };
  }, [dealing, paused, round, speed]);

  // Reveal the next event after a pause that suits what just happened.
  useEffect(() => {
    if (paused || dealing || shown >= events.length) return;
    const prev = events[shown - 1];
    const upcoming = events[shown];
    const mine = upcoming.type === "play" && upcoming.seat === HUMAN;
    const delay = mine
      ? 0
      : !prev
        ? PACE.first
        : prev.type === "trick"
          ? PACE.afterTrick
          : // a little give either way, so the computer players don't move like a metronome
            PACE.afterPlay * (0.8 + ((shown * 7919) % 41) / 100);
    const t = window.setTimeout(() => setShown((n) => n + 1), delay / speed);
    return () => window.clearTimeout(t);
  }, [paused, dealing, shown, events, speed]);

  // A sound for each event as it lands.
  const heard = useRef(0);
  useEffect(() => {
    if (shown <= heard.current) {
      heard.current = shown;
      return;
    }
    heard.current = shown;
    const e = events[shown - 1];
    if (!e) return;
    if (e.type === "play") {
      sfx.card();
      if (e.trumpSet) window.setTimeout(() => sfx.trump(), 140);
    } else if (e.type === "trick") {
      // in time with the cards leaving the table, after the haath has been held up to view
      const t = window.setTimeout(
        () => (e.collectedBy !== null ? sfx.sweep() : sfx.gather()),
        TRICK_HOLD * 1000,
      );
      return () => window.clearTimeout(t);
    } else if (e.winnerTeam === 0) sfx.win();
    else if (e.winnerTeam !== null) sfx.lose();
  }, [shown, events]);

  const snap = useMemo(
    () => replay(events, game.deal.opener, shown),
    [events, game.deal.opener, shown],
  );
  const caughtUp = shown >= events.length;

  // A haath that has just been decided is held and swept before you can lead to the next one.
  const [settled, setSettled] = useState(-1);
  const sweeping = events[shown - 1]?.type === "trick" && settled !== shown;
  useEffect(() => {
    if (events[shown - 1]?.type !== "trick") return;
    const t = window.setTimeout(
      () => setSettled(shown),
      (TRICK_HOLD + TRICK_MOVE) * 1000,
    );
    return () => window.clearTimeout(t);
  }, [shown, events]);
  const myTurn =
    caughtUp &&
    !dealing &&
    !sweeping &&
    src.ready !== false &&
    !game.deal.result &&
    game.deal.turn === HUMAN;

  // One soft ping when it becomes your turn.
  useEffect(() => {
    if (myTurn && !paused) sfx.turn();
  }, [myTurn, paused, events.length]);
  const legal = useMemo(
    () => (myTurn ? legalCards(game.deal, HUMAN) : []),
    [myTurn, game.deal],
  );
  const hand = useMemo(
    () => sortHand(game.deal.hands[HUMAN], snap.trump),
    [game.deal.hands, snap.trump],
  );

  const act = src.play;
  const play = useCallback(
    (card: Card, auto = false) => {
      if (myTurn) act(card, auto);
    },
    [myTurn, act],
  );

  // The turn clock: when it runs out, the computer plays a sensible card for you.
  const turnKey = `${game.dealNo}:${events.length}`;
  useEffect(() => {
    if (!myTurn || paused) return;
    const t = window.setTimeout(
      () => play(chooseCard(game, HUMAN), true),
      TURN_SECONDS * 1000,
    );
    return () => window.clearTimeout(t);
  }, [myTurn, paused, turnKey, game, play]);

  // Dev: the computer plays your turn straight away.
  const auto = src.auto ?? false;
  useEffect(() => {
    if (!auto || !myTurn || paused) return;
    const t = window.setTimeout(() => play(chooseCard(game, HUMAN), true), 300 / speed);
    return () => window.clearTimeout(t);
  }, [auto, myTurn, paused, game, play, speed]);

  const view: SoloGame = {
    game,
    snap,
    hand,
    legal,
    myTurn,
    turnKey,
    over: caughtUp && !dealing && game.deal.result !== null,
    dealing,
    dealKey: dealId,
    play: (c) => play(c),
    next: src.next,
    restart: src.restart,
  };
  return {
    view,
    /** Show everything up to event `n` at once (dev shortcuts). */
    skip: (n: number) => {
      setShown(n);
      setDealing(false);
    },
  };
}
