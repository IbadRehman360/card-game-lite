# UI panels, buttons and icons

## Tokens (`src/app/globals.css`, `:root`)
`--pitch #070502` (page), `--panel #120c05`, `--slab #1d1407`, `--line rgba(240,173,58,.24)`, `--bone #fff4d6`
(text), `--dim #b8a37a` (muted text), `--gold #f0ad3a`, `--gold-hi #fbd48a`, `--gold-deep #c2711c`,
`--gold-shadow #4f2c08`, `--ink #140d02` (text on gold), `--red #e0475a`, `--warn #ff8a5c`,
`--ease-out cubic-bezier(.2,.7,.2,1)`, `--pad clamp(16px,4vw,64px)`. Always use the tokens, never a new near-duplicate.

Font: `font-family: var(--font-oswald), sans-serif;` (it's Baloo 2), bold, uppercase, `letter-spacing: .04em`
for buttons and titles.

## The house button ("painted sign board", `.home-btn` in `src/components/menu/menu.css`)
- 52 px tall, radius 16, full width in menus.
- Gold variant: `linear-gradient(180deg, var(--gold-hi), var(--gold) 50%, var(--gold-deep))`, ink text with a
  1 px light text-shadow.
- Depth from **stacked box-shadows**, no borders: inset top highlight `inset 0 2px 0 rgba(255,255,255,.3)`,
  inset bottom shade, a solid 5 px "edge" `0 5px 0 var(--edge)`, and a soft drop `0 9px 16px rgba(0,0,0,.35)`.
- Pressed: `translateY(4px)` and the edge shrinks to 1 px. 90 ms transitions. Hover (only `@media (hover:hover)`):
  `brightness(1.07)`. Focus: `outline: 3px solid var(--gold-hi); outline-offset: 3px`.

Reuse these classes where possible. A new button style should be a modifier (`.home-btn-<name>`), not a new system.

## Panels
Dark slab (`--panel`/`--slab`), a 1.5 px gold-deep (`#b8762a`) border or `--line`, radius 12–16, inner shadow
`inset 0 2px 8px rgba(0,0,0,.5)`, optional warm radial glow at the top. Content padding 14–18 px.

## Recreating a UI reference
Translate the reference into: background (gradient stops), edge (border vs shadow-block), depth (which shadows),
corner radius, type (size/weight/case/tracking), states (hover, pressed, disabled, focus). Draft it as a standalone
HTML file in the scratchpad with the tokens pasted into `:root`, render it with chrome-devtools (see verify.md),
and only then port it into the component's CSS file. Phones first: test at 390×844 and at 844×390.

## Icons
- Inline SVG, `viewBox="0 0 24 24"`, `fill="currentColor"` (or `stroke="currentColor"`, width 2, round caps/joins)
  so they take the button's colour. Size by CSS (`width: 1.1em`).
- One visual weight across the set. Simple, filled shapes read better than thin outlines on the gold buttons.
- Motifs that suit the game: suits, chips/coins, chai cup, crown (for the winner), crescent-free generic stars.
- `aria-hidden` when next to text; `role="img"` + `aria-label` when alone.
- App icons live in `public/icons/` (PNG 192/512 + maskable) and `src/app/icon.svg`; render PNGs from the SVG with
  sharp: `sharp(svgBuf, { density: 384 }).resize(512).png().toFile(...)`.
