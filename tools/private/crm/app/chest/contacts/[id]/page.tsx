import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Building, Card, Mail, Phone } from "../../../../components/icons.tsx";
import { can, canDeleteRecord } from "../../../../lib/access.ts";
import { timeline } from "../../../../lib/activities.ts";
import { contact as readContact } from "../../../../lib/contacts.ts";
import { db } from "../../../../lib/db.ts";
import { listDeals } from "../../../../lib/deals.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, formatDay, money, relative } from "../../../../lib/i18n/index.ts";
import { phoneHref, today } from "../../../../lib/model.ts";
import { formChoices, withWhen } from "../../../../lib/page-data.ts";
import { directory } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { Composer } from "../../ui/composer.tsx";
import { NewDealButton } from "../../ui/deal-form.tsx";
import { StepBox } from "../../ui/step-box.tsx";
import { Timeline } from "../../ui/timeline.tsx";
import { ContactControls, PrivacyPanel } from "./controls.tsx";

const threeYears = 3 * 365.25 * 864e5;

// One person: call or write in one tap, their next step, what happened,
// their deals — and their personal data (export, delete for good).
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const c = await readContact(sql, member, id).catch(e => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const [items, deals, choices] = await Promise.all([timeline(sql, { contactId: c.id }), listDeals(sql, member, { contact: c.id, status: "" }, 200), formChoices(sql, member, t)]);
  const names = await directory([c.owner, c.step?.owner, ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : []))], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const now = new Date();
  const stale = Date.now() - Date.parse(c.lastContact ?? c.createdAt) > threeYears;
  const dealProps = { companies: choices.companies, contacts: choices.contacts, stages: choices.stageChoices.filter(s => kinds.get(s.id) === "open"), team: choices.team, me: member.id, canAssign: choices.canAssign, t };
  return (
    <main className="page record">
      <AutoRefresh seconds={45} />
      <nav className="crumbs"><Link prefetch={false} href="/chest/contacts"><Back />{t.shell.contacts}</Link></nav>
      <div className="record-head">
        <p className="label-mono">{c.lastContact ? format(t.contact.lastContact, { when: relative(c.lastContact, locale, now) }) : t.contact.neverContacted}</p>
        <h1>{c.name}</h1>
        <p className="record-links">
          {c.title && <span>{c.title}</span>}
          {c.company && <Link prefetch={false} href={`/chest/companies/${c.company.id}`}><Building />{c.company.name}</Link>}
        </p>
        <div className="reach">
          {c.phone && <a className="button" href={phoneHref(c.phone)}><Phone />{t.common.call}<span className="num reach-detail">{c.phone}</span></a>}
          {c.email && <a className="button quiet" href={`mailto:${c.email}`}><Mail />{t.common.write}<span className="reach-detail">{c.email}</span></a>}
          <a className="button quiet" href={`/chest/contacts/${c.id}/vcard`} download><Card />{t.contact.vcard}</a>
        </div>
        {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <Link prefetch={false} key={tag} className="tag" href={`/chest/contacts?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</p>}
      </div>
      {stale && <p className="notice warn">{t.contact.staleWarning}</p>}
      <ContactControls
        contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone, title: c.title, company: c.company?.id ?? null, notes: c.notes, tags: c.tags.join(", "), owner: c.owner }}
        ownerName={names[c.owner ?? ""]?.name ?? t.common.unassigned}
        canEdit={can(member, "records.write")}
        companies={choices.companies}
        team={choices.team}
        me={member.id}
        canAssign={choices.canAssign}
        t={t}
      />
      <div className="record-grid">
        <div className="record-main">
          <StepBox step={c.step} dueLabel={c.step ? formatDay(c.step.due, locale, { weekday: "short", day: "numeric", month: "short" }) : null} on={{ contact: c.id }} team={choices.team} people={names} me={member.id} canEdit={can(member, "records.write")} canAssign={choices.canAssign} today={today()} locale={locale} t={t} />
          {can(member, "activities.log") ? <Composer on={{ contact: c.id }} t={t} /> : <p className="muted">{t.log.readOnly}</p>}
          <h2 className="label-mono section-gap">{t.timeline.title}</h2>
          <Timeline items={withWhen(items, locale)} people={names} stageNames={choices.stageNames} me={member.id} canRemoveAny={can(member, "deals.all")} canLog={can(member, "activities.log")} context="contact" locale={locale} t={t} />
        </div>
        <aside className="record-side">
          <section className="panel" aria-labelledby="deals-title">
            <div className="panel-head">
              <h2 id="deals-title" className="label-mono">{t.contact.deals} <span className="count num">{deals.total}</span></h2>
              {can(member, "deals.create") && <NewDealButton className="link-button" label={t.company.addDeal} initial={{ title: "", company: c.company?.id ?? null, contact: c.id, value: "", stage: dealProps.stages[0]?.id ?? "", expectedClose: "", owner: member.id }} {...dealProps} />}
            </div>
            {deals.rows.length === 0 ? <p className="muted">{t.contact.noDeals}</p> : (
              <ul className="mini-list">
                {deals.rows.map(d => (
                  <li key={d.id}>
                    <Link prefetch={false} href={`/chest/deals/${d.id}`}>{d.title}</Link>
                    <span className="mini-meta"><span className={`stage-chip ${kinds.get(d.stageId)}`}>{choices.stageNames[d.stageId]}</span><span className="num">{money(d.value, locale)}</span></span>
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
          <PrivacyPanel id={c.id} name={c.name} canDelete={canDeleteRecord(member, c)} t={t} />
        </aside>
      </div>
    </main>
  );
}
