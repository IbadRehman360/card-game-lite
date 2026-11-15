# Integration checklist

Do this only once the user wants the asset in the game. Re-read each file right before editing it: other people
or agents may have changed it since you looked.

## Card back (purchasable)
- [ ] `src/lib/wallet/economy.ts`: add the id to the `CardBackId` union and a `{ id, name, price }` entry to
      `CARD_BACKS` (shop order; prices so far 300–1500 coins; premium art 1200–2500).
- [ ] `src/lib/card-style.ts`: add the `ART[id]` entry (a comment line + the SVG body without the `<svg>` wrapper).
- [ ] Prefs need nothing: `cardBack` is validated through `isCardBackId`, and `useCardBack()` falls back to the free
      back if it's not owned.
- [ ] Server: the wallet API charges from `CARD_BACKS`; grep `CARD_BACKS\|cardBackById` in `src/app/api` and
      `src/lib/wallet` to confirm nothing else lists ids by hand (e.g. a Supabase check constraint in
      `supabase/migrations`).
- [ ] Shop: `src/components/shop/card-style.tsx` renders from the list; check it shows the new back.

## Table theme (purchasable)
- [ ] `TableThemeId` + `TABLE_THEMES` in economy.ts; the look in the table-theme component (grep `TableThemeId`
      to find every switch on it).

## Character
- [ ] `src/lib/characters.ts`: new id, name, accent colour, any blurb fields the type requires.
- [ ] `src/components/avatars/desi-avatars.tsx`: `LOOKS[id]`. TypeScript will flag any `Record<CharacterId, …>` that
      now misses the id (e.g. 3D figure mapping, persona lists in `src/lib/online/personas.ts`): fill them all.

## Sound
- [ ] New method in the `sfx` object in `src/lib/sfx.ts` (with a one-line `/** … */` comment), called where the
      action happens. CC0 file → `public/sounds/` + the sample helper (see sound.md).

## UI / icon
- [ ] CSS in the component's own CSS file using globals.css tokens; check phone portrait and landscape.

## Always
- [ ] `public/assets/assets.json` entry; `ASSETS-CREDITS.md` line (source/inspiration + licence).
- [ ] `npm run typecheck`
- [ ] `npx eslint <changed files>`
- [ ] Respect `reduceMotion` for any animation (prefs), and `muted` for sound (automatic on the bus).
- [ ] Don't commit unless the user asks.
