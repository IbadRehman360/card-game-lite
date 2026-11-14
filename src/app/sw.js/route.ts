import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The service worker, written out per build. It carries the build id and the list of the app's own
 * files, so its bytes change with every build (that is how the browser notices an update), and once
 * installed it can open the game and play against the computer with no connection at all.
 *
 * - Page loads: network first, the saved copy of "/" when offline.
 * - /_next/static and public files: saved copy first (their names change when their content does).
 * - /api: always the network (coins and tables live on the server).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = process.cwd();
const PUBLIC_SKIP = /(^|\/)(\.|LICENSE)|\.(md|txt)$/i;

async function walk(dir: string, base: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const rel = `${base}/${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

let cached: { body: string; build: string } | null = null;

async function build(): Promise<string> {
  let id = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "";
  try {
    id = (await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim() || id;
  } catch {}
  if (!id) id = "dev";
  if (cached?.build === id) return cached.body;

  // Where the server can see its own build output, every script, style and font is saved up front.
  // Where it can't (some hosts serve these from a CDN), the page sends the worker what it loaded.
  const statics = (await walk(path.join(ROOT, ".next", "static"), "/_next/static")).filter((f) => !f.endsWith(".map"));
  const publics = (await walk(path.join(ROOT, "public"), "")).filter((f) => !PUBLIC_SKIP.test(f) && f !== "/sw.js");
  const precache = ["/", "/manifest.webmanifest", ...statics, ...publics];

  const body = `/* Last Haath service worker, build ${JSON.stringify(id)} */
const BUILD = ${JSON.stringify(id)};
const CACHE = "haath-" + BUILD;
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one file failing (a slow network) shouldn't stop the rest
    await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("haath-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "WARM" && Array.isArray(data.urls)) {
    // files the page loaded, saved so the next visit works offline too
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      for (const url of data.urls.slice(0, 400)) {
        try {
          const u = new URL(url, self.location.origin);
          if (u.origin !== self.location.origin || u.pathname.startsWith("/api/")) continue;
          if (!(await cache.match(u.pathname + u.search))) await cache.add(u.pathname + u.search);
        } catch {}
      }
    })());
  }
});

const isStatic = (p) => p.startsWith("/_next/static/") || /\\.(png|jpe?g|webp|svg|glb|gltf|mp3|ogg|wav|m4a|woff2?|json|webmanifest|ico)$/.test(p);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname === "/") cache.put("/", res.clone()).catch(() => {});
        return res;
      } catch {
        // offline: the game is one page, so "/" (with any ?table= or #nb= on it) opens it
        return (await cache.match("/")) || (await cache.match(req)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  if (isStatic(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return (await cache.match(url.pathname)) || Response.error();
      }
    })());
  }
});
`;
  cached = { body, build: id };
  return body;
}

export async function GET() {
  return new Response(await build(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
      "Service-Worker-Allowed": "/",
    },
  });
}
