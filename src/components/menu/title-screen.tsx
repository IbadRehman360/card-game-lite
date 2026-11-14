"use client";

import { useEffect } from "react";
import { Logo } from "./logo";

/** Press any key or tap anywhere to come in. The first press also unlocks sound. */
export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab") return;
      e.preventDefault();
      onEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnter]);

  return (
    <button
      type="button"
      className="title"
      onClick={onEnter}
      aria-label="Start"
    >
      <Logo className="title-logo" />
      <span className="title-prompt">
        <span className="only-mouse">Press any key</span>
        <span className="only-touch">Tap to start</span>
      </span>
    </button>
  );
}
