import { experimental_evaluate as evaluate } from "ai";

// Explicit .ts specifiers: this module is imported both by Next.js and by
// `node index.mts`, and Node's native type stripping does not guess extensions.
import { availableMoves, move, toGrid } from "../game/engine.ts";
import type { Direction, GameState } from "../game/types.ts";

/**
 * Jev is TypeSafe's System One model. It does not generate text: it evaluates
 * shared state against typed questions and returns a choice plus a probability
 * distribution. That is why this uses `evaluate()` and not `generateText()` —
 * the AI Gateway lists `typesafe-ai/jev` with type "evaluation", so the
 * text-generation entry points do not apply to it.
 */
export const JEV_MODEL = "typesafe-ai/jev";

/** Clockwise from the top, matching how a player thinks about the board. */
export const DIRECTION_ORDER: Direction[] = ["up", "right", "down", "left"];

// A type alias, not an interface: only aliases get the implicit index
// signature that lets this be passed straight into Jev's JSON state.
export type MoveOutcome = {
  legal: boolean;
  /** Points the move scores immediately. */
  pointsGained: number;
  /** Number of pairs that combine. */
  merges: number;
  /** Values the merges produce, e.g. [4, 16]. */
  mergedInto: number[];
  emptyCellsAfter: number;
  highestTileAfter: number;
  /** Row/col of the highest tile after the move, or null on an illegal move. */
  highestTileAt: { row: number; col: number } | null;
  /** The board this move would produce. Null when the move is not available. */
  boardAfter: number[][] | null;
};

export interface JevDecision {
  /** The direction to actually play: always legal. */
  direction: Direction;
  /** What Jev picked, before any legality correction. */
  modelChoice: Direction;
  /** Full distribution over all four directions. */
  probabilities: Record<Direction, number>;
  /** How concentrated the distribution is, per TypeSafe. Undefined if absent. */
  confidence: number | undefined;
  legal: Direction[];
  outcomes: Record<Direction, MoveOutcome>;
  /** True when Jev picked an unavailable direction and code corrected it. */
  usedFallback: boolean;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/** The JSON-safe part of a decision, as the agent route returns it. */
export type JevDecisionSummary = Pick<
  JevDecision,
  "direction" | "modelChoice" | "probabilities" | "confidence" | "legal" | "usedFallback" | "usage"
>;

function locate(grid: number[][], value: number): { row: number; col: number } | null {
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      if (grid[row][col] === value) return { row, col };
    }
  }
  return null;
}

function countEmpty(grid: number[][]): number {
  return grid.flat().filter((value) => value === 0).length;
}

/**
 * The rules stay in code. The engine decides what every direction would do, and
 * Jev only judges which of those outcomes is the best position to be in.
 */
export function describeOutcomes(state: GameState): Record<Direction, MoveOutcome> {
  const outcomes = {} as Record<Direction, MoveOutcome>;

  for (const direction of DIRECTION_ORDER) {
    // spawn: false — judge the direction by what it deterministically does,
    // not by where a random new tile happens to land afterwards.
    const next = move(state, direction, { spawn: false });

    if (next === state) {
      outcomes[direction] = {
        legal: false,
        pointsGained: 0,
        merges: 0,
        mergedInto: [],
        emptyCellsAfter: countEmpty(toGrid(state)),
        highestTileAfter: state.highest,
        highestTileAt: null,
        boardAfter: null,
      };
      continue;
    }

    const boardAfter = toGrid(next);
    const mergedInto = next.tiles.filter((tile) => tile.isMerged).map((tile) => tile.value);

    outcomes[direction] = {
      legal: true,
      pointsGained: next.score - state.score,
      merges: mergedInto.length,
      mergedInto: mergedInto.sort((a, b) => b - a),
      emptyCellsAfter: countEmpty(boardAfter),
      highestTileAfter: next.highest,
      highestTileAt: locate(boardAfter, next.highest),
      boardAfter,
    };
  }

  return outcomes;
}

function criterionFor(direction: Direction, outcome: MoveOutcome): string {
  if (!outcome.legal) {
    return `Not available. Swiping ${direction} moves no tile and merges nothing, so the board would be unchanged. Do not pick this.`;
  }

  const parts = [`Available. Swiping ${direction}`];

  if (outcome.merges === 0) {
    parts.push("slides tiles without merging any of them (0 points)");
  } else {
    const list = outcome.mergedInto.join(", ");
    parts.push(
      `merges ${outcome.merges} pair${outcome.merges === 1 ? "" : "s"} into ${list} for ${outcome.pointsGained} points`,
    );
  }

  const at = outcome.highestTileAt;
  parts.push(
    `leaving ${outcome.emptyCellsAfter} empty cells before the new tile appears, with the largest tile (${outcome.highestTileAfter}) at row ${at?.row}, col ${at?.col}`,
  );

  return `${parts.join(", ")}. The resulting board is \`candidates.${direction}.boardAfter\`.`;
}

const INSTRUCTIONS = [
  "Pick the single swipe direction that leaves the strongest position in this game of 2048.",
  "",
  "A strong position keeps the largest tile pinned in one corner, keeps the row or column holding it ordered from largest to smallest so those tiles can still combine with each other, and keeps as many cells empty as possible.",
  "Prefer a direction that merges tiles toward the corner the largest tile already occupies, or that frees space without disturbing it.",
  "Avoid a direction that pulls the largest tile out of its corner, and avoid one that leaves the board nearly full with no equal neighbours left.",
  "A direction that scores fewer points now but keeps that structure intact is better than a bigger merge that breaks it.",
  "",
  "Only a direction marked Available can be played. Row 0 is the top row and column 0 is the left column.",
].join("\n");

/**
 * Asks Jev for one move. All four directions are always offered so the caller
 * gets a full distribution, but unavailable ones are labelled as such and code
 * corrects the answer if Jev picks one anyway.
 */
export async function chooseDirection(state: GameState): Promise<JevDecision> {
  const legal = availableMoves(state);
  if (legal.length === 0) {
    throw new Error("The board has no legal moves left.");
  }

  const outcomes = describeOutcomes(state);
  const grid = toGrid(state);

  const result = await evaluate({
    model: JEV_MODEL,
    state: {
      game: "2048 on a 4x4 grid",
      legend: "0 marks an empty cell. Row 0 is the top row, column 0 is the left column.",
      board: grid,
      score: state.score,
      movesPlayed: state.moves,
      emptyCells: countEmpty(grid),
      highestTile: state.highest,
      highestTileAt: locate(grid, state.highest),
      candidates: outcomes,
    },
    // Jev supports Zero Data Retention, but the gateway rejects the flag on
    // Hobby plans (403 ZdrUnauthorizedError), so it is opt-in rather than on.
    ...(process.env.JEV_ZERO_DATA_RETENTION === "1"
      ? { providerOptions: { gateway: { zeroDataRetention: true } } }
      : {}),
    questions: {
      direction: {
        type: "choice",
        instructions: INSTRUCTIONS,
        criteria: {
          up: criterionFor("up", outcomes.up),
          right: criterionFor("right", outcomes.right),
          down: criterionFor("down", outcomes.down),
          left: criterionFor("left", outcomes.left),
        },
      },
    },
  });

  const answer = result.answers.direction;
  const modelChoice = answer.choice as Direction;

  const probabilities = {} as Record<Direction, number>;
  for (const direction of DIRECTION_ORDER) {
    probabilities[direction] = answer.probabilities?.[direction] ?? 0;
  }

  // Typed output guarantees the shape, not the legality. Fall back to the most
  // likely direction that the rules actually allow.
  const usedFallback = !legal.includes(modelChoice);
  const direction = usedFallback
    ? [...legal].sort((a, b) => probabilities[b] - probabilities[a])[0]
    : modelChoice;

  const confidence = (
    result.providerMetadata?.typesafe as { confidence?: Record<string, number> } | undefined
  )?.confidence?.direction;

  return {
    direction,
    modelChoice,
    probabilities,
    confidence,
    legal,
    outcomes,
    usedFallback,
    usage: result.usage,
  };
}
