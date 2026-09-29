import { EmptyState } from "@argentic/chest-ui/components";
import { catalogue } from "../lib/i18n/index.ts";
import { pageLocale, viewer } from "../lib/session.ts";

// A poll that does not exist, or is not for this member: said plainly, with
// the way back. On the public host (a guest's link turned off, or wrong),
// there is no way into the Chest to offer: whoever sent the link can say.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  if (!(await viewer())) {
    return (
      <main className="page narrow">
        <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.publicBody} />
      </main>
    );
  }
  return (
    <main className="page narrow">
      <EmptyState headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<a className="button" href="/chest">{t.notFound.back}</a>} />
    </main>
  );
}
