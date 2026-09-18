"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { ConnectionsAgentPanel } from "@/components/connections/connections-agent-panel";
import { ConnectionsBoard } from "@/components/connections/connections-board";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/use-connections";
import { useConnectionsAgent } from "@/hooks/use-connections-agent";
import { PUZZLES, puzzleById } from "@/lib/connections/puzzles";
import { cn } from "@/lib/utils";

export function Connections() {
  const [puzzleId, setPuzzleId] = useState(PUZZLES[0].id);
  const game = useConnections(puzzleId);
  const { state } = game;

  // Every grouping the board has already refuted, so the agent never spends a
  // mistake re-submitting one.
  const rejected = useMemo(
    () =>
      state.guesses
        .filter((guess) => guess.kind !== "correct")
        .map((guess) => ({
          words: guess.words,
          kind: guess.kind as "one-away" | "wrong",
        })),
    [state.guesses],
  );

  const agent = useConnectionsAgent({
    board: state.board,
    boardKey: game.boardKey,
    playable: state.status === "playing",
    rejected,
    onSubmit: game.submitWords,
  });

  // While the agent is working the player watches but cannot act.
  const locked = agent.running;

  const choosePuzzle = (id: string) => {
    agent.stop();
    setPuzzleId(id);
    game.newGame(id);
  };

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col items-start gap-5 lg:max-w-[52rem] lg:flex-row lg:gap-6">
      <div className="flex w-full flex-col gap-5 lg:max-w-[30rem]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl leading-none font-bold tracking-tight sm:text-5xl">
              Connections
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Find the four groups of four. {puzzleById(state.puzzleId).title}
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {PUZZLES.map((puzzle) => (
            <Button
              key={puzzle.id}
              size="sm"
              variant={puzzle.id === state.puzzleId ? "default" : "outline"}
              disabled={locked}
              onClick={() => choosePuzzle(puzzle.id)}
            >
              {puzzle.title}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            disabled={locked}
            onClick={() => {
              agent.stop();
              game.newGame();
            }}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        </div>

        <ConnectionsBoard
          state={state}
          interactive={!locked}
          onToggle={game.toggle}
          onSubmit={game.submit}
          onClear={game.clear}
          onShuffle={game.shuffle}
          preview={locked ? (agent.queue[0]?.words ?? []) : []}
        />

        <footer className="text-muted-foreground text-xs">
          {locked ? (
            <span className="text-foreground font-medium">
              Jev is playing — the board is read-only.
            </span>
          ) : state.status === "won" ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              Solved with {state.mistakes} mistake{state.mistakes === 1 ? "" : "s"}.
            </span>
          ) : state.status === "lost" ? (
            <span className={cn("text-destructive font-medium")}>
              Out of mistakes. Reset to try again.
            </span>
          ) : (
            "Pick four words that share something, then submit."
          )}
        </footer>
      </div>

      <ConnectionsAgentPanel agent={agent} state={state} />
    </div>
  );
}
