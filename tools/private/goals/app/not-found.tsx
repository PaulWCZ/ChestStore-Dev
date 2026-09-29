import { MapEmpty } from "../components/map-empty.tsx";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale } from "../lib/session.ts";

export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <main className="public">
      <MapEmpty headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button quiet" href="/chest">{t.notFound.back}</a>} />
    </main>
  );
}
