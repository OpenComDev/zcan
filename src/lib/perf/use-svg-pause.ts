"use client";

import { useEffect, type RefObject } from "react";
import { watchActive } from "./loop";

/**
 * Freezes an SVG's SMIL animations while it is off screen or the tab is hidden, and resumes
 * them from the same moment when it comes back. Several animated diagrams on one page then
 * cost nothing until they are scrolled into view.
 */
export function useSvgPause(ref: RefObject<SVGSVGElement | null>) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof svg.pauseAnimations !== "function") return;
    const stop = watchActive(svg, (on) => (on ? svg.unpauseAnimations() : svg.pauseAnimations()), "80px 0px");
    return () => {
      stop();
      svg.unpauseAnimations();
    };
  }, [ref]);
}
