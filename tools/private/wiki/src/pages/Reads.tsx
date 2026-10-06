import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { StatusBadge } from "@argentic/chest-ui/components";
import { Back, Download } from "../components/icons.tsx";
import { format, formatDate, localeOf, relative } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { AppError } from "../lib/errors.ts";
import { nameOf, people } from "../lib/people.ts";
import { report } from "../lib/reads.ts";

// Who has read a page its editors asked people to confirm: how many
// confirmed the current version, then each person — not yet, an older
// version, done — with the date; the table to download; ask again after a
// change; stop asking.
export async function readsPage({ member, locale: language, t, param }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  let found: Awaited<ReturnType<typeof report>>;
  try {
    found = await report(db(), member, param("id"));
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  const { page, ask, rows } = found;
  const who = await people([...rows.map(r => r.memberId), ...(ask.by ? [ask.by] : [])]);
  const now = new Date();
  const done = rows.filter(r => r.current).length;
  return { title: format(t.reads.reportTitle, { title: page.title }), body: (
    <div className="page narrow reads">
      <a className="back" href={`/chest/pages/${page.id}`}><Back />{t.reads.back}</a>
      <h1>{format(t.reads.reportTitle, { title: page.title })}</h1>
      <p className="lead">{format(t.reads.summary, { done, total: rows.length })}</p>
      <p className="muted small">{format(t.reads.askedBy, { when: relative(ask.at, locale, now), name: ask.by === member.id ? t.people.you : nameOf(ask.by ? who.get(ask.by) : undefined, locale), version: ask.version })}</p>
      <div className="row-actions">
        <a className="button quiet" href={`/chest/pages/${page.id}/reads/csv`} download><Download />{t.reads.download}</a>
        <Island name="ReadsActions" props={{ pageId: page.id, stale: ask.version < page.version, waiting: rows.length - done, locale, t: { again: t.reads.again, againDone: t.reads.againDone, stop: t.reads.stop, stopped: t.reads.stopped, remind: t.reads.remind, reminded: t.reads.reminded } }} />
      </div>
      <table className="reads-table">
        <thead>
          <tr><th scope="col">{t.reads.person}</th><th scope="col">{t.reads.status}</th><th scope="col">{t.reads.at}</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.memberId} className={r.current ? "done" : undefined}>
              <th scope="row">{nameOf(who.get(r.memberId), locale)}</th>
              <td><StatusBadge size="s" {...(r.version === null ? { tone: "wait", label: t.reads.notYet } : r.current ? { tone: "ok", label: t.reads.done } : { tone: "neutral", label: format(t.reads.older, { version: r.version }) })} /></td>
              <td>{r.at ? formatDate(r.at, locale, { day: "numeric", month: "short", year: "numeric", timeZone: member.timeZone }) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) };
}
