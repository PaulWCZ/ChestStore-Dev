import { EmptyState } from "@argentic/chest-ui/components";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale, viewer } from "../lib/session.ts";

export default async function NotFound() {
  const t = catalogue(await pageLocale());
  // "Back to the desk" only for a member: a visitor has no desk.
  const member = await viewer();
  return (
    <main className="page narrow">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={member ? <a className="button quiet" href="/chest">{t.notFound.back}</a> : undefined} />
    </main>
  );
}
