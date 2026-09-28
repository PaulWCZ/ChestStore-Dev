import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale, viewer } from "../lib/session.ts";

// Nothing here: back to the jobs for a member, to the careers page for a
// visitor.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  const member = await viewer();
  return (
    <main className="team-page" id="main">
      <div className="empty">
        <h1>{t.notFound.title}</h1>
        <p>{t.notFound.body}</p>
        <a className="button quiet" href={member ? "/chest" : "/"}>{t.notFound.back}</a>
      </div>
    </main>
  );
}
