import { EmptyState, SearchBox } from "@argentic/chest-ui/components";
import Link from "next/link";
import { Building, Person, Pipeline } from "../../../components/icons.tsx";
import { db } from "../../../lib/db.ts";
import { format, money } from "../../../lib/i18n/index.ts";
import { stageWords } from "../../../lib/page-data.ts";
import { search } from "../../../lib/search.ts";
import { viewer } from "../../../lib/session.ts";

type Search = Promise<Record<string, string | string[] | undefined>>;

// One box for everything: companies, people, deals — by name, email,
// phone or website, accents and small typos aside.
export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const raw = (await searchParams)["q"];
  const q = (typeof raw === "string" ? raw : "").slice(0, 100).trim();
  const sql = db();
  const found = q ? await search(sql, member, q) : null;
  const { names } = await stageWords(sql, t);
  const none = found && found.companies.length + found.contacts.length + found.deals.length === 0;
  return (
    <div className="page narrow">
      <h1>{q ? format(t.search.results, { q }) : t.search.title}</h1>
      {/* The kit's search box, big; the header's keeps the "/" key. */}
      <div className="big-search">
        <SearchBox id="search-q" action="/chest/search" value={q} shortcut={false} autoFocus={!q} maxLength={100} labels={{ ...t.searchBox, label: t.search.label }} />
      </div>
      {!q && <p className="muted">{t.search.hint}</p>}
      {none && <div className="empty-box"><EmptyState title={format(t.search.none, { q })} body={t.search.hint} /></div>}
      {found && found.companies.length > 0 && (
        <section aria-labelledby="found-companies" className="found">
          <h2 id="found-companies" className="label-mono"><Building />{t.search.companies}</h2>
          <ul className="rows compact">{found.companies.map(c => <li key={c.id}><Link prefetch={false} className="row-link" href={`/chest/companies/${c.id}`}><span className="row-main"><span className="row-title">{c.name}</span><span className="row-sub">{c.detail}</span></span></Link></li>)}</ul>
        </section>
      )}
      {found && found.contacts.length > 0 && (
        <section aria-labelledby="found-contacts" className="found">
          <h2 id="found-contacts" className="label-mono"><Person />{t.search.contacts}</h2>
          <ul className="rows compact">{found.contacts.map(c => <li key={c.id}><Link prefetch={false} className="row-link" href={`/chest/contacts/${c.id}`}><span className="row-main"><span className="row-title">{c.name}</span><span className="row-sub">{c.detail}</span></span></Link></li>)}</ul>
        </section>
      )}
      {found && found.deals.length > 0 && (
        <section aria-labelledby="found-deals" className="found">
          <h2 id="found-deals" className="label-mono"><Pipeline />{t.search.deals}</h2>
          <ul className="rows compact">{found.deals.map(d => <li key={d.id}><Link prefetch={false} className="row-link" href={`/chest/deals/${d.id}`}><span className="row-main"><span className="row-title">{d.name}</span><span className="row-sub">{[d.detail, names[d.stageId]].filter(Boolean).join(" · ")}</span></span><span className="num row-figures">{money(d.value, locale)}</span></Link></li>)}</ul>
        </section>
      )}
    </div>
  );
}
