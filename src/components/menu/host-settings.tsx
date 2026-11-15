"use client";

import { useState } from "react";
import { sfx } from "@/lib/sfx";
import { specFor, type TableGame } from "@/lib/game/table-games";
import { CostTag } from "@/components/shop/cost-tag";
import type { HostOptions } from "./modes";

/**
 * What the host picks before the table is made. Every row comes from the game's spec in
 * src/lib/game/table-games.ts, so a new game only has to be listed there to get its settings here.
 */
export function HostSettings({
  game,
  fee,
  onBack,
  onStart,
}: {
  game: TableGame;
  fee: number;
  onBack: () => void;
  onStart: (options: HostOptions) => void;
}) {
  const spec = specFor(game);
  const [picked, setPicked] = useState<Partial<Record<string, number>>>(() =>
    Object.fromEntries(spec.settings.map((s) => [s.key, s.fallback])),
  );

  const options: HostOptions = {
    players: picked.players ?? spec.defaultPlayers,
    ...(picked.series !== undefined ? { series: (picked.series === 5 ? 5 : 3) as 3 | 5 } : {}),
    ...(picked.boot !== undefined ? { boot: picked.boot } : {}),
  };

  return (
    <div className="host-setup">
      <div className="host-head">
        <button
          type="button"
          className="icon-button corner-back host-back"
          aria-label="Back"
          onClick={() => {
            sfx.back();
            onBack();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <p className="host-title">
          Host <b>{spec.name}</b>
        </p>
      </div>

      {spec.settings.map((setting) => (
        <div className="host-row" key={setting.key}>
          <p className="host-label">{setting.label}</p>
          <div className="host-pills" role="radiogroup" aria-label={setting.label}>
            {setting.choices.map((choice) => {
              const on = (picked[setting.key] ?? setting.fallback) === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (on) return;
                    sfx.flip();
                    setPicked((p) => ({ ...p, [setting.key]: choice.value }));
                  }}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        className="home-btn home-btn-gold host-go"
        autoFocus
        onClick={() => {
          sfx.select();
          onStart(options);
        }}
      >
        Create table
        <CostTag amount={fee} className="home-cost" />
      </button>
    </div>
  );
}
