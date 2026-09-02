"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Lenis smooth scroll 0.9 — institutional, not bouncy
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Hero pin 120vh + parallax
    const hero = document.querySelector("[data-hero]") as HTMLElement | null;
    if (hero) {
      gsap.to(hero, {
        yPercent: -10,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: 1.2,
        },
      });
    }

    // Section reveal 400-650ms, clip-path + opacity, stagger 40ms
    const sections = gsap.utils.toArray<HTMLElement>("[data-reveal]");
    sections.forEach((section) => {
      const headline = section.querySelector("[data-headline]");
      const body = section.querySelector("[data-body]");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top 82%",
          end: "top 55%",
          scrub: false,
          toggleActions: "play none none reverse",
        },
      });

      if (headline) {
        tl.fromTo(
          headline,
          { clipPath: "inset(0 100% 0 0)", opacity: 0 },
          { clipPath: "inset(0 0% 0 0)", opacity: 1, duration: 0.65, ease: "power3.out" },
          0
        );
      }
      if (body) {
        tl.fromTo(
          body,
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" },
          0.12
        );
      }
    });

    // Micro pulse for signal dots (already CSS, enhance with GSAP)
    gsap.to("[data-pulse]", {
      scale: 1.15,
      duration: 0.9,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      stagger: 0.2,
    });

    return () => {
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return <>{children}</>;
}
