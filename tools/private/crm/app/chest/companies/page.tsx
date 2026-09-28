import Link from "next/link";
import { Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { listCompanies, tagsInUse } from "../../../lib/companies.ts";
import { db } from "../../../lib/db.ts";
import { format, money, plural, relative } from "../../../lib/i18n/index.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { team as teamOf } from "../../../lib/team.ts";
import { Avatar } from "../../../components/avatar.tsx";
import { NewCompanyButton } from "../ui/company-form.tsx";
import { emptyCompany } from "../ui/values.ts";
import { ListFilters } from "../ui/list-filters.tsx";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Every company, by name: who owns it, its people, its open deals.
export default async function Companies({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const filter = { q: one(params["q"]), owner: one(params["owner"]), tag: one(params["tag"]) };
  const sql = db();
  const [{ rows, total }, tags, people] = await Promise.all([listCompanies(sql, member, filter), tagsInUse(sql, "companies"), teamOf()]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "";
  const query = new URLSearchParams(Object.entries(filter).filter(([, x]) => x !== "")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t.companies.title}</h1>
          <p className="lede num">{plural(t.companies.count, total, locale)}</p>
        </div>
        {can(member, "records.write") && <NewCompanyButton label={t.companies.new} initial={emptyCompany(member.id)} team={team} me={member.id} canAssign={can(member, "assign")} t={t} />}
      </div>
      <ListFilters label={t.companies.filter} tags={tags} team={team} me={member.id} t={t} />
      <div className="list-summary">
        <span />
        <a className="link-button" href={`/chest/export/companies${query ? "?" + query : ""}`} download><Download />{t.common.exportCsv}</a>
      </div>
      {rows.length === 0 ? (
        <div className="empty small">
          <h2>{filtered ? t.companies.emptyFiltered : t.companies.empty}</h2>
          {!filtered && <p>{t.companies.emptyBody}</p>}
          {!filtered && can(member, "import") && <Link prefetch={false} className="button quiet" href="/chest/import">{t.shell.import}</Link>}
        </div>
      ) : (
        <ul className="rows">
          {rows.map(c => (
            <li key={c.id}>
              <Link prefetch={false} className="row-link" href={`/chest/companies/${c.id}`}>
                <span className="row-main">
                  <span className="row-title">{c.name}</span>
                  <span className="row-sub">{[c.industry, c.website].filter(Boolean).join(" · ")}{c.tags.length > 0 && c.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}</span>
                </span>
                <span className="row-figures">
                  <span className="num">{plural(t.companies.contacts, c.contacts, locale)}</span>
                  <span className="num">{c.openDeals > 0 ? `${plural(t.companies.openDeals, c.openDeals, locale)} · ${money(c.openValue, locale)}` : plural(t.companies.openDeals, 0, locale)}</span>
                </span>
                <span className="row-when num muted" title={t.companies.lastActivity}>{c.lastActivity ? relative(c.lastActivity, locale) : t.companies.never}</span>
                <span className="row-owner">{c.owner ? <Avatar name={owners[c.owner]?.name ?? "?"} photo={owners[c.owner]?.photo ?? null} size={26} title={owners[c.owner]?.name} /> : <span className="avatar empty-avatar" role="img" aria-label={t.common.unassigned} title={t.common.unassigned}>?</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length < total && <p className="muted small-text">{format(t.common.showing, { shown: rows.length, total })}</p>}
    </main>
  );
}
