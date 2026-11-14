import type { NextRequest } from "next/server";
import { TOKEN_HEADER, handle } from "@/lib/online/http";
import { WALLET_HEADER } from "@/lib/wallet/economy";
import { clientId, limit, readJson } from "@/lib/online/guard";
import {
  RoomError,
  chooseSeat,
  extraMove,
  extraTick,
  getRoomView,
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
      case "play":
        await play(code, token, body.card, body.auto);
        break;
      case "patti":
        await pattiMove(code, token, body.move);
        break;
      // Bluff, Paanch, Bhabhi and G Patta all move through these two.
      case "extraMove":
        await extraMove(code, token, body.move);
        break;
      case "extraTick":
        await extraTick(code, token);
        break;
      case "tick":
        await pattiTick(code, token);
        break;
      case "timeout":
        await timeoutTurn(code, token);
        break;
      case "reap":
        await reapAway(code, token);
        break;
      case "next":
        await nextDeal(code, token);
        break;
      default:
        throw new RoomError("Unknown action");
    }
    // Send the updated table straight back, saving the phone a second round trip.
    return { ok: true, view: await getRoomView(code, token) };
  });
}
