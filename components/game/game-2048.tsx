"use client";

import { useCallback, useEffect, useMemo } from "react";
import { RotateCcw, Undo2 } from "lucide-react";

import { AgentPanel, formatDuration } from "@/components/agent/agent-panel";
import { Board } from "@/components/game/board";
import { BoardOverlay } from "@/components/game/board-overlay";
import { ScoreBoard } from "@/components/game/score-board";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { MOVE_DURATION_MS, useGame2048 } from "@/hooks/use-game-2048";
import { toGrid } from "@/lib/game/engine";
import { useJevAgent } from "@/hooks/use-jev-agent";
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

  // The request body doubles as the agent's loop key, so it must change when
  // the board does and stay put otherwise — hence the grid rather than `state`,
  // which gets a new identity when merge leftovers are cleared.
  const body = useMemo(
    () => JSON.stringify({ board: toGrid(state), score: state.score, moves: state.moves }),
    [state],
  );

  const agent = useJevAgent({
    endpoint: "/api/agent/move",
    body,
    playable: state.status === "playing",
    moveNumber: state.moves + 1,
    metric: state.score,
    onMove: move,
  });

  // While the agent has the board the player watches but cannot act, so every
  // input path is gated on this one flag.
  const locked = agent.running;

  useEffect(() => {
    if (locked) return;

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
  }, [move, undo, locked]);

  const onSwipe = useCallback((direction: Direction) => move(direction), [move]);

  // Anything that changes the board out from under the agent stops it first.
  const handleNewGame = useCallback(() => {
    agent.stop();
    newGame();
  }, [agent, newGame]);

  const handleKeepPlaying = useCallback(() => {
    agent.stop();
    keepPlaying();
  }, [agent, keepPlaying]);

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col items-start gap-5 lg:max-w-[52rem] lg:flex-row lg:gap-6">
      <div className="flex w-full flex-col gap-5 lg:max-w-[30rem]">
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
          <Button onClick={handleNewGame}>
            <RotateCcw className="size-4" />
            New game
          </Button>
          <Button variant="outline" onClick={undo} disabled={!canUndo || locked}>
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
          interactive={!locked}
          overlay={
            state.status === "playing" ? null : (
              <BoardOverlay
                status={state.status}
                score={state.score}
                onKeepPlaying={handleKeepPlaying}
                onNewGame={handleNewGame}
              />
            )
          }
        />

        <footer className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <p>
            {locked ? (
              <span className="text-foreground font-medium">
                Jev is playing — the board is read-only.
              </span>
            ) : (
              <>
                <span className="text-foreground font-medium">Arrow keys</span> or{" "}
                <span className="text-foreground font-medium">WASD</span> to move —
                swipe on touch.
              </>
            )}
          </p>
          <p className="font-mono tabular-nums">
            {state.moves} moves · best tile {state.highest || "—"}
          </p>
        </footer>
      </div>

      <AgentPanel
        agent={agent}
        metric={state.score}
        finished={state.status !== "playing"}
        formatDelta={(before, after) =>
          after > before ? `+${after - before} pts` : "no merge"
        }
        success={
          state.status === "won" ? (
            <>
              <span className="font-semibold">Reached 2048.</span> Jev solved it in{" "}
              <span className="font-mono font-semibold">
                {formatDuration(agent.elapsedMs)}
              </span>{" "}
              over <span className="font-mono font-semibold">{agent.log.length}</span>{" "}
              moves. The agent stops here.
            </>
          ) : null
        }
        idleHint="Start the agent and the board becomes read-only while Jev plays."
      />
    </div>
  );
}
