import * as chest from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import { Inbox, Search } from "../../components/icons.tsx";
import { InboxFilters } from "../../components/inbox-filters.tsx";
import { can } from "../../lib/access.ts";
import { answerers } from "../../lib/tell.ts";
import { db } from "../../lib/db.ts";
import { workMinutes } from "../../lib/hours.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { supportAddress } from "../../lib/mailer.ts";
import { isFolder, lateAfter, waitedFor, type Folder } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts, listTickets, rememberPublicOrigin, settings, tags as allTags } from "../../lib/tickets.ts";
import { listViews, viewHref, viewParams } from "../../lib/views.ts";
import { InboxList } from "./inbox-list.tsx";
import { RemoveView, SaveView } from "./save-view.tsx";

// The shared inbox: a folder of tickets, the most urgent first and, among
// equals, the customer who has waited longest (the one to answer next is
// on top), or the results of a search; filtered by priority or tag, sorted
// otherwise on demand. A tag without a folder shows every ticket carrying
// it. Tick tickets to change several at once.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; priority?: string; tag?: string; sort?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const search = await searchParams;
  const folder: Folder = isFolder(search.folder) ? search.folder : search.tag && !search.folder ? "all" : "unassigned";
  const q = (search.q ?? "").trim().slice(0, 100);
  const origin = publicOrigin(await headers());
  await rememberPublicOrigin(sql, origin);
  const filters = { priority: search.priority, tag: search.tag, sort: search.sort };
  const [rows, counts, tagList, s] = await Promise.all([listTickets(sql, member, folder, q || undefined, filters), folderCounts(sql, member), allTags(sql, member), settings(sql)]);
  const filtered = Boolean(search.priority || search.tag);
  const tagName = tagList.find(g => g.id === search.tag)?.name;
  const now = new Date();
  const zone = chest.timeZone();
  const canManage = can(member, "tickets.manage");
  const team = canManage ? await answerers() : [];
  const who = await people([...rows.map(r => r.assignee).filter((a): a is string => !!a), ...team]);
  const total = counts.all + counts.spam;
  const address = total === 0 ? await supportAddress() : null;
  const current = viewParams(search);
  const shown = (await listViews(sql, member)).find(x => viewHref(x.params) === viewHref(current));
  const savable = !shown && Boolean(current.q || current.priority || current.tag || current.sort);
  return (
    <>
      <div className="page-head">
        <h1>{q ? t.shell.search : folder === "all" && tagName ? format(t.inbox.tagTitle, { tag: tagName }) : t.inbox.folders[folder]}</h1>
        <form className="search" action="/chest" role="search">
          <label htmlFor="q" className="visually-hidden">{t.shell.search}</label>
          <input id="q" name="q" type="search" className="field" defaultValue={q} placeholder={t.shell.search} maxLength={100} />
          <button className="button quiet small" type="submit"><Search /><span className="visually-hidden">{t.shell.searchButton}</span></button>
        </form>
      </div>
      {total > 0 && (
        <div className="filters-line">
          <InboxFilters tags={tagList.map(g => ({ id: g.id, name: g.name }))} t={{ inbox: t.inbox, priority: t.priority }} />
          {savable && can(member, "tickets.answer") && <SaveView params={current} t={t.inbox} />}
          {shown && (shown.createdBy === member.id || can(member, "settings")) && <RemoveView id={shown.id} t={t.inbox} />}
        </div>
      )}
      {q && <p className="muted" role="status" style={{ marginBottom: "var(--space-3)" }}>{plural(t.inbox.results, rows.length, locale, { q })}</p>}
      {total === 0 && !q ? (
        <div className="empty">
          <Inbox />
          <h2>{t.inbox.firstTitle}</h2>
          <p>{format(t.inbox.firstBody, { email: address ? format(t.inbox.firstEmail, { email: address }) : "" })}</p>
          <a className="button" href={origin ?? "/"} target="_blank" rel="noopener">{t.inbox.openForm}</a>
        </div>
      ) : rows.length === 0 && !q ? (
        <div className="empty"><p>{filtered ? t.inbox.filtered : t.inbox.empty[folder]}</p></div>
      ) : (
        <InboxList
          rows={rows.map(r => {
            const minutes = r.waitingSince ? workMinutes(r.waitingSince, now, s.hours, zone) : 0;
            const w = waitedFor(minutes);
            return {
              number: r.number, subject: r.subject, status: r.status, priority: r.priority, tags: r.tags,
              customer: r.customerName || r.customerEmail, last: r.last, lastKind: r.lastKind,
              assignee: r.assignee ? nameOf(who.get(r.assignee), locale).split(" ")[0]! : null,
              when: r.waitingSince ? null : relative(r.updatedAt, locale, now), updatedAt: r.updatedAt,
              waiting: r.waitingSince ? { text: plural(t.waiting[w.unit], w.count, locale), late: lateAfter(minutes, s.lateHours), lateText: format(t.waiting.late, { hours: s.lateHours }) } : null,
            };
          })}
          canManage={canManage}
          team={team.map(id => ({ id, name: nameOf(who.get(id), locale) }))}
          t={{ inbox: t.inbox, priority: t.priority, errors: t.errors, statuses: t.ticket.statuses }}
          locale={locale}
        />
      )}
    </>
  );
}
