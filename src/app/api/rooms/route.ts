import { handle } from "@/lib/online/http";
import { clientId, limit, readJson } from "@/lib/online/guard";
import { createRoom } from "@/lib/online/rooms";
import { WALLET_HEADER } from "@/lib/wallet/economy";

export async function POST(req: Request) {
  return handle(async () => {
    limit("create", clientId(req));
    const body = await readJson(req);
    return createRoom(body.name, body.options, body.avatar, req.headers.get(WALLET_HEADER));
  });
}
