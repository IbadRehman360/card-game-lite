import { CHARACTERS } from "../characters";

/**
 * The people who fill empty seats at a quick-match table (and at the local game Play falls back to when
 * the server can't be reached). They play with the same computer players as everywhere else; this file
 * only gives them a name, a face, a human pace and a few words to say. Shared by the server and the phone.
 */

const FIRST = [
  "Hamza", "Ali", "Ayesha", "Bilal", "Zainab", "Usman", "Fatima", "Saad", "Hira", "Danish",
  "Ahmed", "Mahnoor", "Umar", "Sana", "Farhan", "Iqra", "Hassan", "Areeba", "Talha", "Maryam",
  "Faizan", "Rabia", "Shoaib", "Noor", "Waqas", "Kiran", "Junaid", "Amna", "Imran", "Sidra",
  "Zeeshan", "Laiba", "Asad", "Mehwish", "Hamid", "Anum", "Kashif", "Sadia", "Fahad", "Alishba",
  "Rizwan", "Nimra", "Taimoor", "Bushra", "Shahzaib", "Aiman", "Arslan", "Javeria", "Haris", "Sobia",
  "Owais", "Tooba", "Adeel", "Uzma", "Zohaib", "Komal", "Moiz", "Rimsha", "Babar", "Hafsa",
];
const SURNAMES = ["khan", "malik", "butt", "sheikh", "qureshi", "raza", "mirza", "chaudhry", "abbasi", "baig"];

type Rng = () => number;
const pick = <T>(list: readonly T[], rng: Rng) => list[Math.floor(rng() * list.length)];

/** One username the way people type them: mostly a plain first name, sometimes with a number or a surname. */
function username(first: string, rng: Rng): string {
  const r = rng();
  if (r < 0.55) return first;
  if (r < 0.7) return `${first.toLowerCase()}_${pick(SURNAMES, rng)}`;
  if (r < 0.82) return `${first} ${String(1 + Math.floor(rng() * 99)).padStart(2, "0")}`;
  if (r < 0.9) return `${first}${pick(["", "_"], rng)}${["786", "92", "007", "10", "22"][Math.floor(rng() * 5)]}`;
  return `${first} ${pick(SURNAMES, rng).replace(/^./, (c) => c.toUpperCase())}`;
}

/** `n` names with no two from the same first name, none clashing with the names already at the table. */
export function personaNames(n: number, taken: string[] = [], rng: Rng = Math.random): string[] {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const pool = FIRST.filter((f) => !taken.some((t) => t.toLowerCase().startsWith(f.toLowerCase())));
  const out: string[] = [];
  while (out.length < n) {
    const source = pool.length ? pool : FIRST;
    const i = Math.floor(rng() * source.length);
    const first = source[i];
    if (pool.length) pool.splice(i, 1);
    const name = username(first, rng).slice(0, 16);
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** A character for each of them, drawn from whatever the character list holds, avoiding ones in use while it can. */
export function personaAvatars(n: number, taken: string[] = [], rng: Rng = Math.random): string[] {
  const ids = CHARACTERS.map((c) => c.id as string);
  let free = ids.filter((id) => !taken.includes(id));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!free.length) free = ids.slice();
    const k = Math.floor(rng() * free.length);
    out.push(free.splice(k, 1)[0]);
  }
  return out;
}

/**
 * How long a person takes over a move (ms): usually 1.5 to 5 s, now and then a snap move under a second
 * or a long think of 6 to 9 s, and always well inside the turn clock.
 */
export function humanThinkMs(turnSeconds: number, rng: Rng = Math.random): number {
  const r = rng();
  let ms: number;
  if (r < 0.1) ms = 450 + rng() * 500;
  else if (r < 0.2) ms = 6000 + rng() * 3000;
  else ms = 1500 + Math.pow(rng(), 1.4) * 3500; // leaning towards the quicker end
  return Math.round(Math.min(ms, turnSeconds * 1000 - 2000));
}

// ───────────── a few words at the table ─────────────

export type BanterMoment = "hello" | "win" | "loss" | "praise" | "end";

export const BANTER: Record<BanterMoment, string[]> = {
  hello: ["salam", "salam all", "chalo shuru karein", "gl all", "hi", "aoa", "gl hf", "chalo bhai", "ready"],
  win: ["wah!", "kya baat hai", "yesss", "easy", "haha", "sab mera", "shabash mujhe", "boom"],
  loss: ["uff", "yaar…", "ufff", "kya yaar", "nooo", "bad luck", "agli baar", "hmm"],
  praise: ["nice one", "wah", "good play", "kya baat hai", "well played", "acha khela"],
  end: ["gg", "gg all", "gg wp", "acha game tha", "gg, ek aur?", "gg yaar"],
};

/** Stickers that fit each moment (ids from lib/stickers). */
export const BANTER_STICKERS: Record<BanterMoment, string[]> = {
  hello: ["king-cool"],
  win: ["king-lol", "king-wah", "sab-mera", "on-fire"],
  loss: ["queen-cry", "jack-sweat", "oops"],
  praise: ["jack-shabash", "king-wah"],
  end: ["gg"],
};

/** Something to say at this moment: mostly words, sometimes a sticker. */
export function banterLine(moment: BanterMoment, rng: Rng = Math.random): { text: string } | { sticker: string } {
  if (rng() < 0.25) return { sticker: pick(BANTER_STICKERS[moment], rng) };
  return { text: pick(BANTER[moment], rng) };
}

/** No more than one line from the table's computer players in this long (ms). */
export const BANTER_GAP_MS = 20_000;

/**
 * A quick-match search: people looking for the same game can sit down for up to about 30 s, and the
 * players found for the seats left arrive one by one across that wait, the first 6 to 12 s in and the
 * last 20 to 28 s in, so a table never deals within a few seconds. Used by the server, and by the phone
 * when it can't reach one and searches on its own.
 */
export const QUICK_FIRST_MS: [number, number] = [6_000, 12_000];
export const QUICK_LAST_MS: [number, number] = [20_000, 28_000];

export function quickSchedule(n: number, openedAt: number, taken: string[] = [], rng: Rng = Math.random) {
  const names = personaNames(n, taken, rng);
  const avatars = personaAvatars(n, [], rng);
  const span = ([lo, hi]: [number, number]) => lo + rng() * (hi - lo);
  const first = span(QUICK_FIRST_MS);
  const last = Math.max(first + 2_000, span(QUICK_LAST_MS));
  return names.map((name, i) => {
    // evenly spread between the first and the last, each nudged a little so it doesn't look timed
    const even = n === 1 ? span([10_000, 20_000]) : first + ((last - first) * i) / (n - 1);
    const jitter = n === 1 || i === 0 || i === n - 1 ? 0 : (rng() - 0.5) * ((last - first) / (n - 1)) * 0.5;
    return { at: Math.round(openedAt + even + jitter), name, avatar: avatars[i] };
  });
}
