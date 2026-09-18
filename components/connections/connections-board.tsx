"use client";

import { Shuffle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GROUP_SIZE } from "@/lib/connections/engine";
import { puzzleById } from "@/lib/connections/puzzles";
import type { ConnectionsState } from "@/lib/connections/types";
import { cn } from "@/lib/utils";

/** One colour per group, keyed by its position in the puzzle definition. */
const GROUP_COLORS = [
  "bg-amber-200 text-amber-950 dark:bg-amber-400/25 dark:text-amber-100",
  "bg-emerald-200 text-emerald-950 dark:bg-emerald-400/25 dark:text-emerald-100",
  "bg-sky-200 text-sky-950 dark:bg-sky-400/25 dark:text-sky-100",
  "bg-violet-200 text-violet-950 dark:bg-violet-400/25 dark:text-violet-100",
];

interface ConnectionsBoardProps {
  state: ConnectionsState;
  /** False while the agent has the board: the player watches but cannot act. */
  interactive: boolean;
  onToggle: (word: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onShuffle: () => void;
  /** Words the agent is about to submit, previewed before it commits. */
  preview?: string[];
}

export function ConnectionsBoard({
  state,
  interactive,
  onToggle,
  onSubmit,
  onClear,
  onShuffle,
  preview = [],
}: ConnectionsBoardProps) {
  const puzzle = puzzleById(state.puzzleId);
  const mistakesLeft = state.maxMistakes - state.mistakes;
  const ready = state.selected.length === GROUP_SIZE;

  return (
    <div className="flex w-full flex-col gap-3">
      {state.found.map((group) => {
        const index = puzzle.groups.findIndex((g) => g.name === group.name);
        return (
          <div
            key={group.name}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl px-3 py-3 text-center",
              GROUP_COLORS[index] ?? GROUP_COLORS[0],
            )}
          >
            <span className="text-xs font-bold tracking-wide uppercase">{group.name}</span>
            <span className="mt-0.5 text-sm font-medium">{group.words.join(", ")}</span>
          </div>
        );
      })}

      {state.board.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {state.board.map((word) => {
            const selected = state.selected.includes(word);
            const previewed = preview.includes(word);
            return (
              <button
                key={word}
                type="button"
                disabled={!interactive}
                aria-pressed={selected}
                onClick={() => onToggle(word)}
                className={cn(
                  "flex h-16 items-center justify-center rounded-xl px-1 text-center text-[0.7rem] leading-tight font-bold tracking-tight uppercase transition-colors sm:text-sm",
                  selected
                    ? "bg-foreground text-background"
                    : previewed
                      ? "bg-emerald-500/20 ring-2 ring-emerald-500 ring-inset"
                      : "bg-muted text-foreground hover:bg-muted/70",
                  !interactive && "cursor-not-allowed",
                )}
              >
                {word}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Mistakes</span>
        <div className="flex gap-1">
          {Array.from({ length: state.maxMistakes }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-2.5 rounded-full",
                index < mistakesLeft ? "bg-foreground" : "bg-muted",
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "ml-auto text-xs font-medium",
            state.lastResult?.kind === "correct" && "text-emerald-600 dark:text-emerald-400",
            state.lastResult?.kind === "one-away" && "text-amber-600 dark:text-amber-400",
            state.lastResult?.kind === "wrong" && "text-destructive",
          )}
        >
          {state.lastResult?.kind === "one-away"
            ? "One away…"
            : state.lastResult?.kind === "wrong"
              ? "Not a group."
              : null}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onShuffle} disabled={!interactive}>
          <Shuffle className="size-3.5" />
          Shuffle
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={!interactive || state.selected.length === 0}
        >
          <X className="size-3.5" />
          Deselect
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={!interactive || !ready}>
          Submit
        </Button>
      </div>
    </div>
  );
}
