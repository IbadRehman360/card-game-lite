"use client";

import { useState } from "react";
import { NAME_MAX, cleanName, setPrefs, usePrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sfx";
import { type Quality, setQuality, usePerfTier, useQuality } from "@/lib/perf";
import { EXTRAS } from "./more-games";
import type { ExtraId } from "./modes";

/** One short line about coins, under every game's rules. */
const COIN_LINE = "Pay coins to sit down. Win to collect more.";
import { CODE_LENGTH, cleanCode } from "./modes";

/** Rung in four lines. */
const RULES: { suit: string; title: string; text: string }[] = [
  { suit: "♠", title: "Teams", text: "Two teams of two. Partner sits opposite." },
  { suit: "♥", title: "Follow suit", text: "Play the led suit if you can." },
  { suit: "♦", title: "Rung", text: "From haath 5, first off-suit card sets trump." },
  { suit: "♣", title: "Win", text: "Win two haaths in a row to sweep. First to 7." },
];

/** 3 Patti in four lines. */
const PATTI_RULES: { suit: string; title: string; text: string }[] = [
  { suit: "♠", title: "Boot", text: "Everyone pays the boot and gets three cards." },
  { suit: "♥", title: "Blind or seen", text: "Bet blind, or look and bet double." },
  { suit: "♦", title: "Bet", text: "Pack, chaal or raise. Last one in wins." },
  { suit: "♣", title: "Hands", text: "Trail, pure sequence, sequence, color, pair, high." },
];

export function RulesPanel({ game: initial = "rung" }: { game?: "rung" | "patti" | ExtraId }) {
  const [game, setGame] = useState<string>(initial);
  const games = [
    { id: "rung", name: "Rung", rules: RULES },
    { id: "patti", name: "3 Patti", rules: PATTI_RULES },
    ...EXTRAS.map((g) => ({ id: g.id as string, name: g.name, rules: g.rules })),
  ];
  const current = games.find((g) => g.id === game) ?? games[0];
  return (
    <>
    <div className="rules-games" role="radiogroup" aria-label="Game">
      {games.map((g) => (
        <button key={g.id} type="button" role="radio" aria-checked={current.id === g.id} onClick={() => { sfx.flip(); setGame(g.id); }}>
          {g.name}
        </button>
      ))}
    </div>
    <ol className="rules">
      {current.rules.map((r) => (
        <li
          key={r.title}
          className="rule"
          data-red={r.suit === "♥" || r.suit === "♦"}
        >
          <span className="rule-suit" aria-hidden>
            {r.suit}
          </span>
          <h3>{r.title}</h3>
          <p>{r.text}</p>
        </li>
      ))}
    </ol>
    <p className="rules-coins">{COIN_LINE}</p>
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          sfx.select();
        }}
      />
    </label>
  );
}

const QUALITIES: { id: Quality; name: string }[] = [
  { id: "auto", name: "Auto" },
  { id: "low", name: "Smooth" },
  { id: "high", name: "Sharp" },
];

export function SettingsPanel() {
  const prefs = usePrefs();
  const quality = useQuality();
  const tier = usePerfTier();
  return (
    <div className="settings">
      <div className="setting setting-stack">
        <span className="setting-label">
          Graphics{quality === "auto" ? ` · ${tier === "low" ? "smooth" : tier === "mid" ? "balanced" : "sharp"}` : ""}
        </span>
        <div className="lobby-switch" data-count="3" role="radiogroup" aria-label="Graphics">
          {QUALITIES.map((q) => (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={quality === q.id}
              onClick={() => {
                sfx.flip();
                setQuality(q.id);
              }}
            >
              {q.name}
            </button>
          ))}
          <i aria-hidden style={{ translate: `${QUALITIES.findIndex((q) => q.id === quality) * 100}% 0` }} />
        </div>
      </div>
      <label className="setting setting-stack">
        <span className="setting-label">Player name</span>
        <input
          className="text-field"
          value={prefs.name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          spellCheck={false}
          placeholder="Player"
          onChange={(e) => setPrefs({ name: cleanName(e.target.value) })}
        />
      </label>
      <label className="setting">
        <span className="setting-label">Sound effects</span>
        <span className="range-wrap">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.sfxVolume * 100)}
            aria-valuetext={`${Math.round(prefs.sfxVolume * 100)} percent`}
            onChange={(e) =>
              setPrefs({ sfxVolume: Number(e.target.value) / 100 })
            }
            onPointerUp={() => sfx.select()}
            onKeyUp={() => sfx.hover()}
            className="range"
            style={{ ["--fill" as string]: `${prefs.sfxVolume * 100}%` }}
          />
          <output className="range-value">
            {Math.round(prefs.sfxVolume * 100)}
          </output>
        </span>
      </label>
      <Toggle
        label="Room ambience"
        checked={prefs.ambience}
        onChange={(v) => setPrefs({ ambience: v })}
      />
      <Toggle
        label="Mute all"
        checked={prefs.muted}
        onChange={(v) => setPrefs({ muted: v })}
      />
      <Toggle
        label="Reduce motion"
        checked={prefs.reduceMotion}
        onChange={(v) => setPrefs({ reduceMotion: v })}
      />
    </div>
  );
}

/** Host a new table, or type a friend's code to join theirs. */
export function MultiplayerPanel({
  onHost,
  onJoin,
}: {
  onHost: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [tried, setTried] = useState(false);
  const complete = code.length === CODE_LENGTH;
  const warn = tried && !complete;
  return (
    <div className="multi">
      <button
        type="button"
        className="cta cta-wide"
        data-autofocus
        onClick={() => {
          sfx.select();
          onHost();
        }}
      >
        Host a table
      </button>

      <div className="multi-or" aria-hidden>
        <span>or</span>
      </div>

      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          if (!complete) {
            setTried(true);
            sfx.back();
            return;
          }
          sfx.select();
          onJoin(code);
        }}
      >
        <label htmlFor="table-code" className="field-label">
          Table code
        </label>
        <label
          htmlFor="table-code"
          className="join-boxes"
          data-warn={warn}
          aria-hidden
        >
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              data-filled={i < code.length}
              data-caret={i === code.length}
            >
              {code[i] ?? ""}
            </span>
          ))}
        </label>
        <input
          id="table-code"
          className="join-input"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="numeric"
          maxLength={CODE_LENGTH}
          aria-describedby={warn ? "join-error" : undefined}
          aria-invalid={warn}
          onChange={(e) => {
            setCode(cleanCode(e.target.value));
            setTried(false);
          }}
        />
        {warn && (
          <p id="join-error" className="field-error">
            Enter all {CODE_LENGTH} digits.
          </p>
        )}
        <button type="submit" className="ghost-button ghost-wide">
          Join table
        </button>
      </form>
    </div>
  );
}
