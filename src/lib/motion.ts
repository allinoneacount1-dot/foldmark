/**
 * Motion constants for JavaScript-driven movement.
 *
 * These mirror the CSS custom properties in globals.css exactly. Anything that
 * animates from JS — the topology canvas, the scroll reveals, the route change
 * — reads from here so there is one motion system, not two.
 *
 * The governing rule: motion follows information. A duration is chosen by what
 * kind of change is being described, never by how long it looks good for.
 */

export const MOTION = {
  /** hover, focus, chip — immediate feedback */
  fast: 140,
  /** a control changing state */
  micro: 200,
  /** an inspector, sheet or modal entering */
  panel: 300,
  /** a band revealing on scroll */
  section: 440,
  /** a route change */
  page: 500,
  /** new data arriving — the only step allowed to be noticed */
  event: 640,
} as const;

export const EASE = {
  /** entrances */
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** spatial movement */
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/** gsap uses its own easing names for the same curves */
export const GSAP_EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
} as const;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the viewer has asked for less movement. Safe during SSR. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** Subscribe to changes in the preference so a running animation can stand down. */
export function onReducedMotionChange(handler: (reduced: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  const listener = (e: MediaQueryListEvent) => handler(e.matches);
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

/** Cubic ease-out, matching EASE.out closely enough for canvas work. */
export function easeOut(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - clamped, 3);
}

/** Symmetric ease for a value that travels out and back within one event. */
export function pulseCurve(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sin(clamped * Math.PI);
}
