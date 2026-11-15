"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { backUrl, useCardBack } from "@/lib/card-style";
import { setPrefs } from "@/lib/prefs";
import { sfx } from "@/lib/sfx";
import { tablePreviewUrl, useTableTheme } from "@/lib/table-theme";
import { CoinError, buyCardBack, buyTableTheme, useWallet } from "@/lib/wallet/client";
import { CARD_BACKS, TABLE_THEMES } from "@/lib/wallet/economy";
import { CostTag } from "./cost-tag";
import "./card-style.css";

const fmt = (n: number) => n.toLocaleString("en-IN");

/** Sends the player to the coin packs, with how many coins are missing and what for. */
export type NeedCoins = (short: number, message: string) => void;

interface Item {
  id: string;
  name: string;
  price: number;
}

type Kind = "back" | "table";

/** The picture of a back (a real 5:7 card) or a table, sized by its box. */
function ItemPic({ kind, art }: { kind: Kind; art: string }) {
  if (kind === "back") return <span className="cs-pic cs-pic-back" style={{ backgroundImage: `url("${art}")` }} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="cs-pic cs-pic-table" src={art} alt="" aria-hidden draggable={false} />;
}

/**
 * One cosmetic for sale, in the coin packs' tile: a cream tile, the name on top, the picture, and one
 * gold button: the price (opens the confirm), "Use", or "In use".
 */
function ItemTile({
  item,
  i,
  art,
  kind,
  owned,
  inUse,
  busy,
  onTap,
}: {
  item: Item;
  i: number;
  art: string;
  kind: Kind;
  owned: boolean;
  inUse: boolean;
  busy: boolean;
  onTap: () => void;
}) {
  const state = inUse ? "inuse" : owned ? "use" : "buy";
  const label = state === "inuse" ? `${item.name}, in use` : state === "use" ? `Use ${item.name}` : `Buy ${item.name} for ${fmt(item.price)} coins`;
  return (
    <div className="shop-tile cs-tile" role="listitem" data-kind={kind} data-owned={owned} style={{ "--i": i } as CSSProperties}>
      <span className="shop-tile-name">{item.name}</span>
      <span className="shop-art cs-art">
        <ItemPic kind={kind} art={art} />
      </span>
      <button
        type="button"
        className="shop-buy cs-buy"
        data-state={state}
        data-busy={busy}
        disabled={inUse || busy}
        aria-label={label}
        onClick={onTap}
      >
        {state === "inuse" ? "In use" : state === "use" ? "Use" : <CostTag amount={item.price} className="cost-tag-plain" />}
      </button>
    </div>
  );
}

/**
 * The confirm before spending coins: the item, "Buy X for 600?", and Buy / Cancel. Short of coins, it
 * says how many more are needed and offers the coin packs instead.
 */
function BuyConfirm({
  item,
  kind,
  art,
  coins,
  busy,
  onBuy,
  onGetCoins,
  onCancel,
}: {
  item: Item;
  kind: Kind;
  art: string;
  coins: number | null;
  busy: boolean;
  onBuy: () => void;
  onGetCoins: (short: number) => void;
  onCancel: () => void;
}) {
  const short = coins !== null ? Math.max(0, item.price - coins) : 0;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onCancel();
  };
  return (
    <div className="cs-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cs-confirm-title" onKeyDown={onKeyDown}>
      <div className="cs-confirm-backdrop" onClick={onCancel} aria-hidden />
      <div className="cs-confirm-card" data-kind={kind}>
        <span className="cs-confirm-pic">
          <ItemPic kind={kind} art={art} />
        </span>
        <p className="cs-confirm-title" id="cs-confirm-title">
          Buy {item.name} for <CostTag amount={item.price} className="cost-tag-plain" />?
        </p>
        {short > 0 && (
          <p className="cs-confirm-short" role="status">
            You need <b>{fmt(short)}</b> more coin{short === 1 ? "" : "s"}
          </p>
        )}
        <div className="cs-confirm-actions">
          <button type="button" className="cs-cancel" onClick={onCancel}>
            Cancel
          </button>
          {short > 0 ? (
            <button type="button" ref={first} className="shop-buy cs-buy" onClick={() => onGetCoins(short)}>
              Get coins
            </button>
          ) : (
            <button type="button" ref={first} className="shop-buy cs-buy" data-busy={busy} disabled={busy} onClick={onBuy}>
              Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Buying, shared by the Cards and Tables tabs: a tap on a price opens the confirm, Buy there buys. */
function useBuying(onError: (message: string) => void) {
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, buy: () => Promise<void>, apply: () => void, what: string) => {
    if (busy) return;
    setBusy(id);
    try {
      await buy();
      sfx.chips(true);
      apply();
    } catch (e) {
      sfx.back();
      onError(e instanceof CoinError ? e.message : `Couldn't buy ${what}`);
    } finally {
      setBusy(null);
      setAsking(null);
    }
  };
  return { asking, setAsking, busy, run };
}

/** One tab of cosmetics: the grid of tiles and the confirm. */
function ItemsTab<T extends Item>({
  label,
  kind,
  items,
  owned,
  shown,
  art,
  what,
  buy,
  use,
  onNeedCoins,
  onError,
}: {
  label: string;
  kind: Kind;
  items: T[];
  owned: string[];
  shown: string;
  art: (item: T) => string;
  /** "the Navy back": for the coin packs' message and errors. */
  what: (item: T) => string;
  buy: (item: T) => Promise<void>;
  use: (item: T) => void;
  onNeedCoins: NeedCoins;
  onError: (message: string) => void;
}) {
  const { coins } = useWallet();
  const { asking, setAsking, busy, run } = useBuying(onError);
  const ask = items.find((t) => t.id === asking) ?? null;

  return (
    <>
      <div className="shop-grid cs-grid" role="list" aria-label={label}>
        {items.map((t, i) => {
          const has = owned.includes(t.id);
          return (
            <ItemTile
              key={t.id}
              item={t}
              i={i}
              kind={kind}
              art={art(t)}
              owned={has}
              inUse={has && shown === t.id}
              busy={busy === t.id}
              onTap={() => {
                if (has) {
                  sfx.flip();
                  use(t);
                } else {
                  sfx.select();
                  setAsking(t.id);
                }
              }}
            />
          );
        })}
      </div>
      {ask && (
        <BuyConfirm
          item={ask}
          kind={kind}
          art={art(ask)}
          coins={coins}
          busy={busy === ask.id}
          onCancel={() => {
            sfx.back();
            setAsking(null);
          }}
          onGetCoins={(short) => {
            setAsking(null);
            onNeedCoins(short, `for ${what(ask)}`);
          }}
          onBuy={() => void run(ask.id, () => buy(ask), () => use(ask), what(ask))}
        />
      )}
    </>
  );
}

/** The shop's Cards tab: the backs for sale. What you own comes from the server's wallet. */
export function CardsTab({ onNeedCoins, onError }: { onNeedCoins: NeedCoins; onError: (message: string) => void }) {
  const { backs } = useWallet();
  const shown = useCardBack();
  return (
    <ItemsTab
      label="Card backs"
      kind="back"
      items={CARD_BACKS}
      owned={backs}
      shown={shown}
      art={(b) => backUrl(b.id)}
      what={(b) => `the ${b.name} back`}
      buy={(b) => buyCardBack(b.id)}
      use={(b) => setPrefs({ cardBack: b.id })}
      onNeedCoins={onNeedCoins}
      onError={onError}
    />
  );
}

/** The shop's Tables tab: the table themes, seen at every game's table once picked. */
export function TablesTab({ onNeedCoins, onError }: { onNeedCoins: NeedCoins; onError: (message: string) => void }) {
  const { tables } = useWallet();
  const shown = useTableTheme();
  return (
    <ItemsTab
      label="Tables"
      kind="table"
      items={TABLE_THEMES}
      owned={tables}
      shown={shown}
      art={(t) => tablePreviewUrl(t.id)}
      what={(t) => `the ${t.name} table`}
      buy={(t) => buyTableTheme(t.id)}
      use={(t) => setPrefs({ tableTheme: t.id })}
      onNeedCoins={onNeedCoins}
      onError={onError}
    />
  );
}
