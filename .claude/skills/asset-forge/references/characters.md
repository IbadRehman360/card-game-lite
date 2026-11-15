# 2D desi characters

## The house style (`src/components/avatars/`)

`avatar.tsx` draws a round bust in a **100 × 100 viewBox**: the character's `accent` (from `src/lib/characters.ts`)
as the background, a shared head and shoulders, and each character's parts from `LOOKS` in `desi-avatars.tsx`.
- **Flat vector, bold rounded ink outline:** everything inside one `<g stroke={INK} strokeWidth="2.4"
  strokeLinejoin="round" strokeLinecap="round">`. `INK = #2b160e` (warm brown-black, never pure black).
- **Shared head:** face ellipse `cx 50 cy 46 rx 19 ry 21`, ears at y 49, neck 43–57, shoulders
  `M12 102c0-18 14-30 38-30s38 12 38 30z`. Eyes at (43,48) and (57,48), nose at 50,49–55, mouth around y 59.
- **Layers** (`Look`): `back` (long hair, dupatta behind), `shirt` colour, `outfit` (waistcoat, collar),
  `eyes`, `brows`, `mouth`, `face` (glasses, moustache, beard, bindi), `top` (hair + headwear), `prop`.
- **Palette:** warm skins (`#a8693f`, `#c98d5e`, `#dba57a`, and more); the table's wine and gold
  (`GOLD #e8b04a`, `GOLD_DK #b8762a`, `CREAM #f4ecd8`, `RED #c0392b`); one bright accent per character.
- **Cheeks:** two soft `#e05a4a` circles at 28% opacity. Highlights: small white circles in the eyes.
- Characters are **friendly caricature**, not realism: big readable shapes, one strong idea each.

New character = a new `CharacterId` in `src/lib/characters.ts` (with name, accent, blurb) + a `LOOKS` entry.
Draft it in the scratchpad as a plain SVG (copy the shared head paths from `avatar.tsx` into it), compare at
**200 px and 40 px** (avatars show as small as ~36 px in chat and seats), then port to JSX.

## Design method (adapted from omer-metin/skills-for-antigravity `character-design`, Apache-2.0)

1. **Three reads, in order:** silhouette → colour → detail. At 40 px a viewer must tell characters apart by
   headwear shape and the one accent colour alone.
2. **Shape language:** round = warm/friendly (nani, the chai wala), square = solid/authority (chaudhry),
   triangles/points = mischief (the joker). Push one shape per character.
3. **One prop, one idea.** A prop says who they are faster than a face: chai cup, cricket bat, tasbeeh, cane.
4. **Scale-test:** the 40 px render in the compare sheet is the real test.
5. **Avoid the traps:** culture as the only personality trait; sacred items as decoration; "ethnic soup" (mixing
   regions at random); skin tone used as a joke or "exotic" marker.

## Pakistani / desi clothing and props: draw them right

| Item | What it is | How to draw it in this style |
|---|---|---|
| **Shalwar kameez** | long tunic (kameez) over loose trousers (shalwar); men usually plain colours, women print/embroidery | bust shows the kameez: collar (band or shirt collar) + a placket line with 2–3 buttons |
| **Waistcoat** (sadri) | sleeveless, worn over kameez, often dark or brocade | two side panels over the shirt (see `chaudhry`: `#7a2430` panels + gold buttons) |
| **Pagri / turban** | wrapped cloth; Punjabi rural *pagg* often has a starched fan (*turla*) at the side/top | wrapped dome with 2–3 curved fold lines + optional fan; the fan reads well in silhouette |
| **Topi** | Sindhi topi (embroidered, mirror-work, cut-out front), Jinnah cap (karakul), crochet prayer cap, Chitrali/Pakol (rolled-brim wool cap) | pick **one specific** cap and draw its real shape: Sindhi = cylinder with a front arch cut and dots; pakol = flat top + rolled band |
| **Dupatta** | long scarf over head or shoulders, often with a border (*gota*) | `back` layer behind the head + a draped curve on the shoulder, gold border line |
| **Chador / shawl** | larger wrap, older men and women, winter | a broad band over both shoulders |
| **Ajrak** | Sindhi block print, deep red/indigo with white geometric stars | a pattern fill on a shawl; great for card backs too |
| **Kurta + jeans, hoodie** | the young city look | modern characters keep the game from looking like a museum |
| **Props** | chai in a cup or *kulhad*, cricket bat, tasbeeh (prayer beads), paan, rickshaw (background), transistor radio, hookah (optional, adult only), newspaper (*akhbar*) | small, bottom corner, overlapping the shoulder line (see `ghulam`'s chai, `chaudhry`'s cane) |

**Respect rules (hard):**
- **Religious items** (prayer cap, tasbeeh, hijab, Sikh dastar) are fine **as part of who a character is**, drawn
  accurately and never as a gag, a villain marker, or decoration on a card back. Never put Quranic text,
  Allah's name or other scripture on any asset; don't use religious symbols as gambling decorations.
- **Sikh dastar** has its own shape and meaning: don't use it as a generic "turban", and don't put it on
  a joke character.
- **No skin lightening tropes:** good/rich ≠ fairer. Vary skin tones across the cast.
- **Women:** varied ages, roles and dress (dupatta, hijab, western, shalwar kameez), not only "aunty" gags.
- **Regional mix on purpose:** if a character is Sindhi, the cap, ajrak and colours should agree.
- When unsure whether a detail is respectful, leave it out and say why in the report.

## Expressions (for emotes/reactions)

Change only `eyes`, `brows`, `mouth`, keep the rest: happy (arched brows, `GRIN`), angry (brows down
toward the nose, flat mouth), shocked (round eyes + "O" mouth), crying (eyes as arcs + a blue tear), smug
(one brow up, half smile). Keep line weights identical so emotes look like the same person.
