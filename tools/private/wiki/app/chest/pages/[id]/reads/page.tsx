import { StatusBadge } from "@argentic/chest-ui/components";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back, Download } from "../../../../../components/icons.tsx";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { format, formatDate, relative } from "../../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { mailNow } from "../../../../../lib/mail.ts";
import { report } from "../../../../../lib/reads.ts";
import { viewer } from "../../../../../lib/session.ts";
import { ReadsActions } from "./reads-actions.tsx";

// Who has read a page its editors asked people to confirm: how many
// confirmed the current version, then each person — not yet, an older
// version, done — with the date; the table to download; ask again after a
// change; stop asking.
export default async function ReadsPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  let found: Awaited<ReturnType<typeof report>>;
  try {
    found = await report(db(), member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const { page, ask, rows } = found;
  const who = await people([...rows.map(r => r.memberId), ...(ask.by ? [ask.by] : [])]);
  const now = new Date();
  const done = rows.filter(r => r.current).length;
  return (
    <div className="page narrow reads">
      <Link className="back" href={`/chest/pages/${page.id}`}><Back />{t.reads.back}</Link>
      <h1>{format(t.reads.reportTitle, { title: page.title })}</h1>
      <p className="lead">{format(t.reads.summary, { done, total: rows.length })}</p>
      <p className="muted small">{format(t.reads.askedBy, { when: relative(ask.at, locale, now), name: ask.by === member.id ? t.people.you : nameOf(ask.by ? who.get(ask.by) : undefined, locale), version: ask.version })}</p>
      <div className="row-actions">
        <a className="button quiet" href={`/chest/pages/${page.id}/reads/csv`} download><Download />{t.reads.download}</a>
        <ReadsActions pageId={page.id} stale={ask.version < page.version} waiting={rows.length - done} locale={locale} t={{ again: t.reads.again, againDone: t.reads.againDone, stop: t.reads.stop, stopped: t.reads.stopped, remind: t.reads.remind, reminded: (await mailNow()) ? t.reads.reminded : t.reads.remindedBell, errors: t.errors }} />
      </div>
      <table className="reads-table">
        <thead>
          <tr><th scope="col">{t.reads.person}</th><th scope="col">{t.reads.status}</th><th scope="col">{t.reads.at}</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.memberId} className={r.current ? "done" : r.version === null ? "not-yet" : "older"}>
              <th scope="row">{nameOf(who.get(r.memberId), locale)}</th>
              <td><StatusBadge size="s" {...(r.version === null ? { tone: "wait", label: t.reads.notYet } : r.current ? { tone: "ok", label: t.reads.done } : { tone: "neutral", label: format(t.reads.older, { version: r.version }) })} /></td>
              <td>{r.at ? formatDate(r.at, locale, { day: "numeric", month: "short", year: "numeric", timeZone: member.timeZone }) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
