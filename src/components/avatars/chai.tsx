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
      <g stroke={INK} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <ellipse cx="32" cy="72" rx="26" ry="6" fill="#b9bcc6" />
        <ellipse cx="32" cy="70" rx="18" ry="3.5" fill="#d9dce3" strokeWidth="1.4" />
        <path d="M18 30h28l-4 38H22z" fill="#fff" fillOpacity="0.35" />
        <path d="M19.5 38h25l-3 30H22.5z" fill="#c9772f" stroke="none" />
        <ellipse cx="32" cy="38" rx="12.5" ry="2.2" fill="#e9b77a" strokeWidth="1.2" />
        <path d="M24 44l1.4 20M32 44v20M40 44l-1.4 20" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" />
        <path d="M18 30h28l-4 38H22z" fill="none" />
        <ellipse cx="32" cy="30" rx="14" ry="2.6" fill="none" />
      </g>
    </svg>
  );
}
