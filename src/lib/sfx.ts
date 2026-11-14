/**
 * Every sound in the menus, synthesised with WebAudio so there are no audio files to load.
 * Nothing plays until the first tap or key press (unlockAudio), which browsers require anyway.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode;
let sfxBus: GainNode;
let ambBus: GainNode;
let white: AudioBuffer;
let brown: AudioBuffer;

let sfxVolume = 0.7;
let muted = false;
let ambienceWanted = false;
let ambience: { stop: () => void } | null = null;

function makeNoise(c: Ctx, kind: "white" | "brown"): AudioBuffer {
  const length = c.sampleRate * 3;
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") {
      data[i] = w;
    } else {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

function init(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxVolume;
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 7000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  sfxBus.connect(soften).connect(comp).connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.connect(master);
  white = makeNoise(ctx, "white");
  brown = makeNoise(ctx, "brown");
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else wake();
  });
  // iOS stops ("interrupts") audio after a call, the lock screen or another app, and only lets it start
  // again from a touch. So any touch or key brings the sound back if it went quiet.
  for (const type of ["pointerdown", "touchend", "keydown"] as const) {
    window.addEventListener(type, wake, { capture: true, passive: true });
  }
  return ctx;
}

function wake() {
  if (ctx && ctx.state !== "running" && ctx.state !== "closed" && !document.hidden) ctx.resume().catch(() => {});
}

/** Call from a user gesture. Creates the audio graph and starts the ambience if it's wanted. */
export function unlockAudio() {
  const c = init();
  if (!c) return;
  wake();
  if (ambienceWanted) startAmbience();
}

const ready = () => ctx !== null && ctx.state === "running" && !muted;

function envelope(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

interface NoiseOpts {
  freq: number;
  q?: number;
  type: BiquadFilterType;
  peak: number;
  attack?: number;
  decay: number;
  when?: number;
  out?: AudioNode;
}

function noise({ freq, q = 1, type, peak, attack = 0.002, decay, when = 0, out }: NoiseOpts) {
  const c = ctx!;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = white;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  envelope(g, t, peak, attack, decay);
  src.connect(f).connect(g).connect(out ?? sfxBus);
  src.start(t, Math.random() * 2);
  src.stop(t + attack + decay + 0.05);
}

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  peak: number;
  attack?: number;
  decay: number;
  when?: number;
}

function tone({ freq, to, type = "sine", peak, attack = 0.003, decay, when = 0 }: ToneOpts) {
  const c = ctx!;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  const g = c.createGain();
  envelope(g, t, peak, attack, decay);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

export const sfx = {
  /** A fingernail along a card edge. */
  hover() {
    if (!ready()) return;
    noise({ freq: 3400, q: 1.4, type: "bandpass", peak: 0.09, decay: 0.03 });
    noise({ freq: 5200, q: 2, type: "bandpass", peak: 0.04, decay: 0.02, when: 0.012 });
  },
  /** A knuckle on oak. */
  select() {
    if (!ready()) return;
    tone({ freq: 210, to: 96, peak: 0.42, decay: 0.15 });
    tone({ freq: 420, to: 260, type: "triangle", peak: 0.08, decay: 0.06 });
    noise({ freq: 1100, q: 0.7, type: "lowpass", peak: 0.28, attack: 0.001, decay: 0.05 });
  },
  back() {
    if (!ready()) return;
    tone({ freq: 150, to: 74, peak: 0.36, decay: 0.17 });
    noise({ freq: 700, q: 0.7, type: "lowpass", peak: 0.22, attack: 0.001, decay: 0.06 });
  },
  /** Card slapped down, then a coin ringing on the table. */
  confirm() {
    if (!ready()) return;
    noise({ freq: 1600, q: 0.6, type: "highpass", peak: 0.5, attack: 0.001, decay: 0.08 });
    tone({ freq: 120, to: 70, peak: 0.3, decay: 0.12 });
    tone({ freq: 2093, type: "triangle", peak: 0.09, decay: 0.7, when: 0.09 });
    tone({ freq: 3170, peak: 0.06, decay: 0.5, when: 0.1 });
    tone({ freq: 4410, peak: 0.03, decay: 0.32, when: 0.1 });
    tone({ freq: 2108, type: "triangle", peak: 0.05, decay: 0.5, when: 0.26 });
  },
  /** A heavy cover dropping shut. */
  open() {
    if (!ready()) return;
    noise({ freq: 420, q: 0.8, type: "lowpass", peak: 0.3, attack: 0.004, decay: 0.22 });
    tone({ freq: 82, to: 60, peak: 0.25, decay: 0.26 });
  },
  /** Flicking through the deck: three quick card snaps. */
  flip() {
    if (!ready()) return;
    for (let i = 0; i < 3; i++) noise({ freq: 2600 - i * 300, q: 1.1, type: "bandpass", peak: 0.12, decay: 0.035, when: i * 0.045 });
  },
  /** A card put down on the felt: a soft slap of paper with a little weight under it. */
  card() {
    if (!ready()) return;
    const v = 0.94 + Math.random() * 0.12; // a little different every time
    const at = 0.33; // in time with the card landing
    // a short, clean "tak": a very brief click with a hollow paper body under it, no hiss
    snap(at, 0.012, 0.3, 2400 * v);
    tone({ freq: 420 * v, to: 240 * v, type: "triangle", peak: 0.11, attack: 0.001, decay: 0.045, when: at });
    tone({ freq: 170 * v, to: 110 * v, peak: 0.07, attack: 0.002, decay: 0.06, when: at });
  },
  /** One card flicked across the table while dealing. */
  deal() {
    if (!ready()) return;
    paper(0, 0.12, 0.17, 1200, 4000, 0.6);
    paper(0.08, 0.04, 0.09, 2600, 1800, 0.8);
  },
  /** A finished haath pushed into the middle: a short brush of cards. */
  gather() {
    if (!ready()) return;
    paper(0, 0.2, 0.12, 900, 2400, 0.55);
    paper(0.12, 0.05, 0.08, 1500, 900, 0.8);
  },
  /** Chips put in the pot: two or three clay chips clicking onto the pile. */
  chips(big = false) {
    if (!ready()) return;
    const n = big ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const at = i * (0.045 + Math.random() * 0.025);
      const v = 0.9 + Math.random() * 0.25;
      snap(at, 0.01, 0.16, 3000 * v);
      tone({ freq: 2650 * v, type: "triangle", peak: 0.05, attack: 0.001, decay: 0.06, when: at });
      tone({ freq: 4100 * v, peak: 0.025, attack: 0.001, decay: 0.04, when: at });
    }
  },
  /** Cards pushed away face down. */
  pack() {
    if (!ready()) return;
    snap(0, 0.012, 0.18, 1800);
    tone({ freq: 300, to: 160, type: "triangle", peak: 0.07, attack: 0.001, decay: 0.07 });
  },
  /** Rung is set: a clear two-note bell. */
  trump() {
    if (!ready()) return;
    chime(523.25, 0, 0.075, 0.8);
    chime(783.99, 0.14, 0.075, 1);
  },
  /** A stack of haaths raked off the table: a soft riffle. */
  sweep() {
    if (!ready()) return;
    paper(0, 0.32, 0.17, 700, 3000, 0.5);
    for (let i = 0; i < 5; i++) paper(0.05 + i * 0.05, 0.03, 0.09, 2400 + i * 280, 1800, 0.9);
  },
  /** Your turn: one soft, low ping. */
  turn() {
    if (!ready()) return;
    chime(659.25, 0, 0.045, 0.6);
  },
  /** Your clock is nearly out. */
  tick() {
    if (!ready()) return;
    paper(0, 0.03, 0.1, 3600, 3000, 2.5);
  },
  win() {
    if (!ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => chime(f, i * 0.12, 0.07, 1.1));
    chime(1318.5, 0.5, 0.055, 1.4);
  },
  lose() {
    if (!ready()) return;
    [392, 349.23, 293.66].forEach((f, i) =>
      tone({ freq: f, type: "triangle", peak: 0.065, attack: 0.012, decay: 0.7, when: i * 0.18 }),
    );
  },
};

/** Filtered noise that fades out as it plays, for the papery sounds (a card landing, a shuffle). */
function paper(at: number, dur: number, gain: number, from: number, to = from, q = 0.9) {
  const c = ctx!;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = q;
  const t = c.currentTime + at;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

/** A very short, sharp burst of noise: the crack of a card hitting the table. */
function snap(at: number, dur: number, gain: number, freq: number, type: BiquadFilterType = "highpass") {
  const c = ctx!;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-7 * i) / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 0.7;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(sfxBus);
  src.start(c.currentTime + at);
}

/** A bell-like note: the pitch plus a soft octave and twelfth, ringing out. */
function chime(freq: number, when: number, peak: number, dur: number) {
  tone({ freq, peak, attack: 0.012, decay: dur, when });
  tone({ freq: freq * 2, peak: peak * 0.32, attack: 0.012, decay: dur * 0.6, when });
  tone({ freq: freq * 3, peak: peak * 0.12, attack: 0.012, decay: dur * 0.35, when });
}

function startAmbience() {
  if (!ctx || ambience) return;
  const c = ctx;
  const nodes: AudioScheduledSourceNode[] = [];

  // Room tone: deep, warm rumble.
  const room = c.createBufferSource();
  room.buffer = brown;
  room.loop = true;
  const roomFilter = c.createBiquadFilter();
  roomFilter.type = "lowpass";
  roomFilter.frequency.value = 260;
  const roomGain = c.createGain();
  roomGain.gain.value = 0.55;
  room.connect(roomFilter).connect(roomGain).connect(ambBus);
  room.start();
  nodes.push(room);

  // The lamp's hum, slowly breathing.
  const hum = c.createOscillator();
  hum.frequency.value = 55;
  const hum2 = c.createOscillator();
  hum2.frequency.value = 110.4;
  const humGain = c.createGain();
  humGain.gain.value = 0.035;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.018;
  lfo.connect(lfoGain).connect(humGain.gain);
  const hum2Gain = c.createGain();
  hum2Gain.gain.value = 0.4;
  hum.connect(humGain);
  hum2.connect(hum2Gain).connect(humGain);
  humGain.connect(ambBus);
  for (const n of [hum, hum2, lfo]) {
    n.start();
    nodes.push(n);
  }

  // The stove: irregular crackles.
  let timer: number | undefined;
  const crackle = () => {
    if (!ctx) return;
    const pops = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 3) : 1;
    for (let i = 0; i < pops; i++) {
      noise({
        freq: 1400 + Math.random() * 3200,
        q: 0.8 + Math.random() * 2,
        type: "bandpass",
        peak: 0.03 + Math.random() * 0.09,
        attack: 0.001,
        decay: 0.008 + Math.random() * 0.03,
        when: i * (0.02 + Math.random() * 0.04),
        out: ambBus,
      });
    }
    timer = window.setTimeout(crackle, 90 + Math.random() * 650);
  };
  crackle();

  const now = c.currentTime;
  ambBus.gain.cancelScheduledValues(now);
  ambBus.gain.setValueAtTime(Math.max(ambBus.gain.value, 0.0001), now);
  ambBus.gain.linearRampToValueAtTime(0.32, now + 2.5);

  ambience = {
    stop() {
      window.clearTimeout(timer);
      const t = c.currentTime;
      ambBus.gain.cancelScheduledValues(t);
      ambBus.gain.setValueAtTime(ambBus.gain.value, t);
      ambBus.gain.linearRampToValueAtTime(0, t + 1.2);
      for (const n of nodes) n.stop(t + 1.3);
    },
  };
}

function stopAmbience() {
  ambience?.stop();
  ambience = null;
}

export function setAmbience(on: boolean) {
  ambienceWanted = on;
  if (!ctx) return;
  if (on) startAmbience();
  else stopAmbience();
}

export function setSfxVolume(v: number) {
  sfxVolume = v;
  if (ctx) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
}

export function setMuted(m: boolean) {
  muted = m;
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.08);
}

/** For other synthesised sounds (emotes): the running audio context and the effects bus, or null when muted/locked. */
export function sfxOutput(): { ctx: AudioContext; out: AudioNode } | null {
  if (!ready()) return null;
  return { ctx: ctx!, out: sfxBus };
}
