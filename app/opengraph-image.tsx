import { ImageResponse } from "next/og";

import { Board2048 } from "@/lib/og/art";
import { Frame, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og/frame";

export const alt = "2048 played by Jev, which scores all four moves and picks one.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <Frame
        eyebrow="lab.saeed.sh"
        title="2048, one move at a time"
        blurb="Code scores all four moves. Jev reads the outcomes and picks one. The honest finding: this is the wrong game for a model."
        facts={["typesafe-ai/jev", "Vercel AI Gateway"]}
        art={<Board2048 />}
      />
    ),
    { ...size, fonts: ogFonts() },
  );
}
