"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MOTION, prefersReducedMotion } from "@/lib/motion";

/**
 * Route continuity.
 *
 * On navigation the main container replays a short entrance so a new view
 * arrives rather than snapping into place. Three properties matter:
 *
 *   - it never remounts the subtree, so a canvas or a chart keeps its state
 *   - it never starts from zero opacity, so streamed content stays readable
 *   - it never intercepts pointer events, so navigation feels immediate
 *
 * It keys on pathname alone: changing a filter updates the query string, and
 * re-animating the page on every chip click would be noise, not continuity.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // The first paint is the document load, which needs no transition of its own.
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion()) return;

    el.classList.remove("route-enter");
    // one forced reflow so the animation restarts rather than being coalesced
    void el.offsetWidth;
    el.classList.add("route-enter");

    const done = () => el.classList.remove("route-enter");

    // animationend bubbles, so a child's entrance would otherwise end this one
    // early; and a re-render mid-transition can cancel the animation without
    // ever firing the event, which is what the timeout covers.
    const onEnd = (e: AnimationEvent) => {
      if (e.target === el) done();
    };
    el.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(done, MOTION.page + 120);

    return () => {
      el.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
      done();
    };
  }, [pathname]);

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
