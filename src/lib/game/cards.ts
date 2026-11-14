// Cards are plain strings so game state stays trivially JSON-serialisable:
// rank char + suit char, e.g. "AS" (ace of spades), "TD" (ten of diamonds), "2C".

export type Suit = "C" | "D" | "H" | "S";
export type Card = string;

export const SUITS: Suit[] = ["S", "H", "C", "D"];
export const RANKS = "23456789TJQKA";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };

export const OPENING_CARD: Card = "2C";

export const suitOf = (c: Card) => c[1] as Suit;
/** 2..14 (ace high). */
export const rankOf = (c: Card) => RANKS.indexOf(c[0]) + 2;
export const isRed = (s: Suit) => s === "H" || s === "D";

export function rankLabel(c: Card) {
  const r = c[0];
  return r === "T" ? "10" : r;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

export function shuffle<T>(items: T[], random: () => number = secureRandom): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** High-card points: A 4, K 3, Q 2, J 1 (40 in the deck, 10 per hand on average). */
export function highCardPoints(hand: Card[]) {
  return hand.reduce((n, c) => n + Math.max(0, rankOf(c) - 10), 0);
}

/**
 * Deals four 13-card hands that are random but fair. A properly shuffled deck is dealt out and the
 * deal is kept only if nobody is stacked or starved:
 * - every hand holds 2 to 5 cards of each suit (no voids, no very long suits),
 * - every hand has 8 to 12 high-card points, and no more than 2 aces,
 * - the two partnerships are within 3 points of each other.
 * Roughly one shuffle in a hundred qualifies, which takes well under a millisecond to find.
 */
export function balancedDeal(random: () => number = secureRandom): Card[][] {
  let best: { hands: Card[][]; score: number } | null = null;
  for (let attempt = 0; attempt < 20000; attempt++) {
    const deck = shuffle(fullDeck(), random);
    const hands = [0, 1, 2, 3].map((p) => deck.slice(p * 13, p * 13 + 13));
    const score = unfairness(hands);
    if (score === 0) return hands;
    if (!best || score < best.score) best = { hands, score };
  }
  return best!.hands;
}

/** 0 for a deal that meets every rule above; larger the further it is from that. */
function unfairness(hands: Card[][]) {
  let bad = 0;
  const hcp = hands.map(highCardPoints);
  for (const [i, hand] of hands.entries()) {
    for (const s of SUITS) {
      const n = hand.filter((c) => suitOf(c) === s).length;
      if (n < 2) bad += 2 - n;
      if (n > 5) bad += n - 5;
    }
    if (hcp[i] < 8) bad += 8 - hcp[i];
    if (hcp[i] > 12) bad += hcp[i] - 12;
    const aces = hand.filter((c) => c[0] === "A").length;
    if (aces > 2) bad += aces - 2;
  }
  const gap = Math.abs(hcp[0] + hcp[2] - (hcp[1] + hcp[3]));
  if (gap > 3) bad += gap - 3;
  return bad;
}

// Cryptographically random numbers, fetched in batches (one crypto call per number is slow).
const pool = new Uint32Array(1024);
let poolAt = pool.length;
function secureRandom() {
  if (poolAt === pool.length) {
    globalThis.crypto.getRandomValues(pool);
    poolAt = 0;
  }
  return pool[poolAt++] / 2 ** 32;
}

/**
 * Display order for a hand: suits alternate colour, trump suit first once known,
 * ranks ascending within a suit.
 */
export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const order: Suit[] = trump
    ? [trump, ...SUITS.filter((s) => s !== trump)]
    : SUITS.slice();
  // Keep colours alternating where possible after moving trump to the front.
  if (trump) {
    const rest = order.slice(1);
    const red = rest.filter(isRed);
    const black = rest.filter((s) => !isRed(s));
    const firstOpposite = isRed(trump) ? black : red;
    const same = isRed(trump) ? red : black;
    order.splice(1, 3, ...interleave(firstOpposite, same));
  }
  return hand
    .slice()
    .sort((a, b) => order.indexOf(suitOf(a)) - order.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));
}

function interleave<T>(a: T[], b: T[]) {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== undefined) out.push(a[i]);
    if (b[i] !== undefined) out.push(b[i]);
  }
  return out;
}
