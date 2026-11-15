# Verification without running the app

## Default: sharp (no browser)
```bash
node ${CLAUDE_SKILL_DIR}/scripts/render-compare.mjs draft.svg compare.png --ref ref.png [--height 560] [--small 54,80]
```
Output: one PNG with REFERENCE | CANDIDATE | small in-game sizes, plus both palettes in the terminal. `Read` the PNG.
Without `--ref`, it just renders the SVG (use an existing in-game asset as the anchor: e.g. render the current
`noir` back next to the new one so the set stays consistent).

sharp uses librsvg: it handles gradients, patterns, transforms, clip paths and basic text. It **doesn't** apply
CSS from the page, web fonts, or `<foreignObject>`. For those, use the browser.

## Fallback / CSS and HTML assets: chrome-devtools MCP
For UI panels, buttons, anything needing CSS or the real font:
1. Write `preview.html` in the scratchpad: the tokens from `globals.css` pasted into `:root`, Baloo 2 from Google Fonts
   (`<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=swap">`, set
   `--font-oswald: 'Baloo 2'`), the candidate, and the reference `<img>` side by side.
2. `new_page` with `url: file:///C:/…/preview.html` and `isolatedContext: "asset-forge"` (your own page, so you never
   touch the user's tabs), `resize_page` to 1200×800 (and 390×844 for phone), `take_screenshot` with `filePath` in
   the scratchpad, then `Read` it. `close_page` when done.
3. Don't open the running app for this; one standalone page is enough.

## Judging (write the scores down)
| Criterion | Pass when |
|---|---|
| Structure | same layout, symmetry and border rhythm as the spec |
| Palette | top colours within the same family; gold has highlight + shadow |
| Finish | each "what makes it premium" bullet is visibly present |
| Small size | recognisable at 54 px (backs) / 40 px (avatars) / 20 px (icons) |
| House fit | sits with the existing set; no colour or weight that sticks out |
| Originality | reads as "same vibe", not "same design" |

Iterate on the weakest criterion only, at most 3 rounds, then report what still differs.
