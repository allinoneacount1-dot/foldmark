"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MOTION, GSAP_EASE, prefersReducedMotion } from "@/lib/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll reveals.
 *
 * Scrolling itself is native — a dense data surface should scroll the way the
 * operating system scrolls it, and a smoothing layer only adds a failure mode.
 *
 * A reveal is not one animation applied everywhere. What enters says how it
 * enters, because the gesture should suit the content:
 *
 *   heading  a display statement is uncovered, like a line of type being set
 *   rail     a rail carries values in from the side it lives on
 *   table    rows arrive in sequence, briefly, the way a ledger fills
 *   graph    nodes settle before their relationships are drawn
 *   (default) everything else simply rises
 *
 * Fail-safe by construction: content ships visible and the hidden state is set
 * from JavaScript immediately before the animation that undoes it. If this
 * never runs, every section is already on screen.
 */

type RevealKind = "heading" | "rail" | "table" | "graph" | "default";

const s = (ms: number) => ms / 1000;

function revealFor(kind: RevealKind): { from: gsap.TweenVars; to: gsap.TweenVars } {
  switch (kind) {
    case "heading":
      return {
        from: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
        to: { opacity: 1, clipPath: "inset(0 0% 0 0)", duration: s(MOTION.section), ease: GSAP_EASE.out },
      };
    case "rail":
      return {
        from: { opacity: 0, x: 14 },
        to: { opacity: 1, x: 0, duration: s(MOTION.panel), ease: GSAP_EASE.out },
      };
    case "table":
      return {
        from: { opacity: 0, y: 6 },
        to: { opacity: 1, y: 0, duration: s(MOTION.micro), ease: GSAP_EASE.out, stagger: 0.035 },
      };
    case "graph":
      return {
        from: { opacity: 0, scale: 0.985 },
        to: { opacity: 1, scale: 1, duration: s(MOTION.section), ease: GSAP_EASE.out },
      };
    default:
      return {
        from: { opacity: 0, y: 10 },
        to: { opacity: 1, y: 0, duration: s(MOTION.section), ease: GSAP_EASE.out, stagger: 0.06 },
      };
  }
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) return;
    // Docs are for reading. Nothing there animates on scroll.
    if (pathname.startsWith("/docs")) return;

    const ctx = gsap.context(() => {
      for (const section of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
        const items = section.querySelectorAll<HTMLElement>("[data-reveal-item]");
        if (!items.length) continue;

        // Content already in view on load stays put. Animating what the reader
        // is looking at is noise, not pacing.
        if (section.getBoundingClientRect().top < window.innerHeight * 0.9) continue;

        // group by kind so each gesture gets its own timing
        const byKind = new Map<RevealKind, HTMLElement[]>();
        for (const el of items) {
          const kind = (el.dataset.revealItem || "default") as RevealKind;
          const list = byKind.get(kind) ?? [];
          list.push(el);
          byKind.set(kind, list);
        }

        for (const [kind, group] of byKind) {
          const { from, to } = revealFor(kind);
          gsap.set(group, from);
          gsap.to(group, {
            ...to,
            scrollTrigger: { trigger: section, start: "top 88%", once: true },
          });
        }
      }
    });

    ScrollTrigger.refresh();
    return () => ctx.revert();
  }, [pathname]);

  return <>{children}</>;
}
