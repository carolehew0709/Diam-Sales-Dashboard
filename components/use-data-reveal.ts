"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";

/** A short reveal of the committed values, never an interpolation of financial data. */
export function useDataReveal<T extends HTMLElement>(
  root: RefObject<T>,
  version: unknown,
  selector?: string,
) {
  const previous = useRef(version);
  useLayoutEffect(() => {
    const changed = previous.current !== version;
    previous.current = version;
    if (
      !changed ||
      !root.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const nodes = selector
      ? [...root.current.querySelectorAll<HTMLElement>(selector)]
      : [root.current];
    const animations: Animation[] = [];
    for (const node of nodes) {
      const bounds = node.getBoundingClientRect();
      // Hidden disclosures and off-screen charts do not need animation work.
      if (
        !bounds.height ||
        bounds.bottom <= 0 ||
        bounds.top >= window.innerHeight
      )
        continue;
      animations.push(
        node.animate([{ opacity: 0.65 }, { opacity: 1 }], {
          duration: 180,
          easing: "ease-out",
        }),
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [root, version, selector]);
}
