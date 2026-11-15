# Design spec template

Fill this in from the reference before writing any code. Be concrete: hex values, counts, ratios and
stroke widths, not adjectives. Save it as `spec.md` next to the drafts.

```markdown
# <asset name>: spec
Reference: <path or URL> · Licence of reference: <CC0 / all rights reserved / unknown> · Kind: <card-back…>

## Palette (from palette.mjs + eye)
| role | hex | share | note |
|---|---|---|---|
| ground | #4a0f16 | 55% | deep, slightly warm; vignette to #2a070c at the edges |
| primary ornament | #d6a450 | 20% | "gold" = a 3-stop gradient #fbd48a → #d6a450 → #8a5a1c |
| accent | #1f6b5a | 4% | small jewels only |
| line/ink | #1a0d05 | — | 0.6–1 unit lines |

## Structure
- Layout: <centre medallion + 4 corner pieces + double border>; symmetry: <4-fold / mirror / none>
- Border: <outer 1.6 unit line at inset 6, inner 0.7 at inset 9.5, rx 7>
- Motif: <8-point star lattice, ~9 repeats across>; scale relative to the card width
- Negative space: <how much ground shows; where the eye rests>

## Texture & finish
- <foil sheen, grain, halftone, paper speckle, embossing> → how to fake it: <gradient, pattern, filter, none>

## Typography (if any)
- <none / numerals / a word>; Baazi uses Baloo 2 via var(--font-oswald) for display.

## Light & depth
- <light from top-left; bevel on the medallion; drop shadow 0 2 0 #000 at 40%>

## Motion (UI/characters only)
- <hover lift 2px, 90 ms; idle bob 3 s>, respect `reduceMotion` in prefs

## What makes it premium (2–4 bullets: the things that carry the look)
- e.g. gold has real highlights and shadows, not a flat yellow
- e.g. a tight, even rhythm in the lattice; nothing is approximate
- e.g. restraint: two colours + gold, lots of calm ground

## Baazi translation
- What changes to fit the house: palette shifts, line weights for 54 px, motifs swapped for desi ones,
  anything removed because it's someone's trademark or signature element.
```

## How to analyze a reference (checklist)

- **Squint first.** Blur your eyes (or look at the 54 px tile): what's the big shape? A medallion, a band, an all-over lattice?
- **Count.** Repeats across, number of border lines, petals, points on a star. Counts make recreation exact.
- **Measure in card units.** Express everything in the target's coordinate system (card back: 100×140; avatar:
  100×100; card face: 250×350) so the spec can be typed straight into SVG.
- **Gold is never one colour.** Note the highlight, mid and shadow tones separately.
- **Name the finish honestly.** Foil, emboss, letterpress, glitter: flat SVG can only approximate these. Pick the
  cheapest believable fake (gradient + a thin highlight line + a dark under-line) and write it down.
- **Spot the borrowed parts.** Logos, brand marks, a named artist's signature character, a specific deck's court
  art: list them so they are left out.
