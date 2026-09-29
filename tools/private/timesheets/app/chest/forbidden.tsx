import { EmptyState } from "@argentic/chest-ui/components";
import { viewer } from "../../lib/session.ts";

// A page for managers, asked by someone else (forbidden(), HTTP 403): what
// the page is and where their own time is — the tool itself is theirs.
export default async function Forbidden() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  return (
    <div className="page narrow">
      <EmptyState headingLevel={1} title={t.managersOnly.title} body={t.managersOnly.body} action={<a className="button quiet" href="/chest">{t.notFound.back}</a>} />
    </div>
  );
}
