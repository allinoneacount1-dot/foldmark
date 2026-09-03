"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Motion has exactly one job: reveal a section once, as it enters.
 *
 * Scrolling is native. A dense data surface should scroll the way the operating
 * system scrolls it — a smoothing layer adds a failure mode and buys nothing on
 * a terminal.
 *
 * The reveal is fail-safe by construction: content ships visible, and the
 * initial hidden state is set from JavaScript immediately before the animation
 * that undoes it. If this component never runs, or the browser blocks the
 * animation, every section is simply already on screen.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia(REDUCED).matches) return;

    const ctx = gsap.context(() => {
      for (const section of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
        const items = section.querySelectorAll("[data-reveal-item]");
        if (!items.length) continue;

        // Anything already in view on load stays put — a reveal that animates
        // content the reader is looking at is noise, not pacing.
        const box = section.getBoundingClientRect();
        if (box.top < window.innerHeight * 0.9) continue;

        gsap.set(items, { opacity: 0, y: 14 });
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration: 0.52,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: { trigger: section, start: "top 88%", once: true },
        });
      }
    });

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [pathname]);

  return <>{children}</>;
}
