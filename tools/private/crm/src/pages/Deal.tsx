import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Back, Building, Person } from "../components/icons.tsx";
import { StageBadge } from "../components/stage-badge.tsx";
import { customForm } from "../components/values.ts";
import { format, formatDate, formatDay, money, localeOf } from "../i18n/index.ts";
import { can, canEditDeal } from "../lib/access.ts";
import { timeline } from "../lib/activities.ts";
import { listFiles } from "../lib/attachments.ts";
import { db } from "../lib/db.ts";
import { deal as readDeal } from "../lib/deals.ts";
import { dealFormProps, dueLabel, formChoices, shownFields, shownFiles, withWhen } from "../lib/page-data.ts";
import { directory } from "../lib/people.ts";
import { calendarWorks } from "../lib/step-calendar.ts";
import { openSteps } from "../lib/steps.ts";
import { today } from "../lib/zone.ts";
import { amountInput } from "../shared/amount.ts";
import { words } from "./words.ts";

// One deal: where it stands (its stage, one click to the next), what comes
// next, and everything that happened. Its owner or a manager changes it.
// Its islands carry its id in theirs: another deal opened in place starts
// them afresh.
export async function dealPage({ member, locale: lang, t, param }: PageContext): Promise<View> {
  const locale = localeOf(lang);
  const sql = db();
  const d = await readDeal(sql, member, param("id"));
  const [items, choices, steps, files, inCalendar] = await Promise.all([timeline(sql, { dealId: d.id }), formChoices(sql, member, t), openSteps(sql, { dealId: d.id }), listFiles(sql, member, { deal: d.id }), calendarWorks(sql)]);
  const people = await directory([d.owner, ...steps.map(s => s.owner), ...items.map(a => a.author), ...items.flatMap(a => (a.data["to"] ? [String(a.data["to"])] : [])), ...files.map(f => f.addedBy)], locale);
  const editable = canEditDeal(member, d);
  const stage = choices.stages.find(s => s.id === d.stageId)!;
  const now = today();
  const ownerName = people[d.owner ?? ""]?.name ?? t.common.unassigned;
  const key = `deal-${d.id}`;
  return {
    title: d.title,
    body: (
      <div className="page record">
        <Island name="AutoRefresh" props={{ seconds: 45 }} />
        <nav className="crumbs"><a href="/chest/deals"><Back />{t.shell.deals}</a></nav>
        <div className="record-head">
          <p className="label-mono">{choices.stageNames[stage.id]} · {format(t.deal.probability, { percent: stage.probability })}</p>
          <h1>{d.title}</h1>
          <p className="record-links">
            {d.company && <a href={`/chest/companies/${d.company.id}`}><Building />{d.company.name}</a>}
            {d.contact && <a href={`/chest/contacts/${d.contact.id}`}><Person />{d.contact.name}</a>}
          </p>
          <p className="value-big num">{money(d.value, locale, { cents: d.value % 100 !== 0, currency: d.currency })}</p>
          {stage.kind !== "open" && d.closedAt && (
            <p className={`closed-note ${stage.kind}`}>
              {format(stage.kind === "won" ? t.deal.wonOn : t.deal.lostOn, { date: formatDate(d.closedAt, locale, { timeZone: member.timeZone }) })}{d.reason ? ` — ${d.reason}` : ""}
            </p>
          )}
        </div>
        <Island name="DealControls" id={`controls-${key}`} props={{
          deal: { id: d.id, title: d.title, stageId: d.stageId, stage: d.stageId, owner: d.owner, company: d.company, contact: d.contact, value: amountInput(d.value), expectedClose: d.expectedClose ?? "", custom: customForm(d.custom) },
          stages: choices.stages.map(s => ({ id: s.id, name: choices.stageNames[s.id]!, kind: s.kind, probability: s.probability })),
          editable,
          canCreate: can(member, "deals.create"),
          form: { ...dealFormProps(choices, member.id), t: words.deal(t) },
          team: choices.team,
          me: member.id,
          canAssign: choices.canAssign,
          t: words.dealControls(t),
        }} />
        {!editable && <p className="notice">{can(member, "deals.create") ? format(t.deal.readOnly, { name: ownerName }) : t.deal.readOnlyViewer}</p>}
        <div className="record-grid">
          <div className="record-main">
            <Island name="StepBox" id={`steps-${key}`} props={{ steps: steps.map(s => ({ ...s, label: dueLabel(s, now, locale, t) })), on: { deal: d.id }, team: choices.team, people, me: member.id, canEdit: editable, canAssign: choices.canAssign, today: now, calendar: inCalendar === true, t: words.step(t) }} />
            {can(member, "activities.log") ? <Island name="Composer" id={`log-${key}`} props={{ on: { deal: d.id }, t: words.log(t) }} /> : <p className="muted">{t.log.readOnly}</p>}
            <h2 className="label-mono section-gap">{t.timeline.title}</h2>
            <Island name="Timeline" id={`timeline-${key}`} props={{ items: withWhen(items, locale, new Date(), member.timeZone), people, stageNames: choices.stageNames, me: member.id, canRemoveAny: can(member, "deals.all"), canLog: can(member, "activities.log"), context: "deal", locale, t: words.timeline(t) }} />
          </div>
          <aside className="record-side">
            <dl className="facts">
              <div><dt>{t.deal.value}</dt><dd className="num">{money(d.value, locale, { cents: true, currency: d.currency })}</dd></div>
              <div><dt>{t.deal.stage}</dt><dd><StageBadge kind={stage.kind} name={choices.stageNames[stage.id] ?? ""} /></dd></div>
              <div><dt>{t.deal.close}</dt><dd className="num">{d.expectedClose ? formatDay(d.expectedClose, locale, { day: "numeric", month: "long", year: "numeric" }) : <span className="muted">{t.deal.noClose}</span>}</dd></div>
              <div><dt>{t.deal.owner}</dt><dd>{ownerName}</dd></div>
              <div><dt>{t.deal.company}</dt><dd>{d.company ? <a href={`/chest/companies/${d.company.id}`}>{d.company.name}</a> : <span className="muted">{t.deal.noCompany}</span>}</dd></div>
              <div><dt>{t.deal.contact}</dt><dd>{d.contact ? <a href={`/chest/contacts/${d.contact.id}`}>{d.contact.name}</a> : <span className="muted">{t.deal.noContact}</span>}</dd></div>
              {shownFields(choices.fields, "deals", d.custom, locale).map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
            </dl>
            <Island name="FilesBox" id={`files-${key}`} props={{ on: { deal: d.id }, files: shownFiles(files, people, member, locale, t), canAdd: can(member, "activities.log"), t: words.files(t) }} />
          </aside>
        </div>
      </div>
    ),
  };
}
