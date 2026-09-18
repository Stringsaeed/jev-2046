"use client";

import { useCallback, useMemo, useReducer } from "react";

import {
  clearSelection,
  createGame,
  revealRemaining,
  shuffleBoard,
  submit,
  submitWords,
  toggle,
} from "@/lib/connections/engine";
import { PUZZLES } from "@/lib/connections/puzzles";
import type { ConnectionsState } from "@/lib/connections/types";

type Action =
  | { type: "toggle"; word: string }
  | { type: "submit" }
  | { type: "submit-words"; words: string[] }
  | { type: "clear" }
  | { type: "shuffle"; seed: number }
  | { type: "new-game"; puzzleId: string; seed: number }
  | { type: "reveal" };

function reducer(state: ConnectionsState, action: Action): ConnectionsState {
  switch (action.type) {
    case "toggle":
      return toggle(state, action.word);
    case "submit":
      return submit(state);
    case "submit-words":
      return submitWords(state, action.words);
    case "clear":
      return clearSelection(state);
    case "shuffle":
      return shuffleBoard(state, action.seed);
    case "new-game":
      return createGame({ puzzleId: action.puzzleId, seed: action.seed });
    case "reveal":
      return revealRemaining(state);
    default:
      return state;
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export interface ConnectionsController {
  state: ConnectionsState;
  /** Serialized board, stable while the board is unchanged. */
  boardKey: string;
  toggle: (word: string) => void;
  submit: () => void;
  submitWords: (words: string[]) => void;
  clear: () => void;
  shuffle: () => void;
  newGame: (puzzleId?: string) => void;
  reveal: () => void;
}

export function useConnections(puzzleId = PUZZLES[0].id): ConnectionsController {
  // A fixed seed keeps the server and first client render identical; the board
  // is static data, so there is nothing to hydrate afterwards.
  const [state, dispatch] = useReducer(reducer, { puzzleId, seed: 1 }, createGame);

  const boardKey = useMemo(() => state.board.join("|"), [state.board]);

  return {
    state,
    boardKey,
    toggle: useCallback((word: string) => dispatch({ type: "toggle", word }), []),
    submit: useCallback(() => dispatch({ type: "submit" }), []),
    submitWords: useCallback(
      (words: string[]) => dispatch({ type: "submit-words", words }),
      [],
    ),
    clear: useCallback(() => dispatch({ type: "clear" }), []),
    shuffle: useCallback(() => dispatch({ type: "shuffle", seed: randomSeed() }), []),
    newGame: useCallback(
      (id?: string) =>
        dispatch({ type: "new-game", puzzleId: id ?? puzzleId, seed: randomSeed() }),
      [puzzleId],
    ),
    reveal: useCallback(() => dispatch({ type: "reveal" }), []),
  };
}
