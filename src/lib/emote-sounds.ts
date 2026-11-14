"use client";

// Each emote has its own cartoon sound, synthesised on the spot (no audio files): a laugh for the
// laughing king, a wail for the crying queen, a growl, a kiss, a snore... Voices are a buzzy source
// shaped by two vowel filters, which is what makes a tone sound like "ha" or "waah".

import { sfxOutput } from "./sfx";

/** Where emote sounds go: the game effects bus, so the volume and mute settings apply. */
const bus = new WeakMap<AudioContext, AudioNode>();
function audio(): AudioContext | null {
  const o = sfxOutput();
  if (!o) return null;
  bus.set(o.ctx, o.out);
  return o.ctx;
}
const dest = (a: AudioContext) => bus.get(a) ?? a.destination;

type A = AudioContext;
/** [seconds from start, value] */
type Curve = [number, number][];

const out = (a: A, gain: number) => {
  const g = a.createGain();
  g.gain.value = gain;
  g.connect(dest(a));
  return g;
};

function follow(param: AudioParam, t0: number, curve: Curve) {
  param.setValueAtTime(curve[0][1], t0 + curve[0][0]);
  for (const [t, v] of curve.slice(1)) param.linearRampToValueAtTime(v, t0 + t);
}

/** A cartoon voice: pitch and vowel move along curves; `env` shapes the loudness. */
function voice(
  a: A,
  o: { at?: number; pitch: Curve; vowel: [number, number]; vowelTo?: [number, number]; env: Curve; gain?: number; vibrato?: number },
) {
  const t0 = a.currentTime + (o.at ?? 0);
  const end = o.env[o.env.length - 1][0];
  const src = a.createOscillator();
  src.type = "sawtooth";
  follow(src.frequency, t0, o.pitch);
  if (o.vibrato) {
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = o.vibrato;
    depth.gain.value = o.pitch[0][1] * 0.06;
    lfo.connect(depth).connect(src.frequency);
    lfo.start(t0);
    lfo.stop(t0 + end + 0.05);
  }
  const amp = a.createGain();
  follow(amp.gain, t0, o.env);
  const dest = out(a, o.gain ?? 0.5);
  o.vowel.forEach((f, i) => {
    const bp = a.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(f, t0);
    if (o.vowelTo) bp.frequency.linearRampToValueAtTime(o.vowelTo[i], t0 + end);
    const g = a.createGain();
    g.gain.value = i ? 0.6 : 1;
    amp.connect(bp).connect(g).connect(dest);
  });
  src.connect(amp);
  src.start(t0);
  src.stop(t0 + end + 0.05);
}

/** A plain tone with a pitch curve. */
function tone(a: A, o: { at?: number; type?: OscillatorType; pitch: Curve; env: Curve; gain?: number }) {
  const t0 = a.currentTime + (o.at ?? 0);
  const end = o.env[o.env.length - 1][0];
  const src = a.createOscillator();
  src.type = o.type ?? "sine";
  follow(src.frequency, t0, o.pitch);
  const amp = a.createGain();
  follow(amp.gain, t0, o.env);
  src.connect(amp).connect(out(a, o.gain ?? 0.2));
  src.start(t0);
  src.stop(t0 + end + 0.05);
}

/** Filtered noise: breath, claps, flames, explosions. */
function noise(a: A, o: { at?: number; dur: number; type?: BiquadFilterType; freq: Curve; q?: number; env: Curve; gain?: number }) {
  const t0 = a.currentTime + (o.at ?? 0);
  const len = Math.ceil(a.sampleRate * o.dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = o.type ?? "bandpass";
  f.Q.value = o.q ?? 1;
  follow(f.frequency, t0, o.freq);
  const amp = a.createGain();
  follow(amp.gain, t0, o.env);
  src.connect(f).connect(amp).connect(out(a, o.gain ?? 0.4));
  src.start(t0);
  src.stop(t0 + o.dur);
}

const blip = (len: number, peak = 1): Curve => [
  [0, 0],
  [0.015, peak],
  [len * 0.7, peak * 0.7],
  [len, 0],
];

// Vowels as their two strongest resonances (Hz).
const AH: [number, number] = [800, 1200];
const OO: [number, number] = [350, 800];
const EH: [number, number] = [550, 1800];
const MM: [number, number] = [250, 900];

const SOUNDS: Record<string, (a: A) => void> = {
  // "HA-HA-HA-HA!" getting lower and slower
  "king-lol": (a) => {
    [0, 0.17, 0.33, 0.5, 0.68].forEach((at, i) => {
      noise(a, { at, dur: 0.05, freq: [[0, 1800]], q: 0.7, env: blip(0.05, 0.5), gain: 0.25 });
      voice(a, { at: at + 0.03, pitch: [[0, 260 - i * 18], [0.11, 230 - i * 18]], vowel: AH, env: blip(0.12), gain: 0.55 });
    });
  },
  // "Waaa-aaah... uh-uh"
  "queen-cry": (a) => {
    voice(a, {
      pitch: [[0, 520], [0.15, 640], [0.6, 600], [0.95, 380]],
      vowel: OO,
      vowelTo: AH,
      vibrato: 7,
      env: [[0, 0], [0.08, 1], [0.8, 0.8], [0.98, 0]],
      gain: 0.5,
    });
    [1.08, 1.25].forEach((at) => voice(a, { at, pitch: [[0, 480], [0.09, 420]], vowel: AH, env: blip(0.1, 0.8), gain: 0.4 }));
  },
  // a finger snap and a smooth, low "yeahh"
  "king-cool": (a) => {
    noise(a, { dur: 0.04, freq: [[0, 2600]], q: 2, env: blip(0.04), gain: 0.6 });
    voice(a, { at: 0.12, pitch: [[0, 140], [0.25, 175], [0.6, 150]], vowel: EH, vowelTo: AH, env: [[0, 0], [0.06, 1], [0.5, 0.8], [0.65, 0]], gain: 0.45 });
  },
  // a rising growl: "GRRRAAH"
  "king-rage": (a) => {
    const t0 = a.currentTime;
    const src = a.createOscillator();
    src.type = "sawtooth";
    follow(src.frequency, t0, [[0, 85], [0.5, 120], [0.75, 150]]);
    const trem = a.createOscillator();
    const tremDepth = a.createGain();
    trem.frequency.value = 28;
    tremDepth.gain.value = 0.5;
    const amp = a.createGain();
    follow(amp.gain, t0, [[0, 0], [0.05, 0.6], [0.6, 0.9], [0.8, 0]]);
    trem.connect(tremDepth).connect(amp.gain);
    const lp = a.createBiquadFilter();
    lp.type = "lowpass";
    follow(lp.frequency, t0, [[0, 500], [0.7, 1400]]);
    src.connect(amp).connect(lp).connect(out(a, 0.45));
    src.start(t0);
    trem.start(t0);
    src.stop(t0 + 0.85);
    trem.stop(t0 + 0.85);
  },
  // "mm-WAH!" kiss: a lip smack and a little rising whistle
  "queen-kiss": (a) => {
    voice(a, { pitch: [[0, 300], [0.12, 330]], vowel: MM, env: blip(0.12, 0.6), gain: 0.4 });
    noise(a, { at: 0.13, dur: 0.035, freq: [[0, 3000]], q: 3, env: blip(0.035), gain: 0.8 });
    tone(a, { at: 0.16, pitch: [[0, 900], [0.25, 1700]], env: blip(0.28, 1), gain: 0.15 });
  },
  // a trumpet "ta-daa" over clapping
  "jack-shabash": (a) => {
    tone(a, { type: "sawtooth", pitch: [[0, 523]], env: blip(0.12), gain: 0.09 });
    tone(a, { at: 0.13, type: "sawtooth", pitch: [[0, 784]], env: blip(0.45), gain: 0.09 });
    for (let i = 0; i < 7; i++)
      noise(a, { at: 0.05 + i * 0.1 + Math.random() * 0.03, dur: 0.05, freq: [[0, 1500]], q: 1.2, env: blip(0.05), gain: 0.5 });
  },
  // a nervous gulp, then a falling sweat drop
  "jack-sweat": (a) => {
    voice(a, { pitch: [[0, 220], [0.08, 160]], vowel: OO, env: blip(0.1, 0.8), gain: 0.4 });
    tone(a, { at: 0.2, pitch: [[0, 1400], [0.18, 500]], env: blip(0.2), gain: 0.16 });
    tone(a, { at: 0.42, pitch: [[0, 700], [0.06, 1100]], env: blip(0.07), gain: 0.12 });
  },
  // hurry up: a quick beep-beep-beep
  "jack-jaldi": (a) => {
    [0, 0.13, 0.26, 0.45].forEach((at, i) => tone(a, { at, type: "square", pitch: [[0, i === 3 ? 1320 : 990]], env: blip(i === 3 ? 0.2 : 0.08), gain: 0.06 }));
  },
  // "hmmm?" thinking hum, rising at the end
  "queen-think": (a) => {
    voice(a, { pitch: [[0, 220], [0.5, 210], [0.8, 290]], vowel: MM, env: [[0, 0], [0.08, 0.9], [0.65, 0.9], [0.85, 0]], gain: 0.55 });
  },
  // "WAH WAH!" (praise, a horn through a wah filter)
  "king-wah": (a) => {
    [0, 0.3].forEach((at) => voice(a, { at, pitch: [[0, 330], [0.22, 350]], vowel: OO, vowelTo: AH, env: blip(0.25), gain: 0.55 }));
  },
  // a snore in and a whistle out
  "jack-sleep": (a) => {
    noise(a, { dur: 0.6, type: "lowpass", freq: [[0, 300], [0.5, 500]], env: [[0, 0], [0.4, 0.9], [0.6, 0]], gain: 0.5 });
    const t0 = a.currentTime;
    const buzz = a.createOscillator();
    buzz.frequency.value = 38;
    buzz.type = "sawtooth";
    const g = a.createGain();
    follow(g.gain, t0, [[0, 0], [0.4, 0.15], [0.6, 0]]);
    buzz.connect(g).connect(out(a, 0.5));
    buzz.start(t0);
    buzz.stop(t0 + 0.65);
    tone(a, { at: 0.7, pitch: [[0, 1200], [0.4, 700]], env: [[0, 0], [0.05, 1], [0.4, 0]], gain: 0.1 });
  },
  // a short winner's jingle
  gg: (a) => {
    [523, 659, 784].forEach((f, i) => tone(a, { at: i * 0.09, type: "triangle", pitch: [[0, f]], env: blip(0.14), gain: 0.18 }));
    tone(a, { at: 0.3, type: "triangle", pitch: [[0, 1047]], env: blip(0.4), gain: 0.2 });
  },
  // magical shimmer: Rung is set
  rung: (a) => {
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(a, { at: i * 0.06, pitch: [[0, f]], env: blip(0.35), gain: 0.1 }));
    noise(a, { dur: 0.6, type: "highpass", freq: [[0, 6000]], env: [[0, 0], [0.1, 0.3], [0.6, 0]], gain: 0.2 });
  },
  // a big boom
  "ace-boom": (a) => {
    noise(a, { dur: 0.9, type: "lowpass", freq: [[0, 1200], [0.6, 150]], env: [[0, 1], [0.9, 0]], gain: 0.9 });
    tone(a, { pitch: [[0, 140], [0.5, 40]], env: [[0, 1], [0.6, 0]], gain: 0.5 });
  },
  // cha-ching! (it's all mine)
  "sab-mera": (a) => {
    noise(a, { dur: 0.08, type: "highpass", freq: [[0, 4000]], env: blip(0.08), gain: 0.4 });
    tone(a, { at: 0.08, type: "square", pitch: [[0, 1976]], env: blip(0.1), gain: 0.05 });
    tone(a, { at: 0.16, type: "square", pitch: [[0, 2637]], env: blip(0.5), gain: 0.05 });
  },
  // a royal fanfare
  court: (a) => {
    const n: [number, number, number][] = [[392, 0, 0.12], [392, 0.13, 0.12], [392, 0.26, 0.12], [523, 0.4, 0.5]];
    n.forEach(([f, at, len]) => {
      tone(a, { at, type: "sawtooth", pitch: [[0, f]], env: blip(len), gain: 0.07 });
      tone(a, { at, type: "triangle", pitch: [[0, f * 2]], env: blip(len), gain: 0.07 });
    });
  },
  // a whoosh of flame and some crackle
  "on-fire": (a) => {
    noise(a, { dur: 0.7, freq: [[0, 400], [0.5, 2500]], q: 0.8, env: [[0, 0], [0.2, 0.9], [0.7, 0]], gain: 0.6 });
    for (let i = 0; i < 6; i++) noise(a, { at: 0.2 + Math.random() * 0.5, dur: 0.02, type: "highpass", freq: [[0, 3000]], env: blip(0.02), gain: 0.5 });
  },
  // "uh-oh" and a falling slide whistle
  oops: (a) => {
    voice(a, { pitch: [[0, 330], [0.12, 340]], vowel: AH, env: blip(0.13), gain: 0.45 });
    voice(a, { at: 0.18, pitch: [[0, 260], [0.2, 240]], vowel: OO, env: blip(0.22), gain: 0.45 });
    tone(a, { at: 0.45, pitch: [[0, 1400], [0.35, 300]], env: blip(0.36), gain: 0.12 });
  },
};

/** Plays the sound for an emote; unknown emotes get a springy "boing". */
export function playEmoteSound(id: string) {
  const a = audio();
  if (!a) return;
  (SOUNDS[id] ?? boing)(a);
}

function boing(a: A) {
  tone(a, { pitch: [[0, 220], [0.12, 760], [0.22, 520]], env: [[0, 0], [0.02, 1], [0.32, 0]], gain: 0.12 });
}

/**
 * The turn clock running out: a "tick-tock" each second, turning into a fast, higher alarm in the
 * last two. Returns a function that silences anything still scheduled (the card was played).
 */
export function clockTick(secondsLeft: number): () => void {
  const a = audio();
  if (!a) return () => {};
  const urgent = secondsLeft <= 2;
  const beats = urgent ? [0, 0.25, 0.5, 0.75] : [0, 0.5];
  const nodes: AudioScheduledSourceNode[] = [];
  beats.forEach((at, i) => {
    const t = a.currentTime + at;
    // a woodblock: a very short high sine with a click on top
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = urgent ? 1900 : i % 2 ? 1250 : 1650;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(urgent ? 0.22 : 0.16, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(dest(a));
    o.start(t);
    o.stop(t + 0.09);
    nodes.push(o);
  });
  return () => nodes.forEach((n) => {
    try {
      n.stop();
    } catch {}
  });
}
