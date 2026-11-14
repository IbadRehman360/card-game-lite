"use client";

import { useState } from "react";
import { sfx } from "@/lib/sfx";
import { specFor, type TableGame } from "@/lib/game/table-games";
import { Logo } from "./logo";
import { CostTag } from "@/components/shop/cost-tag";
import { CODE_LENGTH, type HostOptions, cleanCode, hostFee } from "./modes";
import { GAME_CARDS, GameCard } from "./game-cards";
import { HostSettings } from "./host-settings";

export type MenuAction = "play" | "multiplayer" | "rules" | "settings";


/**
 * The home menu in two steps. First the game, as a list of cards. Then how to play it — the same three
 * ways for every game: against the computer, hosting a table, or joining a friend's by code. Hosting
 * opens a third step with the settings that game allows.
 */
export function MenuScreen({
  game,
  onGame,
  onPick,
  onHost,
  onPlay,
  onJoin,
}: {
  game: TableGame | null;
  onGame: (g: TableGame | null) => void;
  onPick: (action: MenuAction) => void;
  onHost: (game: TableGame, options: HostOptions) => void;
  onPlay: (game: TableGame) => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // the game whose host settings are open (null: still on the three modes)
  const [hostFor, setHostFor] = useState<TableGame | null>(null);
  const hosting = game !== null && hostFor === game;
  // only hosting costs coins; playing the computer is free
  const fee = hostFee(game);
  const coin = <CostTag amount={fee} className="home-cost" />;

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
                onClick={() => {
                  sfx.select();
                  onGame(g.id);
                }}
              />
            ))}
          </div>
          </section>
        </div>
      ) : hosting ? (
        <div className="home-body home-host">
          <Logo className="menu-logo" />
          <HostSettings
            key={game}
            game={game}
            fee={fee}
            onBack={() => setHostFor(null)}
            onStart={(options) => onHost(game, options)}
          />
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

          <p className="home-game">{specFor(game).name}</p>

          <div className="home-buttons">
            <button
              type="button"
              className="home-btn home-btn-gold"
              autoFocus
              onClick={() => {
                sfx.select();
                onPlay(game);
              }}
            >
              <svg className="home-btn-icon" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                <path d="M7 4.2v15.6c0 .9 1 1.5 1.8 1L20.4 13a1.2 1.2 0 0 0 0-2L8.8 3.2C8 2.7 7 3.3 7 4.2Z" />
              </svg>
              Play vs computer
            </button>
            <button
              type="button"
              className="home-btn home-btn-ghost"
              onClick={() => {
                sfx.select();
                setHostFor(game);
              }}
            >
              <svg className="home-btn-icon" viewBox="0 0 24 24" aria-hidden fill="currentColor">
                <circle cx="9" cy="7.6" r="3.6" />
                <path d="M2 20.2c0-3.9 3.1-6.8 7-6.8s7 2.9 7 6.8c0 .5-.4.8-.8.8H2.8c-.4 0-.8-.3-.8-.8Z" />
                <circle cx="16.8" cy="8.4" r="2.9" opacity="0.6" />
                <path d="M17.6 21h3.6c.4 0 .8-.3.8-.8 0-3.2-2.3-5.6-5.4-5.9a8.4 8.4 0 0 1 1 6.7Z" opacity="0.6" />
              </svg>
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
