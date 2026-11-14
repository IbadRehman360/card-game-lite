"use client";

import { useEffect, useState, type CSSProperties } from "react";
import "./turn-timer.css";

/**
 * Your turn, impossible to miss: a ring that drains and the seconds left in big numbers.
 * Gold, then orange under half time, then red and pulsing for the last five seconds.
 * Give it a `key` that changes with every new turn so it starts again from full.
 */
export function TurnTimer({
  seconds,
  paused = false,
  label = "Your turn",
  className,
}: {
  seconds: number;
  paused?: boolean;
  label?: string;
  className?: string;
}) {
  const [left, setLeft] = useState(seconds);

  // one buzz when the turn comes to you
  useEffect(() => {
    try {
      navigator.vibrate?.(30);
    } catch {
      /* not supported */
    }
  }, []);

  // the number moves once a second, and stops while the game is paused
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const tone = left <= 5 ? "red" : left <= seconds / 2 ? "orange" : "gold";
  return (
    <span
      className={`turn-timer${className ? ` ${className}` : ""}`}
      data-tone={tone}
      data-paused={paused || undefined}
      role="timer"
      aria-label={`${label}, ${left} seconds left`}
      style={{ "--secs": `${seconds}s` } as CSSProperties}
    >
      <span className="tt-dial" aria-hidden>
        <svg viewBox="0 0 40 40">
          <circle className="tt-track" cx="20" cy="20" r="17" />
          <circle className="tt-ring" cx="20" cy="20" r="17" pathLength="100" />
        </svg>
        <b>{left}</b>
      </span>
      <span className="tt-label">{label}</span>
    </span>
  );
}
