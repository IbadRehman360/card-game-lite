import "server-only";
import { supabaseAdmin, supabaseConfigured } from "../online/supabase";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type CardBackId,
  DEFAULT_BACK,
  DEFAULT_TABLE,
  type TableThemeId,
  type GameKind,
  type LedgerEntry,
  PATTI_BUYIN,
  START_COINS,
  type WalletView,
  cardBackById,
  isGameKind,
  tableThemeById,
  packById,
} from "./economy";

/**
 * Every phone's coins, kept by the game server (so they can't be changed from the browser): in Supabase
 * (the `wallets` table) when it is configured, else in a JSON file next to the app. A phone holds a secret wallet token; the server only stores a hash of it.
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
  /** Card backs bought with coins (older wallets have none yet; the free one is never stored). */
  backs?: CardBackId[];
  /** Table themes bought with coins (same as backs: the free one is never stored). */
  tables?: TableThemeId[];
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
    console.error("[baazi] couldn't read wallets, starting empty", e);
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
      console.error("[baazi] couldn't save wallets", e);
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

/** Drops old idempotency keys. */
function prune(w: Wallet) {
  const now = Date.now();
  for (const [k, t] of Object.entries(w.done)) if (now - t > DONE_TTL) delete w.done[k];
}

const UNAVAILABLE = "Coins are unavailable right now, try again";

/**
 * Runs `fn` on a wallet and saves what it changed. Without Supabase that is the in-memory copy (saved
 * to a file); with it, the wallet is one row written with an optimistic version check, so two serverless
 * instances can't overwrite each other (the change is re-run on a fresh copy instead).
 */
async function tx<T>(key: string, fn: (w: Wallet) => T): Promise<T> {
  if (!supabaseConfigured()) {
    const w = wallet(key);
    const out = fn(w);
    persist();
    return out;
  }
  const sb = supabaseAdmin();
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: row, error } = await sb.from("wallets").select("data, version").eq("key", key).maybeSingle();
    if (error) throw new WalletError(UNAVAILABLE, 503);
    const w: Wallet = row ? (row.data as Wallet) : fresh();
    const version = row ? (row.version as number) : 0;
    prune(w);
    const before = row ? JSON.stringify(w) : "";
    const out = fn(w);
    if (row && JSON.stringify(w) === before) return out;
    if (!row) {
      const { error: e } = await sb.from("wallets").insert({ key, data: w, version: 1 });
      if (!e) return out;
      if (e.code !== "23505") throw new WalletError(UNAVAILABLE, 503);
    } else {
      const { data: upd, error: e } = await sb
        .from("wallets")
        .update({ data: w, version: version + 1, updated_at: new Date().toISOString() })
        .eq("key", key)
        .eq("version", version)
        .select("key");
      if (e) throw new WalletError(UNAVAILABLE, 503);
      if (upd && upd.length) return out;
    }
  }
  throw new WalletError("Coins are busy, try again", 503);
}

export function newWalletToken(): string {
  return randomBytes(24).toString("base64url");
}

function ownedBacks(w: Wallet): CardBackId[] {
  return [DEFAULT_BACK, ...(w.backs ?? []).filter((b) => b !== DEFAULT_BACK && cardBackById(b))];
}

function ownedTables(w: Wallet): TableThemeId[] {
  return [DEFAULT_TABLE, ...(w.tables ?? []).filter((t) => t !== DEFAULT_TABLE && tableThemeById(t))];
}

function view(w: Wallet): WalletView {
  return { coins: w.coins, ledger: w.ledger.slice(0, LEDGER_MAX), backs: ownedBacks(w), tables: ownedTables(w) };
}

export async function getWallet(key: string): Promise<WalletView> {
  return tx(key, view);
}

export async function balance(key: string): Promise<number> {
  return tx(key, (w) => w.coins);
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
export async function move(key: string, amount: number, reason: string, once?: string): Promise<boolean> {
  return tx(key, (w) => {
    if (once && w.done[once]) return false;
    const n = Math.trunc(amount);
    if (n < 0 && w.coins + n < 0) throw notEnough(-n, w.coins);
    if (n !== 0) record(w, n, reason);
    if (once) w.done[once] = Date.now();
    return true;
  });
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
 * short. (If a charge fails part-way, the ones already taken are given back.)
 */
export async function chargeAll(charges: Charge[]) {
  const states = await Promise.all(charges.map((c) => tx(c.key, (w) => ({ done: Boolean(w.done[c.once]), coins: w.coins }))));
  const due = charges.filter((_, i) => !states[i].done);
  const short = due.filter((c) => states[charges.indexOf(c)].coins < c.amount);
  if (short.length) {
    const names = short.map((c) => c.name).join(", ");
    throw new WalletError(
      short.length === 1 ? `${names} needs ${short[0].amount} coins to play` : `${names} need more coins to play`,
      402,
    );
  }
  const taken: Charge[] = [];
  try {
    for (const c of due) {
      await move(c.key, -c.amount, c.reason, c.once);
      taken.push(c);
    }
  } catch (e) {
    for (const c of taken) {
      await tx(c.key, (w) => {
        record(w, c.amount, "Refund: the game didn't start");
        delete w.done[c.once];
      }).catch(() => {});
    }
    throw e;
  }
}

/** Demo shop: the pack's coins arrive straight away, nothing is charged. */
export async function buyPack(key: string, packId: unknown, purchaseId: unknown): Promise<WalletView> {
  const pack = packById(packId);
  if (!pack) throw new WalletError("That pack isn't in the shop");
  const once = typeof purchaseId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(purchaseId) ? `buy:${purchaseId}` : undefined;
  await move(key, pack.coins + pack.bonus, `${pack.name} pack`, once);
  return getWallet(key);
}

/**
 * Buys a card back with coins (in-game coins only, never real money). The price comes from the server's
 * own list; owning it already is a no-op, so a retried request never charges twice.
 */
export async function buyBack(key: string, backId: unknown): Promise<WalletView> {
  const back = cardBackById(backId);
  if (!back) throw new WalletError("That card back isn't in the shop");
  return tx(key, (w) => {
    if (back.price <= 0 || ownedBacks(w).includes(back.id)) return view(w);
    if (w.coins < back.price) throw notEnough(back.price, w.coins);
    record(w, -back.price, `Card back: ${back.name}`);
    w.backs = [...(w.backs ?? []), back.id];
    return view(w);
  });
}

/** Buys a table theme with coins, at the server's own price (owning it already is a no-op). */
export async function buyTable(key: string, tableId: unknown): Promise<WalletView> {
  const table = tableThemeById(tableId);
  if (!table) throw new WalletError("That table isn't in the shop");
  return tx(key, (w) => {
    if (table.price <= 0 || ownedTables(w).includes(table.id)) return view(w);
    if (w.coins < table.price) throw notEnough(table.price, w.coins);
    record(w, -table.price, `Table: ${table.name}`);
    w.tables = [...(w.tables ?? []), table.id];
    return view(w);
  });
}

// ───────────── games against the computer ─────────────

/**
 * Playing against the computer is free and pays nothing: coins are won at a table with friends (and
 * come from the welcome coins and the shop). The session below is still kept, because the game screens
 * open and settle one for every game — it just never moves a single coin, in either direction. That
 * also keeps a free 3 Patti table from turning its chips into coins over and over.
 */

/** Ends a session the phone never closed (it closed the app mid-game). Nothing is owed either way. */
function closeStale(w: Wallet, id: string) {
  delete w.solo[id];
}

/** Starts a game against the computer. Free. Any earlier one this phone left open is closed first. */
export async function openSolo(key: string, game: unknown, startChips?: unknown): Promise<{ session: string; wallet: WalletView }> {
  if (!isGameKind(game)) throw new WalletError("Unknown game");
  return tx(key, (w) => {
    for (const id of Object.keys(w.solo)) closeStale(w, id);
    void startChips; // the table always starts you with the same stack, whatever the phone says
    const session = randomUUID();
    w.solo[session] = {
      game,
      openedAt: Date.now(),
      buyIns: 1,
      ...(game === "patti" ? { startChips: PATTI_BUYIN, lastChips: PATTI_BUYIN } : {}),
    };
    return { session, wallet: view(w) };
  });
}

function session(w: Wallet, id: unknown): SoloSession {
  const s = typeof id === "string" ? w.solo[id] : undefined;
  if (!s) throw new WalletError("That game is already over", 409);
  return s;
}

/** 3 Patti against the computer: out of chips, sit down again with a fresh stack. Free. */
export async function soloRebuy(key: string, id: unknown): Promise<WalletView> {
  return tx(key, (w) => {
    const s = session(w, id);
    if (s.game !== "patti") throw new WalletError("Only 3 Patti has buy-ins");
    s.buyIns += 1;
    s.lastChips = s.startChips;
    return view(w);
  });
}

/** 3 Patti against the computer: your chips after a deal (cashed out if the app is closed). */
export async function soloReport(key: string, id: unknown, chips: unknown): Promise<void> {
  await tx(key, (w) => {
    const s = typeof id === "string" ? w.solo[id] : undefined;
    if (!s || s.game !== "patti") return;
    const c = Math.floor(Number(chips));
    if (Number.isFinite(c) && c >= 0) s.lastChips = c;
  });
}

/**
 * Ends a game against the computer. It pays nothing, however it went: a free game can't be a way of
 * making coins. The outcome the phone sends is read and thrown away, so the screens can keep sending it.
 */
export async function soloSettle(key: string, id: unknown, outcome: Record<string, unknown>): Promise<{ paid: number; wallet: WalletView }> {
  void outcome;
  return tx(key, (w) => {
    session(w, id);
    delete w.solo[id as string];
    return { paid: 0, wallet: view(w) };
  });
}
