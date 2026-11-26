import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Building, Person, Pipeline } from "../components/icons.tsx";
import { format, money, localeOf } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { stageWords } from "../lib/page-data.ts";
import { search } from "../lib/search.ts";

// One box for everything: companies, people, deals — by name, email,
// phone or website, accents and small typos aside.
export async function searchPage({ member, locale: lang, t, query }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const q = (query("q") ?? "").slice(0, 100).trim();
  const sql = db();
  const [found, { names }] = await Promise.all([q ? search(sql, member, q) : Promise.resolve(null), stageWords(sql, t)]);
  const none = found && found.companies.length + found.contacts.length + found.deals.length === 0;
  return {
    title: q ? format(t.search.results, { q }) : t.search.title,
    body: (
      <div className="page narrow">
        <h1>{q ? format(t.search.results, { q }) : t.search.title}</h1>
        {/* The kit's search box, big; the header's keeps the "/" key. */}
        <div className="big-search">
          <Island name="SearchField" props={{ q, labels: { ...t.searchBox, label: t.search.label } }} />
        </div>
        {!q && <p className="muted">{t.search.hint}</p>}
        {none && <div className="empty-box"><EmptyState title={format(t.search.none, { q })} body={t.search.hint} /></div>}
        {found && found.companies.length > 0 && (
          <section aria-labelledby="found-companies" className="found">
            <h2 id="found-companies" className="label-mono"><Building />{t.search.companies}</h2>
            <ul className="rows compact">{found.companies.map(c => <li key={c.id}><a className="row-link" href={`/chest/companies/${c.id}`}><span className="row-main"><span className="row-title">{c.name}</span><span className="row-sub">{c.detail}</span></span></a></li>)}</ul>
          </section>
        )}
        {found && found.contacts.length > 0 && (
          <section aria-labelledby="found-contacts" className="found">
            <h2 id="found-contacts" className="label-mono"><Person />{t.search.contacts}</h2>
            <ul className="rows compact">{found.contacts.map(c => <li key={c.id}><a className="row-link" href={`/chest/contacts/${c.id}`}><span className="row-main"><span className="row-title">{c.name}</span><span className="row-sub">{c.detail}</span></span></a></li>)}</ul>
          </section>
        )}
        {found && found.deals.length > 0 && (
          <section aria-labelledby="found-deals" className="found">
            <h2 id="found-deals" className="label-mono"><Pipeline />{t.search.deals}</h2>
            <ul className="rows compact">{found.deals.map(d => <li key={d.id}><a className="row-link" href={`/chest/deals/${d.id}`}><span className="row-main"><span className="row-title">{d.name}</span><span className="row-sub">{[d.detail, names[d.stageId]].filter(Boolean).join(" · ")}</span></span><span className="num row-figures">{money(d.value, locale, { currency: d.currency })}</span></a></li>)}</ul>
          </section>
        )}
      </div>
    ),
  };
}
