import { Connections } from "@/components/connections/connections";

export const metadata = {
  title: "Connections · Jev",
  description: "Jev groups sixteen words into four hidden categories.",
};

export default function ConnectionsPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <Connections />
    </main>
  );
}
