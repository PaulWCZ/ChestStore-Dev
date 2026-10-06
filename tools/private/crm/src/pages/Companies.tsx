import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Back, Globe, Mail, Phone, Pin } from "../components/icons.tsx";
import type { CompanyRow } from "../islands/lists.tsx";
import { StageBadge } from "../components/stage-badge.tsx";
import { customForm, emptyCompany, emptyContact, emptyDeal } from "../components/values.ts";
import { formatDay, money, plural, relative, localeOf } from "../i18n/index.ts";
import { can, canDeleteRecord } from "../lib/access.ts";
import { timeline } from "../lib/activities.ts";
import { listFiles } from "../lib/attachments.ts";
import { company as readCompany, listCompanies, tagsInUse } from "../lib/companies.ts";
import { listContacts } from "../lib/contacts.ts";
import { countryName } from "../lib/countries.ts";
import { db } from "../lib/db.ts";
import { listDeals } from "../lib/deals.ts";
import { fieldFilterOf, listFields } from "../lib/fields.ts";
import { countryChoices, currency, dealFormProps, formChoices, shownFields, shownFiles, withWhen } from "../lib/page-data.ts";
import { directory } from "../lib/people.ts";
import { shownName } from "../lib/seed-words.ts";
import { team as teamOf } from "../lib/team.ts";
import { today } from "../lib/zone.ts";
import { phoneHref, websiteHref } from "../shared/model.ts";
import { Pager } from "./parts.tsx";
import { words } from "./words.ts";

// Every company, 100 a page, by name (or last activity, or newest): who
// owns it, its people, its open deals. Ticked, many change at once.
export async function companiesPage({ member, locale: lang, t, query }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const get = (key: string) => query(key) ?? "";
  const field = fieldFilterOf(get);
  const filter = { q: get("q"), owner: get("owner"), tag: get("tag"), ...(field ? { field } : {}) };
  const sql = db();
  const cur = currency();
  const [{ rows, total, page, pageSize }, tags, people, fields] = await Promise.all([
    listCompanies(sql, member, filter, { page: get("page"), sort: get("sort") }),
    tagsInUse(sql, "companies"),
    teamOf(),
    listFields(sql, "companies", t),
  ]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const kept: Record<string, string> = Object.fromEntries(["q", "owner", "tag", "sort", "cf", "cv", "cmin", "cmax"].map(k => [k, get(k)] as [string, string]).filter(([, x]) => x !== ""));
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "" || field !== undefined;
  const exportQuery = new URLSearchParams(Object.entries(kept).filter(([k]) => k !== "sort")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  const writes = can(member, "records.write");
  const now = today();
  const list: CompanyRow[] = rows.map(c => ({
    id: c.id,
    name: c.name,
    sub: [c.industry ? shownName("industries", c.industry, t) : "", c.city, c.website].filter(Boolean).join(" · "),
    tags: c.tags.map(tag => shownName("tags", tag, t)),
    contacts: plural(t.companies.contacts, c.contacts, locale),
    deals: c.openDeals > 0 ? `${plural(t.companies.openDeals, c.openDeals, locale)} · ${money(c.openValue, locale, { currency: cur })}` : plural(t.companies.openDeals, 0, locale),
    when: c.lastActivity ? relative(c.lastActivity, locale) : t.companies.never,
    owner: c.owner,
  }));
  return {
    title: t.companies.title,
    body: (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t.companies.title}</h1>
            <p className="lede num">{plural(t.companies.count, total, locale)}</p>
          </div>
          {writes && <Island name="NewCompanyButton" props={{ label: t.companies.new, initial: emptyCompany(member.id), fields, team, me: member.id, canAssign: can(member, "assign"), today: now, countries: countryChoices(locale), t: words.company(t) }} />}
        </div>
        {/* An empty book has nothing to filter, sort or export. */}
        {(total > 0 || filtered) && (
          <Island name="ListFilters" props={{
            address: { path: "/chest/companies", query: kept }, label: t.companies.filter, tags: tags.map(tag => ({ value: tag, label: shownName("tags", tag, t) })), team, me: member.id, fields, today: now,
            sorts: [{ value: "name", label: t.companies.sorts.name }, { value: "recent", label: t.companies.sorts.recent }, { value: "created", label: t.companies.sorts.created }],
            exports: total > 0 ? [{ href: `/chest/export/companies${exportQuery ? "?" + exportQuery : ""}`, label: t.common.exportCsv, kind: "csv" as const }] : [],
            t: words.listFilters(t),
          }} />
        )}
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t.companies.emptyFiltered : t.companies.empty}
            body={filtered ? undefined : t.companies.emptyBody}
            action={!filtered && can(member, "import") ? <a className="button quiet" href="/chest/import">{t.shell.import}</a> : undefined}
          />
        ) : (
          <Island name="CompanyList" id="company-list" props={{ rows: list, total, filter: { ...kept }, owners, writes, team, me: member.id, canAssign: can(member, "assign"), locale, t: words.companyList(t) }} />
        )}
        <Pager path="/chest/companies" params={kept} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
      </div>
    ),
  };
}

// One company: how to reach it, its people, its deals, its files, its own
// details, and everything that happened with it (on its deals and with its
// people too).
export async function companyPage({ member, locale: lang, t, param }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const sql = db();
  const c = await readCompany(sql, member, param("id"));
  const [items, people, deals, choices, files] = await Promise.all([
    timeline(sql, { companyId: c.id }),
    listContacts(sql, member, { company: c.id }, { limit: 200 }),
    listDeals(sql, member, { company: c.id, status: "" }, 200),
    formChoices(sql, member, t),
    listFiles(sql, member, { company: c.id }),
  ]);
  const names = await directory([c.owner, ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : [])), ...items.flatMap(a => (a.kind === "booking" && typeof a.data["host"] === "string" ? [a.data["host"]] : [])), ...files.map(f => f.addedBy)], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const place = [c.address.replace(/\n/gu, ", "), [c.postcode, c.city].filter(Boolean).join(" "), c.country ? countryName(c.country, locale) : ""].filter(Boolean).join(", ");
  const details = [
    ...(c.siren ? [{ label: t.company.siren, value: c.siren }] : []),
    ...(c.vat ? [{ label: t.company.vat, value: c.vat }] : []),
    ...shownFields(choices.fields, "companies", c.custom, locale),
  ];
  const self = { id: c.id, name: c.name };
  const now = today();
  const year = now.slice(0, 4);
  const key = `company-${c.id}`;
  const companyForm = { fields: choices.fields.companies, team: choices.team, me: member.id, canAssign: choices.canAssign, today: now, countries: countryChoices(locale), t: words.company(t) };
  return {
    title: c.name,
    body: (
      <div className="page record">
        <Island name="AutoRefresh" props={{ seconds: 45 }} />
        <nav className="crumbs"><a href="/chest/companies"><Back />{t.shell.companies}</a></nav>
        <div className="record-head">
          {c.industry && <p className="label-mono">{shownName("industries", c.industry, t)}</p>}
          <h1>{c.name}</h1>
          <p className="record-links">
            {c.website && <a href={websiteHref(c.website)} target="_blank" rel="noopener noreferrer nofollow"><Globe />{c.website.replace(/^https?:\/\//u, "")}</a>}
            {c.phone && <a href={phoneHref(c.phone)}><Phone /><span className="num">{c.phone}</span></a>}
            {c.email && <a href={`mailto:${c.email}`}><Mail />{c.email}</a>}
            {place && <span><Pin />{place}</span>}
          </p>
          {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <a key={tag} className="tag" href={`/chest/companies?tag=${encodeURIComponent(tag)}`}>{shownName("tags", tag, t)}</a>)}</p>}
        </div>
        <Island name="CompanyControls" id={`controls-${key}`} props={{
          company: { id: c.id, name: c.name, website: c.website, phone: c.phone, email: c.email, address: c.address, postcode: c.postcode, city: c.city, country: c.country, siren: c.siren, vat: c.vat, industry: shownName("industries", c.industry, t), notes: c.notes, tags: c.tags.map(tag => shownName("tags", tag, t)).join(", "), owner: c.owner, custom: customForm(c.custom) },
          ownerName: names[c.owner ?? ""]?.name ?? t.common.unassigned,
          canEdit: can(member, "records.write"),
          canDelete: canDeleteRecord(member, c),
          form: companyForm,
          t: words.company(t),
        }} />
        <div className="record-grid">
          <div className="record-main">
            {can(member, "activities.log") && c.phone && <Island name="CallPrompt" id={`call-${key}`} props={{ on: { company: c.id }, name: c.name, t: words.log(t) }} />}
            {can(member, "activities.log") ? <Island name="Composer" id={`log-${key}`} props={{ on: { company: c.id }, t: words.log(t) }} /> : <p className="muted">{t.log.readOnly}</p>}
            <h2 className="label-mono section-gap">{t.timeline.title}</h2>
            <Island name="Timeline" id={`timeline-${key}`} props={{ items: withWhen(items, locale, new Date(), member.timeZone), people: names, stageNames: choices.stageNames, me: member.id, canRemoveAny: can(member, "deals.all"), canLog: can(member, "activities.log"), context: "company", locale, t: words.timeline(t) }} />
          </div>
          <aside className="record-side">
            <section className="panel" aria-labelledby="people-title">
              <div className="panel-head">
                <h2 id="people-title" className="label-mono">{t.company.people} <span className="count num">{people.total}</span></h2>
                {can(member, "records.write") && <Island name="NewContactButton" props={{ className: "link-button", label: t.company.addPerson, initial: emptyContact(member.id, self), fields: choices.fields.contacts, stay: true, team: choices.team, me: member.id, canAssign: choices.canAssign, canCreate: choices.canCreateCompany, today: now, t: words.contact(t) }} />}
              </div>
              {people.rows.length === 0 ? <p className="muted">{t.company.noPeople}</p> : (
                <ul className="mini-list">
                  {people.rows.map(p => (
                    <li key={p.id}>
                      <a href={`/chest/contacts/${p.id}`}>{p.name}</a>
                      <span className="muted">{p.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel" aria-labelledby="deals-title">
              <div className="panel-head">
                <h2 id="deals-title" className="label-mono">{t.company.deals} <span className="count num">{deals.total}</span></h2>
                {can(member, "deals.create") && <Island name="NewDealButton" props={{ className: "link-button", label: t.company.addDeal, initial: emptyDeal(member.id, choices.openStages[0]?.id ?? "", self), ...dealFormProps(choices, member.id), t: words.deal(t) }} />}
              </div>
              {deals.rows.length === 0 ? <p className="muted">{t.company.noDeals}</p> : (
                <ul className="mini-list">
                  {deals.rows.map(d => (
                    <li key={d.id}>
                      <a href={`/chest/deals/${d.id}`}>{d.title}</a>
                      <span className="mini-meta">
                        <StageBadge kind={kinds.get(d.stageId) ?? "open"} name={choices.stageNames[d.stageId] ?? ""} />
                        <span className="num">{money(d.value, locale, { currency: d.currency })}</span>
                        {d.expectedClose && <span className="num muted">{formatDay(d.expectedClose, locale, { day: "numeric", month: "short" }, year)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {details.length > 0 && (
              <section className="panel" aria-labelledby="details-title">
                <h2 id="details-title" className="label-mono">{t.common.details}</h2>
                <dl className="facts">{details.map(d => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}</dl>
              </section>
            )}
            <Island name="FilesBox" id={`files-${key}`} props={{ on: { company: c.id }, files: shownFiles(files, names, member, locale, t), canAdd: can(member, "activities.log"), t: words.files(t) }} />
            {c.notes && (
              <section className="panel">
                <h2 className="label-mono">{t.common.notes}</h2>
                <p className="pre">{c.notes}</p>
              </section>
            )}
          </aside>
        </div>
      </div>
    ),
  };
}
