import { ImageResponse } from "next/og";

import { AffinityMatrix } from "@/lib/og/art";
import { Frame, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og/frame";

export const alt =
  "A 16 by 16 affinity matrix: Jev scores all 120 word pairs, and code finds the exact best grouping.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <Frame
        eyebrow="lab.saeed.sh/connections"
        title="120 questions, one request"
        blurb="Jev answers one yes/no per pair of words — do these two share a hidden category? Code searches all 2,627,625 groupings and returns the exact best."
        facts={["same-group 0.895", "cross-group 0.138"]}
        art={<AffinityMatrix />}
      />
    ),
    { ...size, fonts: ogFonts() },
  );
}
