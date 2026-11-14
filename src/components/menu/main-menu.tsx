"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CHARACTERS } from "@/lib/characters";
import { setPrefs, usePrefs } from "@/lib/prefs";
import {
  setAmbience,
  setMuted,
  setSfxVolume,
  sfx,
  unlockAudio,
} from "@/lib/sfx";
import type { StageScene, StageTable } from "@/components/stage/tavern-stage";
import { GameScreen } from "@/components/game/game-screen";
import { useSoloGame } from "@/components/game/use-solo-game";
import { PattiScreen } from "@/components/patti/patti-screen";
import { BluffScreen } from "@/components/bluff/bluff-screen";
import { useBluff } from "@/components/bluff/use-bluff";
import { useBluffOnline } from "@/components/bluff/use-bluff-online";
import { bluffStage } from "@/components/stage/bluff-table";
import { PaanchScreen } from "@/components/paanch/paanch-screen";
import { usePaanch } from "@/components/paanch/use-paanch";
import { usePaanchOnline } from "@/components/paanch/use-paanch-online";
import { BhabhiScreen } from "@/components/bhabhi/bhabhi-screen";
import { useBhabhi } from "@/components/bhabhi/use-bhabhi";
import { useBhabhiOnline } from "@/components/bhabhi/use-bhabhi-online";
import { GPattaScreen } from "@/components/gpatta/gpatta-screen";
import { useGPatta } from "@/components/gpatta/use-gpatta";
import { useGPattaOnline } from "@/components/gpatta/use-gpatta-online";
import { usePatti } from "@/components/patti/use-patti";
import { usePattiOnline } from "@/components/patti/use-patti-online";
import type { PattiStageTable } from "@/components/stage/patti-table";
import {
  createRoom,
  forgetToken,
  joinRoom,
  readToken,
  saveToken,
  useOnlineGame,
  useOnlineRoom,
} from "@/components/game/use-online-room";
import { turnSeat } from "@/lib/online/perspective";
import { TABLES } from "@/lib/patti/engine";
import type { GameOptions } from "@/lib/game/engine";
import { seatsFor, type TableGame } from "@/lib/game/table-games";
import { CoinError, ensureWallet, openShop, openSolo, refreshWallet, settleOnExit, soloSettle, useWallet } from "@/lib/wallet/client";
import { ShopOverlay } from "@/components/shop/shop";
import { CoinPill } from "@/components/shop/coin-pill";
import { LobbyScreen } from "./lobby-screen";
import { ErrorNote, friendlyError } from "./error-note";
import "@/components/game/game.css";
import { CharacterSelect } from "./character-select";
import { type MenuAction, MenuScreen } from "./menu-screen";
import { CODE_LENGTH, type Mode, cleanCode, hostFee, isExtraId } from "./modes";
import { MultiplayerPanel, RulesPanel, SettingsPanel } from "./panels";
import { Sheet } from "./sheet";
import { TitleScreen } from "./title-screen";
import "./menu.css";

// WebGL only exists in the browser, so the 3D room is loaded client-side.
const TavernStage = dynamic(() => import("@/components/stage/tavern-stage"), {
  ssr: false,
});

type SheetId = "multiplayer" | "rules" | "settings" | "pause" | null;

const SHEET_TITLE: Record<Exclude<SheetId, null>, string> = {
  multiplayer: "Multiplayer",
  rules: "How to play",
  settings: "Settings",
  pause: "Paused",
};

// How long a screen takes to leave before the next one arrives (matches .screen[data-leaving] in menu.css).
const LEAVE_MS = 300;

/** Phone held upright: the same breakpoint menu.css uses for its portrait layout. */
const PORTRAIT = "(max-aspect-ratio: 9/10)";
function usePortrait() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(PORTRAIT);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => matchMedia(PORTRAIT).matches,
    () => false,
  );
}

/** The table the host asked for, as the server's options: the game, its seats and whatever it allows. */
function hostOptions(m: Extract<Mode, { kind: "host" }>): GameOptions {
  const game = m.game ?? "rung";
  return {
    game,
    players: seatsFor(game, m.players),
    ...(m.series !== undefined ? { series: m.series } : {}),
    ...(m.boot !== undefined ? { boot: m.boot } : {}),
  };
}

export function MainMenu() {
  const prefs = usePrefs();
  const [scene, setScene] = useState<StageScene>("title");
  const portrait = usePortrait();
  const [leaving, setLeaving] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "practice" });
  // The game picked on the home screen (null: still choosing).
  const [menuGame, setMenuGame] = useState<TableGame | null>(null);
  // The table with friends this phone is at (if any), and what went wrong getting there.
  const [online, setOnline] = useState<{ code: string; token: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [stageReady, setStageReady] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const net = useOnlineRoom(online?.code ?? null, online?.token ?? null);
  const room = net.room;
  const onlineGame = useOnlineGame(
    room?.status === "playing" ? room : null,
    net.act,
    net.pending,
    scene !== "play" || leaving,
  );
  // 3 Patti here: at an online table that plays it, or a solo 3 Patti game
  const isPatti = online ? !!room?.patti : mode.kind === "patti";
  // one of the extra games against the computer (Bluff, ...)
  const extra = !online && mode.kind === "solo" && isExtraId(mode.game) ? mode.game : null;
  const bluff = useBluff(extra !== "bluff" || scene !== "play" || leaving || sheet !== null);
  const paanch = usePaanch(extra !== "paanch" || scene !== "play" || leaving || sheet !== null);
  const bhabhi = useBhabhi(extra !== "bhabhi" || scene !== "play" || leaving || sheet !== null);
  const gpatta = useGPatta(extra !== "gpatta" || scene !== "play" || leaving || sheet !== null);
  const solo = useSoloGame(isPatti || extra !== null || online !== null || scene !== "play" || leaving || sheet !== null);
  const pattiSolo = usePatti(online !== null || mode.kind !== "patti" || scene !== "play" || leaving || sheet !== null);
  // The table this phone sits at, once it is playing: what the online hooks read (null while alone or in the lobby).
  const roomNow = online && room?.status === "playing" ? room : null;
  const pattiNet = usePattiOnline(roomNow, net.act, net.error);
  const bluffNet = useBluffOnline(roomNow, net.act, net.error);
  const paanchNet = usePaanchOnline(roomNow, net.act, net.error);
  const bhabhiNet = useBhabhiOnline(roomNow, net.act, net.error);
  const gpattaNet = useGPattaOnline(roomNow, net.act, net.error, scene !== "play" || leaving || sheet !== null);
  const patti = online ? (pattiNet?.game ?? null) : pattiSolo;
  // Which of the four extra games is on screen: online, whatever the table plays; alone, the one you picked.
  const extraId = online ? (room?.extra?.game ?? null) : extra;
  const bluffGame = online ? (bluffNet?.game ?? null) : bluff;
  const paanchGame = online ? (paanchNet?.game ?? null) : paanch;
  const bhabhiGame = online ? (bhabhiNet?.game ?? null) : bhabhi;
  const gpattaGame = online ? (gpattaNet?.game ?? null) : gpatta;
  // You sit in seat 0; the other three regulars fill the rest, partner opposite.
  const soloChars = useMemo(
    () => [focus, ...CHARACTERS.map((_, i) => i).filter((i) => i !== focus)],
    [focus],
  );
  const pattiChars = online && pattiNet ? pattiNet.seatChars : soloChars;
  const bluffChars = online && bluffNet ? bluffNet.seatChars : soloChars;
  const paanchChars = online && paanchNet ? paanchNet.seatChars : soloChars;
  const bhabhiChars = online && bhabhiNet ? bhabhiNet.seatChars : soloChars;
  const gpattaChars = online && gpattaNet ? gpattaNet.seatChars : soloChars;
  // Coins: a Rung match against the computer is paid for when it starts and pays out when it's won.
  const wallet = useWallet();
  const rungSession = useRef<string | null>(null);
  const coinError = useCallback((e: unknown) => {
    if (e instanceof CoinError && e.status !== 0) openShop({ need: e.short, message: e.message });
    else if (e instanceof CoinError) openShop({ message: e.message });
  }, []);
  /** Not enough coins for this fee? Open the shop and say so. */
  const short = useCallback(
    (fee: number) => {
      if (wallet.coins === null || wallet.coins >= fee) return false;
      openShop({ need: fee - wallet.coins });
      return true;
    },
    [wallet.coins],
  );
  const payRung = useCallback(async () => {
    try {
      rungSession.current = (await openSolo("rung")).session;
      return true;
    } catch (e) {
      coinError(e);
      return false;
    }
  }, [coinError]);
  const soloNext = solo.next;
  const soloSeries = solo.game.seriesWinner;
  const paidSolo = useMemo(
    () => ({
      ...solo,
      // after a finished match, the next one is paid for first
      next: () => {
        if (soloSeries == null) return soloNext();
        void payRung().then((ok) => ok && soloNext());
      },
    }),
    [solo, soloNext, soloSeries, payRung],
  );
  // a match against the computer just ended: settle it (a win pays out)
  const soloOver = !online && scene === "play" && !isPatti && !extra && solo.over && soloSeries != null;
  useEffect(() => {
    if (!soloOver || !rungSession.current) return;
    const id = rungSession.current;
    rungSession.current = null;
    void soloSettle(id, { won: soloSeries === 0 }).catch(() => {});
  }, [soloOver, soloSeries]);
  // closing the app mid-match forfeits it (the server settles it when the next game starts)
  useEffect(() => {
    const bye = () => {
      if (rungSession.current) settleOnExit(rungSession.current);
      rungSession.current = null;
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, []);
  // online, the server charges and pays: keep the balance fresh as the table moves on
  const coinMoment = online && room ? `${room.status}:${room.game?.seriesWinner ?? "-"}:${room.game?.seriesNo ?? 0}:${room.patti?.state.dealNo ?? 0}` : null;
  useEffect(() => {
    if (coinMoment) void refreshWallet();
  }, [coinMoment]);

  const game = online && onlineGame ? onlineGame.solo : paidSolo;
  const seatChars = online && onlineGame ? onlineGame.seatChars : soloChars;
  const pattiTable: PattiStageTable | null =
    scene === "play" && isPatti && patti?.state
      ? { seatChars: pattiChars, state: patti.state, dealKey: String(patti.state.dealNo) }
      : null;
  const bluffTable =
    scene === "play" && extraId === "bluff" && bluffGame?.state
      ? { ...bluffStage(bluffGame.state), seatChars: bluffChars }
      : null;
  // Bhabhi and G Patta: the players sit at the 3D table, their cards are drawn over it
  const cardSeats =
    scene !== "play"
      ? null
      : extraId === "bhabhi" && bhabhiGame?.state
        ? { seatChars: bhabhiChars, turn: bhabhiGame.state.bhabhi === null ? bhabhiGame.state.turn : null }
        : extraId === "gpatta" && gpattaGame?.state
          ? { seatChars: gpattaChars, turn: gpattaGame.state.phase === "draw" ? gpattaGame.state.turn : null }
          : null;
  const table: StageTable | null =
    scene === "play" && !isPatti && !extraId
      ? {
          seatChars,
          snap: game.snap,
          dealKey: game.dealKey,
          dealing: game.dealing,
        }
      : null;
  // Online chat, turned so every seat is as seen from this phone.
  const mySeat = room?.game?.mySeat ?? null;
  const talk = useMemo(
    () =>
      online && room
        ? {
            myId: room.me.playerId,
            send: net.sendChat,
            messages: net.chat.map((m) => ({
              ...m,
              seat: m.seat === null || mySeat === null ? null : turnSeat(m.seat, mySeat),
            })),
          }
        : undefined,
    [online, room, net.sendChat, net.chat, mySeat],
  );

  useEffect(() => {
    setSfxVolume(prefs.sfxVolume);
    setMuted(prefs.muted);
    setAmbience(prefs.ambience && !prefs.muted);
  }, [prefs.sfxVolume, prefs.muted, prefs.ambience]);

  useEffect(() => {
    document.documentElement.dataset.motion = prefs.reduceMotion
      ? "reduce"
      : "full";
  }, [prefs.reduceMotion]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = useCallback((next: StageScene) => {
    window.clearTimeout(timer.current);
    setLeaving(true);
    timer.current = window.setTimeout(() => {
      setScene(next);
      setLeaving(false);
    }, LEAVE_MS);
  }, []);

  // The online table vanished mid-game (the server restarted, or this phone's seat is gone): leave the
  // game screen for the lobby card, which says what happened and offers a way back.
  useEffect(() => {
    if (!net.gone || scene !== "play" || leaving) return;
    const t = window.setTimeout(() => go("menu"), 0);
    return () => window.clearTimeout(t);
  }, [net.gone, scene, leaving, go]);

  const toSelect = useCallback(
    (m: Mode) => {
      setMode(m);
      const saved = CHARACTERS.findIndex((c) => c.id === prefs.character);
      setFocus(saved >= 0 ? saved : 0);
      go("select");
    },
    [go, prefs.character],
  );

  const enter = () => {
    unlockAudio();
    sfx.flip();
    // A link with ?table=CODE goes straight to joining that table.
    const linkCode = cleanCode(new URLSearchParams(window.location.search).get("table") ?? "");
    if (linkCode.length === CODE_LENGTH) toSelect({ kind: "join", code: linkCode });
    else go("menu");
  };

  const onPick = (action: MenuAction) => {
    if (action === "play") toSelect({ kind: "practice" });
    else setSheet(action);
  };


  // The host started the game: everyone at the table goes to it. Back in the lobby after a game ends? Not yet.
  const status = room?.status;
  useEffect(() => {
    if (!online || status !== "playing" || scene === "play" || leaving) return;
    const t = window.setTimeout(() => go("play"), 0);
    return () => window.clearTimeout(t);
  }, [online, status, scene, leaving, go]);

  const sitDown = async (m: Mode) => {
    const character = CHARACTERS[focus];
    const name = (prefs.name || character.name).slice(0, 16);
    setJoining(true);
    setJoinError(null);
    go("menu");
    try {
      await ensureWallet();
      const res =
        m.kind === "host"
          ? await createRoom(name, hostOptions(m), character.id)
          : await joinRoom(m.kind === "join" ? m.code : "", name, readToken(m.kind === "join" ? m.code : ""), character.id);
      saveToken(res.code, res.token);
      setOnline(res);
      void refreshWallet();
      window.history.replaceState(null, "", `/?table=${res.code}`);
    } catch (e) {
      const err = e as Error & { coins?: boolean; short?: number | null };
      if (err.coins) {
        // not enough coins to sit down: back to the menu with the shop open
        setJoinError(null);
        openShop({ need: err.short, message: err.message });
      } else setJoinError(err.message);
    } finally {
      setJoining(false);
    }
  };

  /** Back to the menu from a game against the computer (3 Patti chips are cashed out). */
  const leaveSolo = () => {
    if (isPatti) pattiSolo.leave?.();
    else if (extra === "bluff") bluff.leave();
    else if (extra === "paanch") paanch.leave?.();
    else if (extra === "bhabhi") bhabhi.leave();
    else if (extra === "gpatta") gpatta.leave();
    else if (!extra && rungSession.current) {
      // walking out of a Rung match forfeits it
      const id = rungSession.current;
      rungSession.current = null;
      void soloSettle(id, { won: false }).catch(() => {});
    }
    go("menu");
  };

  const leaveTable = () => {
    if (online) {
      void net.act("leave");
      forgetToken(online.code);
    }
    setOnline(null);
    setJoinError(null);
    window.history.replaceState(null, "", "/");
    go("menu");
  };

  const onStageReady = useCallback(() => setStageReady(true), []);

  return (
    <div className="room" data-scene={scene} data-lobby={scene === "menu" && (online !== null || joining || joinError !== null)}>
      <div className="stage" data-ready={stageReady} aria-hidden>
        <TavernStage
          // on phones the title screen shares the mode screen's view of the room (bear, lamp, table);
          // wide screens keep the centred title view, since their menu view leaves room on the left
          scene={scene === "title" && portrait ? "menu" : scene}
          focus={focus}
          table={table}
          patti={pattiTable}
          bluff={bluffTable}
          seats={cardSeats}
          // Paanch covers the whole room with its own board: the 3D room only needs to tick over
          idle={scene === "play" && extraId === "paanch" && !leaving}
          onReady={onStageReady}
        />
      </div>
      <div className="stage-shade" aria-hidden />

      {scene === "play" && !leaving && (
        <button
          type="button"
          className="icon-button corner-pause"
          aria-label="Pause"
          onClick={() => {
            sfx.select();
            setSheet("pause");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M8 5 V19 M16 5 V19" />
          </svg>
        </button>
      )}
      {(scene === "menu" || scene === "play") && (
        <button
          type="button"
          className="icon-button corner-mute"
          aria-pressed={prefs.muted}
          aria-label={prefs.muted ? "Turn sound on" : "Mute sound"}
          onClick={() => {
            setPrefs({ muted: !prefs.muted });
            if (prefs.muted) window.setTimeout(() => sfx.select(), 60);
          }}
        >
          {prefs.muted ? (
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
              <path d="M17 9 L22 14 M22 9 L17 14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
              <path d="M16.5 8.5 C 18 10, 18 14, 16.5 15.5 M19 6 C 22 9, 22 15, 19 18" />
            </svg>
          )}
        </button>
      )}

      {/* coins show on the menus only; at a table the corner is just pause and sound */}
      {(scene === "menu" || scene === "select") && !leaving && (
        <div className="coin-corner" data-scene={scene}>
          <CoinPill />
        </div>
      )}

      <main className="screen" data-leaving={leaving}>
        {scene === "title" && <TitleScreen onEnter={enter} />}
        {scene === "menu" && (online || joining || joinError) && (
          room ? (
            <LobbyScreen
              room={room}
              pending={net.pending}
              error={net.error}
              live={net.live}
              act={net.act}
              onLeave={leaveTable}
            />
          ) : (
            <div className="lobby lobby-loading">
              {joinError || net.error ? (
                <>
                  <h2 className="lobby-fail">{friendlyError(joinError ?? net.error ?? "").title}</h2>
                  <ErrorNote>{friendlyError(joinError ?? net.error ?? "").body}</ErrorNote>
                  <button type="button" className="home-btn home-btn-gold" onClick={leaveTable}>
                    Back home
                  </button>
                  {mode.kind === "join" && (
                    <button
                      type="button"
                      className="lobby-retry"
                      onClick={() => {
                        setOnline(null);
                        void sitDown(mode);
                      }}
                    >
                      Try joining again
                    </button>
                  )}
                </>
              ) : (
                <p className="lobby-wait">Finding the table…</p>
              )}
            </div>
          )
        )}
        {scene === "menu" && !online && !joining && !joinError && (
          <MenuScreen
            onPick={onPick}
            game={menuGame}
            onGame={setMenuGame}
            onHost={(g, options) => {
              // hosting an online table still costs coins; playing the computer doesn't
              if (!short(hostFee(g))) toSelect({ kind: "host", game: g, ...options });
            }}
            onPlay={(g) => {
              if (g === "patti") toSelect({ kind: "patti", table: TABLES[0].id });
              else if (isExtraId(g)) toSelect({ kind: "solo", game: g });
              else toSelect({ kind: "practice" });
            }}
            onJoin={(code) => toSelect({ kind: "join", code })}
          />
        )}
        {scene === "select" && (
          <CharacterSelect
            index={focus}
            onIndex={setFocus}
            onBack={() => go("menu")}
            onConfirm={() => {
              setPrefs({ character: CHARACTERS[focus].id });
              if (mode.kind === "solo") {
                const starting = mode.game === "bluff" ? bluff.start() : mode.game === "bhabhi" ? bhabhi.start(4) : mode.game === "gpatta" ? gpatta.start(4) : undefined;
                void Promise.resolve(starting).then((ok) => {
                  if (ok !== false) go("play");
                });
                return;
              }
              if (mode.kind === "patti") {
                void Promise.resolve(pattiSolo.start(mode.table)).then((ok) => {
                  if (ok !== false) go("play");
                });
                return;
              }
              if (mode.kind !== "practice") {
                void sitDown(mode);
                return;
              }
              void payRung().then((ok) => {
                if (!ok) return;
                solo.restart();
                go("play");
              });
            }}
          />
        )}
        {scene === "play" && isPatti && patti && (
          <PattiScreen
            game={patti}
            names={online ? pattiNet?.names : undefined}
            bots={online ? pattiNet?.bots : undefined}
            talk={talk}
            seatChars={pattiChars}
            playerName={prefs.name}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "gpatta" && gpattaGame && (
          <GPattaScreen
            game={gpattaGame}
            names={online ? gpattaNet?.names : undefined}
            bots={online ? gpattaNet?.bots : undefined}
            seatChars={gpattaChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "bhabhi" && bhabhiGame && (
          <BhabhiScreen
            game={bhabhiGame}
            names={online ? bhabhiNet?.names : undefined}
            bots={online ? bhabhiNet?.bots : undefined}
            seatChars={bhabhiChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "paanch" && paanchGame && (
          <PaanchScreen
            game={paanchGame}
            names={online ? paanchNet?.names : undefined}
            bots={online ? paanchNet?.bots : undefined}
            talk={talk}
            seatChars={paanchChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "bluff" && bluffGame && (
          <BluffScreen
            game={bluffGame}
            names={online ? bluffNet?.names : undefined}
            bots={online ? bluffNet?.bots : undefined}
            talk={talk}
            seatChars={bluffChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && !isPatti && !extraId && (
          <GameScreen
            solo={game}
            seatChars={seatChars}
            playerName={prefs.name}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            names={online ? onlineGame?.names : undefined}
            bots={online ? onlineGame?.bots : undefined}
            talk={talk}
          />
        )}
      </main>

      {scene === "play" && online && (net.error || !net.live) && (
        <div className="net-note">
          <ErrorNote>{net.error ?? "Connection lost. Reconnecting…"}</ErrorNote>
        </div>
      )}

      <Sheet
        open={sheet !== null}
        title={sheet ? SHEET_TITLE[sheet] : ""}
        wide={sheet === "rules"}
        onClose={() => setSheet(null)}
      >
        {sheet === "rules" && (
          <RulesPanel game={scene === "menu" ? (menuGame ?? "rung") : isPatti ? "patti" : (extraId ?? "rung")} />
        )}
        {sheet === "settings" && <SettingsPanel />}
        {sheet === "pause" && (
          <div className="pause">
            <button
              type="button"
              className="cta cta-wide"
              data-autofocus
              onClick={() => setSheet(null)}
            >
              <span className="plate">Resume</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-wide"
              onClick={() => setSheet("rules")}
            >
              How to play
            </button>
            <button
              type="button"
              className="ghost-button ghost-wide"
              onClick={() => setSheet("settings")}
            >
              Settings
            </button>
            <button
              type="button"
              className="ghost-button ghost-wide"
              onClick={() => {
                setSheet(null);
                sfx.back();
                if (online) leaveTable();
                else leaveSolo();
              }}
            >
              Leave table
            </button>
          </div>
        )}
        {sheet === "multiplayer" && (
          <MultiplayerPanel
            onHost={() => {
              setSheet(null);
              toSelect({ kind: "host" });
            }}
            onJoin={(code) => {
              setSheet(null);
              toSelect({ kind: "join", code });
            }}
          />
        )}
      </Sheet>
      <ShopOverlay />
    </div>
  );
}
