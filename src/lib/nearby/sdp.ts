/**
 * A WebRTC offer or answer squeezed into ~110 characters so it fits a small, easy-to-scan QR code.
 *
 * A data-channel-only session differs between two phones in just a few fields: the ICE username and
 * password, the DTLS certificate fingerprint, the DTLS role, the media id and the phone's local
 * addresses. Those are packed into bytes; the rest of the description is rebuilt from a fixed template
 * on the other phone. No STUN or TURN: on the same Wi-Fi or hotspot the local ("host") addresses are
 * all that's needed.
 */

export type SdpKind = "offer" | "answer";

export interface Candidate {
  /** An IPv4/IPv6 address, or an mDNS name ("<uuid>.local") when the browser hides the address. */
  address: string;
  port: number;
}

export interface CompactSdp {
  kind: SdpKind;
  ufrag: string;
  pwd: string;
  /** SHA-256 fingerprint, 32 bytes. */
  fingerprint: Uint8Array;
  setup: "actpass" | "active" | "passive";
  mid: string;
  candidates: Candidate[];
}

const FORMAT = 1;
const SETUPS = ["actpass", "active", "passive"] as const;
const MAX_CANDIDATES = 4;
const UUID_LOCAL = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export class SdpError extends Error {}

/** Reads the fields that matter out of a full session description (after ICE gathering). */
export function parseSdp(sdp: string, kind: SdpKind): CompactSdp {
  const lines = sdp.split(/\r?\n/);
  const val = (prefix: string) => lines.find((l) => l.startsWith(prefix))?.slice(prefix.length).trim();
  const ufrag = val("a=ice-ufrag:");
  const pwd = val("a=ice-pwd:");
  const fp = val("a=fingerprint:");
  const setup = val("a=setup:") as CompactSdp["setup"] | undefined;
  const mid = val("a=mid:") ?? "0";
  if (!ufrag || !pwd || !fp || !setup) throw new SdpError("Incomplete connection details");
  const [algo, hex] = fp.split(/\s+/);
  if (algo.toLowerCase() !== "sha-256" || !hex) throw new SdpError("Unsupported certificate fingerprint");
  const fingerprint = new Uint8Array(hex.split(":").map((h) => parseInt(h, 16)));
  if (fingerprint.length !== 32 || fingerprint.some((b) => Number.isNaN(b))) throw new SdpError("Bad certificate fingerprint");
  if (!SETUPS.includes(setup)) throw new SdpError("Bad DTLS role");

  const candidates: Candidate[] = [];
  for (const l of lines) {
    if (!l.startsWith("a=candidate:")) continue;
    // a=candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ...
    const parts = l.slice("a=candidate:".length).split(/\s+/);
    const [, component, transport, , address, port, , type] = parts;
    if (component !== "1" || transport?.toLowerCase() !== "udp" || type !== "host") continue;
    const ok = IPV4.test(address) || UUID_LOCAL.test(address) || address.endsWith(".local");
    if (!ok) continue; // IPv6 left out to keep the code small; IPv4 or mDNS works on every phone
    if (candidates.some((c) => c.address === address)) continue;
    candidates.push({ address, port: Number(port) });
  }
  // real addresses first (they work where multicast DNS is blocked), then mDNS names
  candidates.sort((a, b) => Number(IPV4.test(b.address)) - Number(IPV4.test(a.address)));
  return { kind, ufrag, pwd, fingerprint, setup, mid, candidates: candidates.slice(0, MAX_CANDIDATES) };
}

// ───────────── bytes ─────────────

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string): Uint8Array {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const ascii = (s: string) => {
  if (!/^[\x21-\x7e]*$/.test(s) || s.length > 255) throw new SdpError("Unexpected characters in connection details");
  return Array.from(s, (c) => c.charCodeAt(0));
};

/** The compact text form (base64url). */
export function encodeCompact(c: CompactSdp): string {
  const out: number[] = [(FORMAT << 1) | (c.kind === "answer" ? 1 : 0), SETUPS.indexOf(c.setup)];
  const str = (s: string) => {
    const b = ascii(s);
    out.push(b.length, ...b);
  };
  str(c.ufrag);
  str(c.pwd);
  str(c.mid);
  out.push(...c.fingerprint);
  out.push(c.candidates.length);
  for (const cand of c.candidates) {
    const v4 = IPV4.exec(cand.address);
    const uuid = UUID_LOCAL.exec(cand.address);
    if (v4) out.push(4, ...v4.slice(1).map(Number));
    else if (uuid) {
      out.push(1);
      const hex = uuid.slice(1).join("");
      for (let i = 0; i < 32; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
    } else {
      out.push(2);
      str(cand.address);
    }
    out.push((cand.port >> 8) & 0xff, cand.port & 0xff);
  }
  return toB64url(Uint8Array.from(out));
}

export function decodeCompact(text: string): CompactSdp {
  let b: Uint8Array;
  try {
    b = fromB64url(text.trim());
  } catch {
    throw new SdpError("That isn't a table code");
  }
  let i = 0;
  const need = (n: number) => {
    if (i + n > b.length) throw new SdpError("That code is cut off");
  };
  const byte = () => {
    need(1);
    return b[i++];
  };
  const str = () => {
    const n = byte();
    need(n);
    const s = String.fromCharCode(...b.subarray(i, i + n));
    i += n;
    return s;
  };
  const head = byte();
  if (head >> 1 !== FORMAT) throw new SdpError("That code is from a different version of the app");
  const kind: SdpKind = head & 1 ? "answer" : "offer";
  const setup = SETUPS[byte()];
  if (!setup) throw new SdpError("That isn't a table code");
  const ufrag = str();
  const pwd = str();
  const mid = str();
  need(32);
  const fingerprint = b.slice(i, i + 32);
  i += 32;
  const n = byte();
  if (n > MAX_CANDIDATES) throw new SdpError("That isn't a table code");
  const candidates: Candidate[] = [];
  for (let k = 0; k < n; k++) {
    const t = byte();
    let address: string;
    if (t === 4) {
      need(4);
      address = Array.from(b.subarray(i, i + 4)).join(".");
      i += 4;
    } else if (t === 1) {
      need(16);
      const h = Array.from(b.subarray(i, i + 16), (x) => x.toString(16).padStart(2, "0")).join("");
      i += 16;
      address = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`;
    } else if (t === 2) address = str();
    else throw new SdpError("That isn't a table code");
    const port = (byte() << 8) | byte();
    candidates.push({ address, port });
  }
  if (!ufrag || !pwd) throw new SdpError("That isn't a table code");
  return { kind, ufrag, pwd, fingerprint, setup, mid, candidates };
}

/** A full session description again, for setRemoteDescription. */
export function buildSdp(c: CompactSdp): string {
  const fp = Array.from(c.fingerprint, (x) => x.toString(16).toUpperCase().padStart(2, "0")).join(":");
  const first = c.candidates[0];
  const lines = [
    "v=0",
    `o=- ${Math.floor(Math.random() * 1e15)} 2 IN IP4 127.0.0.1`,
    "s=-",
    "t=0 0",
    `a=group:BUNDLE ${c.mid}`,
    "a=msid-semantic: WMS",
    `m=application ${first?.port ?? 9} UDP/DTLS/SCTP webrtc-datachannel`,
    `c=IN IP4 ${first && IPV4.test(first.address) ? first.address : "0.0.0.0"}`,
    ...c.candidates.map(
      (cand, k) => `a=candidate:${k + 1} 1 udp ${2122260223 - k * 256} ${cand.address} ${cand.port} typ host generation 0`,
    ),
    "a=end-of-candidates",
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${c.setup}`,
    `a=mid:${c.mid}`,
    "a=sctp-port:5000",
    "a=max-message-size:65536",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** The code inside whatever was scanned or pasted: a bare code, or a link with #nb=<code>. */
export function codeFromScan(text: string): string {
  const t = text.trim();
  const m = /[#&?]nb=([A-Za-z0-9_-]+)/.exec(t);
  return m ? m[1] : t;
}
