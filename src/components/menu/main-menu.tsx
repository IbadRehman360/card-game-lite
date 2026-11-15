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
  joinQuick,
  joinRoom,
  leaveTableRequest,
  peekRoom,
  readToken,
  saveToken,
  useOnlineGame,
  useOnlineRoom,
} from "@/components/game/use-online-room";
import { turnSeat } from "@/lib/online/perspective";
import { personaNames, quickSchedule } from "@/lib/online/personas";
import { AUTO_REJOIN_MS, type ActiveTable, clearActive, readActive, saveActive } from "@/lib/online/rejoin";
import type { MatchView } from "@/lib/online/types";
import { RejoinBanner, TableLoader } from "./table-status";
import { TABLES } from "@/lib/patti/engine";
import type { GameOptions } from "@/lib/game/engine";
import { seatsFor, type TableGame } from "@/lib/game/table-games";
import { CoinError, ensureWallet, openShop, openSolo, refreshWallet, settleOnExit, soloSettle, useWallet } from "@/lib/wallet/client";
import { ShopOverlay } from "@/components/shop/shop";
import { useApplyCardStyle } from "@/lib/card-style";
import { CoinPill } from "@/components/shop/coin-pill";
import { LobbyScreen } from "./lobby-screen";
import { MatchScreen } from "./match-screen";
import { ErrorNote, friendlyError } from "./error-note";
import "@/components/game/game.css";
import { type MenuAction, MenuScreen } from "./menu-screen";
import { CODE_LENGTH, type Mode, cleanCode, hostFee, isExtraId } from "./modes";
import { MultiplayerPanel, RulesPanel, SettingsPanel } from "./panels";
import { Sheet } from "./sheet";
import { ProfileButton, ProfileScreen } from "./profile";
import { recordGame } from "@/lib/stats";
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
  // Play: the game a quick match is being found for (null: not searching)
  const [matching, setMatching] = useState<TableGame | null>(null);
  // Play with no server to be had: the search runs on this phone, its seats filling on the same ~30 s
  // schedule as a real one, and then the game is played here
  const [localSearch, setLocalSearch] = useState<{ game: TableGame; arrivals: { at: number; name: string; avatar: string }[] } | null>(null);
  const [clock, setClock] = useState(0);
  // A table this phone left mid-game (closed, reloaded, lost signal) that is still going: offered back
  const [rejoin, setRejoin] = useState<ActiveTable | null>(null);
  const [rejoinBusy, setRejoinBusy] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  // A game on this phone (Play with no signal): the other seats' names, so they look like people too
  const [localNames, setLocalNames] = useState<string[] | null>(null);
  const localBots = useMemo(() => (localNames ? localNames.map(() => false) : undefined), [localNames]);
  const [pickedFocus, setPickedFocus] = useState(0);
  // the character you play as: the one saved in prefs once picked (then Play skips "Who's playing?")
  const savedFocus = CHARACTERS.findIndex((c) => c.id === prefs.character);
  const characterChosen = savedFocus >= 0;
  const focus = characterChosen ? savedFocus : pickedFocus;
  // The profile screen: on the way into a game (a button there goes on to it), or opened just to look
  const [picking, setPicking] = useState(false);
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
  // the card back and suit colours picked in Card style, on every card in the app
  useApplyCardStyle();
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
      // no signal: the game is on this phone and free, so just play it
      if (e instanceof CoinError && e.status === 0) {
        rungSession.current = null;
        return true;
      }
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
    recordGame("rung", soloSeries === 0);
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
              avatar: room.lobby.find((s) => s.playerId === m.playerId)?.avatar ?? undefined,
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

  const openProfile = useCallback(() => {
    setPicking(false);
    go("profile");
  }, [go]);

  // picking a character on the profile screen saves it straight away
  const pickCharacter = useCallback((i: number) => {
    setPickedFocus(i);
    setPrefs({ character: CHARACTERS[i].id });
  }, []);

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

  // Remember the table while this phone has a seat at it, so a reload or a closed app can come back to it;
  // forget it when the game is over, the seat is gone, or the table is.
  const seated = !!room && (room.status === "playing" ? !room.spectating && !room.finished : !room.match);
  const roomGame = room?.options.game ?? "rung";
  const roomQuick = !!room?.quick;
  const roomVersion = room?.version ?? -1;
  useEffect(() => {
    if (!online || roomVersion < 0) return;
    if (seated) saveActive({ code: online.code, token: online.token, game: roomGame, quick: roomQuick });
    else clearActive(online.code);
  }, [online, roomVersion, seated, roomGame, roomQuick]);
  useEffect(() => {
    if (net.gone && online) clearActive(online.code);
  }, [net.gone, online]);
  // the moment the app closes is the moment it may come straight back from
  useEffect(() => {
    if (!online || !seated) return;
    const bye = () => saveActive({ code: online.code, token: online.token, game: roomGame, quick: roomQuick });
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [online, seated, roomGame, roomQuick]);

  /** Back to a table this phone has a seat at (same token, so the same seat). */
  const resume = useCallback(
    (t: ActiveTable) => {
      setRejoin(null);
      setRejoining(true);
      setMatching(null);
      setLocalSearch(null);
      setJoinError(null);
      setJoining(false);
      saveToken(t.code, t.token);
      setOnline({ code: t.code, token: t.token });
      if (!t.quick) window.history.replaceState(null, "", `/?table=${t.code}`);
      go("menu");
    },
    [go],
  );

  // On opening the app: a table this phone left that's still going? Straight back to it after a reload or
  // a quick drop; otherwise ask.
  useEffect(() => {
    const saved = readActive();
    if (!saved) return;
    let stop = false;
    peekRoom(saved.code, saved.token)
      .then((view) => {
        if (stop) return;
        const going = view.status === "playing" ? !view.spectating && !view.finished : !view.match;
        if (!going) return clearActive(saved.code);
        const t = { ...saved, game: view.options.game ?? saved.game, quick: view.quick };
        if (Date.now() - saved.at < AUTO_REJOIN_MS) resume(t);
        else setRejoin(t);
      })
      .catch((e: { status?: number }) => {
        if (stop || (e.status !== 403 && e.status !== 404)) return;
        clearActive(saved.code);
        forgetToken(saved.code);
      });
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the app opens
  }, []);

  /** Leave on the rejoin prompt: give the seat up (a computer takes it) and forget the table. */
  const dropRejoin = () => {
    const t = rejoin;
    if (!t) return;
    setRejoinBusy(true);
    void leaveTableRequest(t.code, t.token)
      .catch(() => {})
      .finally(() => {
        clearActive(t.code);
        forgetToken(t.code);
        setRejoin(null);
        setRejoinBusy(false);
      });
  };

  const sitDown = async (m: Mode) => {
    const character = CHARACTERS[focus];
    const name = (prefs.name || character.name).slice(0, 16);
    // a new table instead of the one offered back: that seat is given up
    if (rejoin) dropRejoin();
    setRejoining(false);
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

  /**
   * Play with no table to be had (no signal, or a server without tables): the same game on this phone,
   * with the other seats named like people, as they would be at a quick match.
   */
  const playLocal = (g: TableGame, names: string[] = []) => {
    setMatching(null);
    setLocalSearch(null);
    setJoining(false);
    setJoinError(null);
    setLocalNames(["", ...names, ...personaNames(Math.max(0, 5 - names.length), [...names, ...(prefs.name ? [prefs.name] : [])])]);
    const started = (ok: boolean | void) => {
      if (ok !== false) go("play");
      else go("menu");
    };
    if (g === "patti") {
      setMode({ kind: "patti", table: TABLES[0].id });
      void Promise.resolve(pattiSolo.start(TABLES[0].id)).then(started);
    } else if (isExtraId(g)) {
      setMode({ kind: "solo", game: g });
      const starting = g === "bluff" ? bluff.start() : g === "bhabhi" ? bhabhi.start(4) : g === "gpatta" ? gpatta.start(4) : undefined;
      void Promise.resolve(starting).then(started);
    } else {
      setMode({ kind: "practice" });
      void payRung().then((ok) => {
        if (ok) solo.restart();
        started(ok);
      });
    }
  };

  /** Play: find a quick-match table for this game (or, failing that, play it on this phone). */
  const findMatch = async (g: TableGame) => {
    const character = CHARACTERS[focus];
    const name = (prefs.name || character.name).slice(0, 16);
    if (rejoin) dropRejoin();
    setRejoining(false);
    setMatching(g);
    setJoining(true);
    setJoinError(null);
    go("menu");
    try {
      // without a wallet you still play (for free); with no signal the join below fails too
      await ensureWallet().catch(() => {});
      const res = await joinQuick(g, name, character.id);
      saveToken(res.code, res.token);
      setOnline(res);
    } catch (e) {
      const err = e as Error & { status?: number };
      // no server to search on (no signal, or tables unavailable): search on this phone, at the same pace
      if (!err.status || err.status >= 500) searchLocal(g);
      else {
        setMatching(null);
        setJoinError(err.message);
      }
    } finally {
      setJoining(false);
    }
  };

  /**
   * The search, on this phone: the seats fill one by one over the same ~30 s as a real search (never
   * a game dealt in a few seconds), with the faces the local game will show, and then it is played here.
   */
  const searchLocal = (g: TableGame) => {
    const openedAt = Date.now();
    const arrivals = quickSchedule(seatsFor(g, undefined) - 1, openedAt, prefs.name ? [prefs.name] : []).map((a, i) => ({
      ...a,
      avatar: CHARACTERS[soloChars[i + 1] ?? 0]?.id ?? a.avatar,
    }));
    setOnline(null);
    setJoining(false);
    setJoinError(null);
    setMatching(g);
    setLocalSearch({ game: g, arrivals });
  };
  useEffect(() => {
    if (!localSearch) return;
    const tick = window.setInterval(() => setClock(Date.now()), 500);
    const last = localSearch.arrivals.reduce((m, a) => Math.max(m, a.at), 0);
    const done = window.setTimeout(
      () => playLocal(localSearch.game, localSearch.arrivals.map((a) => a.name)),
      Math.max(0, last + 1200 - Date.now()),
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per search
  }, [localSearch]);
  const localMatch: MatchView | null = localSearch
    ? {
        game: localSearch.game,
        seats: [
          { name: (prefs.name || CHARACTERS[focus].name).slice(0, 16), avatar: CHARACTERS[focus].id, isMe: true },
          ...localSearch.arrivals.map((a) => (a.at <= clock ? { name: a.name, avatar: a.avatar, isMe: false } : null)),
        ],
        startsIn: localSearch.arrivals.every((a) => a.at <= clock) ? 1200 : null,
      }
    : null;

  // The search lost the server half way: search on this phone instead.
  const matchLost = net.matchLost;
  const lostGame = matchLost ? (matching ?? menuGame) : null;
  useEffect(() => {
    if (!lostGame || !online) return;
    const t = window.setTimeout(() => {
      void net.act("leave");
      forgetToken(online.code);
      setOnline(null);
      searchLocal(lostGame);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per lost search
  }, [lostGame]);

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
      clearActive(online.code);
    }
    setOnline(null);
    setJoinError(null);
    setMatching(null);
    setLocalSearch(null);
    setRejoining(false);
    window.history.replaceState(null, "", "/");
    go("menu");
  };

  /** Goes on into the game a mode asks for, as the character picked. */
  const launch = (m: Mode) => {
    if (m.kind === "quick") {
      void findMatch(m.game);
      return;
    }
    if (m.kind === "solo") {
      const starting = m.game === "bluff" ? bluff.start() : m.game === "bhabhi" ? bhabhi.start(4) : m.game === "gpatta" ? gpatta.start(4) : undefined;
      void Promise.resolve(starting).then((ok) => {
        if (ok !== false) go("play");
      });
      return;
    }
    if (m.kind === "patti") {
      void Promise.resolve(pattiSolo.start(m.table)).then((ok) => {
        if (ok !== false) go("play");
      });
      return;
    }
    if (m.kind !== "practice") {
      void sitDown(m);
      return;
    }
    void payRung().then((ok) => {
      if (!ok) return;
      solo.restart();
      go("play");
    });
  };

  /**
   * On the way into a game: a player who has picked their character goes straight on as them; one who
   * hasn't is asked once ("Who's playing?"). The profile is otherwise only opened from the avatar button.
   */
  const toSelect = (m: Mode) => {
    setMode(m);
    if (characterChosen) {
      launch(m);
      return;
    }
    setPickedFocus(0);
    setPicking(true);
    go("profile");
  };

  const onStageReady = useCallback(() => setStageReady(true), []);

  // the table shade: dark behind the lobby, light while the table is set up so the room stays in view
  const tableShade: "false" | "true" | "loading" =
    scene !== "menu" || (online === null && !joining && joinError === null && !localSearch)
      ? "false"
      : !joinError && !net.error && !matching && !localSearch && !(room && room.status === "lobby")
        ? "loading"
        : "true";

  return (
    <div className="room" data-scene={scene} data-lobby={tableShade}>
      <div className="stage" data-ready={stageReady} aria-hidden>
        <TavernStage
          // on phones the title screen shares the mode screen's view of the room (bear, lamp, table);
          // wide screens keep the centred title view, since their menu view leaves room on the left
          scene={scene === "title" && portrait ? "menu" : scene}
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
      {/* at the table the corner holds only Pause: mute lives in Pause → Settings */}
      {scene === "menu" && (
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
      {scene === "menu" && !leaving && (
        <div className="coin-corner" data-scene={scene}>
          <ProfileButton onOpen={openProfile} />
          <CoinPill />
        </div>
      )}

      <main className="screen" data-leaving={leaving}>
        {scene === "title" && <TitleScreen onEnter={enter} />}
        {rejoin && !online && !joining && !localSearch && (scene === "title" || scene === "menu") && !leaving && (
          <RejoinBanner
            game={rejoin.game}
            busy={rejoinBusy}
            onRejoin={() => {
              unlockAudio();
              sfx.confirm();
              resume(rejoin);
            }}
            onLeave={dropRejoin}
          />
        )}
        {scene === "menu" && localSearch && (
          <MatchScreen game={localSearch.game} match={localMatch} onCancel={leaveTable} />
        )}
        {scene === "menu" && !localSearch && (online || joining || joinError) && (
          (room?.quick && room.status === "lobby") || (!room && matching && !joinError) ? (
            <MatchScreen game={(room?.options.game ?? matching ?? "rung") as TableGame} match={room?.match ?? null} onCancel={leaveTable} />
          ) : room && room.status === "lobby" ? (
            <LobbyScreen
              room={room}
              pending={net.pending}
              error={net.error}
              live={net.live}
              act={net.act}
              onLeave={leaveTable}
            />
          ) : joinError || net.error ? (
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
              ) : null}
            </div>
          ) : (
            <TableLoader title={rejoining ? "Taking your seat back…" : "Setting up your table…"} />
          )
        )}
        {scene === "menu" && !online && !joining && !joinError && !localSearch && (
          <MenuScreen
            onPick={onPick}
            game={menuGame}
            onGame={setMenuGame}
            onHost={(g, options) => {
              // hosting an online table still costs coins; playing the computer doesn't
              if (!short(hostFee(g))) toSelect({ kind: "host", game: g, ...options });
            }}
            onPlay={(g) => toSelect({ kind: "quick", game: g })}
            onJoin={(code) => toSelect({ kind: "join", code })}
          />
        )}
        {scene === "profile" && (
          <ProfileScreen
            index={focus}
            onIndex={pickCharacter}
            onBack={() => go("menu")}
            // on the way into a game: a button at the foot goes on to it
            confirm={picking ? {
              label: mode.kind === "host" ? "Open table" : mode.kind === "join" ? "Join table" : "Play",
              onConfirm: () => {
              setPrefs({ character: CHARACTERS[focus].id });
              launch(mode);
            } } : null}
          />
        )}
        {/* your move is on its way to the table: a small spinner, shown only if it takes a moment */}
        {scene === "play" && online && net.moving && <span className="move-wait" role="status" aria-label="Sending your move" />}
        {scene === "play" && isPatti && patti && (
          <PattiScreen
            game={patti}
            names={online ? pattiNet?.names : (localNames ?? undefined)}
            bots={online ? pattiNet?.bots : localBots}
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
            names={online ? gpattaNet?.names : (localNames ?? undefined)}
            bots={online ? gpattaNet?.bots : localBots}
            seatChars={gpattaChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "bhabhi" && bhabhiGame && (
          <BhabhiScreen
            game={bhabhiGame}
            names={online ? bhabhiNet?.names : (localNames ?? undefined)}
            bots={online ? bhabhiNet?.bots : localBots}
            seatChars={bhabhiChars}
            paused={sheet !== null && !online}
            onMenu={online ? leaveTable : leaveSolo}
            onRules={() => setSheet("rules")}
          />
        )}
        {scene === "play" && extraId === "paanch" && paanchGame && (
          <PaanchScreen
            game={paanchGame}
            names={online ? paanchNet?.names : (localNames ?? undefined)}
            bots={online ? paanchNet?.bots : localBots}
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
            names={online ? bluffNet?.names : (localNames ?? undefined)}
            bots={online ? bluffNet?.bots : localBots}
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
            names={online ? onlineGame?.names : (localNames ?? undefined)}
            bots={online ? onlineGame?.bots : localBots}
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
