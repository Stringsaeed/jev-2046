"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { cn } from "@/lib/utils";
import type { Tile as TileModel } from "@/lib/game/types";

interface TileProps {
  tile: TileModel;
  /** Edge length of one board cell, in px. */
  cell: number;
  /** Gutter between cells, in px. */
  gap: number;
  /** Slide duration in seconds. */
  duration: number;
  /** Merge leftovers: they slide to the merge cell, then get dropped. */
  vanishing?: boolean;
}

/** Shrinks the label so four- and five-digit values still fit the cell. */
function fontScaleFor(value: number): number {
  const digits = String(value).length;
  if (digits <= 2) return 0.44;
  if (digits === 3) return 0.34;
  if (digits === 4) return 0.27;
  return 0.21;
}

export function Tile({ tile, cell, gap, duration, vanishing = false }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const step = cell + gap;

  // Entrance. No dependency array, so it re-runs on every (re)mount — including
  // StrictMode's mount/unmount/mount cycle, which reverts the inline transform.
  // Anchoring the tile here rather than behind a "first run" ref is what keeps a
  // remounted tile from starting its slide at the board's top-left corner.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      gsap.set(el, {
        x: tile.prevCol * step,
        y: tile.prevRow * step,
        scale: 1,
        autoAlpha: 1,
      });

      if (tile.isMerged) {
        // Land at full size the moment the two sources arrive, then bulge — the
        // merged tile must never be smaller than the cell, or the tiles it ate
        // would show around its edges.
        gsap.set(el, { autoAlpha: 0 });
        gsap
          .timeline({ delay: duration })
          .set(el, { autoAlpha: 1 })
          .to(el, { scale: 1.16, duration: 0.09, ease: "power2.out" })
          .to(el, { scale: 1, duration: 0.11, ease: "power2.inOut" });
      } else if (tile.isNew) {
        gsap.fromTo(
          el,
          { scale: 0.1, autoAlpha: 0 },
          {
            scale: 1,
            autoAlpha: 1,
            duration: 0.18,
            ease: "back.out(2.2)",
            delay: duration,
          },
        );
      }
    },
    { scope: ref },
  );

  // Travel. A tile that did not move this turn is placed, not tweened, so a
  // board resize snaps instead of sliding.
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const to = { x: tile.col * step, y: tile.row * step };
      const travelled = tile.prevRow !== tile.row || tile.prevCol !== tile.col;

      if (travelled) {
        gsap.to(el, { ...to, duration, ease: "power2.out", overwrite: "auto" });
      } else {
        gsap.set(el, to);
      }
    },
    { dependencies: [tile.row, tile.col, tile.prevRow, tile.prevCol, step, duration], scope: ref },
  );

  return (
    <div
      ref={ref}
      aria-hidden={vanishing || undefined}
      className={cn(
        "tile-surface absolute top-0 left-0 flex items-center justify-center rounded-lg font-bold tabular-nums select-none",
        tile.value >= 128 && !vanishing && "tile-glow",
      )}
      style={
        {
          width: cell,
          height: cell,
          fontSize: cell * fontScaleFor(tile.value),
          zIndex: vanishing ? 1 : tile.isMerged || tile.isNew ? 30 : 10,
          "--tile-bg": `var(--tile-${tile.value}, var(--tile-super))`,
          "--tile-fg": `var(--tile-${tile.value}-fg, var(--tile-super-fg))`,
        } as React.CSSProperties
      }
    >
      {tile.value}
    </div>
  );
}
