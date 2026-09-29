import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { listCompanies, tagsInUse } from "../../../lib/companies.ts";
import { db } from "../../../lib/db.ts";
import { fieldFilterOf, listFields } from "../../../lib/fields.ts";
import { format, money, plural, relative } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { team as teamOf } from "../../../lib/team.ts";
import { BulkBar, BulkProvider, PageCheck, RowCheck } from "../ui/bulk.tsx";
import { NewCompanyButton } from "../ui/company-form.tsx";
import { ListFilters } from "../ui/list-filters.tsx";
import { Pager } from "../ui/pager.tsx";
import { emptyCompany } from "../ui/values.ts";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Every company, 100 a page, by name (or last activity, or newest): who
// owns it, its people, its open deals. Ticked, many change at once.
export default async function Companies({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const get = (key: string) => one(params[key]);
  const field = fieldFilterOf(get);
  const filter = { q: get("q"), owner: get("owner"), tag: get("tag"), ...(field ? { field } : {}) };
  const sql = db();
  const [{ rows, total, page, pageSize }, tags, people, fields] = await Promise.all([
    listCompanies(sql, member, filter, { page: get("page"), sort: get("sort") }),
    tagsInUse(sql, "companies"),
    teamOf(),
    listFields(sql, "companies"),
  ]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const kept: Record<string, string> = Object.fromEntries(["q", "owner", "tag", "sort", "cf", "cv", "cmin", "cmax"].map(k => [k, get(k)] as [string, string]).filter(([, x]) => x !== ""));
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "" || field !== undefined;
  const query = new URLSearchParams(Object.entries(kept).filter(([k]) => k !== "sort")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  const writes = can(member, "records.write");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.companies.title}</h1>
          <p className="lede num">{plural(t.companies.count, total, locale)}</p>
        </div>
        {writes && <NewCompanyButton label={t.companies.new} initial={emptyCompany(member.id)} fields={fields} team={team} me={member.id} canAssign={can(member, "assign")} today={today()} locale={locale} t={t} />}
      </div>
      <ListFilters label={t.companies.filter} tags={tags} team={team} me={member.id} fields={fields} today={today()} sorts={[{ value: "name", label: t.companies.sorts.name }, { value: "recent", label: t.companies.sorts.recent }, { value: "created", label: t.companies.sorts.created }]} t={t} />
      <BulkProvider>
        <div className="list-summary">
          {writes ? <PageCheck ids={rows.map(r => r.id)} total={total} table="companies" filter={filter} locale={locale} t={t} /> : <span />}
          <a className="link-button" href={`/chest/export/companies${query ? "?" + query : ""}`} download><Download />{t.common.exportCsv}</a>
        </div>
        {writes && <BulkBar table="companies" team={team} me={member.id} canAssign={can(member, "assign")} canDelete locale={locale} t={t} />}
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t.companies.emptyFiltered : t.companies.empty}
            body={filtered ? undefined : t.companies.emptyBody}
            action={!filtered && can(member, "import") ? <Link prefetch={false} className="button quiet" href="/chest/import">{t.shell.import}</Link> : undefined}
          />
        ) : (
          <ul className={`rows${writes ? " selectable" : ""}`}>
            {rows.map(c => (
              <li key={c.id}>
                {writes && <RowCheck id={c.id} label={format(t.common.bulk.select, { name: c.name })} />}
                <Link prefetch={false} className="row-link" href={`/chest/companies/${c.id}`}>
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">{[c.industry, c.city, c.website].filter(Boolean).join(" · ")}{c.tags.length > 0 && c.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}</span>
                  </span>
                  <span className="row-figures">
                    <span className="num">{plural(t.companies.contacts, c.contacts, locale)}</span>
                    <span className="num">{c.openDeals > 0 ? `${plural(t.companies.openDeals, c.openDeals, locale)} · ${money(c.openValue, locale)}` : plural(t.companies.openDeals, 0, locale)}</span>
                  </span>
                  <span className="row-when muted" title={t.companies.lastActivity}>{c.lastActivity ? relative(c.lastActivity, locale) : t.companies.never}</span>
                  <span className="row-owner">{c.owner ? <Avatar name={owners[c.owner]?.name ?? "?"} photo={owners[c.owner]?.photo ?? null} size="s" label={owners[c.owner]?.name ?? t.people.unknown} /> : <Avatar name="?" size="s" className="avatar-none" label={t.common.unassigned} />}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </BulkProvider>
      <Pager path="/chest/companies" params={kept} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
    </div>
  );
}
