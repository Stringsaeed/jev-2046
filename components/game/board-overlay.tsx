"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { Button } from "@/components/ui/button";
import type { GameStatus } from "@/lib/game/types";

interface BoardOverlayProps {
  status: Exclude<GameStatus, "playing">;
  score: number;
  onKeepPlaying: () => void;
  onNewGame: () => void;
}

export function BoardOverlay({
  status,
  score,
  onKeepPlaying,
  onNewGame,
}: BoardOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(
        ref.current,
        { autoAlpha: 0, scale: 0.97 },
        { autoAlpha: 1, scale: 1, duration: 0.3, ease: "power2.out" },
      );
    },
    { scope: ref },
  );

  const won = status === "won";

  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-label={won ? "You reached 2048" : "Game over"}
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center backdrop-blur-[3px] bg-white/80 dark:bg-black/70"
    >
      <div className="space-y-1">
        <p className="text-3xl font-bold tracking-tight sm:text-4xl">
          {won ? "You win!" : "Game over"}
        </p>
        <p className="text-muted-foreground text-sm">
          {won
            ? "You put together a 2048 tile."
            : "No moves left on the board."}{" "}
          Final score{" "}
          <span className="text-foreground font-mono font-semibold tabular-nums">
            {score.toLocaleString()}
          </span>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {won ? (
          <Button onClick={onKeepPlaying}>Keep going</Button>
        ) : null}
        <Button variant={won ? "outline" : "default"} onClick={onNewGame}>
          New game
        </Button>
      </div>
    </div>
  );
}
