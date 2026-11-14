"use client";

import { useEffect } from "react";
import { Crashed } from "@/components/crashed";

/** Whatever crashed on the page: a calm screen with a way back in, instead of a blank one. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[last-haath] page crashed", error);
  }, [error]);
  return <Crashed retry={retry} />;
}
