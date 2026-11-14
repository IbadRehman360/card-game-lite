import type { CSSProperties } from "react";

/**
 * A short celebration around a winner's picture: a gold glow that pulses a few times
 * and a handful of sparks. Transform/opacity only; the sparks are dropped on slow phones.
 */
export function WinFlare() {
  return (
    <span className="win-flare" aria-hidden>
      <i className="win-glow" />
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} className="win-spark" style={{ "--a": `${i * 45 + 12}deg`, "--d": `${(i % 3) * 60}ms` } as CSSProperties} />
      ))}
    </span>
  );
}
