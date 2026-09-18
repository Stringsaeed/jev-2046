import { OPPOSITE, VECTORS, type Direction } from "@/lib/direction";
import type { CreatePuzzleOptions, PuzzleState, PuzzleTile } from "./types.ts";

/**
 * A sliding-tile puzzle (the 8-puzzle at size 3, the 15-puzzle at size 4).
 *
 * `direction` always means *the direction a tile travels*, matching 2048: swipe
 * left and the tile to the right of the gap slides left into it. The gap
 * therefore moves the opposite way.
 */

/** Same PRNG as the 2048 engine, so a seed replays a scramble exactly. */
function nextRandom(state: number): [value: number, nextState: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Where a value belongs when solved: 1..n-1 in reading order, gap last. */
export function goalPosition(value: number, size: number): { row: number; col: number } {
  return { row: Math.floor((value - 1) / size), col: (value - 1) % size };
}

export function solvedTiles(size: number): PuzzleTile[] {
  const tiles: PuzzleTile[] = [];
  for (let value = 1; value < size * size; value += 1) {
    const { row, col } = goalPosition(value, size);
    tiles.push({ id: value, value, row, col, prevRow: row, prevCol: col });
  }
  return tiles;
}

export function isSolved(state: PuzzleState): boolean {
  return state.tiles.every((tile) => {
    const goal = goalPosition(tile.value, state.size);
    return tile.row === goal.row && tile.col === goal.col;
  });
}

/** The square whose tile would move if the player swiped `direction`. */
function sourceOf(state: PuzzleState, direction: Direction): { row: number; col: number } {
  const { dr, dc } = VECTORS[direction];
  return { row: state.blank.row - dr, col: state.blank.col - dc };
}

export function canSlide(state: PuzzleState, direction: Direction): boolean {
  const { row, col } = sourceOf(state, direction);
  return row >= 0 && row < state.size && col >= 0 && col < state.size;
}

export function availableSlides(state: PuzzleState): Direction[] {
  return (["up", "right", "down", "left"] as Direction[]).filter((direction) =>
    canSlide(state, direction),
  );
}

/**
 * Slides one tile. Pure: returns the same reference when the move is not legal,
 * so a no-op is free to detect.
 */
export function slide(state: PuzzleState, direction: Direction): PuzzleState {
  if (state.solved || !canSlide(state, direction)) return state;

  const source = sourceOf(state, direction);
  const tiles = state.tiles.map((tile) =>
    tile.row === source.row && tile.col === source.col
      ? {
          ...tile,
          row: state.blank.row,
          col: state.blank.col,
          prevRow: tile.row,
          prevCol: tile.col,
        }
      : { ...tile, prevRow: tile.row, prevCol: tile.col },
  );

  const next: PuzzleState = {
    ...state,
    tiles,
    blank: source,
    moves: state.moves + 1,
    solved: false,
  };
  next.solved = isSolved(next);
  return next;
}

/** Sum over tiles of the distance to where each belongs. Zero exactly when solved. */
export function manhattan(state: PuzzleState): number {
  return state.tiles.reduce((total, tile) => {
    const goal = goalPosition(tile.value, state.size);
    return total + Math.abs(tile.row - goal.row) + Math.abs(tile.col - goal.col);
  }, 0);
}

export function tilesInPlace(state: PuzzleState): number {
  return state.tiles.filter((tile) => {
    const goal = goalPosition(tile.value, state.size);
    return tile.row === goal.row && tile.col === goal.col;
  }).length;
}

/** Plain grid, 0 for the gap. The shape the agent reasons over. */
export function toGrid(state: PuzzleState): number[][] {
  const grid = Array.from({ length: state.size }, () => Array<number>(state.size).fill(0));
  for (const tile of state.tiles) grid[tile.row][tile.col] = tile.value;
  return grid;
}

export function fromGrid(grid: number[][], init: { moves?: number; scrambleDepth?: number } = {}): PuzzleState {
  const size = grid.length;
  const tiles: PuzzleTile[] = [];
  let blank = { row: size - 1, col: size - 1 };

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = grid[row][col];
      if (value === 0) {
        blank = { row, col };
        continue;
      }
      tiles.push({ id: value, value, row, col, prevRow: row, prevCol: col });
    }
  }

  const state: PuzzleState = {
    size,
    tiles,
    blank,
    moves: init.moves ?? 0,
    scrambleDepth: init.scrambleDepth ?? 0,
    seed: 0,
    rngState: 0,
    solved: false,
  };
  state.solved = isSolved(state);
  return state;
}

/**
 * Scrambles from the solved board with `scrambleDepth` random legal slides,
 * never immediately undoing the previous one. Walking backwards from the goal
 * guarantees the board is solvable — half of all arrangements are not — and
 * bounds the optimal solution at `scrambleDepth` moves.
 */
export function createPuzzle(options: CreatePuzzleOptions = {}): PuzzleState {
  const {
    size = 3,
    seed = Math.floor(Math.random() * 2 ** 31),
    scrambleDepth = 12,
  } = options;

  let state: PuzzleState = {
    size,
    tiles: solvedTiles(size),
    blank: { row: size - 1, col: size - 1 },
    moves: 0,
    scrambleDepth,
    seed,
    rngState: seed,
    solved: true,
  };

  let rngState = seed;
  let previous: Direction | null = null;

  for (let step = 0; step < scrambleDepth; step += 1) {
    const choices = availableSlides(state).filter(
      (direction) => previous === null || direction !== OPPOSITE[previous],
    );
    const [roll, nextRngState] = nextRandom(rngState);
    rngState = nextRngState;

    const direction = choices[Math.floor(roll * choices.length)];
    // `slide` refuses to move a solved board, so scramble through a raw step.
    state = { ...slide({ ...state, solved: false }, direction), scrambleDepth };
    previous = direction;
  }

  return {
    ...state,
    moves: 0,
    rngState,
    seed,
    tiles: state.tiles.map((tile) => ({ ...tile, prevRow: tile.row, prevCol: tile.col })),
    solved: isSolved(state),
  };
}
