import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { commentView } from "../actions.ts";
import { Prose } from "../components/prose.tsx";
import { Check, Clock, Lock, Pen } from "../components/icons.tsx";
import type { MovePlace } from "../islands/PageActions.tsx";
import { format, localeOf, moment, newPageWords, plural, relative } from "../i18n/index.ts";
import { can, spaceAccess } from "../lib/access.ts";
import { comments as commentsOf } from "../lib/comments.ts";
import { db } from "../lib/db.ts";
import { lockOf } from "../lib/editing.ts";
import { AppError } from "../lib/errors.ts";
import { companyGroups, membersOfTool } from "../lib/groups.ts";
import { mailNow } from "../lib/mail.ts";
import { ancestors, backlinks, page, titles, tree, type Page } from "../lib/pages.ts";
import { nameOf, people } from "../lib/people.ts";
import { isPinned } from "../lib/pins.ts";
import { readState } from "../lib/reads.ts";
import { render } from "../lib/render.ts";
import { listSpaces } from "../lib/spaces.ts";
import { isWatching } from "../lib/watching.ts";

// Reading a page: the default for everyone. Where it is, its title, who
// changed it last, the text set for reading; for editors one obvious
// action, "Edit". Links to other pages show their current titles.
export async function readPage({ member, locale: language, t, param, query: q }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const query = { saved: q("saved"), over: q("over"), dropped: q("dropped"), restored: q("restored"), example: q("example") };
  const sql = db();
  let p: Page;
  try {
    p = await page(sql, member, param("id"));
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  const [path, known, linked, lock, nodes, draft, thread, watching, read, pin] = await Promise.all([
    ancestors(sql, p.id),
    titles(sql, member, p.doc),
    backlinks(sql, member, p.id),
    lockOf(sql, p.id),
    tree(sql, member, [p.spaceId]),
    sql`select 1 from drafts where page_id = ${p.id} and member_id = ${member.id}`,
    commentsOf(sql, member, p.id),
    isWatching(sql, member, p.id),
    readState(sql, member, p.id),
    isPinned(sql, p.id),
  ]);
  const { html, headings } = render(p.doc, { title: i => known.get(i), missing: t.page.missing });
  const who = await people([p.updatedBy, ...(lock ? [lock.memberId] : []), ...thread.flatMap(c => (c.resolvedBy ? [c.author, c.resolvedBy] : [c.author])), ...(p.review?.owner ? [p.review.owner] : [])]);
  const now = new Date();
  const writer = p.space.access === "write";
  const children = nodes.filter(n => n.parentId === p.id);
  const holder = lock && lock.memberId !== member.id ? lock : null;
  const zone = member.timeZone;
  const empty = html.replace(/<p><\/p>/gu, "").trim() === "";
  // Pictures the save left out are said, never hidden behind "Saved.".
  const dropped = Math.min(Math.max(Number.parseInt(String(query["dropped"] ?? "0"), 10) || 0, 0), 999);
  const flash = query["saved"] !== undefined && dropped > 0 ? plural(t.page.savedDropped, dropped, locale)
    : query["saved"] !== undefined ? (query.over ? format(t.page.savedOver, { name: nameOf((await people([query.over])).get(query.over), locale) }) : t.page.saved)
    : query["restored"] ? format(t.history.restoredToast, { number: query["restored"] })
    : query["example"] ? t.home.exampleAdded : null;
  const toc = headings.filter(h => h.level <= 2);
  const owner = p.review?.owner ?? null;
  // Where the page may move: the spaces the editor writes in, and their pages.
  // Whom a comment may name with "@": the people who read this page.
  const mentionable = (await membersOfTool()).filter(m => m.id !== member.id && spaceAccess(m, p.space) !== "none").map(m => ({ id: m.id, name: m.name }));
  let places: MovePlace | undefined;
  let groups: { id: string; name: string }[] = [];
  if (writer) {
    groups = read.asked ? [] : await companyGroups();
    // A shared page never moves into "My pages" (lib/pages.ts, movePage).
    const writable = (await listSpaces(sql, member)).filter(s => s.access === "write" && (s.visibility !== "private" || p.space.visibility === "private"));
    const all = await tree(sql, member, writable.map(s => s.id));
    places = { spaces: writable.map(s => ({ id: s.id, name: s.name })), nodes: all.map(n => ({ id: n.id, spaceId: n.spaceId, parentId: n.parentId, title: n.title })) };
  }
  const mail = writer ? await mailNow() : true;
  return { title: p.title, body: (
    <div className={`page reading color-${p.space.color}`}>
      <Island name="Flash" props={{ text: flash }} />
      <Island name="AutoRefresh" props={{ seconds: 60 }} />
      <nav className="crumbs" aria-label={t.page.breadcrumb}>
        <a href={`/chest/spaces/${p.spaceId}`} className="kicker">{p.space.name}</a>
        {path.map(a => <span key={a.id}><span aria-hidden="true">/</span><a href={`/chest/pages/${a.id}`}>{a.title}</a></span>)}
      </nav>
      <div className={`article-grid${toc.length >= 3 ? " with-toc" : ""}`}>
        <article>
          <header className="article-head">
            <h1>{p.title}</h1>
            {p.template && <p className="template-tag"><span className="pill">{t.templates.tag}</span></p>}
            <div className="article-meta">
              <a href={`/chest/pages/${p.id}/history`} className="byline">
                <Clock />
                {format(t.page.updated, { when: relative(p.updatedAt, locale, now), name: p.updatedBy === member.id ? t.people.you : nameOf(who.get(p.updatedBy), locale) })}
              </a>
              <Island id={`actions-${p.id}`} name="PageActions" props={{
                page: { id: p.id, title: p.title, spaceId: p.spaceId, parentId: p.parentId, hasChildren: children.length > 0 },
                writer,
                editHref: `/chest/pages/${p.id}/edit`,
                t: { ...newPageWords(t), page: t.page, move: t.move, shell: t.shell, watch: t.watch, review: t.review, reads: t.reads, marks: { tag: t.templates.tag, mark: t.templates.mark, unmark: t.templates.unmark, marked: t.templates.marked, unmarked: t.templates.unmarked }, spaceName: p.space.name, locale },
                state: { watching, template: p.template, review: { months: p.review?.months ?? null, ownerName: owner ? nameOf(who.get(owner), locale) : null, mine: owner === member.id }, readAsked: read.asked !== null, pinned: pin, private: p.space.visibility === "private", mail },
                groups,
                ...(places ? { places } : {}),
              }} />
            </div>
          </header>
          {p.space.visibility === "private" && <p className="muted small read-only"><Lock />{t.mine.notice}</p>}
          {!writer && can(member, "write") && <p className="muted small read-only"><Lock />{format(t.page.readOnly, { space: p.space.name })}</p>}
          {holder && (
            <p className="notice" role="status"><Lock />{format(holder.idle ? t.page.editingIdle : t.page.editing, { name: nameOf(who.get(holder.memberId), locale), time: moment(holder.since, locale, zone, now) })}</p>
          )}
          {read.concerned && read.asked && (read.mine === null || read.mine.version < read.asked.version) && (
            <Island name="ReadRequest" props={{ pageId: p.id, again: read.mine !== null, t: { banner: t.reads.banner, bannerAgain: t.reads.bannerAgain, confirm: t.reads.confirm, confirmed: t.reads.confirmed } }} />
          )}
          {read.concerned && read.asked && read.mine !== null && read.mine.version >= read.asked.version && (
            <p className="muted small read-only"><Check />{format(t.reads.youRead, { when: relative(read.mine.at, locale, now) })}</p>
          )}
          {writer && p.review?.due && (
            <Island name="ReviewAsk" props={{ pageId: p.id, months: p.review.months, editHref: `/chest/pages/${p.id}/edit`, text: format(t.review.due, { when: relative(p.review.reviewedAt, locale, now) }), t: { stillCorrect: t.review.stillCorrect, update: t.review.update, done: t.review.done } }} />
          )}
          {writer && lock && lock.memberId === member.id && draft.length === 0 && (
            <p className="notice mine" role="status"><Pen />{t.page.editingYou} <a href={`/chest/pages/${p.id}/edit`}>{t.page.continueDraft}</a></p>
          )}
          {writer && draft.length > 0 && !holder && (
            <Island name="DraftNotice" props={{ pageId: p.id, editHref: `/chest/pages/${p.id}/edit`, t: { text: t.page.yourDraft, continue: t.page.continueDraft, discard: t.page.discardDraft, discarded: t.page.draftDiscarded } }} />
          )}
          {empty ? (
            <EmptyState title={t.page.emptyBody} action={writer ? <a className="button" href={`/chest/pages/${p.id}/edit`}>{t.page.emptyEdit}</a> : null} />
          ) : (
            <Prose html={html} />
          )}
          {children.length > 0 && (
            <section className="related" aria-labelledby="children-title">
              <h2 id="children-title" className="kicker">{t.page.children}</h2>
              <ul>{children.map(c => <li key={c.id}><a href={`/chest/pages/${c.id}`}>{c.title}</a></li>)}</ul>
            </section>
          )}
          {linked.length > 0 && (
            <section className="related" aria-labelledby="backlinks-title">
              <h2 id="backlinks-title" className="kicker">{t.page.backlinks}</h2>
              <ul>{linked.map(c => <li key={c.id}><a href={`/chest/pages/${c.id}`}>{c.title}</a></li>)}</ul>
            </section>
          )}
          <Island id={`comments-${p.id}`} name="Comments" props={{ pageId: p.id, me: member.id, moderator: writer, initial: await Promise.all(thread.map(c => commentView(c, member, locale, who))), people: mentionable, t: { comments: t.comments, locale } }} />
        </article>
        {toc.length >= 3 && (
          <aside className="toc" aria-labelledby="toc-title">
            <h2 id="toc-title" className="kicker">{t.page.toc}</h2>
            <ol>{toc.map(h => <li key={h.id} className={`level-${h.level}`}><a href={`#${h.id}`}>{h.text}</a></li>)}</ol>
          </aside>
        )}
      </div>
    </div>
  ) };
}
