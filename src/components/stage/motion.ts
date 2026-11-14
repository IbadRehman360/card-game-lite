let mq: MediaQueryList | null = null;

/** True when the OS asks for less motion or the in-game toggle is on (html[data-motion="reduce"]). */
export function motionReduced() {
  if (typeof window === "undefined") return false;
  mq ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return mq.matches || document.documentElement.dataset.motion === "reduce";
}
