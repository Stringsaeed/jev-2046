/**
 * Turns Jev's pairwise affinity scores into four groups of four.
 *
 * This is the code half of the split: the model supplies semantic affinity that
 * no amount of code can compute, and code does the combinatorics it is far
 * better at. There are 16!/(4!^4 · 4!) = 2,627,625 ways to split 16 words into
 * four unordered groups of four, so this finds the exact best partition rather
 * than greedily peeling off the strongest group and hoping.
 *
 * Groups are held as 16-bit masks and every 4-subset's score is computed once up
 * front, which leaves the search itself as bit operations and additions.
 */

/**
 * What the board said about a grouping that was already submitted. These are
 * hard logical facts, not preferences, so they filter the search rather than
 * nudging a score — and they are applied here in code rather than being handed
 * back to the model to re-derive.
 */
export interface PartitionConstraint {
  words: string[];
  /** "one-away" means exactly groupSize-1 of these share a group. */
  kind: "one-away" | "wrong";
}

export interface CandidateGroup {
  words: string[];
  /** Mean pairwise affinity inside the group, in [0, 1]. */
  affinity: number;
}

export interface Clustering {
  groups: CandidateGroup[];
  /** Total within-group affinity of the winning partition. */
  score: number;
  /** Complete partitions examined. */
  evaluated: number;
  /** Partitions ruled out by a verdict the board had already given. */
  excluded: number;
  /** True when the verdicts admitted no partition and were therefore ignored. */
  constraintsRelaxed: boolean;
}

function meanAffinity(matrix: number[][], group: number[]): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      total += matrix[group[i]][group[j]];
      pairs += 1;
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

/**
 * `matrix[i][j]` is the probability that words i and j share a category. The
 * word count must divide evenly into groups of `groupSize`.
 */
function popcount(value: number): number {
  let v = value - ((value >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export function clusterByAffinity(
  words: string[],
  matrix: number[][],
  groupSize = 4,
  constraints: PartitionConstraint[] = [],
): Clustering {
  const n = words.length;
  if (n === 0 || n % groupSize !== 0) {
    return { groups: [], score: 0, evaluated: 0, excluded: 0, constraintsRelaxed: false };
  }

  // Every group of `groupSize`, bucketed by its lowest member. Anchoring each
  // step on the lowest remaining word visits each partition exactly once.
  const byLowest: Array<{ mask: number; members: number[]; affinity: number }[]> = Array.from(
    { length: n },
    () => [],
  );

  const build = (start: number, members: number[], mask: number) => {
    if (members.length === groupSize) {
      byLowest[members[0]].push({ mask, members: [...members], affinity: meanAffinity(matrix, members) });
      return;
    }
    for (let i = start; i < n; i += 1) {
      members.push(i);
      build(i + 1, members, mask | (1 << i));
      members.pop();
    }
  };
  build(0, [], 0);

  // Each verdict becomes a bitmask plus the overlap it permits with any group.
  const rules = constraints
    .map((constraint) => {
      let mask = 0;
      for (const word of constraint.words) {
        const index = words.indexOf(word);
        if (index === -1) return null;
        mask |= 1 << index;
      }
      return { mask, kind: constraint.kind };
    })
    .filter((rule): rule is { mask: number; kind: PartitionConstraint["kind"] } => rule !== null);

  const full = (1 << n) - 1;
  const chosen: number[][] = [];
  const chosenMasks: number[] = [];

  let bestScore = -Infinity;
  let bestGroups: number[][] = [];
  let evaluated = 0;
  let excluded = 0;

  /** A partition is admissible only if every verdict still holds for it. */
  const satisfiesRules = (): boolean => {
    for (const rule of rules) {
      let best = 0;
      for (const mask of chosenMasks) {
        const overlap = popcount(rule.mask & mask);
        if (overlap > best) best = overlap;
      }
      // "One away" says exactly one word was the intruder; "wrong" says the best
      // group covered at most groupSize-2 of them.
      if (rule.kind === "one-away" ? best !== groupSize - 1 : best > groupSize - 2) return false;
    }
    return true;
  };

  const walk = (remaining: number, score: number, applyRules: boolean) => {
    if (remaining === 0) {
      evaluated += 1;
      if (applyRules && !satisfiesRules()) {
        excluded += 1;
        return;
      }
      if (score > bestScore) {
        bestScore = score;
        bestGroups = chosen.map((group) => [...group]);
      }
      return;
    }

    const lowest = 31 - Math.clz32(remaining & -remaining);
    for (const candidate of byLowest[lowest]) {
      if ((candidate.mask & remaining) !== candidate.mask) continue;
      chosen.push(candidate.members);
      chosenMasks.push(candidate.mask);
      walk(remaining & ~candidate.mask, score + candidate.affinity, applyRules);
      chosen.pop();
      chosenMasks.pop();
    }
  };

  walk(full, 0, rules.length > 0);

  // Verdicts should never rule out every arrangement, but if they do, an answer
  // beats no answer: fall back to the unconstrained best.
  const constraintsRelaxed = bestGroups.length === 0 && rules.length > 0;
  if (constraintsRelaxed) {
    evaluated = 0;
    excluded = 0;
    walk(full, 0, false);
  }

  const groups: CandidateGroup[] = bestGroups
    .map((group) => ({
      words: group.map((index) => words[index]),
      affinity: meanAffinity(matrix, group),
    }))
    // Most confident group first: that is the one worth submitting.
    .sort((a, b) => b.affinity - a.affinity);

  return {
    groups,
    score: bestScore === -Infinity ? 0 : bestScore,
    evaluated,
    excluded,
    constraintsRelaxed,
  };
}
