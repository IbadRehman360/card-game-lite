/**
 * The online table this phone is sitting at, remembered across reloads, closed apps and lost signal so
 * the player can go back to the same seat. The seat is held on the server by the player's token (the
 * same one every request sends); this only remembers which table and token to come back with.
 * Browser only.
 */

const KEY = "baazi:active";

/** A quick table (or a reload) left this recently is rejoined without asking. */
export const AUTO_REJOIN_MS = 90_000;

export interface ActiveTable {
  code: string;
  token: string;
  /** Which game it plays (lib/game/table-games), for the "Your Rung game is still going" line. */
  game: string;
  quick: boolean;
  /** When this phone last had the table open (ms). */
  at: number;
}

export function readActive(): ActiveTable | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<ActiveTable>;
    if (typeof t.code !== "string" || typeof t.token !== "string" || !t.code || !t.token) return null;
    return { code: t.code, token: t.token, game: typeof t.game === "string" ? t.game : "rung", quick: t.quick === true, at: Number(t.at) || 0 };
  } catch {
    return null;
  }
}

export function saveActive(t: Omit<ActiveTable, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...t, at: Date.now() }));
  } catch {}
}

/** Forget the table (only that one, when a code is given: another tab may have moved on to a new one). */
export function clearActive(code?: string) {
  try {
    if (code && readActive()?.code !== code) return;
    localStorage.removeItem(KEY);
  } catch {}
}
