# Raster images (photos, textures, painted art)

Prefer vector (SVG/CSS) for anything flat or geometric: it's smaller and sharp at every size. Use raster only for
photographic textures (wood, felt, marble), painted backdrops and baked 3D renders.

## Where things go
| What | Folder | Notes |
|---|---|---|
| tiling material textures | `public/assets/textures/` | 768×768 WebP, seamless; listed in `public/assets/assets.json` |
| baked scene plates/sprites | `public/baked/` | made by the bake pipeline; don't hand-edit |
| card art | `public/cards/` | SVG court portraits (public domain, see `LICENSE.txt` there) |
| other illustrations/photos | `public/assets/images/` (create) | WebP |
| app icons | `public/icons/` | PNG 192/512 + maskable |

## Optimizing (sharp is in node_modules; no install needed)
```js
// node --input-type=module -e "…" from the project root, or a scratch .mjs file
import sharp from "sharp";
await sharp("in.jpg").resize({ width: 768, height: 768, fit: "cover" }).webp({ quality: 78, effort: 6 }).toFile("public/assets/textures/x.webp");
```
- Size to the **largest size it is displayed at × 2** (DPR), then stop. Textures: 512–1024 px. UI art: 2× its CSS box.
- WebP quality 70–82; textures that get darkened/multiplied in CSS can go to 65.
- Budget: textures ≤ 120 KB, UI images ≤ 60 KB. Report the before/after bytes.
- Strip metadata (sharp does it by default). Keep an alpha channel only if it's needed.
- Seamless tiles: check by compositing a 2×2 grid of the tile with sharp and `Read`-ing it; seams show as a cross.
- In 3D (three/R3F) set `texture.colorSpace = SRGBColorSpace` for colour maps; see the threejs-textures skill.

## Where to get them
Poly Haven (CC0, textures and HDRIs), ambientCG (CC0), Kenney (CC0, 2D game art), museum open access (the Met,
Rijksmuseum, V&A: public-domain Mughal miniatures, textiles and tiles, for reference or as a texture source when
the item's page says public domain/CC0). Record each in `assets.json` with `source`, `author` and `license`.
