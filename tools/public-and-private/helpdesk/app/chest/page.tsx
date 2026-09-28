import Link from "next/link";
import { headers } from "next/headers";
import { Avatar } from "../../components/avatar.tsx";
import { Inbox, Note, Reply, Search } from "../../components/icons.tsx";
import { db } from "../../lib/db.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { supportAddress } from "../../lib/mailer.ts";
import { isFolder, type Folder } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts, listTickets, rememberPublicOrigin } from "../../lib/tickets.ts";

// The shared inbox: a folder of tickets, oldest waiting first (the one to
// answer next is on top), or the results of a search.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const search = await searchParams;
  const folder: Folder = isFolder(search.folder) ? search.folder : "unassigned";
  const q = (search.q ?? "").trim().slice(0, 100);
  const origin = publicOrigin(await headers());
  await rememberPublicOrigin(sql, origin);
  const [rows, counts] = await Promise.all([listTickets(sql, member, folder, q || undefined), folderCounts(sql, member)]);
  const who = await people(rows.map(r => r.assignee).filter((a): a is string => !!a));
  const now = new Date();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const address = total === 0 ? await supportAddress() : null;
  return (
    <>
      <div className="page-head">
        <h1>{q ? t.shell.search : t.inbox.folders[folder]}</h1>
        <form className="search" action="/chest" role="search">
          <label htmlFor="q" className="visually-hidden">{t.shell.search}</label>
          <input id="q" name="q" type="search" className="field" defaultValue={q} placeholder={t.shell.search} maxLength={100} />
          <button className="button quiet small" type="submit"><Search /><span className="visually-hidden">{t.shell.searchButton}</span></button>
        </form>
      </div>
      {q && <p className="muted" role="status" style={{ marginBottom: "var(--space-3)" }}>{plural(t.inbox.results, rows.length, locale, { q })}</p>}
      {total === 0 && !q ? (
        <div className="empty">
          <Inbox />
          <h2>{t.inbox.firstTitle}</h2>
          <p>{format(t.inbox.firstBody, { email: address ? format(t.inbox.firstEmail, { email: address }) : "" })}</p>
          <a className="button" href={origin ?? "/"} target="_blank" rel="noopener">{t.inbox.openForm}</a>
        </div>
      ) : rows.length === 0 && !q ? (
        <div className="empty"><p>{t.inbox.empty[folder]}</p></div>
      ) : (
        <ul className="tickets">
          {rows.map(r => (
            <li key={r.id}>
              <Link className="ticket-row" href={`/chest/tickets/${r.number}`}>
                <span className="who"><Avatar name={r.customerName || r.customerEmail} photo={null} /></span>
                <span className="subject">{r.subject}</span>
                <span className="meta">
                  <span className="num">#{r.number}</span>
                  <time dateTime={r.updatedAt}>{relative(r.updatedAt, locale, now)}</time>
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
