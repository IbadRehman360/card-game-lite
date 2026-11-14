import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  GAMES,
  type GameKind,
  type LedgerEntry,
  type Outcome,
  PATTI_BUYIN,
  PATTI_FEE,
  START_COINS,
  type WalletView,
  isGameKind,
  packById,
  payoutFor,
} from "./economy";

/**
 * Every phone's coins, kept by the game server (so they can't be changed from the browser) in a JSON
 * file next to the app. A phone holds a secret wallet token; the server only stores a hash of it.
 */

export class WalletError extends Error {
  constructor(
    message: string,
    public status = 400,
    /** How many more coins the player needs (for "not enough coins"). */
    public short?: number,
  ) {
    super(message);
  }
}

/** A game against the computer, paid for up front and settled when it ends. */
interface SoloSession {
  game: GameKind;
  openedAt: number;
  /** 3 Patti: how many times this session bought chips (sitting down, then each rebuy). */
  buyIns: number;
  /** 3 Patti: chips at the start of every stack, and the last count the phone reported. */
  startChips?: number;
  lastChips?: number;
}

interface Wallet {
  coins: number;
  createdAt: number;
  ledger: LedgerEntry[];
  /** Charges and payouts already made, by idempotency key (so a retry never pays or charges twice). */
  done: Record<string, number>;
  solo: Record<string, SoloSession>;
}

interface Db {
  wallets: Record<string, Wallet>;
}

const FILE = path.join(process.cwd(), ".data", "wallets.json");
const LEDGER_MAX = 40;
const DONE_TTL = 3 * 24 * 3600 * 1000;

const g = globalThis as unknown as { __haathWallets?: Db; __haathWalletTimer?: NodeJS.Timeout };

function db(): Db {
  if (g.__haathWallets) return g.__haathWallets;
  let data: Db = { wallets: {} };
  try {
    if (existsSync(FILE)) data = JSON.parse(readFileSync(FILE, "utf8")) as Db;
    if (!data || typeof data.wallets !== "object") data = { wallets: {} };
  } catch (e) {
    console.error("[last-haath] couldn't read wallets, starting empty", e);
    data = { wallets: {} };
  }
  g.__haathWallets = data;
  return data;
}

function persist() {
  if (g.__haathWalletTimer) return;
  g.__haathWalletTimer = setTimeout(() => {
    g.__haathWalletTimer = undefined;
    try {
      mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(db()));
      renameSync(tmp, FILE);
    } catch (e) {
      console.error("[last-haath] couldn't save wallets", e);
    }
  }, 150);
}

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** The key a wallet is stored under: a hash of the phone's secret token. */
export function walletKey(token: unknown): string {
  if (typeof token !== "string" || !TOKEN.test(token)) throw new WalletError("No wallet on this phone yet", 401);
  return createHash("sha256").update(token).digest("base64url");
}

/** Like walletKey, but null when the phone sent none. */
export function walletKeyOrNull(token: unknown): string | null {
  return typeof token === "string" && TOKEN.test(token) ? walletKey(token) : null;
}

function fresh(): Wallet {
  return {
    coins: START_COINS,
    createdAt: Date.now(),
    ledger: [{ at: Date.now(), amount: START_COINS, reason: "Welcome coins" }],
    done: {},
    solo: {},
  };
}

/** The wallet for this key, opened with the welcome coins the first time it is seen. */
function wallet(key: string): Wallet {
  const d = db();
  let w = d.wallets[key];
  if (!w) {
    w = d.wallets[key] = fresh();
    persist();
  }
  // forget old idempotency keys
  const now = Date.now();
  for (const [k, t] of Object.entries(w.done)) if (now - t > DONE_TTL) delete w.done[k];
  return w;
}

export function newWalletToken(): string {
  return randomBytes(24).toString("base64url");
}

function view(w: Wallet): WalletView {
  return { coins: w.coins, ledger: w.ledger.slice(0, LEDGER_MAX) };
}

export function getWallet(key: string): WalletView {
  return view(wallet(key));
}

export function balance(key: string): number {
  return wallet(key).coins;
}

function record(w: Wallet, amount: number, reason: string) {
  w.coins += amount;
  w.ledger.unshift({ at: Date.now(), amount, reason });
  if (w.ledger.length > LEDGER_MAX) w.ledger.length = LEDGER_MAX;
}

const notEnough = (need: number, have: number) =>
  new WalletError(`You need ${need} coins (you have ${have})`, 402, need - have);

/**
 * Adds (amount > 0) or takes (amount < 0) coins. With an idempotency key, doing it again is a no-op.
 * Returns false when the key was already used.
 */
export function move(key: string, amount: number, reason: string, once?: string): boolean {
  const w = wallet(key);
  if (once && w.done[once]) return false;
  amount = Math.trunc(amount);
  if (amount < 0 && w.coins + amount < 0) throw notEnough(-amount, w.coins);
  if (amount !== 0) record(w, amount, reason);
  if (once) w.done[once] = Date.now();
  persist();
  return true;
}

export interface Charge {
  key: string;
  amount: number;
  reason: string;
  once: string;
  /** For the error message when this one can't pay. */
  name: string;
}

/**
 * Charges several wallets at once: either everyone pays, or nobody does and the error names who is
 * short. Runs without awaiting, so nothing can slip in between the check and the charges.
 */
export function chargeAll(charges: Charge[]) {
  const due = charges.filter((c) => !wallet(c.key).done[c.once]);
  const short = due.filter((c) => wallet(c.key).coins < c.amount);
  if (short.length) {
    const names = short.map((c) => c.name).join(", ");
    throw new WalletError(
      short.length === 1 ? `${names} needs ${short[0].amount} coins to play` : `${names} need more coins to play`,
      402,
    );
  }
  for (const c of due) move(c.key, -c.amount, c.reason, c.once);
}

/** Demo shop: the pack's coins arrive straight away, nothing is charged. */
export function buyPack(key: string, packId: unknown, purchaseId: unknown): WalletView {
  const pack = packById(packId);
  if (!pack) throw new WalletError("That pack isn't in the shop");
  const once = typeof purchaseId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(purchaseId) ? `buy:${purchaseId}` : undefined;
  move(key, pack.coins + pack.bonus, `${pack.name} pack`, once);
  return getWallet(key);
}

// ───────────── games against the computer ─────────────

/** Ends a session the phone never closed (closed the app mid-game): Rung is lost, 3 Patti chips are cashed out. */
function closeStale(w: Wallet, id: string) {
  const s = w.solo[id];
  if (!s) return;
  delete w.solo[id];
  if (s.game === "patti" && s.startChips && s.lastChips) {
    const coins = payoutFor("patti", { chips: s.lastChips, startChips: s.startChips, buyIns: s.buyIns });
    if (coins > 0) record(w, coins, "3 Patti cash out");
  }
  persist();
}

/** Pays to start a game against the computer. Any earlier one this phone left open is settled first. */
export function openSolo(key: string, game: unknown, startChips?: unknown): { session: string; wallet: WalletView } {
  if (!isGameKind(game)) throw new WalletError("Unknown game");
  const w = wallet(key);
  for (const id of Object.keys(w.solo)) closeStale(w, id);
  const fee = GAMES[game].fee;
  if (w.coins < fee) throw notEnough(fee, w.coins);
  void startChips; // the coin table always starts you with your buy-in, whatever the phone says
  record(w, -fee, game === "patti" ? "3 Patti buy-in" : `${GAMES[game].name} game`);
  const session = randomUUID();
  w.solo[session] = {
    game,
    openedAt: Date.now(),
    buyIns: 1,
    ...(game === "patti" ? { startChips: PATTI_BUYIN, lastChips: PATTI_BUYIN } : {}),
  };
  persist();
  return { session, wallet: view(w) };
}

function session(w: Wallet, id: unknown): SoloSession {
  const s = typeof id === "string" ? w.solo[id] : undefined;
  if (!s) throw new WalletError("That game is already over", 409);
  return s;
}

/** 3 Patti against the computer: out of chips, buy back in. */
export function soloRebuy(key: string, id: unknown): WalletView {
  const w = wallet(key);
  const s = session(w, id);
  if (s.game !== "patti") throw new WalletError("Only 3 Patti has buy-ins");
  if (w.coins < PATTI_FEE) throw notEnough(PATTI_FEE, w.coins);
  record(w, -PATTI_FEE, "3 Patti buy-in");
  s.buyIns += 1;
  s.lastChips = s.startChips;
  persist();
  return view(w);
}

/** 3 Patti against the computer: your chips after a deal (cashed out if the app is closed). */
export function soloReport(key: string, id: unknown, chips: unknown): void {
  const w = wallet(key);
  const s = typeof id === "string" ? w.solo[id] : undefined;
  if (!s || s.game !== "patti") return;
  const c = Math.floor(Number(chips));
  if (Number.isFinite(c) && c >= 0) {
    s.lastChips = c;
    persist();
  }
}

/** Only the fields that game's payout reads, with the types it expects (anything else from the phone is dropped). */
function cleanOutcome(o: Record<string, unknown>): Outcome {
  const num = (v: unknown) => (typeof v === "number" || typeof v === "string") && Number.isFinite(Number(v)) ? Math.floor(Number(v)) : undefined;
  return { won: o.won === true, draw: o.draw === true, place: num(o.place), players: num(o.players), chips: num(o.chips) };
}

const PAID_REASON: Record<GameKind, string> = {
  rung: "Rung match won",
  patti: "3 Patti cash out",
  bluff: "Bluff won",
  paanch: "Paanch",
  bhabhi: "Bhabhi Thulla",
  gpatta: "G Patta",
};

/**
 * Ends a game against the computer and pays what it earned (see payoutFor). Settling twice is refused,
 * and a win claimed too soon after paying pays nothing (3 Patti chips always cash out).
 */
export function soloSettle(key: string, id: unknown, outcome: Record<string, unknown>): { paid: number; wallet: WalletView } {
  const w = wallet(key);
  const s = session(w, id);
  delete w.solo[id as string];
  const o = cleanOutcome(outcome ?? {});
  let paid = 0;
  if (s.game === "patti") {
    const chips = o.chips ?? s.lastChips;
    if (s.startChips && chips !== undefined) paid = payoutFor("patti", { chips, startChips: s.startChips, buyIns: s.buyIns });
  } else if (Date.now() - s.openedAt >= GAMES[s.game].minMs) {
    paid = payoutFor(s.game, o);
  }
  if (paid > 0) record(w, paid, PAID_REASON[s.game]);
  persist();
  return { paid, wallet: view(w) };
}
