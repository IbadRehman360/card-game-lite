import type { TableGame } from "@/lib/game/table-games";
import { feeFor } from "@/lib/wallet/economy";

/**
 * Coins to host a table of this game. Playing the computer is free, so this is the only price the
 * menus show. The price list is shared with the server and can gain or lose a game, so this is the
 * one place that turns it into a number the coin tag can always render.
 */
export function hostFee(game: TableGame | null | undefined): number {
  const fee = Number(feeFor(game ?? undefined));
  return Number.isFinite(fee) ? fee : 0;
}

/** What the host picked before the table is made: seats and the game's own options. */
export interface HostOptions {
  players?: number;
  series?: 3 | 5;
  boot?: number;
}

/** How the player is heading to the table. */
export type Mode =
  | { kind: "practice" }
  | ({ kind: "host"; game?: TableGame } & HostOptions)
  | { kind: "join"; code: string }
  | { kind: "patti"; table: "low" | "mid" | "high" }
  | ({ kind: "solo"; game: TableGame } & HostOptions);

/** The games beyond Rung and 3 Patti, played against the computer. */
export type ExtraId = "bluff" | "paanch" | "bhabhi" | "gpatta";

export const EXTRA_IDS: ExtraId[] = ["bluff", "paanch", "bhabhi", "gpatta"];

export const isExtraId = (g: unknown): g is ExtraId => EXTRA_IDS.includes(g as ExtraId);

/** Which card game the home screen is set to. */
export type GameKind = TableGame;

/** Table codes are 3 digits, easy to read out and type on a number pad. */
export const CODE_ALPHABET = "0123456789";
export const CODE_LENGTH = 3;

export function cleanCode(v: string) {
  return v
    .split("")
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, CODE_LENGTH);
}

/** Short HUD label for the mode, shown on the select and seated screens. */
export function modeLabel(mode: Mode) {
  if (mode.kind === "practice") return "Solo vs House";
  if (mode.kind === "host") return "Hosting a table";
  if (mode.kind === "patti") return "3 Patti vs House";
  if (mode.kind === "solo") return "Solo vs House";
  return `Joining ${mode.code}`;
}
