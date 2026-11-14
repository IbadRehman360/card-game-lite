"use client";

import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof document !== "undefined" && document.documentElement.dataset.motion === "reduce";

/** A number that rolls toward `target` (the coin balance), instead of jumping. */
export function useCountUp(target: number | null, ms = 700): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number | null>(target);

  useEffect(() => {
    if (target === null) return;
    const start = from.current;
    let raf = 0;
    if (start === null || start === target || reduced()) {
      raf = requestAnimationFrame(() => {
        from.current = target;
        setShown(target);
      });
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (target - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown;
}
