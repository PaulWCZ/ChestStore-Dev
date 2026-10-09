import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { DateBox, RowStamp } from "../components/bits.tsx";
import { Search as SearchIcon } from "../components/icons.tsx";
import { dot, format, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { warnings } from "../lib/expenses.ts";
import { holders, nameOf, people } from "../lib/people.ts";
import { rowView } from "../lib/rows.ts";
import { readQuery, search, searchLimit } from "../lib/search.ts";
import { allowances, categories, settings } from "../lib/settings.ts";
import { categoryName } from "../shared/words.ts";

// Search: a shop, an amount, a person, a reference, a word of a note —
// among the expenses the reader may see (lib/search.ts decides which).
// People's and built-in categories' names are matched here, in the
// reader's language, then searched by id.
const plain = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase();

export async function searchPage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const q = (query("q") ?? "").slice(0, 100);
  const asked = readQuery(q);
  const sql = db();
  const [cats, company] = await Promise.all([categories(sql, { archived: true }), settings(sql)]);
  let rows: ReturnType<typeof rowView>[] = [];
  if (asked) {
    const wanted = plain(asked.text);
    const team = await holders();
    const found = await search(sql, member, asked.text, {
      people: team.filter(h => plain(h.name).includes(wanted)).map(h => h.id),
      categories: cats.filter(c => plain(categoryName(c, t)).includes(wanted)).map(c => c.id),
    });
    const [who, warned, flat] = await Promise.all([people(found.map(e => e.owner)), warnings(sql, found), allowances(sql, { archived: true })]);
    const ctx = { t, locale, allowances: new Map(flat.map(a => [a.id, a])), categories: new Map(cats.map(c => [c.id, c])), warnings: warned, currency: company.currency };
    rows = found.map(e => {
      const row = rowView(e, { ...ctx, ...(e.owner === member.id ? {} : { who: nameOf(who.get(e.owner), locale) }) });
      return { ...row, sub: [row.sub, "E" + e.id].filter(Boolean).join(dot) };
    });
  }
  return {
    title: t.search.title,
    body: (
    <div className="page">
      <div className="page-head"><h1>{t.search.title}</h1></div>
      <Island name="SearchBox" props={{ labels: t.search, value: q, autoFocus: !asked, className: "search-page" }} />
      {!asked && <p className="hint search-hint">{t.search.hint}</p>}
      {asked && rows.length === 0 && (
        <div className="paper">
          <EmptyState icon={<SearchIcon />} title={format(t.search.none, { q: asked.text })} body={t.search.noneBody} />
        </div>
      )}
      {rows.length > 0 && (
        <section className="section" aria-label={t.search.results}>
          <h2><span>{rows.length >= searchLimit ? format(t.search.many, { count: searchLimit }) : plural(t.search.count, rows.length, locale)}</span></h2>
          <ul className="rows">
            {rows.map(r => (
              <li key={r.id} className="row">
                <DateBox row={r} />
                <a className="main" href={r.href}><span className="what">{r.what}</span><span className="sub"><span>{r.sub}</span></span></a>
                <span className="right"><span className="amount">{r.amount}</span><RowStamp row={r} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    ),
  };
}
