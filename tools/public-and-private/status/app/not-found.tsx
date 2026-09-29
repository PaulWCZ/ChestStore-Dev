import { EmptyState } from "@argentic/chest-ui/components";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale, viewer } from "../lib/session.ts";

// A page that does not exist (or an incident removed from the page): the
// way back, to the status page — or to the team's part for a member.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  const member = await viewer();
  return (
    <main className="narrow not-found">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button quiet" href={member ? "/chest" : "/"}>{t.notFound.back}</a>} />
    </main>
  );
}
