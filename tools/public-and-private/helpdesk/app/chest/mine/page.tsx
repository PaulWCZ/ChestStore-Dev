import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import Link from "next/link";
import { StateBadge } from "../../../components/badges.tsx";
import { Reply } from "../../../components/icons.tsx";
import { db } from "../../../lib/db.ts";
import { format, relative } from "../../../lib/i18n/index.ts";
import { viewer } from "../../../lib/session.ts";
import { myRequests } from "../../../lib/tickets.ts";

// My requests: what this member asked the team (with a team form of
// Forms), newest first, the closed ones last — their own tickets only,
// whatever their role. Each opens their view of it: the answers, never the
// team's notes.
export default async function MyRequestsPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const rows = await myRequests(db(), member);
  const w = t.mine;
  const now = new Date();
  // Requests are sent with a form of Forms: the way there, when it is
  // installed on this Chest.
  const forms = chest.toolLink("forms", "/chest");
  return (
    <>
      <PageHeader size="m" title={w.title} />
      {rows.length === 0 ? (
        <EmptyState icon={<Reply />} title={w.emptyTitle} body={w.emptyBody} action={forms ? <a className="ck-button" href={forms}>{w.openForms}</a> : undefined} />
      ) : (
        <ul className="tickets" aria-label={w.list}>
          {rows.map(r => (
            <li key={r.number}>
              <Link className="ticket-row mine" href={`/chest/mine/${r.number}`}>
                <span className="subject"><span>{r.subject}</span></span>
                <span className="meta">
                  <span className="num">#{r.number}</span>
                  <StateBadge status={r.status} label={t.public.statuses[r.status]} />
                </span>
                <span className="preview"><time dateTime={r.updatedAt}>{format(w.updated, { when: relative(r.updatedAt, locale, now) })}</time></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
