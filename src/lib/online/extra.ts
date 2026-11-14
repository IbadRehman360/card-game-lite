/**
 * The four games that aren't Rung or 3 Patti (Bluff, Paanch, Bhabhi Thulla, G Patta) at an online
 * table. Each already has a working engine, computer player and per-seat view under lib/<game>/; this
 * file is only the thin layer the table needs on top of them: whose move it is, what a computer or a
 * clock does when nobody moves, what one seat may see, and how a finished game pays out.
 *
 * No rules live here. Everything goes through the games' own `act()`.
 */

import type { Outcome } from "../wallet/economy";
import type { ExtraGame, ExtraSeen, ExtraStored } from "./types";

import {
  BLUFF_REVEAL_MS,
  BLUFF_TURN_SECONDS,
  type BluffAction,
  BluffError,
  MAX_PLAY,
  type Seat as BluffSeat,
  act as bluffAct,
  autoAction as bluffAuto,
  newBluff,
  nextRound as bluffNextRound,
} from "../bluff/engine";
import { BLUFF_TEMPERS, chooseAction as bluffBot, thinkMs as bluffThink } from "../bluff/bot";
import { bluffForSeat } from "../bluff/view";

import {
  PAANCH_TURN_SECONDS,
  type PaanchAction,
  PaanchError,
  type Seat as PaanchSeat,
  act as paanchAct,
  autoMove as paanchAuto,
  newPaanch,
  teamOf as paanchTeam,
} from "../paanch/engine";
import { chooseAction as paanchBot, thinkMs as paanchThink } from "../paanch/bot";
import { paanchForSeat } from "../paanch/view";

import {
  BHABHI_TURN_SECONDS,
  type BhabhiAction,
  BhabhiError,
  act as bhabhiAct,
  legalPlays,
  newBhabhi,
} from "../bhabhi/engine";
import { TEMPERS as BHABHI_TEMPERS, chooseAction as bhabhiBot, thinkMs as bhabhiThink } from "../bhabhi/bot";
import { bhabhiForSeat } from "../bhabhi/view";

import {
  GPATTA_TURN_SECONDS,
  type GPattaAction,
  GPattaError,
  act as gpattaAct,
  newGPatta,
} from "../gpatta/engine";
import { chooseAction as gpattaBot, thinkMs as gpattaThink } from "../gpatta/bot";
import { gpattaForSeat } from "../gpatta/view";

export class ExtraError extends Error {}

const EXTRA_GAMES: ExtraGame[] = ["bluff", "paanch", "bhabhi", "gpatta"];
export const isExtraGame = (g: unknown): g is ExtraGame => EXTRA_GAMES.includes(g as ExtraGame);

/** How long the deal is shown before anyone is asked to move (ms). */
const DEAL_MS = 1500;
/** How long the table waits before turning G Patta's cards out. */
const GPATTA_DEAL_MS = 1200;

/** A new table. `seats` has already been forced to a count the game allows (see table-games). */
export function newExtra(game: ExtraGame, seats: number): ExtraStored {
  switch (game) {
    case "bluff":
      return { game, state: newBluff() };
    case "paanch":
      return { game, state: newPaanch({ players: seats === 2 ? 2 : 4 }) };
    case "bhabhi":
      return { game, state: newBhabhi({ players: seats }) };
    case "gpatta":
      // starts on the card turned out of the deck; the table deals it a moment later (see tableStep)
      return { game, state: newGPatta({ players: seats }) };
  }
}

export function extraOver(e: ExtraStored): boolean {
  switch (e.game) {
    case "bluff":
      return e.state.phase === "over";
    case "paanch":
      return e.state.result !== null;
    case "bhabhi":
      return e.state.bhabhi !== null;
    case "gpatta":
      return e.state.phase === "over";
  }
}

/** The seats that owe a move right now. Usually one; at G Patta everyone throws their pairs at once. */
export function extraPending(e: ExtraStored): number[] {
  if (extraOver(e)) return [];
  switch (e.game) {
    case "bluff":
      return e.state.phase === "play" ? [e.state.turn] : [];
    case "paanch":
      return [e.state.turn];
    case "bhabhi":
      return e.state.turn === null ? [] : [e.state.turn];
    case "gpatta":
      if (e.state.phase === "pairs") return e.state.players.flatMap((p, i) => (p.ready ? [] : [i]));
      return e.state.phase === "draw" ? [e.state.turn] : [];
  }
}

/**
 * A step the table makes by itself once what just happened has been shown: Bluff's next round after a
 * call, G Patta's deal after the card is turned out. Null when it's a player's move.
 */
export function extraTableStep(e: ExtraStored): { ms: number; next: () => ExtraStored } | null {
  if (e.game === "bluff" && e.state.phase === "reveal") {
    const s = e.state;
    return { ms: BLUFF_REVEAL_MS, next: () => ({ game: "bluff", state: bluffNextRound(s) }) };
  }
  if (e.game === "gpatta" && e.state.phase === "reveal") {
    const s = e.state;
    return { ms: GPATTA_DEAL_MS, next: () => ({ game: "gpatta", state: gpattaAct(s, 0, { type: "deal" }) }) };
  }
  return null;
}

/** Seconds a person has to move. */
export function extraTurnSeconds(e: ExtraStored): number {
  switch (e.game) {
    case "bluff":
      return BLUFF_TURN_SECONDS;
    case "paanch":
      return PAANCH_TURN_SECONDS;
    case "bhabhi":
      return BHABHI_TURN_SECONDS;
    case "gpatta":
      return GPATTA_TURN_SECONDS;
  }
}

/** How long a computer seems to think before it moves (ms). */
export function extraThinkMs(e: ExtraStored): number {
  switch (e.game) {
    case "bluff":
      return bluffThink(e.state);
    case "paanch":
      return paanchThink(e.state);
    case "bhabhi":
      return bhabhiThink(e.state);
    case "gpatta":
      return gpattaThink(e.state);
  }
}

/** The deal animation at the start, before anyone's clock starts (ms). */
export function extraOpeningMs(e: ExtraStored): number {
  switch (e.game) {
    case "bluff":
      return 0; // the computer's own thinking time already waits out the deal
    case "paanch":
      return e.state.eventNo <= 1 ? DEAL_MS : 0;
    case "bhabhi":
      return e.state.events.length <= 1 ? DEAL_MS : 0;
    case "gpatta":
      return e.state.seq <= 1 ? DEAL_MS : 0;
  }
}

// ───────────── moves ─────────────

const str = (v: unknown) => (typeof v === "string" ? v : "");
const int = (v: unknown) => Math.trunc(Number(v));

/** A move from a phone, kept to what the game accepts (the engine still has the last word). */
function cleanMove(game: ExtraGame, move: unknown): BluffAction | PaanchAction | BhabhiAction | GPattaAction {
  const m = (move ?? {}) as Record<string, unknown>;
  const type = str(m.type);
  switch (game) {
    case "bluff": {
      if (type === "call") return { type: "call" };
      if (type === "play") {
        const cards = Array.isArray(m.cards) ? m.cards.map(str).slice(0, MAX_PLAY) : [];
        return { type: "play", cards };
      }
      break;
    }
    case "paanch": {
      if (type === "dead") return { type: "dead", card: str(m.card) };
      if (type === "place" || type === "remove") return { type, card: str(m.card), cell: int(m.cell) };
      break;
    }
    case "bhabhi": {
      if (type === "play") return { type: "play", card: str(m.card) };
      break;
    }
    case "gpatta": {
      if (type === "throw") return { type: "throw" };
      if (type === "pair") return { type: "pair", a: int(m.a), b: int(m.b) };
      if (type === "draw") return { type: "draw", index: int(m.index) };
      break;
    }
  }
  throw new ExtraError("Unknown move");
}

/** Turns a game's own complaint into one the table can send back to the phone. */
function asExtraError(e: unknown): never {
  if (e instanceof BluffError || e instanceof PaanchError || e instanceof BhabhiError || e instanceof GPattaError) {
    throw new ExtraError(e.message);
  }
  throw e;
}

function apply(e: ExtraStored, seat: number, move: BluffAction | PaanchAction | BhabhiAction | GPattaAction): ExtraStored {
  try {
    switch (e.game) {
      case "bluff":
        return { game: "bluff", state: bluffAct(e.state, seat as BluffSeat, move as BluffAction) };
      case "paanch":
        return { game: "paanch", state: paanchAct(e.state, seat as PaanchSeat, move as PaanchAction) };
      case "bhabhi":
        return { game: "bhabhi", state: bhabhiAct(e.state, seat, move as BhabhiAction) };
      case "gpatta":
        return { game: "gpatta", state: gpattaAct(e.state, seat, move as GPattaAction) };
    }
  } catch (err) {
    asExtraError(err);
  }
}

/** A move made by the person at this seat. Throws ExtraError when the game doesn't allow it. */
export function extraMove(e: ExtraStored, seat: number, move: unknown): ExtraStored {
  return apply(e, seat, cleanMove(e.game, move));
}

/** What the computer in this seat does now (null when it has nothing to do). */
export function extraBotMove(e: ExtraStored, seat: number): ExtraStored | null {
  switch (e.game) {
    case "bluff":
      return apply(e, seat, bluffBot(e.state, seat as BluffSeat, BLUFF_TEMPERS[seat % BLUFF_TEMPERS.length]));
    case "paanch":
      return apply(e, seat, paanchBot(e.state, seat as PaanchSeat));
    case "bhabhi":
      return apply(e, seat, bhabhiBot(e.state, seat, BHABHI_TEMPERS[seat % BHABHI_TEMPERS.length]));
    case "gpatta": {
      const a = gpattaBot(e.state, seat);
      return a ? apply(e, seat, a) : null;
    }
  }
}

/** The move made for a person whose time ran out. */
export function extraAutoMove(e: ExtraStored, seat: number): ExtraStored {
  switch (e.game) {
    case "bluff":
      return apply(e, seat, bluffAuto(e.state, seat as BluffSeat));
    case "paanch":
      return apply(e, seat, paanchAuto(e.state, seat as PaanchSeat));
    case "bhabhi": {
      const legal = legalPlays(e.state, seat);
      if (!legal.length) throw new ExtraError("No move available");
      return apply(e, seat, { type: "play", card: legal[Math.floor(Math.random() * legal.length)], auto: true });
    }
    case "gpatta":
      return apply(e, seat, { type: "timeout" });
  }
}

// ───────────── what one seat sees, and what it won ─────────────

/** The table turned so `mine` sits in seat 0, with only the cards that seat may see. */
export function extraSeen(e: ExtraStored, mine: number | null): ExtraSeen {
  switch (e.game) {
    case "bluff":
      return { game: "bluff", state: bluffForSeat(e.state, mine === null ? null : (mine as BluffSeat)) };
    case "paanch":
      return { game: "paanch", state: paanchForSeat(e.state, mine === null ? null : (mine as PaanchSeat)) };
    case "bhabhi":
      return { game: "bhabhi", state: bhabhiForSeat(e.state, mine) };
    case "gpatta":
      return { game: "gpatta", state: gpattaForSeat(e.state, mine) };
  }
}

/** How the finished game went for this seat (null while it is still being played). */
export function extraOutcome(e: ExtraStored, seat: number): Outcome | null {
  if (!extraOver(e)) return null;
  switch (e.game) {
    case "bluff":
      return { won: e.state.winner === seat };
    case "paanch": {
      const winner = e.state.result!.winner;
      return { won: winner !== null && winner === paanchTeam(seat as PaanchSeat), draw: winner === null };
    }
    case "bhabhi":
      return { place: e.state.place[seat] ?? e.state.players, players: e.state.players };
    case "gpatta":
      return { place: e.state.players[seat]?.place ?? e.state.n, players: e.state.n };
  }
}
