"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query currently matches.
 *
 * Through `useSyncExternalStore` rather than an effect, so the server and the
 * first client render agree on `false` and React swaps in the real value on
 * hydration instead of warning about a mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
