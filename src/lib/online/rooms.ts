import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { runBots } from "../game/bot";
import {
  type GameOptions,
  type GameState,
  type Seat,
  cleanGameOptions,
  SEATS,
  legalCards,
  newGame,
  playCard,
  startNextDeal,
} from "../game/engine";
import { shuffle } from "../game/cards";
import { seatsFor } from "../game/table-games";
import { AWAY_SECONDS, PACE, TURN_SECONDS } from "../game/pace";
import { CHARACTERS, isCharacterId } from "../characters";
import { seatView } from "../game/view";
import { type PlayerRow, type RoomRow, type RoomStore, SeatTakenError, getStore, setSweepHook, tablesAvailable } from "./store";
import type { ChatMessage, ExtraStored, ExtraView, JoinResponse, PattiView, RoomView, SeatEntry, StoredState } from "./types";
import {
  ExtraError,
  extraAutoMove,
  extraBotMove,
  extraMove as extraApply,
  extraOpeningMs,
  extraOutcome,
  extraOver,
  extraPending,
  extraSeen,
  extraTableStep,
  extraThinkMs,
  extraTurnSeconds,
  isExtraGame,
  newExtra,
} from "./extra";
import {
  PATTI_TURN_SECONDS,
  type PattiAction,
  PattiError,
  type PattiState,
  SIDESHOW_SECONDS,
  act as pattiAct,
  newTable,
  rulesFor,
  TABLES,
  startDeal,
} from "../patti/engine";
import { TEMPERS, chooseAction, thinkMs } from "../patti/bot";
import { pattiForSeat } from "../patti/view";
import { GAMES, PATTI_FEE, RUNG_FEE, RUNG_WIN, feeFor, pattiCashOut, payoutFor } from "../wallet/economy";
import { WalletError, balance, chargeAll, move as moveCoins, walletKey } from "../wallet/wallets";

/** A character for someone who didn't pick one, chosen from their name so it stays the same. */
function avatarFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHARACTERS[h % CHARACTERS.length].id;
}
const isAvatar = isCharacterId;

export class RoomError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** A short table code anyone can type on a number pad: 3 digits, 100 to 999. */
function newCode() {
  return String(100 + randomInt(900));
}

export function normaliseCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 3);
}

/** Text from a phone: no control or invisible formatting characters, single spaces. */
function clean(v: unknown) {
  return (typeof v === "string" ? v : "")
    .replace(/\s+/g, " ")
    // (the zero-width joiner stays: emoji like \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67 are built with it)
    .replace(/(?!\u200d)[\p{Cc}\p{Cf}]/gu, "")
    .trim();
}

function cleanName(name: unknown) {
  const n = clean(name).slice(0, 24).trim();
  if (!n) throw new RoomError("Please enter a name");
  return n;
}

const cleanOptions = (o: unknown): GameOptions => cleanGameOptions(o);

/** How many seats this table has. Options are cleaned on the way in, so this only re-checks them. */
const tableSeats = (options: GameOptions) => seatsFor(options.game, options.players);

/**
 * The seats at a table, 0 … n−1. Rung's `Seat` is 0–3; the bigger tables (Bhabhi, G Patta) reuse it as
 * a plain seat number, so the seat arrays and the lobby stay one shape for every game.
 */
const seatList = (n: number): Seat[] => Array.from({ length: n }, (_, i) => i as Seat);

async function loadRoom(store: RoomStore, code: string): Promise<RoomRow> {
  const room = await store.getRoom(code);
  if (!room) throw new RoomError("That table doesn't exist (or the server was restarted)", 404);
  return room;
}

async function playerByToken(store: RoomStore, code: string, token: string): Promise<PlayerRow> {
  const p = token ? await store.playerByToken(code, token) : null;
  if (!p) throw new RoomError("You're not at this table — join it first", 403);
  return p;
}

// Slack on top of the player's 15 seconds, for the network and the phones' animations. Their own
// phone plays a card for them on time; the server only steps in when that phone has gone quiet.
const GRACE_MS = 2500;

/**
 * When the player now on turn runs out of time, in server ms. The table reveals the moves made since
 * `before` (bots' cards, finished haaths) one at a time, so the clock starts after that replay.
 */
function turnDeadline(before: GameState | null, game: GameState, seats: SeatEntry[]): number | null {
  const d = game.deal;
  if (d.result || seats[d.turn].isBot) return null;
  const from = before && before.dealNo === game.dealNo ? before.deal.events.length : 0;
  let reveal = 0;
  for (let i = from; i < d.events.length; i++) {
    const prev = d.events[i - 1];
    reveal += !prev ? PACE.first : prev.type === "trick" ? PACE.afterTrick : PACE.afterPlay;
  }
  return Date.now() + reveal + TURN_SECONDS * 1000 + GRACE_MS;
}

/** The stored state after a move, with the turn clock restarted. */
function nextState(before: GameState | null, game: GameState, seats: SeatEntry[]): StoredState {
  return { game, seats, deadline: turnDeadline(before, game, seats) };
}

/** Optimistic-concurrency write: fails if someone else changed the room since we read it. */
async function saveRoom(store: RoomStore, room: RoomRow, patch: Partial<Pick<RoomRow, "status" | "options" | "state">>) {
  const version = await store.updateRoom(room.code, room.version, patch);
  if (version === null) throw new RoomError("The table changed — try again", 409);
  await store.publish(room.code, version);
  return version;
}

/**
 * Runs a read-check-write step again (on fresh data) when another phone changed the table in between.
 * Each step reloads the room itself, so a retry sees the new state and may fail on its own rules.
 */
async function retrying<T>(step: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await step();
    } catch (e) {
      if (i >= attempts || !(e instanceof RoomError && e.status === 409)) throw e;
    }
  }
}

/** Bump the version (e.g. after a player row changed) so every client re-fetches. */
async function touch(store: RoomStore, code: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const room = await loadRoom(store, code);
    const version = await store.updateRoom(code, room.version, {});
    if (version !== null) return store.publish(code, version);
  }
}

// ───────────── coins ─────────────

/** What the charge for sitting down is called in the wallet's history. */
function feeReason(options: GameOptions) {
  if (options.game === "patti") return "3 Patti buy-in";
  if (options.game === "rung" || !options.game) return "Rung match";
  return `${GAMES[options.game].name} table`;
}

/** Before sitting down: does this wallet have enough for the table's game? (The real charge is at the start.) */
async function mustAfford(key: string, options: GameOptions) {
  const fee = feeFor(options.game);
  const have = await balance(key);
  if (have < fee) throw new WalletError(`You need ${fee} coins to play (you have ${have})`, 402, fee - have);
}

/** The wallets of the people (not computers) in these seats. */
function walletsBySeat(seats: SeatEntry[], players: PlayerRow[]) {
  return seats.flatMap((s) => {
    if (s.isBot || !s.playerId) return [];
    const p = players.find((x) => x.id === s.playerId);
    return p?.wallet ? [{ seat: s.seat, name: s.name, key: p.wallet, playerId: p.id }] : [];
  });
}

/** Pays each person on the side that just won a Rung series. Safe to call twice (once per series). */
async function payRungSeries(store: RoomStore, code: string, before: GameState, game: GameState, seats: SeatEntry[], gameId?: string) {
  if (game.seriesWinner == null || before.seriesWinner != null || !gameId) return;
  const players = await store.listPlayers(code);
  for (const w of walletsBySeat(seats, players)) {
    if (w.seat % 2 !== game.seriesWinner) continue;
    await moveCoins(w.key, RUNG_WIN, "Rung match won", `${gameId}:s${game.seriesNo ?? 1}:win:${w.key}`);
  }
}

/** 3 Patti: a player's chips turned back into coins as they leave the table. */
async function cashOutPatti(state: StoredState, seat: SeatEntry, key: string | undefined) {
  if (!state.patti || !key || !state.gameId) return;
  const chips = state.patti.players[seat.seat].chips;
  // real players at a real table: what you have in front of you goes back to the wallet as it is
  const coins = pattiCashOut(chips, state.patti.rules.startChips);
  if (coins > 0) await moveCoins(key, coins, "3 Patti cash out", `${state.gameId}:out:${seat.playerId}`);
}

// A table forgotten after a day of silence still pays out the 3 Patti chips of anyone left at it.
setSweepHook(async (room, players) => {
  if (room.status !== "playing" || !room.state?.patti) return;
  for (const s of room.state.seats) {
    if (s.isBot || !s.playerId) continue;
    await cashOutPatti(room.state, s, players.find((p) => p.id === s.playerId)?.wallet);
  }
});

const cleanAvatar = (avatar: unknown, name: string) => (isAvatar(avatar) ? avatar : avatarFor(name));

export async function createRoom(name: unknown, options: unknown, avatar?: unknown, wallet?: unknown): Promise<JoinResponse> {
  if (!tablesAvailable()) {
    throw new RoomError("Tables with friends run from your own computer for now.", 503);
  }
  const store = await getStore();
  const playerName = cleanName(name);
  const key = walletKey(wallet);
  await mustAfford(key, cleanOptions(options));
  // 900 codes: the store refuses one that is in use and we draw another.
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = newCode();
    if (!(await store.insertRoom({ code, options: cleanOptions(options) }))) continue;
    const token = randomBytes(24).toString("base64url");
    await store.insertPlayer({ room_code: code, name: playerName, seat: 0, is_host: true, token, avatar: cleanAvatar(avatar, playerName), wallet: key });
    return { code, token };
  }
  throw new RoomError("Couldn't create a table, please try again", 500);
}

export async function joinRoom(
  rawCode: string,
  name: unknown,
  existingToken?: string,
  avatar?: unknown,
  wallet?: unknown,
): Promise<JoinResponse> {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const playerName = cleanName(name);
  const room = await loadRoom(store, code);

  if (existingToken && (await store.playerByToken(code, existingToken))) return { code, token: existingToken };
  const key = walletKey(wallet);

  const players = await store.listPlayers(code);
  let seat: Seat | null = null;
  if (room.status === "lobby") {
    seat = seatList(tableSeats(room.options)).find((s) => !players.some((p) => p.seat === s)) ?? null;
  } else if (room.state) {
    // Mid-game: take over the first seat a computer player is keeping warm.
    seat = room.state.seats.find((s) => s.isBot)?.seat ?? null;
  }
  // Sitting at a table (now or when the game starts) needs the coins for it; watching is free.
  if (seat !== null) await mustAfford(key, room.options);

  const token = randomBytes(24).toString("base64url");
  let player: PlayerRow;
  try {
    player = await store.insertPlayer({
      room_code: code,
      name: playerName,
      seat,
      is_host: players.length === 0,
      token,
      avatar: cleanAvatar(avatar, playerName),
      wallet: key,
    });
  } catch (e) {
    if (e instanceof SeatTakenError) throw new RoomError("Someone just took that seat — try again", 409);
    throw e;
  }

  if (room.status === "playing" && room.state && seat !== null) {
    const state = room.state;
    const seats = state.seats.map((s) =>
      s.seat === seat ? { ...s, name: playerName, isBot: false, playerId: player.id, avatar: player.avatar, buyIns: 1 } : s,
    );
    // Taking over a computer's seat mid-game: pay for it like everyone else did. At 3 Patti you sit
    // down with a fresh starting stack.
    let patti = state.patti;
    if (patti) {
      patti = structuredClone(patti);
      patti.players[seat].chips = patti.rules.startChips;
    }
    const once = state.patti
      ? `${state.gameId}:in:${player.id}`
      : state.extra
        ? `${state.gameId}:fee:${key}`
        : `${state.gameId}:s${state.game.seriesNo ?? 1}:fee:${key}`;
    const fee = feeFor(room.options.game);
    let paid = false;
    try {
      await chargeAll([{ key, amount: fee, reason: feeReason(room.options), once, name: playerName }]);
      paid = true;
      const deadline = patti
        ? pattiDeadline(patti, seats)
        : state.extra
          ? extraDeadline(state.extra, seats)
          : state.deadline;
      await saveRoom(store, room, { state: { ...state, ...(patti ? { patti } : {}), seats, deadline } });
    } catch (e) {
      await store.deletePlayer(code, player.id);
      // paid but someone else took the seat first: give the coins back
      if (paid) await moveCoins(key, fee, "Refund: that seat was just taken", `${once}:refund`);
      if (e instanceof RoomError && e.status === 409) throw new RoomError("Someone just took that seat — try again", 409);
      throw e;
    }
  } else {
    await touch(store, code);
  }
  return { code, token };
}

export async function getRoomView(rawCode: string, token: string): Promise<RoomView> {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  const players = await store.listPlayers(code);
  const me = players.find((p) => p.token === token);
  if (!token || !me) throw new RoomError("You're not at this table — join it first", 403);

  const lobby = seatList(tableSeats(room.options)).map((seat) => {
    const p = players.find((x) => x.seat === seat);
    return {
      seat,
      playerId: p?.id ?? null,
      name: p?.name ?? null,
      isHost: Boolean(p?.is_host),
      isMe: p?.id === me.id,
      avatar: p ? (p.avatar ?? avatarFor(p.name)) : null,
    };
  });

  const tablePlayers = (seats: SeatEntry[]) =>
    seats.map(({ seat, name, isBot, avatar, awaySince }) => ({
      seat,
      name,
      isBot,
      avatar: avatar ?? avatarFor(name),
      awayAt: awaySince ?? null,
    }));

  let game = null;
  let patti: PattiView | null = null;
  let extra: ExtraView | null = null;
  let spectating = false;
  if (room.status === "playing" && room.state?.extra) {
    const mySeat = room.state.seats.find((s) => s.playerId === me.id)?.seat ?? null;
    spectating = mySeat === null;
    extra = { ...extraSeen(room.state.extra, mySeat), mySeat, players: tablePlayers(room.state.seats) };
  } else if (room.status === "playing" && room.state?.patti) {
    const mySeat = room.state.seats.find((s) => s.playerId === me.id)?.seat ?? null;
    spectating = mySeat === null;
    patti = {
      state: pattiForSeat(room.state.patti, mySeat),
      mySeat,
      players: tablePlayers(room.state.seats),
    };
  } else if (room.status === "playing" && room.state) {
    const mySeat = room.state.seats.find((s) => s.playerId === me.id)?.seat;
    const seatPlayers = room.state.seats.map(({ seat, name, isBot, avatar, awaySince }) => ({
      seat,
      name,
      isBot,
      avatar: avatar ?? avatarFor(name),
      awayAt: awaySince ?? null,
    }));
    // Spectators watch from seat 0's chair but never see a hand.
    game = seatView(room.state.game, mySeat ?? 0, seatPlayers);
    if (mySeat === undefined) {
      spectating = true;
      game.hand = [];
      game.legal = [];
    }
  }
  const deadline = room.status === "playing" ? room.state?.deadline : null;

  return {
    code,
    status: room.status,
    version: room.version,
    options: room.options,
    me: { playerId: me.id, name: me.name, seat: me.seat, isHost: me.is_host },
    lobby,
    spectators: players.filter((p) => p.seat === null).length,
    waiting: players
      .filter((p) => p.seat === null)
      .map((p) => ({ playerId: p.id, name: p.name, isMe: p.id === me.id, avatar: p.avatar ?? avatarFor(p.name) })),
    game,
    patti,
    extra,
    spectating,
    turnDeadlineIn: deadline ? Math.max(0, deadline - Date.now()) : null,
  };
}

export async function chooseSeat(rawCode: string, token: string, seat: unknown) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started");
  const me = await playerByToken(store, code, token);
  const s = seat === null ? null : (Number(seat) as Seat);
  if (s !== null && !seatList(tableSeats(room.options)).includes(s)) throw new RoomError("Invalid seat");
  try {
    await store.updatePlayer(code, me.id, { seat: s });
  } catch (e) {
    if (e instanceof SeatTakenError) throw new RoomError("That seat is taken", 409);
    throw e;
  }
  await touch(store, code);
}

/**
 * Host only, before the game starts: put a player in a seat. Whoever was sitting there swaps into the
 * mover's old place, so the host can arrange the pairs (seats 0 & 2 vs 1 & 3) however they like.
 */
export async function movePlayer(rawCode: string, token: string, playerId: unknown, seat: unknown) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started");
  const me = await playerByToken(store, code, token);
  if (!me.is_host) throw new RoomError("Only the host can arrange the pairs", 403);

  const target = seat === null ? null : (Number(seat) as Seat);
  if (target !== null && !seatList(tableSeats(room.options)).includes(target)) throw new RoomError("Invalid seat");
  const players = await store.listPlayers(code);
  const mover = players.find((p) => p.id === playerId);
  if (!mover) throw new RoomError("That player has left");
  if (mover.seat === target) return;
  const occupant = target === null ? undefined : players.find((p) => p.seat === target);

  try {
    // Free both places first so the swap never puts two players in one seat.
    await store.updatePlayer(code, mover.id, { seat: null });
    if (occupant) await store.updatePlayer(code, occupant.id, { seat: mover.seat });
    await store.updatePlayer(code, mover.id, { seat: target });
  } catch (e) {
    if (e instanceof SeatTakenError) throw new RoomError("Someone just moved, try again", 409);
    throw e;
  }
  await touch(store, code);
}

/** Host only: deal the seated players into random pairs. */
export async function shufflePairs(rawCode: string, token: string) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started");
  const me = await playerByToken(store, code, token);
  if (!me.is_host) throw new RoomError("Only the host can arrange the pairs", 403);

  const seated = (await store.listPlayers(code)).filter((p) => p.seat !== null);
  const seats = shuffle(seatList(tableSeats(room.options)));
  for (const p of seated) await store.updatePlayer(code, p.id, { seat: null });
  for (const [i, p] of seated.entries()) await store.updatePlayer(code, p.id, { seat: seats[i] });
  await touch(store, code);
}

export async function updateOptions(rawCode: string, token: string, options: unknown) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  const me = await playerByToken(store, code, token);
  if (!me.is_host) throw new RoomError("Only the host can change the rules", 403);
  if (room.status !== "lobby") throw new RoomError("The game has already started");
  const next = cleanOptions(options);
  // A smaller table (another game, or fewer seats): anyone past the last seat waits instead of sitting.
  const seats = tableSeats(next);
  for (const p of await store.listPlayers(code)) {
    if (p.seat !== null && p.seat >= seats) await store.updatePlayer(code, p.id, { seat: null });
  }
  await saveRoom(store, room, { options: next });
}

export async function startGame(rawCode: string, token: string) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  const me = await playerByToken(store, code, token);
  if (!me.is_host) throw new RoomError("Only the host can start the game", 403);
  if (room.status !== "lobby") throw new RoomError("The game has already started");

  const players = await store.listPlayers(code);
  // Every seat gets its own character: players keep the one they picked when nobody earlier took it,
  // everyone else gets one that is still free. A table with more seats than there are regulars (Bhabhi,
  // G Patta) starts the list again, so the last seats share a look.
  const looks = CHARACTERS.map((c) => c.id as string);
  const free = looks.slice();
  const take = (want: string | undefined) => {
    if (!free.length) free.push(...looks);
    const i = want ? free.indexOf(want) : -1;
    return free.splice(i >= 0 ? i : 0, 1)[0];
  };
  const table = seatList(tableSeats(room.options));
  const seated = table.map((seat) => players.find((x) => x.seat === seat));
  const chosen = seated.map((p) => (p ? take(p.avatar ?? avatarFor(p.name)) : null));
  const used = new Set<string>();
  const botName = (avatar: string) => {
    const base = CHARACTERS.find((c) => c.id === avatar)!.name;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
    used.add(name);
    return name;
  };
  const seats: SeatEntry[] = table.map((seat) => {
    const p = seated[seat];
    if (p) {
      used.add(p.name);
      return { seat, name: p.name, isBot: false, playerId: p.id, avatar: chosen[seat]! };
    }
    const avatar = take(undefined);
    return { seat, name: botName(avatar), isBot: true, playerId: null, avatar };
  });
  // Everyone sitting down pays now, all or nobody (the error names who is short).
  const gameId = randomUUID();
  const kind = room.options.game ?? "rung";
  const isPatti = kind === "patti";
  const extraGame = isExtraGame(kind) ? kind : null;
  const charges = walletsBySeat(seats, players).map((w) => ({
    key: w.key,
    amount: feeFor(kind),
    reason: feeReason(room.options),
    once: isPatti ? `${gameId}:in:${w.playerId}` : extraGame ? `${gameId}:fee:${w.key}` : `${gameId}:s1:fee:${w.key}`,
    name: w.name,
  }));
  await chargeAll(charges);
  try {
    if (isPatti) {
      const patti = newTable(rulesFor(TABLES[0].boot), undefined, randomInt(4) as Seat);
      const paid = seats.map((s) => (s.isBot ? s : { ...s, buyIns: 1 }));
      await saveRoom(store, room, { status: "playing", state: { ...pattiStored(startDeal(patti), paid), gameId } });
      return;
    }
    if (extraGame) {
      const extra = newExtra(extraGame, seats.length);
      await saveRoom(store, room, { status: "playing", state: { ...extraStored(extra, seats), gameId } });
      return;
    }
    const game = runBots(newGame(room.options), (s) => seats[s].isBot);
    await saveRoom(store, room, { status: "playing", state: { ...nextState(null, game, seats), gameId } });
  } catch (e) {
    // the game didn't start after all: give the coins back
    for (const c of charges) await moveCoins(c.key, c.amount, "Refund: the game didn't start", `${c.once}:refund`);
    throw e;
  }
}

// ───────────── 3 Patti tables ─────────────

/** Rung state kept at a 3 Patti table only to satisfy the stored shape; never played. */
const NO_RUNG = newGame();
/** Who has to move now: the player answering a sideshow, or the player on turn. */
const pattiActor = (p: PattiState): Seat => (p.pending ? p.pending.to : p.turn);

/**
 * When the player on the move runs out of time, in server ms. A computer "runs out" after its thinking
 * time, so any phone at the table can ask the server to move for it then.
 */
function pattiDeadline(p: PattiState, seats: SeatEntry[]): number | null {
  if (p.result) return null;
  const who = pattiActor(p);
  // the deal animation at the start of a deal
  const dealing = p.events.length <= 1 ? 1800 : 0;
  if (seats[who].isBot) return Date.now() + dealing + thinkMs(p);
  return Date.now() + dealing + (p.pending ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS) * 1000 + GRACE_MS;
}

function pattiStored(p: PattiState, seats: SeatEntry[]): StoredState {
  return { game: NO_RUNG, patti: p, seats, deadline: pattiDeadline(p, seats) };
}

const PATTI_MOVES = ["see", "chaal", "raise", "pack", "show", "sideshow", "sideshowReply"] as const;
function cleanPattiAction(a: unknown): PattiAction {
  const x = (a ?? {}) as { type?: unknown; accept?: unknown };
  const type = PATTI_MOVES.find((m) => m === x.type);
  if (!type) throw new RoomError("Unknown move");
  if (type === "sideshowReply") return { type, accept: x.accept === true };
  if (type === "pack") return { type };
  return { type };
}

/** A 3 Patti move by the player at this phone. */
export async function pattiMove(rawCode: string, token: string, action: unknown) {
  return retrying(() => pattiMoveOnce(rawCode, token, action));
}
async function pattiMoveOnce(rawCode: string, token: string, action: unknown) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  const seat = await mySeatIn(store, room, token);
  const state = room.state!;
  if (!state.patti) throw new RoomError("This table plays Rung");
  const move = cleanPattiAction(action);
  let p: PattiState;
  try {
    p = pattiAct(state.patti, seat, move);
  } catch (e) {
    if (e instanceof PattiError) throw new RoomError(e.message);
    throw e;
  }
  // looking at your cards doesn't restart anyone's clock
  const sameTurn = move.type === "see" && pattiActor(p) === pattiActor(state.patti) && !p.result;
  const deadline = sameTurn ? (state.deadline ?? null) : pattiDeadline(p, state.seats);
  await saveRoom(store, room, { state: { ...state, patti: p, deadline } });
}

/**
 * Anyone at the table may ask for this once the player on the move is out of time: a computer makes its
 * move; a person who went quiet packs (or refuses the sideshow they were asked for).
 */
export async function pattiTick(rawCode: string, token: string) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  await playerByToken(store, room.code, token);
  const state = room.state;
  if (room.status !== "playing" || !state?.patti || state.patti.result || !state.deadline) return;
  if (Date.now() < state.deadline) return; // still thinking
  const who = pattiActor(state.patti);
  let p = state.patti;
  if (state.seats[who].isBot) {
    // a computer may look at its cards first, then decide
    for (let i = 0; i < 3; i++) {
      const a = chooseAction(p, who, TEMPERS[who]);
      try {
        p = pattiAct(p, who, a);
      } catch {
        p = pattiAct(p, who, p.pending ? { type: "sideshowReply", accept: false } : { type: "pack", auto: true });
        break;
      }
      if (a.type !== "see") break;
    }
  } else {
    p = pattiAct(p, who, p.pending ? { type: "sideshowReply", accept: false } : { type: "pack", auto: true });
  }
  try {
    await saveRoom(store, room, { state: { ...state, patti: p, deadline: pattiDeadline(p, state.seats) } });
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

/** The next 3 Patti deal. Anyone out of chips (person or computer) buys back in with the starting stack. */
async function pattiNextDeal(store: RoomStore, room: RoomRow, state: StoredState & { patti: PattiState }) {
  if (!state.patti.result) return; // someone else already dealt
  const c = structuredClone(state.patti);
  // Out of chips: computers buy back in for free; people pay another buy-in, or (if they can't) their
  // seat goes to a computer and they watch.
  const players = await store.listPlayers(room.code);
  let seats = state.seats;
  for (const s of SEATS) {
    if (c.players[s].chips > 0) continue;
    const entry = seats[s];
    const key = entry.isBot ? undefined : players.find((p) => p.id === entry.playerId)?.wallet;
    if (key) {
      try {
        await moveCoins(key, -PATTI_FEE, "3 Patti buy-in", `${state.gameId}:rebuy:${entry.playerId}:${c.dealNo}`);
        seats = seats.map((x) => (x.seat === s ? { ...x, buyIns: (x.buyIns ?? 1) + 1 } : x));
      } catch (e) {
        if (!(e instanceof WalletError)) throw e;
        seats = seats.map((x) => (x.seat === s ? { ...x, isBot: true, playerId: null, awaySince: null, name: `${x.name} (bot)` } : x));
      }
    }
    c.players[s].chips = c.rules.startChips;
  }
  try {
    await saveRoom(store, room, { state: { ...pattiStored(startDeal(c), seats), gameId: state.gameId } });
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e;
  }
}

// ───────────── Bluff, Paanch, Bhabhi and G Patta tables ─────────────

/**
 * When whoever is on the move runs out of time, in server ms. A computer "runs out" after its thinking
 * time and a step the table makes by itself (Bluff's next round, G Patta's deal) after it has been shown,
 * so any phone at the table can ask the server for it then.
 */
function extraDeadline(e: ExtraStored, seats: SeatEntry[]): number | null {
  if (extraOver(e)) return null;
  const step = extraTableStep(e);
  if (step) return Date.now() + step.ms;
  const pending = extraPending(e);
  if (!pending.length) return null;
  const opening = extraOpeningMs(e);
  // a computer among them moves first, and quickly; the people get their full clock after that
  if (pending.some((s) => seats[s]?.isBot)) return Date.now() + opening + extraThinkMs(e);
  return Date.now() + opening + extraTurnSeconds(e) * 1000 + GRACE_MS;
}

function extraStored(e: ExtraStored, seats: SeatEntry[]): StoredState {
  return { game: NO_RUNG, extra: e, seats, deadline: extraDeadline(e, seats) };
}

/**
 * Pays everyone when one of these games has just finished: what each seat gets is the same table of
 * payouts a game against the computer used to use (last one standing at Bluff, win or draw at Paanch,
 * the place you got out in at Bhabhi and G Patta). Safe to call twice.
 */
async function payExtra(store: RoomStore, room: RoomRow, before: ExtraStored, after: ExtraStored, seats: SeatEntry[], gameId?: string) {
  if (!gameId || extraOver(before) || !extraOver(after)) return;
  const players = await store.listPlayers(room.code);
  for (const w of walletsBySeat(seats, players)) {
    const outcome = extraOutcome(after, w.seat);
    if (!outcome) continue;
    const coins = payoutFor(after.game, outcome);
    if (coins > 0) await moveCoins(w.key, coins, `${GAMES[after.game].name} won`, `${gameId}:win:${w.seat}:${w.key}`);
  }
}

/** Saves a move at one of these tables (and pays out if it ended the game). */
async function saveExtra(store: RoomStore, room: RoomRow, state: StoredState, before: ExtraStored, after: ExtraStored) {
  await saveRoom(store, room, { state: { ...extraStored(after, state.seats), gameId: state.gameId } });
  await payExtra(store, room, before, after, state.seats, state.gameId);
}

/** A move at a Bluff, Paanch, Bhabhi or G Patta table by the player at this phone. */
export async function extraMove(rawCode: string, token: string, move: unknown) {
  return retrying(() => extraMoveOnce(rawCode, token, move));
}
async function extraMoveOnce(rawCode: string, token: string, move: unknown) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  const seat = await mySeatIn(store, room, token);
  const state = room.state!;
  if (!state.extra) throw new RoomError("This table plays something else");
  let next: ExtraStored;
  try {
    next = extraApply(state.extra, seat, move);
  } catch (e) {
    if (e instanceof ExtraError) throw new RoomError(e.message);
    throw e;
  }
  await saveExtra(store, room, state, state.extra, next);
}

/**
 * Anyone at the table may ask for this once whoever is on the move is out of time: a computer makes its
 * move, the table takes its own step, or a person who went quiet has one made for them.
 */
export async function extraTick(rawCode: string, token: string) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  await playerByToken(store, room.code, token);
  const state = room.state;
  if (room.status !== "playing" || !state?.extra || extraOver(state.extra) || !state.deadline) return;
  if (Date.now() < state.deadline) return; // still thinking

  const before = state.extra;
  let next: ExtraStored | null = null;
  const step = extraTableStep(before);
  if (step) {
    next = step.next();
  } else {
    const pending = extraPending(before);
    // one computer at a time, so the table is seen to play rather than jumping ahead
    const bot = pending.find((s) => state.seats[s]?.isBot);
    if (bot !== undefined) {
      try {
        next = extraBotMove(before, bot);
      } catch {
        next = null;
      }
      if (!next) next = extraAutoMove(before, bot);
    } else {
      for (const s of pending) next = extraAutoMove(next ?? before, s);
    }
  }
  if (!next) return;
  try {
    await saveExtra(store, room, state, before, next);
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

async function mySeatIn(store: RoomStore, room: RoomRow, token: string): Promise<Seat> {
  if (room.status !== "playing" || !room.state) throw new RoomError("The game hasn't started");
  const me = await playerByToken(store, room.code, token);
  const entry = room.state.seats.find((s) => s.playerId === me.id);
  if (!entry) throw new RoomError("You're watching this table, not playing", 403);
  return entry.seat;
}

export async function play(rawCode: string, token: string, card: unknown, auto?: unknown) {
  return retrying(() => playOnce(rawCode, token, card, auto));
}
async function playOnce(rawCode: string, token: string, card: unknown, auto?: unknown) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  const seat = await mySeatIn(store, room, token);
  const state = room.state!;
  if (state.patti) throw new RoomError("This table plays 3 Patti");
  if (state.extra) throw new RoomError(`This table plays ${GAMES[state.extra.game].name}`);
  const played = playCard(state.game, seat, String(card), { auto: auto === true });
  const game = runBots(played, (s) => state.seats[s].isBot);
  await saveRoom(store, room, { state: { ...nextState(state.game, game, state.seats), gameId: state.gameId } });
  await payRungSeries(store, room.code, state.game, game, state.seats, state.gameId);
}

/**
 * Anyone at the table can ask for this once the player on turn is out of time (their phone may be
 * locked or offline). The server checks its own clock and plays a random legal card for them.
 */
export async function timeoutTurn(rawCode: string, token: string) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  await playerByToken(store, room.code, token);
  const state = room.state;
  if (room.status !== "playing" || !state || state.patti || state.extra || state.game.deal.result || !state.deadline) return;
  if (Date.now() < state.deadline) return; // still thinking
  const seat = state.game.deal.turn;
  const legal = legalCards(state.game.deal, seat);
  const played = playCard(state.game, seat, legal[randomInt(legal.length)], { auto: true });
  const game = runBots(played, (s) => state.seats[s].isBot);
  try {
    await saveRoom(store, room, { state: { ...nextState(state.game, game, state.seats), gameId: state.gameId } });
    await payRungSeries(store, room.code, state.game, game, state.seats, state.gameId);
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

export async function nextDeal(rawCode: string, token: string) {
  return retrying(() => nextDealOnce(rawCode, token));
}
async function nextDealOnce(rawCode: string, token: string) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  await mySeatIn(store, room, token);
  const state = room.state!;
  if (state.patti) return pattiNextDeal(store, room, state as StoredState & { patti: PattiState });
  // Bluff deals its own next round (see extraTick); the other three are one game from start to finish.
  if (state.extra) return;
  if (!state.game.deal.result) return; // someone else already dealt
  let seats = state.seats;
  if (state.game.seriesWinner != null) {
    // A new match: everyone pays again; anyone who can't watches while a computer takes their seat.
    const series = (state.game.seriesNo ?? 1) + 1;
    for (const w of walletsBySeat(seats, await store.listPlayers(room.code))) {
      try {
        await moveCoins(w.key, -RUNG_FEE, "Rung match", `${state.gameId}:s${series}:fee:${w.key}`);
      } catch (e) {
        if (!(e instanceof WalletError)) throw e;
        seats = seats.map((x) => (x.seat === w.seat ? { ...x, isBot: true, playerId: null, awaySince: null, name: `${x.name} (bot)` } : x));
      }
    }
  }
  const game = runBots(startNextDeal(state.game), (s) => seats[s].isBot);
  await saveRoom(store, room, { state: { ...nextState(state.game, game, seats), gameId: state.gameId } });
}

/** Gives every seat whose player left more than AWAY_SECONDS ago to a computer. Safe to call by anyone, any time. */
export async function reapAway(rawCode: string, token: string) {
  const store = await getStore();
  const room = await loadRoom(store, normaliseCode(rawCode));
  await playerByToken(store, room.code, token);
  const state = room.state;
  if (room.status !== "playing" || !state) return;
  const now = Date.now();
  const due = (s: SeatEntry) => !s.isBot && !s.playerId && !!s.awaySince && now - s.awaySince >= AWAY_SECONDS * 1000;
  if (!state.seats.some(due)) return;
  const seats = state.seats.map((s) => (due(s) ? { ...s, isBot: true, awaySince: null, name: `${s.name} (bot)` } : s));
  try {
    if (state.patti) {
      await saveRoom(store, room, { state: { ...pattiStored(state.patti, seats), gameId: state.gameId } });
      return;
    }
    if (state.extra) {
      await saveRoom(store, room, { state: { ...extraStored(state.extra, seats), gameId: state.gameId } });
      return;
    }
    const game = runBots(state.game, (x) => seats[x].isBot);
    await saveRoom(store, room, { state: { ...nextState(state.game, game, seats), gameId: state.gameId } });
    await payRungSeries(store, room.code, state.game, game, seats, state.gameId);
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

export async function leaveRoom(rawCode: string, token: string) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  const me = await playerByToken(store, code, token);
  await store.deletePlayer(code, me.id);

  const rest = await store.listPlayers(code);
  if (me.is_host && rest.length) {
    const heir = rest.find((p) => p.seat !== null) ?? rest[0];
    await store.updatePlayer(code, heir.id, { is_host: true });
  }

  if (room.status !== "playing" || !room.state) return touch(store, code);
  // Release the seat. Another phone may change the table at the same moment, so read it again and
  // retry: a seat left pointing at a player who's gone would never be handed to a computer.
  await retrying(async () => {
    const fresh = await loadRoom(store, code);
    if (fresh.status !== "playing" || !fresh.state) return;
    await releaseSeat(store, fresh, me);
  }, 5);
}

/** Frees a leaving player's seat at a running table (cashing out 3 Patti chips). Safe to repeat. */
async function releaseSeat(store: RoomStore, room: RoomRow, me: PlayerRow) {
  const state = room.state!;
  const mine = state.seats.find((s) => s.playerId === me.id);
  if (!mine) return; // only watching
  // 3 Patti: your chips go back into your wallet (once, however often this runs); whoever takes the
  // seat starts with a fresh stack. Leaving a Rung match forfeits it.
  let patti = state.patti;
  if (patti) {
    await cashOutPatti(state, mine, me.wallet);
    patti = structuredClone(patti);
    patti.players[mine.seat].chips = patti.rules.startChips;
  }
  // The seat is held for a few seconds ("Connecting…"); reapAway() then gives it to a computer.
  const seats = state.seats.map((s) => (s.playerId === me.id ? { ...s, playerId: null, awaySince: Date.now(), buyIns: 0 } : s));
  await saveRoom(store, room, {
    state: patti
      ? { ...state, patti, seats }
      : state.extra
        ? { ...extraStored(state.extra, seats), gameId: state.gameId }
        : { ...nextState(state.game, state.game, seats), gameId: state.gameId },
  });
}

// ───────────── chat ─────────────

const CHAT_MAX = 140;
// A few messages in quick succession are fine; a flood is not.
const recentChat = new Map<string, number[]>();
const STICKER_ID = /^[a-z0-9-]{1,24}$/;

export async function listChat(rawCode: string, token: string): Promise<ChatMessage[]> {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  await playerByToken(store, code, token);
  return store.listChat(code);
}

export async function sendChat(rawCode: string, token: string, body: { text?: unknown; sticker?: unknown }) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  const me = await playerByToken(store, code, token);

  const text = clean(body.text).slice(0, CHAT_MAX).trim();
  const sticker = typeof body.sticker === "string" && STICKER_ID.test(body.sticker) ? body.sticker : undefined;
  if (!text && !sticker) throw new RoomError("Say something first");

  const now = Date.now();
  const times = (recentChat.get(me.id) ?? []).filter((t) => now - t < 10_000);
  if (times.length >= 6) throw new RoomError("Slow down a little", 429);
  recentChat.set(me.id, [...times, now]);
  if (recentChat.size > 500) for (const [id, t] of recentChat) if (!t.some((x) => now - x < 10_000)) recentChat.delete(id);

  const seat =
    room.status === "playing" && room.state
      ? (room.state.seats.find((s) => s.playerId === me.id)?.seat ?? null)
      : me.seat;
  const message: ChatMessage = {
    id: randomUUID(),
    at: now,
    playerId: me.id,
    name: me.name,
    seat,
    ...(sticker ? { sticker } : { text }),
  };
  await store.addChat(code, message);
  return message;
}
