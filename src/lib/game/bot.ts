import { type Card, type Suit, SUITS, fullDeck, rankOf, suitOf } from "./cards";
import {
  type GameState,
  type Seat,
  RUNG_FROM_TRICK,
  beats,
  currentWinner,
  legalCards,
  playCard,
  teamOf,
} from "./engine";

/**
 * Heuristic computer player. It only looks at what its seat could legitimately know:
 * its own hand, cards already played, and the current trick.
 */
export function chooseCard(game: GameState, seat: Seat): Card {
  const deal = game.deal;
  const legal = legalCards(deal, seat);
  if (legal.length === 1) return legal[0];

  const hand = deal.hands[seat];
  const trump = deal.trump;
  const seen = new Set<Card>([...deal.played, ...hand]);
  const unseen = fullDeck().filter((c) => !seen.has(c));
  const isTop = (c: Card) => !unseen.some((u) => suitOf(u) === suitOf(c) && rankOf(u) > rankOf(c));

  const low = (cs: Card[]) => cs.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
  const high = (cs: Card[]) => cs.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
  const ofSuit = (cs: Card[], s: Suit) => cs.filter((c) => suitOf(c) === s);

  // ---- Leading -------------------------------------------------------------
  if (deal.trick.length === 0) {
    const sureWinners = legal.filter((c) => isTop(c) && suitOf(c) !== trump);
    if (sureWinners.length) return high(sureWinners);

    if (trump) {
      const trumps = ofSuit(legal, trump);
      if (trumps.length >= 4 && isTop(high(trumps))) return high(trumps);
    }
    const nonTrump = legal.filter((c) => suitOf(c) !== trump);
    const pool = nonTrump.length ? nonTrump : legal;
    const longest = SUITS.map((s) => ofSuit(pool, s)).sort((a, b) => b.length - a.length)[0];
    return low(longest);
  }

  // ---- Following -----------------------------------------------------------
  const lead = suitOf(deal.trick[0].card);
  const winning = currentWinner(deal.trick, trump)!;
  const partnerWinning = teamOf(winning.seat) === teamOf(seat);
  const isLast = deal.trick.length === 3;
  const partnerSafe =
    partnerWinning && (isLast || (isTop(winning.card) && (trump === null || suitOf(winning.card) === trump)));

  if (suitOf(legal[0]) === lead && legal.every((c) => suitOf(c) === lead)) {
    if (partnerSafe) return low(legal);
    const beaters = legal.filter((c) => beats(c, winning.card, lead, trump));
    if (beaters.length) {
      if (isLast) return low(beaters);
      if (isTop(high(beaters))) return high(beaters);
    }
    return low(legal);
  }

  // Void in the led suit, before the 5th haath: no Rung can be set yet, so throw the cheapest card,
  // keeping the strongest suit back to set Rung with later.
  if (trump === null && deal.tricksPlayed < RUNG_FROM_TRICK) {
    const keep = SUITS.filter((s) => s !== lead && ofSuit(hand, s).length)
      .map((s) => ({ s, score: suitStrength(ofSuit(hand, s)) }))
      .sort((a, b) => b.score - a.score)[0]?.s;
    const spare = legal.filter((c) => suitOf(c) !== keep);
    return discard(spare.length ? spare : legal);
  }

  // Void in the led suit.
  if (trump === null) {
    // Whatever we throw becomes trump — throw from our strongest suit.
    const best = SUITS.filter((s) => s !== lead && ofSuit(hand, s).length)
      .map((s) => ({ s, score: suitStrength(ofSuit(hand, s)) }))
      .sort((a, b) => b.score - a.score)[0].s;
    return low(ofSuit(legal, best));
  }

  const trumps = ofSuit(legal, trump);
  const others = legal.filter((c) => suitOf(c) !== trump);
  if (partnerSafe) return others.length ? discard(others) : low(trumps);

  const trumpBeaters = trumps.filter((c) => beats(c, winning.card, lead, trump));
  if (trumpBeaters.length) return low(trumpBeaters);
  return others.length ? discard(others) : low(trumps);

  function discard(cs: Card[]) {
    // Throw the lowest card, preferring short suits so we become void sooner.
    const bySuit = SUITS.map((s) => ofSuit(cs, s)).filter((g) => g.length);
    bySuit.sort((a, b) => rankOf(low(a)) - rankOf(low(b)) || a.length - b.length);
    return low(bySuit[0]);
  }
}

function suitStrength(cards: Card[]) {
  return cards.length * 3 + cards.reduce((n, c) => n + Math.max(0, rankOf(c) - 9), 0);
}

/** Lets every bot whose turn it is play, until a human is up or the deal ends. */
export function runBots(game: GameState, isBot: (seat: Seat) => boolean): GameState {
  let g = game;
  let guard = 60;
  while (!g.deal.result && isBot(g.deal.turn) && guard-- > 0) {
    g = playCard(g, g.deal.turn, chooseCard(g, g.deal.turn));
  }
  return g;
}
