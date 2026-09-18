import { experimental_evaluate as evaluate } from "ai";

import {
  clusterByAffinity,
  type CandidateGroup,
  type PartitionConstraint,
} from "../connections/cluster.ts";

/**
 * Asks Jev for the semantic half of a word-grouping puzzle.
 *
 * The model is never asked to solve the puzzle. It answers one narrow question
 * per pair of words — "do these two share a hidden category?" — and returns a
 * probability for each. Code turns that affinity matrix into the actual
 * partition, which is combinatorics rather than judgment.
 *
 * All pairs go in a single request: Jev evaluates every question against the
 * same shared state in parallel, so 120 questions cost one round trip.
 */

export const JEV_MODEL = "typesafe-ai/jev";

/** What the board said about a grouping the agent already submitted. */
export interface GuessFeedback {
  words: string[];
  kind: "one-away" | "wrong";
}

export interface PairJudgement {
  a: string;
  b: string;
  probability: number;
}

export interface AffinityAnalysis {
  words: string[];
  /** Symmetric, 1 on the diagonal. `matrix[i][j]` = P(same group). */
  matrix: number[][];
  /** The exact best partition, most confident group first. */
  groups: CandidateGroup[];
  pairs: PairJudgement[];
  questionCount: number;
  partitionsEvaluated: number;
  /** Partitions the board's own verdicts ruled out before scoring. */
  partitionsExcluded: number;
  /** Milliseconds spent in the model call and in clustering, separately. */
  timing: { modelMs: number; clusterMs: number };
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

function questionFor(a: string, b: string, groupCount: number, groupSize: number) {
  return {
    type: "boolean" as const,
    instructions: `This puzzle hides ${groupCount} groups of ${groupSize} words. Do ${a} and ${b} belong to the SAME hidden group?`,
    criteria: {
      true: `${a} and ${b} share one specific category that also covers exactly ${groupSize - 2} other words in the list.`,
      false: `${a} and ${b} are only loosely related, or they belong to different categories. A word that merely looks like it fits another group belongs to its own.`,
    },
  };
}

/**
 * One request per board. `words` is what is still in play, and `feedback`
 * carries what the board already said about rejected guesses — the same signal
 * a human player gets. Without it a re-read just repeats the first answer.
 */
export async function analyseAffinity(
  words: string[],
  { groupSize = 4, feedback = [] }: { groupSize?: number; feedback?: GuessFeedback[] } = {},
): Promise<AffinityAnalysis> {
  const groupCount = words.length / groupSize;
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new Error(`${words.length} words do not divide into groups of ${groupSize}.`);
  }

  const questions: Record<string, ReturnType<typeof questionFor>> = {};
  const index: Array<[number, number]> = [];

  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      questions[`p${i}_${j}`] = questionFor(words[i], words[j], groupCount, groupSize);
      index.push([i, j]);
    }
  }

  // Code keeps the record of what has been refuted; the model only has to read
  // it. "One away" is the strongest clue in the game — it says exactly three of
  // those four belong together, so one of them is the intruder.
  const rejectedGroupings = feedback.map((guess) => ({
    words: guess.words,
    verdict:
      guess.kind === "one-away"
        ? `Exactly ${groupSize - 1} of these ${groupSize} share a category. One of them belongs to a different group.`
        : `These ${groupSize} do not form a group. At least two of them belong to different groups.`,
  }));

  const modelStartedAt = performance.now();
  const result = await evaluate({
    model: JEV_MODEL,
    state: {
      task: `Group these ${words.length} words into ${groupCount} hidden categories of ${groupSize}.`,
      words,
      note: "Some words look like they fit more than one category. Exactly one grouping uses every word once, so a word that obviously fits two groups usually belongs to the less obvious one.",
      ...(rejectedGroupings.length > 0
        ? {
            alreadyRejected: rejectedGroupings,
            rejectedNote:
              "These groupings were submitted and refused. Any answer must be consistent with every verdict above.",
          }
        : {}),
    },
    questions,
  });
  const modelMs = Math.round(performance.now() - modelStartedAt);

  const matrix: number[][] = words.map((_, i) => words.map((__, j): number => (i === j ? 1 : 0)));
  const pairs: PairJudgement[] = [];

  for (const [i, j] of index) {
    const answer = result.answers[`p${i}_${j}`];
    // Every question here is a boolean, but the union has to be narrowed.
    const probability = answer.type === "boolean" ? answer.probability : 0;
    matrix[i][j] = probability;
    matrix[j][i] = probability;
    pairs.push({ a: words[i], b: words[j], probability });
  }

  // The verdicts are logical facts, so they prune the search rather than being
  // re-derived by the model.
  const constraints: PartitionConstraint[] = feedback.map((guess) => ({
    words: guess.words,
    kind: guess.kind,
  }));

  const clusterStartedAt = performance.now();
  const clustering = clusterByAffinity(words, matrix, groupSize, constraints);
  const clusterMs = Math.round(performance.now() - clusterStartedAt);

  return {
    words,
    matrix,
    groups: clustering.groups,
    pairs,
    questionCount: index.length,
    partitionsEvaluated: clustering.evaluated,
    partitionsExcluded: clustering.excluded,
    timing: { modelMs, clusterMs },
    usage: result.usage,
  };
}
