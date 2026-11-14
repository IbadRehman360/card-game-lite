# blocker.md — Liar's Rung

Technical hurdles, constraints and their workarounds.
Status: `OPEN` = needs a decision or work, `MITIGATED` = workaround chosen, `INFO` = constraint to remember.

## Decisions for the owner (before Phase 2)

| # | Item | Status | Detail / recommendation |
|---|------|--------|-------------------------|
| D1 | Character roster | MITIGATED | Phase 2 ships the original cast below (Mungo, Corvina, Big Sal, Wart), awaiting the owner's review. Toar, Foxy, Scubby and Bristle are Liar's Bar's own characters, and its menu, character select and tavern look are its own art direction. I can't copy any of that, renamed or not. Phase 2 will be an **original** underground tavern with its own cast. Proposed cast (each drawn from scratch as SVG busts, later low-poly 3D): **Mungo** (badger, old card shark, eyepatch), **Corvina** (raven, sharp dealer in a bowler hat), **Big Sal** (walrus, retired sailor, brass buttons), **Wart** (toad, nervous bookkeeper, cracked monocle). Swap in any names or animals you prefer, as long as they aren't Liar's Bar's. |
| D2 | Old `blocker.md` in the Rung repo | MITIGATED | Deleted on 2026-11-14 at the owner's request: `G:\Work\Portfolio\rung\blocker.md` (untracked) and the empty `G:\Work\Portfolio\liars-bar\` folder, both left over from an earlier roulette-based plan. |
| D3 | Team play | INFO | Rung is a 2v2 partnership game (seats 0+2 against 1+3). At the table your partner sits **opposite** you and the two opponents sit left and right. The lobby needs to show teams. |

## Rules (taken from `rung/src/lib/game/engine.ts`, copied unchanged)

| # | Item | Status | Note |
|---|------|--------|------|
| R1 | Variant | INFO | Court Piece, "first void makes trump": 13 cards each from a balanced deal, the 2♣ opens, follow suit if you can, and the first off-suit card sets Rung (trump) for the rest of the deal. |
| R2 | Sars | INFO | Haaths (tricks) stack up in the middle. Once Rung is set, winning two counting haaths in a row collects the stack. A haath won with an Ace can't collect, except on the 13th. 7 collected haaths win the deal. Winning while the other team has none is a Court, worth 2 points. A deal where nobody reaches 7 is a tie. Series are best of 3 or best of 5. |
| R3 | No roulette | MITIGATED | There is no elimination of any kind. The tension comes from the 15-second turn clock, the sar streak indicator and the Court threat. |
| R4 | Verified | INFO | `npm run simulate` plays 3,000 all-bot deals and asserts the invariants. It passes in the new repo (about 3 ms per deal). |

## Assets

| # | Item | Status | Workaround |
|---|------|--------|------------|
| A1 | No 3D models | MITIGATED | Procedural low-poly figures built from R3F primitives with toon materials. Any GLB you supply later loads through drei's `useGLTF`. |
| A2 | No audio | MITIGATED | Synthesize with WebAudio, as Rung's `src/lib/sound.ts` does: shuffle, card slap, chip clack, plus a low tavern hum (filtered noise and a drone). Royalty-free files can replace these later. |
| A3 | Fonts | MITIGATED | `next/font/google` only (a western display face for headings and a condensed sans for UI). No licensed fonts. |

## Mobile performance

| # | Item | Status | Workaround |
|---|------|--------|------------|
| P1 | WebGL on low-end phones | OPEN (Phase 3) | Cap DPR at 1.5, no real-time shadow maps (baked blob shadows), at most 3 lights, toon/flat materials, `frameloop="demand"` when nothing is animating. Fall back to Rung's proven 2D table if WebGL context creation fails or FPS stays under about 30. |
| P2 | three + R3F + drei bundle (about 600 KB min) | MITIGATED | The Phase 2 menu is CSS/SVG only. The 3D table loads via `next/dynamic({ ssr: false })` on the game route only, and drei imports are per-module. |
| P3 | 13-card hand in first-person on a 320px-tall sideways phone | OPEN (Phase 3) | Keep the hand as a 2D DOM overlay (Rung's fan and tap-to-play) over the 3D scene, not as 3D meshes. The scene shows the table, the trick and opponents' face-down cards. Reuse Rung's `short`/`tiny` variants. |
| P4 | iOS Safari: audio needs a gesture, `100vh` jumps, no fullscreen on iPhone | MITIGATED | Unlock audio on first tap, use `dvh` and safe-area insets, add a PWA manifest for home-screen fullscreen. |
| P5 | Camera transitions vs. motion sickness | MITIGATED | Short eased moves (under 600 ms) and honour `prefers-reduced-motion` with cuts instead of moves. |

## Networking (Rung's pattern, ported)

| # | Item | Status | Workaround |
|---|------|--------|------------|
| N1 | Serverless can't hold sockets or room state | MITIGATED | Authoritative state in Supabase Postgres behind Next API routes, with versioned optimistic writes (`version` column). Realtime **broadcast** nudges clients to refetch. A memory store for dev and LAN. The migration is already in `supabase/migrations/`. |
| N2 | Hidden hands | MITIGATED | RLS on with no policies, so the browser can't read the tables. A per-seat projection (`src/lib/game/view.ts`) means each client only ever receives its own hand. |
| N3 | Client-side cheating | MITIGATED | Shuffle and deal happen on the server with crypto RNG. Moves are validated by `playCard`. |
| N4 | Disconnects / AFK | OPEN (Phase 3) | Seat token in `localStorage`. The turn deadline auto-plays a legal card, and bots fill empty or abandoned seats (`bot.ts`). |
