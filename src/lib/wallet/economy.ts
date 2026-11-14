/**
 * Coins: what every game costs, what it pays, and the coin packs in the shop. Shared by the server
 * (which keeps the real balances) and the phones (which show prices and lock what you can't afford).
 */

export const START_COINS = 1000;

/** A match of Rung (one series) costs this to sit down to... */
export const RUNG_FEE = 10;
/** ...and each player on the winning side gets this back. */
export const RUNG_WIN = 20;

/**
 * 3 Patti is played with coins: sitting down (or buying back in after going bust) puts this many coins
 * from your wallet on the table, and whatever you have in front of you goes back to the wallet when you leave.
 */
export const PATTI_BUYIN = 50;
/** The price shown for 3 Patti (the same as the buy-in). */
export const PATTI_FEE = PATTI_BUYIN;
/** Coins back from what is in front of you (1:1 at the coin table, where you start with PATTI_BUYIN). */
export function pattiCashOut(chips: number, startChips: number): number {
  if (!(chips > 0) || !(startChips > 0)) return 0;
  return Math.floor((chips * PATTI_BUYIN) / startChips);
}
/** Most coins one buy-in can turn into (there are four buy-ins at a table). */
export const PATTI_MAX_PER_BUYIN = PATTI_BUYIN * 4;

export type GameKind = "rung" | "patti" | "bluff" | "paanch" | "bhabhi" | "gpatta";

/** How a finished game against the computer went (the parts that matter for each game). */
export interface Outcome {
  /** Rung, Bluff, Paanch: your side won. */
  won?: boolean;
  /** Paanch: nobody made the sequences (the board filled up). */
  draw?: boolean;
  /** Bhabhi, G Patta: the order you got out in (1 = first out); the last one is the loser. */
  place?: number;
  /** Bhabhi, G Patta: how many played. */
  players?: number;
  /** 3 Patti: coins you leave with, the starting stack, and how many buy-ins. */
  chips?: number;
  startChips?: number;
  buyIns?: number;
}

export interface GameCoins {
  id: GameKind;
  name: string;
  fee: number;
  /** One line for the price list. */
  pays: string;
  /** A win claimed sooner than this after paying isn't believed (pays nothing). */
  minMs: number;
}

export const BLUFF_FEE = 10;
export const BLUFF_WIN = 30;
export const PAANCH_FEE = 10;
export const PAANCH_WIN = 20;
export const BHABHI_FEE = 5;
export const GPATTA_FEE = 5;

export const GAMES: Record<GameKind, GameCoins> = {
  rung: { id: "rung", name: "Rung", fee: RUNG_FEE, pays: `Win the match: +${RUNG_WIN}`, minMs: 45_000 },
  patti: { id: "patti", name: "3 Patti", fee: PATTI_FEE, pays: `Leave with what you win (up to ${PATTI_MAX_PER_BUYIN} per buy-in)`, minMs: 0 },
  bluff: { id: "bluff", name: "Bluff", fee: BLUFF_FEE, pays: `Last one standing: +${BLUFF_WIN}`, minMs: 30_000 },
  paanch: { id: "paanch", name: "Paanch", fee: PAANCH_FEE, pays: `Win: +${PAANCH_WIN} · draw: +${PAANCH_FEE} back`, minMs: 40_000 },
  bhabhi: { id: "bhabhi", name: "Bhabhi Thulla", fee: BHABHI_FEE, pays: `Out first: +${BHABHI_FEE * 2}, less for later · Bhabhi: 0`, minMs: 30_000 },
  gpatta: { id: "gpatta", name: "G Patta", fee: GPATTA_FEE, pays: `Out first: +${GPATTA_FEE * 2}, less for later · G: 0`, minMs: 20_000 },
};

export const isGameKind = (g: unknown): g is GameKind => typeof g === "string" && Object.prototype.hasOwnProperty.call(GAMES, g);

export const feeFor = (game: GameKind | undefined) => GAMES[game ?? "rung"]?.fee ?? RUNG_FEE;

/**
 * Placement games (one loser): getting out in place p of n pays 2·fee·(n−p)/(n−1), rounded down.
 * First out doubles the fee, the loser gets nothing, and on average it pays back a little under the fee.
 */
function placePay(fee: number, place: unknown, players: unknown): number {
  const n = Math.floor(Number(players));
  const p = Math.floor(Number(place));
  if (!(n >= 2 && n <= 6) || !(p >= 1 && p <= n)) return 0;
  return Math.floor((2 * fee * (n - p)) / (n - 1));
}

/** Coins a finished game against the computer pays (the server uses this too, so the screen's "+N" is right). */
export function payoutFor(game: GameKind, o: Outcome): number {
  switch (game) {
    case "rung":
      return o.won === true ? RUNG_WIN : 0;
    case "bluff":
      return o.won === true ? BLUFF_WIN : 0;
    case "paanch":
      return o.won === true ? PAANCH_WIN : o.draw === true ? PAANCH_FEE : 0;
    case "bhabhi":
      return placePay(BHABHI_FEE, o.place, o.players);
    case "gpatta":
      return placePay(GPATTA_FEE, o.place, o.players);
    case "patti": {
      const chips = Math.floor(Number(o.chips));
      const start = Math.floor(Number(o.startChips));
      const buyIns = Math.max(1, Math.floor(Number(o.buyIns) || 1));
      return Math.min(pattiCashOut(chips, start), PATTI_MAX_PER_BUYIN * buyIns);
    }
    default:
      return 0;
  }
}

export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  /** Extra coins on top, shown on a ribbon. */
  bonus: number;
  /** Shown on the button. Demo shop: nothing is charged. */
  price: string;
  /** Which picture: coins/<art>.svg */
  art: "handful" | "pouch" | "stack" | "sack" | "chest" | "vault";
  tag?: "popular" | "best";
}

export const PACKS: CoinPack[] = [
  { id: "pouch", name: "Pouch", coins: 30, bonus: 0, price: "Rs 10", art: "pouch" },
  { id: "sack", name: "Sack", coins: 75, bonus: 0, price: "Rs 20", art: "sack" },
  { id: "chest", name: "Chest", coins: 200, bonus: 0, price: "Rs 50", art: "chest", tag: "best" },
  { id: "treasure", name: "Treasure", coins: 500, bonus: 0, price: "Rs 99", art: "vault" },
];

export const packById = (id: unknown) => PACKS.find((p) => p.id === id) ?? null;

/** One line in the wallet's history. */
export interface LedgerEntry {
  at: number;
  /** Positive: coins in. Negative: coins out. */
  amount: number;
  reason: string;
}

export interface WalletView {
  coins: number;
  ledger: LedgerEntry[];
}

export const WALLET_HEADER = "x-baazi-wallet";
