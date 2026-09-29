import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "../../../../components/auto-refresh.tsx";
import { Back, Building, Card, Globe, Mail, Phone } from "../../../../components/icons.tsx";
import { can, canDeleteRecord } from "../../../../lib/access.ts";
import { timeline } from "../../../../lib/activities.ts";
import { listFiles } from "../../../../lib/attachments.ts";
import { contact as readContact } from "../../../../lib/contacts.ts";
import { db } from "../../../../lib/db.ts";
import { listDeals } from "../../../../lib/deals.ts";
import { AppError } from "../../../../lib/errors.ts";
import { format, money, relative } from "../../../../lib/i18n/index.ts";
import { phoneHref, today, websiteHref } from "../../../../lib/model.ts";
import { dealFormProps, dueLabel, formChoices, shownFields, shownFiles, withWhen } from "../../../../lib/page-data.ts";
import { directory } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { openSteps } from "../../../../lib/steps.ts";
import { Composer } from "../../ui/composer.tsx";
import { NewDealButton } from "../../ui/deal-form.tsx";
import { FilesBox } from "../../ui/files-box.tsx";
import { StepBox } from "../../ui/step-box.tsx";
import { Timeline } from "../../ui/timeline.tsx";
import { customForm, emptyDeal } from "../../ui/values.ts";
import { ContactControls, PrivacyPanel } from "./controls.tsx";

const threeYears = 3 * 365.25 * 864e5;

// One person: call or write in one tap, their next steps, what happened,
// their deals, their files — and their personal data (export, delete for
// good).
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const c = await readContact(sql, member, id).catch(e => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const [items, deals, choices, steps, files] = await Promise.all([
    timeline(sql, { contactId: c.id }),
    listDeals(sql, member, { contact: c.id, status: "" }, 200),
    formChoices(sql, member, t),
    openSteps(sql, { contactId: c.id }),
    listFiles(sql, member, { contact: c.id }),
  ]);
  const names = await directory([c.owner, ...steps.map(s => s.owner), ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : [])), ...files.map(f => f.addedBy)], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const now = new Date();
  const day = today();
  const stale = Date.now() - Date.parse(c.lastContact ?? c.createdAt) > threeYears;
  const details = shownFields(choices.fields, "contacts", c.custom, locale);
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
          {c.url && <a href={websiteHref(c.url)} target="_blank" rel="noopener noreferrer nofollow"><Globe />{c.url.replace(/^https?:\/\/(www\.)?/u, "")}</a>}
        </p>
        <div className="reach">
          {c.phone && <a className="button" href={phoneHref(c.phone)}><Phone />{t.common.call}<span className="num reach-detail">{c.phone}</span></a>}
          {c.phone2 && <a className={c.phone ? "button quiet" : "button"} href={phoneHref(c.phone2)}><Phone />{c.phone ? t.contact.callOther : t.common.call}<span className="num reach-detail">{c.phone2}</span></a>}
          {c.email && <a className="button quiet" href={`mailto:${c.email}`}><Mail />{t.common.write}<span className="reach-detail">{c.email}</span></a>}
          <a className="button quiet" href={`/chest/contacts/${c.id}/vcard`} download><Card />{t.contact.vcard}</a>
        </div>
        {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <Link prefetch={false} key={tag} className="tag" href={`/chest/contacts?tag=${encodeURIComponent(tag)}`}>{tag}</Link>)}</p>}
      </div>
      {stale && <p className="notice warn">{t.contact.staleWarning}</p>}
      <ContactControls
        contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone, phone2: c.phone2, url: c.url, title: c.title, company: c.company, notes: c.notes, tags: c.tags.join(", "), owner: c.owner, custom: customForm(c.custom) }}
        ownerName={names[c.owner ?? ""]?.name ?? t.common.unassigned}
        canEdit={can(member, "records.write")}
        canMerge={canDeleteRecord(member, c)}
        fields={choices.fields.contacts}
        team={choices.team}
        me={member.id}
        canAssign={choices.canAssign}
        t={t}
      />
      <div className="record-grid">
        <div className="record-main">
          <StepBox steps={steps.map(s => ({ ...s, label: dueLabel(s, day, locale, t) }))} on={{ contact: c.id }} team={choices.team} people={names} me={member.id} canEdit={can(member, "records.write")} canAssign={choices.canAssign} today={day} t={t} />
          {can(member, "activities.log") ? <Composer on={{ contact: c.id }} t={t} /> : <p className="muted">{t.log.readOnly}</p>}
          <h2 className="label-mono section-gap">{t.timeline.title}</h2>
          <Timeline items={withWhen(items, locale)} people={names} stageNames={choices.stageNames} me={member.id} canRemoveAny={can(member, "deals.all")} canLog={can(member, "activities.log")} context="contact" locale={locale} t={t} />
        </div>
        <aside className="record-side">
          <section className="panel" aria-labelledby="deals-title">
            <div className="panel-head">
              <h2 id="deals-title" className="label-mono">{t.contact.deals} <span className="count num">{deals.total}</span></h2>
              {can(member, "deals.create") && <NewDealButton className="link-button" label={t.company.addDeal} initial={emptyDeal(member.id, choices.openStages[0]?.id ?? "", c.company, { id: c.id, name: c.name })} {...dealFormProps(choices, member.id, t)} />}
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
          {details.length > 0 && (
            <section className="panel" aria-labelledby="details-title">
              <h2 id="details-title" className="label-mono">{t.common.details}</h2>
              <dl className="facts">{details.map(d => <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>)}</dl>
            </section>
          )}
          <FilesBox on={{ contact: c.id }} files={shownFiles(files, names, member, locale, t)} canAdd={can(member, "activities.log")} t={t} />
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
