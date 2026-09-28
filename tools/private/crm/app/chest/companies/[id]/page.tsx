import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Globe, Phone, Pin } from "../../../../components/icons.tsx";
import { can, canDeleteRecord } from "../../../../lib/access.ts";
import { timeline } from "../../../../lib/activities.ts";
import { company as readCompany } from "../../../../lib/companies.ts";
import { listContacts } from "../../../../lib/contacts.ts";
import { db } from "../../../../lib/db.ts";
import { listDeals } from "../../../../lib/deals.ts";
import { AppError } from "../../../../lib/errors.ts";
import { formatDay, money } from "../../../../lib/i18n/index.ts";
import { phoneHref, websiteHref } from "../../../../lib/model.ts";
import { formChoices, withWhen } from "../../../../lib/page-data.ts";
import { directory } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { Composer } from "../../ui/composer.tsx";
import { NewContactButton } from "../../ui/contact-form.tsx";
import { emptyContact } from "../../ui/values.ts";
import { NewDealButton } from "../../ui/deal-form.tsx";
import { Timeline } from "../../ui/timeline.tsx";
import { CompanyControls } from "./controls.tsx";

// One company: how to reach it, its people, its deals, and everything that
// happened with it (on its deals and with its people too).
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const c = await readCompany(sql, member, id).catch(e => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const [items, people, deals, choices] = await Promise.all([
    timeline(sql, { companyId: c.id }),
    listContacts(sql, member, { company: c.id }, 200),
    listDeals(sql, member, { company: c.id, status: "" }, 200),
    formChoices(sql, member, t),
  ]);
  const names = await directory([c.owner, ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : []))], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const dealProps = { companies: choices.companies, contacts: choices.contacts, stages: choices.stageChoices.filter(s => kinds.get(s.id) === "open"), team: choices.team, me: member.id, canAssign: choices.canAssign, t };
  return (
    <main className="page record">
      <AutoRefresh seconds={45} />
      <nav className="crumbs"><Link prefetch={false} href="/chest/companies"><Back />{t.shell.companies}</Link></nav>
      <div className="record-head">
        {c.industry && <p className="label-mono">{c.industry}</p>}
        <h1>{c.name}</h1>
        <p className="record-links">
          {c.website && <a href={websiteHref(c.website)} target="_blank" rel="noopener noreferrer nofollow"><Globe />{c.website.replace(/^https?:\/\//u, "")}</a>}
          {c.phone && <a href={phoneHref(c.phone)}><Phone /><span className="num">{c.phone}</span></a>}
          {c.address && <span><Pin />{c.address.replace(/\n/gu, ", ")}</span>}
        </p>
        {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <Link prefetch={false} key={tag} className="tag" href={`/chest/companies?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</p>}
      </div>
      <CompanyControls
        company={{ id: c.id, name: c.name, website: c.website, phone: c.phone, address: c.address, industry: c.industry, notes: c.notes, tags: c.tags.join(", "), owner: c.owner }}
        ownerName={names[c.owner ?? ""]?.name ?? t.common.unassigned}
        canEdit={can(member, "records.write")}
        canDelete={canDeleteRecord(member, c)}
        team={choices.team}
        me={member.id}
        canAssign={choices.canAssign}
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
              {can(member, "records.write") && <NewContactButton className="link-button" label={t.company.addPerson} initial={emptyContact(member.id, c.id)} companies={choices.companies} stay team={choices.team} me={member.id} canAssign={choices.canAssign} t={t} />}
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
              {can(member, "deals.create") && <NewDealButton className="link-button" label={t.company.addDeal} initial={{ title: "", company: c.id, contact: null, value: "", stage: dealProps.stages[0]?.id ?? "", expectedClose: "", owner: member.id }} {...dealProps} />}
            </div>
            {deals.rows.length === 0 ? <p className="muted">{t.company.noDeals}</p> : (
              <ul className="mini-list">
                {deals.rows.map(d => (
                  <li key={d.id}>
                    <Link prefetch={false} href={`/chest/deals/${d.id}`}>{d.title}</Link>
                    <span className="mini-meta">
                      <span className={`stage-chip ${kinds.get(d.stageId)}`}>{choices.stageNames[d.stageId]}</span>
                      <span className="num">{money(d.value, locale)}</span>
                      {d.expectedClose && <span className="num muted">{formatDay(d.expectedClose, locale)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {c.notes && (
            <section className="panel">
              <h2 className="label-mono">{t.common.notes}</h2>
              <p className="pre">{c.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
