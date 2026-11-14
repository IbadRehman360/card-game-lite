"use client";

import { useEffect, useRef, useState } from "react";

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

/** The phone's built-in QR reader where there is one (Chrome on Android), else jsQR (iPhone). */
async function makeReader(): Promise<(c: HTMLCanvasElement) => Promise<string | null>> {
  const BD = (window as Window & { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (BD) {
    try {
      const formats = (await BD.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const det = new BD({ formats: ["qr_code"] });
        return async (c) => (await det.detect(c))[0]?.rawValue ?? null;
      }
    } catch {}
  }
  const { default: jsQR } = await import("jsqr");
  return async (c) => {
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/**
 * Scans a QR code with the camera. `stream` is the camera already opened by the caller (it must stay open
 * while the connection is made); without it there is only the paste box. Scans a few times a second on a
 * small frame, to go easy on the phone.
 */
export function QrScanner({
  stream,
  onCode,
  hint,
}: {
  stream: MediaStream | null;
  onCode: (text: string) => void;
  hint: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(!stream);
  const done = useRef(false);
  const cb = useRef(onCode);
  useEffect(() => {
    cb.current = onCode;
  }, [onCode]);

  useEffect(() => {
    const v = video.current;
    if (!stream || !v) return;
    done.current = false;
    v.srcObject = stream;
    void v.play().catch(() => {});
    let stop = false;
    let t: number | undefined;
    const canvas = document.createElement("canvas");
    void makeReader().then((read) => {
      const loop = async () => {
        if (stop || done.current) return;
        if (v.readyState >= 2 && v.videoWidth) {
          const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          canvas.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, canvas.width, canvas.height);
          try {
            const text = await read(canvas);
            if (text && !stop && !done.current) {
              done.current = true;
              navigator.vibrate?.(40);
              cb.current(text);
              return;
            }
          } catch {}
        }
        t = window.setTimeout(() => void loop(), 180);
      };
      void loop();
    });
    return () => {
      stop = true;
      window.clearTimeout(t);
      v.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="nb-scan">
      {stream ? (
        <div className="nb-scan-view">
          <video ref={video} playsInline muted aria-label="Camera" />
          <span className="nb-scan-frame" aria-hidden />
        </div>
      ) : (
        <p className="nb-note">No camera. Paste the code instead.</p>
      )}
      <p className="nb-hint">{hint}</p>
      {showPaste ? (
        <form
          className="nb-paste"
          onSubmit={(e) => {
            e.preventDefault();
            if (paste.trim()) cb.current(paste.trim());
          }}
        >
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste code"
            aria-label="Paste code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="nb-btn nb-btn-small">
            Use
          </button>
        </form>
      ) : (
        <button type="button" className="nb-link" onClick={() => setShowPaste(true)}>
          Paste a code instead
        </button>
      )}
    </div>
  );
}
