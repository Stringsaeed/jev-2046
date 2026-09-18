"use client";

import { Bot, Loader2, Square } from "lucide-react";

import { formatDuration } from "@/components/agent/agent-panel";
import { Button } from "@/components/ui/button";
import type { ConnectionsAgentController } from "@/hooks/use-connections-agent";
import { JEV_MODEL } from "@/lib/agent/connections-jev";
import type { ConnectionsState } from "@/lib/connections/types";
import { cn } from "@/lib/utils";

/**
 * The affinity matrix Jev produced, one cell per word pair. This is the whole
 * of the model's contribution — everything below it is code.
 */
function Heatmap({ words, matrix }: { words: string[]; matrix: number[][] }) {
  return (
    <div
      className="grid gap-px"
      style={{ gridTemplateColumns: `repeat(${words.length}, minmax(0, 1fr))` }}
    >
      {matrix.map((row, i) =>
        row.map((probability, j) => (
          <div
            key={`${i}-${j}`}
            title={`${words[i]} · ${words[j]} — ${probability.toFixed(2)}`}
            className={cn("aspect-square rounded-[1px]", i === j && "opacity-30")}
            style={{
              backgroundColor:
                probability >= 0.5
                  ? `color-mix(in oklab, var(--color-emerald-500) ${Math.round(probability * 100)}%, transparent)`
                  : `color-mix(in oklab, var(--color-muted-foreground) ${Math.round(probability * 60)}%, transparent)`,
            }}
          />
        )),
      )}
    </div>
  );
}

interface Props {
  agent: ConnectionsAgentController;
  state: ConnectionsState;
}

export function ConnectionsAgentPanel({ agent, state }: Props) {
  const { analysis } = agent;
  const solved = state.status === "won";
  const finished = state.status !== "playing";

  const stats = [
    { label: "Elapsed", value: formatDuration(agent.elapsedMs) },
    { label: "Requests", value: String(agent.requests) },
    {
      label: "Questions",
      value: analysis ? String(analysis.questionCount) : "—",
    },
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
            {agent.requests > 0 ? "Resume" : "Let Jev group them"}
          </Button>
        )}
      </header>

      {solved && agent.requests > 0 ? (
        <div className="rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="font-semibold">Solved.</span> Jev grouped all sixteen in{" "}
          <span className="font-mono font-semibold">{formatDuration(agent.elapsedMs)}</span>
          {state.mistakes === 0 ? " with no mistakes" : ` with ${state.mistakes} mistakes`}.
        </div>
      ) : null}

      {agent.error ? (
        <p className="text-destructive bg-destructive/10 rounded-lg p-2 text-xs">{agent.error}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-center">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-muted/50 rounded-lg px-2 py-1.5">
            <div className="text-muted-foreground text-[0.6rem] tracking-wider uppercase">
              {stat.label}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {agent.analysing ? (
        <p className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Jev is judging every pair of words…
        </p>
      ) : null}

      {analysis ? (
        <>
          <div>
            <h3 className="text-muted-foreground mb-1.5 text-[0.6rem] font-semibold tracking-wider uppercase">
              Pair affinity · {analysis.questionCount} judgements
            </h3>
            <Heatmap words={analysis.words} matrix={analysis.matrix} />
            <p className="text-muted-foreground mt-1.5 font-mono text-[0.6rem]">
              model {analysis.timing.modelMs}ms · clustered{" "}
              {analysis.partitionsEvaluated.toLocaleString()} partitions in{" "}
              {analysis.timing.clusterMs}ms
              {analysis.partitionsExcluded > 0
                ? ` · ${analysis.partitionsExcluded.toLocaleString()} ruled out by earlier verdicts`
                : ""}
            </p>
          </div>

          <div>
            <h3 className="text-muted-foreground mb-1.5 text-[0.6rem] font-semibold tracking-wider uppercase">
              Proposed groups
            </h3>
            <ul className="space-y-1.5">
              {analysis.groups.map((group, index) => {
                const queued = agent.queue[0]?.words.join("|") === group.words.join("|");
                return (
                  <li
                    key={group.words.join("|")}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-xs",
                      queued ? "bg-emerald-500/10 ring-1 ring-emerald-500/40" : "bg-muted/40",
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted-foreground font-mono text-[0.65rem]">
                        {index + 1}
                      </span>
                      <span className="flex-1 font-medium">{group.words.join(", ")}</span>
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {group.affinity.toFixed(2)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : agent.analysing ? null : (
        <p className="text-muted-foreground py-4 text-xs">
          Jev answers one question per pair of words — 120 of them in a single request — and
          code turns those probabilities into groups.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="text-muted-foreground mb-1 text-[0.6rem] font-semibold tracking-wider uppercase">
          Log
        </h3>
        <ol className="max-h-48 flex-1 overflow-y-auto pr-1 lg:max-h-none">
          {state.guesses.length === 0 ? (
            <li className="text-muted-foreground py-2 text-xs">No guesses yet.</li>
          ) : (
            state.guesses.map((guess, index) => {
              const affinity = agent.affinityOf(guess.words);
              return (
                <li key={index} className="border-border/60 border-b py-1.5 last:border-b-0">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span
                      className={cn(
                        "font-mono font-semibold",
                        guess.kind === "correct"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : guess.kind === "one-away"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-destructive",
                      )}
                    >
                      {guess.kind === "correct" ? "✓" : guess.kind === "one-away" ? "~" : "✕"}
                    </span>
                    <span className="flex-1 text-[0.7rem]">{guess.words.join(", ")}</span>
                    {affinity === undefined ? null : (
                      <span className="text-muted-foreground font-mono text-[0.65rem] tabular-nums">
                        {affinity.toFixed(2)}
                      </span>
                    )}
                  </div>
                  {guess.name ? (
                    <div className="text-muted-foreground pl-5 text-[0.65rem]">{guess.name}</div>
                  ) : null}
                </li>
              );
            })
          )}
        </ol>
      </div>
    </aside>
  );
}
