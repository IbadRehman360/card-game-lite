"use client";

import { useMemo } from "react";
import { encodeQr, qrPath } from "@/lib/nearby/qr";

/** A QR code, dark on light (what phone cameras read best), sized by its container. */
export function QrView({ text, label }: { text: string; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = encodeQr(text, "M");
    return { d: qrPath(qr, 3), n: qr.size + 6 };
  }, [text]);
  return (
    <svg className="nb-qr" viewBox={`0 0 ${n} ${n}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
