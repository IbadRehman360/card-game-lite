"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SHOT_LANDS_MS } from "@/lib/bluff/engine";
import { seatTags } from "./anchors";
import { motionReduced } from "./motion";
import { SEAT_AT } from "./table-play";

/** When (ms into a call) each beat of the drama starts; the sounds are timed by use-bluff to match. */
export const FOCUS_AT = 900;
export const SPIN_AT = 1500;
export const HOLD_AT = 2700;
export const RETURN_AT = SHOT_LANDS_MS + 1700;

type Beat = "focus" | "spin" | "hold" | "bang" | "click" | "back";

/** Where on screen the loser is: their name tag, or (you) the bottom middle. */
function loserPoint(seat: number): [number, number] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const el = seat === 0 ? null : seatTags[seat];
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width) return [r.left + r.width / 2, r.top + r.height / 2];
  }
  if (seat === 0) return [w / 2, h * 0.84];
  return [(SEAT_AT[seat][0] / 100) * w, (SEAT_AT[seat][1] / 100) * h];
}

/** Twelve drops thrown out from the hit, each with its own angle, reach and size. */
const DROPS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + Math.sin(i * 7.3) * 0.4;
  const r = 34 + ((i * 37) % 30);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, s: 5 + ((i * 13) % 7), d: 0.6 + ((i * 5) % 4) * 0.35 };
});

/**
 * Everything that makes a call land: the room closes in on the loser (a dark ring round them, a slight
 * zoom), a heartbeat while the cylinder turns, then either a relieved click ("Safe") or the bang: a white
 * flash, muzzle star and smoke, a hard shake, blood on their tag, a red pulse round the screen and "Out".
 * Only transform and opacity animate; it lives over the whole screen and never takes a tap.
 */
export function BluffDrama({ pull }: { pull: { key: string; seat: number; fired: boolean } | null }) {
  const key = pull?.key ?? null;
  const seat = pull?.seat ?? 0;
  const fired = !!pull?.fired;
  const [beat, setBeat] = useState<{ key: string | null; b: Beat | null; at: [number, number] }>({
    key: null,
    b: null,
    at: [0, 0],
  });

  useEffect(() => {
    if (!key) return;
    const plan: [number, Beat][] = [
      [FOCUS_AT, "focus"],
      [SPIN_AT, "spin"],
      [HOLD_AT, "hold"],
      [SHOT_LANDS_MS, fired ? "bang" : "click"],
      [RETURN_AT, "back"],
    ];
    const ids = plan.map(([t, b]) =>
      window.setTimeout(() => {
        setBeat({ key, b, at: loserPoint(seat) });
        if (b === "bang" && seat === 2) window.dispatchEvent(new CustomEvent("st-slump"));
      }, t),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [key, seat, fired]);

  const b = beat.key === key ? beat.b : null;
  const [x, y] = beat.at;

  // the room leans in on the loser, and shakes when the gun goes off
  useEffect(() => {
    const room = document.querySelector<HTMLElement>(".st-room");
    if (!room || motionReduced()) return;
    const close = b === "focus" || b === "spin" || b === "hold" || b === "bang" || b === "click";
    room.style.transformOrigin = `${x}px ${y}px`;
    room.style.scale = close ? "1.12" : "";
    if (b === "bang") {
      room.classList.remove("st-quake");
      void room.offsetWidth;
      room.classList.add("st-quake");
    }
  }, [b, x, y]);
  useEffect(
    () => () => {
      const room = document.querySelector<HTMLElement>(".st-room");
      if (room) {
        room.style.scale = "";
        room.classList.remove("st-quake");
      }
    },
    [],
  );

  if (!b || typeof document === "undefined") return null;
  const shot = b === "bang";
  const after = shot || b === "click" ? b : null;
  const style = { "--x": `${x}px`, "--y": `${y}px` } as CSSProperties;

  return createPortal(
    <div className="bd" data-beat={b} data-result={after ?? undefined} style={style} aria-hidden>
      <i className="bd-vig" />
      {after && <i key={`w-${key}`} className="bd-white" />}
      {shot && (
        <>
          <i key={`e-${key}`} className="bd-edge" />
          <span key={`m-${key}`} className="bd-muzzle">
            <svg viewBox="-50 -50 100 100">
              <path
                d="M0-48 L9-12 L44-22 L16 2 L40 34 L4 16 L-10 46 L-12 10 L-46 18 L-18-4 L-40-34 L-6-14Z"
                fill="#ffe27a"
              />
              <circle r="14" fill="#fff" />
            </svg>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className="bd-smoke" style={{ "--i": i } as CSSProperties} />
            ))}
          </span>
          <svg key={`b-${key}`} className="bd-blood" viewBox="-80 -80 160 160">
            <circle r="16" fill="#8e0a12" className="bd-blot" />
            {DROPS.map((d, i) => (
              <g key={i} transform={`translate(${d.x} ${d.y})`}>
                <g className="bd-drop" style={{ "--d": `${d.d}s` } as CSSProperties}>
                  <ellipse rx={d.s * 0.7} ry={d.s} fill="#a50d16" />
                  <ellipse cx={-d.s * 0.2} cy={-d.s * 0.3} rx={d.s * 0.2} ry={d.s * 0.3} fill="#e0444c" opacity="0.6" />
                </g>
              </g>
            ))}
          </svg>
        </>
      )}
      {after && (
        <b key={`s-${key}`} className="bd-stamp" data-out={shot}>
          {shot ? "Out" : "Safe"}
        </b>
      )}
    </div>,
    document.body,
  );
}
