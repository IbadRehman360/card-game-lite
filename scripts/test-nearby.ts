/**
 * Nearby play without a server: the compact connection codes, the QR encoder, the message protocol,
 * the host's table (with a fake clock) and two guests talking to it over in-memory channels.
 * Run: npx tsx scripts/test-nearby.ts
 */
import jsQR from "jsqr";
import { encodeQr } from "../src/lib/nearby/qr";
import { buildSdp, codeFromScan, decodeCompact, encodeCompact, parseSdp } from "../src/lib/nearby/sdp";
import { type Channel, PART_SIZE, PROTOCOL, Reassembler, frame, memoryPair, parseGuest } from "../src/lib/nearby/protocol";
import { type HostClock, NearbyHost } from "../src/lib/nearby/host";
import { GuestSession, HostSession } from "../src/lib/nearby/session";
import { legalCards } from "../src/lib/game/engine";
import { AWAY_SECONDS, TURN_SECONDS } from "../src/lib/game/pace";
import type { RoomView } from "../src/lib/online/types";

let fails = 0;
const ok = (cond: unknown, msg: string) => {
  console.log(cond ? "  ok  " : "  FAIL", msg);
  if (!cond) fails++;
};
const tick = () => new Promise((r) => setTimeout(r, 5));

// ───────────── compact SDP ─────────────
console.log("connection codes");
const CHROME_OFFER = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 54321 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 192.168.1.23",
  "a=candidate:1467250027 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 network-id 1",
  "a=candidate:2856203917 1 udp 2122194687 7c3e5a1b-9d2f-4e6a-8b1c-0f2e3d4c5b6a.local 54400 typ host generation 0 network-id 2",
  "a=candidate:1467250028 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active generation 0",
  "a=candidate:9 1 udp 2122129151 fe80::1 54500 typ host generation 0",
  "a=ice-ufrag:Xa9q",
  "a=ice-pwd:k2J8n3Lw0pQe5Rt7Yu1Io4Pz",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");
const parsed = parseSdp(CHROME_OFFER, "offer");
ok(parsed.candidates.length === 2, "keeps UDP host candidates (IPv4 + mDNS), drops TCP and IPv6");
ok(parsed.candidates[0].address === "192.168.1.23", "real address first");
const code = encodeCompact(parsed);
ok(code.length < 130, `offer code is short (${code.length} chars)`);
const back = decodeCompact(code);
ok(back.ufrag === "Xa9q" && back.pwd === "k2J8n3Lw0pQe5Rt7Yu1Io4Pz" && back.setup === "actpass" && back.mid === "0", "fields survive");
ok(back.candidates[1].address === "7c3e5a1b-9d2f-4e6a-8b1c-0f2e3d4c5b6a.local" && back.candidates[1].port === 54400, "mDNS name survives");
const rebuilt = buildSdp(back);
ok(rebuilt.includes("a=fingerprint:sha-256 0A:1B:2C:3D") && rebuilt.includes("192.168.1.23 54321 typ host"), "full SDP rebuilt");
ok(JSON.stringify(parseSdp(rebuilt, "offer").candidates) === JSON.stringify(parsed.candidates), "rebuilt SDP parses the same");
ok(codeFromScan(`https://example.com/#nb=${code}`) === code && codeFromScan(` ${code} `) === code, "code found in a link or bare");
let threw = false;
try {
  decodeCompact("hello-world");
} catch {
  threw = true;
}
ok(threw, "junk is refused");

// ───────────── QR ─────────────
console.log("qr codes");
function readQr(text: string, ecl: "L" | "M") {
  const qr = encodeQr(text, ecl);
  const scale = 4;
  const margin = 4;
  const w = (qr.size + margin * 2) * scale;
  const px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * w + (x + margin) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }
  return { size: qr.size, read: jsQR(px, w, w)?.data };
}
for (const [text, ecl] of [
  ["HI", "M"],
  [code, "M"],
  [`https://baazi.example/#nb=${code}`, "M"],
  ["x".repeat(300), "L"],
  ["Ünïcødé ♠♥♦♣ " + "y".repeat(500), "M"],
] as const) {
  const r = readQr(text, ecl);
  ok(r.read === text, `QR ${r.size}×${r.size} reads back (${text.length} chars, ${ecl})`);
}

// ───────────── protocol ─────────────
console.log("protocol");
const big = { t: "view", v: PROTOCOL, view: { version: 1, pad: "z".repeat(PART_SIZE * 3 + 17) } };
const parts = frame(big as never);
ok(parts.length === 4 && parts.every((p) => p.length <= PART_SIZE + 400), `big message split in ${parts.length}`);
const re = new Reassembler();
let whole: unknown = null;
for (const p of parts) whole = re.push(p) ?? whole;
ok(JSON.stringify(whole) === JSON.stringify(big), "and put back together");
ok(re.push(parts[0]) === null, "a stray part alone gives nothing");
ok(parseGuest({ t: "act", v: PROTOCOL + 1, id: "x", action: "play" })?.t === "old", "other protocol versions are spotted");
ok(parseGuest({ t: "act", v: PROTOCOL, id: 5, action: "play" }) === null, "malformed messages are ignored");
ok(parseGuest("nonsense") === null && parseGuest(null) === null, "non-objects are ignored");

// ───────────── the host's table, with a fake clock ─────────────
console.log("host table");
class FakeClock implements HostClock {
  t = 1_000_000;
  timers: { at: number; fn: () => void; id: number }[] = [];
  n = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.n;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (h: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== h);
  };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}
{
  const clock = new FakeClock();
  const h = new NearbyHost({ name: "Ali", avatar: "mungo" }, { series: 3 }, clock);
  const a = h.join("guest-a", "Bilal", "sal");
  const b = h.join("guest-b", "Chand", "wart");
  let v = h.viewFor(a);
  ok(v.lobby.filter((s) => s.name).length === 3 && v.status === "lobby", "three people in the lobby");
  let err = "";
  try {
    h.act(a, "start");
  } catch (e) {
    err = (e as Error).message;
  }
  ok(/host/.test(err), "only the host can start");
  h.act(h.hostId, "start");
  v = h.viewFor(a);
  ok(v.status === "playing" && v.game !== null && v.game.hand.length > 0, "game started, guest sees its hand");
  ok(h.state!.seats.filter((s) => s.isBot).length === 1, "the empty seat is a computer");
  const seatOf = (id: string) => h.state!.seats.find((s) => s.playerId === id)?.seat;
  ok(seatOf(a) !== undefined && seatOf(b) !== undefined, "guests have seats");

  // play some turns properly
  let plays = 0;
  for (let i = 0; i < 6 && !h.state!.game.deal.result; i++) {
    const turn = h.state!.game.deal.turn;
    const who = h.state!.seats[turn].playerId!;
    h.act(who, "play", { card: legalCards(h.state!.game.deal, turn)[0] });
    plays++;
  }
  ok(plays === 6, "six turns played by the right phones");
  err = "";
  const turn = h.state!.game.deal.turn;
  const notMe = h.state!.seats.find((s) => !s.isBot && s.seat !== turn)!.playerId!;
  try {
    h.act(notMe, "play", { card: h.viewFor(notMe).game!.hand[0] });
  } catch (e) {
    err = (e as Error).message;
  }
  ok(/not your turn/i.test(err), "playing out of turn is refused");

  // the turn clock: nobody plays, the host plays for them
  const before = h.state!.game.deal.events.length;
  clock.advance(TURN_SECONDS * 1000 + 8000);
  ok(h.state!.game.deal.events.length > before, "a card is played for a player whose time ran out");

  // a guest drops out: seat held, then a computer, then back on rejoin
  const bSeat = seatOf(b)!;
  h.disconnect(b);
  ok(h.state!.seats[bSeat].awaySince !== null && !h.state!.seats[bSeat].isBot, "dropped guest's seat is held");
  clock.advance(AWAY_SECONDS * 1000 + 100);
  ok(h.state!.seats[bSeat].isBot && h.state!.seats[bSeat].name.endsWith("(bot)"), "then a computer takes it");
  h.join("guest-b", "Chand", "wart");
  ok(h.state!.seats[bSeat].playerId === b && !h.state!.seats[bSeat].isBot && h.state!.seats[bSeat].name === "Chand", "the guest gets the same seat back");
  const spare = h.join("guest-c", "Dani");
  ok(h.viewFor(spare).spectating || seatOf(spare) !== undefined, "a newcomer mid-game takes the computer's seat or watches");

  // chat
  h.sendChat(a, { text: "  salaam   " });
  ok(h.chat.at(-1)?.text === "salaam", "chat cleaned");
  err = "";
  try {
    for (let i = 0; i < 7; i++) h.sendChat(a, { sticker: "laugh" });
  } catch (e) {
    err = (e as Error).message;
  }
  ok(/slow/i.test(err), "chat flood is slowed");
  h.close();
}
{
  // 3 Patti
  const clock = new FakeClock();
  const h = new NearbyHost({ name: "Ali" }, { game: "patti", boot: 10 }, clock);
  const a = h.join("guest-a", "Bilal");
  h.act(h.hostId, "start");
  ok(!!h.state!.patti && h.viewFor(a).patti !== null, "3 Patti table starts");
  const pv = h.viewFor(a).patti!;
  ok(pv.state.hands.slice(1).every((hand) => hand.length === 0) && h.state!.patti!.hands.every((hand) => hand.length === 3), "guest can't see other hands");
  let guard = 0;
  while (!h.state!.patti!.result && guard++ < 200) clock.advance(40_000);
  ok(!!h.state!.patti!.result, "bots and the clock finish a deal");
  h.act(a, "next");
  ok(!h.state!.patti!.result, "next deal dealt");
  h.close();
}

// ───────────── sessions over channels ─────────────
console.log("sessions");
async function sessions() {
  const host = new HostSession({ name: "Ali", avatar: "mungo" }, { series: 3 });
  const join = (gid: string, name: string) => {
    const [hostEnd, guestEnd] = memoryPair();
    host.addGuest(hostEnd);
    return { g: new GuestSession(guestEnd, { guestId: gid, name }), hostEnd, guestEnd };
  };
  const A = join("guest-a", "Bilal");
  const B = join("guest-b", "Chand");
  await Promise.all([A.g.ready, B.g.ready]);
  await tick();
  ok(A.g.snapshot().live && A.g.snapshot().room?.lobby.filter((s) => s.name).length === 3, "guests welcomed and see the lobby");
  let err = "";
  await A.g.act("start").catch((e) => (err = e.message));
  ok(/host/.test(err), "a guest's refused move comes back as an error");

  // the same move sent twice is applied once
  const raw = A.hostEnd as Channel;
  void raw;
  await host.act("start");
  await tick();
  const room = (s: { snapshot(): { room: RoomView | null } }) => s.snapshot().room!;
  ok(room(A.g).status === "playing" && room(B.g).status === "playing", "everyone sees the game start");
  ok(room(A.g).game!.hand.length > 0 && room(A.g).game!.mySeat !== room(B.g).game!.mySeat, "each guest gets its own view");

  // whoever is on turn plays through their own phone
  const phones: Record<string, { act: (a: string, e?: Record<string, unknown>) => Promise<void> }> = {
    [host.host.hostId]: host,
    "guest-a": A.g,
    "guest-b": B.g,
  };
  for (let i = 0; i < 5; i++) {
    const st = host.host.state!;
    if (st.game.deal.result) break;
    const t = st.game.deal.turn;
    const pid = st.seats[t].playerId!;
    await phones[pid].act("play", { card: legalCards(st.game.deal, t)[0] });
    await tick();
  }
  ok(host.host.state!.game.deal.events.filter((e) => e.type === "play").length >= 5, "turns played over the channels");
  ok(room(A.g).version === host.host.version && room(B.g).version === host.host.version, "guests are up to date");

  // duplicate act id: sent twice on the wire, applied once
  const st = host.host.state!;
  const t = st.game.deal.turn;
  const pid = st.seats[t].playerId!;
  if (pid !== host.host.hostId) {
    const link = pid === "guest-a" ? A.guestEnd : B.guestEnd;
    const card = legalCards(st.game.deal, t)[0];
    const msg = JSON.stringify({ t: "act", v: PROTOCOL, id: "dup-1", action: "play", extra: { card } });
    const plays = st.game.deal.events.length;
    link.send(msg);
    link.send(msg);
    await tick();
    const added = host.host.state!.game.deal.events.length - plays;
    ok(added >= 1 && host.host.state!.game.deal.events.filter((e) => e.type === "play" && e.card === card).length === 1, "a repeated move is applied once");
  } else ok(true, "(host on turn; duplicate check skipped this run)");

  // guest B drops: seat held; reconnects on a new channel with the same id: same seat
  const bSeat = room(B.g).game!.mySeat;
  B.guestEnd.close();
  await tick();
  ok(B.g.snapshot().ended !== null, "guest notices the lost connection");
  ok(host.host.state!.seats[bSeat].awaySince != null, "host holds the dropped guest's seat");
  const B2 = join("guest-b", "Chand");
  await B2.g.ready;
  await tick();
  ok(room(B2.g).game?.mySeat === bSeat && host.host.state!.seats[bSeat].playerId === "guest-b", "rejoining gets the same seat");

  // a phone with another protocol version is told to update
  const [he, ge] = memoryPair();
  host.addGuest(he);
  let bye = "";
  ge.onmessage = (d) => (bye = d);
  ge.send(JSON.stringify({ t: "hello", v: PROTOCOL + 1, guestId: "old-phone", name: "Old" }));
  await tick();
  ok(/different versions/.test(bye), "a different app version gets a clear message");

  // chat goes everywhere
  await A.g.sendChat({ text: "chai?" });
  await tick();
  ok(B2.g.snapshot().chat.some((m) => m.text === "chai?") && host.snapshot().chat.some((m) => m.text === "chai?"), "chat reaches everyone");

  // guest leaves for good
  A.g.leave();
  await tick();
  ok(!host.host.players.some((p) => p.id === "guest-a"), "a guest who leaves is gone from the table");

  // host closes the table
  host.leave();
  await tick();
  ok(/host closed/.test(B2.g.snapshot().ended ?? ""), "guests are told the host closed the table");
}
void sessions().then(() => {
  console.log(fails ? `${fails} FAILED` : "ALL OK");
  process.exit(fails ? 1 : 0);
});
