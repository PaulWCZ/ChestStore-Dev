import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Tabs } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { Prose } from "../components/prose.tsx";
import { format, formatDate, localeOf, plural, relative } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { AppError } from "../lib/errors.ts";
import { diff, versions, type Row } from "../lib/history.ts";
import { page, titles, type Page } from "../lib/pages.ts";
import { nameOf, people } from "../lib/people.ts";
import { render } from "../lib/render.ts";

// A page's history: every save, who and when; the changes of the one
// chosen, in words (what was taken out struck through, what came in
// underlined); the page as it was; and, for editors, "Restore".
export async function historyPage({ member, locale: language, t, param, query: q }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const query = { v: q("v"), view: q("view"), restored: q("restored") };
  const sql = db();
  let p: Page;
  try {
    p = await page(sql, member, param("id"));
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  const list = await versions(sql, member, p.id);
  const wanted = Number(query["v"] ?? list[0]?.number ?? 1);
  const chosen = list.find(x => x.number === wanted) ?? list[0];
  if (!chosen) return notFound();
  const shown = await diff(sql, member, p.id, chosen.number);
  const who = await people(list.map(x => x.author));
  const now = new Date();
  const view = query["view"] === "page" ? "page" : "changes";
  const name = (author: string) => (author === member.id ? t.people.you : nameOf(who.get(author), locale));
  const kind = (k: string, from: number | null) => (k === "restored" ? format(t.history.kinds.restored, { number: from ?? "?" }) : (t.history.kinds as Record<string, string>)[k] ?? t.history.kinds.edited);
  const known = view === "page" ? await titles(sql, member, shown.version.doc) : new Map<string, string>();
  const html = view === "page" ? render(shown.version.doc, { title: i => known.get(i), missing: t.page.missing }).html : "";
  const href = (n: number, mode = view) => `/chest/pages/${p.id}/history?v=${n}${mode === "page" ? "&view=page" : ""}`;
  return { title: format(t.history.title, { title: p.title }), body: (
    <div className="page history">
      <Island name="Flash" props={{ text: query["restored"] ? format(t.history.restoredToast, { number: query["restored"] }) : null }} />
      <a className="back" href={`/chest/pages/${p.id}`}><Back />{t.history.back}</a>
      <h1>{format(t.history.title, { title: p.title })}</h1>
      <div className="history-grid">
        <nav aria-labelledby="versions-title" className="versions">
          <h2 id="versions-title" className="kicker">{t.history.versions}</h2>
          <ol>
            {list.map((x, i) => (
              <li key={x.number}>
                <a href={href(x.number)} aria-current={x.number === chosen.number ? "page" : undefined}>
                  <span className="v-head"><strong>{format(t.history.version, { number: x.number })}</strong>{i === 0 && <span className="pill">{t.history.current}</span>}</span>
                  <span className="v-kind">{kind(x.kind, x.restoredFrom)}</span>
                  <span className="muted" title={formatDate(x.createdAt, locale, { dateStyle: "long", timeStyle: "short", timeZone: member.timeZone })}>{format(t.history.by, { when: relative(x.createdAt, locale, now), name: name(x.author) })}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <section className="version" aria-labelledby="version-title">
          <div className="version-head">
            <div>
              <h2 id="version-title">{format(t.history.version, { number: chosen.number })}</h2>
              <p className="muted">{formatDate(chosen.createdAt, locale, { dateStyle: "full", timeStyle: "short", timeZone: member.timeZone })} · {name(chosen.author)}</p>
            </div>
            {p.space.access === "write" && chosen.number !== list[0]?.number && (
              <Island name="RestoreButton" props={{ pageId: p.id, number: chosen.number, label: t.history.restore }} />
            )}
          </div>
          <Tabs label={t.history.view} current={view} items={[
            { id: "changes", label: t.history.changes, href: href(chosen.number, "changes") },
            { id: "page", label: t.history.asItWas, href: href(chosen.number, "page") },
          ]} />
          {view === "page" ? (
            <article className="past">
              <h1 className="past-title">{shown.version.title}</h1>
              <Prose html={html} />
            </article>
          ) : (
            <div className="diff">
              {shown.previous === null && <p className="muted">{t.history.first}</p>}
              {shown.titleChanged && <p className="renamed">{format(t.history.renamed, shown.titleChanged)}</p>}
              {shown.previous !== null && shown.rows.every(r => r.kind === "same" || r.kind === "fold") && <p className="muted">{t.history.noChanges}</p>}
              <ol className="rows">
                {shown.rows.map((r, i) => <DiffRow key={i} row={r} fold={n => plural(t.history.fold, n, locale)} added={t.history.added} removed={t.history.removed} />)}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  ) };
}

function DiffRow({ row: raw, fold, added, removed }: { row: Row; fold: (n: number) => string; added: string; removed: string }) {
  // A heading shows as a heading, without its "#" marks.
  const heading = "text" in raw && /^#{1,3} /u.test(raw.text);
  const row: Row = heading && "text" in raw ? { kind: raw.kind, text: raw.text.replace(/^#{1,3} /u, "") } : raw;
  if (heading && row.kind === "same") return <li className="same heading">{row.text}</li>;
  if (row.kind === "fold") return <li className="fold">{fold(row.count)}</li>;
  if (row.kind === "changed") {
    return (
      <li className="changed">
        {row.parts.map((part, i) => part.change === "same" ? <span key={i}>{part.text}</span> : part.change === "added" ? <ins key={i} title={added}>{part.text}</ins> : <del key={i} title={removed}>{part.text}</del>)}
      </li>
    );
  }
  if (row.kind === "added") return <li className="added"><span className="visually-hidden">{added}: </span><ins>{row.text}</ins></li>;
  if (row.kind === "removed") return <li className="removed"><span className="visually-hidden">{removed}: </span><del>{row.text}</del></li>;
  return <li className="same">{row.text}</li>;
}
