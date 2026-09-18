"use client";

import { useCallback, useEffect } from "react";
import { RotateCcw, Undo2 } from "lucide-react";

import { Board } from "@/components/game/board";
import { BoardOverlay } from "@/components/game/board-overlay";
import { ScoreBoard } from "@/components/game/score-board";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { MOVE_DURATION_MS, useGame2048 } from "@/hooks/use-game-2048";
import type { Direction } from "@/lib/game/types";

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function Game2048({ size = 4 }: { size?: number }) {
  const { state, ready, bestScore, canUndo, move, newGame, undo, keepPlaying } =
    useGame2048(size);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const direction = KEY_MAP[event.key] ?? KEY_MAP[event.key.toLowerCase()];
      if (!direction) return;

      event.preventDefault();
      move(direction);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, undo]);

  const onSwipe = useCallback((direction: Direction) => move(direction), [move]);

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl leading-none font-bold tracking-tight sm:text-6xl">
            2048
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Join the tiles, reach <span className="font-semibold">2048</span>.
          </p>
        </div>
        <ScoreBoard
          score={state.score}
          bestScore={bestScore}
          gained={state.gained}
          moveKey={state.moves}
        />
      </header>

      <div className="flex items-center gap-2">
        <Button onClick={newGame}>
          <RotateCcw className="size-4" />
          New game
        </Button>
        <Button variant="outline" onClick={undo} disabled={!canUndo}>
          <Undo2 className="size-4" />
          Undo
        </Button>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <Board
        state={state}
        ready={ready}
        duration={MOVE_DURATION_MS / 1000}
        onSwipe={onSwipe}
        overlay={
          state.status === "playing" ? null : (
            <BoardOverlay
              status={state.status}
              score={state.score}
              onKeepPlaying={keepPlaying}
              onNewGame={newGame}
            />
          )
        }
      />

      <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <p>
          <span className="text-foreground font-medium">Arrow keys</span> or{" "}
          <span className="text-foreground font-medium">WASD</span> to move —
          swipe on touch.
        </p>
        <p className="font-mono tabular-nums">
          {state.moves} moves · best tile {state.highest || "—"}
        </p>
      </footer>
    </div>
  );
}
