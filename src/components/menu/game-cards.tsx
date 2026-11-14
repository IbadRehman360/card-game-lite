"use client";

import type { CSSProperties, ReactNode } from "react";
import { PaanchPreview } from "@/components/paanch/paanch-preview";
import { CostTag } from "@/components/shop/cost-tag";
import { CardFace } from "@/components/game/playing-card";

/** A card painted exactly like the cards in every game, e.g. "KH", "TS". */
function Card({ id, r = 0, x = 0, y = 0, back }: { id?: string; r?: number; x?: number; y?: number; back?: boolean }) {
  const style = { "--r": `${r}deg`, "--x": `${x}%`, "--y": `${y}%` } as CSSProperties;
  if (back || !id) return <i className="gc-card gc-back" style={style} aria-hidden />;
  return (
    <span className="gc-card gc-face" style={style} aria-hidden>
      <CardFace card={id} />
    </span>
  );
}

const Chip = ({ x, y, tone }: { x: number; y: number; tone: "red" | "blue" | "gold" }) => (
  <i className="gc-chip" data-tone={tone} style={{ "--x": `${x}%`, "--y": `${y}%` } as CSSProperties} aria-hidden />
);

const Cylinder = () => (
  <svg className="gc-cylinder" viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="26" fill="#2b2118" stroke="#d9b45a" strokeWidth="3" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      return (
        <circle
          key={i}
          cx={32 + Math.cos(a) * 14}
          cy={32 + Math.sin(a) * 14}
          r="6"
          fill={i === 0 ? "#c0392b" : "#0d0906"}
          stroke="#8a6a2c"
          strokeWidth="1.5"
        />
      );
    })}
    <circle cx="32" cy="32" r="3.5" fill="#d9b45a" />
  </svg>
);

export type GameCardId = "rung" | "patti" | "bluff" | "paanch" | "bhabhi" | "gpatta";

export const GAME_CARDS: { id: GameCardId; name: string; players: string; text: string; art: ReactNode }[] = [
  {
    id: "rung",
    name: "Rung",
    players: "4 players",
    text: "Team up with your partner and win tricks",
    art: (
      <div className="gc-fan">
        <Card id="AS" r={-21} x={-70} y={6} />
        <Card id="KH" r={-7} x={-24} y={0} />
        <Card id="QD" r={7} x={24} y={0} />
        <Card id="JC" r={21} x={70} y={6} />
      </div>
    ),
  },
  {
    id: "patti",
    name: "3 Patti",
    players: "4 players",
    text: "Bet coins on the best three cards",
    art: (
      <div className="gc-fan">
        <Card id="AH" r={-14} x={-46} y={4} />
        <Card id="AS" r={0} x={0} y={0} />
        <Card id="AD" r={14} x={46} y={4} />
        <Chip x={-150} y={70} tone="red" />
        <Chip x={150} y={66} tone="gold" />
      </div>
    ),
  },
  {
    id: "bluff",
    name: "Bluff",
    players: "4 players",
    text: "Lie about your cards, call out liars",
    art: (
      <div className="gc-fan">
        <Card back r={-16} x={-60} y={6} />
        <Card back r={-4} x={-20} y={2} />
        <Card id="KS" r={10} x={22} y={2} />
        <Cylinder />
      </div>
    ),
  },
  {
    id: "paanch",
    name: "Paanch",
    players: "2 or 4 players",
    text: "Play cards to make five in a row",
    art: (
      <div className="gc-board">
        <PaanchPreview />
      </div>
    ),
  },
  {
    id: "bhabhi",
    name: "Bhabhi",
    players: "4 players",
    text: "Get rid of all your cards first",
    art: (
      <div className="gc-fan">
        <Card id="9H" r={-24} x={-62} y={8} />
        <Card id="KH" r={-8} x={-22} y={0} />
        <Card id="4H" r={8} x={22} y={2} />
        <Card id="QS" r={28} x={66} y={10} />
        <span className="gc-stamp">Thulla!</span>
      </div>
    ),
  },
  {
    id: "gpatta",
    name: "G Patta",
    players: "4 players",
    text: "Throw pairs, don’t get stuck with the odd card",
    art: (
      <div className="gc-fan">
        <Card id="7H" r={-12} x={-52} y={4} />
        <Card id="7C" r={0} x={-12} y={0} />
        <Card id="QS" r={18} x={58} y={-4} />
        <span className="gc-g">G</span>
      </div>
    ),
  },
];

/** One game on the home screen, as a row: picture, name, what you do, players, price. */
export function GameCard({
  game,
  fee,
  index,
  autoFocus,
  onClick,
}: {
  game: (typeof GAME_CARDS)[number];
  fee: number;
  index: number;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="gc"
      style={{ "--i": index } as CSSProperties}
      autoFocus={autoFocus}
      onClick={onClick}
      aria-label={`${game.name}, ${game.players}, ${fee} coins`}
    >
      <span className="gc-art">{game.art}</span>
      <span className="gc-info">
        <b className="gc-name">{game.name}</b>
        <span className="gc-tag">{game.text}</span>
        <span className="gc-players">{game.players}</span>
      </span>
      <CostTag amount={fee} className="gc-fee" />
    </button>
  );
}
