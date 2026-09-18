"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AffinityAnalysis, GuessFeedback } from "@/lib/agent/connections-jev";
import type { CandidateGroup } from "@/lib/connections/cluster";

const DEFAULT_PACE_MS = 650;

interface Plan {
  /** Board this plan was computed for. */
  boardKey: string;
  /** How many verdicts the board had given when this plan was made. */
  rejectedCount: number;
  groups: CandidateGroup[];
}

export interface ConnectionsAgentController {
  running: boolean;
  /** True while the model call is in flight. */
  analysing: boolean;
  analysis: AffinityAnalysis | null;
  /** Groups still queued for submission, most confident first. */
  queue: CandidateGroup[];
  /** Round trips made, which is one per board the agent had to re-read. */
  requests: number;
  error: string | null;
  elapsedMs: number;
  start: () => void;
  stop: () => void;
  /** Affinity the agent assigned to a set of words, if it proposed them. */
  affinityOf: (words: string[]) => number | undefined;
}

interface Options {
  board: string[];
  boardKey: string;
  playable: boolean;
  /** Groupings already submitted and refused, with the board's verdict. */
  rejected: GuessFeedback[];
  onSubmit: (words: string[]) => void;
  paceMs?: number;
  /** Hard cap on model calls, so a stuck agent cannot bill in a loop. */
  maxRequests?: number;
}

const keyOf = (words: string[]) => [...words].sort().join("|");

export function useConnectionsAgent({
  board,
  boardKey,
  playable,
  rejected,
  onSubmit,
  paceMs = DEFAULT_PACE_MS,
  maxRequests = 6,
}: Options): ConnectionsAgentController {
  const [requested, setRequested] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [analysis, setAnalysis] = useState<AffinityAnalysis | null>(null);
  const [attempted, setAttempted] = useState<string[]>([]);
  const [requests, setRequests] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Bumped after each submission so the loop advances even when a wrong guess
  // leaves the board untouched.
  const [step, setStep] = useState(0);

  const running = requested && playable;

  const start = useCallback(() => {
    setPlan(null);
    setAnalysis(null);
    setAttempted([]);
    setRequests(0);
    setError(null);
    setStoppedAt(null);
    setStep(0);
    const at = Date.now();
    setStartedAt(at);
    setNow(at);
    setRequested(true);
  }, []);

  const stop = useCallback(() => {
    setRequested(false);
    setStoppedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);

  // The remaining plan: groups still on the board, not queued twice, and never
  // one the board has already rejected. Not repeating a refuted guess is a rule,
  // so it lives here rather than being re-litigated by the model.
  const rejectedKeys = useMemo(
    () => rejected.map((guess) => keyOf(guess.words)),
    [rejected],
  );

  const usable = useCallback(
    (groups: CandidateGroup[], words: string[], tried: string[]) =>
      groups.filter(
        (group) =>
          !tried.includes(keyOf(group.words)) &&
          !rejectedKeys.includes(keyOf(group.words)) &&
          group.words.every((word) => words.includes(word)),
      ),
    [rejectedKeys],
  );

  const queue = usable(plan?.groups ?? [], board, attempted);

  // A refused guess is new information about the whole board, so the rest of the
  // plan was computed without it and is stale. A *correct* guess only shrinks the
  // board, which leaves the surviving groups just as good — no need to re-read.
  const planIsStale = plan !== null && plan.rejectedCount !== rejected.length;

  const nextGroup = planIsStale ? undefined : queue[0];
  const needsAnalysis = nextGroup === undefined;

  useEffect(() => {
    if (!running) return;

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      // Nothing left to submit from the current plan, so read the board again.
      if (needsAnalysis) {
        if (requests >= maxRequests) {
          setError(`Stopped after ${maxRequests} model calls without solving.`);
          setRequested(false);
          setStoppedAt(Date.now());
          return;
        }
        try {
          const response = await fetch("/api/agent/connections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            // The board's verdicts go with the request: without them a re-read
            // just reproduces the answer that was already refused.
            body: JSON.stringify({ words: board, feedback: rejected }),
            signal: controller.signal,
          });
          const payload = (await response.json()) as AffinityAnalysis & { error?: string };
          if (cancelled) return;

          if (!response.ok) {
            setError(payload.error ?? `Request failed (${response.status}).`);
            setRequested(false);
            setStoppedAt(Date.now());
            return;
          }

          setAnalysis(payload);
          setRequests((count) => count + 1);

          // Re-reading the same board can return the same refuted grouping. If
          // nothing new survives, stop rather than paying for the same answer.
          if (usable(payload.groups, board, []).length === 0) {
            setPlan({ boardKey, rejectedCount: rejected.length, groups: payload.groups });
            setError("Jev proposed only groupings the board has already rejected.");
            setRequested(false);
            setStoppedAt(Date.now());
            return;
          }

          setPlan({ boardKey, rejectedCount: rejected.length, groups: payload.groups });
          setAttempted([]);
          setError(null);
        } catch (cause) {
          if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
          setError(cause instanceof Error ? cause.message : "The agent request failed.");
          setRequested(false);
          setStoppedAt(Date.now());
        }
        return;
      }

      // Let the proposed group sit on screen before committing to it.
      await new Promise((resolve) => setTimeout(resolve, paceMs));
      if (cancelled) return;

      setAttempted((tried) => [...tried, keyOf(nextGroup.words)]);
      setStep((value) => value + 1);
      onSubmit(nextGroup.words);
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    running,
    boardKey,
    step,
    needsAnalysis,
    nextGroup,
    board,
    usable,
    rejected,
    requests,
    maxRequests,
    onSubmit,
    paceMs,
  ]);

  const affinityOf = useCallback(
    (words: string[]) =>
      analysis?.groups.find((group) => keyOf(group.words) === keyOf(words))?.affinity,
    [analysis],
  );

  return {
    running,
    analysing: running && needsAnalysis,
    analysis,
    queue,
    requests,
    error,
    elapsedMs: startedAt === null ? 0 : Math.max(0, (stoppedAt ?? now) - startedAt),
    start,
    stop,
    affinityOf,
  };
}
