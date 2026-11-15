import { TOKEN_HEADER, handle } from "@/lib/online/http";
import { clientId, limit, readJson } from "@/lib/online/guard";
import { RoomError, joinQuick, leaveRoom, pollQuick } from "@/lib/online/rooms";
import { WALLET_HEADER } from "@/lib/wallet/economy";

/**
 * Quick match (Play on a game's mode screen):
 *   { action: "join", game, name, avatar }  → { code, token }: a seat at a table for that game
 *   { action: "poll", code }  (token header) → { view }: still here; starts the game once the table is full
 *   { action: "cancel", code } (token header) → stop searching
 */
export async function POST(req: Request) {
  const token = req.headers.get(TOKEN_HEADER) ?? "";
  return handle(async () => {
    const body = await readJson(req);
    const code = typeof body.code === "string" ? body.code : "";
    switch (body.action) {
      case "join":
        limit("join", clientId(req));
        return joinQuick(body.game, body.name, body.avatar, req.headers.get(WALLET_HEADER));
      case "poll":
        limit("view", token || clientId(req));
        return { ok: true, view: await pollQuick(code, token) };
      case "cancel":
        limit("action", token || clientId(req));
        await leaveRoom(code, token);
        return { ok: true };
      default:
        throw new RoomError("Unknown action");
    }
  });
}
