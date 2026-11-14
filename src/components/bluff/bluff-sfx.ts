import { sfxOutput } from "@/lib/sfx";

/*
 * Bluff's own sounds, synthesised on the shared effects bus (so volume and mute apply):
 * cards sliding onto the pile, the cylinder spinning, a dry click, and the bang.
 */

function noiseBuffer(ctx: AudioContext, secs: number) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(
  ctx: AudioContext,
  out: AudioNode,
  { when = 0, freq, q = 1, type, peak, attack = 0.002, decay }: { when?: number; freq: number; q?: number; type: BiquadFilterType; peak: number; attack?: number; decay: number },
) {
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, attack + decay + 0.05);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + attack + decay + 0.05);
}

function thump(ctx: AudioContext, out: AudioNode, { when = 0, freq, to, peak, decay }: { when?: number; freq: number; to: number; peak: number; decay: number }) {
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(to, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
}

export const bluffSfx = {
  /** Cards slid face down onto the pile, one swish each. */
  slide(count = 1) {
    const a = sfxOutput();
    if (!a) return;
    for (let i = 0; i < count; i++) {
      burst(a.ctx, a.out, { when: i * 0.09, freq: 2600, q: 0.8, type: "bandpass", peak: 0.22, attack: 0.01, decay: 0.12 });
      burst(a.ctx, a.out, { when: i * 0.09 + 0.1, freq: 900, q: 0.7, type: "lowpass", peak: 0.18, decay: 0.05 });
    }
  },
  /** A fist on the table: "Liar!" */
  call() {
    const a = sfxOutput();
    if (!a) return;
    thump(a.ctx, a.out, { freq: 140, to: 50, peak: 0.6, decay: 0.25 });
    burst(a.ctx, a.out, { freq: 600, type: "lowpass", peak: 0.4, decay: 0.12 });
    thump(a.ctx, a.out, { when: 0.13, freq: 120, to: 45, peak: 0.45, decay: 0.22 });
  },
  /** The cylinder spinning: a run of ratchet clicks that slows down. */
  spin() {
    const a = sfxOutput();
    if (!a) return;
    let t = 0;
    for (let i = 0; i < 14; i++) {
      burst(a.ctx, a.out, { when: t, freq: 4200, q: 3, type: "bandpass", peak: 0.12, decay: 0.012 });
      t += 0.035 + i * 0.008;
    }
  },
  /** The hammer falls on an empty chamber. */
  click() {
    const a = sfxOutput();
    if (!a) return;
    burst(a.ctx, a.out, { freq: 3200, q: 2.5, type: "bandpass", peak: 0.55, attack: 0.001, decay: 0.03 });
    burst(a.ctx, a.out, { when: 0.012, freq: 1400, q: 2, type: "bandpass", peak: 0.3, decay: 0.05 });
  },
  /** The live round: a sharp crack, a low thump, and the room ringing after it. */
  bang() {
    const a = sfxOutput();
    if (!a) return;
    // a short slap-back echo for the room
    const echo = a.ctx.createDelay(0.5);
    echo.delayTime.value = 0.11;
    const fb = a.ctx.createGain();
    fb.gain.value = 0.32;
    const tone = a.ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1400;
    echo.connect(tone).connect(fb).connect(echo);
    tone.connect(a.out);
    const room = a.ctx.createGain();
    room.gain.value = 0.5;
    room.connect(echo);
    burst(a.ctx, a.out, { freq: 6000, q: 0.7, type: "highpass", peak: 0.7, attack: 0.0005, decay: 0.06 });
    burst(a.ctx, a.out, { freq: 3200, q: 0.5, type: "lowpass", peak: 1, attack: 0.001, decay: 0.32 });
    burst(a.ctx, room, { freq: 2400, q: 0.5, type: "lowpass", peak: 0.8, attack: 0.001, decay: 0.25 });
    thump(a.ctx, a.out, { freq: 170, to: 34, peak: 1, decay: 0.5 });
    burst(a.ctx, a.out, { when: 0.05, freq: 500, q: 0.6, type: "lowpass", peak: 0.35, attack: 0.02, decay: 1.4 });
    // let the echo die away, then unhook it
    window.setTimeout(() => {
      try {
        room.disconnect();
        echo.disconnect();
        fb.disconnect();
        tone.disconnect();
      } catch {}
    }, 2500);
  },
  /** The hammer drawn back: two quick metal clicks. */
  cock() {
    const a = sfxOutput();
    if (!a) return;
    burst(a.ctx, a.out, { freq: 2600, q: 3, type: "bandpass", peak: 0.4, attack: 0.001, decay: 0.025 });
    burst(a.ctx, a.out, { when: 0.07, freq: 3800, q: 4, type: "bandpass", peak: 0.5, attack: 0.001, decay: 0.03 });
    thump(a.ctx, a.out, { when: 0.07, freq: 900, to: 400, peak: 0.12, decay: 0.05 });
  },
  /** Two low beats of a heart while everyone waits. */
  heartbeat() {
    const a = sfxOutput();
    if (!a) return;
    for (const w of [0, 0.32]) {
      thump(a.ctx, a.out, { when: w, freq: 70, to: 40, peak: 0.7, decay: 0.18 });
      thump(a.ctx, a.out, { when: w + 0.14, freq: 60, to: 36, peak: 0.45, decay: 0.16 });
    }
  },
  /** Somebody hitting the floor. */
  thud() {
    const a = sfxOutput();
    if (!a) return;
    thump(a.ctx, a.out, { freq: 110, to: 35, peak: 0.75, decay: 0.32 });
    burst(a.ctx, a.out, { freq: 380, q: 0.7, type: "lowpass", peak: 0.4, attack: 0.004, decay: 0.2 });
    thump(a.ctx, a.out, { when: 0.16, freq: 80, to: 30, peak: 0.35, decay: 0.2 });
  },
};
