"use client";

import type { CSSProperties } from "react";

/** The full-screen "something broke" card used by the app error boundaries. */
export function Crashed({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "radial-gradient(ellipse at 50% 40%, #2a1c10 0%, #050403 70%)",
        color: "#f3e6cc",
        textAlign: "center",
        fontFamily: "var(--font-oswald), system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 360 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "0.04em", margin: "0 0 8px" }}>The lamp went out</h1>
        <p style={{ opacity: 0.75, margin: "0 0 20px", fontFamily: "system-ui, sans-serif", fontSize: 15 }}>
          Something went wrong on this screen. Your coins are safe.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => retry()} style={button(true)}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} style={button(false)}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

const button = (gold: boolean): CSSProperties => ({
  minWidth: 120,
  minHeight: 44,
  padding: "10px 18px",
  borderRadius: 10,
  border: "1px solid #d9b45a",
  background: gold ? "#d9b45a" : "transparent",
  color: gold ? "#1a1208" : "#f3e6cc",
  font: "600 16px var(--font-oswald), system-ui, sans-serif",
  letterSpacing: "0.04em",
  cursor: "pointer",
});
