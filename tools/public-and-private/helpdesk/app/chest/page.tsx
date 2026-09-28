import Link from "next/link";
import { headers } from "next/headers";
import { Avatar } from "../../components/avatar.tsx";
import { PriorityChip, Waiting } from "../../components/badges.tsx";
import { Inbox, Note, Reply, Search, Tag } from "../../components/icons.tsx";
import { InboxFilters } from "../../components/inbox-filters.tsx";
import { db } from "../../lib/db.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { supportAddress } from "../../lib/mailer.ts";
import { isFolder, isLate, waited, type Folder } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts, listTickets, rememberPublicOrigin, settings, tags as allTags } from "../../lib/tickets.ts";

// The shared inbox: a folder of tickets, the customer who has waited
// longest first (the one to answer next is on top), or the results of a
// search; filtered by priority or tag, sorted otherwise on demand. A tag
// without a folder shows every ticket carrying it.
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
  const waiting = (since: string) => {
    const w = waited(since, now);
    return <Waiting text={plural(t.waiting[w.unit], w.count, locale)} late={isLate(since, s.lateHours, now)} lateText={format(t.waiting.late, { hours: s.lateHours })} />;
  };
  const who = await people(rows.map(r => r.assignee).filter((a): a is string => !!a));
  const now = new Date();
  const total = counts.all + counts.spam;
  const address = total === 0 ? await supportAddress() : null;
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
      {total > 0 && <InboxFilters tags={tagList.map(g => ({ id: g.id, name: g.name }))} t={{ inbox: t.inbox, priority: t.priority }} />}
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
        <ul className="tickets">
          {rows.map(r => (
            <li key={r.id}>
              <Link className={`ticket-row${r.priority === "urgent" && r.status !== "closed" ? " is-urgent" : ""}`} href={`/chest/tickets/${r.number}`}>
                <span className="who"><Avatar name={r.customerName || r.customerEmail} photo={null} /></span>
                <span className="subject">
                  <PriorityChip priority={r.priority} label={t.priority[r.priority]} />
                  <span>{r.subject}</span>
                  {r.tags.slice(0, 3).map(g => <span key={g.id} className="chip tag"><Tag />{g.name}</span>)}
                  {r.tags.length > 3 && <span className="chip tag">{format(t.inbox.moreTags, { count: r.tags.length - 3 })}</span>}
                </span>
                <span className="meta">
                  <span className="num">#{r.number}</span>
                  {r.waitingSince ? waiting(r.waitingSince) : <time dateTime={r.updatedAt}>{relative(r.updatedAt, locale, now)}</time>}
                  {r.assignee ? <span className="chip">{nameOf(who.get(r.assignee), locale).split(" ")[0]}</span> : <span className="chip open">{t.inbox.unassignedTag}</span>}
                </span>
                <span className="preview">
                  {r.lastKind === "note" ? <><Note /> {t.inbox.noteLast} · </> : r.lastKind === "reply" ? <><Reply /> {t.inbox.replyLast} · </> : null}
                  <strong>{r.customerName || r.customerEmail}</strong> — {r.last}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
