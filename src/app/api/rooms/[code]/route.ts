import type { NextRequest } from "next/server";
import { TOKEN_HEADER, handle } from "@/lib/online/http";
import { WALLET_HEADER } from "@/lib/wallet/economy";
import { clientId, limit, readJson } from "@/lib/online/guard";
import {
  RoomError,
  chooseSeat,
  comeBack,
  extraMove,
  extraTick,
  getRoomView,
  moveThenView,
  joinRoom,
  leaveRoom,
  movePlayer,
  nextDeal,
  pattiMove,
  pattiTick,
  play,
  shufflePairs,
  startGame,
  reapAway,
  sendChat,
  timeoutTurn,
  updateOptions,
} from "@/lib/online/rooms";

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = req.headers.get(TOKEN_HEADER) ?? "";
  return handle(async () => {
    limit("view", token || clientId(req));
    return getRoomView(code, token);
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = req.headers.get(TOKEN_HEADER) ?? "";

  return handle(async () => {
    const body = await readJson(req);
    // joining is limited by address (there's no token yet); everything else by the player's token
    if (body.action === "join" || !token) limit("join", clientId(req));
    else limit("action", token);
    switch (body.action) {
      case "chat":
        return { ok: true, message: await sendChat(code, token, body as { text?: unknown; sticker?: unknown }) };
      case "join":
        return joinRoom(code, body.name, token || undefined, body.avatar, req.headers.get(WALLET_HEADER));
      case "leave":
        return leaveRoom(code, token);
    }
    // A game move: the reply's view is built from what the move read and wrote (two database trips in all).
    const game: Record<string, () => Promise<unknown>> = {
      play: () => play(code, token, body.card, body.auto),
      patti: () => pattiMove(code, token, body.move),
      // Bluff, Paanch, Bhabhi and G Patta all move through these two.
      extraMove: () => extraMove(code, token, body.move),
      extraTick: () => extraTick(code, token),
      tick: () => pattiTick(code, token),
      timeout: () => timeoutTurn(code, token),
      reap: () => reapAway(code, token),
      // back at the table after the phone went quiet (rejoining after a reload, a closed app or lost signal)
      back: () => comeBack(code, token),
      next: () => nextDeal(code, token),
    };
    const gameMove = typeof body.action === "string" && Object.hasOwn(game, body.action) ? game[body.action] : null;
    if (gameMove) return { ok: true, view: await moveThenView(code, token, gameMove) };
    switch (body.action) {
      case "seat":
        await chooseSeat(code, token, body.seat);
        break;
      case "move":
        await movePlayer(code, token, body.playerId, body.seat);
        break;
      case "shufflePairs":
        await shufflePairs(code, token);
        break;
      case "options":
        await updateOptions(code, token, body.options);
        break;
      case "start":
        await startGame(code, token);
        break;
      default:
        throw new RoomError("Unknown action");
    }
    // Send the updated table straight back, saving the phone a second round trip.
    return { ok: true, view: await getRoomView(code, token) };
  });
}
