"use client";

import type { KeyboardEvent } from "react";
import { specFor, type TableGame } from "@/lib/game/table-games";
import "./table-status.css";

/**
 * Shown from pressing Host, Join or Rejoin until the table is ready: three cards being dealt on the
 * room, which stays visible (only lightly shaded) behind it.
 */
export function TableLoader({ title = "Setting up your table…", note }: { title?: string; note?: string }) {
  return (
    <div className="table-loader" role="status" aria-live="polite">
      <div className="table-loader-cards" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <p className="table-loader-title">{title}</p>
      {note && <p className="table-loader-note">{note}</p>}
    </div>
  );
}

/** "Your Rung game is still going": go back to the seat this phone left, or give it up. */
export function RejoinBanner({
  game,
  busy,
  onRejoin,
  onLeave,
}: {
  game: string;
  busy: boolean;
  onRejoin: () => void;
  onLeave: () => void;
}) {
  const name = specFor(game as TableGame).name;
  // the title screen comes in on any key: keys meant for these buttons stop here
  const keep = (e: KeyboardEvent) => e.stopPropagation();
  return (
    <div className="rejoin" role="dialog" aria-label="Rejoin game" onKeyDown={keep} onClick={(e) => e.stopPropagation()}>
      <span className="rejoin-dot" aria-hidden />
      <p className="rejoin-text">
        Your <b>{name}</b> game is still going. Rejoin?
      </p>
      <div className="rejoin-actions">
        <button type="button" className="rejoin-btn rejoin-go" onClick={onRejoin} disabled={busy}>
          Rejoin
        </button>
        <button type="button" className="rejoin-btn rejoin-leave" onClick={onLeave} disabled={busy}>
          Leave
        </button>
      </div>
    </div>
  );
}
