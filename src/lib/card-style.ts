"use client";

import { useEffect } from "react";
import { usePrefs } from "./prefs";
import { TABLE_LOOKS, useTableTheme } from "./table-theme";
import { useWallet } from "./wallet/client";
import { type CardBackId, DEFAULT_BACK, DEFAULT_TABLE } from "./wallet/economy";

/**
 * Card style: the art for every card back on sale (the names and prices are in wallet/economy.ts, so the
 * server charges from its own list), and the hook that puts the picked back, and the picked table's felt,
 * on every card and board in the app.
 *
 * Each back is a small SVG, 100 × 140 (a 5:7 card), used as a CSS background. Every one is built like a
 * fine deck's back: a cream border all round (the part you see when the hand is fanned), a field with an
 * all-over pattern, a gilt double frame, and a centre medallion; and each reads the same either way up.
 * Picking a back other than the free one sets `data-card-back` and `--cb-img` on <html>; card-style.css
 * then paints that picture on every face-down card. The free one leaves the game's own drawing alone.
 */

const n = (v: number) => v.toFixed(2);

/** Gold leaf and silver, as gradients any back can use (url(#au), url(#ag)). */
const METALS = `
  <linearGradient id="au" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8a5d16"/><stop offset=".3" stop-color="#e2b85a"/><stop offset=".5" stop-color="#fff0b8"/>
    <stop offset=".7" stop-color="#c99a38"/><stop offset="1" stop-color="#7a4f10"/>
  </linearGradient>
  <linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7f8ea8"/><stop offset=".35" stop-color="#d9e2f0"/><stop offset=".5" stop-color="#ffffff"/>
    <stop offset=".7" stop-color="#b4c1d6"/><stop offset="1" stop-color="#5f6d86"/>
  </linearGradient>`;

/** The common build: cream border, field, pattern, gilt double frame and four corner diamonds. */
function back(o: { defs: string; field: string; pattern: string; metal?: "au" | "ag"; border?: string; art: string }): string {
  const m = `url(#${o.metal ?? "au"})`;
  const corner = (x: number, y: number) => `<path d="M${x} ${y - 3}L${x + 3} ${y}L${x} ${y + 3}L${x - 3} ${y}Z" fill="${m}"/>`;
  return `
    <defs>${METALS}${o.defs}</defs>
    <rect width="100" height="140" rx="6" fill="${o.border ?? "#f3ead4"}"/>
    <rect x="4" y="4" width="92" height="132" rx="4" fill="${o.field}"/>
    <rect x="4" y="4" width="92" height="132" rx="4" fill="${o.pattern}"/>
    <rect x="6.5" y="6.5" width="87" height="127" rx="3" fill="none" stroke="${m}" stroke-width="1.5"/>
    <rect x="9" y="9" width="82" height="122" rx="2" fill="none" stroke="${m}" stroke-width=".55" stroke-opacity=".8"/>
    ${corner(6.5, 6.5)}${corner(93.5, 6.5)}${corner(6.5, 133.5)}${corner(93.5, 133.5)}
    ${o.art}`;
}

/** A guilloché rosette: a ring of `count` circles of radius `r`, their centres `c` out from the middle. */
function rosette(cx: number, cy: number, count: number, c: number, r: number, stroke: string, w: number, op = 1) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return `<circle cx="${n(cx + Math.cos(a) * c)}" cy="${n(cy + Math.sin(a) * c)}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}"/>`;
  }).join("");
}

/** A flower of `k` pointed petals, for medallions. */
function flower(cx: number, cy: number, k: number, len: number, wide: number, fill: string, stroke = "none", sw = 0) {
  return Array.from({ length: k }, (_, i) => {
    const deg = (360 / k) * i;
    return `<path d="M${cx} ${cy}C${n(cx - wide)} ${n(cy - len * 0.45)} ${n(cx - wide * 0.4)} ${n(cy - len * 0.85)} ${cx} ${n(cy - len)}C${n(cx + wide * 0.4)} ${n(cy - len * 0.85)} ${n(cx + wide)} ${n(cy - len * 0.45)} ${cx} ${cy}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="rotate(${deg} ${cx} ${cy})"/>`;
  }).join("");
}

const ART: Record<CardBackId, string> = {
  // the house back: wine damask (ogee lattice with a small fleur in each cell), a gilt rosette medallion
  wine: back({
    defs: `
      <radialGradient id="g" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="#8a2230"/><stop offset="1" stop-color="#4a0f18"/></radialGradient>
      <pattern id="p" width="16" height="22" patternUnits="userSpaceOnUse" x="2" y="3">
        <path d="M8 0C13 5 13 6 8 11C3 16 3 17 8 22M8 0C3 5 3 6 8 11C13 16 13 17 8 22" fill="none" stroke="#e0b25a" stroke-opacity=".38" stroke-width=".7"/>
        <path d="M0 11C4 9 4 7 0 4M16 11C12 9 12 7 16 4M0 11C4 13 4 15 0 18M16 11C12 13 12 15 16 18" fill="none" stroke="#e0b25a" stroke-opacity=".22" stroke-width=".6"/>
        <path d="M8 7.5 9.6 11 8 14.5 6.4 11Z" fill="#c9374a" fill-opacity=".7"/>
        <circle cx="8" cy="11" r=".9" fill="#f0c674" fill-opacity=".7"/>
      </pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    art: `
      <circle cx="50" cy="70" r="21" fill="#4a0f18" stroke="url(#au)" stroke-width="1.6"/>
      ${rosette(50, 70, 18, 7, 9.5, "#e8c36e", 0.45, 0.85)}
      <circle cx="50" cy="70" r="17.5" fill="none" stroke="url(#au)" stroke-width=".5"/>
      ${flower(50, 70, 8, 8, 3, "url(#au)")}
      <circle cx="50" cy="70" r="2.4" fill="#7a1726" stroke="#fff0b8" stroke-width=".6"/>`,
  }),

  // midnight guilloché: interlaced silver rings all over, a large engraved rosette in the middle
  navy: back({
    defs: `
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3f78"/><stop offset=".5" stop-color="#16305e"/><stop offset="1" stop-color="#0b1a3a"/></linearGradient>
      <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" x="2" y="4">
        <circle cx="6" cy="6" r="6" fill="none" stroke="#c9d6ee" stroke-opacity=".22" stroke-width=".5"/>
        <circle cx="0" cy="0" r="6" fill="none" stroke="#c9d6ee" stroke-opacity=".22" stroke-width=".5"/>
        <circle cx="12" cy="0" r="6" fill="none" stroke="#c9d6ee" stroke-opacity=".22" stroke-width=".5"/>
        <circle cx="0" cy="12" r="6" fill="none" stroke="#c9d6ee" stroke-opacity=".22" stroke-width=".5"/>
        <circle cx="12" cy="12" r="6" fill="none" stroke="#c9d6ee" stroke-opacity=".22" stroke-width=".5"/>
      </pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    metal: "ag",
    border: "#eef1f6",
    art: `
      <ellipse cx="50" cy="70" rx="30" ry="34" fill="#0d1d40" fill-opacity=".85"/>
      ${rosette(50, 70, 40, 13, 15, "#dfe7f5", 0.42, 0.85)}
      ${rosette(50, 70, 24, 6, 7, "#ffffff", 0.4, 0.7)}
      <circle cx="50" cy="70" r="29" fill="none" stroke="url(#ag)" stroke-width="1.3"/>
      <circle cx="50" cy="70" r="4" fill="#0b1a3a" stroke="#e8c46a" stroke-width="1"/>
      <circle cx="50" cy="70" r="1.6" fill="#e8c46a"/>`,
  }),

  // forest jaali: a Mughal eight-point star lattice in gold on emerald, a pietra dura flower medallion
  forest: back({
    defs: `
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6a43"/><stop offset=".5" stop-color="#155234"/><stop offset="1" stop-color="#0b2c1c"/></linearGradient>
      <pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" x="1" y="0">
        <path d="M3.5 3.5H10.5V10.5H3.5ZM7 2 12 7 7 12 2 7ZM12 7H14M0 7H2M7 12V14M7 0V2" fill="none" stroke="#e6c77a" stroke-opacity=".5" stroke-width=".6"/>
        <circle cx="0" cy="0" r="1.2" fill="#e6c77a" fill-opacity=".55"/><circle cx="14" cy="0" r="1.2" fill="#e6c77a" fill-opacity=".55"/>
        <circle cx="0" cy="14" r="1.2" fill="#e6c77a" fill-opacity=".55"/><circle cx="14" cy="14" r="1.2" fill="#e6c77a" fill-opacity=".55"/>
      </pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    art: `
      <path d="M50 44 68.4 51.6 76 70 68.4 88.4 50 96 31.6 88.4 24 70 31.6 51.6Z" fill="#f3ead4" stroke="url(#au)" stroke-width="1.8"/>
      <path d="M50 49 64.8 55.2 71 70 64.8 84.8 50 91 35.2 84.8 29 70 35.2 55.2Z" fill="none" stroke="#1f6a43" stroke-width=".6"/>
      ${flower(50, 70, 8, 17, 5, "#b8322a", "#7a1a14", 0.4)}
      ${flower(50, 70, 8, 10, 3.2, "#1f4fa0", "none", 0)}
      <circle cx="50" cy="70" r="3" fill="url(#au)"/>`,
  }),

  // noir art deco: gold sunbursts top and bottom, stepped frame corners, a faceted diamond
  noir: back({
    defs: `
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f1c19"/><stop offset=".5" stop-color="#0d0c0a"/><stop offset="1" stop-color="#1f1c19"/></linearGradient>
      <pattern id="p" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 5H10" stroke="#c9a24a" stroke-opacity=".08" stroke-width=".5"/></pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    border: "#f1e6cc",
    art: `
      <g stroke="url(#au)" stroke-width=".7" stroke-opacity=".85">
        ${Array.from({ length: 13 }, (_, i) => {
          const a = (Math.PI * (i + 1)) / 14;
          const x = 50 - Math.cos(a) * 40;
          const y = Math.sin(a) * 40;
          return `<path d="M50 11 ${n(x)} ${n(11 + y)}"/><path d="M50 129 ${n(x)} ${n(129 - y)}"/>`;
        }).join("")}
      </g>
      <path d="M14 14H22V18H18V22H14ZM86 14H78V18H82V22H86ZM14 126H22V122H18V118H14ZM86 126H78V122H82V118H86Z" fill="url(#au)"/>
      <path d="M50 46 70 70 50 94 30 70Z" fill="#0d0c0a" stroke="url(#au)" stroke-width="1.6"/>
      <path d="M50 54 63 70 50 86 37 70Z" fill="none" stroke="url(#au)" stroke-width=".6"/>
      <path d="M50 60 58 70 50 80 42 70Z" fill="url(#au)"/>
      <path d="M50 60V80M42 70H58" stroke="#7a4f10" stroke-width=".4"/>`,
  }),

  // dhaba chai: terracotta block print (ajrak-like stars), kulhads top and bottom, a steaming cup in the medallion
  chai: back({
    defs: `
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b5582a"/><stop offset=".5" stop-color="#9a4520"/><stop offset="1" stop-color="#b5582a"/></linearGradient>
      <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse" x="2" y="4">
        <path d="M6 1.5 7.2 4.8 10.5 6 7.2 7.2 6 10.5 4.8 7.2 1.5 6 4.8 4.8Z" fill="#f7e3c2" fill-opacity=".28"/>
        <circle cx="6" cy="6" r="1" fill="#3a1608" fill-opacity=".5"/>
        <circle cx="0" cy="0" r=".9" fill="#f7e3c2" fill-opacity=".3"/><circle cx="12" cy="0" r=".9" fill="#f7e3c2" fill-opacity=".3"/>
        <circle cx="0" cy="12" r=".9" fill="#f7e3c2" fill-opacity=".3"/><circle cx="12" cy="12" r=".9" fill="#f7e3c2" fill-opacity=".3"/>
      </pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    art: `
      <g fill="#f7e3c2" fill-opacity=".85">
        ${[30, 50, 70].map((x) => `<path d="M${x - 5} 17H${x + 5}L${x + 4} 25H${x - 4}Z"/><path d="M${x - 5} 123H${x + 5}L${x + 4} 115H${x - 4}Z"/>`).join("")}
      </g>
      <circle cx="50" cy="70" r="24" fill="#5e230c" stroke="url(#au)" stroke-width="1.7"/>
      ${rosette(50, 70, 16, 21, 3, "#f7e3c2", 0.5, 0.6)}
      <path d="M38 64H62L58.5 86H41.5Z" fill="#d98a4a" stroke="#f7e3c2" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M39 68H61" stroke="#f7e3c2" stroke-width=".9"/>
      <path d="M38.5 64.5H61.5" stroke="#4a1a08" stroke-width="1.2"/>
      <path d="M44 59C42 56 46 54.5 44 51.5M50 59C48 56 52 54.5 50 51.5M56 59C54 56 58 54.5 56 51.5" fill="none" stroke="#f7e3c2" stroke-width="1.2" stroke-linecap="round"/>`,
  }),

  // truck art: bunting top and bottom, chamak-patti dots down the sides, a big phool with green leaves
  truck: back({
    defs: `
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4182e"/><stop offset=".5" stop-color="#a60f22"/><stop offset="1" stop-color="#d4182e"/></linearGradient>
      <pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse" x="1" y="0">
        <path d="M7 3C8.6 5 8.6 9 7 11 5.4 9 5.4 5 7 3ZM3 7C5 5.4 9 5.4 11 7 9 8.6 5 8.6 3 7Z" fill="#ffd21f" fill-opacity=".2"/>
      </pattern>`,
    field: "url(#g)",
    pattern: "url(#p)",
    border: "#ffe9a8",
    art: `
      ${Array.from({ length: 8 }, (_, i) => {
        const c = ["#ffd21f", "#1fa04a", "#1e6fd9", "#ff7a1a"][i % 4];
        const x = 10 + i * 10;
        return `<path d="M${x} 10H${x + 10}L${x + 5} 19Z" fill="${c}" stroke="#7a0a18" stroke-width=".4"/><path d="M${x} 130H${x + 10}L${x + 5} 121Z" fill="${c}" stroke="#7a0a18" stroke-width=".4"/>`;
      }).join("")}
      <g>
        ${Array.from({ length: 8 }, (_, i) => {
          const c = ["#ffd21f", "#3fd47a", "#5aa8ff", "#ff5fa2"][i % 4];
          return `<circle cx="14" cy="${n(31 + i * 11)}" r="2" fill="${c}"/><circle cx="86" cy="${n(31 + i * 11)}" r="2" fill="${c}"/>`;
        }).join("")}
      </g>
      <path d="M20 44C28 36 34 37 36 46 28 47 24 47 20 44ZM80 44C72 36 66 37 64 46 72 47 76 47 80 44ZM20 96C28 104 34 103 36 94 28 93 24 93 20 96ZM80 96C72 104 66 103 64 94 72 93 76 93 80 96Z" fill="#1fa04a" stroke="#0d5a28" stroke-width=".5"/>
      <g transform="translate(50 70)">
        ${Array.from({ length: 12 }, (_, i) => `<ellipse rx="5.5" ry="15" cy="-13" fill="${i % 2 ? "#ff5fa2" : "#ffd21f"}" stroke="#7a0a18" stroke-width=".6" transform="rotate(${i * 30})"/>`).join("")}
        <circle r="10" fill="#1e6fd9" stroke="url(#au)" stroke-width="2"/>
        ${flower(0, 0, 6, 8, 2.6, "#ffd21f")}
        <circle r="2.2" fill="#d4182e"/>
      </g>`,
  }),
};

/** The SVG for a back (100 × 140). */
export function backSvg(id: CardBackId): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none">${ART[id]}</svg>`;
}

/** The back as a data: URL, for <img> and CSS. */
export function backUrl(id: CardBackId): string {
  return `data:image/svg+xml,${encodeURIComponent(backSvg(id).replace(/\s+/g, " "))}`;
}

/** The back the cards actually show: the one picked, if this wallet owns it, else the free one. */
export function useCardBack(): CardBackId {
  const { cardBack } = usePrefs();
  const { backs } = useWallet();
  return backs.includes(cardBack) ? cardBack : DEFAULT_BACK;
}

/**
 * Keeps <html> in step with the back and the table that are shown: card-style.css paints the back on every
 * card, and a board drawn in CSS (Paanch's) takes its felt from the table theme's `--tt-felt-*` colours.
 */
export function useApplyCardStyle() {
  const back = useCardBack();
  const table = useTableTheme();
  useEffect(() => {
    const root = document.documentElement;
    if (back === DEFAULT_BACK) {
      delete root.dataset.cardBack;
      root.style.removeProperty("--cb-img");
    } else {
      root.dataset.cardBack = back;
      root.style.setProperty("--cb-img", `url("${backUrl(back)}")`);
    }
  }, [back]);
  useEffect(() => {
    const root = document.documentElement;
    const vars = ["--tt-felt-hi", "--tt-felt", "--tt-felt-lo"];
    if (table === DEFAULT_TABLE) {
      delete root.dataset.tableTheme;
      for (const v of vars) root.style.removeProperty(v);
    } else {
      const f = TABLE_LOOKS[table].felt;
      root.dataset.tableTheme = table;
      root.style.setProperty(vars[0], f[1]);
      root.style.setProperty(vars[1], f[2]);
      root.style.setProperty(vars[2], f[3]);
    }
  }, [table]);
}
