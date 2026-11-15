# Licensing guardrails

## The line between inspiration and copying
- **OK:** taking a palette, a mood, a composition idea ("centre medallion, double border"), a general motif from a
  shared tradition (jaali, ajrak, truck art, art deco), a technique (foil effect, halftone).
- **Not OK:** tracing or path-copying an artwork; reproducing a recognisable specific design (a named deck's back,
  e.g. Bicycle's "Rider Back", or a specific artist's piece) one-to-one; logos, brand marks, mascots, trademarked
  names; fan art of franchise characters; AI images "in the style of" a living artist by name.
- **Test:** if someone put the two side by side, would they say "same design" or "same vibe"? Aim for vibe.
  Change at least the composition **and** the motif details, and redraw everything from scratch in our own units.

## Files you can ship
| Licence | Ship it? | Obligation |
|---|---|---|
| CC0 / public domain | yes | none (credit anyway) |
| CC-BY 3.0/4.0 | yes | credit author + licence + link in ASSETS-CREDITS.md and the in-game credits if there are any |
| CC-BY-SA | avoid | share-alike can reach the derived asset; ask the user first |
| CC-BY-NC / "free for personal use" | **no** | the game sells coins, so it's commercial |
| "royalty free" from a store | only with the user's purchase/licence in hand | ask the user |
| unknown / no licence stated | **no** | treat as all rights reserved |

Check the licence on the **original** page (the author's upload), not a re-host. Save the URL and the date.

## Recording
1. `public/assets/assets.json`: the machine-readable registry of every shipped asset (existing convention:
   `id, path, use, size?, source?, author, license`; synth sounds use `kind: "synth"`, path `src/lib/sfx.ts#name`).
2. `ASSETS-CREDITS.md` at the repo root: the human-readable credits and the **inspiration log**. Create it if
   missing with this layout:

```markdown
# Asset credits

## Third-party files
| Asset | File | Author | Source | Licence |
|---|---|---|---|---|
| Velour felt | public/assets/textures/felt-velour.webp | Colormass, Rico Cilliers | https://polyhaven.com/a/velour_velvet | CC0-1.0 |

## Original work and its inspirations
| Asset | Where | Inspired by (look only, nothing copied) | Date |
|---|---|---|---|
| Jaali Gold card back | src/lib/card-style.ts#jaali | Mughal jaali screens (Fatehpur Sikri, public monuments) | 2026-11-15 |
```
