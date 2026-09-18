import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReactElement } from "react";

/**
 * Shared furniture for the three Open Graph images.
 *
 * Satori only lays out with flexbox and resolves no CSS variables, so the
 * palette below is the dark theme from `globals.css` converted to hex once:
 * `oklch(0.145 0 0)` is `#0a0a0a`, `oklch(0.205 0 0)` is `#171717`,
 * `oklch(0.985 0 0)` is `#fafafa`, `oklch(0.708 0 0)` is `#a1a1a1`. Keep these
 * in step with the stylesheet by hand — nothing links them.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export const C = {
  bg: "#0a0a0a",
  card: "#171717",
  fg: "#fafafa",
  muted: "#a1a1a1",
  border: "rgba(255,255,255,0.10)",
  /** `--syn-tag` in dark mode, which is also the affinity matrix's green. */
  green: "#7ee787",
} as const;

/** `.dark` syntax roles from `globals.css`, for the highlighter's card. */
export const SYN = {
  keyword: "#ff7b72",
  type: "#ffa657",
  function: "#d2a8ff",
  property: "#79c0ff",
  constant: "#56d4dd",
  tag: "#7ee787",
  comment: "#8b949e",
  string: "#a5d6ff",
  punctuation: "#8b949e",
  plain: C.fg,
} as const;

// Read once per process rather than per image. The files are committed so a
// build never depends on Google Fonts being reachable.
const [sansRegular, sansSemiBold, mono] = await Promise.all([
  readFile(join(process.cwd(), "assets/GeistSans-Regular.ttf")),
  readFile(join(process.cwd(), "assets/GeistSans-SemiBold.ttf")),
  readFile(join(process.cwd(), "assets/GeistMono-Regular.ttf")),
]);

export function ogFonts() {
  return [
    { name: "Geist", data: sansRegular, weight: 400 as const, style: "normal" as const },
    { name: "Geist", data: sansSemiBold, weight: 600 as const, style: "normal" as const },
    { name: "Geist Mono", data: mono, weight: 400 as const, style: "normal" as const },
  ];
}

export interface FrameProps {
  /** Small mono line above the title, e.g. the route. */
  eyebrow: string;
  title: string;
  /** The one sentence that has to carry the link preview. */
  blurb: string;
  /** Short mono facts along the bottom, joined with a dot. */
  facts: string[];
  /** The page-specific artwork on the right. */
  art: ReactElement;
}

/**
 * The left column is identical across the three images so a reader who sees
 * two of them in a feed reads them as one set; only `art` changes.
 */
export function Frame({ eyebrow, title, blurb, facts, art }: FrameProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: C.bg,
        color: C.fg,
        fontFamily: "Geist",
        padding: 64,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 600,
          height: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 22,
              color: C.muted,
              marginBottom: 20,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: -2.5,
              lineHeight: 1.05,
              marginBottom: 24,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              lineHeight: 1.4,
              color: C.muted,
              maxWidth: 560,
            }}
          >
            {blurb}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 19,
              color: C.muted,
            }}
          >
            {facts.join("  ·  ")}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 19,
              color: C.fg,
              marginTop: 12,
            }}
          >
            lab.saeed.sh
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {art}
      </div>
    </div>
  );
}
