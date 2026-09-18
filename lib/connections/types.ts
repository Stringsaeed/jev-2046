export interface PuzzleGroup {
  /** The category these four words share, revealed once the group is found. */
  name: string;
  words: string[];
}

export interface ConnectionsPuzzle {
  id: string;
  title: string;
  /** Exactly four groups of four. */
  groups: PuzzleGroup[];
}

export type GuessResult =
  | { kind: "correct"; name: string; words: string[] }
  | { kind: "one-away"; words: string[] }
  | { kind: "wrong"; words: string[] };

export interface Guess {
  words: string[];
  kind: GuessResult["kind"];
  /** Category name, present only when the guess was correct. */
  name?: string;
}

export interface ConnectionsState {
  puzzleId: string;
  /** Words still in play, in display order. */
  board: string[];
  selected: string[];
  /** Groups found so far, in the order they were found. */
  found: PuzzleGroup[];
  mistakes: number;
  maxMistakes: number;
  status: "playing" | "won" | "lost";
  /** Outcome of the most recent submission. */
  lastResult: GuessResult | null;
  /** Every submission made, with how it turned out. */
  guesses: Guess[];
  seed: number;
}
