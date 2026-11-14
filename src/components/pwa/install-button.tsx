"use client";

import { useState } from "react";
import { install, usePwa } from "./pwa";
import "./pwa.css";

/**
 * "Install" when the browser offers it; on iPhone and iPad (no offer there) a short how-to for
 * Add to Home Screen. Nothing once the app is installed.
 */
export function InstallButton({ className }: { className?: string }) {
  const { install: state } = usePwa();
  const [howTo, setHowTo] = useState(false);
  if (state === "installed" || state === "unavailable") return null;
  return (
    <>
      <button
        type="button"
        className={className ?? "pwa-install"}
        onClick={() => (state === "prompt" ? void install() : setHowTo((v) => !v))}
      >
        Install app
      </button>
      {howTo && (
        <div className="pwa-ios" role="dialog" aria-label="Add to Home Screen">
          <p>
            Tap <ShareIcon /> Share, then <b>Add to Home Screen</b>.
          </p>
          <p className="pwa-ios-note">Open it once with internet; after that it plays offline.</p>
          <button type="button" className="pwa-toast-x" aria-label="Close" onClick={() => setHowTo(false)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}

const ShareIcon = () => (
  <svg className="pwa-share" viewBox="0 0 24 24" aria-hidden>
    <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
