import type { ConnectionsPuzzle } from "./types.ts";

/**
 * Each puzzle deliberately carries traps: a word that reads as if it belongs to
 * another group. That is the point — resolving them needs meaning, not counting.
 */
export const PUZZLES: ConnectionsPuzzle[] = [
  {
    id: "citrus",
    title: "Citrus & co.",
    groups: [
      { name: "Citrus fruits", words: ["LIME", "LEMON", "TANGERINE", "POMELO"] },
      { name: "Shades of red", words: ["CRIMSON", "SCARLET", "RUBY", "CHERRY"] },
      { name: "Chess pieces", words: ["KING", "QUEEN", "BISHOP", "ROOK"] },
      { name: "___ board", words: ["SURF", "KEY", "SKATE", "DASH"] },
    ],
  },
  {
    id: "sole",
    title: "Something fishy",
    groups: [
      { name: "Fish", words: ["BASS", "FLOUNDER", "PIKE", "PERCH"] },
      { name: "Parts of a shoe", words: ["SOLE", "HEEL", "TONGUE", "EYELET"] },
      { name: "Bread types", words: ["RYE", "PITA", "NAAN", "BRIOCHE"] },
      { name: "Musical ___", words: ["CHAIRS", "THEATRE", "NOTE", "SCALE"] },
    ],
  },
  {
    id: "spring",
    title: "Wound up",
    groups: [
      { name: "Meanings of SPRING", words: ["SEASON", "COIL", "LEAP", "WELL"] },
      { name: "Card games", words: ["BRIDGE", "HEARTS", "RUMMY", "CANASTA"] },
      { name: "Parts of a river", words: ["MOUTH", "BANK", "DELTA", "BED"] },
      { name: "Greek letters", words: ["SIGMA", "OMEGA", "THETA", "KAPPA"] },
    ],
  },
];

export function puzzleById(id: string): ConnectionsPuzzle {
  return PUZZLES.find((puzzle) => puzzle.id === id) ?? PUZZLES[0];
}
