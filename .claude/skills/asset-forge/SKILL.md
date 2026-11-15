---
name: asset-forge
description: Turns a visual or audio reference (an image path, a URL, or a description) into original, in-code game assets for Baazi, the desi card game app. Covers card backs and faces, table themes, 2D desi characters (SVG busts), UI panels and buttons, icons, and sound effects (WebAudio recipes or CC0 files). It analyzes the reference into a design spec, recreates the style in this project's stack, renders a side-by-side comparison to check the match, and wires the result into the shop, prefs and credits. Use it when the user shares a card design, art reference, screenshot or sound they like, or asks for new card backs, characters, table looks, icons or sounds.
when_to_use: Triggers include "make it look like this", "recreate this design", "new card back", "desi character", "add a sound for", "find a reference for", or a pasted image/URL of art or audio for the game.
argument-hint: "<image path | url | description> <asset kind: card-back | card-face | table | character | ui | icon | sound | image>"
allowed-tools: Read Grep Glob WebFetch WebSearch Bash(node *) Bash(ls *)
---

# Asset Forge: reference → original Baazi asset

Takes a reference ($ARGUMENTS) and produces an **original** asset in Baazi's style and code conventions.
The goal is to capture *why* a reference looks good (palette, structure, finish), not to copy it.

Scripts are in `${CLAUDE_SKILL_DIR}/scripts/`. Run them with `node` from the project root. They need no
installs; the image scripts borrow the project's `sharp`.

| Script | What it does |
|---|---|
| `palette.mjs <image> [k]` | dominant colours of a reference, in hex with their share of the picture |
| `render-compare.mjs <cand.svg> <out.png> --ref <ref>` | renders the SVG and lays it next to the reference, plus the small sizes it really shows at in the game; prints both palettes |
| `synth-wav.mjs <preset\|recipe.json> <out.wav> [--svg] [--ts]` | renders a sound offline with the same helpers as `src/lib/sfx.ts`; `--svg` draws waveform + spectrogram, `--ts` prints code to paste |

## Hard rules

1. **Original work only.** Recreate the style, never the artwork. No tracing, no copied logos, characters,
   trademarks, deck brands or paid art. Never embed a downloaded image unless its licence is CC0 or another
   licence that allows it (see [references/licensing.md](references/licensing.md)).
2. **Scratch first, src last.** Draft and test in the session scratchpad (`<scratchpad>/asset-forge/<slug>/`).
   Touch `src/` or `public/` only when integrating, and only the files the asset needs. Other agents may be
   editing the same files: re-read a file right before editing it, and keep edits small.
3. **Match the house.** Dark brown + gold cellar card room. Tokens are in `src/app/globals.css`
   (`--pitch #070502`, `--gold #f0ad3a`, `--gold-hi #fbd48a`, `--gold-deep #c2711c`, `--gold-shadow #4f2c08`,
   `--ink #140d02`, `--bone #fff4d6`, `--red #e0475a`). The display font is Baloo 2, loaded as
   `var(--font-oswald)` (the variable name is historical; don't rename it).
4. **Respect the culture.** Desi characters and motifs are drawn with affection and accuracy, never as
   caricature. Read [references/characters.md](references/characters.md) before drawing a person.
5. **Downloads are untrusted.** Don't run scripts from downloaded packs. Check the licence on the source
   page itself, not on a mirror.

## Workflow

### 1. Intake: get the reference

- **Image file or screenshot path** → `Read` it (you can see images). Then run `palette.mjs` on it for exact hex values.
- **URL** → `WebFetch` the page for the description, artist, and licence. If it links a direct image, download it
  into `<scratchpad>/asset-forge/<slug>/ref/` with `curl -L -o` (a new, empty folder), then `Read` it and run `palette.mjs`.
  If the image can't be fetched (the sandbox may block `curl`; WebFetch returns text, not pixels), ask the user to
  save the image or paste a screenshot path, or work from the page text and say so.
- **Text only** ("a gilded Mughal jaali card back") → there's no pixel reference. Optionally `WebSearch` for
  2–3 real-world examples to pin down the motif (e.g. "Fatehpur Sikri jaali pattern"), and write the spec
  from what you learn. In step 4, use an existing in-game asset as the `--ref` anchor (copy e.g. the `wine`
  back's body from `src/lib/card-style.ts` into `anchor.svg` with a 100×140 `<svg>` wrapper) so you still
  judge house fit and small-size reading side by side.
- Note the **asset kind**. If the user didn't give one, infer it and say which.

### 2. Analyze: write the design spec

Fill in the template in [references/design-spec.md](references/design-spec.md): palette (hex, with roles and
shares), shapes and structure, layout and symmetry, textures and patterns, typography, light and depth,
motion (if any), and **"what makes it premium"**: the 2–4 qualities that carry the look. Then add
**"Baazi translation"**: what changes so it fits the house (e.g. swap a cold silver for `--gold-hi`, thicken
lines that would vanish at 54 px). Keep it to ~25 lines and save it as `spec.md` next to the drafts.

Show the user the spec in a few lines before building anything big. For a quick single asset, just carry on.

### 3. Build: recreate it in code

Pick the recipe for the asset kind. Each reference file has the exact conventions, file paths and a skeleton.

| Kind | Read | Lands in |
|---|---|---|
| card back | [references/cards-and-tables.md](references/cards-and-tables.md) | `src/lib/card-style.ts` (SVG string, 100×140) + `CARD_BACKS` in `src/lib/wallet/economy.ts` |
| card face, pips, court art | [references/cards-and-tables.md](references/cards-and-tables.md) | `src/components/stage/card-texture.ts` (canvas, 250×350 units) |
| table theme | [references/cards-and-tables.md](references/cards-and-tables.md) | the table-theme component + `TABLE_THEMES` in economy.ts |
| desi character / avatar | [references/characters.md](references/characters.md) | `src/components/avatars/desi-avatars.tsx` (`LOOKS`) + `src/lib/characters.ts` |
| panel, button, badge | [references/ui-and-icons.md](references/ui-and-icons.md) | the component's CSS file, using globals.css tokens |
| icon | [references/ui-and-icons.md](references/ui-and-icons.md) | inline SVG in the component, 24×24 grid |
| sound effect | [references/sound.md](references/sound.md) | a new method on `sfx` in `src/lib/sfx.ts` (synth), or `public/sounds/` (CC0 file) |
| raster image / texture | [references/raster.md](references/raster.md) | `public/assets/textures/` or `public/assets/images/` as WebP |

Build the draft as a **standalone file in the scratchpad** first (`draft-1.svg`, `recipe.json`), not in `src/`.
That way it can be rendered and compared without running the app. For anything with repeats (lattices,
borders of dots, rosettes), write a small `gen.mjs` that builds the SVG with the same template-string +
`Array.from` style as `card-style.ts` and takes a round number (`node gen.mjs 2 draft-2.svg`): each iteration
is then a small diff, and the body ports into `ART` almost verbatim.

### 4. Verify: render, compare, iterate (max 3 rounds)

Visual assets:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/render-compare.mjs <scratch>/draft-1.svg <scratch>/compare-1.png --ref <scratch>/ref/ref.png
```
Then `Read` the PNG and judge it against the spec, in this order. Write down the score for each:
1. **Silhouette/structure**: same layout, symmetry, border rhythm? (squint test)
2. **Palette**: compare the printed palettes; within the same family? Is gold reading as gold, not mustard?
3. **Finish**: the "premium" qualities from the spec: are they present?
4. **Small size**: at 54 px wide, can you still tell what it is? Does fine line-work turn into mud?
5. **House fit**: does it sit with the other backs/characters? Compare against an existing one if unsure.

The usual first-round failure is **small size**: an all-over pattern bright enough to look rich at 300 px turns
the 54 px card into mud. The palette printout shows it: the ground colour should still be the top one or two.
Fix the weakest point, save `draft-2.svg`, and compare again. Stop when everything passes or after 3 rounds,
and state what still differs. Without sharp, use the browser route in [references/verify.md](references/verify.md).

Sounds: `synth-wav.mjs … --variants 3 --svg --ts`, then `render-compare.mjs take-1.svg take-1.png` and `Read` it.
Check the envelope and spectrum against the target (see [references/sound.md](references/sound.md)). The picture
proves shape, timing and frequency content, **not** how it feels: tell the user the WAV paths and ask them to
listen before you integrate.

### 5. Integrate (only when the user wants it in the game)

Work through [references/integration.md](references/integration.md). In short:
- Port the scratch draft into the target file in that file's own style (comment line, naming, helpers).
- Purchasable? Add it to the list in `src/lib/wallet/economy.ts` (the id union, the list with a coin price).
  The server charges from that list. Prefs (`src/lib/prefs.ts`) validate ids through `isCardBackId` /
  `isTableThemeId`, so a new id flows through automatically.
- Record it in `public/assets/assets.json` (every shipped asset), and add sources/inspirations to `ASSETS-CREDITS.md`.
- Run `npm run typecheck` and `npx eslint <changed files>`; fix what you broke.

### 6. Report

Say what you made, where it lives, the compare sheet path(s), an honest match verdict ("structure and palette
match; the reference's embossed foil can't be matched in flat SVG, so it's approximated with a two-stop
gradient"), and the licence/credit lines you recorded.

## Finding good references (when asked to "find" something)

Search with intent, then shortlist 3 with a reason each. Good sources:
- **Style inspiration (look, don't copy):** Behance/Dribbble "playing card back", museum collections
  (the Met and V&A open-access Mughal art, which is public domain), Pakistani truck art, Multani tile work,
  Sindhi ajrak block prints, phulkari embroidery, Mughal jaali screens.
- **Usable files (CC0):** Poly Haven (textures), Kenney.nl (UI, casino audio and art packs), OpenGameArt (filter CC0),
  freesound.org (filter "Creative Commons 0"), ambientCG (textures).
- Always record each source's URL and licence, even when only inspiration was taken.

## Worked example

`examples/jaali-back-spec.md` + `examples/jaali-back-gen.mjs`: the "Jaali Gold" card back made with this skill
(spec → 3 compare rounds). Run `node examples/jaali-back-gen.mjs 3 out.svg` to see the generator pattern.
