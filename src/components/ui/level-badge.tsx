import "./level-badge.css";

/** A gold shield with "Lv" over the level number. "sm" is small enough to sit on an avatar corner. */
export function LevelBadge({ level, size = "md", className }: { level: number; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={`lvl-badge${className ? ` ${className}` : ""}`} data-size={size} role="img" aria-label={`Level ${level}`}>
      <svg className="lvl-shield" viewBox="0 0 40 46" aria-hidden>
        <path
          d="M20 2.5 36 8v14.5c0 10-6.5 17.2-16 21-9.5-3.8-16-11-16-21V8Z"
          fill="#f0c25c"
          stroke="#2b1704"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <span className="lvl-text" aria-hidden>
        <small>Lv</small>
        <b>{level}</b>
      </span>
    </span>
  );
}
