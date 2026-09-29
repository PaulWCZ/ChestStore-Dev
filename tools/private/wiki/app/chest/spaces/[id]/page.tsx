import { EmptyState, Menu } from "@argentic/chest-ui/components";
import { Link } from "../../../../components/link.tsx";
import { notFound } from "next/navigation";
import { Dots, Download, Gear, Lock, Pen, Plus, Upload } from "../../../../components/icons.tsx";
import { NewPageButton } from "../../../../components/new-page.tsx";
import { db } from "../../../../lib/db.ts";
import { askWhom } from "../../../../lib/groups.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, newPageWords, plural, relative } from "../../../../lib/i18n/index.ts";
import { recent, tree } from "../../../../lib/pages.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { space, type Space } from "../../../../lib/spaces.ts";

// A space: its name and what it holds, then its pages as a table of
// contents (two levels), like the first page of a book. Editors write a
// new page from here.
export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  let s: Space;
  try {
    s = await space(sql, member, id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const [nodes, latest] = await Promise.all([tree(sql, member, [s.id]), recent(sql, member, { spaceId: s.id, limit: 50 })]);
  const updated = new Map(latest.map(p => [p.id, p]));
  const who = await people(latest.map(p => p.updatedBy));
  const writer = s.access === "write";
  const top = nodes.filter(n => n.parentId === null);
  const below = (id: string) => nodes.filter(n => n.parentId === id);
  const count = (id: string): number => below(id).reduce((n, c) => n + 1 + count(c.id), 0);
  const now = new Date();
  const words = newPageWords(t);
  // An empty space names who a reader may ask to write in it.
  const ask = top.length === 0 && !writer ? await askWhom(locale, t.space.anotherEditor, s) : null;
  return (
    <div className={`page space-home color-${s.color}`}>
      <header className="space-head">
        <div>
          <p className="kicker">{plural(t.home.pages, s.pages, locale)}{s.visibility === "groups" && <span className="restricted"><Lock />{t.space.restricted}</span>}{s.editing === "some" && <span className="restricted"><Pen />{t.settings.onlySome}</span>}</p>
          <h1>{s.name}</h1>
          {s.visibility === "private" && <p className="lead"><Lock /> {t.mine.space}</p>}
          {s.visibility !== "private" && s.description && <p className="lead">{s.description}</p>}
        </div>
        <div className="actions">
          {writer && <NewPageButton target={{ spaceId: s.id, spaceName: s.name, parentId: null, parentTitle: null }} t={words}><Plus />{t.shell.newPage}</NewPageButton>}
          {(writer || s.pages > 0) && <Menu label={t.space.more} icon={<Dots />} showLabel size="m" link={Link} items={[
            ...(writer && s.visibility !== "private" ? [{ label: t.space.settings, icon: <Gear />, href: `/chest/spaces/${s.id}/settings` }, { label: t.space.import, icon: <Upload />, href: `/chest/import?space=${s.id}` }] : []),
            ...(s.pages > 0 ? [{ label: t.space.export, icon: <Download />, href: `/chest/spaces/${s.id}/export`, download: true }] : []),
          ]} />}
        </div>
      </header>
      {top.length === 0 ? (
        <EmptyState
          title={writer ? t.space.empty : t.space.emptyReader}
          action={writer ? <NewPageButton target={{ spaceId: s.id, spaceName: s.name, parentId: null, parentTitle: null }} t={words}><Plus />{t.space.firstPage}</NewPageButton> : null}
          note={writer ? null : ask ? format(t.space.emptyAsk, { names: ask }) : t.space.emptyNote}
        />
      ) : (
        <ol className="contents">
          {top.map(n => {
            const info = updated.get(n.id);
            const inner = below(n.id);
            return (
              <li key={n.id}>
                <Link href={`/chest/pages/${n.id}`} className="contents-title">{n.title}</Link>
                {info?.excerpt && <p className="excerpt">{info.excerpt}</p>}
                {info && <p className="byline">{format(t.home.updated, { when: relative(info.updatedAt, locale, now), name: info.updatedBy === member.id ? t.people.you : nameOf(who.get(info.updatedBy), locale) })}</p>}
                {inner.length > 0 && (
                  <ul className="contents-inner">
                    {inner.map(c => <li key={c.id}><Link href={`/chest/pages/${c.id}`}>{c.title}</Link>{count(c.id) > 0 && <span className="muted"> · {plural(t.home.pages, count(c.id), locale)}</span>}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
