import { viewer } from "../../lib/session.ts";

// A page for managers, asked by someone else (forbidden(), HTTP 403): what
// the page is and where their own time is — the tool itself is theirs.
export default async function Forbidden() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  return (
    <main className="page narrow">
      <div className="empty">
        <h1>{t.managersOnly.title}</h1>
        <p>{t.managersOnly.body}</p>
        <a className="button quiet" href="/chest">{t.notFound.back}</a>
      </div>
    </main>
  );
}
