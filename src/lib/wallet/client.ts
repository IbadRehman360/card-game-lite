"use client";

import { useSyncExternalStore } from "react";
import { type GameKind, type LedgerEntry, type Outcome, WALLET_HEADER, type WalletView } from "./economy";

/**
 * This phone's coins, as the game server reports them. The phone keeps only a secret wallet token;
 * every balance comes from the server, and every response updates it.
 */

const TOKEN_KEY = "last-haath:wallet";

export interface WalletState {
  coins: number | null;
  ledger: LedgerEntry[];
  loading: boolean;
  error: string | null;
}

/** Not enough coins (or another wallet problem). `short`: how many more coins are needed, when known. */
export class CoinError extends Error {
  constructor(
    message: string,
    public short: number | null = null,
    public status = 400,
  ) {
    super(message);
  }
}

// ───────────── a tiny store ─────────────

let state: WalletState = { coins: null, ledger: [], loading: false, error: null };
const listeners = new Set<() => void>();
const SERVER: WalletState = { coins: null, ledger: [], loading: false, error: null };

function set(patch: Partial<WalletState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  if (state.coins === null && !state.loading) void refreshWallet();
  return () => listeners.delete(l);
}

export function useWallet(): WalletState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
}

// ───────────── the token ─────────────

let memToken: string | null = null;

/** The wallet token for room API calls (null until a wallet exists). */
export function walletToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memToken;
  } catch {
    return memToken;
  }
}
function saveToken(t: string | null) {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private window: the token lives for this visit only
  }
}

function apply(w: WalletView | undefined) {
  if (w && typeof w.coins === "number") set({ coins: w.coins, ledger: w.ledger ?? [], error: null });
}

async function call<T>(method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const token = walletToken();
  let res: Response;
  // a server that hasn't answered in 12 seconds is treated as unreachable (bad Wi-Fi can hang far longer)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    res = await fetch("/api/wallet", {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { [WALLET_HEADER]: token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new CoinError("Can't reach the game server", null, 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  clearTimeout(timer);
  if (!res.ok) {
    const short = typeof data.short === "number" ? data.short : null;
    throw new CoinError(typeof data.error === "string" ? data.error : "Something went wrong", short, res.status);
  }
  return data as T;
}

let creating: Promise<string> | null = null;

/** Makes sure this phone has a wallet (the server opens it with the welcome coins). Returns the token. */
export async function ensureWallet(): Promise<string> {
  const t = walletToken();
  if (t) return t;
  creating ??= call<{ token: string; wallet: WalletView }>("POST", { action: "create" })
    .then((r) => {
      saveToken(r.token);
      apply(r.wallet);
      return r.token;
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

/** Fetches the balance again (opening a wallet first if this phone has none). */
export async function refreshWallet(): Promise<void> {
  set({ loading: true });
  try {
    await ensureWallet();
    try {
      apply(await call<WalletView>("GET"));
    } catch (e) {
      // the server doesn't know this token (its wallet file was reset): start a new wallet
      if (e instanceof CoinError && e.status === 401) {
        saveToken(null);
        await ensureWallet();
        apply(await call<WalletView>("GET"));
      } else throw e;
    }
  } catch (e) {
    set({ error: e instanceof Error ? e.message : "Couldn't load your coins" });
  } finally {
    set({ loading: false });
  }
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Demo shop: the pack's coins arrive straight away. Returns how many coins were added. */
export async function buyPack(packId: string): Promise<number> {
  await ensureWallet();
  const before = state.coins ?? 0;
  const r = await call<{ wallet: WalletView }>("POST", { action: "buy", pack: packId, purchase: uuid() });
  apply(r.wallet);
  return Math.max(0, r.wallet.coins - before);
}

/** Pays for a game against the computer. Throws CoinError (with `short`) when there aren't enough coins. */
export async function openSolo(game: GameKind, startChips?: number): Promise<{ session: string }> {
  await ensureWallet();
  const r = await call<{ session: string; wallet: WalletView }>("POST", { action: "open", game, startChips });
  apply(r.wallet);
  return { session: r.session };
}

/** 3 Patti against the computer: buy back in after going bust. */
export async function soloRebuy(session: string): Promise<void> {
  const r = await call<{ wallet: WalletView }>("POST", { action: "rebuy", session });
  apply(r.wallet);
}

/** 3 Patti against the computer: your chips after a deal (cashed out if the app gets closed). */
export function soloReport(session: string, chips: number): void {
  void call("POST", { action: "report", session, chips }).catch(() => {});
}

/** Ends a game against the computer. Returns the coins paid out. */
export async function soloSettle(session: string, outcome: Pick<Outcome, "won" | "draw" | "place" | "players" | "chips">): Promise<{ paid: number }> {
  const r = await call<{ paid: number; wallet: WalletView }>("POST", { action: "settle", session, ...outcome });
  apply(r.wallet);
  return { paid: r.paid };
}

/** The page is closing: settle without waiting (sendBeacon can't send headers, so the token rides in the body). */
export function settleOnExit(session: string, chips?: number): void {
  const token = walletToken();
  if (!token) return;
  const body = JSON.stringify({ action: "settle", session, wallet: token, ...(chips !== undefined ? { chips } : {}) });
  try {
    if (navigator.sendBeacon?.("/api/wallet", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/wallet", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

// ───────────── the shop, open from anywhere ─────────────

export interface ShopState {
  open: boolean;
  need: number | null;
  message: string | null;
}
let shop: ShopState = { open: false, need: null, message: null };
const shopListeners = new Set<() => void>();
const SHOP_SERVER: ShopState = { open: false, need: null, message: null };

function setShop(next: ShopState) {
  shop = next;
  for (const l of shopListeners) l();
}

export function openShop(reason?: { need?: number | null; message?: string }) {
  setShop({ open: true, need: reason?.need && reason.need > 0 ? reason.need : null, message: reason?.message ?? null });
}
export function closeShop() {
  setShop({ open: false, need: null, message: null });
}
export function useShop(): ShopState {
  return useSyncExternalStore(
    (l) => {
      shopListeners.add(l);
      return () => shopListeners.delete(l);
    },
    () => shop,
    () => SHOP_SERVER,
  );
}
