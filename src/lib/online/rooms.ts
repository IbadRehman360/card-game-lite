import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { chooseCard, runBots } from "../game/bot";
import {
  type GameOptions,
  type GameState,
  type Seat,
  cleanGameOptions,
  SEATS,
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
import type { ChatMessage, ExtraStored, ExtraView, JoinResponse, MatchView, PattiView, QuickMeta, RoomView, SeatEntry, StoredState } from "./types";
import { type BanterMoment, BANTER_GAP_MS, banterLine, humanThinkMs, personaNames, quickSchedule } from "./personas";
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
import { GAMES, type GameKind, PATTI_FEE, RUNG_FEE, RUNG_WIN, feeFor, isGameKind, pattiCashOut, payoutFor } from "../wallet/economy";
import { WalletError, balance, chargeAll, move as moveCoins, walletKey, walletKeyOrNull } from "../wallet/wallets";

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

/**
 * The table and the player at this phone, read at the same time (each read is a round trip to the
 * database, so two in a row would double the wait on every move).
 */
async function roomAndMe(store: RoomStore, code: string, token: string) {
  const [room, players] = await Promise.all([loadRoom(store, code), store.listPlayers(code)]);
  const me = token ? players.find((p) => p.token === token) : undefined;
  if (!me) throw new RoomError("You're not at this table — join it first", 403);
  const box = known.getStore();
  if (box) Object.assign(box, { code, room, players });
  return { room, me };
}

/**
 * During a game move, the table and its players as this request last read or wrote them. The reply's
 * view is built from these instead of reading both again (a game move never changes who is at the
 * table), so a move costs two trips to the database: read, then write.
 */
interface Known {
  code?: string;
  room?: RoomRow;
  players?: PlayerRow[];
}
const known = new AsyncLocalStorage<Known>();

/** Runs a game move and then builds this phone's view of the table from what the move already knows. */
export async function moveThenView<T>(rawCode: string, token: string, move: () => Promise<T>): Promise<RoomView> {
  const box: Known = {};
  await known.run(box, move);
  const code = normaliseCode(rawCode);
  return getRoomView(code, token, box.code === code ? box : undefined);
}

/**
 * Work the player who moved needn't wait for (nudging the other phones, a computer's chat line): it runs
 * once the reply is on its way. Outside a request (tests, scripts) it simply runs in the background.
 */
function later(work: () => Promise<unknown>) {
  const run = () => work().catch((e) => console.error("[baazi] background step failed", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

// Slack on top of the player's 15 seconds, for the network and the phones' animations. Their own
// phone plays a card for them on time; the server only steps in when that phone has gone quiet.
const GRACE_MS = 2500;

/**
 * A person whose phone has gone quiet (closed, reloading, no signal) keeps their seat, and the server
 * moves for them when their time runs out. After one such move they're marked `dropped` and only get
 * this long per turn, so the table isn't kept waiting; the phone clears it when it's back (action "back",
 * or any move of its own) and they have their full clock again.
 */
const DROPPED_MS = 3000;

/** The seats with this one marked as dropped (or not). */
const markDropped = (seats: SeatEntry[], seat: number, dropped: boolean): SeatEntry[] =>
  seats.map((s) => (s.seat === seat && !s.isBot && Boolean(s.dropped) !== dropped ? { ...s, dropped } : s));

/**
 * When the player now on turn runs out of time, in server ms. The table reveals the moves made since
 * `before` (bots' cards, finished haaths) one at a time, so the clock starts after that replay.
 */
function turnDeadline(before: GameState | null, game: GameState, seats: SeatEntry[]): number | null {
  const d = game.deal;
  const onTurn = seats[d.turn];
  if (d.result || (onTurn.isBot && !onTurn.lifelike)) return null;
  const from = before && before.dealNo === game.dealNo ? before.deal.events.length : 0;
  let reveal = 0;
  for (let i = from; i < d.events.length; i++) {
    const prev = d.events[i - 1];
    reveal += !prev ? PACE.first : prev.type === "trick" ? PACE.afterTrick : PACE.afterPlay;
  }
  // a quick-match computer "thinks" like a person once the table has caught up (and the cards are dealt)
  if (onTurn.isBot) return Date.now() + reveal + (from === 0 ? PACE.deal : 0) + humanThinkMs(TURN_SECONDS);
  if (onTurn.dropped) return Date.now() + reveal + (from === 0 ? PACE.deal : 0) + DROPPED_MS;
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
  const box = known.getStore();
  if (box?.code === room.code) box.room = { ...room, ...patch, version };
  // the phone that moved gets the new table in its reply; the others are nudged right after
  later(() => store.publish(room.code, version));
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

/** What a table's state carries from one move to the next besides the game: its id, and whether it is a quick match. */
const keep = (s: StoredState) => ({ gameId: s.gameId, ...(s.quick ? { quick: true } : {}) });

/**
 * The computer players move. At a hosted table they all play at once and the phones replay it; at a
 * quick-match table (lifelike seats) each one waits its own human-looking thinking time, and any phone
 * at the table asks for its move once that is up (see timeoutTurn).
 */
const botsMove = (game: GameState, seats: SeatEntry[]) => runBots(game, (s) => seats[s].isBot && !seats[s].lifelike);

/** A seat whose player has gone is handed to a computer: plainly marked at a hosted table, unnoticed at a quick match. */
const toComputer = (s: SeatEntry, quick?: boolean): SeatEntry =>
  quick
    ? { ...s, isBot: true, lifelike: true, playerId: null, awaySince: null }
    : { ...s, isBot: true, playerId: null, awaySince: null, name: `${s.name} (bot)` };

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
    if (s.isBot || !s.playerId || s.free) return [];
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
  if (!state.patti || !key || !state.gameId || seat.free) return;
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
  if (room.quick && room.status === "lobby") throw new RoomError("That table is just starting, try again in a moment", 409);
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

export async function getRoomView(rawCode: string, token: string, have?: Known): Promise<RoomView> {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const [room, players] =
    have?.room && have.players ? [have.room, have.players] : await Promise.all([loadRoom(store, code), store.listPlayers(code)]);
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

  // At a quick match nobody is told who is a computer: they're all just players.
  const quick = Boolean(room.quick || room.state?.quick);
  const tablePlayers = (seats: SeatEntry[]) =>
    seats.map(({ seat, name, isBot, avatar, awaySince }) => ({
      seat,
      name,
      isBot: isBot && !quick,
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
      isBot: isBot && !quick,
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
    quick,
    match: room.status === "lobby" && room.quick ? matchView(room, room.quick, players, me.id) : null,
    dropped: Boolean(room.status === "playing" && room.state?.seats.find((s) => s.playerId === me.id)?.dropped),
    finished:
      room.status === "playing" && !!room.state && (room.state.extra ? extraOver(room.state.extra) : !room.state.patti && room.state.game.seriesWinner != null),
  };
}

export async function chooseSeat(rawCode: string, token: string, seat: unknown) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const room = await loadRoom(store, code);
  if (room.status !== "lobby") throw new RoomError("The game has already started");
  if (room.quick) throw new RoomError("Seats at a quick match are given out for you");
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
  const { room, me } = await roomAndMe(store, code, token);
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
  const { room, me } = await roomAndMe(store, code, token);
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
    const game = botsMove(newGame(room.options), seats);
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
  if (seats[who].isBot && seats[who].lifelike) return Date.now() + dealing + humanThinkMs(p.pending ? SIDESHOW_SECONDS : PATTI_TURN_SECONDS);
  if (seats[who].isBot) return Date.now() + dealing + thinkMs(p);
  if (seats[who].dropped) return Date.now() + dealing + DROPPED_MS;
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
  const { room, me } = await roomAndMe(store, normaliseCode(rawCode), token);
  const seat = seatOf(room, me);
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
  const seats = markDropped(state.seats, seat, false);
  const deadline = sameTurn ? (state.deadline ?? null) : pattiDeadline(p, seats);
  const after = { ...state, patti: p, seats, deadline };
  await saveRoom(store, room, { state: after });
  later(() => banter(store, room.code, state, after));
}

/**
 * Anyone at the table may ask for this once the player on the move is out of time: a computer makes its
 * move; a person who went quiet packs (or refuses the sideshow they were asked for).
 */
export async function pattiTick(rawCode: string, token: string) {
  const store = await getStore();
  const { room } = await roomAndMe(store, normaliseCode(rawCode), token);
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
  // a person who went quiet: their next turns are short until their phone is back
  const seats = state.seats[who].isBot ? state.seats : markDropped(state.seats, who, true);
  try {
    const after = { ...state, patti: p, seats, deadline: pattiDeadline(p, seats) };
    await saveRoom(store, room, { state: after });
    later(() => banter(store, room.code, state, after));
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
        // at a quick match you play on for free (and cash nothing out); at a hosted table a computer sits in
        seats = seats.map((x) => (x.seat === s ? (state.quick ? { ...x, free: true } : toComputer(x)) : x));
      }
    }
    c.players[s].chips = c.rules.startChips;
  }
  try {
    await saveRoom(store, room, { state: { ...pattiStored(startDeal(c), seats), ...keep(state) } });
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
  const bot = pending.find((s) => seats[s]?.isBot);
  if (bot !== undefined && seats[bot].lifelike) return Date.now() + opening + humanThinkMs(extraTurnSeconds(e));
  if (bot !== undefined) return Date.now() + opening + extraThinkMs(e);
  if (pending.every((s) => seats[s]?.dropped)) return Date.now() + opening + DROPPED_MS;
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
  const next = { ...extraStored(after, state.seats), ...keep(state) };
  await saveRoom(store, room, { state: next });
  await payExtra(store, room, before, after, state.seats, state.gameId);
  later(() => banter(store, room.code, state, next));
}

/** A move at a Bluff, Paanch, Bhabhi or G Patta table by the player at this phone. */
export async function extraMove(rawCode: string, token: string, move: unknown) {
  return retrying(() => extraMoveOnce(rawCode, token, move));
}
async function extraMoveOnce(rawCode: string, token: string, move: unknown) {
  const store = await getStore();
  const { room, me } = await roomAndMe(store, normaliseCode(rawCode), token);
  const seat = seatOf(room, me);
  const state = room.state!;
  if (!state.extra) throw new RoomError("This table plays something else");
  let next: ExtraStored;
  try {
    next = extraApply(state.extra, seat, move);
  } catch (e) {
    if (e instanceof ExtraError) throw new RoomError(e.message);
    throw e;
  }
  await saveExtra(store, room, { ...state, seats: markDropped(state.seats, seat, false) }, state.extra, next);
}

/**
 * Anyone at the table may ask for this once whoever is on the move is out of time: a computer makes its
 * move, the table takes its own step, or a person who went quiet has one made for them.
 */
export async function extraTick(rawCode: string, token: string) {
  const store = await getStore();
  const { room } = await roomAndMe(store, normaliseCode(rawCode), token);
  const state = room.state;
  if (room.status !== "playing" || !state?.extra || extraOver(state.extra) || !state.deadline) return;
  if (Date.now() < state.deadline) return; // still thinking

  const before = state.extra;
  let next: ExtraStored | null = null;
  let seats = state.seats;
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
      // the people who went quiet: their next turns are short until their phones are back
      for (const s of pending) seats = markDropped(seats, s, true);
    }
  }
  if (!next) return;
  try {
    await saveExtra(store, room, { ...state, seats }, before, next);
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

function seatOf(room: RoomRow, me: PlayerRow): Seat {
  if (room.status !== "playing" || !room.state) throw new RoomError("The game hasn't started");
  const entry = room.state.seats.find((s) => s.playerId === me.id);
  if (!entry) throw new RoomError("You're watching this table, not playing", 403);
  return entry.seat;
}

export async function play(rawCode: string, token: string, card: unknown, auto?: unknown) {
  return retrying(() => playOnce(rawCode, token, card, auto));
}
async function playOnce(rawCode: string, token: string, card: unknown, auto?: unknown) {
  const store = await getStore();
  const { room, me } = await roomAndMe(store, normaliseCode(rawCode), token);
  const seat = seatOf(room, me);
  const state = room.state!;
  if (state.patti) throw new RoomError("This table plays 3 Patti");
  if (state.extra) throw new RoomError(`This table plays ${GAMES[state.extra.game].name}`);
  const played = playCard(state.game, seat, String(card), { auto: auto === true });
  // a card the player picked means they're here (one their phone played on time for them doesn't say so)
  const seats = auto === true ? state.seats : markDropped(state.seats, seat, false);
  const game = botsMove(played, seats);
  const after = { ...nextState(state.game, game, seats), ...keep(state) };
  await saveRoom(store, room, { state: after });
  await payRungSeries(store, room.code, state.game, game, seats, state.gameId);
  later(() => banter(store, room.code, state, after));
}

/**
 * Anyone at the table can ask for this once the player on turn is out of time (their phone may be
 * locked or offline). The server checks its own clock and plays a random legal card for them.
 */
export async function timeoutTurn(rawCode: string, token: string) {
  const store = await getStore();
  const { room } = await roomAndMe(store, normaliseCode(rawCode), token);
  const state = room.state;
  if (room.status !== "playing" || !state || state.patti || state.extra || state.game.deal.result || !state.deadline) return;
  if (Date.now() < state.deadline) return; // still thinking
  const seat = state.game.deal.turn;
  // A quick-match computer whose thinking time is up plays its own card. So does a person who went quiet:
  // the computer plays for them (their seat stays theirs, see DROPPED_MS) until their phone is back.
  const human = !state.seats[seat].isBot;
  const played = playCard(state.game, seat, chooseCard(state.game, seat), human ? { auto: true } : undefined);
  const seats = human ? markDropped(state.seats, seat, true) : state.seats;
  const game = botsMove(played, seats);
  try {
    const after = { ...nextState(state.game, game, seats), ...keep(state) };
    await saveRoom(store, room, { state: after });
    await payRungSeries(store, room.code, state.game, game, seats, state.gameId);
    later(() => banter(store, room.code, state, after));
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

export async function nextDeal(rawCode: string, token: string) {
  return retrying(() => nextDealOnce(rawCode, token));
}
async function nextDealOnce(rawCode: string, token: string) {
  const store = await getStore();
  const { room, me } = await roomAndMe(store, normaliseCode(rawCode), token);
  seatOf(room, me);
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
        // at a quick match you play on for free (and win nothing); at a hosted table a computer sits in
        seats = seats.map((x) => (x.seat === w.seat ? (state.quick ? { ...x, free: true } : toComputer(x)) : x));
      }
    }
  }
  const game = botsMove(startNextDeal(state.game), seats);
  await saveRoom(store, room, { state: { ...nextState(state.game, game, seats), ...keep(state) } });
}

/** Gives every seat whose player left more than AWAY_SECONDS ago to a computer. Safe to call by anyone, any time. */
export async function reapAway(rawCode: string, token: string) {
  const store = await getStore();
  const { room } = await roomAndMe(store, normaliseCode(rawCode), token);
  const state = room.state;
  if (room.status !== "playing" || !state) return;
  const now = Date.now();
  const due = (s: SeatEntry) => !s.isBot && !s.playerId && !!s.awaySince && now - s.awaySince >= AWAY_SECONDS * 1000;
  if (!state.seats.some(due)) return;
  const seats = state.seats.map((s) => (due(s) ? toComputer(s, state.quick) : s));
  try {
    if (state.patti) {
      await saveRoom(store, room, { state: { ...pattiStored(state.patti, seats), ...keep(state) } });
      return;
    }
    if (state.extra) {
      await saveRoom(store, room, { state: { ...extraStored(state.extra, seats), ...keep(state) } });
      return;
    }
    const game = botsMove(state.game, seats);
    await saveRoom(store, room, { state: { ...nextState(state.game, game, seats), ...keep(state) } });
    await payRungSeries(store, room.code, state.game, game, seats, state.gameId);
  } catch (e) {
    if (!(e instanceof RoomError && e.status === 409)) throw e; // someone else got there first
  }
}

export async function leaveRoom(rawCode: string, token: string) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const { room, me } = await roomAndMe(store, code, token);
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

/**
 * This player's phone is back at the table (reopened, reloaded, signal back) after the server had to move
 * for them: their seat was always theirs (held by their token), and now they get their full clock again.
 * Safe to repeat; does nothing for a player who wasn't marked as gone.
 */
export async function comeBack(rawCode: string, token: string) {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  await retrying(async () => {
    const room = await loadRoom(store, code);
    const me = await playerByToken(store, code, token);
    const state = room.state;
    if (room.status !== "playing" || !state) return;
    const mine = state.seats.find((s) => s.playerId === me.id);
    if (!mine?.dropped) return;
    const seats = markDropped(state.seats, mine.seat, false);
    // if it's their move right now, the short clock they were on starts again in full
    const onMe = state.extra
      ? extraPending(state.extra).includes(mine.seat)
      : state.patti
        ? pattiActor(state.patti) === mine.seat && !state.patti.result
        : state.game.deal.turn === mine.seat && !state.game.deal.result;
    const deadline = !onMe
      ? (state.deadline ?? null)
      : state.extra
        ? extraDeadline(state.extra, seats)
        : state.patti
          ? pattiDeadline(state.patti, seats)
          : turnDeadline(state.game, state.game, seats);
    await saveRoom(store, room, { state: { ...state, seats, deadline } });
  });
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
        ? { ...extraStored(state.extra, seats), ...keep(state) }
        : { ...nextState(state.game, state.game, seats), ...keep(state) },
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
  const { room, me } = await roomAndMe(store, code, token);

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

// ───────────── quick match ─────────────
//
// Play on a game's mode screen puts you at a quick-match table: an ordinary room the server fills for
// you. People searching for the same game (and seat count) are put at the same table, oldest first; the
// seats nobody takes are filled one by one, on a schedule fixed when the table opened, by computer players
// with ordinary names and faces who play at a person's pace (and are never labelled). The phones poll
// while it fills (pollQuick), and whichever poll finds every seat filled starts the game.
//
// No two phones can take the same seat (the store refuses it) and only one request can start the game
// (versioned write), so matching needs no lock of its own.

/** A table stops taking people this long after it opened (the last seats fill around then anyway). */
const QUICK_JOIN_MS = 26_000;
/** Every seat taken: the table waits this long before dealing, so the last arrival is seen. */
const QUICK_START_MS = 1200;
/** A phone that hasn't asked about a filling table for this long has gone. */
const QUICK_STALE_MS = 10_000;
// (how the seats fill over the ~30 s search: quickSchedule in ./personas, shared with the phone's offline search)

const quickKey = (game: GameKind, players: number) => `${game}:${players}`;

/** When the empty seats fill, one after another at a person's irregular pace, and who fills them. */
function quickArrivals(n: number, openedAt: number): QuickMeta["arrivals"] {
  return quickSchedule(n, openedAt);
}

const seatedOf = (players: PlayerRow[]) => players.filter((p) => p.seat !== null);

/**
 * Who sits where at a filling table at `now`: the people in their seats, and in the seats left, the
 * scheduled players who have "arrived" so far (never more than there are seats left).
 */
function quickSeats(room: RoomRow, quick: QuickMeta, players: PlayerRow[], now: number) {
  const seats = seatList(tableSeats(room.options));
  const people = seatedOf(players);
  const empty = seats.filter((s) => !people.some((p) => p.seat === s));
  const arrived = quick.arrivals.filter((a) => a.at <= now).length;
  const fill = quick.arrivals.slice(0, Math.min(arrived, empty.length));
  return { seats, people, empty, fill };
}

/** When the game starts (server ms): once the last empty seat is due to be filled, plus a moment. */
function quickStartAt(room: RoomRow, quick: QuickMeta, players: PlayerRow[]): number {
  const { empty } = quickSeats(room, quick, players, 0);
  const people = seatedOf(players);
  const lastPerson = Math.max(quick.openedAt, ...people.map((p) => p.created_at));
  const fullAt = empty.length === 0 ? lastPerson : Math.max(lastPerson, quick.arrivals[empty.length - 1].at);
  return fullAt + QUICK_START_MS;
}

function matchView(room: RoomRow, quick: QuickMeta, players: PlayerRow[], myId: string): MatchView {
  const now = Date.now();
  const { seats, people, empty, fill } = quickSeats(room, quick, players, now);
  const shown: MatchView["seats"] = seats.map((s) => {
    const p = people.find((x) => x.seat === s);
    if (p) return { name: p.name, avatar: p.avatar ?? avatarFor(p.name), isMe: p.id === myId };
    const i = empty.indexOf(s);
    const a = fill[i];
    return a ? { name: a.name, avatar: a.avatar, isMe: false } : null;
  });
  const startAt = quickStartAt(room, quick, players);
  const full = shown.every(Boolean);
  return { game: room.options.game ?? "rung", seats: shown, startsIn: full ? Math.max(0, startAt - now) : null };
}

/** Play: sit down at a quick-match table for this game, joining people already waiting when there are some. */
export async function joinQuick(rawGame: unknown, name: unknown, avatar?: unknown, wallet?: unknown): Promise<JoinResponse> {
  if (!tablesAvailable()) throw new RoomError("Tables aren't available on this server", 503);
  const store = await getStore();
  const game: GameKind = isGameKind(rawGame) ? rawGame : "rung";
  const players = seatsFor(game, undefined);
  const key = quickKey(game, players);
  const playerName = cleanName(name);
  const look = cleanAvatar(avatar, playerName);
  // no wallet yet, or not enough coins: you still play (for free, see startQuick)
  const walletId = walletKeyOrNull(wallet) ?? undefined;
  const now = Date.now();

  for (const room of await store.findQuickRooms(key)) {
    const quick = room.quick;
    if (!quick || now - quick.openedAt > QUICK_JOIN_MS) continue;
    const at = await store.listPlayers(room.code);
    const { empty, fill } = quickSeats(room, quick, at, now + 500);
    // a seat nobody has visibly filled yet
    if (empty.length <= fill.length) continue;
    const seat = empty[0];
    const token = randomBytes(24).toString("base64url");
    let me: PlayerRow;
    try {
      me = await store.insertPlayer({ room_code: room.code, name: playerName, seat, is_host: false, token, avatar: look, wallet: walletId });
    } catch (e) {
      if (e instanceof SeatTakenError) continue;
      throw e;
    }
    await touch(store, room.code);
    // the game may have started between our look and our seat: then this table isn't ours
    const fresh = await store.getRoom(room.code);
    if (fresh?.status === "lobby") return { code: room.code, token };
    await store.deletePlayer(room.code, me.id);
  }

  // nobody waiting: open a new table
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = newCode();
    const quick: QuickMeta = { key, openedAt: now, arrivals: quickArrivals(players - 1, now) };
    if (!(await store.insertRoom({ code, options: cleanOptions({ game, players }), quick }))) continue;
    const token = randomBytes(24).toString("base64url");
    await store.insertPlayer({ room_code: code, name: playerName, seat: 0, is_host: false, token, avatar: look, wallet: walletId });
    return { code, token };
  }
  throw new RoomError("Couldn't find a table, please try again", 500);
}

/**
 * The search screen asks about its table (every second or two): this phone is still here, phones that
 * stopped asking are dropped, and once every seat is filled the game starts. Returns this phone's view.
 */
export async function pollQuick(rawCode: string, token: string): Promise<RoomView> {
  const store = await getStore();
  const code = normaliseCode(rawCode);
  const { room, me } = await roomAndMe(store, code, token);
  if (room.status === "lobby" && room.quick) {
    await store.seePlayer(code, me.id);
    const now = Date.now();
    const players = await store.listPlayers(code);
    const gone = players.filter((p) => p.id !== me.id && now - (p.last_seen ?? p.created_at) > QUICK_STALE_MS);
    for (const p of gone) await store.deletePlayer(code, p.id);
    if (gone.length) await touch(store, code);
    const here = players.filter((p) => !gone.includes(p));
    if (now >= quickStartAt(room, room.quick, here)) {
      try {
        await retrying(() => startQuick(store, code));
      } catch (e) {
        if (!(e instanceof RoomError && e.status === 409)) throw e; // another phone is starting it
      }
    }
  }
  return getRoomView(code, token);
}

/** Deals a full quick-match table. Whoever can pay the table fee pays it; whoever can't plays for free. */
async function startQuick(store: RoomStore, code: string) {
  const room = await loadRoom(store, code);
  if (room.status !== "lobby" || !room.quick) return;
  const players = await store.listPlayers(code);
  const { seats: table, people, empty } = quickSeats(room, room.quick, players, Number.POSITIVE_INFINITY);
  const taken = people.map((p) => p.name);
  const seats: SeatEntry[] = table.map((seat) => {
    const p = people.find((x) => x.seat === seat);
    if (p) return { seat, name: p.name, isBot: false, playerId: p.id, avatar: p.avatar ?? avatarFor(p.name) };
    const a = room.quick!.arrivals[empty.indexOf(seat)];
    // (a name that happens to match a person's is swapped for another)
    const name = taken.some((t) => t.toLowerCase() === a.name.toLowerCase()) ? personaNames(1, taken)[0] : a.name;
    taken.push(name);
    return { seat, name, isBot: true, lifelike: true, playerId: null, avatar: a.avatar };
  });

  // Two phones may try to start the same table at once: they make the same game id (it names the room's
  // version), so the coin charges below happen once between them, and only one of them saves the game.
  const gameId = `q${code}-${room.quick.openedAt}-${room.version}`;
  const kind = room.options.game ?? "rung";
  const isPatti = kind === "patti";
  const extraGame = isExtraGame(kind) ? kind : null;
  const fee = feeFor(kind);
  const paid: { key: string; once: string; seat: number }[] = [];
  for (const w of walletsBySeat(seats, players)) {
    const once = isPatti ? `${gameId}:in:${w.playerId}` : extraGame ? `${gameId}:fee:${w.key}` : `${gameId}:s1:fee:${w.key}`;
    try {
      await moveCoins(w.key, -fee, feeReason(room.options), once);
      paid.push({ key: w.key, once, seat: w.seat });
    } catch (e) {
      if (!(e instanceof WalletError)) throw e;
    }
  }
  // people with no wallet, or who couldn't pay, play for nothing
  for (const s of seats) {
    if (s.isBot) continue;
    if (!paid.some((x) => x.seat === s.seat)) s.free = true;
    else if (isPatti) s.buyIns = 1;
  }

  let state: StoredState;
  if (isPatti) {
    state = { ...pattiStored(startDeal(newTable(rulesFor(TABLES[0].boot), undefined, randomInt(4) as Seat)), seats), gameId, quick: true };
  } else if (extraGame) {
    state = { ...extraStored(newExtra(extraGame, seats.length), seats), gameId, quick: true };
  } else {
    state = { ...nextState(null, botsMove(newGame(room.options), seats), seats), gameId, quick: true };
  }
  try {
    await saveRoom(store, room, { status: "playing", state });
  } catch (e) {
    // refund, unless the phone that beat us to it started this very game (with these same charges)
    const now = await store.getRoom(code);
    if (now?.state?.gameId !== gameId) {
      for (const c of paid) await moveCoins(c.key, fee, "Refund: the game didn't start", `${c.once}:refund`);
    }
    throw e;
  }
  later(() => banter(store, code, null, state));
}

// ───────────── quick match: the computer players' few words ─────────────

/** Who says what after this change at a quick-match table, if anything (before: null at the start). */
function banterFor(before: StoredState | null, after: StoredState): { seat: number; moment: BanterMoment } | null {
  const bots = after.seats.filter((s) => s.isBot && s.lifelike);
  if (!bots.length) return null;
  const any = () => bots[Math.floor(Math.random() * bots.length)].seat;
  const chance = (p: number) => Math.random() < p;
  if (!before) return chance(0.8) ? { seat: any(), moment: "hello" } : null;

  if (after.extra && before.extra) {
    if (extraOver(after.extra) && !extraOver(before.extra)) return chance(0.75) ? { seat: any(), moment: "end" } : null;
    // Bhabhi and G Patta: a computer player just got out of cards
    const placed = (e: ExtraStored, s: number) =>
      e.game === "bhabhi" ? e.state.place[s] != null : e.game === "gpatta" ? e.state.players[s]?.place != null : false;
    const out = bots.find((b) => placed(after.extra!, b.seat) && !placed(before.extra!, b.seat));
    if (out && chance(0.3)) return { seat: out.seat, moment: "win" };
    return null;
  }

  if (after.patti && before.patti) {
    const r = after.patti.result;
    if (!r || before.patti.result) return null;
    const big = r.pot >= after.patti.rules.boot * 12;
    if (!chance(big ? 0.6 : 0.15)) return null;
    const winner = bots.find((b) => r.winners.includes(b.seat as Seat));
    if (winner) return { seat: winner.seat, moment: "win" };
    // a person took it: someone else at the table reacts
    return { seat: any(), moment: chance(0.5) ? "praise" : "loss" };
  }

  if (!after.patti && !after.extra) {
    const g = after.game;
    if (g.seriesWinner != null && before.game.seriesWinner == null) return chance(0.75) ? { seat: any(), moment: "end" } : null;
    const r = g.deal.result;
    if (!r || before.game.deal.result) return null;
    if (r.winnerTeam === null || !chance(r.court ? 0.8 : 0.35)) return null;
    const seat = any();
    return { seat, moment: seat % 2 === r.winnerTeam ? "win" : chance(0.5) ? "loss" : "praise" };
  }
  return null;
}

/**
 * Now and then a computer player at a quick-match table says something, like people do: hello at the
 * start, a word after a big hand, gg at the end. Never more than one line every BANTER_GAP_MS, and a
 * failure here never gets in the way of the move that caused it.
 */
async function banter(store: RoomStore, code: string, before: StoredState | null, after: StoredState) {
  if (!after.quick) return;
  try {
    const say = banterFor(before, after);
    if (!say) return;
    const now = Date.now();
    const recent = (await store.listChat(code)).some((m) => m.playerId.startsWith("bot:") && now - m.at < BANTER_GAP_MS);
    if (recent) return;
    const who = after.seats[say.seat];
    const message: ChatMessage = {
      id: randomUUID(),
      at: now,
      playerId: `bot:${say.seat}`,
      name: who.name,
      seat: who.seat,
      ...banterLine(say.moment),
    };
    await store.addChat(code, message);
  } catch (e) {
    console.error("[baazi] banter failed", e);
  }
}
