import { NoAccess } from "@argentic/chest-ui/components";
import Link from "next/link";
import { viewer } from "../../lib/session.ts";

// A managers' page asked by someone else (forbidden(), HTTP 403): the
// kit's NoAccess, saying what the page is and where their own things are.
// The same answer on every managers' page (tested per route); a thing the
// person may not see at all (someone else's item) stays "not found".
export default async function Forbidden() {
  const v = await viewer();
  if (!v) return null;
  const { t } = v;
  return (
    <div className="narrow">
      <NoAccess title={t.managersOnly.title} body={t.managersOnly.body} action={<Link className="button quiet" href="/chest/mine">{t.managersOnly.back}</Link>} />
    </div>
  );
}
