# Cards and tables

## Card backs (`src/lib/card-style.ts`)

Each back is an **SVG string, viewBox 100 × 140** (5:7), keyed by `CardBackId` in the `ART` record. It's used as a
CSS background data: URL (`backUrl(id)`) on every face-down card; `card-style.css` paints it via `--cb-img`.

Conventions in that file (follow them):
- `<defs>` ids are short (`g` for the ground gradient, `p` for the pattern). The backs are never on the page
  together as inline SVG (each one is its own data: URL), so short ids don't clash.
- A comment line above each entry says what it is in plain words: `// black and gold, art-deco sunbursts`.
- Use the `frame(stroke, inset, rx, width)` helper for border lines.
- Generate repeats with `Array.from({ length: n }, …).join("")` inside the template string.
- Ground: a radial or linear gradient, not a flat fill. Pattern area: `x=6 y=6 w=88 h=128 rx=7`.
- Keep it light: aim for **< 6 KB** of SVG; it's URL-encoded into CSS. No `<image>`, no external fonts,
  no `filter` (it's costly on phones and renders differently across browsers). `<text>` only with
  `font-family="sans-serif"` (data-URL SVG can't see the page's web fonts).

Legibility: backs show at **~54–80 px wide** in the hand and on the table. Lines under ~0.8 units vanish; detail
finer than ~3 units turns to texture. Design a strong centre and border that read at 54 px, and let fine lattice
work be texture.

Lessons from testing (Jaali Gold back, 3 rounds):
- An all-over gold lattice at full opacity, tile 11, swamped the wine ground at 54 px (it read as brown). Tile **≥ 14
  units**, line ~0.8, the pattern group at **opacity ~0.5**, plus a vignette, fixed it.
- Corner ornaments: **clip them to the field** (`<clipPath>` of the inner frame rect) and keep them small. A big
  star centred on the corner floods the corner with gold.
- The focal shape must keep its **defining silhouette** at 54 px: a Mughal arch needs a pointed ogee apex
  (a `Q` curve to a point), not one more round cusp, or it reads as a cloud.
- Budget check: the final draft body was 7.5 KB; inline repeats with `Array.from` and keep the coordinates to 2 decimals.

### Skeleton (draft it as a standalone file in the scratchpad)
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" width="300" height="420">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#…"/><stop offset="1" stop-color="#…"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbd48a"/><stop offset=".5" stop-color="#d6a450"/><stop offset="1" stop-color="#8a5a1c"/></linearGradient>
    <pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse">…</pattern>
  </defs>
  <rect width="100" height="140" fill="url(#g)"/>
  <rect x="6" y="6" width="88" height="128" rx="7" fill="url(#p)"/>
  <!-- borders, corner pieces, centre medallion -->
</svg>
```
When porting, drop the outer `<svg>` (and its `width`/`height`): `backSvg()` adds its own wrapper.

### Faking a premium finish in flat SVG
- **Gold leaf:** a vertical 3-stop gradient (`#fbd48a → #d6a450/#e8b04a → #8a5a1c`) plus a 0.4-unit `#fff4d6`
  highlight line on the top edge of key shapes and a dark under-line (`#3a2408`, 0.6 units, offset +0.6 y).
- **Emboss:** draw the shape twice: dark copy offset (+0.6, +0.8), light copy offset (−0.4, −0.4), the real fill on top.
- **Jaali (pierced screen):** a pattern tile of interlocking 8-point stars or hexagons drawn as gold *lines* on a
  dark ground; the "holes" are the dark ground showing through. Use `patternTransform` for rotation.
- **Vignette:** a radialGradient overlay from transparent at 60% to `#000` at 35% opacity.
- **Paper/foil grain:** usually skip it. At 54 px it's invisible and it costs bytes.

## Card faces (`src/components/stage/card-texture.ts`)

Faces are drawn on a **canvas** by `paintCard()`: a 250 × 350 unit card (×1.3 = 325 × 455 px), suits as vector
paths (`SUIT_PATH`, 100-unit boxes), pip layouts in `PIPS`, court portraits from `public/cards/court-*.svg`
(Byron Knoll's public-domain deck). The same canvas texture is used for the hand (`CardFace` in
`src/components/game/playing-card.tsx`) and the 3D table.
- Colours: `FACE_INK #151515`, `FACE_RED #b00f07`, four-colour mode blue `#1452b8` / green `#13753a`.
- A face redesign means changing canvas drawing calls, so draft it as an SVG at 250 × 350 first, compare, then
  translate to `ctx.fill(new Path2D(d))` calls.
- Keep indexes (rank + suit in the corners) big and high-contrast; that's the gameplay-critical part.

## Table themes

Ids, names and prices live in `TABLE_THEMES` in `src/lib/wallet/economy.ts`. The look of each one lives in the
table-theme component in `src/components/stage/` (check `economy.ts`'s doc comment for the current file name,
and grep `TableThemeId` to find every place that switches on it). Shared textures are in `public/assets/textures/`
(CC0 from Poly Haven, listed in `public/assets/assets.json`).

A table theme spec has four parts: **felt** (colour + texture + vignette), **rail/rim** (wood or material, highlight),
**centre motif** (optional, low-contrast so cards stay readable), and **light** (lamp pool colour). Cards must stay
readable on it: check contrast of the red pips and the default wine back against the felt.
