import type { NextRequest } from "next/server";
import { TOKEN_HEADER, handle } from "@/lib/online/http";
import { clientId, limit } from "@/lib/online/guard";
import { listChat } from "@/lib/online/rooms";

/** The table's recent chat, for a phone that has just joined or reconnected. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const token = req.headers.get(TOKEN_HEADER) ?? "";
  return handle(async () => {
    limit("view", token || clientId(req));
    return { messages: await listChat(code, token) };
  });
}
