import { INK } from "./desi-avatars";
import "./avatars.css";

/**
 * A cutting-chai glass on a little steel saucer, steam curling off it: the dhaba's drink at the table.
 * Flat SVG in the avatars' ink-outline style; the steam drifts unless motion is reduced (avatars.css).
 */
export function ChaiGlass({ className, size }: { className?: string; size?: number | string }) {
  return (
    <svg viewBox="0 0 64 80" className={`chai ${className ?? ""}`} width={size} aria-hidden>
      <g fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" className="chai-steam">
        <path d="M26 22q-4-5 0-9t0-9" />
        <path d="M37 24q-4-5 0-9t0-9" />
      </g>
      {/* a tall ribbed cutting-chai glass (no saucer: from a distance the round saucer read as a coin) */}
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx="32" cy="74" rx="15" ry="3" fill="#000" fillOpacity="0.25" stroke="none" />
        {/* the glass */}
        <path d="M17 26h30l-4.5 46h-21z" fill="#fff" fillOpacity="0.4" />
        {/* milky chai filling most of it, the froth on top */}
        <path d="M18.6 34h26.8l-3.7 37.5H22.3z" fill="#b8722f" stroke="none" />
        <path d="M18.6 34h26.8l-0.4 4H19z" fill="#e8c28c" stroke="none" />
        {/* the glass's ribs and a shine */}
        <path d="M24 40l1.2 28M32 40v28M40 40l-1.2 28" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.6" />
        <path d="M21 30l2.6 38" stroke="#fff" strokeOpacity="0.85" strokeWidth="2" />
        {/* the thick rim and base of a cutting glass */}
        <path d="M17 26h30l-4.5 46h-21z" fill="none" />
        <path d="M22.4 68.5h19.2" strokeWidth="2" />
        <path d="M16.6 26h30.8" strokeWidth="3.2" />
      </g>
    </svg>
  );
}
