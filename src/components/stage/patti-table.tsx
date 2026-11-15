"use client";

import type { CSSProperties } from "react";
import type { PattiState, Seat } from "@/lib/patti/engine";
import { MID, SEAT_AT, SEAT_ROT, TableCard, TagProjector, toward } from "./table-play";

/** What the stage needs to draw a 3 Patti deal. */
export interface PattiStageTable {
  seatChars: number[];
  state: PattiState;
  dealKey: string;
}

const CHIP_COLORS = ["#c8372d", "#f2c14e", "#f4ecd8", "#8e1f2c", "#b8762a"];
const dealAt = (i: number, seat: number) => (i * 4 + seat) * 0.09;

/** The three cards in front of each player, the pot in the middle and a chip for every bet. */
export function PattiTable({ table }: { table: PattiStageTable }) {
  const { state, dealKey } = table;
  const shown = new Set(state.result?.shown ?? []);
  const bets = state.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === "chaal" || e.type === "show" || e.type === "sideshowAsk")
    .slice(-3);
  const n = state.pot <= 0 ? 0 : Math.min(18, Math.ceil(Math.log2(state.pot / state.rules.boot + 1) * 2));
  return (
    <>
      <TagProjector />
      {([1, 2, 3] as Seat[]).map((s) =>
        state.dealNo > 0 && !state.players[s].out
          ? [0, 1, 2].map((i) => {
              // the player across keeps their cards up by their own edge, clear of the pot
              const base = toward(s, s === 2 ? 1.02 : 0.78);
              const side = s % 2 === 1;
              const off = (i - 1) * 3.5;
              const at: [number, number] = side ? [base[0], base[1] + off * 1.6] : [base[0] + off, base[1]];
              return (
                <TableCard
                  key={`${dealKey}-${s}-${i}`}
                  c={shown.has(s) ? state.hands[s][i] : null}
                  at={at}
                  rot={SEAT_ROT[s] + (i - 1) * 8}
                  from={MID}
                  fromRot={SEAT_ROT[s] + 200}
                  delay={dealAt(i, s)}
                  className={`st-patti ${state.players[s].folded && !shown.has(s) ? "st-folded" : ""}`}
                />
              );
            })
          : null,
      )}
      {n > 0 && (
        <span className="st-pot" style={{ left: `${MID[0]}%`, top: `${MID[1]}%` }}>
          {Array.from({ length: n }, (_, i) => (
            <i
              key={i}
              className="st-chip"
              style={
                {
                  "--c": CHIP_COLORS[(i * 7) % CHIP_COLORS.length],
                  translate: `${((i % 3) - 1) * 70}% ${-Math.floor(i / 3) * 4}px`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
      {bets.map(({ e, i }) =>
        "seat" in e ? (
          <i
            key={`${dealKey}-${i}`}
            className="st-chip st-chip-fly"
            style={
              {
                "--c": CHIP_COLORS[i % CHIP_COLORS.length],
                "--fx": `${SEAT_AT[e.seat][0]}%`,
                "--fy": `${SEAT_AT[e.seat][1]}%`,
                left: `${MID[0]}%`,
                top: `${MID[1]}%`,
              } as CSSProperties
            }
          />
        ) : null,
      )}
    </>
  );
}
