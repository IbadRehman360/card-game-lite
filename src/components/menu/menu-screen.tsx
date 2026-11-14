"use client";

import { useState } from "react";
import { sfx } from "@/lib/sfx";
import { TABLES, type TableId } from "@/lib/patti/engine";
import { PATTI_FEE, RUNG_FEE, feeFor } from "@/lib/wallet/economy";
import { Logo } from "./logo";
import { CostTag } from "@/components/shop/cost-tag";
import { CODE_LENGTH, type ExtraId, type GameKind, cleanCode } from "./modes";
import { GAME_CARDS, GameCard } from "./game-cards";

export type MenuAction = "play" | "multiplayer" | "rules" | "settings";


const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="26"
    height="26"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

/**
 * The home menu in two steps. First the game, on two posters (Rung, 3 Patti). Then how to play it,
 * in the old layout: two big buttons and a table code to join.
 */
export function MenuScreen({
  game,
  onGame,
  onPick,
  onHost,
  onPatti,
  onJoin,
  onExtra,
}: {
  game: GameKind | null;
  onGame: (g: GameKind | null) => void;
  onPick: (action: MenuAction) => void;
  onHost: (game: GameKind, boot: number) => void;
  onPatti: (table: TableId) => void;
  onJoin: (code: string) => void;
  onExtra: (id: ExtraId) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fee = game === "patti" ? PATTI_FEE : RUNG_FEE;
  const coin = (
<CostTag amount={fee} className="home-cost" />
  );
  // one 3 Patti table for everyone: no boot or table picker
  const table = TABLES[0];

  return (
    <div className="menu">
      <div className="home-corner">
        <button
          type="button"
          className="icon-button"
          aria-label="How to play"
          title="How to play"
          onClick={() => {
            sfx.select();
            onPick("rules");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2V15" />
            <path d="M12 18.5v.01" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => {
            sfx.select();
            onPick("settings");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>
        </button>
      </div>

      {game === null ? (
        <div className="home-body home-games">
          <Logo className="menu-logo" />
          <section className="games-panel">
          <div className="games" role="list">
            {GAME_CARDS.map((g, i) => (
              <GameCard
                key={g.id}
                game={g}
                index={i}
                autoFocus={i === 0}
                fee={feeFor(g.id)}
                onClick={() => {
                  sfx.select();
                  if (g.id === "rung" || g.id === "patti") onGame(g.id);
                  else onExtra(g.id);
                }}
              />
            ))}
          </div>
          </section>
        </div>
      ) : (
        <div className="home-body">
          <Logo className="menu-logo" />
          <button
            type="button"
            className="icon-button corner-back menu-back"
            aria-label="Back to games"
            onClick={() => {
              sfx.back();
              onGame(null);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 5 8 12l7 7" />
            </svg>
          </button>

          <div className="home-buttons">
            <button
              type="button"
              className="home-btn home-btn-gold"
              autoFocus
              onClick={() => {
                sfx.select();
                if (game === "patti") onPatti(table.id);
                else onPick("play");
              }}
            >
              <Svg>
                <rect x="3" y="4" width="18" height="12" rx="2.5" />
                <path d="M9 20h6M12 16v4" />
                <path d="M9.5 8.5 14.5 10l-5 1.5Z" />
              </Svg>
              Play vs computer
              {coin}
            </button>
            <button
              type="button"
              className="home-btn home-btn-ghost"
              onClick={() => {
                sfx.select();
                onHost(game, table.boot);
              }}
            >
              <Svg>
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18.5 14.4c1.6.8 2.5 2.4 2.5 4.6" />
              </Svg>
              Host a game
              {coin}
            </button>
          </div>

          <form
            className="home-join"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length !== CODE_LENGTH) {
                setError(code ? `Table codes are ${CODE_LENGTH} digits` : "Type the code your friend sent you");
                sfx.back();
                return;
              }
              sfx.select();
              onJoin(code);
            }}
          >
            <label htmlFor="home-code" className="home-or">
              <span />
              or join a table
              <span />
            </label>
            <div className="home-field">
              <div className="home-code">
              <span className="home-tiles" aria-hidden>
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span key={i} data-next={i === code.length}>
                    {code[i] ?? ""}
                  </span>
                ))}
              </span>
              <input
                id="home-code"
                className="home-input"
                aria-label="Table code"
                value={code}
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={CODE_LENGTH}
                aria-invalid={!!error}
                aria-describedby={error ? "home-code-error" : undefined}
                onChange={(e) => {
                  setCode(cleanCode(e.target.value));
                  setError(null);
                }}
              />
              </div>
              <button type="submit" className="icon-button home-go" data-ready={code.length === CODE_LENGTH} aria-label="Join table">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            {error && (
              <p id="home-code-error" className="home-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
