import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Lock, Pen } from "../components/icons.tsx";
import { format, localeOf, newPageWords, plural, relative } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { AppError } from "../lib/errors.ts";
import { askWhom } from "../lib/groups.ts";
import { recent, tree } from "../lib/pages.ts";
import { nameOf, people } from "../lib/people.ts";
import { space, type Space } from "../lib/spaces.ts";

// A space: its name and what it holds, then its pages as a table of
// contents (two levels), like the first page of a book. Editors write a
// new page from here.
export async function spacePage({ member, locale: language, t, param }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  let s: Space;
  try {
    s = await space(sql, member, param("id"));
  } catch (error) {
    if (error instanceof AppError) return notFound();
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
  const newPage = (label: string) => <Island name="NewPageButton" props={{ target: { spaceId: s.id, spaceName: s.name, parentId: null, parentTitle: null }, label, icon: "plus", t: words }} />;
  return { title: s.name, body: (
    <div className={`page color-${s.color}`}>
      <header className="space-head">
        <div>
          <p className="kicker">{plural(t.home.pages, s.pages, locale)}{s.visibility === "groups" && <span className="restricted"><Lock />{t.space.restricted}</span>}{s.editing === "some" && <span className="restricted"><Pen />{t.settings.onlySome}</span>}</p>
          <h1>{s.name}</h1>
          {s.visibility === "private" && <p className="lead"><Lock /> {t.mine.space}</p>}
          {s.visibility !== "private" && s.description && <p className="lead">{s.description}</p>}
        </div>
        <div className="actions">
          {writer && newPage(t.shell.newPage)}
          {(writer || s.pages > 0) && <Island name="LinkMenu" props={{ label: t.space.more, items: [
            ...(writer && s.visibility !== "private" ? [{ label: t.space.settings, icon: "gear" as const, href: `/chest/spaces/${s.id}/settings` }, { label: t.space.import, icon: "upload" as const, href: `/chest/import?space=${s.id}` }] : []),
            ...(s.pages > 0 ? [{ label: t.space.export, icon: "download" as const, href: `/chest/spaces/${s.id}/export`, download: true }] : []),
          ] }} />}
        </div>
      </header>
      {top.length === 0 ? (
        <EmptyState
          title={writer ? t.space.empty : t.space.emptyReader}
          action={writer ? newPage(t.space.firstPage) : null}
          note={writer ? null : ask ? format(t.space.emptyAsk, { names: ask }) : t.space.emptyNote}
        />
      ) : (
        <ol className="contents">
          {top.map(n => {
            const info = updated.get(n.id);
            const inner = below(n.id);
            return (
              <li key={n.id}>
                <a href={`/chest/pages/${n.id}`} className="contents-title">{n.title}</a>
                {info?.excerpt && <p className="excerpt">{info.excerpt}</p>}
                {info && <p className="byline">{format(t.home.updated, { when: relative(info.updatedAt, locale, now), name: info.updatedBy === member.id ? t.people.you : nameOf(who.get(info.updatedBy), locale) })}</p>}
                {inner.length > 0 && (
                  <ul className="contents-inner">
                    {inner.map(c => <li key={c.id}><a href={`/chest/pages/${c.id}`}>{c.title}</a>{count(c.id) > 0 && <span className="muted"> · {plural(t.home.pages, count(c.id), locale)}</span>}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  ) };
}
