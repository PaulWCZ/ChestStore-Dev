import { EmptyState } from "@argentic/chest-ui/components";
import { pageLocale } from "../../lib/session.ts";
import { catalogue } from "../../lib/i18n/index.ts";

// A page of the members' part that does not exist (or an expense the
// member may not see): said inside the tool's shell, with the way back.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <div className="page">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button quiet" href="/chest">{t.notFound.back}</a>} />
    </div>
  );
}
