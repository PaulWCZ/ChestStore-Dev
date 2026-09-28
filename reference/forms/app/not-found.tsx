import { words } from "../lib/session.ts";

export default async function NotFound() {
  const t = await words();
  return (
    <main className="page public">
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.body}</p>
    </main>
  );
}
