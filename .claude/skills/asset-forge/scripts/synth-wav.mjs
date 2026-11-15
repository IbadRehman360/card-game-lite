#!/usr/bin/env node
/**
 * asset-forge / synth-wav.mjs: render a sound effect to a 16-bit mono WAV, offline, with no dependencies.
 *
 * It mirrors the five building blocks in src/lib/sfx.ts (tone, noise, paper, snap, chime) with the same
 * parameter names, so a recipe you audition here pastes straight into `sfx` as calls to those helpers.
 *
 *   node synth-wav.mjs --list                          list built-in presets
 *   node synth-wav.mjs chip out/chip.wav               render a preset
 *   node synth-wav.mjs recipe.json out/x.wav --ts      render a JSON recipe and print the sfx.ts code
 *   node synth-wav.mjs flick out.wav --seed 7 --variants 3   three takes: new noise and ±6% pitch each (--vary 0.06)
 *   node synth-wav.mjs chip out/chip.wav --svg         also write out/chip.svg: waveform + spectrogram to look at
 *
 * Recipe JSON: { "layers": [ {"kind":"tone", ...}, {"kind":"noise", ...}, ... ] }
 *   tone  { freq, to?, type? (sine|triangle|square|sawtooth), peak, attack?=0.003, decay, when?=0 }
 *   noise { freq, q?=1, type (lowpass|highpass|bandpass), peak, attack?=0.002, decay, when?=0 }
 *   paper { at, dur, gain, from, to?=from, q?=0.9 }        band-passed noise whose band sweeps from -> to
 *   snap  { at, dur, gain, freq, type?="highpass" }         a very short, sharp noise crack
 *   chime { freq, when, peak, dur }                         a bell: pitch + octave + twelfth
 *
 * Prints peak/RMS and a brightness figure so you can compare takes without listening.
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SR = 44100;

// ─── presets: each one is written with the same helpers as src/lib/sfx.ts ───
const PRESETS = {
  flick: {
    note: "one card flicked off the thumb: a papery whoosh that closes on a dry tick",
    layers: [
      { kind: "paper", at: 0, dur: 0.09, gain: 0.22, from: 1400, to: 5200, q: 0.7 },
      { kind: "snap", at: 0.075, dur: 0.012, gain: 0.32, freq: 2600 },
      { kind: "tone", freq: 520, to: 260, type: "triangle", peak: 0.06, attack: 0.001, decay: 0.04, when: 0.075 },
    ],
  },
  shuffle: {
    note: "a riffle shuffle: a long brush with a burst of tiny card ticks, then the bridge settling",
    layers: [
      { kind: "paper", at: 0, dur: 0.55, gain: 0.12, from: 900, to: 3200, q: 0.5 },
      ...Array.from({ length: 14 }, (_, i) => ({
        kind: "snap", at: 0.03 + i * 0.034 + (i % 3) * 0.004, dur: 0.008, gain: 0.1 + (i % 4) * 0.02, freq: 2600 + (i % 5) * 300,
      })),
      { kind: "paper", at: 0.56, dur: 0.12, gain: 0.16, from: 1800, to: 700, q: 0.8 },
      { kind: "tone", freq: 180, to: 110, peak: 0.08, attack: 0.002, decay: 0.07, when: 0.6 },
    ],
  },
  chip: {
    note: "two clay chips clicking onto a pile (same as sfx.chips but with fixed variation)",
    layers: [0, 0.058].flatMap((at, i) => {
      const v = [1, 1.07][i];
      return [
        { kind: "snap", at, dur: 0.01, gain: 0.16, freq: 3000 * v },
        { kind: "tone", freq: 2650 * v, type: "triangle", peak: 0.05, attack: 0.001, decay: 0.06, when: at },
        { kind: "tone", freq: 4100 * v, peak: 0.025, attack: 0.001, decay: 0.04, when: at },
      ];
    }),
  },
  clink: {
    note: "a metal coin chip clinking on another: inharmonic partials ringing out",
    layers: [
      { kind: "snap", at: 0, dur: 0.006, gain: 0.25, freq: 4000 },
      { kind: "tone", freq: 2350, type: "sine", peak: 0.09, attack: 0.001, decay: 0.38 },
      { kind: "tone", freq: 3720, type: "sine", peak: 0.05, attack: 0.001, decay: 0.26 },
      { kind: "tone", freq: 5480, type: "sine", peak: 0.025, attack: 0.001, decay: 0.15 },
      { kind: "snap", at: 0.09, dur: 0.005, gain: 0.12, freq: 4200 },
      { kind: "tone", freq: 2410, type: "sine", peak: 0.05, attack: 0.001, decay: 0.3, when: 0.09 },
    ],
  },
  win: {
    note: "a short major arpeggio of chimes (C5 E5 G5 C6) with a coin glint on top",
    layers: [
      { kind: "chime", freq: 523.25, when: 0, peak: 0.07, dur: 0.5 },
      { kind: "chime", freq: 659.25, when: 0.1, peak: 0.07, dur: 0.5 },
      { kind: "chime", freq: 783.99, when: 0.2, peak: 0.075, dur: 0.6 },
      { kind: "chime", freq: 1046.5, when: 0.32, peak: 0.08, dur: 0.9 },
      { kind: "tone", freq: 3170, peak: 0.03, decay: 0.4, when: 0.34 },
    ],
  },
  tap: {
    note: "a soft UI button tap: a knuckle on wood, quieter than sfx.select",
    layers: [
      { kind: "tone", freq: 260, to: 140, peak: 0.25, decay: 0.08 },
      { kind: "noise", freq: 1400, q: 0.7, type: "lowpass", peak: 0.14, attack: 0.001, decay: 0.03 },
    ],
  },
};

// ─── tiny seeded PRNG so takes are reproducible ───
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// RBJ biquad, matching WebAudio's lowpass/highpass/bandpass closely enough for auditioning.
function biquad(type, freq, q) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
    const cos = Math.cos(w), alpha = Math.sin(w) / (2 * Math.max(q, 0.0001));
    const a0 = 1 + alpha;
    if (type === "lowpass") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
    else if (type === "highpass") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; } // bandpass, 0 dB peak (WebAudio's)
    a1 = -2 * cos; a2 = 1 - alpha;
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  };
  set(freq);
  return {
    set,
    run(x) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}

// WebAudio-style envelope: exponential from ~0 to peak over attack, then down to ~0 over decay.
function env(t, peak, attack, decay) {
  if (t < 0) return 0;
  const lo = 0.0001;
  peak = Math.max(peak, 0.0002);
  if (t < attack) return lo * (peak / lo) ** (t / attack);
  if (t < attack + decay) return peak * (lo / peak) ** ((t - attack) / decay);
  return 0;
}

const osc = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5),
  square: (p) => (p % 1 < 0.5 ? 1 : -1),
  sawtooth: (p) => 2 * (p % 1) - 1,
};

function expand(layers) {
  // chime is three tones, exactly as in sfx.ts
  return layers.flatMap((l) =>
    l.kind === "chime"
      ? [
          { kind: "tone", freq: l.freq, peak: l.peak, attack: 0.012, decay: l.dur, when: l.when },
          { kind: "tone", freq: l.freq * 2, peak: l.peak * 0.32, attack: 0.012, decay: l.dur * 0.6, when: l.when },
          { kind: "tone", freq: l.freq * 3, peak: l.peak * 0.12, attack: 0.012, decay: l.dur * 0.35, when: l.when },
        ]
      : [l],
  );
}

function layerEnd(l) {
  if (l.kind === "tone" || l.kind === "noise") return (l.when ?? 0) + (l.attack ?? 0.003) + l.decay + 0.05;
  return l.at + l.dur;
}

function render(recipe, seed) {
  const layers = expand(recipe.layers);
  const dur = Math.max(...layers.map(layerEnd)) + 0.05;
  const out = new Float32Array(Math.ceil(dur * SR));
  const rand = rng(seed);
  for (const l of layers) {
    if (l.kind === "tone") {
      const t0 = l.when ?? 0, a = l.attack ?? 0.003, len = a + l.decay;
      const wave = osc[l.type ?? "sine"];
      let phase = 0;
      for (let i = Math.floor(t0 * SR); i < Math.min(out.length, (t0 + len + 0.05) * SR); i++) {
        const t = i / SR - t0;
        const f = l.to ? l.freq * (l.to / l.freq) ** Math.min(1, t / len) : l.freq;
        phase += f / SR;
        out[i] += wave(phase) * env(t, l.peak, a, l.decay);
      }
    } else if (l.kind === "noise") {
      const t0 = l.when ?? 0, a = l.attack ?? 0.002;
      const f = biquad(l.type, l.freq, l.q ?? 1);
      for (let i = Math.floor(t0 * SR); i < Math.min(out.length, (t0 + a + l.decay + 0.05) * SR); i++) {
        out[i] += f.run(rand()) * env(i / SR - t0, l.peak, a, l.decay);
      }
    } else if (l.kind === "paper") {
      const n = Math.max(1, Math.floor(SR * l.dur)), to = Math.max(40, l.to ?? l.from);
      const f = biquad("bandpass", l.from, l.q ?? 0.9);
      const start = Math.floor(l.at * SR);
      for (let i = 0; i < n && start + i < out.length; i++) {
        if (i % 32 === 0) f.set(l.from * (to / l.from) ** (i / n));
        out[start + i] += f.run(rand() * (1 - i / n) ** 2.2) * l.gain;
      }
    } else if (l.kind === "snap") {
      const n = Math.max(1, Math.floor(SR * l.dur));
      const f = biquad(l.type ?? "highpass", l.freq, 0.7);
      const start = Math.floor(l.at * SR);
      // run the filter a little past the burst so its ring-out is kept
      for (let i = 0; i < n + 400 && start + i < out.length; i++) {
        const x = i < n ? rand() * Math.exp((-7 * i) / n) : 0;
        out[start + i] += f.run(x) * l.gain;
      }
    } else {
      throw new Error(`unknown layer kind: ${l.kind}`);
    }
  }
  // the app's effects bus: a 7 kHz lowpass and a gentle compressor; here a lowpass and a soft clip
  const lp = biquad("lowpass", 7000, 0.707);
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(lp.run(out[i]) * 1.2) / 1.2;
  return out;
}

function wav(samples, gain = 1) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  return buf;
}

function stats(s) {
  let peak = 0, sum = 0, zc = 0;
  for (let i = 0; i < s.length; i++) {
    peak = Math.max(peak, Math.abs(s[i]));
    sum += s[i] * s[i];
    if (i && (s[i] >= 0) !== (s[i - 1] >= 0)) zc++;
  }
  const db = (v) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  return { seconds: +(s.length / SR).toFixed(3), peakDb: db(peak), rmsDb: db(Math.sqrt(sum / s.length)), brightnessHz: Math.round((zc / 2) * (SR / s.length)) };
}

/** Waveform + spectrogram as an SVG, so a sound can be checked by eye (render it with render-compare.mjs). */
function picture(s, title) {
  const W = 800, WH = 120, SH = 200, frame = 512, hop = Math.max(64, Math.floor(s.length / 300)), bins = 64;
  const cols = Math.max(1, Math.floor((s.length - frame) / hop));
  let wave = "";
  // scale the waveform to its own peak so quiet sounds are still readable (levels are printed separately)
  let pk = 1e-6;
  for (let i = 0; i < s.length; i++) pk = Math.max(pk, Math.abs(s[i]));
  s = s.map((v) => v / pk);
  for (let x = 0; x < W; x++) {
    const a = Math.floor((x / W) * s.length), b = Math.floor(((x + 1) / W) * s.length);
    let lo = 0, hi = 0;
    for (let i = a; i < b; i++) { lo = Math.min(lo, s[i]); hi = Math.max(hi, s[i]); }
    wave += `M${x} ${(WH / 2 - hi * WH / 2).toFixed(1)}V${(WH / 2 - lo * WH / 2 + 0.5).toFixed(1)}`;
  }
  // log-spaced bins from 100 Hz to 11 kHz, naive DFT per frame with a Hann window
  const freqs = Array.from({ length: bins }, (_, i) => 100 * (110) ** (i / (bins - 1)));
  const cw = W / cols, bh = SH / bins;
  let rects = "";
  for (let c = 0; c < cols; c++) {
    const off = c * hop;
    freqs.forEach((f, bi) => {
      let re = 0, im = 0;
      const w = (2 * Math.PI * f) / SR;
      for (let n = 0; n < frame; n++) {
        const x = (s[off + n] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (frame - 1)));
        re += x * Math.cos(w * n); im -= x * Math.sin(w * n);
      }
      const db = 20 * Math.log10(Math.hypot(re, im) / frame + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 90) / 70));
      if (v > 0.05) rects += `<rect x="${(c * cw).toFixed(1)}" y="${(SH - (bi + 1) * bh).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(bh + 0.6).toFixed(1)}" fill="rgb(${Math.round(255 * v)},${Math.round(200 * v * v)},${Math.round(60 * v)})"/>`;
    });
  }
  const tick = (hz) => { const y = SH - (Math.log(hz / 100) / Math.log(110)) * SH; return `<text x="4" y="${(WH + 20 + y).toFixed(0)}" font-size="10" fill="#9ab">${hz >= 1000 ? hz / 1000 + "k" : hz}</text>`; };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${WH + SH + 40}" width="${W}" height="${WH + SH + 40}">
<rect width="100%" height="100%" fill="#0b0b0e"/>
<text x="6" y="14" font-size="12" font-family="Arial" fill="#fbd48a">${title} · ${(s.length / SR).toFixed(2)} s · waveform (top), spectrogram 100 Hz-11 kHz (bottom)</text>
<path d="${wave}" transform="translate(0 16)" stroke="#f0ad3a" stroke-width="1" fill="none"/>
<g transform="translate(0 ${WH + 20})">${rects}</g>${[200, 1000, 4000, 10000].map(tick).join("")}</svg>`;
}

function toTs(name, recipe) {
  const n = (v) => +(+v).toFixed(4);
  const lines = recipe.layers.map((l) => {
    const { kind, ...p } = l;
    if (kind === "paper") return `paper(${n(p.at)}, ${n(p.dur)}, ${n(p.gain)}, ${n(p.from)}, ${n(p.to ?? p.from)}, ${n(p.q ?? 0.9)});`;
    if (kind === "snap") return `snap(${n(p.at)}, ${n(p.dur)}, ${n(p.gain)}, ${n(p.freq)}${p.type ? `, "${p.type}"` : ""});`;
    if (kind === "chime") return `chime(${n(p.freq)}, ${n(p.when)}, ${n(p.peak)}, ${n(p.dur)});`;
    const args = Object.entries(p).map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : n(v)}`).join(", ");
    return `${kind}({ ${args} });`;
  });
  return `  /** ${recipe.note ?? name} */\n  ${name}() {\n    if (!ready()) return;\n${lines.map((l) => `    ${l}`).join("\n")}\n  },`;
}

// ─── CLI ───
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const seed = Number(flag("--seed") ?? 1);
const variants = Number(flag("--variants") ?? 1);
const vary = Number(flag("--vary") ?? 0.06); // ± pitch spread across variants
const wantTs = args.includes("--ts");
const normalize = args.includes("--normalize");
const wantSvg = args.includes("--svg");
const pos = args.filter((a) => !a.startsWith("--"));

if (args.includes("--list") || !pos.length) {
  console.log("presets:");
  for (const [k, v] of Object.entries(PRESETS)) console.log(`  ${k.padEnd(8)} ${v.note}`);
  console.log("\nusage: node synth-wav.mjs <preset|recipe.json> [out.wav] [--seed n] [--variants n] [--ts] [--svg] [--normalize]");
  process.exit(args.includes("--list") ? 0 : 1);
}

const [src, outArg] = pos;
const recipe = PRESETS[src] ?? JSON.parse(readFileSync(src, "utf8"));
const name = PRESETS[src] ? src : src.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
const outBase = resolve(outArg ?? `${name}.wav`);
mkdirSync(dirname(outBase), { recursive: true });

for (let v = 0; v < variants; v++) {
  // like sfx.card()/chips(): each take is a little different in pitch, so repeats don't sound robotic
  const k = variants > 1 && vary ? 1 + vary * (((seed + v) * 0.6180339) % 1) * 2 - vary : 1;
  const scaled = k === 1 ? recipe : { ...recipe, layers: recipe.layers.map((l) => {
    const c = { ...l };
    for (const key of ["freq", "to", "from"]) if (typeof c[key] === "number") c[key] *= k;
    return c;
  }) };
  const s = render(scaled, seed + v);
  const st = stats(s);
  const gain = normalize ? 0.89 / Math.max(1e-9, 10 ** (+st.peakDb / 20)) : 1; // -1 dBFS
  const file = variants > 1 ? outBase.replace(/\.wav$/i, `-${v + 1}.wav`) : outBase;
  writeFileSync(file, wav(s, gain));
  if (wantSvg) writeFileSync(file.replace(/\.wav$/i, ".svg"), picture(s, `${name}${variants > 1 ? ` #${v + 1}` : ""}`));
  console.log(`${file}  ${JSON.stringify(st)}${normalize ? ` (normalized x${gain.toFixed(2)})` : ""}`);
  if (+st.peakDb > -0.5) console.warn("  warning: near clipping, lower the peaks/gains");
  // the app's own sounds peak around -12..-22 dBFS here (before the 0.7 bus gain); much lower is inaudible next to them
  if (+st.peakDb < -30) console.warn("  warning: much quieter than the app's other sounds, raise the peaks/gains");
}
if (wantTs) console.log(`\n// paste into the sfx object in src/lib/sfx.ts:\n${toTs(name, recipe)}`);
