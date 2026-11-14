"use client";

import { useEffect } from "react";
import { applyUpdate, dismissUpdate, startPwa, usePwa } from "./pwa";
import "./pwa.css";

/** Starts the service worker, and shows "New version" when one is ready. Mount once, in the root layout. */
export function PwaBoot() {
  useEffect(() => startPwa(), []);
  const { update } = usePwa();
  if (!update) return null;
  return (
    <div className="pwa-toast" role="status">
      <span>New version ready</span>
      <button type="button" className="pwa-toast-go" onClick={applyUpdate}>
        Refresh
      </button>
      <button type="button" className="pwa-toast-x" aria-label="Later" onClick={dismissUpdate}>
        ×
      </button>
    </div>
  );
}
