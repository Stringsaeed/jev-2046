import { VECTORS, type Direction } from "@/lib/direction";
import { goalPosition, toGrid } from "./engine.ts";
import type { PuzzleState } from "./types.ts";

/**
 * Exact optimal solver, so the demo can report how far off Jev was rather than
 * guessing. IDA* with the Manhattan heuristic: admissible, so the first
 * solution found is optimal. The 8-puzzle's whole state space is 181,440
 * positions and the worst case is 31 moves, which this searches in milliseconds.
 */

const SEARCH_CEILING = 40;

function manhattanOf(grid: number[][], size: number): number {
  let total = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = grid[row][col];
      if (value === 0) continue;
      const goal = goalPosition(value, size);
      total += Math.abs(row - goal.row) + Math.abs(col - goal.col);
    }
  }
  return total;
}

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const ORDER: Direction[] = ["up", "right", "down", "left"];

export interface OptimalSolution {
  moves: Direction[];
  /** Number of moves in the shortest solution. */
  length: number;
}

/**
 * Returns the shortest sequence of slides that solves the board, or null when
 * the search ceiling is hit. `direction` is the direction a tile travels, the
 * same convention the engine uses.
 */
export function solveOptimally(state: PuzzleState): OptimalSolution | null {
  const size = state.size;
  const grid = toGrid(state);
  let blank = { ...state.blank };

  const heuristic = manhattanOf(grid, size);
  if (heuristic === 0) return { moves: [], length: 0 };

  const path: Direction[] = [];

  /** Returns 0 on success, otherwise the smallest f-value that exceeded the bound. */
  const search = (depth: number, h: number, bound: number, last: Direction | null): number => {
    const f = depth + h;
    if (f > bound) return f;
    if (h === 0) return 0;

    let nextBound = Infinity;

    for (const direction of ORDER) {
      if (last !== null && direction === OPPOSITE[last]) continue;

      const { dr, dc } = VECTORS[direction];
      // The tile that moves sits opposite the direction of travel.
      const from = { row: blank.row - dr, col: blank.col - dc };
      if (from.row < 0 || from.row >= size || from.col < 0 || from.col >= size) continue;

      const value = grid[from.row][from.col];
      const goal = goalPosition(value, size);
      const before = Math.abs(from.row - goal.row) + Math.abs(from.col - goal.col);
      const after = Math.abs(blank.row - goal.row) + Math.abs(blank.col - goal.col);

      grid[blank.row][blank.col] = value;
      grid[from.row][from.col] = 0;
      const previousBlank = blank;
      blank = from;
      path.push(direction);

      const result = search(depth + 1, h - before + after, bound, direction);

      if (result === 0) return 0;
      if (result < nextBound) nextBound = result;

      path.pop();
      blank = previousBlank;
      grid[from.row][from.col] = value;
      grid[blank.row][blank.col] = 0;
    }

    return nextBound;
  };

  let bound = heuristic;
  while (bound <= SEARCH_CEILING) {
    const result = search(0, heuristic, bound, null);
    if (result === 0) return { moves: [...path], length: path.length };
    if (result === Infinity) return null;
    bound = result;
  }

  return null;
}

/** Shortest solution length, or null if the search ceiling is hit. */
export function optimalMoves(state: PuzzleState): number | null {
  return solveOptimally(state)?.length ?? null;
}
