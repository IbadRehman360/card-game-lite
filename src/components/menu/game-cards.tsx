"use client";

import type { CSSProperties, ReactNode } from "react";
import { PaanchPreview } from "@/components/paanch/paanch-preview";
import { CardFace } from "@/components/game/playing-card";
import { specFor, type TableGame } from "@/lib/game/table-games";

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

export type GameCardId = TableGame;

/** How many can sit down, read off the game's spec: "4", "2 or 4", "3–6". */
function seatLabel(id: GameCardId) {
  const seats = specFor(id).players;
  if (seats.length === 1) return `${seats[0]}`;
  const run = seats.every((n, i) => i === 0 || n === seats[i - 1] + 1);
  return run ? `${seats[0]}–${seats[seats.length - 1]}` : seats.join(" or ");
}

export const GAME_CARDS: { id: GameCardId; name: string; text: string; art: ReactNode }[] = [
  {
    id: "rung",
    name: "Rung",
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

/** One game on the home screen, as a row: picture, name, what you do, players. */
export function GameCard({
  game,
  index,
  autoFocus,
  onClick,
}: {
  game: (typeof GAME_CARDS)[number];
  index: number;
  autoFocus?: boolean;
  onClick: () => void;
}) {
  const seats = seatLabel(game.id);
  return (
    <button
      type="button"
      className="gc"
      style={{ "--i": index } as CSSProperties}
      autoFocus={autoFocus}
      onClick={onClick}
      aria-label={`${game.name}, ${seats} players`}
    >
      <span className="gc-art">{game.art}</span>
      <span className="gc-info">
        <span className="gc-head">
          <b className="gc-name">{game.name}</b>
          <span className="gc-players" title={`${seats} players`}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
            </svg>
            {seats}
          </span>
        </span>
        <span className="gc-tag">{game.text}</span>
      </span>
    </button>
  );
}
