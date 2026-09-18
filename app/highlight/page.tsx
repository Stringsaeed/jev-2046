import { CodeHighlighter } from "@/components/highlight/code-highlighter";

export const metadata = {
  title: "Highlighter · Jev",
  description: "Jev classifies the language, then classifies every token in it.",
};

export default function HighlightPage() {
  return (
    <main className="flex flex-1 justify-center p-4 sm:p-8">
      <CodeHighlighter />
    </main>
  );
}
