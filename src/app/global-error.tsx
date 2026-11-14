"use client";

import { useEffect } from "react";
import { Crashed } from "@/components/crashed";

/** A crash in the root layout itself: it replaces the whole document, so it brings its own html and body. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[last-haath] app crashed", error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050403" }}>
        <Crashed retry={retry} />
      </body>
    </html>
  );
}
