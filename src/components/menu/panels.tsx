"use client";

import { type ReactNode, useState } from "react";
import { setPrefs, usePrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sfx";
import { type Quality, setQuality, usePerfTier, useQuality } from "@/lib/perf";
import { EXTRAS } from "./more-games";
import { CODE_LENGTH, type ExtraId, cleanCode } from "./modes";
import { GUIDES, splitHighlights } from "./how-to-play";
import "@/components/shop/shop.css";
import "./how-to-play.css";

/** Text with **gold** markers, drawn with the marked words in gold. */
function Marked({ text }: { text: string }) {
  return splitHighlights(text).map((part, i) =>
    i % 2 ? (
      <b key={i} className="hl">
        {part}
      </b>
    ) : (
      part
    ),
  );
}

export function RulesPanel({ game: initial = "rung" }: { game?: "rung" | "patti" | ExtraId }) {
  const [game, setGame] = useState<string>(initial);
  const games = [
    { id: "rung" as const, name: "Rung" },
    { id: "patti" as const, name: "3 Patti" },
    ...EXTRAS.map((g) => ({ id: g.id, name: g.name })),
  ];
  const current = games.find((g) => g.id === game) ?? games[0];
  const guide = GUIDES[current.id];
  return (
    <>
    {/* the shop's tab buttons (shop.css .shop-tabs), so every switcher in the app looks the same */}
    <div className="shop-tabs htp-tabs" role="tablist" aria-label="Game">
      {games.map((g) => (
        <button
          key={g.id}
          type="button"
          role="tab"
          aria-selected={current.id === g.id}
          onClick={(e) => {
            sfx.flip();
            setGame(g.id);
            e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
          }}
        >
          {g.name}
        </button>
      ))}
    </div>
    <article className="htp" role="tabpanel" aria-label={`How to play ${current.name}`}>
      <ol className="htp-steps">
        {guide.steps.map((step) => (
          <li key={step.title} className="htp-step">
            <b className="htp-title">{step.title}</b> <Marked text={step.text} />
          </li>
        ))}
      </ol>
    </article>
    </>
  );
}

/** One settings row: the label (and an optional muted hint) on the left, its control on the right. */
function Row({
  label,
  hint,
  stack,
  as: Tag = "div",
  children,
}: {
  label: string;
  hint?: string;
  stack?: boolean;
  as?: "div" | "label";
  children: ReactNode;
}) {
  return (
    <Tag className="set-row" data-stack={stack || undefined}>
      <span className="set-text">
        <span className="set-label">{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </span>
      {children}
    </Tag>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row as="label" label={label} hint={hint}>
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
    </Row>
  );
}

const QUALITIES: { id: Quality; name: string }[] = [
  { id: "auto", name: "Auto" },
  { id: "low", name: "Smooth" },
  { id: "high", name: "Sharp" },
];

/** Sound and display, as one short list under two small headings (it all fits a phone without scrolling). */
export function SettingsPanel() {
  const prefs = usePrefs();
  const quality = useQuality();
  const tier = usePerfTier();
  const volume = Math.round(prefs.sfxVolume * 100);
  const tierName = tier === "low" ? "Smooth" : tier === "mid" ? "Balanced" : "Sharp";
  return (
    <div className="settings">
      <section className="set-group" aria-label="Sound">
        <div className="set-card">
          <Row as="label" label="Sound effects">
            <span className="range-wrap">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={volume}
                aria-valuetext={`${volume} percent`}
                onChange={(e) => setPrefs({ sfxVolume: Number(e.target.value) / 100 })}
                onPointerUp={() => sfx.select()}
                onKeyUp={() => sfx.hover()}
                className="range"
                style={{ ["--fill" as string]: `${prefs.sfxVolume * 100}%` }}
              />
              <output className="range-value">{volume}</output>
            </span>
          </Row>
          <Toggle
            label="Room ambience"
            hint="Background sounds of the room"
            checked={prefs.ambience}
            onChange={(v) => setPrefs({ ambience: v })}
          />
          <Toggle
            label="Mute all"
            hint="Silence every sound at once"
            checked={prefs.muted}
            onChange={(v) => setPrefs({ muted: v })}
          />
        </div>
      </section>
      <section className="set-group" aria-label="Display">
        <div className="set-card">
          <Row
            label="Graphics"
            hint={quality === "auto" ? `Auto picks the best for your phone · ${tierName}` : "Smooth runs faster, Sharp looks crisper"}
            stack
          >
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
          </Row>
          <Toggle
            label="Reduce motion"
            hint="Fewer moving cards and effects"
            checked={prefs.reduceMotion}
            onChange={(v) => setPrefs({ reduceMotion: v })}
          />
        </div>
      </section>
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
