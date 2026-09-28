import { pageLocale } from "../../lib/session.ts";
import { catalogue } from "../../lib/i18n/index.ts";

export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <main className="page narrow">
      <div className="empty">
        <h1>{t.notFound.title}</h1>
        <p>{t.notFound.body}</p>
        <a className="button quiet" href="/chest">{t.notFound.back}</a>
      </div>
    </main>
  );
}
