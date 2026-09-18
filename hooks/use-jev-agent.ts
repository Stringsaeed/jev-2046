"use client";

import { useCallback, useEffect, useState } from "react";

import type { Direction } from "@/lib/direction";
import type { JevDecisionSummary } from "@/lib/agent/jev";

/** How long a decision stays on screen before the move is played, in ms. */
const DEFAULT_PACE_MS = 550;

export interface AgentLogEntry {
  id: number;
  /** The move number this decision produced. */
  move: number;
  direction: Direction;
  modelChoice: Direction;
  probabilities: Record<Direction, number>;
  confidence: number | undefined;
  usedFallback: boolean;
  /** Round trip of the model call itself, in ms. */
  latencyMs: number;
  /** Caller-defined progress value as it stood before this move. */
  metricBefore: number;
}

export interface JevAgentController {
  /** True only while the agent actually has the board. */
  running: boolean;
  /** Waiting on a decision, as opposed to showing one. */
  thinking: boolean;
  /** The decision on screen, before it has been played. */
  pending: JevDecisionSummary | null;
  log: AgentLogEntry[];
  error: string | null;
  /** Wall clock across the run. Stops advancing once the agent does. */
  elapsedMs: number;
  /** Time spent inside model calls, as opposed to waiting between moves. */
  totalLatencyMs: number;
  start: () => void;
  stop: () => void;
}

interface Options {
  /** Route that turns a board into a direction. */
  endpoint: string;
  /**
   * The serialized request body. It doubles as the loop key: a new decision is
   * requested exactly when this string changes, so it must contain the board
   * and nothing that churns independently of it.
   */
  body: string;
  /** False once the board is finished, which is what halts the agent. */
  playable: boolean;
  /** Move number the next decision will produce. */
  moveNumber: number;
  /** Progress value logged with each move; the panel renders its delta. */
  metric: number;
  onMove: (direction: Direction) => void;
  paceMs?: number;
  /** Safety net against a policy that cycles instead of converging. */
  maxMoves?: number;
}

export function useJevAgent({
  endpoint,
  body,
  playable,
  moveNumber,
  metric,
  onMove,
  paceMs = DEFAULT_PACE_MS,
  maxMoves,
}: Options): JevAgentController {
  const [requested, setRequested] = useState(false);
  const [pending, setPending] = useState<JevDecisionSummary | null>(null);
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const withinBudget = maxMoves === undefined || log.length < maxMoves;
  const running = requested && playable && withinBudget;

  const start = useCallback(() => {
    setLog([]);
    setPending(null);
    setError(null);
    setStoppedAt(null);
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
    setRequested(true);
  }, []);

  const stop = useCallback(() => {
    setRequested(false);
    setPending(null);
    setStoppedAt(Date.now());
  }, []);

  // Live clock. It stops ticking the moment the agent stops or the board is
  // finished, which is also what freezes the elapsed total.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);

  // One decision per board. Playing the move changes `body`, which runs this
  // effect again — that is the loop.
  useEffect(() => {
    if (!running) return;

    let cancelled = false;
    const controller = new AbortController();

    const play = async () => {
      const requestStartedAt = performance.now();
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        });

        const latencyMs = Math.round(performance.now() - requestStartedAt);
        const payload = (await response.json()) as JevDecisionSummary & { error?: string };
        if (cancelled) return;

        if (!response.ok) {
          setError(payload.error ?? `Request failed (${response.status}).`);
          setRequested(false);
          setStoppedAt(Date.now());
          return;
        }

        setPending(payload);
        setError(null);

        // Hold the distribution on screen so the move stays readable.
        await new Promise((resolve) => setTimeout(resolve, paceMs));
        if (cancelled) return;

        setLog((entries) => [
          ...entries,
          {
            id: entries.length,
            move: moveNumber,
            direction: payload.direction,
            modelChoice: payload.modelChoice,
            probabilities: payload.probabilities,
            confidence: payload.confidence,
            usedFallback: payload.usedFallback,
            latencyMs,
            metricBefore: metric,
          },
        ]);
        setPending(null);
        onMove(payload.direction);
      } catch (cause) {
        if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
        setError(cause instanceof Error ? cause.message : "The agent request failed.");
        setRequested(false);
        setStoppedAt(Date.now());
      }
    };

    void play();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [running, endpoint, body, moveNumber, metric, onMove, paceMs]);

  return {
    running,
    // Between issuing a request and showing its answer there is no pending
    // decision — that gap is exactly "thinking", so it needs no state of its own.
    thinking: running && pending === null,
    pending,
    log,
    error,
    elapsedMs: startedAt === null ? 0 : Math.max(0, (stoppedAt ?? now) - startedAt),
    totalLatencyMs: log.reduce((sum, entry) => sum + entry.latencyMs, 0),
    start,
    stop,
  };
}
