import type {
  CreateGameOptions,
  Direction,
  GameState,
  Tile,
} from "./types";

export const WINNING_VALUE = 2048;
export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const VECTORS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

/**
 * mulberry32 — a tiny deterministic PRNG. The cursor lives in `GameState.rngState`
 * so a whole game is reproducible from its seed, which the agent will need for
 * replaying and benchmarking runs.
 */
function nextRandom(state: number): [value: number, nextState: number] {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  a = a | 0;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

function emptyGrid(size: number): (Tile | null)[][] {
  return Array.from({ length: size }, () => Array<Tile | null>(size).fill(null));
}

function toWorkGrid(state: GameState): (Tile | null)[][] {
  const grid = emptyGrid(state.size);
  for (const tile of state.tiles) {
    grid[tile.row][tile.col] = {
      ...tile,
      prevRow: tile.row,
      prevCol: tile.col,
      isNew: false,
      isMerged: false,
    };
  }
  return grid;
}

function gridToTiles(grid: (Tile | null)[][]): Tile[] {
  const tiles: Tile[] = [];
  for (const row of grid) {
    for (const tile of row) {
      if (tile) tiles.push(tile);
    }
  }
  return tiles;
}

function emptyCells(grid: (Tile | null)[][]): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid.length; col += 1) {
      if (!grid[row][col]) cells.push({ row, col });
    }
  }
  return cells;
}

function inBounds(row: number, col: number, size: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function highestValue(tiles: Tile[]): number {
  return tiles.reduce((max, tile) => (tile.value > max ? tile.value : max), 0);
}

/** Places one `2` (90%) or `4` (10%) on a random empty cell, advancing the PRNG. */
function spawnTile(
  grid: (Tile | null)[][],
  rngState: number,
  nextTileId: number,
): { tile: Tile | null; rngState: number; nextTileId: number } {
  const cells = emptyCells(grid);
  if (cells.length === 0) return { tile: null, rngState, nextTileId };

  const [cellRoll, afterCell] = nextRandom(rngState);
  const [valueRoll, afterValue] = nextRandom(afterCell);
  const { row, col } = cells[Math.floor(cellRoll * cells.length)];

  const tile: Tile = {
    id: nextTileId,
    value: valueRoll < 0.9 ? 2 : 4,
    row,
    col,
    prevRow: row,
    prevCol: col,
    isNew: true,
    isMerged: false,
  };
  grid[row][col] = tile;

  return { tile, rngState: afterValue, nextTileId: nextTileId + 1 };
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const { size = 4, seed = Math.floor(Math.random() * 2 ** 31), startTiles = 2 } = options;

  const grid = emptyGrid(size);
  let rngState = seed;
  let nextTileId = 1;

  for (let i = 0; i < startTiles; i += 1) {
    const spawned = spawnTile(grid, rngState, nextTileId);
    rngState = spawned.rngState;
    nextTileId = spawned.nextTileId;
  }

  const tiles = gridToTiles(grid);

  return {
    size,
    tiles,
    vanished: [],
    score: 0,
    gained: 0,
    highest: highestValue(tiles),
    status: "playing",
    keepPlaying: false,
    moves: 0,
    rngState,
    seed,
    nextTileId,
  };
}

/** True when at least one tile can slide or merge in `direction`. */
export function canMove(state: GameState, direction: Direction): boolean {
  const { size } = state;
  const { dr, dc } = VECTORS[direction];
  const grid = emptyGrid(size);
  for (const tile of state.tiles) grid[tile.row][tile.col] = tile;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const tile = grid[row][col];
      if (!tile) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc, size)) continue;
      const neighbour = grid[nr][nc];
      if (!neighbour || neighbour.value === tile.value) return true;
    }
  }
  return false;
}

/** Directions that would change the board. Empty means the game is over. */
export function availableMoves(state: GameState): Direction[] {
  return DIRECTIONS.filter((direction) => canMove(state, direction));
}

export interface MoveOptions {
  /**
   * Whether a new tile appears after the shift. Default true. Pass false to get
   * only the deterministic part of a move — what an agent needs in order to
   * compare directions without a random spawn muddying the comparison.
   */
  spawn?: boolean;
}

/**
 * Applies a move. Pure: returns the *same reference* when nothing shifts, so
 * callers can cheaply detect a no-op with `next === state`.
 */
export function move(
  state: GameState,
  direction: Direction,
  { spawn = true }: MoveOptions = {},
): GameState {
  if (state.status === "lost") return state;

  const { size } = state;
  const { dr, dc } = VECTORS[direction];
  const grid = toWorkGrid(state);

  // Walk the board starting from the edge the tiles are travelling toward, so a
  // tile never jumps over one that has not been resolved yet.
  const rows = Array.from({ length: size }, (_, i) => i);
  const cols = [...rows];
  if (dr > 0) rows.reverse();
  if (dc > 0) cols.reverse();

  const vanished: Tile[] = [];
  let nextTileId = state.nextTileId;
  let gained = 0;
  let moved = false;

  for (const row of rows) {
    for (const col of cols) {
      const tile = grid[row][col];
      if (!tile) continue;

      let r = row;
      let c = col;
      while (inBounds(r + dr, c + dc, size) && !grid[r + dr][c + dc]) {
        r += dr;
        c += dc;
      }

      const tr = r + dr;
      const tc = c + dc;
      const blocker = inBounds(tr, tc, size) ? grid[tr][tc] : null;

      if (blocker && blocker.value === tile.value && !blocker.isMerged) {
        grid[row][col] = null;
        const merged: Tile = {
          id: nextTileId,
          value: tile.value * 2,
          row: tr,
          col: tc,
          prevRow: tr,
          prevCol: tc,
          isNew: false,
          isMerged: true,
        };
        nextTileId += 1;
        grid[tr][tc] = merged;

        // Both sources travel to the merge cell, then the renderer drops them.
        vanished.push({ ...tile, row: tr, col: tc });
        vanished.push({ ...blocker, row: tr, col: tc });

        gained += merged.value;
        moved = true;
      } else if (r !== row || c !== col) {
        grid[row][col] = null;
        tile.row = r;
        tile.col = c;
        grid[r][c] = tile;
        moved = true;
      }
    }
  }

  if (!moved) return state;

  const spawned = spawn
    ? spawnTile(grid, state.rngState, nextTileId)
    : { tile: null, rngState: state.rngState, nextTileId };
  const tiles = gridToTiles(grid);
  const highest = highestValue(tiles);

  const next: GameState = {
    ...state,
    tiles,
    vanished,
    score: state.score + gained,
    gained,
    highest,
    moves: state.moves + 1,
    rngState: spawned.rngState,
    nextTileId: spawned.nextTileId,
    status: "playing",
  };

  if (!state.keepPlaying && highest >= WINNING_VALUE) {
    next.status = "won";
  } else if (availableMoves(next).length === 0) {
    next.status = "lost";
  }

  return next;
}

/** Drops the merge leftovers once their slide animation has played. */
export function settle(state: GameState): GameState {
  if (state.vanished.length === 0) return state;
  return { ...state, vanished: [] };
}

/** Dismisses the win overlay and lets the player carry on past 2048. */
export function continuePlaying(state: GameState): GameState {
  if (state.status !== "won") return state;
  return { ...state, status: "playing", keepPlaying: true };
}

/**
 * Rebuilds a state from a plain value grid. The inverse of `toGrid`, used to
 * revive a board that crossed a process boundary (the agent route receives a
 * grid, not a live GameState).
 */
export function fromGrid(
  grid: number[][],
  init: { score?: number; moves?: number; seed?: number; keepPlaying?: boolean } = {},
): GameState {
  const size = grid.length;
  const tiles: Tile[] = [];
  let nextTileId = 1;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = grid[row][col];
      if (!value) continue;
      tiles.push({
        id: nextTileId,
        value,
        row,
        col,
        prevRow: row,
        prevCol: col,
        isNew: false,
        isMerged: false,
      });
      nextTileId += 1;
    }
  }

  const seed = init.seed ?? 0;

  return {
    size,
    tiles,
    vanished: [],
    score: init.score ?? 0,
    gained: 0,
    highest: highestValue(tiles),
    status: "playing",
    keepPlaying: init.keepPlaying ?? false,
    moves: init.moves ?? 0,
    rngState: seed,
    seed,
    nextTileId,
  };
}

/** Plain value grid (0 = empty) — the shape an agent will reason over. */
export function toGrid(state: GameState): number[][] {
  const grid = Array.from({ length: state.size }, () =>
    Array<number>(state.size).fill(0),
  );
  for (const tile of state.tiles) grid[tile.row][tile.col] = tile.value;
  return grid;
}
