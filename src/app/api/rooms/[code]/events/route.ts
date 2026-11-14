import { type NextRequest, connection } from "next/server";
import { normaliseCode } from "@/lib/online/rooms";
import { getStore } from "@/lib/online/store";
import { ApiError, clientId, limit } from "@/lib/online/guard";

// Serverless hosts cap how long one request may run. The stream ends itself a little earlier and the
// browser's EventSource reconnects straight away (and re-fetches, so nothing is missed).
export const maxDuration = 300;
const STREAM_MS = 280_000;

/**
 * Server-Sent Events stream for one table. Sends `update` with the room's new version whenever
 * anything changes (clients then re-fetch their own seat's view), and `chat` with each new message.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  await connection();
  const code = normaliseCode((await ctx.params).code);
  const store = await getStore();
  try {
    limit("events", clientId(req));
  } catch (e) {
    const err = e as ApiError;
    return Response.json({ error: err.message, code: 429 }, { status: 429, headers: { "Retry-After": String(err.retryAfter ?? 60) } });
  }
  // A table that's gone (e.g. the server restarted): a plain error stops the browser reconnecting
  // every second; the phone's next fetch gets the same 404 and leaves the table.
  if (!(await store.getRoom(code))) {
    return Response.json({ error: "That table doesn't exist (or the server was restarted)", code: 404 }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await store.subscribe(code, (e) =>
        send(
          e.type === "chat"
            ? `event: chat\ndata: ${JSON.stringify(e.message)}\n\n`
            : `event: update\ndata: ${JSON.stringify({ version: e.version })}\n\n`,
        ),
      );
      send("retry: 1000\n\n");
      // Comment pings keep proxies and idle connections from timing out.
      const ping = setInterval(() => send(": ping\n\n"), 20000);
      const end = setTimeout(() => cleanup(), STREAM_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        clearTimeout(end);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
