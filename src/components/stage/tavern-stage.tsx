"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CHARACTERS, type CharacterId } from "@/lib/characters";
import { usePrefs } from "@/lib/prefs";
import type { TableSnapshot } from "@/lib/game/view";
import { CardFace } from "@/components/game/playing-card";
import { ChaiGlass } from "@/components/avatars/chai";
import { SEATED, SeatedFigure } from "@/components/avatars/seated";
import { TablePlay, TagProjector, cardPx, syncView } from "./table-play";
import {
  type LookId,
  SEAT_RADIUS,
  type Vec,
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
import { ThemedTable } from "./table-theme";
import "./stage2d.css";

export type StageScene = "title" | "menu" | "profile" | "play";

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
  table: StageTable | null;
  patti?: PattiStageTable | null;
  bluff?: (BluffStageTable & { seatChars: number[] }) | null;
  /** A card game drawn over the table (Bhabhi, G Patta): who sits where and whose turn it is. */
  seats?: StageSeats | null;
  /** A full-screen game covers the room: stop the little lamp flicker. */
  idle?: boolean;
  onReady: () => void;
};

/**
 * The tavern, flat: a lamp-lit wooden room and a round felt table, drawn with plain HTML and CSS.
 * The characters (the 2D desi cast, seated) sit behind the far rail; the cards in play lie on the felt.
 */
export default function TavernStage({
  scene,
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
  // the profile screen draws its own big character over the menu's room
  const look: LookId = playing ? "play" : scene === "title" ? "title" : "menu";
  const prefs = usePrefs();
  const charAt = (s: number) => {
    const n = seatChars.length;
    const i = n ? seatChars[s % n] : s;
    return CHARACTERS[((i % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length].id;
  };
  // who sits where: across the table (and, on wide screens, either side) in a game; in the title and
  // menu, your own character across the table as the room's host
  const sitters: Sitter[] =
    look === "play"
      ? [1, 2, 3].map((seat) => ({ seat, id: charAt(seat) }))
      : scene === "profile"
        ? []
        : [{ seat: 2, id: prefs.character ?? "badshah" }];

  return (
    <Room
      look={look}
      idle={idle}
      sitters={sitters}
      turnSeat={look === "play" ? turnSeat : -1}
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
          {/* the drinks in the room are baked into its pictures; your own cutting chai sits by your seat */}
          <ChaiGlass className="st-chai" />
        </div>
      )}
    </Room>
  );
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

/** How far (metres) the player across sits back from the far rail in a game. */
const ACROSS_BACK = 0.35;

/** A character at one of the far seats: 1 (right), 2 (across), 3 (left). */
interface Sitter {
  seat: number;
  id: CharacterId;
}

/**
 * One seated character, drawn behind the table at their seat: the 2D cast's half-body figure. Shot in
 * Bluff, the one across jerks back and slumps over the table (the drama fires "st-slump").
 */
function SeatedAt({
  sitter,
  box,
  behind,
  turn,
  shot,
  delay,
}: {
  sitter: Sitter;
  box: { l: number; t: number; w: number };
  /** Drawn under the table, so its far rail crosses their hands. */
  behind: boolean;
  turn: boolean;
  shot: boolean;
  delay: number;
}) {
  const [slumped, setSlumped] = useState(false);
  useEffect(() => {
    if (!shot) return;
    const go = () => setSlumped(true);
    window.addEventListener("st-slump", go);
    return () => window.removeEventListener("st-slump", go);
  }, [shot]);
  return (
    <div
      className="st-sit"
      data-seat={sitter.seat}
      data-behind={behind || undefined}
      data-turn={turn || undefined}
      data-slump={slumped || undefined}
      style={
        {
          left: box.l,
          top: box.t,
          width: box.w,
          "--sit-delay": `${-delay}s`,
        } as CSSProperties
      }
    >
      <SeatedFigure id={sitter.id} sip />
    </div>
  );
}

function Room({
  look,
  idle,
  sitters,
  turnSeat,
  children,
}: {
  look: LookId;
  idle: boolean;
  sitters: Sitter[];
  /** Whose turn it is (a game seat; -1 for nobody), so that seat's figure is lit. */
  turnSeat: number;
  children: ReactNode;
}) {
  const [w, h] = useSize();
  const aspect = plateAspect(w, h);
  // a game on anything wider than an upright phone draws its own table, through a camera fitted to the
  // screen (the captured pictures were framed for one shape and cut the player across off)
  // (an upright tablet too: the phone's tall picture, cropped to its squarer shape, loses the player across)
  const wideGame = look === "play" && (aspect !== "tall" || w / h > 0.6);
  // title, menu and games stand on the pictures rendered from the 3D app: draw through their camera and crop
  const onPlate = !wideGame;
  const plateView = useMemo(
    () => (onPlate ? makePlateView(look, w, h) : null),
    [onPlate, look, w, h],
  );
  const view = useMemo(
    () => plateView ?? makeView(look, w, h),
    [plateView, look, w, h],
  );
  // the cards, hands and tags read the same projection (set before they render)
  syncView(view);
  // the room's pictures (no one in them: the cast is drawn over them, below)
  const plate = wideGame ? null : `/baked/plate-${look}-${aspect}.webp`;

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
      // a big turned square on the felt and a smaller one inside it (the felt's printed "boxes")
      emblem: [0.62, 0.42].map((k) => {
        const a = Math.min(H, D) * k * TABLE_SCALE;
        return pathOf(view, [
          [0, y + 0.002, -a],
          [a, y + 0.002, 0],
          [0, y + 0.002, a],
          [-a, y + 0.002, 0],
        ]);
      }),
      studs: spaced(
        tableRect(H + 0.035, D + 0.035, r + 0.045, y + 0.045, 16),
        36,
      ).map((p) => view.px(p)),
    };
  }, [view]);

  // each seated character: their table line on the rail in front of them, sized for their distance.
  // Across: in a game they sit back from the far rail (sized for a chair further off, their hands
  // just under the rail, which is drawn over them where the table is drawn), so their face stays clear
  // of the cards dealt across; in the menus, your character leans on it. Either side (wide screens
  // only, where there is floor beside the table): just off their own rail, forearms over it.
  const sitBoxes = useMemo(() => {
    const rimZ = -(TOP_DEPTH + 0.08) * TABLE_SCALE;
    const rimX = (TOP_HALF + 0.08) * TABLE_SCALE;
    const sides = look === "play" && w / Math.max(1, h) > 0.9;
    const k = look === "play" ? 1 : 1.12;
    return sitters.flatMap((s) => {
      if (s.seat !== 2 && !sides) return [];
      const dx = s.seat === 1 ? 1 : s.seat === 3 ? -1 : 0;
      const at: Vec =
        dx === 0
          ? [0, TABLE_TOP + 0.04, rimZ]
          : [dx * (rimX + 0.3), TABLE_TOP + 0.04, 0];
      // a metre at the sitter's own distance, measured across the screen
      const back = look === "play" && dx === 0 ? ACROSS_BACK : 0;
      const depth: Vec = dx === 0 ? [0, TABLE_TOP, -SEAT_RADIUS - back] : at;
      const ppm =
        view.px([depth[0] + 0.5, depth[1], depth[2]])[0] -
        view.px([depth[0] - 0.5, depth[1], depth[2]])[0];
      const bw = (SEATED.w / SEATED.perMetre) * Math.abs(ppm) * k * (dx ? 0.92 : 1);
      const [x, y] = view.px(at);
      // sat back: the hands drop just under the far rail
      const top = y - (bw * SEATED.table) / SEATED.w + (back ? bw * 0.05 : 0);
      const behind = back > 0 && wideGame;
      return [{ sitter: s, box: { l: x - bw / 2, t: top, w: bw }, behind }];
    });
  }, [sitters, look, view, w, h, wideGame]);

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
      style={
        {
          "--sc": `${cardPx(view).toFixed(1)}px`,
          "--fk": fk.toFixed(3),
        } as CSSProperties
      }
    >
      <div className="st-wall" />
      {/* title, menu and a game on an upright phone: the room is the 3D render itself (no one in it) */}
      {plate && (
        <img className="st-plate" src={plate} alt="" draggable={false} />
      )}
      <div
        className="st-lamp"
        style={{ "--ly": `${lampAt[1]}%` } as CSSProperties}
      />
      {look !== "play" && <Bunting />}

      {/* the 3D app's table, projected through its camera, in the table theme picked in the shop */}
      <ThemedTable paths={table} w={w} h={h} plate={!!plate} play={look === "play"} squash={fk} />

      {/* the cast, seated behind the table (over the room's picture, and over the far rail they lean on) */}
      {sitBoxes.map(({ sitter, box, behind }) => (
        <SeatedAt
          key={`${look}-${sitter.seat}-${sitter.id}`}
          sitter={sitter}
          box={box}
          behind={behind}
          turn={sitter.seat === turnSeat}
          shot={look === "play" && sitter.seat === 2}
          delay={sitter.seat * 1.3}
        />
      ))}

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
