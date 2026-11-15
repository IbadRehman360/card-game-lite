import type { GameKind } from "@/lib/wallet/economy";

/**
 * The "How to play" guide for every game, written from what the engines in src/lib actually do.
 * Text may mark key words with **double stars**: they are drawn in gold (see RulesPanel).
 */
export interface GuideStep {
  /** Bold lead-in, ending in a full stop. */
  title: string;
  text: string;
}

export interface Guide {
  /** One short line: who plays and what you are after. */
  intro: string;
  steps: GuideStep[];
}

export const GUIDES: Record<GameKind, Guide> = {
  rung: {
    intro: "4 players, 2 teams. Your partner sits opposite.",
    steps: [
      { title: "Lead.", text: "The 2♣ opens. Each round of four cards is a **haath**." },
      { title: "Follow suit.", text: "Play the led suit if you can; the highest card wins." },
      { title: "Rung.", text: "From haath 5, the first off-suit card makes its suit trump." },
      { title: "Take the stack.", text: "Once Rung is set, win two haaths in a row to take the pile." },
      { title: "Win.", text: "First team to **7 haaths** wins the deal." },
    ],
  },

  patti: {
    intro: "Up to 4 players, three cards each. Best hand takes the pot.",
    steps: [
      { title: "Boot.", text: "Everyone pays the boot into the pot to play." },
      { title: "Blind or seen.", text: "Bet without looking, or look and pay double." },
      { title: "Your turn.", text: "Pack to quit, **chaal** to stay in, or raise the stake." },
      { title: "Show.", text: "With two players left, pay a chaal to compare hands." },
      { title: "Hands.", text: "Trail, pure sequence, sequence, color, pair, high card." },
    ],
  },

  bluff: {
    intro: "4 players. Lie well, and keep your revolver cold.",
    steps: [
      { title: "Claim.", text: "Lay 1–3 cards face down as the table card. Jokers are wild." },
      { title: "Call.", text: "The next player plays on or shouts **Liar!**" },
      { title: "Revolver.", text: "Whoever was wrong pulls the trigger: 1 live round in 6." },
      { title: "Win.", text: "Be the last player alive." },
    ],
  },

  paanch: {
    intro: "2 players, or 4 in two teams, on a 10×10 board of cards.",
    steps: [
      { title: "Play.", text: "Play a card and chip a free square showing it." },
      { title: "Jacks.", text: "♦♣ jacks are wild; ♥♠ jacks remove a chip." },
      { title: "Corners.", text: "The four corners count for everyone." },
      { title: "Win.", text: "Make **two lines of five** first." },
    ],
  },

  bhabhi: {
    intro: "3 to 6 players. Don't be the last one holding cards.",
    steps: [
      { title: "Open.", text: "The A♠ leads; the first round is thrown away." },
      { title: "Follow suit.", text: "Highest card of the led suit leads next." },
      { title: "Thulla.", text: "Can't follow? Play anything; the top card picks up the pile." },
      { title: "Lose.", text: "Last player with cards is the **Bhabhi**." },
    ],
  },

  gpatta: {
    intro: "2 to 6 players. One card can never be paired.",
    steps: [
      { title: "The G.", text: "One card is taken out, so its partner is the odd one." },
      { title: "Pairs.", text: "Throw away every pair in your hand." },
      { title: "Draw.", text: "Take a hidden card from the next player." },
      { title: "Lose.", text: "Last player holding the odd card is **G**." },
    ],
  },
};

/** Coins, under every game's guide (see lib/wallet/economy). */
export const COIN_LINE = "Practice is free. Friend tables cost a few coins; winners collect.";

/** Splits text on **gold** markers: odd pieces are the highlighted ones. */
export const splitHighlights = (text: string) => text.split(/\*\*(.+?)\*\*/g);
