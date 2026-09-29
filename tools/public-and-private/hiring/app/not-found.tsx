import { EmptyState } from "@argentic/chest-ui/components";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale, viewer } from "../lib/session.ts";

// Nothing here: back to the jobs for a member, to the careers page for a
// visitor.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  const member = await viewer();
  return (
    <main className="lost" id="main">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button quiet" href={member ? "/chest" : "/"}>{t.notFound.back}</a>} />
    </main>
  );
}
