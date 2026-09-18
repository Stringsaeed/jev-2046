"use client";

import { useEffect, useRef } from "react";
import { Bot, Loader2, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentLogEntry, JevAgentController } from "@/hooks/use-jev-agent";
import { JEV_MODEL } from "@/lib/agent/jev";
import { ARROWS, DIRECTION_ORDER, type Direction } from "@/lib/direction";
import { cn } from "@/lib/utils";

export function formatDuration(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}

/** Four stacked bars: the whole distribution, not just the pick. */
function Distribution({
  probabilities,
  chosen,
  legal,
}: {
  probabilities: Record<Direction, number>;
  chosen: Direction;
  legal?: Direction[];
}) {
  return (
    <div className="space-y-1">
      {DIRECTION_ORDER.map((direction) => {
        const probability = probabilities[direction] ?? 0;
        const unavailable = legal ? !legal.includes(direction) : false;
        return (
          <div key={direction} className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "w-12 shrink-0 font-mono",
                direction === chosen ? "text-foreground font-semibold" : "text-muted-foreground",
              )}
            >
              {ARROWS[direction]} {direction}
            </span>
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  direction === chosen ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
                style={{ width: `${Math.round(probability * 100)}%` }}
              />
            </div>
            <span
              className={cn(
                "w-8 shrink-0 text-right font-mono tabular-nums",
                unavailable ? "text-muted-foreground/50" : "text-muted-foreground",
              )}
            >
              {probability.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LogRow({ entry, note }: { entry: AgentLogEntry; note: string }) {
  return (
    <li className="border-border/60 border-b py-2 last:border-b-0">
      <div className="flex items-baseline gap-2 font-mono text-xs">
        <span className="text-muted-foreground w-7 shrink-0 tabular-nums">{entry.move}</span>
        <span className="text-foreground w-14 shrink-0 font-semibold">
          {ARROWS[entry.direction]} {entry.direction}
        </span>
        <span className="text-muted-foreground tabular-nums">
          p {(entry.probabilities[entry.direction] ?? 0).toFixed(2)}
        </span>
        {entry.confidence === undefined ? null : (
          <span className="text-muted-foreground tabular-nums">
            c {entry.confidence.toFixed(2)}
          </span>
        )}
        <span className="text-muted-foreground ml-auto tabular-nums">{entry.latencyMs}ms</span>
      </div>
      <div className="text-muted-foreground mt-0.5 pl-9 font-mono text-[0.65rem]">
        {note}
        {entry.usedFallback ? ` · corrected from ${entry.modelChoice}` : ""}
      </div>
    </li>
  );
}

interface AgentPanelProps {
  agent: JevAgentController;
  /** Current progress value; the panel derives each move's delta from it. */
  metric: number;
  /** Renders the log note for one move, from the metric either side of it. */
  formatDelta: (before: number, after: number) => string;
  /** True once the board can no longer be played. */
  finished: boolean;
  /** Shown when the run ends in success. */
  success?: React.ReactNode;
  startLabel?: string;
  idleHint?: string;
  extraStats?: Array<{ label: string; value: string }>;
}

export function AgentPanel({
  agent,
  metric,
  formatDelta,
  finished,
  success,
  startLabel = "Let Jev play",
  idleHint = "Start the agent and the board becomes read-only while Jev plays.",
  extraStats = [],
}: AgentPanelProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Follow the tail as moves land.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [agent.log.length]);

  const moveCount = agent.log.length;
  const averageLatency = moveCount === 0 ? 0 : Math.round(agent.totalLatencyMs / moveCount);

  const stats = [
    { label: "Elapsed", value: formatDuration(agent.elapsedMs) },
    { label: "Moves", value: String(moveCount) },
    { label: "Avg call", value: moveCount === 0 ? "—" : `${averageLatency}ms` },
    ...extraStats,
  ];

  return (
    <aside className="bg-card text-card-foreground flex w-full flex-col gap-4 rounded-2xl border p-4 lg:w-80">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Bot className="size-4" />
            Agent mode
          </h2>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-[0.65rem]">
            {JEV_MODEL}
          </p>
        </div>
        {agent.running ? (
          <Button size="sm" variant="outline" onClick={agent.stop}>
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={agent.start} disabled={finished}>
            <Bot className="size-3.5" />
            {moveCount > 0 ? "Resume" : startLabel}
          </Button>
        )}
      </header>

      {success && moveCount > 0 ? (
        <div className="rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
          {success}
        </div>
      ) : null}

      {agent.error ? (
        <p className="text-destructive bg-destructive/10 rounded-lg p-2 text-xs">{agent.error}</p>
      ) : null}

      <div
        className="grid gap-2 text-center"
        style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 3)}, minmax(0, 1fr))` }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="bg-muted/50 rounded-lg px-2 py-1.5">
            <div className="text-muted-foreground text-[0.6rem] tracking-wider uppercase">
              {stat.label}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="min-h-[5.5rem]">
        {agent.pending ? (
          <Distribution
            probabilities={agent.pending.probabilities}
            chosen={agent.pending.direction}
            legal={agent.pending.legal}
          />
        ) : agent.thinking ? (
          <p className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Jev is evaluating the board…
          </p>
        ) : (
          <p className="text-muted-foreground py-6 text-xs">
            {moveCount > 0
              ? `Stopped after ${moveCount} move${moveCount === 1 ? "" : "s"}.`
              : idleHint}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="text-muted-foreground mb-1 text-[0.6rem] font-semibold tracking-wider uppercase">
          Log
        </h3>
        <ol ref={listRef} className="max-h-64 min-h-[3rem] flex-1 overflow-y-auto pr-1 lg:max-h-none">
          {agent.log.length === 0 ? (
            <li className="text-muted-foreground py-2 text-xs">No moves yet.</li>
          ) : (
            agent.log.map((entry, index) => (
              <LogRow
                key={entry.id}
                entry={entry}
                note={formatDelta(
                  entry.metricBefore,
                  agent.log[index + 1]?.metricBefore ?? metric,
                )}
              />
            ))
          )}
        </ol>
      </div>
    </aside>
  );
}
