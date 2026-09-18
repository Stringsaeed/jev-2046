"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Tile } from "@/components/game/tile";
import type { Direction, GameState } from "@/lib/game/types";

interface BoardProps {
  state: GameState;
  ready: boolean;
  duration: number;
  onSwipe: (direction: Direction) => void;
  /** Win / game-over panel, rendered above the tiles. */
  overlay?: React.ReactNode;
}

interface Metrics {
  cell: number;
  gap: number;
}

/** Minimum pointer travel, in px, before a drag counts as a swipe. */
const SWIPE_THRESHOLD = 24;

export function Board({ state, ready, duration, onSwipe, overlay }: BoardProps) {
  const { size } = state;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>({ cell: 0, gap: 0 });

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width === 0) return;
      const gap = Math.max(6, Math.round(width * 0.024));
      setMetrics({ cell: (width - gap * (size - 1)) / size, gap });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [size]);

  // Pointer swipes, for touch and mouse-drag alike.
  const origin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = surfaceRef.current?.parentElement;
    if (!el) return;

    const onPointerDown = (event: PointerEvent) => {
      origin.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      const start = origin.current;
      origin.current = null;
      if (!start) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        onSwipe(dx > 0 ? "right" : "left");
      } else {
        onSwipe(dy > 0 ? "down" : "up");
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onSwipe]);

  const cells = Array.from({ length: size * size }, (_, index) => index);
  const measured = metrics.cell > 0;

  return (
    <div
      className="relative touch-none rounded-2xl p-3 sm:p-4"
      style={{
        background: "var(--board-bg)",
        boxShadow: "var(--board-shadow)",
      }}
    >
      <div ref={surfaceRef} className="relative aspect-square w-full">
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            gap: metrics.gap,
          }}
        >
          {cells.map((index) => (
            <div
              key={index}
              className="rounded-lg"
              style={{ background: "var(--board-cell)" }}
            />
          ))}
        </div>

        {measured && ready ? (
          <div className="absolute inset-0">
            {state.vanished.map((tile) => (
              <Tile
                key={`vanished-${tile.id}`}
                tile={tile}
                cell={metrics.cell}
                gap={metrics.gap}
                duration={duration}
                vanishing
              />
            ))}
            {state.tiles.map((tile) => (
              <Tile
                key={tile.id}
                tile={tile}
                cell={metrics.cell}
                gap={metrics.gap}
                duration={duration}
              />
            ))}
          </div>
        ) : null}

      </div>

      {overlay ? (
        <div className="absolute inset-0 z-40 overflow-hidden rounded-2xl">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
