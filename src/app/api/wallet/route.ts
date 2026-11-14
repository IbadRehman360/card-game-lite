import type { NextRequest } from "next/server";
import { handle } from "@/lib/online/http";
import { clientId, limit, readJson } from "@/lib/online/guard";
import { WALLET_HEADER } from "@/lib/wallet/economy";
import {
  WalletError,
  buyPack,
  getWallet,
  newWalletToken,
  openSolo,
  soloRebuy,
  soloReport,
  soloSettle,
  walletKey,
} from "@/lib/wallet/wallets";

export async function GET(req: NextRequest) {
  return handle(async () => {
    limit("walletAction", clientId(req));
    return getWallet(walletKey(req.headers.get(WALLET_HEADER)));
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const who = clientId(req);
    const body = await readJson(req);
    // a new wallet comes with free coins: only a few per address
    if (body.action === "create") {
      limit("wallet", who);
      const token = newWalletToken();
      return { token, wallet: getWallet(walletKey(token)) };
    }
    limit("walletAction", who);
    const key = walletKey(req.headers.get(WALLET_HEADER) ?? body.wallet);
    switch (body.action) {
      case "buy":
        return { wallet: buyPack(key, body.pack, body.purchase) };
      case "open":
        return openSolo(key, body.game, body.startChips);
      case "rebuy":
        return { wallet: soloRebuy(key, body.session) };
      case "report":
        soloReport(key, body.session, body.chips);
        return { ok: true };
      case "settle":
        return soloSettle(key, body.session, { won: body.won, draw: body.draw, place: body.place, players: body.players, chips: body.chips });
      default:
        throw new WalletError("Unknown action");
    }
  });
}
