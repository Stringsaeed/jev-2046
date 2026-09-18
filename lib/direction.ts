/** The four slide directions, shared by 2048 and the sliding puzzle. */
export type Direction = "up" | "down" | "left" | "right";

/** Reading order. Stable, for iteration that must not depend on UI choices. */
export const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

/** Clockwise from the top — the order the UI lists them in. */
export const DIRECTION_ORDER: Direction[] = ["up", "right", "down", "left"];

export const ARROWS: Record<Direction, string> = {
  up: "↑",
  right: "→",
  down: "↓",
  left: "←",
};

/** Row/column deltas for the direction tiles travel in. */
export const VECTORS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

export const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
