import { EmptyState } from "@argentic/chest-ui/components";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale } from "../lib/session.ts";

// A poll that does not exist, or is not for this member: said plainly, with
// the way back.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <main className="page narrow">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button" href="/chest">{t.notFound.back}</a>} />
    </main>
  );
}
