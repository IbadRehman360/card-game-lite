"use client";

import { useEffect, useRef, useState } from "react";
import { type PendingGuest, hostOffer, openCamera, stopCamera } from "@/lib/nearby/peer";
import type { HostSession } from "@/lib/nearby/session";
import { sfx } from "@/lib/sfx";
import { QrScanner } from "./qr-scanner";
import { QrView } from "./qr-view";

type Step = { at: "idle" } | { at: "making" } | { at: "offer" } | { at: "scan" } | { at: "connecting" } | { at: "failed"; why: string };

/** The link a friend's camera opens (the app reads the code from #nb=). */
export const offerLink = (code: string) => `${window.location.origin}/#nb=${code}`;

/**
 * The host letting one person in: show this phone's code, then scan the code their phone shows back.
 * Works the same in the lobby and mid-game (someone whose phone dropped scans in again).
 */
export function NearbyInvite({ session, compact = false }: { session: HostSession; compact?: boolean }) {
  const [step, setStep] = useState<Step>({ at: "idle" });
  const [joined, setJoined] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const pending = useRef<PendingGuest | null>(null);
  const cam = useRef<MediaStream | null>(null);

  const reset = (keepJoined = false) => {
    pending.current?.cancel();
    pending.current = null;
    stopCamera(cam.current);
    cam.current = null;
    setStream(null);
    setCode("");
    if (!keepJoined) setJoined(null);
    setStep({ at: "idle" });
  };
  useEffect(
    () => () => {
      pending.current?.cancel();
      stopCamera(cam.current);
    },
    [],
  );

  const start = async () => {
    sfx.select();
    setJoined(null);
    setStep({ at: "making" });
    // the camera first: it is needed to scan their code, and while it is open the browser shares this
    // phone's real network address (otherwise it hides it, and many routers can't find the phone)
    cam.current = await openCamera();
    setStream(cam.current);
    try {
      const p = await hostOffer();
      pending.current = p;
      setCode(p.code);
      setStep({ at: "offer" });
      p.channel.then(
        (ch) => {
          if (pending.current !== p) return;
          pending.current = null; // connected: keep it
          session.addGuest(ch, (name) => {
            setJoined(name);
            sfx.confirm();
          });
          stopCamera(cam.current);
          cam.current = null;
          setStream(null);
          setCode("");
          setStep({ at: "idle" });
        },
        (e: Error) => {
          if (pending.current === p) setStep({ at: "failed", why: e.message });
        },
      );
    } catch (e) {
      stopCamera(cam.current);
      cam.current = null;
      setStream(null);
      setStep({ at: "failed", why: (e as Error).message });
    }
  };

  const onAnswer = async (text: string) => {
    const p = pending.current;
    if (!p) return;
    setStep({ at: "connecting" });
    try {
      await p.accept(text);
    } catch (e) {
      setStep({ at: "failed", why: (e as Error).message });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(offerLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (step.at === "idle")
    return (
      <div className="nb-invite" data-compact={compact}>
        {joined && <p className="nb-ok">{joined} joined</p>}
        <button type="button" className="nb-btn" onClick={() => void start()}>
          {compact ? "Let someone in" : "Add a player"}
        </button>
      </div>
    );

  return (
    <div className="nb-sheet" role="dialog" aria-label="Add a player">
      <div className="nb-sheet-card">
        <button type="button" className="nb-x" aria-label="Cancel" onClick={() => reset()}>
          ×
        </button>
        {step.at === "making" && <p className="nb-wait">Getting ready…</p>}
        {step.at === "offer" && (
          <>
            <p className="nb-step">1 · Your friend scans this</p>
            <QrView text={offerLink(code)} label="Table code for your friend to scan" />
            <p className="nb-hint">In the app: Nearby → Join. Or with the phone&apos;s camera.</p>
            <button type="button" className="nb-link" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy code"}
            </button>
            <button type="button" className="nb-btn" onClick={() => setStep({ at: "scan" })}>
              2 · Scan their code
            </button>
          </>
        )}
        {step.at === "scan" && (
          <>
            <p className="nb-step">2 · Scan the code on their phone</p>
            <QrScanner stream={stream} onCode={(t) => void onAnswer(t)} hint="Hold the camera over the code on their screen." />
            <button type="button" className="nb-link" onClick={() => setStep({ at: "offer" })}>
              Show my code again
            </button>
          </>
        )}
        {step.at === "connecting" && <p className="nb-wait">Connecting…</p>}
        {step.at === "failed" && (
          <>
            <p className="nb-fail">{step.why}</p>
            <button type="button" className="nb-btn" onClick={() => {
                reset();
                void start();
              }}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
