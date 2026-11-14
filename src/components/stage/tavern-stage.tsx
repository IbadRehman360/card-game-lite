"use client";

import dynamic from "next/dynamic";
import { preload } from "react-dom";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BAKED } from "./baked";
import { CHARACTERS, type CharacterId } from "@/lib/characters";
import type { TableSnapshot } from "@/lib/game/view";
import { CardFace } from "@/components/game/playing-card";
import { TablePlay, TagProjector, cardPx, syncView } from "./table-play";
import {
  type LookId,
  SEAT_ANGLES,
  SEAT_RADIUS,
  TABLE_SCALE,
  TABLE_TOP,
  TOP_CORNER,
  TOP_DEPTH,
  TOP_HALF,
  makeView,
  makePlateView,
  pathOf,
  plateAspect,
  spaced,
  tableRect,
} from "./view2d";
import { PattiTable, type PattiStageTable } from "./patti-table";
import { BluffTable, type BluffStageTable } from "./bluff-table";
import "./stage2d.css";

/** The one character drawn as a live 3D figure (the bear); everyone else is a picture. */
const LIVE_ID: CharacterId = "sal";

export type StageScene = "title" | "menu" | "select" | "play";

/** What the stage needs to draw a deal in progress. */
export interface StageTable {
  /** Character index sitting in each game seat; seat 0 is you, so that character isn't drawn. */
  seatChars: number[];
  snap: TableSnapshot;
  /** Changes with every new deal, so the cards are dealt round afresh. */
  dealKey: string;
  /** True while the deal is going round. */
  dealing: boolean;
}

/** Players at the table for a game whose cards are drawn over the room. */
export interface StageSeats {
  /** Character at each seat; seat 0 is you. */
  seatChars: number[];
  turn: number | null;
}

type StageProps = {
  scene: StageScene;
  focus: number;
  table: StageTable | null;
  patti?: PattiStageTable | null;
  bluff?: (BluffStageTable & { seatChars: number[] }) | null;
  /** A card game drawn over the table (Bhabhi, G Patta): who sits where and whose turn it is. */
  seats?: StageSeats | null;
  /** A full-screen game covers the room: stop the little lamp flicker. */
  idle?: boolean;
  onReady: () => void;
};

// The 3D figures load after first paint, in their own small canvas; the room and table never wait.
const Figures = dynamic(() => import("./figures"), { ssr: false });

/**
 * The tavern, flat: a lamp-lit wooden room and a round felt table, drawn with plain HTML and CSS.
 * The characters sit behind the far rail; the cards in play lie on the felt.
 */
export default function TavernStage({
  scene,
  focus,
  table,
  patti = null,
  bluff = null,
  seats = null,
  idle = false,
  onReady,
}: StageProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  const playing =
    scene === "play" &&
    (table !== null || patti !== null || bluff !== null || seats !== null);
  const seatChars =
    table?.seatChars ??
    patti?.seatChars ??
    bluff?.seatChars ??
    seats?.seatChars ??
    [];
  const turnSeat = table
    ? table.snap.dealOver
      ? -1
      : table.snap.turn
    : patti && !patti.state.result
      ? patti.state.pending
        ? patti.state.pending.to
        : patti.state.turn
      : bluff && !bluff.reveal
        ? bluff.turn
        : seats && seats.turn !== null
          ? seats.turn
          : -1;
  const look = playing ? "play" : scene === "play" ? "menu" : scene;
  const across = look === "play" ? (seatChars[2] ?? 2) : 2;
  // only the bear (Big Sal) is a live 3D figure; the others sit at the table as pictures from the 3D app
  const live = CHARACTERS[across]?.id === LIVE_ID;
  const figIds = look === "select" || !live ? [] : [LIVE_ID];
  const figKey = figIds.join(",");
  // the flat picture stands in until the figure has loaded
  const [figReady, setFigReady] = useState<string | null>(null);
  const keyNow = useRef(figKey);
  useEffect(() => {
    keyNow.current = figKey;
  }, [figKey]);
  // a beat after the model is in, so the canvas has its final size before it fades in
  const onFigReady = useCallback(() => {
    const k = keyNow.current;
    window.setTimeout(() => setFigReady(k), 60);
  }, []);
  // fetch the bear model alongside the page, not after the 3D code arrives
  preload("/models/sal.glb", { as: "fetch", crossOrigin: "anonymous" });
  const [loadFigures, setLoadFigures] = useState(false);
  useEffect(() => {
    // start the 3D right after first paint (the bear picture covers the wait)
    const id = window.setTimeout(() => setLoadFigures(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Room
      look={look as LookId}
      idle={idle}
      focus={focus}
      turnAcross={look === "play" && turnSeat === 2}
      figKey={figKey}
      figIds={figIds}
      across={across}
      figReady={figReady === figKey}
      loadFigures={loadFigures}
      // a beat after the model is in, so the canvas has its final size before it fades in
      onFigReady={onFigReady}
    >
      {playing && (
        <div className="st-play">
          {table && (
            <TablePlay
              snap={table.snap}
              dealKey={table.dealKey}
              dealing={table.dealing}
            />
          )}
          {patti && <PattiTable table={patti} />}
          {bluff && <BluffTable table={bluff} />}
          {seats && !table && !patti && !bluff && <TagProjector />}
        </div>
      )}
    </Room>
  );
}

/** Eases a number towards its goal (about 0.7 s), so the select camera moves between seats. */
function useGlide(goal: number) {
  const [v, setV] = useState(goal);
  const cur = useRef(goal);
  useEffect(() => {
    if (cur.current === goal) return;
    const snap =
      document.documentElement.dataset.motion === "reduce" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = 1 - Math.exp(-dt * 6);
      let x = snap ? goal : cur.current + (goal - cur.current) * k;
      if (Math.abs(goal - x) < 0.004) x = goal;
      cur.current = x;
      setV(x);
      if (x !== goal) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [goal]);
  return v;
}

/** The stage size, kept fresh on resize. */
function useSize() {
  const [size, setSize] = useState<[number, number]>(() =>
    typeof window === "undefined"
      ? [1280, 720]
      : [window.innerWidth, window.innerHeight],
  );
  useEffect(() => {
    const on = () => setSize([window.innerWidth, window.innerHeight]);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/** Where each character sits: across the table, or (picking) the four seats round the far side. */
function seatsFor(look: LookId, count: number) {
  if (look === "select" && count === 4)
    return SEAT_ANGLES.map((a) => ({
      x: SEAT_RADIUS * Math.sin(a),
      z: -SEAT_RADIUS * Math.cos(a),
      rot: -a,
    }));
  return [{ x: 0, z: -SEAT_RADIUS, rot: 0 }];
}

/** A few dust motes in the lamp light: x (in lamp widths from the middle), y (share of the way down), phase. */
const DUST = [
  [-0.6, 0.25, 0],
  [0.4, 0.35, 3],
  [-0.2, 0.55, 6],
  [0.8, 0.6, 1.5],
  [-0.9, 0.7, 4.5],
  [0.1, 0.18, 7.5],
] as const;

/** Two strings of pennants drooping across the top of the room. */
function Bunting() {
  const strings = [
    { y0: 4, sag: 6, n: 7 },
    { y0: 30, sag: 8, n: 6 },
  ];
  // sampled from the 3D render: dim rust, brown, tan and a dark umber
  const tones = ["#5c1a0c", "#6a3a18", "#8a5f32", "#3a2a16"];
  return (
    <svg
      className="st-bunting"
      viewBox="0 0 400 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {strings.map(({ y0, sag, n }, k) => {
        const at = (x: number) => y0 + sag * (1 - ((x - 200) / 200) ** 2);
        const flags = Array.from({ length: n }, (_, i) => {
          const x = ((i + 0.5) / n) * 400;
          const w = (400 / n) * 0.3;
          const y1 = at(x - w);
          const y2 = at(x + w);
          return (
            <path
              key={i}
              d={`M${(x - w).toFixed(1)} ${y1.toFixed(1)} L${(x + w).toFixed(1)} ${y2.toFixed(1)} L${x.toFixed(1)} ${((y1 + y2) / 2 + 26).toFixed(1)}Z`}
              fill={tones[(i + k) % 4]}
            />
          );
        });
        return (
          <g key={k}>
            <path
              d={`M0 ${y0} Q200 ${y0 + sag * 2} 400 ${y0}`}
              fill="none"
              stroke="#1a0e08"
              strokeWidth="1.2"
            />
            {flags}
          </g>
        );
      })}
    </svg>
  );
}

const DECOR_TRICK = [
  ["KH", -0.16, 0.05, 0.3],
  ["7H", 0.02, -0.08, -0.12],
  ["AH", 0.18, 0.06, -0.42],
  ["2S", 0.0, 0.16, 0.08],
] as const;

function Room({
  look,
  idle,
  focus,
  turnAcross,
  figKey,
  figIds,
  figReady,
  loadFigures,
  across,
  onFigReady,
  children,
}: {
  look: LookId;
  idle: boolean;
  focus: number;
  turnAcross: boolean;
  figKey: string;
  figIds: CharacterId[];
  figReady: boolean;
  loadFigures: boolean;
  /** The character across the table (an index into CHARACTERS). */
  across: number;
  onFigReady: () => void;
  children: ReactNode;
}) {
  const [w, h] = useSize();
  // picking: the camera glides from seat to seat, as the 3D app's does
  const at = useGlide(look === "select" ? focus : 0);
  // title, menu and games stand on the pictures rendered from the 3D app: draw through their camera and crop
  const onPlate = look !== "select";
  const plateView = useMemo(
    () => (onPlate ? makePlateView(look, w, h) : null),
    [onPlate, look, w, h],
  );
  const view = useMemo(
    () => plateView ?? makeView(look, w, h, at),
    [plateView, look, w, h, at],
  );
  // the cards, hands and tags read the same projection (set before they render)
  syncView(view);
  const aspect = plateAspect(w, h);
  // title, menu and picking use the pictures rendered from the 3D app; picking shows all four seated in it
  const plate =
    look === "select"
      ? `/baked/plate-select${Math.max(0, Math.min(3, focus))}-${aspect}.webp`
      : `/baked/plate-${look}-${aspect}.webp`;

  // the stand-in picture stays until the live figure has faded in over it
  const [figShown, setFigShown] = useState(false);
  const [shownFor, setShownFor] = useState(figKey);
  if (shownFor !== figKey) {
    setShownFor(figKey);
    setFigShown(false);
  }

  const table = useMemo(() => {
    const y = TABLE_TOP;
    const H = TOP_HALF;
    const D = TOP_DEPTH;
    const r = TOP_CORNER;
    return {
      // the same outlines as the 3D table (useSquareTable): slab, bevelled rim, felt, inlay, 36 studs
      apron: pathOf(view, tableRect(H + 0.02, D + 0.02, r, y - 0.18)),
      apronTop: pathOf(view, tableRect(H + 0.02, D + 0.02, r, y - 0.04)),
      rim: pathOf(view, tableRect(H + 0.08, D + 0.08, r + 0.09, y + 0.04)),
      lip: pathOf(view, tableRect(H + 0.005, D + 0.005, r + 0.015, y + 0.03)),
      felt: pathOf(view, tableRect(H - 0.01, D - 0.01, r, y)),
      inlay: pathOf(
        view,
        tableRect(H - 0.1575, D - 0.1575, r - 0.1125, y + 0.001),
      ),
      studs: spaced(
        tableRect(H + 0.035, D + 0.035, r + 0.045, y + 0.045, 16),
        36,
      ).map((p) => view.px(p)),
    };
  }, [view]);

  // the live figure is drawn in a canvas just big enough for it (not the whole screen)
  const figBox = useMemo(() => {
    const z = -SEAT_RADIUS;
    let l = Infinity,
      t = Infinity,
      r = -Infinity,
      b = -Infinity;
    for (const x of [-0.8, 0.8])
      for (const y of [TABLE_TOP - 0.1, 2.05])
        for (const dz of [-0.35, 0.35]) {
          const [px, py] = view.px([x, y, z + dz]);
          l = Math.min(l, px);
          r = Math.max(r, px);
          t = Math.min(t, py);
          b = Math.max(b, py);
        }
    const padX = (r - l) * 0.08;
    const padY = (b - t) * 0.08;
    l = Math.max(0, Math.floor(l - padX));
    t = Math.max(0, Math.floor(t - padY));
    r = Math.min(w, Math.ceil(r + padX));
    b = Math.min(h, Math.ceil(b + padY));
    return { l, t, w: Math.max(1, r - l), h: Math.max(1, b - t) };
  }, [view, w, h]);
  const figBoxKey = useMemo(
    () => ({ l: figBox.l, t: figBox.t, vw: w, vh: h }),
    [figBox.l, figBox.t, w, h],
  );

  const seatPos = useMemo(
    () => seatsFor(look, figIds.length),
    [look, figIds.length],
  );
  // the lamp hangs over the table in the menus; in a game it is lifted out of the picture
  const lampAt = view.pc([0, 2.92, 0]);
  const lampWide = view.px([0.42, 2.92, 0])[0] - view.px([-0.42, 2.92, 0])[0];
  const felt = view.pc([0, TABLE_TOP, 0]);
  const decor = (x: number, z: number) =>
    view.pc([x * TABLE_SCALE, TABLE_TOP, z * TABLE_SCALE]);
  // how much a card lying on the felt is squashed by the slant
  const a = view.px([0, TABLE_TOP, 0.1]);
  const b = view.px([0, TABLE_TOP, -0.1]);
  const c = view.px([0.1, TABLE_TOP, 0]);
  const d = view.px([-0.1, TABLE_TOP, 0]);
  const fk = Math.min(
    1,
    Math.abs(a[1] - b[1]) / Math.max(1, Math.abs(c[0] - d[0])),
  );

  return (
    <div
      className="st-room"
      data-look={look}
      data-idle={idle}
      data-plate={plate ? "on" : undefined}
      data-fig={figReady ? "ready" : undefined}
      style={
        {
          "--sc": `${cardPx(view).toFixed(1)}px`,
          "--fk": fk.toFixed(3),
        } as CSSProperties
      }
    >
      <div className="st-wall" />
      {/* title, menu and picking: the room (and, picking, the four regulars) are the 3D render itself */}
      {plate && (
        <img className="st-plate" src={plate} alt="" draggable={false} />
      )}
      <div
        className="st-lamp"
        style={{ "--ly": `${lampAt[1]}%` } as CSSProperties}
      />
      {look !== "play" && <Bunting />}

      {loadFigures && figIds.length > 0 && (
        <div
          className="st-fig"
          // the picture's table stands in front of the figure: cut the figure away where the table is
          style={
            onPlate
              ? { clipPath: `path(evenodd, "M0 0H${w}V${h}H0Z ${table.rim}")` }
              : undefined
          }
        >
          <div
            className="st-fig-box"
            style={{
              left: figBox.l,
              top: figBox.t,
              width: figBox.w,
              height: figBox.h,
            }}
          >
            <Figures
              key={figKey}
              look={look}
              ids={figIds}
              seats={seatPos}
              focus={turnAcross ? 0 : -1}
              at={at}
              fps={idle ? 8 : look === "play" ? 20 : 30}
              crop={plateView?.crop}
              box={figBoxKey}
              onReady={onFigReady}
            />
          </div>
        </div>
      )}

      {/* the 3D app's own picture of whoever sits across: always for the others, and for the bear until
          his live figure has loaded (then it fades into him, so he is there from the first frame) */}
      {plateView &&
        look !== "select" &&
        (figIds.length === 0 || !figShown) &&
        (() => {
          const sp =
            BAKED[aspect].sprites[
              look === "play" ? `play-c${across}-s2` : look
            ];
          if (!sp) return null;
          const { s, ox, oy } = plateView.crop;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={sp.src}
              className="st-sprite"
              data-out={figIds.length > 0 && figReady ? "" : undefined}
              onAnimationEnd={(e) => {
                if (e.animationName === "st-stand-out") setFigShown(true);
              }}
              src={sp.src}
              alt=""
              draggable={false}
              style={{
                left: sp.x * s + ox,
                top: sp.y * s + oy,
                width: sp.w * s,
                height: sp.h * s,
              }}
            />
          );
        })()}

      {/* the 3D app's table, projected through its camera */}
      <svg
        className="st-table"
        data-hide
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden
      >
        <defs>
          <radialGradient id="st-felt" cx="0.5" cy="0.42" r="0.64">
            <stop offset="0" stopColor="#a8361f" />
            <stop offset="0.22" stopColor="#9a2518" />
            <stop offset="0.5" stopColor="#952316" />
            <stop offset="0.85" stopColor="#6c120b" />
            <stop offset="1" stopColor="#4a0c06" />
          </radialGradient>
          <linearGradient id="st-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a3214" />
            <stop offset="0.45" stopColor="#522c0e" />
            <stop offset="1" stopColor="#2e180a" />
          </linearGradient>
        </defs>
        <path d={table.apron} fill="#0a0200" />
        <path d={table.apronTop} fill="#1a0301" />
        <path d={table.rim} fill="url(#st-wood)" />
        {/* the lit inner bevel of the rim, then the dark seam into the felt */}
        <path
          d={table.lip}
          fill="none"
          stroke="#8f5e2d"
          strokeWidth={Math.max(2, w / 200)}
        />
        <path
          d={table.felt}
          fill="url(#st-felt)"
          stroke="#2b060d"
          strokeWidth={Math.max(1.5, w / 320)}
        />
        <path
          d={table.inlay}
          fill="none"
          stroke="#c0631a"
          strokeWidth={Math.max(1.6, w / 300)}
        />
        {table.studs.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={Math.max(1.4, w / 600)}
            fill="#d07a2a"
          />
        ))}
      </svg>

      {false && (
        <div className="st-decor-layer">
          {DECOR_TRICK.map(([card, x, z, r]) => {
            const p = decor(x, z);
            return (
              <span
                key={card}
                className="st-dcard"
                style={{ left: `${p[0]}%`, top: `${p[1]}%` }}
              >
                <span style={{ rotate: `${(-r * 180) / Math.PI}deg` }}>
                  <CardFace card={card} />
                </span>
              </span>
            );
          })}
          {[0, 1, 2].map((i) => {
            const p = decor(-0.6 + i * 0.012, 0.3 + i * 0.01);
            return (
              <span
                key={i}
                className="st-dcard"
                style={{ left: `${p[0]}%`, top: `${p[1]}%` }}
              >
                <span style={{ rotate: `${17 - i * 10}deg` }}>
                  <i className="st-back" />
                </span>
              </span>
            );
          })}
          <span
            className="st-dcard st-ddeck"
            style={{
              left: `${decor(0.55, 0.38)[0]}%`,
              top: `${decor(0.55, 0.38)[1]}%`,
            }}
          >
            <span style={{ rotate: "-29deg" }}>
              <i className="st-back" />
            </span>
          </span>
          <span
            className="st-dcoins"
            style={{
              left: `${decor(0.7, -0.35)[0]}%`,
              top: `${decor(0.7, -0.35)[1]}%`,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} data-i={i} />
            ))}
          </span>
        </div>
      )}

      {look !== "play" && (
        <>
          <div
            className="st-cone"
            aria-hidden
            style={{
              left: `${lampAt[0]}%`,
              top: `${lampAt[1]}%`,
              width: `${(lampWide * 2.6).toFixed(1)}px`,
              height: `${(felt[1] - lampAt[1]).toFixed(1)}%`,
            }}
          />
          <div className="st-dust" aria-hidden>
            {DUST.map(([x, y, t], i) => (
              <i
                key={i}
                style={{
                  left: `calc(${lampAt[0]}% + ${(x * lampWide).toFixed(1)}px)`,
                  top: `${(lampAt[1] + y * (felt[1] - lampAt[1])).toFixed(1)}%`,
                  animationDelay: `${-t}s`,
                }}
              />
            ))}
          </div>
          <div
            className="st-shade"
            aria-hidden
            style={{
              left: `${lampAt[0]}%`,
              top: `calc(${lampAt[1]}% - ${(lampWide * 0.3).toFixed(1)}px)`,
              width: `${(lampWide * 1.25).toFixed(1)}px`,
              height: `${(lampWide * 0.42).toFixed(1)}px`,
            }}
          >
            <b />
            <i />
            <s />
            {[30, 50, 70].map((x) => (
              <em key={x} style={{ left: `${x}%` }} />
            ))}
          </div>
        </>
      )}

      <div className="st-vignette" aria-hidden />

      {children}
    </div>
  );
}
