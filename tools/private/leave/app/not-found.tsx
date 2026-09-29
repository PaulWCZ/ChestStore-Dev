import { EmptyState } from "@argentic/chest-ui/components";
import { pageLocale } from "../lib/session.ts";
import { catalogue } from "../lib/i18n/index.ts";

export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <main className="page narrow">
      <EmptyState title={t.notFound.title} body={t.notFound.body} headingLevel={1} action={<a className="button quiet" href="/chest">{t.notFound.back}</a>} />
    </main>
  );
}
