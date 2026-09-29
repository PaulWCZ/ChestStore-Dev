import Link from "next/link";
import { notFound } from "next/navigation";
import { StageBadge } from "../../../../components/stage-badge.tsx";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Globe, Mail, Phone, Pin } from "../../../../components/icons.tsx";
import { can, canDeleteRecord } from "../../../../lib/access.ts";
import { timeline } from "../../../../lib/activities.ts";
import { listFiles } from "../../../../lib/attachments.ts";
import { company as readCompany } from "../../../../lib/companies.ts";
import { listContacts } from "../../../../lib/contacts.ts";
import { countryName } from "../../../../lib/countries.ts";
import { db } from "../../../../lib/db.ts";
import { listDeals } from "../../../../lib/deals.ts";
import { AppError } from "../../../../lib/errors.ts";
import { formatDay, money } from "../../../../lib/i18n/index.ts";
import { phoneHref, today, websiteHref } from "../../../../lib/model.ts";
import { dealFormProps, formChoices, shownFields, shownFiles, withWhen } from "../../../../lib/page-data.ts";
import { directory } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { Composer } from "../../ui/composer.tsx";
import { NewContactButton } from "../../ui/contact-form.tsx";
import { NewDealButton } from "../../ui/deal-form.tsx";
import { FilesBox } from "../../ui/files-box.tsx";
import { Timeline } from "../../ui/timeline.tsx";
import { customForm, emptyContact, emptyDeal } from "../../ui/values.ts";
import { CompanyControls } from "./controls.tsx";

// One company: how to reach it, its people, its deals, its files, its own
// details, and everything that happened with it (on its deals and with its
// people too).
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const c = await readCompany(sql, member, id).catch(e => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const [items, people, deals, choices, files] = await Promise.all([
    timeline(sql, { companyId: c.id }),
    listContacts(sql, member, { company: c.id }, { limit: 200 }),
    listDeals(sql, member, { company: c.id, status: "" }, 200),
    formChoices(sql, member, t),
    listFiles(sql, member, { company: c.id }),
  ]);
  const names = await directory([c.owner, ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : [])), ...files.map(f => f.addedBy)], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const place = [c.address.replace(/\n/gu, ", "), [c.postcode, c.city].filter(Boolean).join(" "), c.country ? countryName(c.country, locale) : ""].filter(Boolean).join(", ");
  const details = [
    ...(c.siren ? [{ label: t.company.siren, value: c.siren }] : []),
    ...(c.vat ? [{ label: t.company.vat, value: c.vat }] : []),
    ...shownFields(choices.fields, "companies", c.custom, locale),
  ];
  const self = { id: c.id, name: c.name };
  return (
    <div className="page record">
      <AutoRefresh seconds={45} />
      <nav className="crumbs"><Link prefetch={false} href="/chest/companies"><Back />{t.shell.companies}</Link></nav>
      <div className="record-head">
        {c.industry && <p className="label-mono">{c.industry}</p>}
        <h1>{c.name}</h1>
        <p className="record-links">
          {c.website && <a href={websiteHref(c.website)} target="_blank" rel="noopener noreferrer nofollow"><Globe />{c.website.replace(/^https?:\/\//u, "")}</a>}
          {c.phone && <a href={phoneHref(c.phone)}><Phone /><span className="num">{c.phone}</span></a>}
          {c.email && <a href={`mailto:${c.email}`}><Mail />{c.email}</a>}
          {place && <span><Pin />{place}</span>}
        </p>
        {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <Link prefetch={false} key={tag} className="tag" href={`/chest/companies?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</p>}
      </div>
      <CompanyControls
        company={{ id: c.id, name: c.name, website: c.website, phone: c.phone, email: c.email, address: c.address, postcode: c.postcode, city: c.city, country: c.country, siren: c.siren, vat: c.vat, industry: c.industry, notes: c.notes, tags: c.tags.join(", "), owner: c.owner, custom: customForm(c.custom) }}
        ownerName={names[c.owner ?? ""]?.name ?? t.common.unassigned}
        canEdit={can(member, "records.write")}
        canDelete={canDeleteRecord(member, c)}
        fields={choices.fields.companies}
        team={choices.team}
        me={member.id}
        canAssign={choices.canAssign}
        today={today()}
        locale={locale}
        t={t}
      />
      <div className="record-grid">
        <div className="record-main">
          {can(member, "activities.log") ? <Composer on={{ company: c.id }} t={t} /> : <p className="muted">{t.log.readOnly}</p>}
          <h2 className="label-mono section-gap">{t.timeline.title}</h2>
          <Timeline items={withWhen(items, locale)} people={names} stageNames={choices.stageNames} me={member.id} canRemoveAny={can(member, "deals.all")} canLog={can(member, "activities.log")} context="company" locale={locale} t={t} />
        </div>
        <aside className="record-side">
          <section className="panel" aria-labelledby="people-title">
            <div className="panel-head">
              <h2 id="people-title" className="label-mono">{t.company.people} <span className="count num">{people.total}</span></h2>
              {can(member, "records.write") && <NewContactButton className="link-button" label={t.company.addPerson} initial={emptyContact(member.id, self)} fields={choices.fields.contacts} stay team={choices.team} me={member.id} canAssign={choices.canAssign} canCreate={choices.canCreateCompany} today={today()} t={t} />}
            </div>
            {people.rows.length === 0 ? <p className="muted">{t.company.noPeople}</p> : (
              <ul className="mini-list">
                {people.rows.map(p => (
                  <li key={p.id}>
                    <Link prefetch={false} href={`/chest/contacts/${p.id}`}>{p.name}</Link>
                    <span className="muted">{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-labelledby="deals-title">
            <div className="panel-head">
              <h2 id="deals-title" className="label-mono">{t.company.deals} <span className="count num">{deals.total}</span></h2>
              {can(member, "deals.create") && <NewDealButton className="link-button" label={t.company.addDeal} initial={emptyDeal(member.id, choices.openStages[0]?.id ?? "", self)} {...dealFormProps(choices, member.id, t)} />}
            </div>
            {deals.rows.length === 0 ? <p className="muted">{t.company.noDeals}</p> : (
              <ul className="mini-list">
                {deals.rows.map(d => (
                  <li key={d.id}>
                    <Link prefetch={false} href={`/chest/deals/${d.id}`}>{d.title}</Link>
                    <span className="mini-meta">
                      <StageBadge kind={kinds.get(d.stageId) ?? "open"} name={choices.stageNames[d.stageId] ?? ""} />
                      <span className="num">{money(d.value, locale)}</span>
                      {d.expectedClose && <span className="num muted">{formatDay(d.expectedClose, locale)}</span>}
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
          <FilesBox on={{ company: c.id }} files={shownFiles(files, names, member, locale, t)} canAdd={can(member, "activities.log")} t={t} />
          {c.notes && (
            <section className="panel">
              <h2 className="label-mono">{t.common.notes}</h2>
              <p className="pre">{c.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
