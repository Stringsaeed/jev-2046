export type { Direction } from "@/lib/direction";

export interface PuzzleTile {
  /** Equal to `value`: tiles are never created or destroyed, so this is stable. */
  id: number;
  value: number;
  row: number;
  col: number;
  /** Position before the last slide, so the renderer can animate the travel. */
  prevRow: number;
  prevCol: number;
}

export interface PuzzleState {
  size: number;
  tiles: PuzzleTile[];
  /** The empty square. Every legal move slides a neighbouring tile into it. */
  blank: { row: number; col: number };
  moves: number;
  /** Random slides applied from the solved board. The optimal solution is <= this. */
  scrambleDepth: number;
  seed: number;
  rngState: number;
  solved: boolean;
}

export interface CreatePuzzleOptions {
  size?: number;
  seed?: number;
  scrambleDepth?: number;
}
