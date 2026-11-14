"use client";

import { useEffect, useRef, useState } from "react";
import type { GameOptions } from "@/lib/game/engine";
import { TABLES } from "@/lib/patti/engine";
import { NEARBY_LABEL } from "@/lib/nearby/offline";
import { guestAnswer, nearbySupported, openCamera, stopCamera } from "@/lib/nearby/peer";
import { GuestSession, HostSession, type NearbyClient, guestId } from "@/lib/nearby/session";
import { codeFromScan } from "@/lib/nearby/sdp";
import { sfx } from "@/lib/sfx";
import { QrScanner } from "./qr-scanner";
import { QrView } from "./qr-view";
import "./nearby.css";

type Step =
  | { at: "choose" }
  | { at: "scan" }
  | { at: "answering" }
  | { at: "answer"; code: string }
  | { at: "joining" }
  | { at: "failed"; why: string };

/** The table code in this page's link (#nb=...), if a phone camera opened the app from the host's QR. */
export function offerFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const m = /[#&]nb=([A-Za-z0-9_-]+)/.exec(window.location.hash);
  return m ? m[1] : null;
}

/**
 * Playing with people at the same table, phone to phone over the same Wi-Fi or a hotspot, with no
 * internet and no coins. One phone hosts (it runs the game); everyone else joins by swapping QR codes
 * with it. `onReady` hands back the table, which the lobby and game screens then use like an online one.
 */
export function NearbyScreen({
  name,
  avatar,
  offer,
  onReady,
  onClose,
}: {
  name: string;
  avatar?: string;
  /** A host's code already in hand (from the link): skip scanning. */
  offer?: string | null;
  onReady: (client: NearbyClient) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ at: "choose" });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const cam = useRef<MediaStream | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const supported = typeof window === "undefined" || nearbySupported();

  const closeCamera = () => {
    stopCamera(cam.current);
    cam.current = null;
    setStream(null);
  };
  useEffect(
    () => () => {
      cancel.current?.();
      stopCamera(cam.current);
    },
    [],
  );

  const host = (options: GameOptions) => {
    sfx.confirm();
    onReady(new HostSession({ name, avatar }, options));
  };

  const join = async (offerText: string) => {
    setStep({ at: "answering" });
    try {
      const a = await guestAnswer(codeFromScan(offerText));
      cancel.current = a.cancel;
      setStep({ at: "answer", code: a.code });
      const channel = await a.channel;
      cancel.current = null;
      setStep({ at: "joining" });
      closeCamera();
      const session = new GuestSession(channel, { guestId: guestId(), name, avatar });
      await session.ready;
      if (window.location.hash.includes("nb=")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
      sfx.confirm();
      onReady(session);
    } catch (e) {
      cancel.current?.();
      cancel.current = null;
      closeCamera();
      setStep({ at: "failed", why: (e as Error).message });
    }
  };

  const startScan = async () => {
    sfx.select();
    setStep({ at: "scan" });
    // opening the camera also lets the browser share this phone's real address, which helps on
    // routers that block the hidden-address lookups
    cam.current = await openCamera();
    setStream(cam.current);
  };

  // opened from the host's QR link: go straight to showing our answer
  const started = useRef(false);
  useEffect(() => {
    if (!offer || started.current || !supported) return;
    started.current = true;
    const t = window.setTimeout(() => void join(offer), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer, supported]);

  return (
    <div className="nb">
      <header className="nb-head">
        <p className="nb-tag">{NEARBY_LABEL}</p>
        <h2 className="nb-title">Nearby</h2>
        <button
          type="button"
          className="nb-x"
          aria-label="Back"
          onClick={() => {
            cancel.current?.();
            closeCamera();
            onClose();
          }}
        >
          ×
        </button>
      </header>

      {!supported ? (
        <p className="nb-fail">This browser can&apos;t connect phones directly. Try Chrome or Safari.</p>
      ) : step.at === "choose" ? (
        <div className="nb-choose">
          <p className="nb-note">Same Wi-Fi or one phone&apos;s hotspot. No internet needed. No coins.</p>
          <section className="nb-group">
            <p className="nb-label">Host a table</p>
            <button type="button" className="nb-btn" onClick={() => host({ series: 3 })}>
              Rung
            </button>
            <p className="nb-label nb-sub">3 Patti</p>
            <div className="nb-row">
              {TABLES.map((t) => (
                <button key={t.id} type="button" className="nb-btn nb-btn-quiet" onClick={() => host({ series: 3, game: "patti", boot: t.boot })}>
                  {t.name}
                </button>
              ))}
            </div>
          </section>
          <section className="nb-group">
            <p className="nb-label">Join a table</p>
            <button type="button" className="nb-btn nb-btn-gold" onClick={() => void startScan()}>
              Scan host&apos;s code
            </button>
          </section>
        </div>
      ) : step.at === "scan" ? (
        <QrScanner stream={stream} onCode={(t) => void join(t)} hint="Scan the code on the host's phone." />
      ) : step.at === "answering" ? (
        <p className="nb-wait">Getting ready…</p>
      ) : step.at === "answer" ? (
        <div className="nb-answer">
          <p className="nb-step">Now show this to the host</p>
          <QrView text={step.code} label="Your code for the host to scan" />
          <p className="nb-hint">The host taps “Scan their code”. Keep this screen open.</p>
        </div>
      ) : step.at === "joining" ? (
        <p className="nb-wait">Sitting down…</p>
      ) : (
        <div className="nb-choose">
          <p className="nb-fail">{step.why}</p>
          <button type="button" className="nb-btn" onClick={() => void startScan()}>
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}
