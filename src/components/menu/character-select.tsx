"use client";

import { type CSSProperties, useEffect } from "react";
import { CHARACTERS } from "@/lib/characters";
import { sfx } from "@/lib/sfx";
import { Chevron } from "./icons";

/** Name, role, left/right and Confirm. The character itself is the 3D bust the camera is looking at. */
export function CharacterSelect({
  index,
  onIndex,
  onBack,
  onConfirm,
}: {
  index: number;
  onIndex: (i: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const c = CHARACTERS[index];
  const n = CHARACTERS.length;
  const step = (d: number) => {
    const next = index + d;
    if (next < 0 || next >= n) return;
    sfx.hover();
    onIndex(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        sfx.back();
        onBack();
      } else if (e.key === "ArrowRight" && index < n - 1) {
        e.preventDefault();
        sfx.hover();
        onIndex(index + 1);
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        sfx.hover();
        onIndex(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, n, onBack, onIndex]);

  return (
    <div className="select" style={{ "--accent": c.accent } as CSSProperties}>
      <button
        type="button"
        className="icon-button corner-back"
        aria-label="Back to menu"
        onClick={() => {
          sfx.back();
          onBack();
        }}
      >
        <Chevron dir="left" />
      </button>

      <div className="select-foot">
        <div className="picker">
          <button
            type="button"
            className="arrow-button"
            aria-label="Previous character"
            data-hidden={index === 0}
            disabled={index === 0}
            onClick={() => step(-1)}
          >
            <Chevron dir="left" />
          </button>
          <div className="picker-id" aria-live="polite">
            <h2 className="picker-name" key={c.id}>
              {c.name}
            </h2>
            <p className="picker-role">{c.role}</p>
          </div>
          <button
            type="button"
            className="arrow-button"
            aria-label="Next character"
            data-hidden={index === n - 1}
            disabled={index === n - 1}
            onClick={() => step(1)}
          >
            <Chevron dir="right" />
          </button>
        </div>

        <div className="pips" role="radiogroup" aria-label="Characters">
          {CHARACTERS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={i === index}
              aria-label={x.name}
              className="pip"
              style={{ "--accent": x.accent } as CSSProperties}
              onClick={() => {
                if (i !== index) step(i - index);
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="select-go"
          autoFocus
          onClick={() => {
            sfx.confirm();
            onConfirm();
          }}
        >
          Select
        </button>
      </div>
    </div>
  );
}
