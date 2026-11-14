"use client";

import type { Channel } from "./protocol";
import { SdpError, buildSdp, codeFromScan, decodeCompact, encodeCompact, parseSdp } from "./sdp";

/**
 * A direct phone-to-phone connection over the local Wi-Fi or a hotspot, with no server and no internet:
 * WebRTC data channels, introduced by scanning QR codes (host shows an offer, guest shows its answer).
 *
 * Browsers hide a phone's local address behind a random ".local" name unless the page has camera or
 * microphone access, and many café routers block the multicast those names need. So the camera (used to
 * scan the codes anyway) is opened before the connection is made, and kept open until it is.
 */

/** How long to wait for the phone's own addresses. With no STUN server this is usually well under a second. */
const GATHER_MS = 2500;
/** How long a connection may take to open after both codes are scanned. */
const CONNECT_MS = 20_000;

export const nearbySupported = () =>
  typeof window !== "undefined" && "RTCPeerConnection" in window && !!navigator.mediaDevices?.getUserMedia;

/** The back camera, for scanning (and so the browser shares real local addresses). Null if refused. */
export async function openCamera(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    return null;
  }
}
export const stopCamera = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

function waitForGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(t);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const t = setTimeout(done, GATHER_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function newPeer() {
  // no ICE servers: only the phone's own (host) addresses, which is all a shared network needs
  return new RTCPeerConnection({ iceServers: [] });
}

/** A data channel as the session wants it. Resolves when it opens. */
export function wrap(dc: RTCDataChannel, pc: RTCPeerConnection): Promise<Channel> {
  return new Promise((resolve, reject) => {
    let opened = false;
    const ch: Channel = {
      onmessage: null,
      onclose: null,
      send: (d) => dc.send(d),
      close: () => {
        try {
          dc.close();
        } catch {}
        pc.close();
      },
    };
    const fail = () => {
      if (!opened) reject(new Error("Couldn't connect. Make sure both phones are on the same Wi-Fi or hotspot."));
    };
    const timer = setTimeout(() => {
      fail();
      if (!opened) pc.close();
    }, CONNECT_MS);
    dc.onopen = () => {
      opened = true;
      clearTimeout(timer);
      resolve(ch);
    };
    dc.onmessage = (e) => ch.onmessage?.(typeof e.data === "string" ? e.data : "");
    let closed = false;
    const closeOnce = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      fail();
      ch.onclose?.();
    };
    dc.onclose = closeOnce;
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closeOnce();
    });
  });
}

/** The host's side, for one guest: an offer code to show, then the guest's answer to accept. */
export interface PendingGuest {
  code: string;
  accept(answer: string): Promise<void>;
  /** Opens once the guest's answer is accepted and the phones reach each other. */
  channel: Promise<Channel>;
  cancel(): void;
}

export async function hostOffer(): Promise<PendingGuest> {
  const pc = newPeer();
  const dc = pc.createDataChannel("haath", { ordered: true });
  const channel = wrap(dc, pc);
  channel.catch(() => {});
  await pc.setLocalDescription(await pc.createOffer());
  await waitForGathering(pc);
  const local = parseSdp(pc.localDescription!.sdp, "offer");
  if (!local.candidates.length) {
    pc.close();
    throw new Error("This phone isn't on a network. Join the Wi-Fi (or turn on the hotspot) and try again.");
  }
  return {
    code: encodeCompact(local),
    async accept(answer: string) {
      const c = decodeCompact(codeFromScan(answer));
      if (c.kind !== "answer") throw new SdpError("That's a host's code. Scan the code on your friend's phone.");
      await pc.setRemoteDescription({ type: "answer", sdp: buildSdp(c) });
    },
    channel,
    cancel: () => pc.close(),
  };
}

/** The guest's side: from the host's offer code, an answer code to show and the channel to come. */
export async function guestAnswer(offer: string): Promise<{ code: string; channel: Promise<Channel>; cancel(): void }> {
  const c = decodeCompact(codeFromScan(offer));
  if (c.kind !== "offer") throw new SdpError("That's a player's code. Scan the code on the host's phone.");
  const pc = newPeer();
  const channel = new Promise<Channel>((resolve, reject) => {
    pc.ondatachannel = (e) => wrap(e.channel, pc).then(resolve, reject);
    setTimeout(() => reject(new Error("Couldn't connect. Make sure both phones are on the same Wi-Fi or hotspot.")), CONNECT_MS + 60_000);
  });
  channel.catch(() => {});
  await pc.setRemoteDescription({ type: "offer", sdp: buildSdp(c) });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForGathering(pc);
  const local = parseSdp(pc.localDescription!.sdp, "answer");
  return { code: encodeCompact(local), channel, cancel: () => pc.close() };
}

/** Keeps the screen on while at the table (a locked phone drops the connection). */
export async function keepAwake(): Promise<() => void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
  if (!nav.wakeLock) return () => {};
  let lock: { release(): Promise<void> } | null = null;
  const get = async () => {
    try {
      lock = await nav.wakeLock!.request("screen");
    } catch {}
  };
  // the lock is let go whenever the page is hidden; take it again on return
  const onVisible = () => document.visibilityState === "visible" && void get();
  document.addEventListener("visibilitychange", onVisible);
  await get();
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => {});
  };
}
