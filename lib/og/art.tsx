import { C, SYN } from "./frame.tsx";

/* ---------------------------------------------------------------------------
   Connections: the pair-affinity matrix.

   The real panel renders Jev's 120 judgements as a 16x16 grid. This rebuilds
   the same picture from the citrus board's true grouping, in the scrambled
   order the board shows, so the green blocks sit where they actually sit.
   --------------------------------------------------------------------------- */

/** Board order on screen; the four hidden groups are deliberately interleaved. */
const CITRUS_GROUP_OF = [
  1, 3, 0, 3, // CRIMSON KEY LEMON SKATE
  1, 0, 2, 3, // SCARLET TANGERINE KING DASH
  2, 1, 0, 2, // QUEEN RUBY POMELO ROOK
  3, 1, 0, 2, // SURF CHERRY LIME BISHOP
];

/** Deterministic noise, so the image is byte-identical between builds. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function AffinityMatrix() {
  const random = seeded(2048);
  const n = CITRUS_GROUP_OF.length;
  const cell = 24;
  const gap = 2;

  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const cells = [];
    for (let j = 0; j < n; j += 1) {
      const r = random();
      // Measured on this board: same-group pairs average 0.895, cross-group
      // 0.138. The spread here matches those two clusters.
      const p =
        i === j ? 1 : CITRUS_GROUP_OF[i] === CITRUS_GROUP_OF[j] ? 0.78 + r * 0.21 : 0.02 + r * 0.22;
      cells.push(
        <div
          key={j}
          style={{
            display: "flex",
            width: cell,
            height: cell,
            borderRadius: 3,
            backgroundColor: `rgba(126, 231, 135, ${(0.06 + p * 0.94).toFixed(3)})`,
          }}
        />,
      );
    }
    rows.push(
      <div key={i} style={{ display: "flex", gap }}>
        {cells}
      </div>,
    );
  }

  return <div style={{ display: "flex", flexDirection: "column", gap }}>{rows}</div>;
}

/* ---------------------------------------------------------------------------
   Highlighter: tokens coloured by role.

   `Row` appears twice on purpose — a type after `interface`, a tag after `<` —
   because that is the thing a per-token judgement gets right and a lookup table
   does not.
   --------------------------------------------------------------------------- */

type Tok = [string, string];

const CODE: Tok[][] = [
  [
    ["interface", SYN.keyword],
    [" ", SYN.plain],
    ["Row", SYN.type],
    [" {", SYN.punctuation],
  ],
  [
    ["  label", SYN.property],
    [": ", SYN.punctuation],
    ["string", SYN.type],
    [";", SYN.punctuation],
  ],
  [["}", SYN.punctuation]],
  [],
  [
    ["const", SYN.keyword],
    [" [", SYN.punctuation],
    ["open", SYN.plain],
    [", ", SYN.punctuation],
    ["setOpen", SYN.plain],
    ["] =", SYN.punctuation],
  ],
  [
    ["  ", SYN.plain],
    ["useState", SYN.function],
    ["(", SYN.punctuation],
    ["false", SYN.keyword],
    [");", SYN.punctuation],
  ],
  [],
  [
    ["<", SYN.punctuation],
    ["Row", SYN.tag],
    [" ", SYN.plain],
    ["key", SYN.property],
    ["={", SYN.punctuation],
    ["row", SYN.plain],
    [".", SYN.punctuation],
    ["id", SYN.property],
    ["} />", SYN.punctuation],
  ],
];

export function CodeCard() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 472,
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 28,
        fontFamily: "Geist Mono",
        fontSize: 22,
        lineHeight: 1.55,
      }}
    >
      {CODE.map((line, i) => (
        <div key={i} style={{ display: "flex", height: 34 }}>
          {line.map(([text, color], j) => (
            <div key={j} style={{ display: "flex", flexShrink: 0, color, whiteSpace: "pre" }}>
              {text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   2048: a board mid-game.
   --------------------------------------------------------------------------- */

const BOARD = [
  [2, 8, 32, 4],
  [0, 4, 64, 16],
  [0, 2, 8, 128],
  [0, 0, 4, 256],
];

/** The game's own ramp: empty cells stay near the card, high tiles go light. */
function tileStyle(value: number) {
  if (value === 0) return { bg: "rgba(255,255,255,0.05)", fg: "transparent" };
  const step = Math.min(Math.log2(value) / 9, 1);
  return { bg: `rgba(250, 250, 250, ${(0.10 + step * 0.78).toFixed(3)})`, fg: step > 0.45 ? C.bg : C.fg };
}

export function Board2048() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
      }}
    >
      {BOARD.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 10 }}>
          {row.map((value, j) => {
            const { bg, fg } = tileStyle(value);
            return (
              <div
                key={j}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 96,
                  height: 96,
                  borderRadius: 10,
                  backgroundColor: bg,
                  color: fg,
                  fontSize: value >= 128 ? 34 : 40,
                  fontWeight: 600,
                }}
              >
                {value === 0 ? "" : String(value)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
