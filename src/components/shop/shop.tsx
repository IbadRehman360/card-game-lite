"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";
import { type CoinPack, GAMES, PACKS } from "@/lib/wallet/economy";
import { CoinError, buyPack, closeShop, refreshWallet, useShop, useWallet } from "@/lib/wallet/client";
import { useCountUp } from "./use-count-up";
import "./shop.css";

const fmt = (n: number) => n.toLocaleString("en-IN");
const clock = () => Date.now();

function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Fly {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** The coin shop, opened from anywhere with openShop(). Demo: packs are free, nothing is charged. */
export function ShopOverlay() {
  const shop = useShop();
  if (!shop.open) return null;
  return <Shop need={shop.need} message={shop.message} />;
}

function Shop({ need, message }: { need: number | null; message: string | null }) {
  const { coins, ledger } = useWallet();
  const shown = useCountUp(coins);
  const [tab, setTab] = useState<"coins" | "prices" | "history">("coins");
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [flies, setFlies] = useState<Fly[]>([]);
  const [bump, setBump] = useState(0);
  const [now, setNow] = useState(0);
  // the balance when the shop opened, to know how much of `need` is still missing
  const [base] = useState(() => coins ?? 0);
  const frame = useRef<HTMLDivElement>(null);
  const balance = useRef<HTMLDivElement>(null);
  const flyId = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    sfx.open();
    void refreshWallet();
    const t = window.setTimeout(() => {
      setNow(clock());
      frame.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }, 0);
    const list = timers.current;
    return () => {
      window.clearTimeout(t);
      for (const x of list) window.clearTimeout(x);
      back?.focus?.();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const close = () => {
    sfx.back();
    closeShop();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !frame.current) return;
    const items = [...frame.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
    if (!items.length) return;
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      first.focus();
    }
  };

  const burst = (from: HTMLElement) => {
    const a = from.getBoundingClientRect();
    const b = balance.current?.getBoundingClientRect();
    if (!b) return;
    const x = a.left + a.width / 2;
    const y = a.top + a.height / 2;
    const tx = b.left + 26;
    const ty = b.top + b.height / 2;
    const batch: Fly[] = Array.from({ length: 10 }, () => ({
      id: ++flyId.current,
      x: x + (Math.random() - 0.5) * 60,
      y: y + (Math.random() - 0.5) * 30,
      dx: 0,
      dy: 0,
    })).map((f) => ({ ...f, dx: tx - f.x, dy: ty - f.y }));
    setFlies((list) => [...list, ...batch]);
    const ids = new Set(batch.map((f) => f.id));
    later(() => setFlies((list) => list.filter((f) => !ids.has(f.id))), 1400);
  };

  const buy = async (pack: CoinPack, button: HTMLElement) => {
    if (buying) return;
    sfx.select();
    setBuying(pack.id);
    setError(null);
    try {
      const added = await buyPack(pack.id);
      burst(button);
      sfx.chips(true);
      later(() => {
        sfx.confirm();
        setBump((n) => n + 1);
      }, 650);
      setToast({ id: clock(), text: `+${fmt(added || pack.coins + pack.bonus)} coins` });
      later(() => setToast(null), 2200);
      setNow(clock());
    } catch (e) {
      setError(e instanceof CoinError ? e.message : "Couldn't buy that pack");
      sfx.back();
    } finally {
      setBuying(null);
    }
  };

  const missing = need ? Math.max(0, need - ((coins ?? base) - base)) : 0;

  return (
    <div className="shop" role="dialog" aria-modal="true" aria-labelledby="shop-title" onKeyDown={onKeyDown}>
      <div className="shop-backdrop" onClick={close} aria-hidden />
      <div className="shop-frame" ref={frame}>
        <div className="shop-banner">
          <h2 id="shop-title">Shop</h2>
        </div>
        <button type="button" className="shop-close" onClick={close} aria-label="Close the shop">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="shop-bar">
          <div className="shop-balance" ref={balance} data-bump={bump % 2} key={bump}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/coins/coin.svg" alt="" aria-hidden />
            <b aria-live="polite">{shown === null ? "···" : fmt(shown)}</b>
          </div>
          <div className="shop-tabs" role="tablist" aria-label="Shop">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "coins"}
              onClick={() => {
                sfx.flip();
                setTab("coins");
              }}
            >
              Coins
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "prices"}
              onClick={() => {
                sfx.flip();
                setTab("prices");
              }}
            >
              Prices
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "history"}
              onClick={() => {
                sfx.flip();
                setNow(clock());
                setTab("history");
              }}
            >
              History
            </button>
          </div>
        </div>

        {need !== null && (
          <p className="shop-need" data-done={missing === 0} role="status">
            {missing > 0 ? (
              <>
                You need <b>{fmt(missing)}</b> more coin{missing === 1 ? "" : "s"}
                {message ? <span> · {message}</span> : null}
              </>
            ) : (
              <>You have enough coins now. Close the shop to play.</>
            )}
          </p>
        )}
        {error && (
          <p className="shop-need" role="alert">
            {error}
          </p>
        )}

        {tab === "coins" ? (
          <div className="shop-grid" role="list">
            {PACKS.map((p, i) => (
              <div className="shop-tile" role="listitem" key={p.id} data-tag={p.tag ?? undefined} style={{ "--i": i } as CSSProperties}>
                {p.tag && <span className="shop-badge">{p.tag === "best" ? "Best" : "Hot"}</span>}
                <span className="shop-tile-name">{p.name}</span>
                <span className="shop-art">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/coins/${p.art}.svg`} alt="" aria-hidden draggable={false} />
                </span>
                <span className="shop-amount">{fmt(p.coins)}</span>
                {p.bonus > 0 && <span className="shop-bonus">+{fmt(p.bonus)} bonus</span>}
                <button
                  type="button"
                  className="shop-buy"
                  data-autofocus={i === 0 ? true : undefined}
                  data-busy={buying === p.id}
                  disabled={buying !== null && buying !== p.id}
                  aria-label={`${p.name}: ${fmt(p.coins + p.bonus)} coins for ${p.price} (demo, free)`}
                  onClick={(e) => void buy(p, e.currentTarget)}
                >
                  {p.price}
                </button>
              </div>
            ))}
          </div>
        ) : tab === "prices" ? (
          <ul className="shop-history shop-prices">
            {Object.values(GAMES).map((g) => (
              <li key={g.id}>
                <span className="shop-history-reason">{g.name}</span>
                <span className="shop-history-when">{g.pays}</span>
                <b data-sign="out">−{fmt(g.fee)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="shop-history">
            {ledger.length === 0 && <li className="shop-empty">Nothing yet</li>}
            {ledger.map((l, i) => (
              <li key={`${l.at}-${i}`}>
                <span className="shop-history-reason">{l.reason}</span>
                <span className="shop-history-when">{now ? ago(l.at, now) : ""}</span>
                <b data-sign={l.amount >= 0 ? "in" : "out"}>
                  {l.amount >= 0 ? "+" : "−"}
                  {fmt(Math.abs(l.amount))}
                </b>
              </li>
            ))}
          </ul>
        )}


        {toast && (
          <div className="shop-toast" key={toast.id} role="status">
            {toast.text}
          </div>
        )}
      </div>

      <div className="shop-flies" aria-hidden>
        {flies.map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={f.id}
            src="/coins/coin.svg"
            alt=""
            style={{ left: f.x, top: f.y, "--dx": `${f.dx}px`, "--dy": `${f.dy}px`, "--d": `${(i % 10) * 45}ms` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
