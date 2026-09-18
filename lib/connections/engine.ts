import { puzzleById } from "./puzzles.ts";
import type { ConnectionsPuzzle, ConnectionsState, Guess, GuessResult, PuzzleGroup } from "./types.ts";

export const GROUP_SIZE = 4;
export const MAX_MISTAKES = 4;

/** Same PRNG as the other engines: a seed replays a shuffle exactly. */
function nextRandom(state: number): [value: number, nextState: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function shuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let rngState = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const [roll, next] = nextRandom(rngState);
    rngState = next;
    const j = Math.floor(roll * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function allWords(puzzle: ConnectionsPuzzle): string[] {
  return puzzle.groups.flatMap((group) => group.words);
}

export function createGame(
  options: { puzzleId?: string; seed?: number } = {},
): ConnectionsState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const puzzle = puzzleById(options.puzzleId ?? "citrus");

  return {
    puzzleId: puzzle.id,
    board: shuffle(allWords(puzzle), seed),
    selected: [],
    found: [],
    mistakes: 0,
    maxMistakes: MAX_MISTAKES,
    status: "playing",
    lastResult: null,
    guesses: [],
    seed,
  };
}

/** Adds or removes a word from the selection, capped at four. */
export function toggle(state: ConnectionsState, word: string): ConnectionsState {
  if (state.status !== "playing" || !state.board.includes(word)) return state;

  if (state.selected.includes(word)) {
    return { ...state, selected: state.selected.filter((w) => w !== word), lastResult: null };
  }
  if (state.selected.length >= GROUP_SIZE) return state;
  return { ...state, selected: [...state.selected, word], lastResult: null };
}

export function clearSelection(state: ConnectionsState): ConnectionsState {
  return state.selected.length === 0 ? state : { ...state, selected: [], lastResult: null };
}

export function shuffleBoard(state: ConnectionsState, seed: number): ConnectionsState {
  return { ...state, board: shuffle(state.board, seed) };
}

/** How many of a guess's words sit in the group it overlaps most. */
function bestOverlap(puzzle: ConnectionsPuzzle, words: string[]): { group: PuzzleGroup; hits: number } {
  let best = { group: puzzle.groups[0], hits: -1 };
  for (const group of puzzle.groups) {
    const hits = words.filter((word) => group.words.includes(word)).length;
    if (hits > best.hits) best = { group, hits };
  }
  return best;
}

/**
 * Submits the current selection. A guess is correct only when all four words
 * belong to one group; three out of four reports "one away", which is the hint
 * the player actually gets.
 */
export function submit(state: ConnectionsState): ConnectionsState {
  if (state.status !== "playing" || state.selected.length !== GROUP_SIZE) return state;

  const puzzle = puzzleById(state.puzzleId);
  const words = [...state.selected];
  const { group, hits } = bestOverlap(puzzle, words);

  if (hits === GROUP_SIZE) {
    const found = [...state.found, group];
    const result: GuessResult = { kind: "correct", name: group.name, words };
    const guess: Guess = { words, kind: "correct", name: group.name };
    return {
      ...state,
      board: state.board.filter((word) => !group.words.includes(word)),
      selected: [],
      found,
      lastResult: result,
      guesses: [...state.guesses, guess],
      status: found.length === puzzle.groups.length ? "won" : "playing",
    };
  }

  const mistakes = state.mistakes + 1;
  const kind = hits === GROUP_SIZE - 1 ? "one-away" : "wrong";
  const result: GuessResult = { kind, words };

  return {
    ...state,
    selected: [],
    mistakes,
    lastResult: result,
    guesses: [...state.guesses, { words, kind }],
    status: mistakes >= state.maxMistakes ? "lost" : "playing",
  };
}

/** Selects an exact set of words and submits them in one step, for the agent. */
export function submitWords(state: ConnectionsState, words: string[]): ConnectionsState {
  if (state.status !== "playing") return state;
  if (words.length !== GROUP_SIZE) return state;
  if (!words.every((word) => state.board.includes(word))) return state;
  return submit({ ...state, selected: [...words] });
}

/** Reveals the rest, used when the player runs out of mistakes. */
export function revealRemaining(state: ConnectionsState): ConnectionsState {
  const puzzle = puzzleById(state.puzzleId);
  const remaining = puzzle.groups.filter(
    (group) => !state.found.some((found) => found.name === group.name),
  );
  return { ...state, board: [], selected: [], found: [...state.found, ...remaining] };
}
