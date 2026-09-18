"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";

import {
  availableMoves,
  continuePlaying,
  createGame,
  move as applyMove,
  settle,
} from "@/lib/game/engine";
import type { Direction, GameState } from "@/lib/game/types";

/** Slide duration shared by the reducer and the tile animations. */
export const MOVE_DURATION_MS = 130;

const SAVE_KEY = "2048:save";
const SAVE_VERSION = 1;
const MAX_HISTORY = 24;

interface Store {
  game: GameState;
  history: GameState[];
  bestScore: number;
  /** False until localStorage has been read — the board stays empty before that. */
  ready: boolean;
}

type Action =
  | { type: "hydrate"; game: GameState; bestScore: number }
  | { type: "move"; direction: Direction }
  | { type: "settle" }
  | { type: "undo" }
  | { type: "new-game"; seed: number }
  | { type: "continue" };

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case "hydrate":
      return {
        // `gained` is per-move feedback, not saved state — clear it so a restored
        // game does not replay the last "+N" float on load.
        game: { ...action.game, gained: 0 },
        history: [],
        bestScore: Math.max(action.bestScore, action.game.score),
        ready: true,
      };

    case "move": {
      const { game } = store;
      if (!store.ready || game.status !== "playing") return store;

      const next = applyMove(game, action.direction);
      if (next === game) return store;

      return {
        ...store,
        game: next,
        // Undo restores the pre-move board, minus any mid-flight merge leftovers.
        history: [...store.history, settle(game)].slice(-MAX_HISTORY),
        bestScore: Math.max(store.bestScore, next.score),
      };
    }

    case "settle": {
      const settled = settle(store.game);
      return settled === store.game ? store : { ...store, game: settled };
    }

    case "undo": {
      if (store.history.length === 0) return store;
      const history = store.history.slice(0, -1);
      const previous = store.history[store.history.length - 1];
      return { ...store, game: previous, history };
    }

    case "new-game":
      return {
        ...store,
        game: createGame({ size: store.game.size, seed: action.seed }),
        history: [],
        ready: true,
      };

    case "continue": {
      const resumed = continuePlaying(store.game);
      return resumed === store.game ? store : { ...store, game: resumed };
    }

    default:
      return store;
  }
}

function init(size: number): Store {
  // Deterministic and empty so the server and the first client render agree.
  return {
    game: createGame({ size, seed: 0, startTiles: 0 }),
    history: [],
    bestScore: 0,
    ready: false,
  };
}

function isRestorable(value: unknown, size: number): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const game = value as Partial<GameState>;
  return (
    game.size === size &&
    Array.isArray(game.tiles) &&
    game.tiles.length > 0 &&
    typeof game.score === "number" &&
    typeof game.rngState === "number" &&
    typeof game.nextTileId === "number"
  );
}

export interface Game2048Controller {
  state: GameState;
  ready: boolean;
  bestScore: number;
  canUndo: boolean;
  /** Directions that would change the board right now. */
  moves: Direction[];
  move: (direction: Direction) => void;
  newGame: () => void;
  undo: () => void;
  keepPlaying: () => void;
}

export function useGame2048(size = 4): Game2048Controller {
  const [store, dispatch] = useReducer(reducer, size, init);

  // Restore the saved game once, on mount.
  useEffect(() => {
    let game: GameState | null = null;
    let bestScore = 0;

    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          version?: number;
          game?: unknown;
          bestScore?: unknown;
        };
        if (parsed.version === SAVE_VERSION) {
          if (typeof parsed.bestScore === "number") bestScore = parsed.bestScore;
          if (isRestorable(parsed.game, size)) game = settle(parsed.game);
        }
      }
    } catch {
      // Corrupt or unavailable storage just means a fresh game.
    }

    dispatch({
      type: "hydrate",
      game: game ?? createGame({ size, seed: randomSeed() }),
      bestScore,
    });
  }, [size]);

  // Persist after every change, but never before hydration has run.
  useEffect(() => {
    if (!store.ready) return;
    try {
      window.localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: SAVE_VERSION,
          game: settle(store.game),
          bestScore: store.bestScore,
        }),
      );
    } catch {
      // Private mode / quota — the game still plays, it just will not resume.
    }
  }, [store.game, store.bestScore, store.ready]);

  // Retire merge leftovers once their slide has finished.
  useEffect(() => {
    if (store.game.vanished.length === 0) return;
    const timer = setTimeout(
      () => dispatch({ type: "settle" }),
      MOVE_DURATION_MS + 40,
    );
    return () => clearTimeout(timer);
  }, [store.game]);

  const move = useCallback((direction: Direction) => {
    dispatch({ type: "move", direction });
  }, []);

  const newGame = useCallback(() => {
    dispatch({ type: "new-game", seed: randomSeed() });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "undo" });
  }, []);

  const keepPlaying = useCallback(() => {
    dispatch({ type: "continue" });
  }, []);

  const moves = useMemo(
    () => (store.ready ? availableMoves(store.game) : []),
    [store.game, store.ready],
  );

  return {
    state: store.game,
    ready: store.ready,
    bestScore: store.bestScore,
    canUndo: store.history.length > 0,
    moves,
    move,
    newGame,
    undo,
    keepPlaying,
  };
}
