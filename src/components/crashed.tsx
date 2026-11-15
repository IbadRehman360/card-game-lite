"use client";

import type { CSSProperties } from "react";

/**
 * The full-screen "something broke" card used by the app error boundaries.
 * Styled inline on purpose: global-error replaces the root layout, so no app stylesheet is
 * guaranteed to be loaded. It copies the menus' look: a wood panel with a gold edge, a gold primary
 * button with the bold embossed label, and a quiet secondary one. The picture is a plain SVG (an
 * unlit diya) so the error screen can't trip over whatever crashed.
 */
export function Crashed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" style={screen}>
      <div style={panel}>
        <Diya />
        <h1 style={title}>The lamp went out</h1>
        <p style={text}>Something broke on this screen. Your coins are safe.</p>
        <div style={{ display: "grid", gap: 10, width: "100%" }}>
          <button type="button" onClick={() => retry()} style={gold}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} style={ghost}>
            Reload the app
          </button>
        </div>
      </div>
    </div>
  );
}

/** A clay diya with its flame out and a thin curl of smoke. */
function Diya() {
  return (
    <svg viewBox="0 0 120 96" width={112} height={90} aria-hidden style={{ display: "block", margin: "0 auto 6px" }}>
      <defs>
        <linearGradient id="crash-clay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d07a3a" />
          <stop offset="1" stopColor="#7c3a18" />
        </linearGradient>
      </defs>
      {/* smoke */}
      <path
        d="M78 44c-6-6 4-10-2-17s4-11-1-17"
        fill="none"
        stroke="rgba(244,236,216,0.35)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* burnt wick */}
      <path d="M80 52c-1-3 0-5 2-7" fill="none" stroke="#2a170f" strokeWidth="3" strokeLinecap="round" />
      {/* the bowl */}
      <path d="M14 54h76c8 0 14-4 18-8-2 18-22 32-50 32S16 70 14 54z" fill="url(#crash-clay)" stroke="#2a170f" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="54" cy="54" rx="40" ry="6" fill="#4a230e" stroke="#2a170f" strokeWidth="3" />
      {/* gold rim dots */}
      {[30, 44, 58, 72].map((x) => (
        <circle key={x} cx={x} cy="66" r="2.6" fill="#e8b04a" />
      ))}
      <ellipse cx="58" cy="88" rx="34" ry="4" fill="rgba(0,0,0,0.35)" />
    </svg>
  );
}

const font = "var(--font-oswald), system-ui, sans-serif";

const screen: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "grid",
  placeItems: "center",
  padding: 16,
  boxSizing: "border-box",
  background: "radial-gradient(ellipse at 50% 35%, #3a2616 0%, #1a110a 55%, #0b0705 100%)",
  color: "#f4ecd8",
  textAlign: "center",
  fontFamily: font,
};

const panel: CSSProperties = {
  boxSizing: "border-box",
  width: "min(100%, 340px)",
  padding: "22px 20px 18px",
  borderRadius: 18,
  background: "linear-gradient(180deg, #2f2116, #261a11)",
  border: "1.5px solid #b8762a",
  boxShadow: "0 3px 0 rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.6)",
};

const title: CSSProperties = {
  margin: "0 0 6px",
  font: `700 25px/1.15 ${font}`,
  color: "#ffd873",
};

const text: CSSProperties = {
  margin: "0 0 20px",
  font: `500 15.5px/1.45 ${font}`,
  color: "rgba(244, 236, 216, 0.7)",
};

const base: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  height: 50,
  borderRadius: 12,
  cursor: "pointer",
  fontFamily: font,
};

const gold: CSSProperties = {
  ...base,
  border: "2px solid #2a170f",
  background: "linear-gradient(180deg, #fbd48a, #f0ad3a 50%, #c2711c)",
  boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), 0 4px 0 #4f2c08, 0 8px 16px rgba(0,0,0,0.4)",
  // the shared gold-button label (modal.css --gold-label-*): heaviest weight, tight, embossed
  color: "#2a170f",
  fontSize: 19,
  fontWeight: 800,
  letterSpacing: "0.035em",
  textShadow: "0 1px 0 rgba(255,236,180,0.7), 0 -1px 0 rgba(90,50,10,0.22)",
};

const ghost: CSSProperties = {
  ...base,
  border: "1.5px solid #b8762a",
  background: "linear-gradient(180deg, #3a2a1a, #2a1d12)",
  boxShadow: "0 3px 0 rgba(0,0,0,0.45)",
  color: "#f4ecd8",
  fontSize: 16.5,
  fontWeight: 700,
  letterSpacing: "0.02em",
};
