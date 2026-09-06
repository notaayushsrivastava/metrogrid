/**
 * Restrained anime.js micro-interactions (PRD Phase 4 "anime.js Interaction
 * Direction"): fast, subtle, non-blocking, and gated behind
 * `prefers-reduced-motion`. anime.js v4 API (`animate`).
 */

import { animate } from "animejs";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Quick attention pulse for score chips when a metric moves. */
export function pulseChip(element: Element | null): void {
  if (!element || prefersReducedMotion()) return;
  animate(element, {
    scale: [{ to: 1.12, duration: 120 }, { to: 1, duration: 220 }],
    ease: "outQuad",
  });
}

/** Tiny spring on tool selection (PRD "Tool-selection transitions"). */
export function selectPop(element: Element | null): void {
  if (!element || prefersReducedMotion()) return;
  animate(element, {
    scale: [{ to: 1.06, duration: 90 }, { to: 1, duration: 160 }],
    ease: "outQuad",
  });
}

/** Slide-down for the offline banner. */
export function slideDown(element: Element | null): void {
  if (!element || prefersReducedMotion()) return;
  animate(element, {
    translateY: [-8, 0],
    opacity: [0, 1],
    duration: 260,
    ease: "outQuad",
  });
}

/** Confirmatory pop for import success feedback. */
export function successPop(element: Element | null): void {
  if (!element || prefersReducedMotion()) return;
  animate(element, {
    scale: [{ to: 0.9, duration: 90 }, { to: 1, duration: 260 }],
    opacity: [0, 1],
    ease: "outQuad",
  });
}
