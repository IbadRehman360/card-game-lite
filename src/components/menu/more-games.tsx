import type { ReactNode } from "react";
import type { ExtraId } from "./modes";
import { feeFor } from "@/lib/wallet/economy";
import { PaanchPreview } from "@/components/paanch/paanch-preview";
import { BhabhiPreview } from "@/components/bhabhi/bhabhi-preview";
import { GPattaPreview } from "@/components/gpatta/gpatta-preview";

/** A game beyond Rung and 3 Patti: its tile on the home screen. Its guide is in ./how-to-play. */
export interface ExtraGame {
  id: ExtraId;
  name: string;
  /** Under the name on the tile. */
  note: string;
  /** Coins to sit down. */
  fee: number;
  art: ReactNode;
}

const BluffArt = (
  <svg viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="22" fill="#2b2118" stroke="#d9b45a" strokeWidth="3" />
    {[0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      return <circle key={i} cx={32 + Math.cos(a) * 12} cy={32 + Math.sin(a) * 12} r="5" fill={i === 0 ? "#c0392b" : "#0d0906"} stroke="#8a6a2c" strokeWidth="1.5" />;
    })}
    <circle cx="32" cy="32" r="3" fill="#d9b45a" />
  </svg>
);

/** The games that are built and playable. New ones are added here. */
export const EXTRAS: ExtraGame[] = [
  {
    id: "bluff",
    name: "Bluff",
    note: "Lie or die",
    fee: feeFor("bluff"),
    art: BluffArt,
  },
  {
    id: "paanch",
    name: "Paanch",
    note: "Five in a row",
    fee: feeFor("paanch"),
    art: <PaanchPreview />,
  },
  {
    id: "bhabhi",
    name: "Bhabhi",
    note: "Don't be last",
    fee: feeFor("bhabhi"),
    art: <BhabhiPreview />,
  },
  {
    id: "gpatta",
    name: "G Patta",
    note: "Don't keep the G",
    fee: feeFor("gpatta"),
    art: <GPattaPreview />,
  },
];

export const extraById = (id: ExtraId) => EXTRAS.find((g) => g.id === id) ?? null;
