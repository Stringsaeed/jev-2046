export type Direction = "up" | "down" | "left" | "right";

export type GameStatus = "playing" | "won" | "lost";

export interface Tile {
  /** Stable identity across moves — the renderer keys on this to animate slides. */
  id: number;
  value: number;
  row: number;
  col: number;
  /** Position before the most recent move; equal to row/col when the tile did not travel. */
  prevRow: number;
  prevCol: number;
  /** Spawned by the most recent move. */
  isNew: boolean;
  /** Produced by a merge during the most recent move. */
  isMerged: boolean;
}

export interface GameState {
  size: number;
  /** Tiles currently on the board. */
  tiles: Tile[];
  /** Tiles eaten by a merge on the last move, parked at the merge destination. */
  vanished: Tile[];
  score: number;
  /** Points earned by the last move. */
  gained: number;
  /** Highest tile value on the board. */
  highest: number;
  status: GameStatus;
  /** Set once the player dismisses the win overlay and chooses to continue. */
  keepPlaying: boolean;
  moves: number;
  /** Serializable PRNG cursor — the same seed always replays the same game. */
  rngState: number;
  seed: number;
  nextTileId: number;
}

export interface CreateGameOptions {
  size?: number;
  seed?: number;
  /** Number of tiles placed on a fresh board. */
  startTiles?: number;
}
