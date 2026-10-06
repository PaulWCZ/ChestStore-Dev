import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Back, Building, Card, Globe, Mail, Phone } from "../components/icons.tsx";
import { StageBadge } from "../components/stage-badge.tsx";
import { customForm, emptyContact, emptyDeal } from "../components/values.ts";
import type { ContactRow } from "../islands/lists.tsx";
import { format, money, plural, relative, localeOf } from "../i18n/index.ts";
import { can, canDeleteRecord } from "../lib/access.ts";
import { timeline } from "../lib/activities.ts";
import { listFiles } from "../lib/attachments.ts";
import { tagsInUse } from "../lib/companies.ts";
import { contact as readContact, listContacts } from "../lib/contacts.ts";
import { db } from "../lib/db.ts";
import { listDeals } from "../lib/deals.ts";
import { fieldFilterOf, listFields } from "../lib/fields.ts";
import { maybeSame } from "../lib/leads.ts";
import { dealFormProps, dueLabel, formChoices, shownFields, shownFiles, withWhen } from "../lib/page-data.ts";
import { directory } from "../lib/people.ts";
import { shownName } from "../lib/seed-words.ts";
import { calendarWorks } from "../lib/step-calendar.ts";
import { openSteps } from "../lib/steps.ts";
import { team as teamOf } from "../lib/team.ts";
import { today } from "../lib/zone.ts";
import { dueState, phoneHref, websiteHref } from "../shared/model.ts";
import { Pager } from "./parts.tsx";
import { words } from "./words.ts";

const threeYears = 3 * 365.25 * 864e5;

// Every person, 100 a page, by name (or last contact, or newest): where
// they work, their next step, when they were last in touch. Ticked, many
// change at once.
export async function contactsPage({ member, locale: lang, t, query }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const get = (key: string) => query(key) ?? "";
  const field = fieldFilterOf(get);
  const filter = { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...(field ? { field } : {}) };
  const sql = db();
  const [{ rows, total, page, pageSize }, tags, people, fields] = await Promise.all([
    listContacts(sql, member, filter, { page: get("page"), sort: get("sort") }),
    tagsInUse(sql, "contacts"),
    teamOf(),
    listFields(sql, "contacts", t),
  ]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const now = today();
  const kept: Record<string, string> = Object.fromEntries(["q", "owner", "tag", "stale", "sort", "cf", "cv", "cmin", "cmax"].map(k => [k, get(k)] as [string, string]).filter(([, x]) => x !== ""));
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "" || filter.stale || field !== undefined;
  const exportQuery = new URLSearchParams(Object.entries(kept).filter(([k]) => k !== "sort")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  const writes = can(member, "records.write");
  const list: ContactRow[] = rows.map(c => ({
    id: c.id,
    name: c.name,
    sub: [c.title, c.company?.name].filter(Boolean).join(" · "),
    email: c.email,
    step: c.step ? { text: `${c.step.text} · ${dueLabel(c.step, now, locale, t)}${c.steps > 1 ? ` · +${c.steps - 1}` : ""}`, state: dueState(c.step.due, now) } : null,
    when: c.lastContact ? relative(c.lastContact, locale) : t.contacts.never,
    owner: c.owner,
  }));
  return {
    title: t.contacts.title,
    body: (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t.contacts.title}</h1>
            <p className="lede num">{plural(t.contacts.count, total, locale)}</p>
          </div>
          {writes && <Island name="NewContactButton" props={{ label: t.contacts.new, initial: emptyContact(member.id), fields, team, me: member.id, canAssign: can(member, "assign"), canCreate: writes, today: now, t: words.contact(t) }} />}
        </div>
        {/* An empty book has nothing to filter, sort or export. */}
        {(total > 0 || filtered) && (
          <Island name="ListFilters" props={{
            address: { path: "/chest/contacts", query: kept }, label: t.contacts.filter, tags: tags.map(tag => ({ value: tag, label: shownName("tags", tag, t) })), team, me: member.id, stale: true, fields, today: now,
            sorts: [{ value: "name", label: t.contacts.sorts.name }, { value: "last", label: t.contacts.sorts.last }, { value: "created", label: t.contacts.sorts.created }],
            exports: total > 0 ? [
              { href: `/chest/export/contacts${exportQuery ? "?" + exportQuery : ""}`, label: t.common.exportCsv, kind: "csv" as const },
              { href: `/chest/export/vcf${exportQuery ? "?" + exportQuery : ""}`, label: t.contacts.exportVcf, kind: "vcf" as const },
            ] : [],
            t: words.listFilters(t),
          }} />
        )}
        {filter.stale && <p className="notice">{t.contacts.staleHint}</p>}
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t.contacts.emptyFiltered : t.contacts.empty}
            body={filtered ? undefined : t.contacts.emptyBody}
            action={!filtered && can(member, "import") ? <a className="button quiet" href="/chest/import">{t.shell.import}</a> : undefined}
          />
        ) : (
          <Island name="ContactList" id="contact-list" props={{ rows: list, total, filter: { ...kept, stale: filter.stale }, owners, writes, team, me: member.id, canAssign: can(member, "assign"), locale, t: words.contactList(t) }} />
        )}
        <Pager path="/chest/contacts" params={kept} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
      </div>
    ),
  };
}

// One person: call or write in one tap, their next steps, what happened,
// their deals, their files — and their personal data (export, delete for
// good).
export async function contactPage({ member, locale: lang, t, param }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const sql = db();
  const c = await readContact(sql, member, param("id"));
  const [items, deals, choices, steps, files, maybe, inCalendar] = await Promise.all([
    timeline(sql, { contactId: c.id }),
    listDeals(sql, member, { contact: c.id, status: "" }, 200),
    formChoices(sql, member, t),
    openSteps(sql, { contactId: c.id }),
    listFiles(sql, member, { contact: c.id }),
    maybeSame(sql, c.id),
    calendarWorks(sql),
  ]);
  const names = await directory([c.owner, ...steps.map(s => s.owner), ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : [])), ...items.flatMap(a => (a.kind === "booking" && typeof a.data["host"] === "string" ? [a.data["host"]] : [])), ...files.map(f => f.addedBy)], locale);
  const kinds = new Map(choices.stages.map(s => [s.id, s.kind]));
  const day = today();
  const stale = Date.now() - Date.parse(c.lastContact ?? c.createdAt) > threeYears;
  const details = shownFields(choices.fields, "contacts", c.custom, locale);
  const key = `contact-${c.id}`;
  const logs = can(member, "activities.log");
  return {
    title: c.name,
    body: (
      <div className="page record">
        <Island name="AutoRefresh" props={{ seconds: 45 }} />
        <nav className="crumbs"><a href="/chest/contacts"><Back />{t.shell.contacts}</a></nav>
        <div className="record-head">
          <p className="label-mono">{c.lastContact ? format(t.contact.lastContact, { when: relative(c.lastContact, locale) }) : t.contact.neverContacted}</p>
          <h1>{c.name}</h1>
          <p className="record-links">
            {c.title && <span>{c.title}</span>}
            {c.company && <a href={`/chest/companies/${c.company.id}`}><Building />{c.company.name}</a>}
            {c.url && <a href={websiteHref(c.url)} target="_blank" rel="noopener noreferrer nofollow"><Globe />{c.url.replace(/^https?:\/\/(www\.)?/u, "")}</a>}
          </p>
          <div className="reach">
            {c.phone && <a className="button" href={phoneHref(c.phone)}><Phone />{t.common.call}<span className="num reach-detail">{c.phone}</span></a>}
            {c.phone2 && <a className={c.phone ? "button quiet" : "button"} href={phoneHref(c.phone2)}><Phone />{c.phone ? t.contact.callOther : t.common.call}<span className="num reach-detail">{c.phone2}</span></a>}
            {c.email && <a className="button quiet" href={`mailto:${c.email}`}><Mail />{t.common.write}<span className="reach-detail">{c.email}</span></a>}
            <a className="button quiet" href={`/chest/contacts/${c.id}/vcard`} download><Card />{t.contact.vcard}</a>
          </div>
          {c.tags.length > 0 && <p className="tags">{c.tags.map(tag => <a key={tag} className="tag" href={`/chest/contacts?tag=${encodeURIComponent(tag)}`}>{shownName("tags", tag, t)}</a>)}</p>}
        </div>
        {stale && <p className="notice warn">{t.contact.staleWarning}</p>}
        {maybe && <Island name="MaybeSame" id={`maybe-${key}`} props={{ id: c.id, name: c.name, other: { id: maybe.id, name: maybe.name }, canMerge: canDeleteRecord(member, c), canEdit: can(member, "records.write"), t: words.maybeSame(t) }} />}
        <Island name="ContactControls" id={`controls-${key}`} props={{
          contact: { id: c.id, name: c.name, email: c.email, phone: c.phone, phone2: c.phone2, url: c.url, title: c.title, company: c.company, notes: c.notes, tags: c.tags.map(tag => shownName("tags", tag, t)).join(", "), owner: c.owner, custom: customForm(c.custom) },
          ownerName: names[c.owner ?? ""]?.name ?? t.common.unassigned,
          canEdit: can(member, "records.write"),
          canMerge: canDeleteRecord(member, c),
          form: { fields: choices.fields.contacts, team: choices.team, me: member.id, canAssign: choices.canAssign, canCreate: can(member, "records.write"), today: day, t: words.contact(t) },
          t: words.contact(t),
        }} />
        <div className="record-grid">
          <div className="record-main">
            {logs && (c.phone || c.phone2) && <Island name="CallPrompt" id={`call-${key}`} props={{ on: { contact: c.id }, name: c.name, t: words.log(t) }} />}
            <Island name="StepBox" id={`steps-${key}`} props={{ steps: steps.map(s => ({ ...s, label: dueLabel(s, day, locale, t) })), on: { contact: c.id }, team: choices.team, people: names, me: member.id, canEdit: can(member, "records.write"), canAssign: choices.canAssign, today: day, calendar: inCalendar === true, t: words.step(t) }} />
            {logs ? <Island name="Composer" id={`log-${key}`} props={{ on: { contact: c.id }, t: words.log(t) }} /> : <p className="muted">{t.log.readOnly}</p>}
            <h2 className="label-mono section-gap">{t.timeline.title}</h2>
            <Island name="Timeline" id={`timeline-${key}`} props={{ items: withWhen(items, locale, new Date(), member.timeZone), people: names, stageNames: choices.stageNames, me: member.id, canRemoveAny: can(member, "deals.all"), canLog: logs, context: "contact", locale, t: words.timeline(t) }} />
          </div>
          <aside className="record-side">
            <section className="panel" aria-labelledby="deals-title">
              <div className="panel-head">
                <h2 id="deals-title" className="label-mono">{t.contact.deals} <span className="count num">{deals.total}</span></h2>
                {can(member, "deals.create") && <Island name="NewDealButton" props={{ className: "link-button", label: t.company.addDeal, initial: emptyDeal(member.id, choices.openStages[0]?.id ?? "", c.company, { id: c.id, name: c.name }), ...dealFormProps(choices, member.id), t: words.deal(t) }} />}
              </div>
              {deals.rows.length === 0 ? <p className="muted">{t.contact.noDeals}</p> : (
                <ul className="mini-list">
                  {deals.rows.map(d => (
                    <li key={d.id}>
                      <a href={`/chest/deals/${d.id}`}>{d.title}</a>
                      <span className="mini-meta"><StageBadge kind={kinds.get(d.stageId) ?? "open"} name={choices.stageNames[d.stageId] ?? ""} /><span className="num">{money(d.value, locale, { currency: d.currency })}</span></span>
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
            <Island name="FilesBox" id={`files-${key}`} props={{ on: { contact: c.id }, files: shownFiles(files, names, member, locale, t), canAdd: logs, t: words.files(t) }} />
            {c.notes && (
              <section className="panel">
                <h2 className="label-mono">{t.common.notes}</h2>
                <p className="pre">{c.notes}</p>
              </section>
            )}
            <Island name="PrivacyPanel" id={`privacy-${key}`} props={{ id: c.id, name: c.name, canDelete: canDeleteRecord(member, c), t: words.privacy(t) }} />
          </aside>
        </div>
      </div>
    ),
  };
}
