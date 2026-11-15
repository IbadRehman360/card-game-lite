# Sound effects

## How Baazi plays sound today (read before adding any)

**There are no audio files.** Every sound is synthesised live with WebAudio:
- `src/lib/sfx.ts`: the shared engine. `unlockAudio()` (first gesture), a master gain (mute), an **effects bus**
  `sfxBus` (volume from prefs → 7 kHz lowpass → compressor), an ambience bus. The `sfx` object has one method
  per sound: `hover, select, back, confirm, open, flip, card, deal, gather, chips, pack, trump, sweep, turn, tick,
  win, lose, …`. Each starts with `if (!ready()) return;` and is built from five helpers:
  - `tone({ freq, to?, type?, peak, attack?, decay, when? })`: an oscillator with an exponential envelope
  - `noise({ freq, q?, type, peak, attack?, decay, when? })`: filtered white noise with the same envelope
  - `paper(at, dur, gain, from, to?, q?)`: a band-passed noise sweep (card brushes, deals)
  - `snap(at, dur, gain, freq, type?)`: a very short noise crack (card hits, chip clicks)
  - `chime(freq, when, peak, dur)`: a bell (pitch + octave + twelfth)
- `src/lib/emote-sounds.ts` and `src/components/bluff/bluff-sfx.ts` get `sfxOutput()` → `{ ctx, out }` and build
  their own graphs on the same bus, so volume and mute still apply.
- Calls: `sfx.card()` etc. from components, at the moment of the action.

So the **default route is a new synth recipe**, not a file: zero bytes, no licence, plays instantly, and it fits the
other sounds because it goes through the same bus.

## Route A: synthesise (preferred)

1. Write the target in words: "a ceramic chip clink: short bright transient, 2 inharmonic partials ringing ~0.3 s,
   a second smaller hit 90 ms later".
2. Start from the nearest preset: `node scripts/synth-wav.mjs --list` (flick, shuffle, chip, clink, win, tap), or
   copy an existing `sfx` method's numbers into a `recipe.json`:
   ```json
   { "note": "…", "layers": [
     { "kind": "snap", "at": 0, "dur": 0.006, "gain": 0.25, "freq": 4000 },
     { "kind": "tone", "freq": 2350, "peak": 0.09, "attack": 0.001, "decay": 0.38 } ] }
   ```
3. Render takes, plus a picture, plus the code:
   `node scripts/synth-wav.mjs recipe.json <scratch>/clink.wav --variants 3 --svg --ts`
   (each take gets fresh noise and a ±6% pitch shift, `--vary 0.06`; the printed brightness figure differs per take).
   The picture's waveform is scaled to its own peak; read the printed `peakDb` for real loudness.
   A filter sweep (`paper` from → to) only shows as a slope in the spectrogram when `q` ≥ ~1.5; with a broad q it
   looks like a smear, which is fine for a brush, but raise q if the sweep is the point.
4. **Check it by eye** (you can't listen): render the `.svg` to PNG with `render-compare.mjs clink.svg clink.png`
   and `Read` it. Check:
   - **Envelope:** the transient is sharp (vertical edge) for impacts; brushes ramp; length is right (UI sounds ≤ 0.25 s,
     card actions ≤ 0.4 s, jingles ≤ 1.5 s).
   - **Spectrum:** clinks/chips have bright energy 2–6 kHz; thuds sit < 300 Hz; paper is broad 1–5 kHz.
     Metal = narrow horizontal lines (partials) ringing; clay/plastic = short smear, no ringing lines.
   - **Level:** peak in the −12 to −22 dBFS range that the existing sounds use (printed by the script).
5. Give the user the WAV paths to audition, then paste the `--ts` output into the `sfx` object. Add a little
   random variation the way `card()` and `chips()` do (`const v = 0.94 + Math.random() * 0.12`), so repeats
   don't sound robotic.

Sound design cheat sheet:
| Sound | Ingredients |
|---|---|
| card flick / deal | `paper` sweep up 1.2→5 kHz (80–120 ms) + a tiny `snap` at the end |
| card slap on felt | `snap` 2.4 kHz 12 ms + triangle `tone` 420→240 Hz 45 ms + sine 170→110 Hz |
| shuffle / riffle | long low `paper` (0.5 s) + 10–16 `snap`s at irregular ~30 ms spacing + a settling thud |
| clay chip | `snap` 3 kHz + triangle ~2.6 kHz 60 ms + sine ~4.1 kHz 40 ms; 2–4 hits, 45–70 ms apart |
| metal coin clink | `snap` + 2–3 sine partials at inharmonic ratios (1 : 1.58 : 2.33) decaying 0.15–0.4 s |
| button tap | sine 260→140 Hz 80 ms + lowpassed noise 30 ms |
| win jingle | `chime` arpeggio of a major triad + octave, 100–120 ms apart, last note longest |
| lose | descending minor third with `to` pitch drops, softer peaks |
| error / not allowed | two short square-ish low tones (keep it soft; this game is friendly) |

## Route B: a CC0 recording

Use this only when synthesis can't get there (voices, crowd, real ambience).
1. Sources with clear licences: **Kenney.nl** (all packs CC0, e.g. "Casino Audio": cards, chips, dice;
   "Interface Sounds"; "UI Audio"), **freesound.org** with the "Creative Commons 0" licence filter only (CC-BY means
   attribution needed; CC-BY-NC is **not allowed**, the game has paid coins), **OpenGameArt.org** (filter CC0),
   **Sonniss GDC bundles** (royalty-free, check the bundle's licence).
2. Read the licence **on the asset's own page**, and save its URL. Download into a new empty scratch folder.
   Don't run anything bundled with it.
3. Trim and convert: keep files **< 30 KB**, mono, 44.1 kHz; prefer `.webm` (Opus) with an `.mp3` fallback, or
   just `.mp3` (~96 kbps). With ffmpeg, if installed:
   `ffmpeg -i in.wav -ac 1 -ar 44100 -af "silenceremove=1:0:-50dB,areverse,silenceremove=1:0:-50dB,areverse" -c:a libopus -b:a 64k out.webm`.
   Without ffmpeg, ship a short WAV (OK under ~60 KB) and say so.
4. Put it in `public/sounds/<name>.<ext>` (create the folder; there isn't one yet).
5. Play it on the effects bus so mute and volume apply: fetch + `decodeAudioData` once, cache the buffer,
   then on each play `const o = sfxOutput(); if (!o) return;` → `AudioBufferSourceNode` → `o.out`. Put that helper in
   `src/lib/sfx-samples.ts` and don't use `new Audio()` (it ignores the bus and is laggy on iOS).
6. Record it in `public/assets/assets.json` → `"audio"` (`kind: "file"`, `source`, `author`, `license`) and in `ASSETS-CREDITS.md`.

Every new synth sound also gets an `"audio"` entry in assets.json (`kind: "synth"`, `path: "src/lib/sfx.ts#name"`).
