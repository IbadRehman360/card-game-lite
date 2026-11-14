"use client";

import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { openShop, useWallet } from "@/lib/wallet/client";
import { useCountUp } from "./use-count-up";
import "./shop.css";

/**
 * Your coins: the balance (rolling up and down as it changes) and a green "+" that opens the shop.
 * Coins you gain fly into it.
 */
export function CoinPill({ onClick, compact = false }: { onClick?: () => void; compact?: boolean }) {
  const { coins } = useWallet();
  const shown = useCountUp(coins);
  const last = useRef<number | null>(null);
  const [gain, setGain] = useState(0);
  // the last change, floated by the pill as +N / −N
  const [delta, setDelta] = useState<{ n: number; k: number } | null>(null);

  useEffect(() => {
    const prev = last.current;
    last.current = coins;
    if (prev === null || coins === null || coins === prev) return;
    const t = window.setTimeout(() => {
      if (coins > prev) setGain((g) => g + 1);
      setDelta((d) => ({ n: coins - prev, k: (d?.k ?? 0) + 1 }));
    }, 0);
    return () => window.clearTimeout(t);
  }, [coins]);

  const open = () => {
    sfx.select();
    if (onClick) onClick();
    else openShop();
  };

  return (
    <div className="coin-pill" data-compact={compact} data-loading={coins === null}>
      <button type="button" className="coin-pill-body" onClick={open} aria-label={coins === null ? "Coins" : `${coins} coins, open the shop`}>
        <span className="coin-pill-icon" key={gain} data-pulse={gain > 0}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/coins/coin.svg" alt="" aria-hidden />
        </span>
        <b className="coin-pill-count">{shown === null ? "···" : shown.toLocaleString("en-IN")}</b>
      </button>
      <button type="button" className="coin-pill-plus" onClick={open} aria-label="Get coins" title="Shop">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {delta && (
        <span className="coin-pill-delta" data-up={delta.n > 0} key={`d${delta.k}`} aria-hidden>
          {delta.n > 0 ? "+" : "−"}
          {Math.abs(delta.n).toLocaleString("en-IN")}
        </span>
      )}
      {gain > 0 && (
        <span className="coin-pill-fly" key={`f${gain}`} aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src="/coins/coin.svg" alt="" style={{ ["--i" as string]: i }} />
          ))}
        </span>
      )}
    </div>
  );
}
