import { Game2048 } from "@/components/game/game-2048";

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <Game2048 />
    </main>
  );
}
