import { words } from "../lib/session.ts";

// The public host's front page: forms are reached by their own address.
export default async function Home() {
  const t = await words();
  return (
    <main className="page public">
      <h1>{t.appName}</h1>
      <p>{t.home.intro}</p>
    </main>
  );
}
