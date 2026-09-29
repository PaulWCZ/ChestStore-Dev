import { notFound } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { formatDate } from "../../../lib/i18n/index.ts";
import { unmatched } from "../../../lib/messages.ts";
import { viewer } from "../../../lib/session.ts";
import { MailToFile } from "./mail-view.tsx";

// Emails to the jobs mailbox no candidate claimed (a new address, a CV
// forwarded by a friend): a recruiter files each with a candidate, or
// deletes it.
export default async function MailToSort() {
  const v = await viewer();
  if (!v || !can(v.member, "candidates.manage")) notFound();
  const { t, locale, member } = v;
  const sql = db();
  const list = await unmatched(sql, member);
  const candidates = await sql<{ id: string; name: string; email: string; title: string }[]>`
    select c.id, c.name, c.email, j.title from candidates c join jobs j on j.id = c.job_id order by c.created_at desc limit 300`;
  return (
    <div className="narrow">
      <div className="page-head"><h1>{t.mailbox.title}</h1></div>
      <p className="lede-s">{t.mailbox.intro}</p>
      {list.length === 0 ? <div className="empty"><h2>{t.mailbox.emptyTitle}</h2><p>{t.mailbox.emptyBody}</p></div> : (
        <MailToFile
          messages={list.map(m => ({ id: m.id, from: m.fromName ? `${m.fromName} <${m.fromAddress ?? ""}>` : m.fromAddress ?? "", address: (m.fromAddress ?? "").toLowerCase(), subject: m.subject, body: m.body, when: formatDate(m.createdAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), files: m.attachments.map(a => a.name), hasOriginal: m.hasOriginal }))}
          candidates={candidates.map(c => ({ id: String(c.id), label: `${c.name} · ${c.title}`, email: c.email.toLowerCase() }))}
          t={{ mailbox: t.mailbox, errors: t.errors, common: t.common, write: t.write }}
        />
      )}
    </div>
  );
}
