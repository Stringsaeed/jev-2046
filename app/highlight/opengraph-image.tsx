import { ImageResponse } from "next/og";

import { CodeCard } from "@/lib/og/art";
import { Frame, OG_CONTENT_TYPE, OG_SIZE, ogFonts } from "@/lib/og/frame";

export const alt =
  "Syntax highlighting with no grammar: Row reads as a type after interface and a tag after a left angle bracket.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(
    (
      <Frame
        eyebrow="lab.saeed.sh/highlight"
        title="A highlighter with no grammar"
        blurb="The lexer settles what a regex can. Every remaining word is one typed question, so Row is a type after interface and a tag after a bracket."
        facts={["23 languages", "one question per word"]}
        art={<CodeCard />}
      />
    ),
    { ...size, fonts: ogFonts() },
  );
}
