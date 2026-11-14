import "server-only";

/**
 * Cheap protection for the API routes: a cap on request bodies and per-client rate limits, kept in
 * this server's memory (like the tables themselves). Both throw ApiError, which `handle()` turns into
 * a JSON error with the right status (413, 400, 429 with Retry-After).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** Every request this API takes is a small JSON object. */
const MAX_BODY = 16 * 1024;

/** The request's JSON body as an object; an empty or missing body is `{}`. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) throw new ApiError("That request is too big", 413);
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new ApiError("The request didn't arrive in one piece, try again", 400);
  }
  if (text.length > MAX_BODY) throw new ApiError("That request is too big", 413);
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError("That request wasn't valid JSON", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("That request wasn't valid JSON", 400);
  return body as Record<string, unknown>;
}

/** Who is asking: the first forwarded address, or one shared bucket when the host doesn't say. */
export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || req.headers.get("x-real-ip") || "local").slice(0, 64);
}

interface Bucket {
  count: number;
  reset: number;
}
const g = globalThis as unknown as { __lastHaathLimits?: Map<string, Bucket>; __lastHaathLimitSweep?: boolean };
const buckets = (g.__lastHaathLimits ??= new Map());
if (!g.__lastHaathLimitSweep) {
  g.__lastHaathLimitSweep = true;
  // forget finished windows so the map never grows without bound
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
  }, 60_000);
  (t as { unref?: () => void }).unref?.();
}

/** Allow `limit` calls per `windowMs` for this key; past that, 429 until the window ends. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) buckets.set(key, (b = { count: 0, reset: now + windowMs }));
  b.count++;
  if (b.count > limit) {
    throw new ApiError("Too many requests, wait a moment and try again", 429, Math.ceil((b.reset - now) / 1000));
  }
}

/** The limits each route uses (generous for real play, tight enough to stop a script). */
export const LIMITS = {
  /** new tables, per address */
  create: [10, 60_000],
  /** joining tables, per address */
  join: [30, 60_000],
  /** moves and lobby actions, per player token */
  action: [40, 10_000],
  /** reading the table, per player token */
  view: [60, 10_000],
  /** new wallets (each starts with free coins), per address */
  wallet: [20, 60 * 60_000],
  /** wallet reads and actions, per address */
  walletAction: [60, 60_000],
  /** live-update streams opened, per address */
  events: [30, 60_000],
} as const satisfies Record<string, readonly [number, number]>;

export function limit(kind: keyof typeof LIMITS, who: string) {
  const [n, ms] = LIMITS[kind];
  rateLimit(`${kind}:${who}`, n, ms);
}
