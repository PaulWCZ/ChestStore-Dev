import { Contours } from "../components/contours.tsx";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale } from "../lib/session.ts";

export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <main className="public">
      <div className="empty">
        <Contours variant="small" />
        <h1>{t.notFound.title}</h1>
        <p>{t.notFound.body}</p>
        <a className="button quiet" href="/chest">{t.notFound.back}</a>
      </div>
    </main>
  );
}
