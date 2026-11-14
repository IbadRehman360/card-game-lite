"use client";

import { useState } from "react";
import type { DevTools } from "./use-solo-game";

/** Testing shortcuts, shown only when the game is opened with ?dev in the address. */
export function DevPanel({ dev }: { dev: DevTools }) {
  const [enabled] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev"),
  );
  const [open, setOpen] = useState(true);
  if (!enabled) return null;
  return (
    <>
      <button type="button" className="dev-toggle" onClick={() => setOpen((o) => !o)}>
        DEV {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="dev-panel">
          <button type="button" onClick={dev.finish}>Finish deal</button>
          <button type="button" data-on={dev.auto} onClick={() => dev.setAuto(!dev.auto)}>
            Auto-play
          </button>
          <button type="button" data-on={dev.fast} onClick={() => dev.setFast(!dev.fast)}>
            Speed 4×
          </button>
          <button type="button" onClick={() => dev.skipTo(4)}>To haath 5</button>
          <button type="button" onClick={() => dev.skipTo(11)}>To haath 12</button>
          <button type="button" onClick={() => dev.skipTo(12)}>To haath 13</button>
          <p>Card tests</p>
          <button type="button" onClick={() => dev.rig("my-courts")}>Courts to me</button>
          <button type="button" onClick={() => dev.rig("all-courts")}>Courts for all</button>
        </div>
      )}
    </>
  );
}
