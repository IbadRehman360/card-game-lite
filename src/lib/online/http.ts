import "server-only";
import { GameError } from "../game/engine";
import { RoomError } from "./rooms";
import { WalletError } from "../wallet/wallets";
import { ApiError } from "./guard";
import { StoreUnavailableError } from "./store";

export const TOKEN_HEADER = "x-baazi-token";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (body: Record<string, unknown>, status: number, extra?: Record<string, string>) =>
  Response.json({ ...body, code: status }, { status, headers: { ...NO_STORE, ...extra } });

/**
 * Runs a route and answers with JSON. Every failure has the same shape, `{ error, code }` (plus
 * `coins` and `short` when the player is short of coins):
 *   400 bad request or illegal move · 401 no or bad wallet · 402 not enough coins · 403 not at this table
 *   404 no such table · 409 the table changed, try again · 413 body too big · 429 too many requests
 *   500 our fault · 503 tables not available on this host
 */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof ApiError)
      return fail({ error: err.message }, err.status, err.retryAfter ? { "Retry-After": String(err.retryAfter) } : undefined);
    if (err instanceof RoomError) return fail({ error: err.message }, err.status);
    if (err instanceof WalletError) return fail({ error: err.message, coins: true, short: err.short ?? null }, err.status);
    if (err instanceof GameError) return fail({ error: err.message }, 400);
    if (err instanceof StoreUnavailableError) return fail({ error: err.message }, 503, { "Retry-After": "5" });
    console.error("[baazi] api error", err);
    return fail({ error: "Something went wrong, try again" }, 500);
  }
}
